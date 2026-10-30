/* 16-custom-inst.js — MiauNoteBlock 功能模块
   来源: 原 main.js L8641-L9360; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var CI_PRESET_COLORS = N.CI_PRESET_COLORS;
    function getNbsKeyPitchLabel() { return N.getNbsKeyPitchLabel.apply(this, arguments); }
    function getNbsKeyOctave() { return N.getNbsKeyOctave.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function updateInstrumentSelectorUI() { return N.updateInstrumentSelectorUI.apply(this, arguments); }
    function showAppPrompt() { return N.showAppPrompt.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function handleZipFile() { return N.handleZipFile.apply(this, arguments); }

    var _ciPending = null;   // 导入中 { blob, buffer }

    function ciKeyLabel(k) {
        try { return getNbsKeyPitchLabel(k) + getNbsKeyOctave(k); }
        catch (e) { return String(k); }
    }

    function customInstPopupVisible() {
        var p = $('custom-instruments-popup');
        return p && p.classList.contains('active');
    }

    function openCustomInstPopup() {
        var p = $('custom-instruments-popup');
        if (!p) return;
        p.classList.add('active');
        p.style.display = 'flex';
        renderCustomInstList();
        var btn = $('btn-custom-instruments');
        if (btn) btn.classList.add('active');
    }

    function closeCustomInstPopup() {
        var p = $('custom-instruments-popup');
        if (!p) return;
        p.classList.remove('active');
        p.style.display = 'none';
        var btn = $('btn-custom-instruments');
        if (btn) btn.classList.remove('active');
    }

    function toggleCustomInstPopup() {
        if (customInstPopupVisible()) closeCustomInstPopup();
        else openCustomInstPopup();
    }

    function ciEscape(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function ciPlayNoteAt(idx, key) {
        if (!idx || !window.AudioEngine) return;
        if (window.AudioEngine.playNote) AudioEngine.playNote(idx, key, 90, 50);
    }

    // 试听某个自定义音色 (先确保 buffer 已注册, 再按基准音高播放)
    function ciPlayItem(id, offset) {
        if (!window.CustomInstruments) return;
        var item = CustomInstruments.getById(id);
        if (!item) return;
        CustomInstruments.ensureRegistered(id).then(function() {
            var key = item.pitch + (offset || 0);
            ciPlayNoteAt(item.instrument, key);
        });
    }

    function renderCustomInstList() {
        var listEl = $('custom-inst-list');
        var emptyEl = $('custom-inst-empty');
        if (!listEl) return;
        var items = (window.CustomInstruments) ? CustomInstruments.list() : [];
        if (items.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var sub = '乐器 #' + it.instrument
                + (it.duration ? ' · ' + it.duration + 's' : '')
                + (it.channels ? ' · ' + (it.channels === 2 ? '立体声' : '单声道') : '')
                + ' · 基准 ' + ciKeyLabel(it.pitch);
            html += '<div class="ci-item">'
                + '<span class="ci-item-color" style="background:' + ciEscape(it.color || '#4aa3ff') + ';"></span>'
                + '<div class="ci-item-meta">'
                +   '<span class="ci-item-name" title="' + ciEscape(it.name) + '">' + ciEscape(it.name) + '</span>'
                +   '<span class="ci-item-sub">' + ciEscape(sub) + '</span>'
                + '</div>'
                + '<div class="ci-item-btns">'
                +   '<button class="ci-mini-btn" data-ci-act="play" data-ci-id="' + it.id + '" title="试听">▶</button>'
                +   '<button class="ci-mini-btn" data-ci-act="rename" data-ci-id="' + it.id + '" title="重命名">✎</button>'
                +   '<button class="ci-mini-btn" data-ci-act="recolor" data-ci-id="' + it.id + '" title="更换颜色">◉</button>'
                +   '<button class="ci-mini-btn danger" data-ci-act="delete" data-ci-id="' + it.id + '" title="删除">✕</button>'
                + '</div>'
                + '</div>';
        }
        listEl.innerHTML = html;
        // 刷新钢琴卷帘自定义音色颜色缓存 (底色/右下角方块)
        if (state.pianoRoll && state.pianoRoll.refreshCustomInstrumentCache) {
            state.pianoRoll.refreshCustomInstrumentCache();
        }
    }

    function ciStartImport() {
        var inp = $('ci-file-input');
        if (!inp) return;
        inp.value = '';
        inp.click();
    }

    // 修正窗口播放控制器 (全局单实例)
    var _ciFixPlay = null; // { stop():void, playing:bool }
    var _ciFix = null;     // { detected:null|{key,hz,cents,conf}, baseKey:int, busy:bool }

    function ciBeginImportFlow(file) {
        var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (!ctx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            ctx = AC ? new AC() : null;
        }
        if (!ctx) {
            showAppAlert('无法创建音频上下文', {title: '导入音色'});
            return;
        }
        _ciPending = null;
        _ciFix = { detected: null, baseKey: 33, busy: false };
        var p = $('custom-inst-fix-source');
        if (p) {
            var mb = (file.size / (1024 * 1024)).toFixed(2);
            p.textContent = '来源文件: ' + file.name + ' (' + mb + ' MB)';
        }
        ctx.decodeAudioData ? null : null;
        var abPromise = file.arrayBuffer();
        abPromise.then(function(ab) {
            return ctx.decodeAudioData(ab);
        }).then(function(buf) {
            _ciPending = { origBlob: file, origBuffer: buf, blob: null, buffer: null, baseKey: 33, originalName: file.name };
            ciFixOpenWindow();
        }).catch(function() {
            showAppAlert('无法解码该音频文件，请尝试 mp3/wav/ogg 等格式', {title: '导入音色'});
        });
    }

    // ---------- 修正窗口 ----------
    function ciFixOpenWindow() {
        var p = $('custom-inst-fix-popup');
        if (!p || !_ciPending) return;
        // 重置控件
        var semi = $('ci-fix-semi'), cents = $('ci-fix-cents');
        if (semi) semi.value = 0;
        if (cents) cents.value = 0;
        p.classList.add('active');
        p.style.display = 'flex';
        ciFixDrawWave();
        ciFixRunDetect();
    }

    function ciFixCloseWindow(cancelAll) {
        ciFixStopPlay();
        var p = $('custom-inst-fix-popup');
        if (p) { p.classList.remove('active'); p.style.display = 'none'; }
        if (cancelAll) _ciPending = null;
    }

    function ciFixDrawWave() {
        var cv = $('ci-fix-wave');
        if (!cv || !_ciPending || !_ciPending.origBuffer) return;
        if (window.WebNBSFixUtils) WebNBSFixUtils.drawWaveform(cv, _ciPending.origBuffer, '#4aa3ff');
    }

    function ciFixRunDetect() {
        if (!_ciPending || !_ciPending.origBuffer || !window.WebNBSFixUtils) return;
        if (_ciFix && _ciFix.busy) return;
        _ciFix = _ciFix || {};
        _ciFix.busy = true;
        var detEl = $('ci-fix-detect');
        if (detEl) { detEl.className = 'ci-fix-detect'; detEl.textContent = '正在检测音高…'; }
        var nextBtn = $('custom-inst-fix-next');
        if (nextBtn) nextBtn.disabled = true;
        setTimeout(function() {
            var res = WebNBSFixUtils.detectPitch(_ciPending.origBuffer);
            _ciFix.busy = false;
            _ciFix.detected = res;
            if (res) {
                _ciFix.baseKey = Math.max(0, Math.min(87, Math.round(res.key)));
            } else {
                _ciFix.baseKey = 33;
            }
            var semi = $('ci-fix-semi');
            if (semi) semi.value = 0;
            var cents2 = $('ci-fix-cents');
            if (cents2) cents2.value = 0;
            ciFixSyncUI(res);
            if (nextBtn) nextBtn.disabled = false;
        }, 40);
    }

    function ciFixCurrentDetectedKey() {
        return (_ciFix && _ciFix.detected) ? _ciFix.detected.key : null;
    }

    // 半音(+cents)到总变速半音
    function ciFixTotalSemis() {
        var semi = parseInt($('ci-fix-semi') ? $('ci-fix-semi').value : 0) || 0;
        var cents = parseInt($('ci-fix-cents') ? $('ci-fix-cents').value : 0) || 0;
        var dk = ciFixCurrentDetectedKey();
        if (dk !== null && dk !== undefined) {
            var baseInt = Math.round(dk) + semi;
            return (baseInt - dk) + cents / 100;
        }
        return semi + cents / 100;
    }

    function ciFixBaseKeyNow() {
        var dk = ciFixCurrentDetectedKey();
        var semi = parseInt($('ci-fix-semi') ? $('ci-fix-semi').value : 0) || 0;
        if (dk !== null && dk !== undefined) return Math.max(0, Math.min(87, Math.round(dk) + semi));
        return 33 + semi;
    }

    function ciFixFactor() {
        var s = ciFixTotalSemis();
        return Math.pow(2, s / 12);
    }

    function ciFixSyncUI(detectedOverride) {
        var det = detectedOverride !== undefined ? detectedOverride : (_ciFix ? _ciFix.detected : null);
        var detEl = $('ci-fix-detect');
        var semiVal = $('ci-fix-semi-val'), centsVal = $('ci-fix-cents-val'), baseEl = $('ci-fix-base');
        var semi = parseInt($('ci-fix-semi') ? $('ci-fix-semi').value : 0) || 0;
        var cents = parseInt($('ci-fix-cents') ? $('ci-fix-cents').value : 0) || 0;
        if (semiVal) semiVal.textContent = (semi > 0 ? '+' : '') + semi;
        if (centsVal) centsVal.textContent = (cents > 0 ? '+' : '') + cents + '¢';
        var U = window.WebNBSFixUtils;
        if (baseEl) baseEl.textContent = U ? U.keyLabel(ciFixBaseKeyNow()) : String(ciFixBaseKeyNow());
        if (detEl) {
            if (det && det.key !== null && det.key !== undefined) {
                var centsText = Math.round(det.cents) > 0 ? '+' + Math.round(det.cents) + '¢' : (Math.round(det.cents) < 0 ? Math.round(det.cents) + '¢' : '0¢');
                detEl.className = 'ci-fix-detect';
                detEl.textContent = '检测音高: ' + (U ? U.keyLabel(det.key) : '--') + ' · ' + det.hz.toFixed(1) + ' Hz (' + centsText + ')';
            } else {
                detEl.className = 'ci-fix-detect muted';
                detEl.textContent = '未能检测到稳定音高（可能非单音或过短）。可手动用下方滑块设定，或换一段更清晰的单音采样。';
            }
        }
        // 提示信息
        var exp = $('ci-fix-explain');
        if (exp) {
            var factor = ciFixFactor();
            exp.textContent = '当前修正倍率 ×' + factor.toFixed(4) + '。可点「试听」对比修正效果；满意后点下一步。';
        }
    }

    function ciFixAuto() {
        var dk = ciFixCurrentDetectedKey();
        var semi = parseInt($('ci-fix-semi') ? $('ci-fix-semi').value : 0) || 0;
        if (dk === null || dk === undefined) {
            // 无检测: 把半音滑块归零
            var s2 = $('ci-fix-semi');
            if (s2) s2.value = 0;
        } else {
            var baseInt = Math.round(dk);
            var cents = Math.round((dk - baseInt) * 100); // 归零检测偏差所需音分
            var cEl = $('ci-fix-cents');
            if (cEl) cEl.value = cents;
        }
        ciFixSyncUI();
        ciFixAutoPreview();
    }

    // 自动试听修正结果 (每次滑块变化/自动调整后调用)
    function ciFixAutoPreview() {
        ciFixPlayToggle(true);
    }

    function ciFixPlayToggle(forcePlay) {
        var wasPlaying = _ciFixPlay && _ciFixPlay.playing;
        if (forcePlay && wasPlaying) return;
        if (wasPlaying) {
            ciFixStopPlay();
            return;
        }
        ciFixStartPlay();
    }

    function ciFixStartPlay() {
        if (!_ciPending || !_ciPending.origBuffer) return;
        var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        ciFixStopPlay();
        var factor = ciFixFactor();
        var src = ctx.createBufferSource();
        src.buffer = _ciPending.origBuffer;
        src.playbackRate.value = factor;
        var g = ctx.createGain();
        g.gain.value = 0.75;
        var mon = { stop: function() {}, playing: false };
        var monCanvas = $('ci-fix-monitor');
        if (window.WebNBSFixUtils && monCanvas) {
            var analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            src.connect(analyser);
            analyser.connect(g);
            g.connect(ctx.destination);
            mon = WebNBSFixUtils.startMonitor(monCanvas, analyser, ctx, '#4aa3ff');
        } else {
            src.connect(g);
            g.connect(ctx.destination);
        }
        src.start();
        var live = $('ci-fix-live');
        var U = window.WebNBSFixUtils;
        if (live) live.textContent = '播放修正后采样 · 倍率 ×' + factor.toFixed(4) + ' · 输出基准 ' + (U ? U.keyLabel(ciFixBaseKeyNow()) : '--');
        var playBtn = $('ci-fix-play');
        if (playBtn) playBtn.textContent = '■ 停止';
        _ciFixPlay = {
            playing: true,
            stop: function() {
                mon.stop();
                try { src.stop(); } catch (e) {}
                try { src.disconnect(); } catch (e2) {}
                try { g.disconnect(); } catch (e3) {}
                if (playBtn) playBtn.textContent = '▶ 试听';
                if (live) live.textContent = '实时监视: 播放时显示波形与频率';
            }
        };
        src.onended = function() {
            if (_ciFixPlay) {
                var pb = _ciFixPlay;
                _ciFixPlay = null;
                pb.stop();
            }
        };
    }

    function ciFixStopPlay() {
        if (_ciFixPlay) {
            var pb = _ciFixPlay;
            _ciFixPlay = null;
            try { pb.stop(); } catch (e) {}
        }
    }

    // 下一步: 变速重渲染为 WAV -> 进入"设置音色信息"
    function ciFixNext() {
        if (!_ciPending || !_ciPending.origBuffer) return;
        var nextBtn = $('custom-inst-fix-next');
        if (nextBtn) nextBtn.disabled = true;
        var factor = ciFixFactor();
        var baseKey = ciFixBaseKeyNow();
        var U = window.WebNBSFixUtils;
        var renderP = (Math.abs(factor - 1) < 1e-6)
            ? Promise.resolve(_ciPending.origBuffer)
            : U.renderShift(_ciPending.origBuffer, factor);
        renderP.then(function(newBuf) {
            var blob = U.encodeWav16(newBuf);
            _ciPending.blob = blob;
            _ciPending.buffer = newBuf;
            _ciPending.baseKey = baseKey;
            ciFixCloseWindow(false);
            ciOpenInfoAfterFix();
        }).catch(function() {
            showAppAlert('变速渲染失败，请重试', {title: '音频修正'});
            if (nextBtn) nextBtn.disabled = false;
        });
    }

    // 打开"设置音色信息"
    function ciOpenInfoAfterFix() {
        if (!_ciPending) return;
        var file = _ciPending.origBlob || {};
        var src = $('custom-inst-info-source');
        var name = _ciPending.originalName || file.name || 'audio';
        if (src) {
            var mb = ((file.size || 0) / (1024 * 1024)).toFixed(2);
            src.textContent = '来源文件: ' + name + ' (' + mb + ' MB) · 已按修正结果转换';
        }
        var nameEl = $('custom-inst-name');
        if (nameEl) {
            var base = name.replace(/\.[^.]+$/, '');
            nameEl.value = (window.CustomInstruments) ? CustomInstruments.sanitizeName(base) : base;
        }
        var errEl = $('custom-inst-name-err');
        if (errEl) errEl.style.display = 'none';
        var U = window.WebNBSFixUtils;
        var pitchHint = $('custom-inst-pitch-hint');
        if (pitchHint) pitchHint.textContent = (_ciPending.baseKey || 33) + ' (' + (U ? U.keyLabel(_ciPending.baseKey || 33) : '') + ')';
        ciRenderColorPicker(CI_PRESET_COLORS[4] || '#4aa3ff');
        ciInitColorPickerEvents();
        ciValidateImportName();
        var p = $('custom-inst-info-popup');
        if (p) {
            p.classList.add('active');
            p.style.display = 'flex';
        }
    }

    function ciCloseImportInfo(cancelAll) {
        var p = $('custom-inst-info-popup');
        if (!p) return;
        ciFixStopPlay();
        p.classList.remove('active');
        p.style.display = 'none';
        var fx = $('custom-inst-fix-popup');
        if (fx && fx.classList.contains('active')) { fx.classList.remove('active'); fx.style.display = 'none'; }
        if (cancelAll !== false) _ciPending = null;
    }

    // info 弹窗"上一步" -> 回到修正窗口 (基于原始未修正音频)
    function ciBackToFix() {
        if (!_ciPending || !_ciPending.origBuffer) return;
        var p = $('custom-inst-info-popup');
        if (p) { p.classList.remove('active'); p.style.display = 'none'; }
        var fx = $('custom-inst-fix-popup');
        if (fx) {
            fx.classList.add('active');
            fx.style.display = 'flex';
        }
        ciFixDrawWave();
        ciFixRunDetect();
    }

    // 当前选中的颜色 (RGB 调色盘)
    var _ciSelectedColor = '#4aa3ff';

    function ciRenderColorPicker(selected) {
        _ciSelectedColor = selected || '#4aa3ff';
        ciUpdateColorUI();
        // 渲染预设色块
        var presetsEl = $('ci-rgb-presets');
        if (presetsEl) {
            var html = '';
            for (var i = 0; i < CI_PRESET_COLORS.length; i++) {
                var c = CI_PRESET_COLORS[i];
                html += '<button type="button" class="ci-rgb-preset" data-ci-color="' + c + '" style="background:' + c + ';" title="' + c + '"></button>';
            }
            presetsEl.innerHTML = html;
        }
    }

    function ciHexToRgb(hex) {
        var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function ciRgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(v) {
            v = Math.max(0, Math.min(255, Math.round(v)));
            return ('0' + v.toString(16)).slice(-2);
        }).join('');
    }

    function ciUpdateColorUI() {
        var rgb = ciHexToRgb(_ciSelectedColor) || { r: 74, g: 163, b: 255 };
        var sr = $('ci-slider-r'), sg = $('ci-slider-g'), sb = $('ci-slider-b');
        if (sr) sr.value = rgb.r;
        if (sg) sg.value = rgb.g;
        if (sb) sb.value = rgb.b;
        var vr = $('ci-val-r'), vg = $('ci-val-g'), vb = $('ci-val-b');
        if (vr) vr.textContent = rgb.r;
        if (vg) vg.textContent = rgb.g;
        if (vb) vb.textContent = rgb.b;
        var preview = $('ci-rgb-preview');
        if (preview) preview.style.background = _ciSelectedColor;
        var hexInp = $('ci-hex-input');
        if (hexInp && document.activeElement !== hexInp) hexInp.value = _ciSelectedColor;
    }

    function ciInitColorPickerEvents() {
        var container = $('custom-inst-colors');
        if (!container || container._ciBound) return;
        container._ciBound = true;
        container.addEventListener('input', function(e) {
            var t = e.target;
            if (t.id === 'ci-slider-r' || t.id === 'ci-slider-g' || t.id === 'ci-slider-b') {
                var r = parseInt($('ci-slider-r').value, 10);
                var g = parseInt($('ci-slider-g').value, 10);
                var b = parseInt($('ci-slider-b').value, 10);
                _ciSelectedColor = ciRgbToHex(r, g, b);
                ciUpdateColorUI();
            }
        });
        var hexInp = $('ci-hex-input');
        if (hexInp) {
            hexInp.addEventListener('input', function() {
                var v = hexInp.value.trim();
                if (/^#[0-9a-f]{6}$/i.test(v)) {
                    _ciSelectedColor = v.toLowerCase();
                    ciUpdateColorUI();
                }
            });
            hexInp.addEventListener('blur', function() {
                // 无效输入恢复到当前色
                hexInp.value = _ciSelectedColor;
            });
        }
        var presetsEl = $('ci-rgb-presets');
        if (presetsEl) {
            presetsEl.addEventListener('click', function(e) {
                var sw = e.target.closest ? e.target.closest('.ci-rgb-preset') : null;
                if (!sw) return;
                _ciSelectedColor = sw.getAttribute('data-ci-color') || '#4aa3ff';
                ciUpdateColorUI();
            });
        }
    }

    function ciValidateImportName() {
        var nameEl = $('custom-inst-name');
        var errEl = $('custom-inst-name-err');
        var okBtn = $('custom-inst-info-ok');
        var v = nameEl ? (nameEl.value || '').trim() : '';
        var valid = !!v && (!window.CustomInstruments || CustomInstruments.isNameAvailable(v));
        if (okBtn) okBtn.disabled = !valid;
        if (errEl) {
            if (!v) {
                errEl.textContent = '请输入名称';
                errEl.style.display = 'none';
            } else if (!valid) {
                errEl.textContent = '该名称已存在（不能与内置及已有自定义音色重复）';
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
            }
        }
    }

    // 试听修正后的候选音色 (key 为目标绝对 NBS key, 相对 baseKey 变速)
    function ciPreviewImport(key) {
        if (!_ciPending || !_ciPending.blob) return;
        var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (!ctx) return;
        var baseKey = (_ciPending && _ciPending.baseKey) ? _ciPending.baseKey : 33;
        var done = function(buffer) {
            var rate = Math.pow(2, (key - baseKey) / 12);
            var src = ctx.createBufferSource();
            src.buffer = buffer;
            src.playbackRate.value = rate;
            var g = ctx.createGain();
            g.gain.value = 0.6;
            src.connect(g);
            g.connect(ctx.destination);
            src.start();
        };
        if (_ciPending.buffer) {
            done(_ciPending.buffer);
        } else {
            _ciPending.blob.arrayBuffer().then(function(ab) {
                return ctx.decodeAudioData(ab);
            }).then(function(buf) {
                _ciPending.buffer = buf;
                done(buf);
            }).catch(function() {
                showAppAlert('无法解码该音频文件，请尝试其它格式', {title: '导入音色'});
            });
        }
    }

    function ciConfirmImport() {
        var nameEl = $('custom-inst-name');
        if (!nameEl || !_ciPending) return;
        var v = (nameEl.value || '').trim();
        if (!v) return;
        if (!CustomInstruments.isNameAvailable(v)) {
            ciValidateImportName();
            return;
        }
        var color = _ciSelectedColor || '#4aa3ff';
        var blob = _ciPending.blob;
        var baseKey = (_ciPending && typeof _ciPending.baseKey === 'number') ? _ciPending.baseKey : 33;
        var baseName = (_ciPending && _ciPending.originalName) ? _ciPending.originalName : v;
        ciCloseImportInfo();
        CustomInstruments.add(blob, { name: v, color: color, pitch: baseKey, gain: 100, originalName: baseName }).then(function(item) {
            renderCustomInstList();
            CustomInstruments.ensureRegistered(item.id);
            // 若当前使用默认乐器, 自动切到新音色便于立即体验
            state.currentInstrument = item.instrument;
            if (state.pianoRoll) state.pianoRoll.setInstrument(item.instrument);
            updateInstrumentSelectorUI();
            showAppAlert('已导入自定义音色「' + item.name + '」，可在乐器选择中选用', {title: '导入音色', icon: 'fa-solid fa-circle-check'});
        }).catch(function() {
            showAppAlert('保存失败，请重试', {title: '导入音色'});
        });
    }

    // 管理列表操作代理
    function onCustomInstListClick(e) {
        var btn = e.target.closest ? e.target.closest('[data-ci-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-ci-act');
        var id = btn.getAttribute('data-ci-id');
        var item = (window.CustomInstruments) ? CustomInstruments.getById(id) : null;
        if (!item) return;
        if (act === 'play') {
            ciPlayItem(id, 0);
        } else if (act === 'rename') {
            showAppPrompt('输入新的音色名称:', item.name, {title: '重命名', placeholder: '音色名称'}).then(function(newName) {
                if (!newName) return;
                newName = CustomInstruments.sanitizeName(newName);
                if (!newName) return;
                if (!CustomInstruments.isNameAvailable(newName)) {
                    showAppAlert('该名称已存在，请换一个', {title: '重命名'});
                    return;
                }
                CustomInstruments.update(id, { name: newName });
                renderCustomInstList();
                if (state.currentInstrument === item.instrument) updateInstrumentSelectorUI();
            });
        } else if (act === 'recolor') {
            var colInp = document.createElement('input');
            colInp.type = 'color';
            colInp.value = item.color || '#4aa3ff';
            colInp.onchange = function() {
                var val = colInp.value;
                CustomInstruments.update(id, { color: val });
                renderCustomInstList();
                if (state.currentInstrument === item.instrument) updateInstrumentSelectorUI();
            };
            colInp.click();
        } else if (act === 'delete') {
            showAppConfirm('确定删除自定义音色「' + item.name + '」吗？\n引用该音色的 NBS 文件中对应乐器将静音。', {title: '删除音色', icon: 'fa-solid fa-triangle-exclamation'}).then(function(ok) {
                if (!ok) return;
                CustomInstruments.remove(id).then(function() {
                    renderCustomInstList();
                    if (state.currentInstrument === item.instrument) {
                        state.currentInstrument = 0;
                        if (state.pianoRoll) state.pianoRoll.setInstrument(0);
                        updateInstrumentSelectorUI();
                    }
                });
            });
        }
    }

    function initCustomInstrumentsUI() {
        var btn = $('btn-custom-instruments');
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleCustomInstPopup();
            });
        }
        var listEl = $('custom-inst-list');
        if (listEl) listEl.addEventListener('click', onCustomInstListClick);
        var imp = $('custom-inst-import');
        if (imp) imp.addEventListener('click', ciStartImport);
        var fileInp = $('ci-file-input');
        if (fileInp) {
            fileInp.addEventListener('change', function() {
                var f = fileInp.files && fileInp.files[0];
                if (!f) return;
                ciBeginImportFlow(f);
            });
        }
        // 音色备份: 导出 / 导入
        var ciBackupExport = $('ci-backup-export');
        if (ciBackupExport) ciBackupExport.addEventListener('click', exportInstrumentBackup);
        var ciBackupImport = $('ci-backup-import');
        var ciBackupFile = $('ci-backup-file-input');
        if (ciBackupImport && ciBackupFile) {
            ciBackupImport.addEventListener('click', function() { ciBackupFile.click(); });
        }
        if (ciBackupFile) {
            ciBackupFile.addEventListener('change', function() {
                var f = ciBackupFile.files && ciBackupFile.files[0];
                if (!f) return;
                handleZipFile(f);
                ciBackupFile.value = '';
            });
        }
        var c1 = $('custom-inst-close');
        if (c1) c1.addEventListener('click', closeCustomInstPopup);

        // 信息设置弹窗
        var infoX = $('custom-inst-info-close');
        if (infoX) infoX.addEventListener('click', function() { ciCloseImportInfo(true); });
        var okBtn = $('custom-inst-info-ok');
        if (okBtn) okBtn.addEventListener('click', ciConfirmImport);
        var infoBack = $('custom-inst-info-back');
        if (infoBack) infoBack.addEventListener('click', ciBackToFix);
        var nameEl = $('custom-inst-name');
        if (nameEl) {
            nameEl.addEventListener('input', ciValidateImportName);
            nameEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); if (!$('custom-inst-info-ok').disabled) ciConfirmImport(); }
            });
        }
        var pv = $('custom-inst-preview'), pvL = $('custom-inst-preview-low'), pvH = $('custom-inst-preview-high');
        function ciPreviewNow(offset) {
            var baseKey = (_ciPending && typeof _ciPending.baseKey === 'number') ? _ciPending.baseKey : 33;
            ciPreviewImport(baseKey + (offset || 0));
        }
        if (pv) pv.addEventListener('click', function() { ciPreviewNow(0); });
        if (pvL) pvL.addEventListener('click', function() { ciPreviewNow(-7); });
        if (pvH) pvH.addEventListener('click', function() { ciPreviewNow(7); });

        // 修正窗口
        var fixX = $('custom-inst-fix-close');
        function ciCancelFix() { ciFixCloseWindow(true); }
        if (fixX) fixX.addEventListener('click', ciCancelFix);
        var fixNext = $('custom-inst-fix-next');
        if (fixNext) fixNext.addEventListener('click', ciFixNext);
        var fixAuto = $('ci-fix-auto');
        if (fixAuto) fixAuto.addEventListener('click', ciFixAuto);
        var fixRedetect = $('ci-fix-redetect');
        if (fixRedetect) fixRedetect.addEventListener('click', function() {
            ciFixStopPlay();
            var semi = $('ci-fix-semi'); if (semi) semi.value = 0;
            var cents = $('ci-fix-cents'); if (cents) cents.value = 0;
            ciFixRunDetect();
        });
        var fixPlay = $('ci-fix-play');
        if (fixPlay) fixPlay.addEventListener('click', function() { ciFixPlayToggle(false); });
        // 滑块: 拖动后即时刷新 + 自动试听 (松手后)
        var semiRange = $('ci-fix-semi'), centsRange = $('ci-fix-cents');
        var fixAutoTimer = null;
        function ciFixSliderChanged() {
            ciFixSyncUI();
            if (fixAutoTimer) clearTimeout(fixAutoTimer);
            fixAutoTimer = setTimeout(function() { ciFixAutoPreview(); }, 400);
        }
        if (semiRange) semiRange.addEventListener('input', ciFixSliderChanged);
        if (centsRange) centsRange.addEventListener('input', ciFixSliderChanged);
    }

    // ---- 导出 ----
    N._ciPending = _ciPending;
    N.ciKeyLabel = ciKeyLabel;
    N.customInstPopupVisible = customInstPopupVisible;
    N.openCustomInstPopup = openCustomInstPopup;
    N.closeCustomInstPopup = closeCustomInstPopup;
    N.toggleCustomInstPopup = toggleCustomInstPopup;
    N.ciEscape = ciEscape;
    N.ciPlayNoteAt = ciPlayNoteAt;
    N.ciPlayItem = ciPlayItem;
    N.renderCustomInstList = renderCustomInstList;
    N.ciStartImport = ciStartImport;
    N._ciFixPlay = _ciFixPlay;
    N._ciFix = _ciFix;
    N.ciBeginImportFlow = ciBeginImportFlow;
    N.ciFixOpenWindow = ciFixOpenWindow;
    N.ciFixCloseWindow = ciFixCloseWindow;
    N.ciFixDrawWave = ciFixDrawWave;
    N.ciFixRunDetect = ciFixRunDetect;
    N.ciFixCurrentDetectedKey = ciFixCurrentDetectedKey;
    N.ciFixTotalSemis = ciFixTotalSemis;
    N.ciFixBaseKeyNow = ciFixBaseKeyNow;
    N.ciFixFactor = ciFixFactor;
    N.ciFixSyncUI = ciFixSyncUI;
    N.ciFixAuto = ciFixAuto;
    N.ciFixAutoPreview = ciFixAutoPreview;
    N.ciFixPlayToggle = ciFixPlayToggle;
    N.ciFixStartPlay = ciFixStartPlay;
    N.ciFixStopPlay = ciFixStopPlay;
    N.ciFixNext = ciFixNext;
    N.ciOpenInfoAfterFix = ciOpenInfoAfterFix;
    N.ciCloseImportInfo = ciCloseImportInfo;
    N.ciBackToFix = ciBackToFix;
    N._ciSelectedColor = _ciSelectedColor;
    N.ciRenderColorPicker = ciRenderColorPicker;
    N.ciHexToRgb = ciHexToRgb;
    N.ciRgbToHex = ciRgbToHex;
    N.ciUpdateColorUI = ciUpdateColorUI;
    N.ciInitColorPickerEvents = ciInitColorPickerEvents;
    N.ciValidateImportName = ciValidateImportName;
    N.ciPreviewImport = ciPreviewImport;
    N.ciConfirmImport = ciConfirmImport;
    N.onCustomInstListClick = onCustomInstListClick;
    N.initCustomInstrumentsUI = initCustomInstrumentsUI;
})(window.WebNBS);
