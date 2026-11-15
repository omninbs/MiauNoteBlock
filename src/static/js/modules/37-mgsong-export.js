/* 37-mgsong-export.js — MusicGroove 曲谱 (.mgsong) 导出
   规范: formatVersion 1, ZIP 容器 = mgsong.json + 可选 bgm.ogg (Ogg Vorbis)
   依赖: state (00-core), 弹窗骨架 (01-dialogs), JSZip, AudioEngine, Ogg WASM 编码器 (vendor) */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    var state = N.state;

    function i18nText() { return N.i18nText.apply(this, arguments); }
    function showToast() { return N.showToast.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function safeFileName() { return N.safeFileName.apply(this, arguments); }
    function dlBlob() { return N.dlBlob.apply(this, arguments); }
    function startPlaybackLoop() { return N.startPlaybackLoop.apply(this, arguments); }
    function stopPlaybackLoop() { return N.stopPlaybackLoop.apply(this, arguments); }
    function setPlayButtonIcon() { return N.setPlayButtonIcon.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }

    // ============ 格式常量 ============
    // 按 NBS instrument ID (0-15) 排列, 不是 Minecraft 枚举字母序
    var MG_INSTRUMENTS = [
        'harp', 'bass', 'snare', 'hat', 'basedrum', 'guitar', 'flute', 'bell',
        'chime', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit',
        'banjo', 'pling'
    ];
    var MG_KEY_MIN = 33;
    var MG_KEY_MAX = 57;
    var MG_TPS_MAX = 1000;
    var MG_FORMAT_VERSION = 1;

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function num(v, def) {
        var n = parseFloat(v);
        return isFinite(n) ? n : def;
    }
    function fmtSec(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        var m = Math.floor(sec / 60);
        var s = sec - m * 60;
        return (m > 0 ? (m + ':' + (s < 10 ? '0' : '')) : '') + s.toFixed(s >= 100 ? 0 : 2) + (m > 0 ? '' : 's');
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ============ 音轨收集 ============
    function collectLayersWithNotes() {
        var byLayer = {};
        var notes = state.notes || [];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var ly = n.layer | 0;
            if (!byLayer[ly]) byLayer[ly] = { layer: ly, count: 0, name: '', instrument: n.instrument };
            byLayer[ly].count++;
        }
        var tracks = state.tracks || [];
        var nameByLayer = {};
        for (var t = 0; t < tracks.length; t++) nameByLayer[tracks[t].layer] = tracks[t].name;
        var songLayers = (state.song && state.song.layers) || [];
        var out = [];
        for (var k in byLayer) {
            if (!Object.prototype.hasOwnProperty.call(byLayer, k)) continue;
            var rec = byLayer[k];
            var savedName = (songLayers[rec.layer] && songLayers[rec.layer].name) || '';
            rec.name = nameByLayer[rec.layer] || savedName || ('Layer ' + (rec.layer + 1));
            out.push(rec);
        }
        out.sort(function (a, b) { return a.layer - b.layer; });
        return out;
    }

    function layerNotes(layer) {
        var out = [];
        var notes = state.notes || [];
        for (var i = 0; i < notes.length; i++) {
            if ((notes[i].layer | 0) === layer) out.push(notes[i]);
        }
        out.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return (a.key | 0) - (b.key | 0);
        });
        return out;
    }

    // ============ 拍点/BPM 检测 ============
    // NBS 内部只有单一 tempo(ticks/s), 这里按 onset 网格估算每拍 tick 数。
    // 说明: 仅作为推荐参考, 用户可手改 BPM 与 tps。
    function detectBeat(notes, tempo) {
        tempo = num(tempo, 20);
        var onsets = [];
        var seen = {};
        for (var i = 0; i < notes.length; i++) {
            var tk = notes[i].tick | 0;
            if (!seen[tk]) { seen[tk] = true; onsets.push(tk); }
        }
        onsets.sort(function (a, b) { return a - b; });

        function gcd(a, b) { while (b) { var r = a % b; a = b; b = r; } return Math.abs(a); }

        var diffs = [];
        for (var j = 1; j < onsets.length; j++) {
            var d = onsets[j] - onsets[j - 1];
            if (d > 0 && d <= 64) diffs.push(d);
        }
        if (!diffs.length) {
            return { bpm: tempo * 60, ticksPerBeat: 1, confidence: 0, onsetCount: onsets.length };
        }
        var g = 0;
        for (var k = 0; k < diffs.length; k++) g = gcd(g, diffs[k]);
        if (!g) g = 1;
        // 网格过大时退化为 1 tick 单位, 避免把长音间隔当拍
        var ticksPerBeat = g > 32 ? 1 : g;

        // 置信度: 最常见起始间隔的出现比例
        var freq = {};
        var best = 0;
        for (var m = 0; m < diffs.length; m++) {
            freq[diffs[m]] = (freq[diffs[m]] || 0) + 1;
            if (freq[diffs[m]] > best) best = freq[diffs[m]];
        }
        var confidence = diffs.length ? best / diffs.length : 0;
        return {
            bpm: tempo * 60 / ticksPerBeat,
            ticksPerBeat: ticksPerBeat,
            confidence: confidence,
            onsetCount: onsets.length
        };
    }

    // ============ 校验 / 重采样 ============
    // fixMode: 'none' | 'high'(同 tick 保留最高音) | 'low'(保留最低音)
    function buildMgsongNotes(layer, tps, tempo, fixMode) {
        var src = layerNotes(layer);
        var errors = [];
        var warnings = [];
        var collisions = [];
        var resampled = 0;
        var sameTick = Math.abs(num(tps, 0) - num(tempo, 1)) < 1e-9;

        // 1) 逐音符校验 (原始坐标)
        var valid = [];
        for (var i = 0; i < src.length; i++) {
            var n = src[i];
            var tk = n.tick | 0;
            var inst = n.instrument | 0;
            var key = n.key | 0;
            if (!isFinite(tk) || tk < 0) {
                errors.push({ type: 'tick', tick: tk, message: i18nText('tick 不能为负数') });
                continue;
            }
            if (inst < 0 || inst > 15) {
                errors.push({
                    type: 'instrument', tick: tk,
                    message: i18nText('音色') + ' ' + inst + ' ' + i18nText('不受支持（仅支持 0–15 号 Minecraft 音色）')
                });
                continue;
            }
            if (key < MG_KEY_MIN || key > MG_KEY_MAX) {
                errors.push({
                    type: 'key', tick: tk,
                    message: i18nText('音高 key') + ' ' + key + ' ' + i18nText('超出 Minecraft 音符盒音域 (33–57)')
                });
                continue;
            }
            valid.push({ tick: tk, inst: inst, key: key });
        }

        // 2) 重采样: 恒定 tempo 下 newTick = round(tick * tps / tempo)
        var scaled = [];
        for (var j = 0; j < valid.length; j++) {
            var v = valid[j];
            var nt = v.tick;
            if (!sameTick) {
                nt = Math.round(v.tick * tps / tempo);
                resampled++;
            }
            scaled.push({ tick: nt, inst: v.inst, key: v.key, srcTick: v.tick });
        }
        scaled.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.key - b.key;
        });

        // 3) 和弦检测 / 修复
        var out = [];
        var idx = 0;
        while (idx < scaled.length) {
            var tick = scaled[idx].tick;
            var group = [];
            while (idx < scaled.length && scaled[idx].tick === tick) {
                group.push(scaled[idx]);
                idx++;
            }
            if (group.length > 1) {
                collisions.push(tick);
                if (fixMode === 'high' || fixMode === 'low') {
                    var pick = group[0];
                    for (var g = 1; g < group.length; g++) {
                        if (fixMode === 'high' ? group[g].key > pick.key : group[g].key < pick.key) pick = group[g];
                    }
                    out.push({ tick: tick, inst: pick.inst, note: pick.key - MG_KEY_MIN });
                } else {
                    errors.push({
                        type: 'chord', tick: tick,
                        message: i18nText('tick') + ' ' + tick + ' ' + i18nText('存在多个音符，MusicGroove 曲谱不允许和弦')
                    });
                }
            } else {
                out.push({ tick: tick, inst: group[0].inst, note: group[0].key - MG_KEY_MIN });
            }
        }

        if (resampled > 0) {
            warnings.push(i18nText('已按 tps 重新量化，共') + ' ' + resampled + ' ' + i18nText('个音符参与换算'));
        }
        return {
            notes: out,
            errors: errors,
            warnings: warnings,
            collisions: collisions,
            resampled: resampled,
            sameTick: sameTick
        };
    }

    function buildManifest(opts) {
        var manifest = {
            formatVersion: MG_FORMAT_VERSION,
            title: opts.title || '',
            artist: opts.artist || '',
            charter: opts.charter || '',
            tps: opts.tps,
            notes: opts.notes.map(function (n) {
                return { tick: n.tick, inst: MG_INSTRUMENTS[n.inst], note: n.note };
            })
        };
        if (opts.bgm) {
            manifest.bgm = {
                file: 'bgm.ogg',
                offsetMs: Math.round(opts.bgm.offsetMs || 0),
                gain: clamp(num(opts.bgm.gain, 1), 0, 2)
            };
        }
        return manifest;
    }

    // ============ Ogg Vorbis 编码器 (WASM) ============
    function loadScriptOnce(src) {
        return new Promise(function (resolve, reject) {
            var abs = src;
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].getAttribute('src') === abs) { resolve(); return; }
            }
            var s = document.createElement('script');
            s.src = abs;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error(i18nText('无法加载 Ogg 编码器资源') + ': ' + abs)); };
            document.head.appendChild(s);
        });
    }

    function base64ToBytes(b64) {
        var bin = atob(b64);
        var len = bin.length;
        var out = new Uint8Array(len);
        for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function ensureOggEncoder() {
        if (window.WasmMediaEncoder && window.WASM_OGG_BASE64) return Promise.resolve();
        return Promise.all([
            window.WASM_OGG_BASE64 ? null : loadScriptOnce('static/vendor/ogg_wasm_b64.js'),
            window.WasmMediaEncoder ? null : loadScriptOnce('static/vendor/WasmMediaEncoder.min.js')
        ]).then(function () {
            if (!window.WasmMediaEncoder || !window.WASM_OGG_BASE64) {
                throw new Error(i18nText('Ogg 编码器资源未就绪'));
            }
        });
    }

    // 把 AudioBuffer 的 [startSec, endSec) 编码为 Ogg Vorbis Blob
    function encodeOggBuffer(buffer, startSec, endSec, onProgress) {
        return ensureOggEncoder().then(function () {
            var sr = buffer.sampleRate;
            var ch = Math.min(2, buffer.numberOfChannels);
            var s = clamp(Math.floor(startSec * sr), 0, buffer.length);
            var e = clamp(Math.ceil(endSec * sr), s + 1, buffer.length);
            var total = e - s;
            var channels = [];
            for (var c = 0; c < ch; c++) channels.push(buffer.getChannelData(c));

            return window.WasmMediaEncoder.createEncoder('audio/ogg', base64ToBytes(window.WASM_OGG_BASE64))
                .then(function (enc) {
                    enc.configure({ channels: ch, sampleRate: Math.round(sr), vbrQuality: 4 });
                    return new Promise(function (resolve, reject) {
                        var chunks = [];
                        var pos = s;
                        var guard = 0;
                        function step() {
                            try {
                                var loops = 0;
                                while (pos < e && loops < 48) {
                                    var n = Math.min(4096, e - pos);
                                    var bufs = [];
                                    for (var k = 0; k < ch; k++) bufs.push(channels[k].subarray(pos, pos + n));
                                    var piece = enc.encode(bufs);
                                    chunks.push(new Uint8Array(piece));
                                    pos += n;
                                    loops++;
                                }
                                if (onProgress) onProgress((pos - s) / total);
                                if (pos < e) {
                                    setTimeout(step, 0);
                                } else {
                                    chunks.push(new Uint8Array(enc.finalize()));
                                    resolve(new Blob(chunks, { type: 'audio/ogg' }));
                                }
                            } catch (err) {
                                reject(err);
                            }
                            if (++guard > 1000000) reject(new Error(i18nText('编码超时')));
                        }
                        step();
                    });
                });
        });
    }

    function sliceAudioBuffer(ctx, buffer, startSec, endSec) {
        var sr = buffer.sampleRate;
        var s = clamp(Math.floor(startSec * sr), 0, buffer.length);
        var e = clamp(Math.ceil(endSec * sr), s + 1, buffer.length);
        var len = e - s;
        var ch = Math.min(2, buffer.numberOfChannels);
        var out = ctx.createBuffer(ch, len, sr);
        for (var c = 0; c < ch; c++) {
            out.copyToChannel(buffer.getChannelData(c).subarray(s, e), c);
        }
        return out;
    }

    // ============ 导出流程 ============
    function exportMgsong(opts) {
        // opts: { title, artist, charter, layer, tps, notes, bgm: {buffer, startMs, endMs, gain, offsetMs, originalBytes} | null }
        if (!window.JSZip) {
            return Promise.reject(new Error(i18nText('ZIP 打包库未加载，请刷新页面重试')));
        }
        var tps = num(opts.tps, 0);
        if (!(tps > 0 && tps <= MG_TPS_MAX)) {
            return Promise.reject(new Error(i18nText('曲谱速度 tps 必须满足 0 < tps <= 1000')));
        }
        var bgm = opts.bgm || null;
        var bgmPromise = Promise.resolve(null);
        if (bgm && bgm.buffer) {
            var durationMs = bgm.buffer.duration * 1000;
            var startMs = clamp(num(bgm.startMs, 0), 0, durationMs);
            var endMs = clamp(num(bgm.endMs, durationMs), startMs + 1, durationMs);
            var untouched = startMs <= 0.5 && endMs >= durationMs - 0.5;
            if (untouched && bgm.originalBytes) {
                // 未裁剪且源文件就是 Ogg: 直接打包原始字节, 避免二次有损编码
                bgmPromise = Promise.resolve(new Blob([bgm.originalBytes], { type: 'audio/ogg' }));
            } else {
                bgmPromise = encodeOggBuffer(bgm.buffer, startMs / 1000, endMs / 1000, bgm.onProgress);
            }
        }

        var manifest = buildManifest({
            title: opts.title,
            artist: opts.artist,
            charter: opts.charter,
            tps: tps,
            notes: opts.notes,
            bgm: bgm && bgm.include !== false ? {
                offsetMs: bgm.offsetMs,
                gain: bgm.gain
            } : null
        });

        return bgmPromise.then(function (bgmBlob) {
            var zip = new JSZip();
            zip.file('mgsong.json', JSON.stringify(manifest, null, 2));
            if (bgmBlob) zip.file('bgm.ogg', bgmBlob);
            return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }).then(function (blob) {
                var fname = safeFileName(opts.title || 'Untitled') + '.mgsong';
                dlBlob(blob, fname);
                return { blob: blob, filename: fname, manifest: manifest, bgmIncluded: !!bgmBlob };
            });
        });
    }

    // ============ 弹窗 ============
    function showMgsongExportDialog() {
        var layers = collectLayersWithNotes();
        if (!layers.length) {
            showAppAlert(i18nText('当前没有可导出的音符，请先编写谱面。'), {
                title: i18nText('导出 MusicGroove 曲谱'),
                icon: 'fa-solid fa-triangle-exclamation'
            });
            return;
        }
        var t = i18nText;
        var overlay = _appDialogOverlay();
        var box = _appDialogBox(t('导出 MusicGroove 曲谱'), '', 'fa-solid fa-compact-disc', { maxWidth: 760 });
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        body.style.whiteSpace = 'normal';
        body.style.maxHeight = '72vh';
        body.style.overflowY = 'auto';

        // 编辑器没有「激活音轨」状态, 默认选中第一个非空音轨
        var activeLayer = layers[0].layer;

        var defaultTitle = safeFileName(state.importedFileName || (state.song && (state.song.name || state.song.song_name)) || 'Untitled');
        var tempo = num(state.tempo, 20);
        var ui = {
            layer: activeLayer,
            tps: tempo,
            fixMode: 'none',
            bpm: tempo * 60,
            precision: 1,
            bgm: null,
            bgmInclude: false,
            bgmBuffer: null,
            bgmBytes: null,
            bgmName: '',
            startMs: 0,
            endMs: 0,
            viewStart: 0,
            viewEnd: 0,
            gain: 1,
            offsetMs: 0,
            bgmPlaying: false,
            previewing: false,
            previewTimer: null,
            savedTracks: null,
            selectionSrc: null,
            selectionGain: null,
            previewSrc: null,
            previewGain: null
        };

        // ---- 通用样式 ----
        var ROW = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;';
        var LABEL = 'font-size:12px;color:var(--text-secondary,#aaa);min-width:88px;flex-shrink:0;';
        var INPUT = 'padding:6px 8px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
        var HINT = 'font-size:11px;color:var(--text-tertiary,#888);line-height:1.5;';
        var SMALLBTN = 'padding:4px 10px;font-size:11px;border:1px solid var(--ctrl-stroke-default,#555);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-secondary,#aaa);cursor:pointer;white-space:nowrap;';
        var ACCENTBTN = 'padding:4px 10px;font-size:11px;border:1px solid var(--accent-primary,#4aa3ff);border-radius:var(--radius-sm,6px);background:rgba(74,163,255,0.12);color:var(--accent-primary,#4aa3ff);cursor:pointer;white-space:nowrap;';
        var CARD = 'margin-top:10px;padding:10px 12px;border:1px solid var(--ctrl-stroke-default,#3a3a3a);border-radius:8px;background:rgba(255,255,255,0.02);';

        function section(title, icon) {
            var wrap = document.createElement('div');
            wrap.style.cssText = CARD;
            var h = document.createElement('div');
            h.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--text-primary,#fff);margin-bottom:2px;';
            h.innerHTML = '<i class="' + (icon || 'fa-solid fa-circle') + '" style="opacity:.7;font-size:11px;"></i><span></span>';
            h.querySelector('span').textContent = title;
            wrap.appendChild(h);
            body.appendChild(wrap);
            return wrap;
        }

        function row(parent) {
            var r = document.createElement('div');
            r.style.cssText = ROW;
            parent.appendChild(r);
            return r;
        }

        // ---- 文件名 ----
        var nameRow = row(body);
        var nameLab = document.createElement('span');
        nameLab.style.cssText = LABEL;
        nameLab.textContent = t('文件名');
        nameRow.appendChild(nameLab);
        var nameInput = document.createElement('input');
        nameInput.id = 'mgson-name';
        nameInput.type = 'text';
        nameInput.value = defaultTitle;
        nameInput.style.cssText = INPUT + 'flex:1;min-width:180px;';
        nameRow.appendChild(nameInput);

        // ---- 音轨选择 ----
        var layerCard = section(t('音轨选择'), 'fa-solid fa-layer-group');
        var layerRow = row(layerCard);
        var layerLab = document.createElement('span');
        layerLab.style.cssText = LABEL;
        layerLab.textContent = t('音轨');
        layerRow.appendChild(layerLab);
        var layerSel = document.createElement('select');
        layerSel.id = 'mgson-layer';
        layerSel.style.cssText = INPUT + 'flex:1;min-width:200px;';
        layers.forEach(function (l) {
            var o = document.createElement('option');
            o.value = String(l.layer);
            o.textContent = l.name + '  (layer ' + l.layer + ', ' + l.count + ' ' + t('音符') + ')';
            if (l.layer === ui.layer) o.selected = true;
            layerSel.appendChild(o);
        });
        if (layers.length === 1) layerSel.disabled = true;
        layerRow.appendChild(layerSel);
        var layerHint = document.createElement('div');
        layerHint.style.cssText = HINT + 'margin-top:6px;';
        layerHint.textContent = t('MusicGroove 曲谱为单音轨格式，只导出所选音轨。');
        layerCard.appendChild(layerHint);

        // ---- 速度 / BPM ----
        var tpsCard = section(t('曲谱速度'), 'fa-solid fa-gauge-high');
        var tpsRow = row(tpsCard);
        var tpsLab = document.createElement('span');
        tpsLab.style.cssText = LABEL;
        tpsLab.textContent = 'tps';
        tpsRow.appendChild(tpsLab);
        var tpsInput = document.createElement('input');
        tpsInput.id = 'mgson-tps';
        tpsInput.type = 'number';
        tpsInput.step = '0.001';
        tpsInput.min = '0.001';
        tpsInput.max = '1000';
        tpsInput.value = String(ui.tps);
        tpsInput.style.cssText = INPUT + 'width:120px;';
        tpsRow.appendChild(tpsInput);
        var tpsMs = document.createElement('span');
        tpsMs.style.cssText = HINT;
        tpsRow.appendChild(tpsMs);
        var applyTpsBtn = document.createElement('button');
        applyTpsBtn.type = 'button';
        applyTpsBtn.style.cssText = ACCENTBTN;
        applyTpsBtn.textContent = t('应用 BPM 推荐');
        tpsRow.appendChild(applyTpsBtn);

        // 精度倍数: MIDI 导入会按精度把 tick 加密 (1x/2x/4x/8x), 推荐 tps 需同比放大
        var precWrap = document.createElement('div');
        precWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
        var precLab = document.createElement('span');
        precLab.style.cssText = HINT;
        precLab.textContent = t('精度');
        precWrap.appendChild(precLab);
        var precSel = document.createElement('select');
        precSel.id = 'mgson-precision';
        precSel.style.cssText = INPUT + 'width:72px;padding:4px 6px;font-size:12px;';
        var precOptions = [
            { v: '1', label: '1x' },
            { v: '2', label: '2x' },
            { v: '4', label: '4x' },
            { v: '8', label: '8x' }
        ];
        for (var pi = 0; pi < precOptions.length; pi++) {
            var po = document.createElement('option');
            po.value = precOptions[pi].v;
            po.textContent = precOptions[pi].label;
            precSel.appendChild(po);
        }
        precSel.value = '1';
        precWrap.appendChild(precSel);
        tpsRow.appendChild(precWrap);

        var bpmRow = row(tpsCard);
        var bpmLab = document.createElement('span');
        bpmLab.style.cssText = LABEL;
        bpmLab.textContent = 'BPM';
        bpmRow.appendChild(bpmLab);
        var bpmInput = document.createElement('input');
        bpmInput.id = 'mgson-bpm';
        bpmInput.type = 'number';
        bpmInput.step = '0.1';
        bpmInput.min = '1';
        bpmInput.style.cssText = INPUT + 'width:100px;';
        bpmRow.appendChild(bpmInput);
        var bpmHint = document.createElement('span');
        bpmHint.style.cssText = HINT;
        bpmRow.appendChild(bpmHint);
        var tpsHint = document.createElement('div');
        tpsHint.style.cssText = HINT + 'margin-top:6px;';
        tpsHint.textContent = t('原谱 tempo (ticks/s) 为') + ' ' + tempo + '；' + t('用它作为 tps 可保持 tick 不变，不做重采样。');
        tpsCard.appendChild(tpsHint);

        // ---- BGM ----
        var bgmCard = section(t('背景音乐（可选）'), 'fa-solid fa-music');
        var bgmRow = row(bgmCard);
        var bgmBtn = document.createElement('button');
        bgmBtn.type = 'button';
        bgmBtn.style.cssText = SMALLBTN;
        bgmBtn.textContent = t('选择 Ogg 文件…');
        bgmRow.appendChild(bgmBtn);
        var bgmNameEl = document.createElement('span');
        bgmNameEl.style.cssText = HINT;
        bgmNameEl.textContent = t('未选择');
        bgmRow.appendChild(bgmNameEl);
        var bgmClear = document.createElement('button');
        bgmClear.type = 'button';
        bgmClear.style.cssText = SMALLBTN;
        bgmClear.textContent = t('清除');
        bgmClear.style.display = 'none';
        bgmRow.appendChild(bgmClear);
        var bgmFileInput = document.createElement('input');
        bgmFileInput.id = 'mgson-bgm-file';
        bgmFileInput.type = 'file';
        bgmFileInput.accept = '.ogg,audio/ogg';
        bgmFileInput.style.display = 'none';
        bgmCard.appendChild(bgmFileInput);

        var bgmOptRow = row(bgmCard);
        var bgmChkLabel = document.createElement('label');
        bgmChkLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary,#fff);cursor:pointer;';
        var bgmChk = document.createElement('input');
        bgmChk.type = 'checkbox';
        bgmChk.disabled = true;
        bgmChkLabel.appendChild(bgmChk);
        var bgmChkText = document.createElement('span');
        bgmChkText.textContent = t('导出时包含背景音乐');
        bgmChkLabel.appendChild(bgmChkText);
        bgmOptRow.appendChild(bgmChkLabel);

        var gainWrap = document.createElement('div');
        gainWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;';
        var gainLab = document.createElement('span');
        gainLab.style.cssText = HINT;
        gainLab.textContent = t('增益');
        gainWrap.appendChild(gainLab);
        var gainInput = document.createElement('input');
        gainInput.type = 'range';
        gainInput.min = '0';
        gainInput.max = '2';
        gainInput.step = '0.01';
        gainInput.value = '1';
        gainInput.style.cssText = 'width:110px;accent-color:var(--accent-primary,#4aa3ff);';
        gainWrap.appendChild(gainInput);
        var gainVal = document.createElement('span');
        gainVal.style.cssText = HINT + 'min-width:34px;';
        gainVal.textContent = '1.00';
        gainWrap.appendChild(gainVal);
        bgmOptRow.appendChild(gainWrap);

        // 波形 + 裁剪
        var waveWrap = document.createElement('div');
        waveWrap.style.cssText = 'margin-top:8px;display:none;';
        var waveToolRow = document.createElement('div');
        waveToolRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
        var zoomOutBtn = document.createElement('button');
        zoomOutBtn.type = 'button';
        zoomOutBtn.style.cssText = SMALLBTN;
        zoomOutBtn.textContent = '−';
        zoomOutBtn.title = t('缩小波形');
        waveToolRow.appendChild(zoomOutBtn);
        var zoomInBtn = document.createElement('button');
        zoomInBtn.type = 'button';
        zoomInBtn.style.cssText = SMALLBTN;
        zoomInBtn.textContent = '+';
        zoomInBtn.title = t('放大波形');
        waveToolRow.appendChild(zoomInBtn);
        var zoomFitBtn = document.createElement('button');
        zoomFitBtn.type = 'button';
        zoomFitBtn.style.cssText = SMALLBTN;
        zoomFitBtn.textContent = t('适配整段');
        zoomFitBtn.title = t('显示完整波形');
        waveToolRow.appendChild(zoomFitBtn);
        var zoomInfo = document.createElement('span');
        zoomInfo.style.cssText = HINT + 'margin-left:auto;';
        waveToolRow.appendChild(zoomInfo);
        waveWrap.appendChild(waveToolRow);
        var waveCanvas = document.createElement('canvas');
        waveCanvas.style.cssText = 'display:block;width:100%;height:118px;border:1px solid var(--ctrl-stroke-default,#3a3a3a);border-radius:6px;background:rgba(0,0,0,0.35);cursor:ew-resize;touch-action:none;';
        waveWrap.appendChild(waveCanvas);
        // 波形横向平移滑块: 窗口块表示当前可见范围
        var waveScroll = document.createElement('div');
        waveScroll.id = 'mgson-wave-scroll';
        waveScroll.style.cssText = 'position:relative;height:12px;margin-top:6px;border-radius:6px;background:rgba(255,255,255,0.08);cursor:pointer;touch-action:none;';
        var waveScrollWin = document.createElement('div');
        waveScrollWin.id = 'mgson-wave-window';
        waveScrollWin.style.cssText = 'position:absolute;top:0;height:100%;border-radius:6px;background:rgba(74,163,255,0.45);border:1px solid rgba(74,163,255,0.9);box-sizing:border-box;cursor:grab;';
        waveScroll.appendChild(waveScrollWin);
        waveWrap.appendChild(waveScroll);
        var trimRow = row(waveWrap);
        function trimField(label, value, id) {
            var l = document.createElement('span');
            l.style.cssText = HINT;
            l.textContent = label;
            trimRow.appendChild(l);
            var inp = document.createElement('input');
            inp.id = id;
            inp.type = 'number';
            inp.step = '1';
            inp.min = '0';
            inp.style.cssText = INPUT + 'width:92px;';
            inp.value = String(value);
            trimRow.appendChild(inp);
            return inp;
        }
        var startInput = trimField(t('起点 ms'), 0, 'mgson-start');
        var endInput = trimField(t('终点 ms'), 0, 'mgson-end');
        var playSelBtn = document.createElement('button');
        playSelBtn.id = 'mgson-play-selection';
        playSelBtn.type = 'button';
        playSelBtn.style.cssText = SMALLBTN;
        playSelBtn.textContent = t('播放选区');
        trimRow.appendChild(playSelBtn);
        var trimInfo = document.createElement('span');
        trimInfo.style.cssText = HINT + 'margin-left:auto;';
        trimRow.appendChild(trimInfo);
        bgmCard.appendChild(waveWrap);

        // 试听对齐
        var alignRow = row(bgmCard);
        var alignLab = document.createElement('span');
        alignLab.style.cssText = HINT;
        alignLab.textContent = t('谱面起拍延迟 (offsetMs)');
        alignRow.appendChild(alignLab);
        var offsetInput = document.createElement('input');
        offsetInput.id = 'mgson-offset';
        offsetInput.type = 'number';
        offsetInput.step = '1';
        offsetInput.min = '0';
        offsetInput.value = '0';
        offsetInput.style.cssText = INPUT + 'width:90px;';
        alignRow.appendChild(offsetInput);
        var previewBtn = document.createElement('button');
        previewBtn.id = 'mgson-preview';
        previewBtn.type = 'button';
        previewBtn.style.cssText = SMALLBTN;
        previewBtn.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i>' + t('试听');
        alignRow.appendChild(previewBtn);
        var alignHint = document.createElement('div');
        alignHint.style.cssText = HINT + 'margin-top:6px;';
        alignHint.textContent = t('试听会同时播放所选音轨与裁剪后的背景音乐；tick 0 与音频起点对齐，offsetMs 只增加开演前的静音等待。');
        bgmCard.appendChild(alignHint);

        // ---- 校验结果 ----
        var errorCard = section(t('校验'), 'fa-solid fa-shield-halved');
        var errorBox = document.createElement('div');
        errorBox.style.cssText = 'font-size:12px;line-height:1.7;color:var(--text-secondary,#aaa);margin-top:4px;';
        errorCard.appendChild(errorBox);
        var fixRow = document.createElement('div');
        fixRow.style.cssText = 'display:none;gap:6px;margin-top:8px;';
        errorCard.appendChild(fixRow);
        var fixHigh = document.createElement('button');
        fixHigh.type = 'button';
        fixHigh.style.cssText = ACCENTBTN;
        fixHigh.textContent = t('自动保留最高音');
        fixRow.appendChild(fixHigh);
        var fixLow = document.createElement('button');
        fixLow.type = 'button';
        fixLow.style.cssText = ACCENTBTN;
        fixLow.textContent = t('自动保留最低音');
        fixRow.appendChild(fixLow);

        // ---- 摘要 ----
        var summaryCard = section(t('导出摘要'), 'fa-solid fa-clipboard-list');
        var summaryBox = document.createElement('div');
        summaryBox.style.cssText = 'font-size:12px;line-height:1.8;color:var(--text-secondary,#aaa);margin-top:4px;';
        summaryCard.appendChild(summaryBox);

        // ---- 底部 ----
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        N._appDialogStack.push(overlay);

        var closed = false;
        function cleanupPlayback() {
            stopSelectionPlayback();
            if (ui.previewing) stopPreview();
        }
        function close() {
            if (closed) return;
            closed = true;
            if (ui.previewTimer) { clearTimeout(ui.previewTimer); ui.previewTimer = null; }
            cleanupPlayback();
            _closeAppDialog(overlay, null, null);
        }
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var closeBtn = _appDialogBtn(t('关闭'), false);
        closeBtn.addEventListener('click', close);
        var exportBtn = _appDialogBtn(t('导出 .mgsong'), true);
        exportBtn.id = 'mgson-export';
        exportBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right:5px;"></i>' + t('导出 .mgsong');
        var actions = box.querySelector('.popup-actions');
        actions.appendChild(exportBtn);
        actions.appendChild(closeBtn);
        // 仅在遮罩上完整按下+松开时才关闭, 避免从弹窗内拖动(如滑块/波形)到遮罩上松手而误关
        var overlayPressed = false;
        overlay.addEventListener('mousedown', function (e) {
            overlayPressed = (e.target === overlay);
        });
        overlay.addEventListener('click', function (e) {
            var shouldClose = overlayPressed && e.target === overlay;
            overlayPressed = false;
            if (shouldClose) close();
        });

        // ============ 波形绘制与裁剪交互 ============
        var viewPeaks = null;
        var viewPeaksKey = '';
        var MIN_VIEW_MS = 20;

        function computePeaks(buffer, startSec, endSec, buckets) {
            var sr = buffer.sampleRate;
            var total = buffer.length;
            var fromAll = clamp(Math.floor(startSec * sr), 0, total);
            var toAll = clamp(Math.ceil(endSec * sr), fromAll + 1, total);
            var span = toAll - fromAll;
            var data = buffer.getChannelData(0);
            var step = Math.max(1, Math.floor(span / buckets));
            var peaks = [];
            for (var i = 0; i < buckets; i++) {
                var from = fromAll + i * step;
                if (from >= toAll) { peaks.push([0, 0]); continue; }
                var to = Math.min(toAll, from + step);
                var mn = 1, mx = -1;
                var stride = Math.max(1, Math.floor(step / 24));
                for (var j = from; j < to; j += stride) {
                    var val = data[j];
                    if (val < mn) mn = val;
                    if (val > mx) mx = val;
                }
                if (mn > mx) { mn = 0; mx = 0; }
                peaks.push([mn, mx]);
            }
            return peaks;
        }

        function viewSpanMs() {
            return Math.max(1, ui.viewEnd - ui.viewStart);
        }

        function fullDurMs() {
            return ui.bgmBuffer ? ui.bgmBuffer.duration * 1000 : 0;
        }

        function resetWaveView() {
            ui.viewStart = 0;
            ui.viewEnd = fullDurMs();
            viewPeaksKey = '';
        }

        // 以 centerMs 为中心缩放: factor < 1 放大, > 1 缩小
        function zoomWave(factor, centerMs) {
            var dur = fullDurMs();
            if (!(dur > 0)) return;
            var span = viewSpanMs();
            var newSpan = clamp(span * factor, MIN_VIEW_MS, dur);
            var center = isFinite(centerMs) ? centerMs : (ui.viewStart + span / 2);
            var ratio = (center - ui.viewStart) / span;
            var vs = center - newSpan * ratio;
            vs = clamp(vs, 0, dur - newSpan);
            ui.viewStart = vs;
            ui.viewEnd = vs + newSpan;
            viewPeaksKey = '';
            drawWave();
        }

        function updateZoomInfo() {
            var dur = fullDurMs();
            if (!(dur > 0)) { zoomInfo.textContent = ''; return; }
            var span = viewSpanMs();
            zoomInfo.textContent = (dur / span > 1.02 ? (dur / span).toFixed(1) + 'x · ' : '')
                + fmtSec(ui.viewStart / 1000) + ' – ' + fmtSec(ui.viewEnd / 1000);
        }

        // 平移滑块: 窗口块位置/宽度反映当前可见范围
        function syncScrollbar() {
            var dur = fullDurMs();
            if (!(dur > 0)) return;
            var span = viewSpanMs();
            waveScrollWin.style.left = (ui.viewStart / dur * 100) + '%';
            waveScrollWin.style.width = Math.max(1.5, span / dur * 100) + '%';
        }

        function drawWave() {
            if (!ui.bgmBuffer) return;
            if (!(ui.viewEnd > ui.viewStart)) resetWaveView();
            updateZoomInfo();
            syncScrollbar();
            var w = waveCanvas.clientWidth || 640;
            var h = 118;
            var dpr = window.devicePixelRatio || 1;
            if (waveCanvas.width !== Math.round(w * dpr) || waveCanvas.height !== Math.round(h * dpr)) {
                waveCanvas.width = Math.round(w * dpr);
                waveCanvas.height = Math.round(h * dpr);
            }
            var ctx = waveCanvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            var vs = ui.viewStart;
            var vSpan = viewSpanMs();
            var xOf = function (ms) { return (ms - vs) / vSpan * w; };
            var topH = 20;
            var waveTop = topH + 4;
            var waveH = h - waveTop - 4;
            var mid = waveTop + waveH / 2;

            // tick 网格 (上方时间轴): tick 0 位置 = offsetMs
            var pxPerMs = w / vSpan;
            var tickMs = 1000 / Math.max(0.0001, ui.tps);
            var tickPx = tickMs * pxPerMs;
            var skip = 1;
            while (tickPx * skip < 26) skip *= 2;
            var offsetPx = xOf(ui.offsetMs);
            ctx.strokeStyle = 'rgba(120,170,255,0.35)';
            ctx.fillStyle = 'rgba(150,190,255,0.75)';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 1;
            for (var tk = 0; ; tk += skip) {
                var x = offsetPx + tk * tickPx;
                if (x > w + 1) break;
                if (x < -1) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, topH);
                ctx.stroke();
                if (tk % (skip * 5) === 0) ctx.fillText(String(tk), x, 10);
            }
            // 音频起点标记
            var originX = xOf(0);
            if (originX >= -1 && originX <= w + 1) {
                ctx.strokeStyle = 'rgba(255,200,80,0.55)';
                ctx.beginPath();
                ctx.moveTo(originX, 0);
                ctx.lineTo(originX, h);
                ctx.stroke();
            }

            // 波形 (按当前视图范围重采样, 放大后仍有足够细节)
            var buckets = 900;
            var key = Math.round(vs) + ':' + Math.round(ui.viewEnd) + ':' + w;
            if (viewPeaksKey !== key || !viewPeaks) {
                viewPeaks = computePeaks(ui.bgmBuffer, vs / 1000, ui.viewEnd / 1000, buckets);
                viewPeaksKey = key;
            }
            var peaks = viewPeaks;
            var selA = ui.startMs;
            var selB = ui.endMs;
            var stepX = w / peaks.length;
            for (var i = 0; i < peaks.length; i++) {
                var ms = vs + (i + 0.5) / peaks.length * vSpan;
                var inside = ms >= selA && ms <= selB;
                ctx.fillStyle = inside ? 'rgba(120,210,255,0.95)' : 'rgba(120,160,190,0.5)';
                var y1 = mid - peaks[i][1] * (waveH / 2);
                var y2 = mid - peaks[i][0] * (waveH / 2);
                ctx.fillRect(i * stepX, y1, Math.max(1, stepX), Math.max(1, y2 - y1));
            }

            // 选区边界 (裁剪到视图内)
            var xa = clamp(xOf(selA), 0, w);
            var xb = clamp(xOf(selB), 0, w);
            ctx.fillStyle = 'rgba(74,163,255,0.10)';
            ctx.fillRect(xa, waveTop, Math.max(1, xb - xa), waveH);
            var handles = [];
            if (selA >= vs && selA <= ui.viewEnd) handles.push(xOf(selA));
            if (selB >= vs && selB <= ui.viewEnd) handles.push(xOf(selB));
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            for (var hi = 0; hi < handles.length; hi++) {
                var hx = handles[hi];
                ctx.beginPath();
                ctx.moveTo(hx, 0);
                ctx.lineTo(hx, h);
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(hx, mid, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 拖拽选区
        var drag = null;
        function canvasMs(ev) {
            var rect = waveCanvas.getBoundingClientRect();
            var x = clamp(ev.clientX - rect.left, 0, rect.width);
            return ui.viewStart + x / Math.max(1, rect.width) * viewSpanMs();
        }
        function updateTrimInputs() {
            startInput.value = String(Math.round(ui.startMs));
            endInput.value = String(Math.round(ui.endMs));
            var dur = Math.max(0, ui.endMs - ui.startMs) / 1000;
            trimInfo.textContent = t('选区') + ' ' + fmtSec(dur) + ' / ' + fmtSec(ui.bgmBuffer ? ui.bgmBuffer.duration : 0);
        }
        waveCanvas.addEventListener('pointerdown', function (ev) {
            if (!ui.bgmBuffer) return;
            var rect = waveCanvas.getBoundingClientRect();
            var x = ev.clientX - rect.left;
            var xa = (ui.startMs - ui.viewStart) / viewSpanMs() * rect.width;
            var xb = (ui.endMs - ui.viewStart) / viewSpanMs() * rect.width;
            if (Math.abs(x - xa) <= Math.abs(x - xb)) drag = 'start';
            else drag = 'end';
            waveCanvas.setPointerCapture(ev.pointerId);
            stopSelectionPlayback();
        });
        waveCanvas.addEventListener('pointermove', function (ev) {
            if (!drag || !ui.bgmBuffer) return;
            var ms = canvasMs(ev);
            if (drag === 'start') ui.startMs = clamp(ms, 0, ui.endMs - 1);
            else ui.endMs = clamp(ms, ui.startMs + 1, ui.bgmBuffer.duration * 1000);
            updateTrimInputs();
            drawWave();
        });
        waveCanvas.addEventListener('pointerup', function (ev) {
            drag = null;
            try { waveCanvas.releasePointerCapture(ev.pointerId); } catch (e) {}
        });
        waveCanvas.addEventListener('pointercancel', function () { drag = null; });

        // 横向缩放: 按钮 + Ctrl/Command + 滚轮
        zoomInBtn.addEventListener('click', function () {
            zoomWave(0.5, ui.viewStart + viewSpanMs() / 2);
        });
        zoomOutBtn.addEventListener('click', function () {
            zoomWave(2, ui.viewStart + viewSpanMs() / 2);
        });
        zoomFitBtn.addEventListener('click', function () {
            resetWaveView();
            drawWave();
        });
        waveCanvas.addEventListener('wheel', function (ev) {
            if (!ui.bgmBuffer) return;
            if (!(ev.ctrlKey || ev.metaKey)) return;
            ev.preventDefault();
            zoomWave(ev.deltaY > 0 ? 1.25 : 0.8, canvasMs(ev));
        }, { passive: false });

        // 平移滑块: 拖动窗口块左右移动视图; 点击轨道空白处把视窗中点跳到该位置
        var scrollDrag = null;
        waveScroll.addEventListener('pointerdown', function (ev) {
            if (!ui.bgmBuffer) return;
            var rect = waveScroll.getBoundingClientRect();
            var dur = fullDurMs();
            var span = viewSpanMs();
            if (!(dur > 0)) return;
            var x = clamp(ev.clientX - rect.left, 0, rect.width);
            var winL = ui.viewStart / dur * rect.width;
            var winR = ui.viewEnd / dur * rect.width;
            if (x < winL - 2 || x > winR + 2) {
                var vs = clamp(x / Math.max(1, rect.width) * dur - span / 2, 0, dur - span);
                ui.viewStart = vs;
                ui.viewEnd = vs + span;
                drawWave();
            }
            scrollDrag = { startX: ev.clientX, startView: ui.viewStart };
            waveScrollWin.style.cursor = 'grabbing';
            waveScroll.setPointerCapture(ev.pointerId);
            ev.preventDefault();
        });
        waveScroll.addEventListener('pointermove', function (ev) {
            if (!scrollDrag || !ui.bgmBuffer) return;
            var rect = waveScroll.getBoundingClientRect();
            var dur = fullDurMs();
            var span = viewSpanMs();
            var dx = (ev.clientX - scrollDrag.startX) / Math.max(1, rect.width) * dur;
            var vs = clamp(scrollDrag.startView + dx, 0, dur - span);
            ui.viewStart = vs;
            ui.viewEnd = vs + span;
            drawWave();
        });
        function endScrollDrag(ev) {
            if (!scrollDrag) return;
            scrollDrag = null;
            waveScrollWin.style.cursor = 'grab';
            try { waveScroll.releasePointerCapture(ev.pointerId); } catch (e) {}
        }
        waveScroll.addEventListener('pointerup', endScrollDrag);
        waveScroll.addEventListener('pointercancel', endScrollDrag);

        startInput.addEventListener('change', function () {
            if (!ui.bgmBuffer) return;
            ui.startMs = clamp(num(startInput.value, 0), 0, ui.endMs - 1);
            updateTrimInputs();
            drawWave();
        });
        endInput.addEventListener('change', function () {
            if (!ui.bgmBuffer) return;
            ui.endMs = clamp(num(endInput.value, ui.bgmBuffer.duration * 1000), ui.startMs + 1, ui.bgmBuffer.duration * 1000);
            updateTrimInputs();
            drawWave();
        });
        offsetInput.addEventListener('change', function () {
            ui.offsetMs = clamp(Math.round(num(offsetInput.value, 0)), 0, 600000);
            offsetInput.value = String(ui.offsetMs);
            drawWave();
        });
        offsetInput.addEventListener('input', function () {
            ui.offsetMs = clamp(Math.round(num(offsetInput.value, 0)), 0, 600000);
            drawWave();
        });
        gainInput.addEventListener('input', function () {
            ui.gain = clamp(num(gainInput.value, 1), 0, 2);
            gainVal.textContent = ui.gain.toFixed(2);
            // 试听中实时生效, 无需重播
            if (ui.selectionGain) ui.selectionGain.gain.value = ui.gain;
            if (ui.previewGain) ui.previewGain.gain.value = ui.gain;
            if (window.AudioEngine && AudioEngine.setClipGain) AudioEngine.setClipGain('mgsong-bgm', ui.gain);
            updateSummary();
        });

        // ============ BGM 选择 ============
        bgmBtn.addEventListener('click', function () { bgmFileInput.click(); });
        bgmClear.addEventListener('click', function () {
            ui.bgmBuffer = null;
            ui.bgmBytes = null;
            ui.bgmName = '';
            ui.bgmInclude = false;
            viewPeaks = null;
            viewPeaksKey = '';
            ui.viewStart = 0;
            ui.viewEnd = 0;
            bgmNameEl.textContent = t('未选择');
            bgmChk.checked = false;
            bgmChk.disabled = true;
            bgmClear.style.display = 'none';
            waveWrap.style.display = 'none';
            stopSelectionPlayback();
            if (ui.previewing) stopPreview();
            updateSummary();
        });
        bgmFileInput.addEventListener('change', function () {
            var file = bgmFileInput.files && bgmFileInput.files[0];
            bgmFileInput.value = '';
            if (!file) return;
            var isOgg = /\.ogg$/i.test(file.name) || /audio\/ogg/i.test(file.type || '');
            if (!isOgg) {
                showAppAlert(t('背景音乐仅支持 Ogg Vorbis (.ogg) 文件。'), {
                    title: t('背景音乐'),
                    icon: 'fa-solid fa-triangle-exclamation'
                });
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var bytes = reader.result;
                if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
                AudioEngine.decodeAudio(bytes).then(function (buffer) {
                    ui.bgmBuffer = buffer;
                    ui.bgmBytes = bytes;
                    ui.bgmName = file.name;
                    ui.startMs = 0;
                    ui.endMs = buffer.duration * 1000;
                    ui.offsetMs = 0;
                    offsetInput.value = '0';
                    resetWaveView();
                    bgmNameEl.textContent = file.name + ' · ' + fmtSec(buffer.duration)
                        + ' · ' + buffer.sampleRate + ' Hz · ' + buffer.numberOfChannels + 'ch';
                    bgmChk.disabled = false;
                    bgmChk.checked = true;
                    ui.bgmInclude = true;
                    bgmClear.style.display = '';
                    waveWrap.style.display = '';
                    updateTrimInputs();
                    requestAnimationFrame(drawWave);
                    updateSummary();
                }).catch(function () {
                    showAppAlert(t('无法解码该 Ogg 文件，请确认它是有效的 Ogg Vorbis 音频。'), {
                        title: t('背景音乐'),
                        icon: 'fa-solid fa-triangle-exclamation'
                    });
                });
            };
            reader.readAsArrayBuffer(file);
        });
        bgmChk.addEventListener('change', function () {
            ui.bgmInclude = bgmChk.checked;
            updateSummary();
        });

        // ============ 选区内循环试听 ============
        function stopSelectionPlayback() {
            if (ui.selectionSrc) {
                try { ui.selectionSrc.stop(); } catch (e) {}
                try { ui.selectionSrc.disconnect(); } catch (e) {}
                ui.selectionSrc = null;
            }
            if (ui.selectionGain) {
                try { ui.selectionGain.disconnect(); } catch (e) {}
                ui.selectionGain = null;
            }
            ui.bgmPlaying = false;
            playSelBtn.textContent = t('播放选区');
        }
        function playSelection() {
            if (!ui.bgmBuffer) return;
            if (ui.bgmPlaying) { stopSelectionPlayback(); return; }
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            var ctx = AudioEngine.getContext();
            if (!ctx) return;
            stopPreview();
            var trimmed = sliceAudioBuffer(ctx, ui.bgmBuffer, ui.startMs / 1000, ui.endMs / 1000);
            var gainNode = ctx.createGain();
            gainNode.gain.value = ui.gain;
            gainNode.connect(ctx.destination);
            var src = ctx.createBufferSource();
            src.buffer = trimmed;
            src.loop = true;
            src.connect(gainNode);
            src.start();
            ui.selectionSrc = src;
            ui.selectionGain = gainNode;
            ui.bgmPlaying = true;
            playSelBtn.textContent = t('停止选区');
        }
        playSelBtn.addEventListener('click', playSelection);

        // ============ 对齐试听 (谱面 + BGM) ============
        function stopPreview() {
            if (ui.previewTimer) { clearTimeout(ui.previewTimer); ui.previewTimer = null; }
            if (!ui.previewing) return;
            ui.previewing = false;
            if (state.isPlaying) {
                stopPlaybackLoop();
                if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
                setPlayButtonIcon(false);
                updateProgressUI();
            }
            state.isPlaying = false;
            if (window.AudioEngine && AudioEngine.stopLayer) AudioEngine.stopLayer('mgsong-bgm');
            // 恢复轨道静音/独奏状态
            if (ui.savedTracks) {
                var saved = ui.savedTracks;
                ui.savedTracks = null;
                for (var i = 0; i < state.tracks.length; i++) {
                    var tr = state.tracks[i];
                    var sv = saved[tr.layer];
                    if (sv) { tr.muted = sv.muted; tr.solo = sv.solo; }
                }
                state.soloActive = !!saved.__soloActive;
                if (updateTrackPanelUI) updateTrackPanelUI();
            }
            previewBtn.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i>' + t('试听');
        }
        function startPreview() {
            if (ui.previewing) { stopPreview(); return; }
            stopSelectionPlayback();
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            var ctx = AudioEngine.getContext();
            if (!ctx) { showAppAlert(t('音频引擎不可用，无法试听。'), { title: t('试听') }); return; }

            // 临时仅保留所选音轨可听
            var saved = {};
            saved.__soloActive = state.soloActive;
            for (var i = 0; i < state.tracks.length; i++) {
                var tr = state.tracks[i];
                saved[tr.layer] = { muted: !!tr.muted, solo: !!tr.solo };
                tr.solo = false;
                tr.muted = tr.layer !== ui.layer;
            }
            state.soloActive = false;
            ui.savedTracks = saved;

            if (state.isPlaying) stopPlaybackLoop();
            state.currentTick = 0;
            state.isPlaying = true;
            setPlayButtonIcon(true);
            startPlaybackLoop();
            updateProgressUI();

            // 裁剪后的 BGM (offsetMs 后启动)
            if (ui.bgmBuffer && ui.bgmInclude && window.AudioEngine && AudioEngine.playClip) {
                var trimmed = sliceAudioBuffer(ctx, ui.bgmBuffer, ui.startMs / 1000, ui.endMs / 1000);
                var when = ctx.currentTime + 0.08 + Math.max(0, ui.offsetMs) / 1000;
                AudioEngine.playClip(trimmed, when, 0, ui.gain, 0, 'mgsong-bgm');
            }

            ui.previewing = true;
            previewBtn.innerHTML = '<i class="fa-solid fa-stop" style="margin-right:4px;"></i>' + t('停止');

            var stats = currentValidation();
            var songSec = stats.maxTick > 0 ? stats.maxTick / Math.max(0.0001, ui.tps) : 0;
            var bgmSec = (ui.bgmBuffer && ui.bgmInclude) ? (ui.endMs - ui.startMs) / 1000 + Math.max(0, ui.offsetMs) / 1000 : 0;
            var totalMs = Math.max(songSec, bgmSec) * 1000 + 800;
            ui.previewTimer = setTimeout(function () { stopPreview(); }, Math.max(1500, totalMs));
        }
        previewBtn.addEventListener('click', startPreview);

        // ============ 校验与摘要 ============
        function currentTps() {
            var v = num(tpsInput.value, NaN);
            return v;
        }
        function currentValidation() {
            var tps = currentTps();
            var tempo = num(state.tempo, 20);
            var valid = tps > 0 && tps <= MG_TPS_MAX;
            var res = buildMgsongNotes(ui.layer, isFinite(tps) ? tps : tempo, tempo, ui.fixMode);
            var entries = res.notes;
            var maxTick = 0;
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].tick > maxTick) maxTick = entries[i].tick;
            }
            res.maxTick = maxTick;
            res.tpsValid = valid;
            res.tps = tps;
            return res;
        }

        function updateSummary() {
            var res = currentValidation();
            var tps = res.tps;
            var duration = res.maxTick > 0 && isFinite(tps) && tps > 0 ? res.maxTick / tps : 0;
            var bgmDur = (ui.bgmBuffer && ui.bgmInclude) ? Math.max(0, ui.endMs - ui.startMs) / 1000 : 0;
            var lines = [];
            lines.push(t('音轨') + ': layer ' + ui.layer + ' · ' + t('音符') + ' ' + res.notes.length);
            lines.push('tps: ' + (isFinite(tps) ? tps : '—') + ' · ' + t('曲谱时长') + ': ' + fmtSec(duration));
            if (res.resampled > 0) lines.push(t('重采样音符') + ': ' + res.resampled);
            lines.push(t('背景音乐') + ': ' + (bgmDur > 0 ? fmtSec(bgmDur) + ' · ' + t('增益') + ' ' + ui.gain.toFixed(2) : t('不包含')));
            if (ui.offsetMs > 0) lines.push('offsetMs: ' + ui.offsetMs);
            summaryBox.innerHTML = lines.map(function (s) { return '<div>' + escapeHtml(s) + '</div>'; }).join('');

            // 错误展示
            var errs = res.errors.slice();
            if (!res.tpsValid) {
                errs.unshift({ type: 'tps', tick: null, message: t('曲谱速度 tps 必须满足 0 < tps <= 1000') });
            }
            var parts = [];
            if (!errs.length) {
                parts.push('<div style="color:var(--accent-secondary,#2f9e6e);">'
                    + escapeHtml(t('校验通过，可以导出。')) + '</div>');
            } else {
                var shown = errs.slice(0, 12);
                parts.push('<div style="color:#f0a35e;">'
                    + escapeHtml(t('发现') + ' ' + errs.length + ' ' + t('个问题，导出已暂停：')) + '</div>');
                for (var i = 0; i < shown.length; i++) {
                    parts.push('<div style="padding-left:8px;">· ' + escapeHtml(shown[i].message) + '</div>');
                }
                if (errs.length > shown.length) {
                    parts.push('<div style="padding-left:8px;">· ' + escapeHtml(t('其余') + ' ' + (errs.length - shown.length) + ' ' + t('项已省略')) + '</div>');
                }
                if (res.collisions.length) {
                    parts.push('<div style="margin-top:4px;">'
                        + escapeHtml(t('可在下方一键修复和弦，或回到编辑器手动调整。')) + '</div>');
                }
            }
            if (res.warnings.length) {
                for (var w = 0; w < res.warnings.length; w++) {
                    parts.push('<div style="color:var(--text-tertiary,#888);">' + escapeHtml(res.warnings[w]) + '</div>');
                }
            }
            errorBox.innerHTML = parts.join('');
            fixRow.style.display = (res.collisions.length && !res.errors.some(function (e) { return e.type !== 'chord'; })) ? 'flex' : 'none';
            exportBtn.disabled = errs.length > 0;
            exportBtn.style.opacity = errs.length > 0 ? '0.55' : '';
            exportBtn.style.cursor = errs.length > 0 ? 'not-allowed' : '';

            // 速度提示
            tpsMs.textContent = isFinite(tps) && tps > 0 ? ('1 tick ≈ ' + (1000 / tps).toFixed(1) + ' ms') : '';
            var bpm = ui.bpm;
            bpmInput.value = bpm ? bpm.toFixed(1) : '';
            var prec = num(precSel.value, 1);
            var rec = bpm ? bpm / 15 * prec : 0;
            bpmHint.textContent = t('推荐 tps = BPM / 15 × 精度') + ' = ' + (rec ? rec.toFixed(3) : '—')
                + (prec > 1 ? ' (' + prec + 'x)' : '')
                + (detected.confidence ? (' · ' + t('置信度') + ' ' + Math.round(detected.confidence * 100) + '%') : '');
        }

        function refreshAll() {
            detected = detectBeat(layerNotes(ui.layer), num(state.tempo, 20));
            ui.bpm = detected.bpm;
            ui.fixMode = 'none';
            updateSummary();
            drawWave();
        }

        var detected = detectBeat(layerNotes(ui.layer), tempo);
        ui.bpm = detected.bpm;

        layerSel.addEventListener('change', function () {
            ui.layer = parseInt(layerSel.value, 10) || 0;
            refreshAll();
        });
        tpsInput.addEventListener('focus', function () {
            if (N.pushUndo) N.pushUndo();
        });
        tpsInput.addEventListener('input', function () {
            applyTpsToSong(currentTps());
            updateSummary();
            drawWave();
        });
        tpsInput.addEventListener('change', function () {
            if (!(currentTps() > 0)) { tpsInput.value = String(num(state.tempo, tempo)); }
            else applyTpsToSong(currentTps());
            updateSummary();
            drawWave();
        });
        bpmInput.addEventListener('change', function () {
            var v = num(bpmInput.value, ui.bpm);
            if (v > 0) {
                ui.bpm = v;
                updateSummary();
            }
        });
        precSel.addEventListener('change', function () {
            ui.precision = num(precSel.value, 1);
            updateSummary();
        });
        function recommendedTps() {
            return ui.bpm / 15 * num(precSel.value, 1);
        }
        // tps 同时就是 NBS 歌曲速度 (ticks/s), 实时写回编辑器
        // (NBS tempo 存储上限 655.35, 超过时只用于导出, 不改歌曲速度)
        function applyTpsToSong(tps) {
            if (!(tps > 0 && tps <= MG_TPS_MAX)) return;
            var v = Math.min(655.35, Math.round(tps * 1000) / 1000);
            if (Math.abs(num(state.tempo, 0) - v) < 1e-9) return;
            state.tempo = v;
            if (N.markDirty) N.markDirty();
            var slider = document.getElementById('tempo-slider');
            if (slider) slider.value = String(v);
            var tempoVal = document.getElementById('tempo-value');
            if (tempoVal && document.activeElement !== tempoVal) tempoVal.value = String(v);
            var setSlider = document.getElementById('settings-tempo-slider');
            if (setSlider) setSlider.value = String(Math.max(5, Math.min(655, v)));
            var setVal = document.getElementById('settings-tempo-value');
            if (setVal) setVal.textContent = v.toFixed(1);
            if (N.updateMobileProgress) N.updateMobileProgress(true);
            // 弹窗内正在试听: 停止, 避免音频与谱面不同步
            if (ui.previewing) stopPreview();
            else if (state.isPlaying && N.restartPlayback) N.restartPlayback();
        }
        applyTpsBtn.addEventListener('click', function () {
            var recommended = recommendedTps();
            if (!(recommended > 0 && recommended <= MG_TPS_MAX)) {
                showAppAlert(t('当前 BPM 对应的 tps 超出允许范围 (0, 1000]。'), { title: t('曲谱速度') });
                return;
            }
            var v = Math.round(recommended * 1000) / 1000;
            tpsInput.value = String(v);
            applyTpsToSong(v);
            updateSummary();
            drawWave();
        });
        fixHigh.addEventListener('click', function () {
            ui.fixMode = 'high';
            updateSummary();
        });
        fixLow.addEventListener('click', function () {
            ui.fixMode = 'low';
            updateSummary();
        });

        // 弹窗打开时若已有音频轨道, 提示可导入为 BGM? 不做自动带入, 保持显式选择。

        // ============ 导出 ============
        var exporting = false;
        exportBtn.addEventListener('click', function () {
            if (exporting || exportBtn.disabled) return;
            var res = currentValidation();
            if (res.errors.length || !res.tpsValid) { updateSummary(); return; }
            var tps = res.tps;
            var includeBgm = !!(ui.bgmBuffer && ui.bgmInclude);
            var title = (nameInput.value || defaultTitle || 'Untitled').trim() || 'Untitled';
            exporting = true;
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:5px;"></i>' + t('导出中…');

            var bgmOpts = includeBgm ? {
                buffer: ui.bgmBuffer,
                startMs: ui.startMs,
                endMs: ui.endMs,
                gain: ui.gain,
                offsetMs: ui.offsetMs,
                originalBytes: ui.bgmBytes,
                include: true,
                onProgress: function (p) {
                    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:5px;"></i>'
                        + t('编码背景音乐') + ' ' + Math.round(p * 100) + '%';
                }
            } : null;

            exportMgsong({
                title: title,
                artist: (state.song && (state.song.original_author || state.song.author)) || '',
                charter: (state.song && state.song.author) || '',
                layer: ui.layer,
                tps: tps,
                notes: res.notes,
                bgm: bgmOpts
            }).then(function (out) {
                exporting = false;
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right:5px;"></i>' + t('导出 .mgsong');
                var duration = res.maxTick / tps;
                var msg = t('已导出') + ': ' + out.filename + '\n'
                    + t('音符数') + ': ' + res.notes.length + '\n'
                    + t('曲谱时长') + ': ' + fmtSec(duration) + ' (tps ' + tps + ')\n'
                    + t('背景音乐') + ': ' + (out.bgmIncluded ? fmtSec((ui.endMs - ui.startMs) / 1000) : t('不包含'));
                if (res.resampled > 0) msg += '\n' + t('已按 tps 重新量化') + ': ' + res.resampled;
                if (ui.fixMode !== 'none') msg += '\n' + t('和弦修复') + ': ' + t('保留' + (ui.fixMode === 'high' ? '最高音' : '最低音'));
                summaryBox.innerHTML = msg.split('\n').map(function (s) {
                    return '<div>' + escapeHtml(s) + '</div>';
                }).join('');
                showToast(t('已导出') + ': ' + out.filename, { icon: 'fa-solid fa-compact-disc' });
            }).catch(function (err) {
                exporting = false;
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right:5px;"></i>' + t('导出 .mgsong');
                showAppAlert(t('导出失败') + ': ' + (err && err.message ? err.message : t('未知错误')), {
                    title: t('导出 MusicGroove 曲谱'),
                    icon: 'fa-solid fa-triangle-exclamation'
                });
            });
        });

        // 初始化
        updateSummary();
    }

    // ---- 导出 API ----
    N.showMgsongExportDialog = showMgsongExportDialog;
    N.mgsongExport = {
        MG_INSTRUMENTS: MG_INSTRUMENTS,
        MG_KEY_MIN: MG_KEY_MIN,
        MG_KEY_MAX: MG_KEY_MAX,
        collectLayersWithNotes: collectLayersWithNotes,
        layerNotes: layerNotes,
        detectBeat: detectBeat,
        buildMgsongNotes: buildMgsongNotes,
        buildManifest: buildManifest,
        encodeOggBuffer: encodeOggBuffer,
        exportMgsong: exportMgsong
    };
})(window.WebNBS);
