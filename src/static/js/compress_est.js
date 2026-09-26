/**
 * CompressEst - 压缩估算/执行后台化
 *
 * 问题: 压缩弹窗滑块 input 同步调用 compressSongEstimate 会冻结 UI
 *      (presence 引擎大歌单档可达 20 秒)。
 * 方案: Web Worker 真后台线程执行估算与压缩本体;
 *      打开弹窗即后台预计算「全模型 × 全档位」估算并缓存,
 *      滑块/模型切换只读缓存, 未算出显示「正在计算…」;
 *      点击确定压缩时显示带进度条的弹窗。
 *
 * file:// 兼容: worker 用 Blob URL 创建; nbs_client.js 源码优先取
 *      构建产物内嵌的 window.NBS_CLIENT_SOURCE, 缺失时(HTTP 模式)
 *      从页面 <script> 定位其 URL 并 fetch。
 */
(function () {
    'use strict';
    var MODELS = ['heuristic', 'perceptual', 'presence'];
    var LEVELS = [0.99, 0.60, 0.40, 0.20, 0.05];
    var PROG_THROTTLE_MS = 120;

    var worker = null, workerPending = false, workerBuildErr = false;
    var cache = {};        // key -> {status:'ready', total, deleted, kept}
    var inflight = {};     // key -> true
    var queue = [];        // 待预计算 {key, q, model, cfg}
    var lastCfg = null;
    var compressWait = 0;  // >0 时暂停预计算投喂
    var notify = null;     // 估算完成回调 (main.js 用于刷新滑块文案)
    var cSeq = 0;

    function trackKey(lighten, exclude) {
        var a = (lighten || []).slice().sort().join(',');
        var b = (exclude || []).slice().sort().join(',');
        return a + '|' + b;
    }
    function keyOf(cfg, q, model) {
        return q + '|' + model + '|' + trackKey(cfg.lighten, cfg.exclude) +
            '|' + (cfg.ticksPerBeat || 30) + '|' + (cfg.reorder === false ? 0 : 1) +
            '|' + (cfg.pseudoSustain === true ? 1 : 0);
    }

    // ---------- Worker 构建 ----------
    function obtainSource() {
        if (window.NBS_CLIENT_SOURCE) return Promise.resolve(window.NBS_CLIENT_SOURCE);
        var scripts = document.scripts ? Array.prototype.slice.call(document.scripts) : [];
        var src = null;
        for (var i = 0; i < scripts.length; i++) {
            if (/nbs_client\.js/.test(scripts[i].src || '')) { src = scripts[i].src; break; }
        }
        if (!src) return Promise.reject(new Error('nbs_client source not found'));
        return fetch(src).then(function (r) { if (!r.ok) throw new Error('fetch nbs_client failed'); return r.text(); });
    }
    var RUNTIME = [
        'onmessage=function(e){',
        '  var m=e.data;',
        '  function pct(n){return Math.max(0,Math.min(100,n));}',
        '  try{',
        '    if(m.type==="estimate"){',
        '      var est=window.compressSongEstimate(m.src,m.q,{ticksPerBeat:m.tpb,reorder:m.reorder,lightenLayers:m.lighten,excludeLayers:m.exclude,model:m.model,pseudoSustain:m.pseudoSustain});',
        '      postMessage({type:"estimate_done",key:m.key,est:est});',
        '    }else if(m.type==="compress"){',
        '      var lastT=0;',
        '      var working=m.src.map(function(n){return{id:n.id,tick:n.tick,layer:n.layer,instrument:n.instrument,key:n.key,velocity:n.velocity,pan:(n.pan===undefined?50:n.pan),pitch:(n.pitch||0)};});',
        '      var res=window.compressSongCore(working,m.q,m.model,{ticksPerBeat:m.tpb,reorder:m.reorder,lightenLayers:m.lighten,excludeLayers:m.exclude,pseudoSustain:m.pseudoSustain,onProgress:function(p){var now=Date.now();if(now-lastT>=' + PROG_THROTTLE_MS + '){lastT=now;postMessage({type:"compress_progress",key:m.key,pct:pct(p)});}}});',
        '      postMessage({type:"compress_done",key:m.key,res:res});',
        '    }',
        '  }catch(err){',
        '    postMessage({type:"compress_error",key:m.key,msg:String((err&&err.stack)||err)});',
        '  }',
        '};'
    ].join('\n');

    function buildWorker() {
        if (worker) return Promise.resolve(worker);
        if (workerBuildErr) return Promise.resolve(null);   // 已确认永久不可用, 不再反复重试
        if (workerPending) return workerPending;
        workerPending = obtainSource().then(function (srcText) {
            // new Worker(Blob) 在 file:// 下抛 SecurityError; 异常发生在本 onFulfilled 回调内,
            // 链上 onRejected 捕获不到, 须 try/catch 包住, 否则 workerPending 永久 rejected。
            // Worker 不可用不影响功能: getEstimate/compress 均主线程同步兜底, Worker 仅后台预填缓存。
            try {
                var blob = new Blob(['var window=self,globalThis=self;\n' + srcText + '\n' + RUNTIME], { type: 'application/javascript' });
                var wk = new Worker(URL.createObjectURL(blob));
                wk.addEventListener('message', onWorkerMsg);
                worker = wk;
                pump();   // 构建完成即开始执行预计算队列
                return wk;
            } catch (err) {
                workerBuildErr = true;
                return null;   // 无法构建: 后台预填停摆, 但估算/压缩走主线程同步, 不影响用户
            }
        }, function (err) {
            workerBuildErr = true;
            return null;   // 源码获取失败: 同样仅放弃后台预填
        }).then(function (wk) {
            workerPending = null;
            if (!wk && !worker) {
                queue.length = 0;
                inflight = {};
                setTimeout(function () {
                    if (notify) { try { notify(); } catch (err) {} }
                }, 0);
            }
            return wk;
        });
        return workerPending;
    }
    function onWorkerMsg(e) {
        var d = e.data;
        if (!d || !d.key) return;
        if (d.type === 'estimate_done') {
            var parts = d.key.split('|');
            var q = +parts[0], model = parts[1];
            // 必须带 status:'ready': main.js 依赖它区分「已算出」与「正在计算…」
            cache[d.key] = { status: 'ready', total: d.est.total, deleted: d.est.deleted, kept: d.est.kept };
            inflight[d.key] = false;
            busyIdle();
            if (notify) { try { notify(); } catch (err) {} }
        }
    }
    // 估算任务一次只跑一个, 完成即提取下一个
    var busy = false;
    function busyIdle() {
        busy = false;
        pump();
    }
    function pump() {
        if (busy || !worker || compressWait > 0) return;
        while (queue.length) {
            var t = queue.shift();
            var k = t.key;
            if (cache[k] || inflight[k]) continue;
            if (!lastCfg) continue;
            busy = true; inflight[k] = true;
            worker.postMessage({
                type: 'estimate', key: k, src: t.src,
                q: t.q, model: t.model, tpb: t.tpb, reorder: t.reorder,
                lighten: t.lighten, exclude: t.exclude, pseudoSustain: t.pseudoSustain
            });
            return;
        }
    }
    function enqueue(cfg, k, q, model) {
        var dup = false;
        for (var i = 0; i < queue.length; i++) if (queue[i].key === k) { dup = true; break; }
        if (dup || cache[k] || inflight[k]) return;
        queue.push({
            key: k, q: q, model: model, src: cfg.src,
            tpb: cfg.ticksPerBeat, reorder: cfg.reorder,
            lighten: cfg.lighten, exclude: cfg.exclude,
            pseudoSustain: cfg.pseudoSustain === true
        });
    }

    // ---------- 公开 API ----------

    // 打开压缩弹窗时调用: 换歌时丢弃旧缓存, 并按「当前选中优先」重排全模型×全档位预计算。
    // work 参数不变时 (src 引用 + ticksPerBeat 相同) 保留缓存作增量补充, 例如选轨往返重开弹窗。
    function startPrefetch(cfg) {
        cfg = cfg || {};
        var sameSong = !!(lastCfg && lastCfg.src === cfg.src && lastCfg.ticksPerBeat === cfg.ticksPerBeat);
        lastCfg = cfg;
        if (!sameSong) {
            cache = {}; inflight = {}; queue = []; busy = false;
        }
        var order = [];
        MODELS.forEach(function (m) { LEVELS.forEach(function (q) { order.push({ q: q, model: m }); }); });
        var priority = function (it) {
            return (it.q === cfg.priorityQ && it.model === cfg.priorityModel) ? 0 : 1;
        };
        order.sort(function (a, b) { return priority(a) - priority(b); });
        order.forEach(function (it) { enqueue(cfg, keyOf(cfg, it.q, it.model), it.q, it.model); });
        buildWorker();
        pump();
    }
    // 弹窗内查询: 缓存命中(Worker 后台已预填) → 立即返回; 否则主线程同步估算,
    // 与改动前(纯同步)行为一致, 永不卡在「正在计算…」。Worker 仍在后台预填,
    // 后续命中即跳过同步、加速滑块响应。
    function getEstimate(cfg, q, model) {
        var k = keyOf(cfg, q, model);
        if (cache[k]) return cache[k];
        if (window.compressSongEstimate) {
            try {
                var est = window.compressSongEstimate(cfg.src, q, {
                    ticksPerBeat: cfg.ticksPerBeat, reorder: cfg.reorder,
                    lightenLayers: cfg.lighten, excludeLayers: cfg.exclude, model: model,
                    pseudoSustain: cfg.pseudoSustain === true
                });
                cache[k] = { status: 'ready', total: est.total, deleted: est.deleted, kept: est.kept };
                return cache[k];
            } catch (e) {}
        }
        return { status: 'pending' };
    }
    // 真正的压缩: 始终主线程同步执行 (与改动前行为一致), 立即返回 resolved/rejected Promise,
    // 不走 Worker 异步链 —— 避免 Worker 不可用/无响应时 Promise 永久 pending 导致「点击无反应」。
    // cfg.src 为 doCompressSong 已 map 克隆的副本, 同步压缩不污染 state 原始音符。
    function compress(cfg, q, model, onProgress) {
        if (window.compressSongCore) {
            try {
                var res = window.compressSongCore(cfg.src, q, model, {
                    ticksPerBeat: cfg.ticksPerBeat, reorder: cfg.reorder,
                    lightenLayers: cfg.lighten, excludeLayers: cfg.exclude,
                    pseudoSustain: cfg.pseudoSustain === true,
                    onProgress: onProgress
                });
                return Promise.resolve(res);
            } catch (e) {
                return Promise.reject(e);
            }
        }
        return Promise.reject(new Error('compressSongCore unavailable'));
    }
    function setNotify(fn) { notify = fn; }
    function terminate() { if (worker) { worker.terminate(); worker = null; } }

    window.CompressEst = {
        startPrefetch: startPrefetch,
        getEstimate: getEstimate,
        compress: compress,
        setNotify: setNotify,
        terminate: terminate
    };
})();