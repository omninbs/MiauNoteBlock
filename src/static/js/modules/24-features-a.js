/* 24-features-a.js — MiauNoteBlock 功能模块
   来源: 原 main.js L11877-L12570; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var _appDialogStack = N._appDialogStack;
    var COMPRESS_WARN_BELOW_IDX = N.COMPRESS_WARN_BELOW_IDX;
    var COMPRESS_DEDUPE_Q = N.COMPRESS_DEDUPE_Q;
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function compressResolveTicksPerBeat() { return N.compressResolveTicksPerBeat.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function showSustainFillAlert() { return N.showSustainFillAlert.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function applySustainFill() { return N.applySustainFill.apply(this, arguments); }

    function showCompressSongDialog() {
        return new Promise(function (resolve) {
            // 跨"选轨往返"保留的配置
            var cfg = {
                // 压缩方式: 'dedupe' 仅删除重复音符 / 'compress' 使用压缩算法
                mode: (function () {
                    var m = localStorage.getItem('nbs_compress_mode');
                    if (m === 'dedupe' || m === 'compress') return m;
                    // 迁移旧存档: 旧档名「近乎无损」或旧百分比 99 等价于「仅删除重复音符」
                    var q = localStorage.getItem('nbs_compress_quality');
                    return (q === '近乎无损' || parseInt(q, 10) === 99) ? 'dedupe' : 'compress';
                })(),
                qualityIdx: (function () {
                    // 迁移旧版存档: 优先按新档名匹配, 否则旧档名/百分比数字 → 最近的 q 档位
                    var saved = localStorage.getItem('nbs_compress_quality');
                    if (saved !== null) {
                        for (var li = 0; li < COMPRESS_LEVELS.length; li++) {
                            if (saved === COMPRESS_LEVELS[li].label) return li;
                        }
                        var oldQ = LEGACY_COMPRESS_Q[saved];
                        if (oldQ === undefined) {
                            var oldPct = parseInt(saved, 10);
                            if (!isNaN(oldPct)) oldQ = oldPct / 100;
                        }
                        if (oldQ !== undefined) {
                            var best = 0, bestDiff = Infinity;
                            for (var lj = 0; lj < COMPRESS_LEVELS.length; lj++) {
                                var d = Math.abs(COMPRESS_LEVELS[lj].q - oldQ);
                                if (d < bestDiff) { bestDiff = d; best = lj; }
                            }
                            return best;
                        }
                    }
                    return 0; // 默认「轻度压缩」(最安全)
                })(),
                model: (function () {
                    // 存在感引擎 (物理) 为默认。旧版默认是 heuristic 且每次点「压缩」都会写入存档,
                    // 故用一次性迁移标记把旧的隐式默认升级为 presence; 迁移后尊重用户显式选择。
                    var m = localStorage.getItem('nbs_compress_model');
                    var carried = localStorage.getItem('nbs_compress_model_default');
                    if (carried !== 'presence') {
                        try { localStorage.setItem('nbs_compress_model_default', 'presence'); } catch (e) {}
                        if (m === null || m === 'heuristic') return 'presence';
                    }
                    return (m === 'heuristic' || m === 'perceptual' || m === 'presence') ? m : 'presence';
                })(),
                reorder: localStorage.getItem('nbs_compress_reorder') !== '0',
                // 伪延音合并/消除开关 (针对每个引擎独立, 默认关闭: 会导致质量下降)
                pseudoSustain: (function () {
                    var def = { heuristic: false, perceptual: false, presence: false };
                    try {
                        var raw = localStorage.getItem('nbs_compress_pseudo');
                        if (raw) {
                            var o = JSON.parse(raw);
                            if (o && typeof o === 'object') {
                                def.heuristic = o.heuristic === true;
                                def.perceptual = o.perceptual === true;
                                def.presence = o.presence === true;
                            }
                        }
                    } catch (e) {}
                    return def;
                })(),
                lighten: [],   // 减轻处理的轨道 (layer 数组)
                exclude: []    // 不被处理的轨道 (layer 数组)
            };
            function savePseudo() {
                try { localStorage.setItem('nbs_compress_pseudo', JSON.stringify(cfg.pseudoSustain)); } catch (e) {}
            }
            // 弹窗生命周期内的歌曲音符快照: 选轨往返时复用同一引用,
            // 保证 CompressEst 后台预计算缓存能跨往返复用而非误判为换歌重算
            var dialogSrc = state.pianoRoll ? state.pianoRoll.getNotes() : [];
            var overlay = null;
            var panel = null;

            function layerName(layer) {
                var tr = (typeof findTrackByLayer === 'function') ? findTrackByLayer(layer) : null;
                return (tr && tr.name) ? tr.name : ('Layer ' + (layer + 1));
            }
            function namesOf(arr) {
                if (!arr || arr.length === 0) return i18nText('未选择任何轨道');
                var names = [];
                for (var i = 0; i < arr.length; i++) names.push(layerName(arr[i]));
                return names.join('、');
            }

            function destroyDialog() {
                if (!overlay) return;
                var idx = _appDialogStack.indexOf(overlay);
                if (idx >= 0) _appDialogStack.splice(idx, 1);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                overlay = null;
            }

            function finish(value) {
                destroyDialog();
                if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                panel = null;
                resolve(value);
            }

            // ===== 选轨: 隐藏弹窗 -> 画布中点击音轨行多选 -> 悬浮窗确定/取消 -> 重开弹窗 =====
            function openTrackPicker(kind) {
                destroyDialog();
                var pr = state.pianoRoll;
                if (!pr || typeof pr.setCompressionLayers !== 'function') { openDialog(); return; }
                var entry = (kind === 'lighten' ? cfg.lighten : cfg.exclude).slice();

                panel = document.createElement('div');
                panel.className = 'popup-content';
                panel.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:8%;z-index:100002;'
                    + 'width:min(520px,92vw);max-height:46vh;display:flex;flex-direction:column;';
                panel.innerHTML =
                    '<div class="settings-header">'
                    + '<i class="fa-solid fa-layer-group"></i>'
                    + '<h4>' + (kind === 'lighten' ? i18nText('选择减轻处理的轨道') : i18nText('选择不被处理的轨道')) + '</h4>'
                    + '</div>'
                    + '<div class="settings-body">'
                    + '<p style="margin:0;font-size:12px;color:var(--text-secondary);">'
                    + i18nText('在画布中点击音轨行进行选择/取消，可多选。') + '</p>'
                    + '<div class="cs-pick-list" style="font-size:12px;color:var(--text-primary);line-height:1.6;word-break:break-all;"></div>'
                    + '</div>'
                    + '<div class="popup-actions">'
                    + '<button class="popup-btn popup-btn-cancel" data-cs="cancel">' + i18nText('取消') + '</button>'
                    + '<button class="popup-btn popup-btn-primary" data-cs="ok">' + i18nText('确定') + '</button>'
                    + '</div>';
                var listEl = panel.querySelector('.cs-pick-list');
                function renderList(layers) {
                    listEl.textContent = (layers.length ? namesOf(layers) : i18nText('未选择任何轨道'))
                        + '  (' + layers.length + ')';
                }

                pr._trackSelectMode = 'compression';
                var prevCb = pr.onTrackSelectChanged;
                pr.onTrackSelectChanged = function (layers) { renderList(layers); };
                pr.setCompressionLayers(entry);      // 高亮回显
                renderList(entry);

                function closePicker(apply) {
                    if (apply) {
                        var picked = pr.getCompressionLayers();
                        if (kind === 'lighten') cfg.lighten = picked; else cfg.exclude = picked;
                    }
                    pr.onTrackSelectChanged = prevCb || null;
                    pr._trackSelectMode = null;
                    pr.setCompressionLayers([]);     // 清除高亮
                    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                    panel = null;
                    openDialog();                    // 重新显示压缩弹窗
                }
                panel.querySelector('[data-cs="ok"]').addEventListener('click', function () { closePicker(true); });
                panel.querySelector('[data-cs="cancel"]').addEventListener('click', function () { closePicker(false); });
                document.body.appendChild(panel);
            }

            function openDialog() {
                overlay = _appDialogOverlay();
                var box = _appDialogBox(i18nText('歌曲压缩'), '', 'fa-solid fa-compress', { maxWidth: 460 });
                var body = box.querySelector('.settings-body');
                body.style.whiteSpace = 'normal';

                // 压缩方式分段按钮组 (替代圆形单选按钮, 与创作辅助面板同风格)
                var modeWrap = document.createElement('div');
                modeWrap.style.cssText = 'margin-bottom:14px;';
                var modeLabel = document.createElement('label');
                modeLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;';
                modeLabel.textContent = i18nText('压缩方式') + ': ';
                var modeSeg = document.createElement('div');
                modeSeg.className = 'assist-seg';
                modeSeg.style.marginBottom = '0';
                var segDedupe = document.createElement('button');
                segDedupe.type = 'button';
                segDedupe.className = 'assist-seg-btn';
                segDedupe.setAttribute('data-compress-mode', 'dedupe');
                segDedupe.textContent = i18nText('仅删除重复音符');
                var segCompress = document.createElement('button');
                segCompress.type = 'button';
                segCompress.className = 'assist-seg-btn';
                segCompress.setAttribute('data-compress-mode', 'compress');
                segCompress.textContent = i18nText('使用压缩算法');
                segDedupe.title = i18nText('只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。');
                segCompress.title = i18nText('在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。');
                modeSeg.appendChild(segDedupe); modeSeg.appendChild(segCompress);
                var modeHint = document.createElement('div');
                modeHint.style.cssText = 'margin-top:6px;font-size:12px;line-height:1.45;color:var(--text-secondary,#a0a0a0);';
                modeWrap.appendChild(modeLabel); modeWrap.appendChild(modeSeg); modeWrap.appendChild(modeHint);
                body.appendChild(modeWrap);
                // 以下控件仅「使用压缩算法」模式下有意义, 去重模式下整块隐藏
                var lossyWrap = document.createElement('div');
                body.appendChild(lossyWrap);

                // 压缩等级滑块
                var qWrap = document.createElement('div');
                qWrap.style.cssText = 'margin-bottom:16px;';
                var qLabel = document.createElement('label');
                qLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;';
                qLabel.textContent = i18nText('压缩等级') + ': ';
                var qVal = document.createElement('span');
                qVal.style.cssText = 'color:var(--accent,#4c9aff);font-weight:bold;';
                qVal.textContent = i18nText(COMPRESS_LEVELS[cfg.qualityIdx].label);
                qLabel.appendChild(qVal);
                var qSlider = document.createElement('input');
                qSlider.type = 'range';
                qSlider.min = '0'; qSlider.max = String(COMPRESS_LEVELS.length - 1); qSlider.step = '1'; qSlider.value = String(cfg.qualityIdx);
                qSlider.style.cssText = 'width:100%;';
                // 最强压缩档的黄色警示 (可能过度删除音符)
                var qWarn = document.createElement('div');
                qWarn.style.cssText = 'display:none;margin-top:6px;font-size:12px;line-height:1.45;color:#f5c542;';
                qWarn.textContent = i18nText('最强压缩：可能过度删除音符，歌曲听感可能明显受损');
                // 实时预估: 当前档位预计删除/保留的音符数
                // 弹窗生命周期内的估算参数 (src 复用外层快照, 供后台 Worker 预计算)
                var estCfg = {
                    src: dialogSrc,
                    ticksPerBeat: compressResolveTicksPerBeat(),
                    reorder: cfg.reorder,
                    lighten: cfg.lighten,
                    exclude: cfg.exclude,
                    pseudoSustain: cfg.pseudoSustain[cfg.model] === true,
                    // 优先算当前档位; 去重模式下游标不参与, 优先算 q=0.99 档
                    priorityQ: cfg.mode === 'dedupe' ? COMPRESS_DEDUPE_Q : COMPRESS_LEVELS[cfg.qualityIdx].q,
                    priorityModel: cfg.model
                };
                var qEst = document.createElement('div');
                qEst.style.cssText = 'margin-top:4px;font-size:12px;line-height:1.45;color:var(--text-secondary,#a0a0a0);';
                var syncQuality = function () {
                    var isDedupe = cfg.mode === 'dedupe';
                    var idx = parseInt(qSlider.value, 10);
                    cfg.qualityIdx = idx;
                    qVal.textContent = i18nText(COMPRESS_LEVELS[idx].label);
                    qWarn.style.display = (!isDedupe && idx >= COMPRESS_WARN_BELOW_IDX) ? 'block' : 'none';
                    // 去重模式固定 q=0.99 (核心在该档只做完全去重, 不进入任何有损引擎)
                    var q = isDedupe ? COMPRESS_DEDUPE_Q : COMPRESS_LEVELS[idx].q;
                    var m = cfg.model;
                    if (window.CompressEst) {
                        // 后台预计算缓存命中 → 显示数值; 未算出 → 「正在计算…」占位
                        var est = window.CompressEst.getEstimate(estCfg, q, m);
                        if (est.status === 'ready') {
                            var pct = est.total > 0 ? Math.round(est.deleted / est.total * 100) : 0;
                            qEst.textContent = i18nText('预计删除') + ' ' + est.deleted + ' (' + pct + '%)  ·  '
                                + i18nText('保留') + ' ' + est.kept;
                        } else {
                            qEst.textContent = i18nText('正在计算…');
                        }
                    } else {
                        // 无 CompressEst（旧构建产物）: 同步估算降级, 保持原行为
                        var src = dialogSrc;
                        var est2 = window.compressSongEstimate
                            ? window.compressSongEstimate(src, q, { lightenLayers: estCfg.lighten, excludeLayers: estCfg.exclude, model: m, pseudoSustain: cfg.pseudoSustain[m] === true })
                            : { total: src.length, deleted: 0, kept: src.length };
                        var pct2 = est2.total > 0 ? Math.round(est2.deleted / est2.total * 100) : 0;
                        qEst.textContent = i18nText('预计删除') + ' ' + est2.deleted + ' (' + pct2 + '%)  ·  '
                            + i18nText('保留') + ' ' + est2.kept;
                    }
                };
                qSlider.addEventListener('input', syncQuality);
                qWrap.appendChild(qLabel);
                qWrap.appendChild(qSlider);
                qWrap.appendChild(qWarn);
                lossyWrap.appendChild(qWrap);
                // 预估行挂在方式选择器下方 (而非有损控件区内): 去重模式下同样可见
                modeWrap.appendChild(qEst);

                // 算法模型选择器
                var mWrap = document.createElement('div');
                mWrap.style.cssText = 'margin-bottom:16px;';
                var mLabel = document.createElement('label');
                mLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;';
                mLabel.textContent = i18nText('算法模型') + ': ';
                var mSel = document.createElement('select');
                mSel.style.cssText = 'width:100%;padding:6px 8px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);';
                var modelHint = i18nText('三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。');
                var hDesc = i18nText('务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。');
                var pDesc = i18nText('感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。');
                var prDesc = i18nText('存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。');
                var oH = document.createElement('option');
                oH.value = 'heuristic'; oH.textContent = i18nText('务实启发式（快速）');
                var oP = document.createElement('option');
                oP.value = 'perceptual'; oP.textContent = i18nText('感知引擎（智能）');
                var oPr = document.createElement('option');
                oPr.value = 'presence'; oPr.textContent = i18nText('存在感引擎（物理）');
                oH.title = hDesc; oP.title = pDesc; oPr.title = prDesc;
                mSel.appendChild(oH); mSel.appendChild(oP); mSel.appendChild(oPr);
                mSel.value = cfg.model;
                mSel.title = hDesc + '\n' + pDesc + '\n' + prDesc + '\n' + modelHint;
                var mHint = document.createElement('div');
                mHint.style.cssText = 'margin-top:4px;font-size:12px;line-height:1.45;color:var(--text-secondary,#a0a0a0);';
                mHint.textContent = modelHint;
                mWrap.appendChild(mLabel);
                mWrap.appendChild(mSel);
                mWrap.appendChild(mHint);
                lossyWrap.appendChild(mWrap);

                // 伪延音合并/消除开关 (针对当前选中引擎独立保存, 默认关闭)
                var pWrap = document.createElement('label');
                pWrap.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;margin-bottom:4px;';
                var pCb = document.createElement('input');
                pCb.type = 'checkbox';
                var pSpan = document.createElement('span');
                pSpan.textContent = i18nText('合并并消除伪延音');
                var pTitle = i18nText('将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。');
                pSpan.title = pTitle;
                pCb.title = pTitle;
                pWrap.appendChild(pCb); pWrap.appendChild(pSpan);
                var pHint = document.createElement('div');
                pHint.style.cssText = 'margin-bottom:16px;font-size:12px;line-height:1.45;color:var(--text-secondary,#a0a0a0);';
                pHint.textContent = i18nText('该开关针对每个引擎分别保存，当前仅作用于所选引擎。');
                function syncPseudo() {
                    pCb.checked = cfg.pseudoSustain[cfg.model] === true;
                }
                syncPseudo();
                pCb.addEventListener('change', function () {
                    cfg.pseudoSustain[cfg.model] = pCb.checked;
                    savePseudo();
                    estCfg.pseudoSustain = pCb.checked;
                    // 伪延音参与估算缓存键, 变化后需重新预计算受影响档位
                    if (window.CompressEst) window.CompressEst.startPrefetch(estCfg);
                    syncQuality();
                });
                mSel.addEventListener('change', function () {
                    cfg.model = mSel.value;
                    syncPseudo();
                    estCfg.pseudoSustain = cfg.pseudoSustain[cfg.model] === true;
                    if (window.CompressEst) window.CompressEst.startPrefetch(estCfg);
                    syncQuality();
                });
                lossyWrap.appendChild(pWrap);
                lossyWrap.appendChild(pHint);

                // 轨道选择行 (减轻处理 / 不被处理)
                function trackRow(labelText, kind, arr) {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
                    var lb = document.createElement('span');
                    lb.style.cssText = 'flex:0 0 auto;font-size:13px;color:var(--text-primary,#fff);';
                    lb.textContent = labelText;
                    var summary = document.createElement('span');
                    summary.style.cssText = 'flex:1 1 auto;font-size:12px;color:var(--text-secondary,#a0a0a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    summary.textContent = namesOf(arr);
                    summary.title = namesOf(arr);
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'popup-btn';
                    btn.style.cssText = 'flex:0 0 auto;';
                    btn.textContent = i18nText('选择');
                    btn.addEventListener('click', function () { openTrackPicker(kind); });
                    row.appendChild(lb); row.appendChild(summary); row.appendChild(btn);
                    return row;
                }
                lossyWrap.appendChild(trackRow(i18nText('减轻处理的轨道'), 'lighten', cfg.lighten));
                body.appendChild(trackRow(i18nText('不被处理的轨道'), 'exclude', cfg.exclude));

                // 重排序音符 (填补空洞)
                var rWrap = document.createElement('label');
                rWrap.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;';
                var rCb = document.createElement('input');
                rCb.type = 'checkbox';
                rCb.checked = cfg.reorder;
                var rSpan = document.createElement('span');
                rSpan.textContent = i18nText('重排序音符');
                rSpan.title = i18nText('删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞');
                rWrap.appendChild(rCb); rWrap.appendChild(rSpan);
                body.appendChild(rWrap);

                // ---- 压缩方式切换 (去重模式隐藏全部有损控件, 避免无关选项造成误解) ----
                var modeHintText = {
                    dedupe: i18nText('只删除完全重复的音符，几乎不影响质量。'),
                    compress: i18nText('按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。')
                };
                function syncMode() {
                    var isDedupe = cfg.mode === 'dedupe';
                    segDedupe.classList.toggle('active', isDedupe);
                    segCompress.classList.toggle('active', !isDedupe);
                    modeHint.textContent = modeHintText[cfg.mode] || '';
                    lossyWrap.style.display = isDedupe ? 'none' : 'block';
                    estCfg.priorityQ = isDedupe ? COMPRESS_DEDUPE_Q : COMPRESS_LEVELS[cfg.qualityIdx].q;
                    // 去重模式仍可显示预估 (q=0.99 → 即去重数量), 故一律刷新
                    syncQuality();
                }
                segDedupe.addEventListener('click', function () {
                    if (cfg.mode === 'dedupe') return;
                    cfg.mode = 'dedupe';
                    estCfg.priorityQ = COMPRESS_DEDUPE_Q;
                    if (window.CompressEst) window.CompressEst.startPrefetch(estCfg);
                    syncMode();
                });
                segCompress.addEventListener('click', function () {
                    if (cfg.mode === 'compress') return;
                    cfg.mode = 'compress';
                    estCfg.priorityQ = COMPRESS_LEVELS[cfg.qualityIdx].q;
                    if (window.CompressEst) window.CompressEst.startPrefetch(estCfg);
                    syncMode();
                });

                // 后台预计算: 打开弹窗即启动「全模型 × 全档位」估算 (Web Worker),
                // 滑块/模型切换只读缓存; 已算好的档位立即显示数值, 否则显示「正在计算…」
                if (window.CompressEst) {
                    window.CompressEst.startPrefetch(estCfg);
                    window.CompressEst.setNotify(function () { syncQuality(); });
                }
                rCb.addEventListener('change', function () {
                    cfg.reorder = rCb.checked;
                    estCfg.reorder = rCb.checked;
                    // 重排序参与缓存键, 变化后需重新预计算受影响档位
                    if (window.CompressEst) window.CompressEst.startPrefetch(estCfg);
                    syncQuality();
                });
                syncMode();   // 首次渲染: 按当前模式设置按钮态/隐藏有损控件/刷新预估

                overlay.appendChild(box);
                document.body.appendChild(overlay);
                _appDialogStack.push(overlay);

                box.querySelector('#app-dialog-x').addEventListener('click', function () { finish(null); });
                var cancelBtn = _appDialogBtn(i18nText('取消'), false);
                cancelBtn.addEventListener('click', function () { finish(null); });
                var okBtn = _appDialogBtn(i18nText('压缩'), true);
                okBtn.addEventListener('click', function () {
                    var idx = parseInt(qSlider.value, 10);
                    localStorage.setItem('nbs_compress_mode', cfg.mode);
                    localStorage.setItem('nbs_compress_quality', COMPRESS_LEVELS[idx].label);
                    localStorage.setItem('nbs_compress_model', mSel.value);
                    localStorage.setItem('nbs_compress_reorder', rCb.checked ? '1' : '0');
                    finish({
                        // 去重模式: 固定 q=0.99, 核心在该档只做完全去重 (不进入任何有损引擎)
                        quality: cfg.mode === 'dedupe' ? COMPRESS_DEDUPE_Q : COMPRESS_LEVELS[idx].q,
                        model: mSel.value,
                        reorder: rCb.checked,
                        pseudoSustain: cfg.pseudoSustain[mSel.value] === true,
                        lighten: cfg.mode === 'dedupe' ? [] : cfg.lighten.slice(),
                        exclude: cfg.exclude.slice()
                    });
                });
                var actions = box.querySelector('.popup-actions');
                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });
                setTimeout(function () { okBtn.focus(); }, 50);
            }

            openDialog();
        });
    }

    // ===== 压缩进度弹窗 (Worker 后台执行压缩时显示) =====
    function openCompressProgDlg() {
        var overlay = _appDialogOverlay();
        var box = _appDialogBox(i18nText('正在压缩'), '', 'fa-solid fa-compress', { maxWidth: 460 });
        var body = box.querySelector('.settings-body');
        body.style.whiteSpace = 'normal';
        var track = document.createElement('div');
        track.style.cssText = 'width:100%;height:10px;border-radius:5px;background:var(--ctrl-fill-default,#1c1c1c);overflow:hidden;';
        var bar = document.createElement('div');
        bar.style.cssText = 'height:100%;width:0%;background:var(--accent,#4c9aff);border-radius:5px;transition:width .12s linear;';
        track.appendChild(bar);
        var text = document.createElement('div');
        text.style.cssText = 'margin-top:8px;font-size:12px;color:var(--text-secondary,#a0a0a0);text-align:right;';
        text.textContent = '0%';
        body.appendChild(track);
        body.appendChild(text);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
        return { overlay: overlay, bar: bar, text: text };
    }
    function setCompressProgDlg(dlg, pct) {
        if (!dlg) return;
        dlg.bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
        dlg.text.textContent = Math.round(pct) + '%';
    }
    function closeCompressProgDlg(dlg) {
        if (!dlg || !dlg.overlay) return;
        var idx = _appDialogStack.indexOf(dlg.overlay);
        if (idx >= 0) _appDialogStack.splice(idx, 1);
        if (dlg.overlay.parentNode) dlg.overlay.parentNode.removeChild(dlg.overlay);
    }

    function doCompressSong(quality, model, reorder, lightenLayers, excludeLayers, pseudoSustain) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (notes.length < 2) {
            showAppAlert(i18nText('歌曲太短，无法压缩'), { title: '歌曲压缩' });
            return;
        }
        var tpb = compressResolveTicksPerBeat();
        var ctx = {
            ticksPerBeat: tpb,
            reorder: !!reorder,
            pseudoSustain: pseudoSustain === true,
            lightenLayers: lightenLayers || [],
            excludeLayers: excludeLayers || []
        };
        // 在副本上压缩: compressSongCore 会就地改写音符的 layer (每步删除后补洞上移)。
        // 若直接传入 state 中的音符对象, 撤销快照会在"已上移"之后采集, 导致撤销无法还原原始层位。
        var working = notes.map(function (n) {
            return {
                id: n.id, tick: n.tick, layer: n.layer, instrument: n.instrument,
                key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch
            };
        });
        function applyResult(res) {
            if (!res.removed || res.removed.length === 0) {
                showAppAlert(i18nText('未删除任何音符'), { title: '歌曲压缩' });
                return;
            }
            pushUndo(); // 压缩全程仅一次快照; 此时 state 仍为压缩前的原始状态
            state.pianoRoll.setNotes(res.kept);
            state.notes = res.kept;
            buildNoteIndex(state.notes);
            updateProgressUI();
            updateNoteCount();
            state.pianoRoll.render();
            if (typeof renderTrackPanel === 'function') renderTrackPanel();
            var msg = '删除 ' + res.removed.length + ' 个音符，保留 ' + res.kept.length + ' 个。';
            if (res.moved > 0) msg += '压缩后上移填补了 ' + res.moved + ' 个音符。';
            // v6.0 存在感引擎: 追加审计摘要 (遵循现有硬编码中文风格)
            var pact = res && res.audit && res.audit.mode;
            if (pact && pact.model === 'presence') {
                var rbf = res.audit.rescued_by_fix || {};
                var ps = res.audit.pseudo_sustain || {};
                var parts = [];
                if (rbf.transient_rescued > 0) parts.push('瞬态保护救回 ' + rbf.transient_rescued + ' 个');
                if (rbf.unmask_rescued > 0) parts.push('解掩蔽救回 ' + rbf.unmask_rescued + ' 个');
                if (ps.merged > 0) parts.push('合并伪延音 ' + ps.merged + ' 组');
                if (parts.length) msg += '\n[' + i18nText('存在感引擎（物理）') + '] ' + parts.join('，') + '。';
            }
            showAppAlert(msg, { title: '歌曲压缩' });
        }
        if (window.CompressEst) {
            // Web Worker 后台执行: UI 零卡顿, 弹窗内显示进度条
            var estCfg = {
                src: working, ticksPerBeat: tpb, reorder: !!reorder,
                pseudoSustain: pseudoSustain === true,
                lighten: lightenLayers || [], exclude: excludeLayers || []
            };
            var progDlg = null;
            window.CompressEst.compress(estCfg, quality, model, function (pct) {
                if (pct >= 100 && !progDlg) return;   // 瞬时完成(缓存复用), 不弹空窗
                if (!progDlg) progDlg = openCompressProgDlg();
                setCompressProgDlg(progDlg, pct);
            }).then(function (res) {
                closeCompressProgDlg(progDlg);
                applyResult(res);
            }, function (err) {
                closeCompressProgDlg(progDlg);
                // compress 已同步执行, reject 即 compressSongCore 真正抛错, 直接提示不重跑。
                showAppAlert(i18nText('压缩失败：') + String((err && err.message) || err), { title: '歌曲压缩' });
            });
        } else {
            // 无 CompressEst（旧构建产物）: 同步执行
            applyResult(window.compressSongCore(working, quality, model, ctx));
        }
    }

    function removeEmptyTracks() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var layers = state.song && state.song.layers ? state.song.layers : [];
        if (layers.length === 0) return;

        // 统计每个 layer 的音符数
        var layerNoteCount = {};
        for (var i = 0; i < notes.length; i++) {
            var lyr = notes[i].layer;
            layerNoteCount[lyr] = (layerNoteCount[lyr] || 0) + 1;
        }

        // Keep at least one layer: an empty song still needs an editable track.
        var nonEmptyLayers = [];
        for (var l = 0; l < layers.length; l++) {
            if (layerNoteCount[l]) nonEmptyLayers.push(l);
        }
        if (nonEmptyLayers.length === 0) nonEmptyLayers.push(0);

        var removedCount = layers.length - nonEmptyLayers.length;
        if (removedCount === 0) {
            showAppAlert('没有空轨可清除', {title: '清除空轨'});
            return;
        }

        showAppConfirm('将删除 ' + removedCount + ' 个空轨 (从 ' + layers.length + ' 减到 ' + nonEmptyLayers.length + ')，是否继续？', {title: '清除空轨', icon: 'fa-solid fa-broom'}).then(function(ok) {
            if (!ok) return;

            pushUndo(); // 在修改前记录快照, 保证可撤销

            // 重新映射所有音符的 layer 索引 (压缩到新序号)
            var layerMap = {};
            for (var nl = 0; nl < nonEmptyLayers.length; nl++) {
                layerMap[nonEmptyLayers[nl]] = nl;
            }
            for (var n = 0; n < notes.length; n++) {
                notes[n].layer = layerMap[notes[n].layer];
            }

            // 重排 layers 数组
            var newLayers = [];
            for (var k = 0; k < nonEmptyLayers.length; k++) {
                newLayers.push(layers[nonEmptyLayers[k]]);
            }
            if (state.song) state.song.layers = newLayers;

            // 同步到 piano roll
            state.pianoRoll.setNotes(notes);
            state.pianoRoll.trackCount = newLayers.length;
            state.notes = notes;
            buildNoteIndex(state.notes);
            updateProgressUI();
            updateNoteCount();
            state.pianoRoll.render();

            // 更新轨道面板
            if (typeof renderTrackPanel === 'function') renderTrackPanel();
        });
    }

    // ============ 延音填充 ============
    // 用户先框选多个音符, 然后点击"延音填充"
    // 弹窗让用户选择"间隔"参数 (在原音符之间插入多少个空位)
    // 同一行内从选中区间的开始 tick 开始, 按顺序用 "上一个音符的音调和音色" 填充
    // 结尾的最后一个音符会延长 4 个 tick 位置
    function showSustainFillDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length < 2) {
            // 没有选够多音符, 提示
            showSustainFillAlert('请先在钢琴卷帘上选择至少 2 个音符再使用延音填充。\n\n使用方法:\n1. 框选一段范围的音符\n2. 点击"延音填充"\n3. 选择间隔参数');
            return;
        }
        if (selected.length === 1) {
            showSustainFillAlert('请选择多个音符 (至少 2 个)。\n\n当前只选中了 1 个音符。');
            return;
        }

        // 移除已有弹窗
        var existing = $('sustain-fill-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="sustain-fill-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-wave-square"></i>'
            + '<h4>延音填充</h4>'
            + '<button class="settings-close-btn" id="sustain-fill-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>按行处理选中的多个音符，在每行中从选择区间的开始点往后填充。'
            + '填充的音符使用<b>上一个</b>原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '例子 (1XXX2X3XXXXX1XX6):<br>'
            + '• 间隔 0：<b>1111223333331116XXXX</b> (无空位)<br>'
            + '• 间隔 1：<b>111X2X33333X11X666</b> (1 个空位)<br>'
            + '• 间隔 2：<b>11XX2X3333XX1XX66</b> (2 个空位)'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">间隔 (空位数量)：</label>'
            + '<input type="number" id="sustain-fill-interval" min="0" max="16" value="0" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">0 = 紧贴无空位；推荐 1-3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="sustain-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="sustain-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('sustain-fill-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#sustain-fill-close-x').addEventListener('click', close);
        wrapper.querySelector('#sustain-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#sustain-ok-btn').addEventListener('click', function() {
            var interval = parseInt(wrapper.querySelector('#sustain-fill-interval').value);
            if (isNaN(interval) || interval < 0) interval = 0;
            if (interval > 16) interval = 16;
            applySustainFill(interval);
            close();
        });

        // 点击遮罩关闭
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    // ---- 导出 ----
    N.showCompressSongDialog = showCompressSongDialog;
    N.openCompressProgDlg = openCompressProgDlg;
    N.setCompressProgDlg = setCompressProgDlg;
    N.closeCompressProgDlg = closeCompressProgDlg;
    N.doCompressSong = doCompressSong;
    N.removeEmptyTracks = removeEmptyTracks;
    N.showSustainFillDialog = showSustainFillDialog;
})(window.WebNBS);
