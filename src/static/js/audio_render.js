// ====================================================================
// 离线渲染引擎 + 整体风格效果预设 + 音频编码 (audio_render.js)
// ====================================================================
// 职责:
//   1. 风格预设表 (原声/KTV/演唱会/大厅/俱乐部/摇滚/复古/纯净), 参数表驱动
//   2. buildChain: 把预设装配成 Web Audio 节点链 (实时/离线共用)
//   3. renderSong: 用 OfflineAudioContext 把 NBS 歌曲离线渲染为 AudioBuffer
//   4. 编码: 16bit PCM WAV (自研) + MP3 (lamejs 本地库)
// 依赖: audio_engine.js (取默认音色缓冲/采样率), custom_instruments.js (取自定义音频)
// ====================================================================
(function() {
    'use strict';

    // ---------- 风格预设表 (参数驱动, 追加新风格只加一行) ----------
    // eq:  {type: biquad 类型, freq, q, gain}        // gain 单位 dB
    // drive: 饱和强度 0-1 (waveshaper)
    // reverb: {seconds: 混响时长, decay: 衰减指数, wet: 湿声比例, predelay: 秒}
    // compressor: 压缩参数 (可选, 缺省使用 RC 默认)
    // postGain: 输出增益
    var STYLES = {
        dry: {
            name: '原声',
            desc: '无任何处理, 最接近 NBS 原始输出',
            eq: [], drive: 0, reverb: null, compressor: null, postGain: 1.0
        },
        ktv: {
            name: 'KTV',
            desc: '中频增强 + 轻房间混响 + 轻压缩, 伴奏欢唱感',
            eq: [
                { type: 'lowShelf', freq: 200, q: 0.7, gain: -1.5 },
                { type: 'peaking', freq: 1000, q: 1.0, gain: 3.0 },
                { type: 'peaking', freq: 3200, q: 1.2, gain: 2.5 },
                { type: 'highShelf', freq: 9000, q: 0.7, gain: 2.0 }
            ],
            drive: 0,
            reverb: { seconds: 1.1, decay: 1.5, wet: 0.08, predelay: 0.012 },
            compressor: { threshold: -18, knee: 12, ratio: 2.5, attack: 0.006, release: 0.22 },
            postGain: 1.1
        },
        live: {
            name: '演唱会',
            desc: '大厅/现场感混响 + 压缩靠前, 现场 PA 感',
            eq: [
                { type: 'lowShelf', freq: 180, q: 0.7, gain: 2.0 },
                { type: 'peaking', freq: 800, q: 0.9, gain: 1.0 },
                { type: 'highShelf', freq: 8000, q: 0.7, gain: 1.5 }
            ],
            drive: 0,
            reverb: { seconds: 2.6, decay: 2.2, wet: 0.18, predelay: 0.028 },
            compressor: { threshold: -20, knee: 14, ratio: 3.0, attack: 0.005, release: 0.25 },
            postGain: 1.1
        },
        hall: {
            name: '大厅',
            desc: '古典大空间混响, 柔和, 高频略收',
            eq: [
                { type: 'lowShelf', freq: 160, q: 0.7, gain: 1.0 },
                { type: 'peaking', freq: 2000, q: 1.0, gain: -1.5 },
                { type: 'highShelf', freq: 8000, q: 0.7, gain: -1.0 }
            ],
            drive: 0,
            reverb: { seconds: 4.2, decay: 2.6, wet: 0.22, predelay: 0.05 },
            compressor: { threshold: -24, knee: 16, ratio: 2.0, attack: 0.008, release: 0.3 },
            postGain: 1.1
        },
        club: {
            name: '俱乐部',
            desc: '低频增强 + 偏干 + 短混响, 节奏清晰',
            eq: [
                { type: 'lowShelf', freq: 130, q: 0.8, gain: 2.5 },
                { type: 'peaking', freq: 2500, q: 1.0, gain: -1.0 },
                { type: 'highShelf', freq: 10000, q: 0.7, gain: 2.0 }
            ],
            drive: 0,
            reverb: { seconds: 0.7, decay: 1.6, wet: 0.06, predelay: 0.008 },
            compressor: { threshold: -16, knee: 10, ratio: 3.5, attack: 0.004, release: 0.18 },
            postGain: 1.15
        },
        rock: {
            name: '摇滚',
            desc: '中频提升 + 结实压缩, 乐队感',
            eq: [
                { type: 'lowShelf', freq: 150, q: 0.7, gain: 2.0 },
                { type: 'peaking', freq: 900, q: 1.1, gain: 3.0 },
                { type: 'peaking', freq: 3800, q: 1.0, gain: 1.5 },
                { type: 'highShelf', freq: 9000, q: 0.7, gain: 1.0 }
            ],
            drive: 0.12,
            reverb: { seconds: 1.3, decay: 1.8, wet: 0.07, predelay: 0.015 },
            compressor: { threshold: -22, knee: 12, ratio: 4.0, attack: 0.004, release: 0.2 },
            postGain: 1.15
        },
        retro: {
            name: '复古',
            desc: '温和高频衰减 + 轻度饱和, 磁带感',
            eq: [
                { type: 'peaking', freq: 400, q: 0.8, gain: 1.5 },
                { type: 'highShelf', freq: 6500, q: 0.7, gain: -3.0 }
            ],
            drive: 0.15,
            reverb: { seconds: 1.6, decay: 2.0, wet: 0.10, predelay: 0.02 },
            compressor: { threshold: -18, knee: 14, ratio: 3.0, attack: 0.006, release: 0.24 },
            postGain: 1.15
        },
        clear: {
            name: '纯净',
            desc: '平直 EQ + 轻压缩提升清晰度',
            eq: [
                { type: 'lowShelf', freq: 120, q: 0.7, gain: -1.0 },
                { type: 'peaking', freq: 5000, q: 1.0, gain: 2.0 }
            ],
            drive: 0,
            reverb: null,
            compressor: { threshold: -12, knee: 20, ratio: 2.0, attack: 0.008, release: 0.26 },
            postGain: 1.1
        }
    };

    // 立即可变的风格顺序数组
    var STYLE_ORDER = ['dry', 'ktv', 'live', 'hall', 'club', 'rock', 'retro', 'clear'];

    // ---------- 工具: 生成波形整形曲线 (软饱和) ----------
    function makeDriveCurve(amount) {
        amount = Math.max(0, Math.min(1, amount || 0));
        if (amount <= 0) return null;
        var n = 1024;
        var curve = new Float32Array(n);
        var k = 1 + amount * 6;
        for (var i = 0; i < n; i++) {
            var x = (i * 2) / n - 1;
            curve[i] = Math.tanh(x * k) / Math.max(0.5, Math.tanh(k));
        }
        return curve;
    }

    // ---------- 工具: 确定性伪随机 (mulberry32) ----------
    // 混响 IR 使用固定种子, 保证同一预设/参数下每次离线渲染结果一致 (Math.random 会导致重复导出尾音不同)
    function mulberry32(seed) {
        var a = seed | 0;
        return function() {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- 工具: 生成混响 IR (本地算法, 无外部资源) ----------
    function makeIR(ctx, reverb) {
        reverb = reverb || { seconds: 1.5, decay: 2.0, wet: 0.15, predelay: 0 };
        var sr = ctx.sampleRate || 44100;
        var predelaySamples = Math.floor((reverb.predelay || 0) * sr);
        var total = Math.max(1, Math.floor((reverb.seconds || 1.5) * sr)) + predelaySamples;
        var ir = ctx.createBuffer(2, total, sr);
        var decay = reverb.decay || 2.0;
        // 种子由混响参数派生, 不同参数 -> 不同 IR; 相同参数 -> 恒定的 IR
        var rnd = mulberry32(Math.floor(((reverb.seconds || 1.5) * 1000 + (reverb.decay || 2.0) * 100) * 1000) ^ 0x5F356495);
        for (var ch = 0; ch < 2; ch++) {
            var data = ir.getChannelData(ch);
            for (var i = 0; i < total; i++) {
                if (i < predelaySamples) { data[i] = 0; continue; }
                var t = (i - predelaySamples) / Math.max(1, total - predelaySamples);
                // 立体声扩散: 左右通道用顺序取样的不同随机值
                var noise = 2 * rnd() - 1;
                data[i] = noise * Math.pow(1 - t, decay);
            }
        }
        return ir;
    }

    // ---------- 效果链装配: 供实时播放与离线渲染共用 ----------
    // 返回 { input } : input 为干声输入节点, 链末端已连接到 destination
    function buildChain(ctx, styleId, destination) {
        var style = STYLES[styleId] || STYLES['dry'];
        var input = ctx.createGain();
        input.gain.value = 1;
        var cur = input;

        // 1. 均衡
        var eqList = style.eq || [];
        for (var i = 0; i < eqList.length; i++) {
            var seg = eqList[i];
            var f = ctx.createBiquadFilter();
            f.type = seg.type || 'peaking';
            f.frequency.value = seg.freq || 1000;
            f.Q.value = (seg.q !== undefined ? seg.q : 0.8);
            if (seg.gain !== undefined) f.gain.value = seg.gain;
            cur.connect(f);
            cur = f;
        }

        // 2. 饱和/驱动
        if (style.drive && style.drive > 0) {
            var ws = ctx.createWaveShaper();
            ws.curve = makeDriveCurve(style.drive);
            ws.oversample = '4x';
            cur.connect(ws);
            cur = ws;
        }

        // 3. 干湿分离 (混响)
        var sum = ctx.createGain();
        sum.gain.value = 1;
        if (style.reverb) {
            var conv = ctx.createConvolver();
            conv.buffer = makeIR(ctx, style.reverb);
            var wetG = ctx.createGain();
            wetG.gain.value = Math.max(0, Math.min(1, style.reverb.wet || 0.15));
            cur.connect(sum);
            cur.connect(conv);
            conv.connect(wetG);
            wetG.connect(sum);
        } else {
            cur.connect(sum);
        }

        // 4. 输出增益 + 压缩 (仅当预设指定了 compressor 时才启用)
        var post = ctx.createGain();
        post.gain.value = style.postGain || 1.0;

        var outNode = post; // 链末端 (真正连接到 destination 的节点)
        if (style.compressor) {
            var comp = ctx.createDynamicsCompressor();
            var cp = style.compressor;
            comp.threshold.value = cp.threshold !== undefined ? cp.threshold : -14;
            comp.knee.value = cp.knee !== undefined ? cp.knee : 20;
            comp.ratio.value = cp.ratio !== undefined ? cp.ratio : 3;
            comp.attack.value = cp.attack !== undefined ? cp.attack : 0.006;
            comp.release.value = cp.release !== undefined ? cp.release : 0.2;
            post.connect(comp);
            comp.connect(destination);
            outNode = comp;
        } else {
            post.connect(destination);
        }

        sum.connect(post);

        // _output 为链末端节点 (已连接到 destination), 供调用方切换/清理时断开
        return { input: input, _output: outNode };
    }

    // ---------- 默认音色缓冲 (复用 AudioEngine 预加载, 缺失时自行抓取) ----------
    var _ownBuffers = {};   // name -> Promise<AudioBuffer>
    var _decodeCtx = null;  // 专用解码 AudioContext (OfflineAudioContext.decodeAudioData 已被 Chrome 移除)

    function getDecodeCtx() {
        if (_decodeCtx) return _decodeCtx;
        if (window.AudioEngine && AudioEngine.getContext) {
            try { _decodeCtx = AudioEngine.getContext(); if (_decodeCtx) return _decodeCtx; } catch (e) {}
        }
        try { _decodeCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _decodeCtx = null; }
        return _decodeCtx;
    }

    function getDefaultBuffer(soundName) {
        // 优先复用实时引擎已解码的缓冲
        if (window.AudioEngine && AudioEngine.getSoundBuffer) {
            var b = AudioEngine.getSoundBuffer(soundName);
            if (b) return Promise.resolve(b);
        }
        if (_ownBuffers[soundName]) return _ownBuffers[soundName];
        var dctx = getDecodeCtx();
        if (!dctx) return Promise.reject(new Error('无法创建解码上下文'));
        _ownBuffers[soundName] = (window.AudioEngine && AudioEngine.getSoundArrayBuffer
            ? AudioEngine.getSoundArrayBuffer(soundName)
            : fetch(window.STATIC_BASE + '/sounds/' + soundName + '.ogg')
                .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.arrayBuffer(); }))
            .then(function(ab) { return dctx.decodeAudioData(ab); })
            .catch(function(e) { delete _ownBuffers[soundName]; throw e; });
        return _ownBuffers[soundName];
    }

    // ---------- 播放速率 (与 audio_engine 完全一致) ----------
    function pitchRate(key) {
        return 0.5 * Math.pow(2, (key - 33) / 12);
    }

    // 默认乐器归一化增益 (与 audio_engine.INSTRUMENT_GAIN 一致)
    var DEFAULT_GAIN = {
        'harp': 0.70, 'dbass': 0.85, 'bdrum': 0.80, 'sdrum': 0.80, 'click': 0.70,
        'guitar': 0.75, 'flute': 0.70, 'bell': 0.65, 'icechime': 0.65, 'xylobone': 0.70,
        'iron_xylophone': 0.70, 'cow_bell': 0.70, 'didgeridoo': 0.85, 'bit': 0.70,
        'banjo': 0.70, 'pling': 0.70, 'copper': 0.75, 'copper_exposed': 0.75,
        'copper_weathered': 0.75, 'copper_oxidized': 0.75
    };

    var SOUND_NAMES = {
        0: 'harp', 1: 'dbass', 2: 'bdrum', 3: 'sdrum', 4: 'click', 5: 'guitar',
        6: 'flute', 7: 'bell', 8: 'icechime', 9: 'xylobone', 10: 'iron_xylophone',
        11: 'cow_bell', 12: 'didgeridoo', 13: 'bit', 14: 'banjo', 15: 'pling',
        16: 'copper', 17: 'copper_exposed', 18: 'copper_weathered', 19: 'copper_oxidized'
    };

    // ---------- 离线渲染主函数 ----------
    // opts: {
    //   notes: [{tick, layer, instrument, key, velocity, pan, pitch}]
    //   tempo: number (tick/秒)
    //   layers: [{volume, lock}]  (轨道音量与静音)
    //   solo: {active: bool, layer: number|[]}  (独奏, 可选)
    //   style: 'dry'|...
    //   customInstruments: { 20: {buffer, baseKey, gain}, ... }  默认音色缓冲映射
    //   onProgress(percent, label)
    //   cancelled: function():bool   (可选)
    // }
    function renderSong(opts) {
        opts = opts || {};
        var notes = opts.notes || [];
        var tempo = parseFloat(opts.tempo) || 20;
        var styleId = STYLES[opts.style] ? opts.style : 'dry';

        // 总时长: 最大 tick / tempo + 尾部余量 (混响尾音)
        var maxTick = 0;
        for (var i = 0; i < notes.length; i++) {
            var t = notes[i].tick;
            if (t > maxTick) maxTick = t;
        }
        var songSeconds = (maxTick + 1) / tempo;
        var tail = (STYLES[styleId].reverb ? STYLES[styleId].reverb.seconds + 0.8 : 0.5);
        var totalSeconds = songSeconds + tail;
        var useJsMix = !!(opts.useJsMix && window.RenderJsMix);

        // 独奏判定 (沿用前端轨道语义: 有独奏时只响独奏轨道音量, 静音轨道不响)
        var soloActive = !!(opts.solo && opts.solo.active);
        var soloMap = {};
        if (soloActive) {
            var soloArr = Array.isArray(opts.solo.layer) ? opts.solo.layer : [opts.solo.layer];
            for (var si = 0; si < soloArr.length; si++) soloMap[soloArr[si]] = true;
        }

        // 自定义音色缓冲准备: 解码 Blob -> AudioBuffer
        var customMeta = opts.customInstruments || {};

        var layerVol = {};
        if (opts.layers) {
            for (var li = 0; li < opts.layers.length; li++) {
                var lv = opts.layers[li];
                layerVol[li] = (lv && typeof lv.volume === 'number') ? lv.volume : 100;
            }
        }

        // 排序音符, 避免同一时间来源过多超出通道 (顺序播放即可, WebAudio 内部混音)
        var sorted = notes.slice().sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return (a.layer || 0) - (b.layer || 0);
        });

        // 逐个音符建立调度计划: 此阶段只收集音色缓冲 Promise, 不创建音频节点
        var plans = [];
        for (var si2 = 0; si2 < sorted.length; si2++) {
            var n = sorted[si2];
            var layerIdx = n.layer || 0;
            // 轨道静音 / 独奏判定
            if (soloActive && !soloMap[layerIdx]) continue;
            if (opts.layers && opts.layers[layerIdx] && opts.layers[layerIdx].lock) continue; // 静音轨道
            var vol = (layerVol[layerIdx] !== undefined ? layerVol[layerIdx] : 100) / 100;
            var velocity = (n.velocity === undefined || n.velocity === null) ? 100 : n.velocity;
            if (velocity <= 0 || vol <= 0) continue;

            var inst = n.instrument;
            var bufferP = null;
            var baseRate = 1;
            var smGain = 0.70;

            if (inst >= 20) {
                var custom = customMeta[inst];
                if (!custom || !custom.buffer) continue; // 缺少自定义音色: 静音
                bufferP = Promise.resolve(custom.buffer);
                var g = (typeof custom.gain === 'number' ? custom.gain : 100) / 100 * 0.7;
                smGain = g;
                var baseKey = (typeof custom.baseKey === 'number') ? custom.baseKey : 33;
                baseRate = pitchRate(n.key) / pitchRate(baseKey);
            } else {
                var soundName = SOUND_NAMES[inst] || 'harp';
                var cached = (window.AudioEngine && AudioEngine.getSoundBuffer) ? AudioEngine.getSoundBuffer(soundName) : null;
                bufferP = cached ? Promise.resolve(cached) : getDefaultBuffer(soundName);
                smGain = DEFAULT_GAIN[soundName] !== undefined ? DEFAULT_GAIN[soundName] : 0.70;
                baseRate = pitchRate(n.key);
            }

            // NBS 微调 (pitch, 单位音分) 并入速率
            var rate = baseRate * Math.pow(2, (n.pitch || 0) / 1200);

            plans.push({
                note: n,
                rate: rate,
                startTime: (n.tick / tempo),
                gain: smGain * (velocity / 100) * vol,
                bufferP: bufferP
            });
        }

        // 先并行解出全部音色缓冲, 再在单个同步任务中创建并连接全部音频节点,
        // 最后紧接 startRendering(), 结构简单且各浏览器行为一致。
        return Promise.all(plans.map(function(p) { return p.bufferP.catch(function() { return null; }); })).then(function(buffers) {
            if (opts.onProgress) opts.onProgress(5, '开始渲染…');

            // JS 预混路径: 全部音符先在 JS 层混合为单个缓冲, 再走单音源效果链,
            // 规避 OfflineAudioContext 对大量活跃音源的逐量子开销 (音符密集时加速 5~10 倍)
            if (useJsMix) {
                return jsMixRender(plans, buffers, opts, totalSeconds, styleId);
            }

            var channels = 2;
            var sampleRate = opts.sampleRate || 44100;
            var sampleRateSelf;
            try {
                var probeCtx = new OfflineAudioContext(1, 1, sampleRate);
                sampleRateSelf = probeCtx.sampleRate; // 某些浏览器强制到设备采样率
            } catch (e) {
                sampleRateSelf = sampleRate;
            }
            var length = Math.max(1, Math.ceil(totalSeconds * sampleRateSelf));
            var offCtx = new OfflineAudioContext(channels, length, sampleRateSelf);
            // 装配效果链 (与实时播放共用)
            var chain = buildChain(offCtx, styleId, offCtx.destination);
            var masterBus = chain.input;

            // 在单个同步任务中为全部音符创建并连接音频节点, 再立即 startRendering。
            // 注意: 每个 AudioBufferSourceNode 都必须 connect 到增益/主总线, 缺失连接会直接产生静音。
            for (var pi = 0; pi < plans.length; pi++) {
                var p = plans[pi];
                var buffer = buffers[pi];
                if (!buffer) continue;

                // 实际播放时长 = 音色缓冲时长 / 变速比例 (与实时引擎一致)
                var dur = Math.max(0.01, buffer.duration / Math.max(0.5, p.rate));

                var src = offCtx.createBufferSource();
                src.buffer = buffer;
                // 与实时引擎一致: 不钳制上限。key=87 时 rate≈11.3, 若 clamp 到 8 会导致高音区音高/时长偏差
                src.playbackRate.value = Math.max(0.02, p.rate);

                var g = offCtx.createGain();
                // 5ms 起音包络防爆音
                g.gain.setValueAtTime(0.0001, p.startTime);
                g.gain.exponentialRampToValueAtTime(Math.max(0.001, p.gain), p.startTime + 0.005);
                src.connect(g);

                var panVal = (typeof p.note.pan === 'number') ? p.note.pan : 50;
                var outNode = g;
                if (offCtx.createStereoPanner) {
                    var panner = offCtx.createStereoPanner();
                    panner.pan.value = (panVal - 50) / 50;
                    g.connect(panner);
                    outNode = panner;
                }
                outNode.connect(masterBus);

                src.start(p.startTime);
                src.stop(p.startTime + dur + 0.03);
            }
            return offCtx.startRendering().then(function(rendered) {
                if (opts.onProgress) opts.onProgress(100, '渲染完成');
                return rendered;
            });
        });
    }

    // ---------- JS 预混渲染路径 (useJsMix) ----------
    function jsMixRender(plans, buffers, opts, totalSeconds, styleId) {
        // 导出统一使用 44100: 内置音色本身即 44.1k, rate=1 直拷零重采样; 且 44.1k 对 WAV/MP3(lamejs) 最兼容
        var sr = 44100;
        var length = Math.max(1, Math.ceil(totalSeconds * sr));
        var book = {};
        var events = [];
        for (var i = 0; i < plans.length; i++) {
            var p = plans[i];
            var buffer = buffers[i];
            if (!buffer) continue;
            var key = 'b' + i;
            book[key] = {
                l: buffer.getChannelData(0),
                r: buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null,
                sr: buffer.sampleRate || sr
            };
            var panVal = (typeof p.note.pan === 'number') ? p.note.pan : 50;
            events.push({
                buf: key,
                t0: p.startTime,
                rate: p.rate,
                gain: p.gain,
                pan: (panVal - 50) / 50
            });
        }

        var mix;
        try {
            mix = window.RenderJsMix.mix(book, events, length, sr, function() {
                return !!(opts.cancelled && opts.cancelled());
            });
        } catch (e) {
            var cerr = new Error(e && e.message || '渲染已取消');
            cerr.cancelled = true;
            throw cerr;
        }
        if (opts.onProgress) opts.onProgress(55, '混合完成, 效果处理中…');

        var ctx = new OfflineAudioContext(2, length, sr);
        var mixBuf = ctx.createBuffer(2, length, sr);
        mixBuf.getChannelData(0).set(mix.l);
        mixBuf.getChannelData(1).set(mix.r);

        var chain = buildChain(ctx, styleId, ctx.destination);
        var src = ctx.createBufferSource();
        src.buffer = mixBuf;
        src.connect(chain.input);
        src.start(0);
        return ctx.startRendering().then(function(rendered) {
            if (opts.onProgress) opts.onProgress(100, '渲染完成');
            return rendered;
        });
    }

    // ---------- WAV 编码 (16-bit PCM 交织, 立体声) ----------
    function encodeWav(buffer) {
        var numChannels = Math.max(1, Math.min(2, buffer.numberOfChannels));
        var sampleRate = buffer.sampleRate;
        var length = buffer.length;
        var bytesPerSample = 2;
        var blockAlign = numChannels * bytesPerSample;
        var dataSize = length * blockAlign;
        var bufferSize = 44 + dataSize;
        var arrayBuffer = new ArrayBuffer(bufferSize);
        var view = new DataView(arrayBuffer);

        // RIFF 头
        function writeStr(offset, str) {
            for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);              // fmt chunk size
        view.setUint16(20, 1, true);               // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);              // bits per sample
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);

        var offset = 44;
        var ch0 = buffer.getChannelData(0);
        var ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;
        var clamp16 = function(v) {
            v = v < -1 ? -1 : (v > 1 ? 1 : v);
            return v < 0 ? (v * 0x8000) | 0 : (v * 0x7FFF) | 0;
        };
        for (var i = 0; i < length; i++) {
            view.setInt16(offset, clamp16(ch0[i]), true); offset += 2;
            if (numChannels > 1) {
                view.setInt16(offset, clamp16(ch1[i]), true); offset += 2;
            }
        }
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    // ---------- MP3 编码 (lamejs, CBR) ----------
    // 返回 Promise<Blob>; lamejs 未加载时 reject
    function encodeMp3(buffer, kbps) {
        return new Promise(function(resolve, reject) {
            if (!window.lamejs) {
                reject(new Error('MP3 编码库未加载'));
                return;
            }
            try {
                // 混音为单声道或保持立体声: lamejs 支持 1/2 声道
                var numCh = Math.max(1, Math.min(2, buffer.numberOfChannels));
                var sr = buffer.sampleRate;
                var left = buffer.getChannelData(0);
                var right = numCh > 1 ? buffer.getChannelData(1) : left;

                var encoder = new lamejs.Mp3Encoder(numCh, sr, kbps || 128);
                // 分块编码, chunkSize = 1152*4 采样
                var chunkSize = 1152 * 4;
                var mp3Data = [];
                var samples = buffer.length;
                var left16 = new Int16Array(chunkSize);
                var right16 = new Int16Array(chunkSize);
                var clamp16 = function(v) {
                    v = v < -1 ? -1 : (v > 1 ? 1 : v);
                    return v < 0 ? (v * 0x8000) | 0 : (v * 0x7FFF) | 0;
                };
                for (var i = 0; i < samples; i += chunkSize) {
                    var n = Math.min(chunkSize, samples - i);
                    for (var j = 0; j < n; j++) {
                        left16[j] = clamp16(left[i + j]);
                        if (numCh > 1) right16[j] = clamp16(right[i + j]);
                    }
                    var enc = (numCh > 1)
                        ? encoder.encodeBuffer(left16.subarray(0, n), right16.subarray(0, n))
                        : encoder.encodeBuffer(left16.subarray(0, n));
                    if (enc.length > 0) mp3Data.push(new Int8Array(enc));
                }
                var end = encoder.flush();
                if (end.length > 0) mp3Data.push(new Int8Array(end));

                var parts = [];
                var totalLen = 0;
                for (var k = 0; k < mp3Data.length; k++) {
                    totalLen += mp3Data[k].length;
                    parts.push(mp3Data[k]);
                }
                var blob = new Blob(parts, { type: 'audio/mpeg' });
                resolve(blob);
            } catch (e) {
                reject(e);
            }
        });
    }

    // 标准下载
    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000);
    }

    // 导出到全局
    window.AudioRender = {
        STYLES: STYLES,
        STYLE_ORDER: STYLE_ORDER,
        buildChain: buildChain,
        renderSong: renderSong,
        encodeWav: encodeWav,
        encodeMp3: encodeMp3,
        downloadBlob: downloadBlob,
        pitchRate: pitchRate
    };
})();