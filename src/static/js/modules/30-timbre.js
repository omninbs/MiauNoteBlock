/* 30-timbre.js — MiauNoteBlock 功能模块
   来源: 原 main.js L17889-L19228; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    var INSTRUMENT_NAMES = N.INSTRUMENT_NAMES;
    var MIDI_NOTE_NAMES = N.MIDI_NOTE_NAMES;
    var _midiPrefsByHash = N._midiPrefsByHash;
    var _midiTrackPlayback = N._midiTrackPlayback;
    function buildMidiConfigSnapshot() { return N.buildMidiConfigSnapshot.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }
    function fillChannelInstrumentNames() { return N.fillChannelInstrumentNames.apply(this, arguments); }
    function getInstName() { return N.getInstName.apply(this, arguments); }
    function getTinySynth() { return N.getTinySynth.apply(this, arguments); }
    function getValidKeyRange() { return N.getValidKeyRange.apply(this, arguments); }
    function loadSubstituteConfig() { return N.loadSubstituteConfig.apply(this, arguments); }
    function prepareTinySynthProgram() { return N.prepareTinySynthProgram.apply(this, arguments); }
    function saveMidiConfigForHash() { return N.saveMidiConfigForHash.apply(this, arguments); }
    function showMidiNotice() { return N.showMidiNotice.apply(this, arguments); }
    function stopTinySynthAll() { return N.stopTinySynthAll.apply(this, arguments); }
    function updateChannelOctaveForMode() { return N.updateChannelOctaveForMode.apply(this, arguments); }
    function updateChannelRangeAfter() { return N.updateChannelRangeAfter.apply(this, arguments); }
    function updateMidiTrackPlayerButtons() { return N.updateMidiTrackPlayerButtons.apply(this, arguments); }
    function updateMidiTrackProgressUI() { return N.updateMidiTrackProgressUI.apply(this, arguments); }
    function updateOctaveModeHint() { return N.updateOctaveModeHint.apply(this, arguments); }
    function updateTimbreFittingDisabled() { return N.updateTimbreFittingDisabled.apply(this, arguments); }


    function stopMidiTrackPlayback(reset) {
        if (reset !== false) _midiTrackPlayback.pauseTime = 0;
        _midiTrackPlayback.playing = false;
        if (_midiTrackPlayback.rafId) {
            cancelAnimationFrame(_midiTrackPlayback.rafId);
            _midiTrackPlayback.rafId = null;
        }
        for (var i = 0; i < _midiTrackPlayback.scheduled.length; i++) {
            clearTimeout(_midiTrackPlayback.scheduled[i].timeout);
        }
        _midiTrackPlayback.scheduled = [];
        // 停止播放后立即抬起所有正在响的音符，避免最后一次播放的音符一直延音
        // 根据当前后端发送 All Notes Off / All Sound Off
        stopAllPlaybackNotes();
        _midiTrackPlayback.output = null;
        _midiTrackPlayback.useWebMidi = false;
        if (reset !== false) _midiTrackPlayback.backend = null;
        updateMidiTrackPlayerButtons();
        if (reset !== false) updateMidiTrackProgressUI(0);
    }

    // 向当前播放后端的所有通道发送 All Notes Off / All Sound Off
    // 用于停止播放、暂停、静音切换时抬起正在响的音符
    function stopAllPlaybackNotes(channels) {
        var backend = _midiTrackPlayback.backend;
        var out = _midiTrackPlayback.output;
        // 默认所有 16 个通道
        var chs = channels;
        if (!chs) {
            chs = [];
            for (var c = 0; c < 16; c++) chs.push(c);
        }
        if (backend === 'webmidi' && out) {
            // Web MIDI: 发送 CC 123 (All Notes Off) 和 CC 120 (All Sound Off)
            for (var i = 0; i < chs.length; i++) {
                var ch = chs[i];
                try { out.send([0xB0 | (ch & 0x0F), 123, 0]); } catch(e) {}
                try { out.send([0xB0 | (ch & 0x0F), 120, 0]); } catch(e) {}
            }
        } else if (backend === 'tinysynth') {
            // TinySynth: 使用已有的 stopTinySynthAll（遍历 0-15 调用 allSoundOff）
            // 如果指定了特定通道，只停那些通道
            if (channels) {
                var synth = getTinySynth();
                if (synth) {
                    for (var k = 0; k < chs.length; k++) {
                        try { synth.allSoundOff(chs[k]); } catch(e) {}
                    }
                }
            } else {
                stopTinySynthAll();
            }
        }
    }

    // 八度选择变化时重新计算 Key 微调可用范围
    function bindMidiOctaveKeyChange() {
        var octaveSelects = document.querySelectorAll('#midi-channel-rows .midi-octave-select');
        for (var i = 0; i < octaveSelects.length; i++) {
            (function(select) {
                select.addEventListener('change', function() {
                    var ch = parseInt(select.getAttribute('data-channel'));
                    var minNote = parseInt(select.getAttribute('data-min-note'));
                    var maxNote = parseInt(select.getAttribute('data-max-note'));
                    var octave = parseInt(select.value);
                    var keySelect = document.querySelector('#midi-channel-rows .midi-key-shift-select[data-channel="' + ch + '"]');
                    if (!keySelect) return;
                    var currentKey = parseInt(keySelect.value) || 0;
                    var range = getValidKeyRange(minNote, maxNote, octave);
                    var options = keySelect.querySelectorAll('option');
                    for (var j = 0; j < options.length; j++) {
                        var k = parseInt(options[j].value);
                        options[j].disabled = (k < range.min || k > range.max);
                    }
                    if (currentKey < range.min) keySelect.value = range.min;
                    else if (currentKey > range.max) keySelect.value = range.max;
                    // 更新偏移后音域显示
                    var row = select.closest('tr');
                    if (row) {
                        var mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
                        updateChannelRangeAfter(row, mode);
                    }
                });
            })(octaveSelects[i]);
        }
        var keySelects = document.querySelectorAll('#midi-channel-rows .midi-key-shift-select');
        for (var j = 0; j < keySelects.length; j++) {
            (function(select) {
                select.addEventListener('change', function() {
                    var row = select.closest('tr');
                    if (row) {
                        var mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
                        updateChannelRangeAfter(row, mode);
                    }
                });
            })(keySelects[j]);
        }
    }

    // ========== 音色拟合 ==========

    // 音色预览上下文 (Web Audio API)
    var _timbrePreviewCtx = null;
    var _timbrePreviewNodes = [];  // 存储所有 osc + gain, 用于 stopTimbrePreview
    var _timbrePreviewTimeout = null;
    var _activePreviewBtn = null;  // 当前正在播放的按钮

    function getTimbrePreviewCtx() {
        if (!_timbrePreviewCtx) {
            try {
                _timbrePreviewCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) { return null; }
        }
        // 某些浏览器 (尤其是 Chrome) 需要用户交互后才能 resume
        if (_timbrePreviewCtx.state === 'suspended') {
            try { _timbrePreviewCtx.resume(); } catch(e) {}
        }
        return _timbrePreviewCtx;
    }

    function stopTimbrePreview() {
        if (_timbrePreviewTimeout) { clearTimeout(_timbrePreviewTimeout); _timbrePreviewTimeout = null; }
        for (var i = 0; i < _timbrePreviewNodes.length; i++) {
            var node = _timbrePreviewNodes[i];
            if (!node) continue;
            if (node.timeout) { try { clearTimeout(node.timeout); } catch(e) {} }
            if (node.osc) { try { node.osc.stop(); } catch(e) {} }
            if (node.gain) { try { node.gain.disconnect(); } catch(e) {} }
            if (node.noteOff) { try { node.noteOff(); } catch(e) {} }
            if (node.synth && node.synthNoteOff) { try { node.synthNoteOff(); } catch(e) {} }
        }
        _timbrePreviewNodes = [];
        stopTinySynthAll();
        if (_activePreviewBtn) {
            _activePreviewBtn.classList.remove('playing');
            _activePreviewBtn = null;
        }
    }

    function previewTimbreNote(instrument, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;
        var freq = 440 * Math.pow(2, (midiNote - 69) / 12);

        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        // 波形选择 (模拟不同乐器)
        if (instrument === 0) { osc.type = 'sine'; }
        else if (instrument === 1) { osc.type = 'sine'; }
        else if (instrument === 2) { osc.type = 'sine'; }
        else if (instrument === 3) { osc.type = 'sine'; }
        else if (instrument === 4) { osc.type = 'sine'; }
        else if (instrument === 5) { osc.type = 'square'; }
        else if (instrument === 6) { osc.type = 'triangle'; }
        else if (instrument === 7) { osc.type = 'sine'; }
        else if (instrument === 8) { osc.type = 'sine'; }
        else if (instrument === 9) { osc.type = 'sawtooth'; }
        else if (instrument === 10) { osc.type = 'sine'; }
        else if (instrument === 11) { osc.type = 'sine'; }
        else if (instrument === 12) { osc.type = 'sine'; }
        else if (instrument === 13) { osc.type = 'sine'; }
        else if (instrument === 14) { osc.type = 'sine'; }
        else if (instrument === 15) { osc.type = 'sine'; }
        else { osc.type = 'sine'; }

        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);

        _timbrePreviewNodes.push({ osc: osc, gain: gain });
        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 850);
    }

    // 试听 MIDI 原音：优先 Web MIDI 设备，不可用则使用 TinySynth，严格遵循原乐器/音符
    function previewMidiNote(channel, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var row = btn ? btn.closest('tr') : null;
        var program = 0;
        if (row) {
            var infoAttr = row.getAttribute('data-program');
            if (infoAttr) program = parseInt(infoAttr) || 0;
        }

        // Web MIDI 可用时直接输出原 MIDI 音色
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (outputs && outputs.size > 0) {
                    var output = outputs.values().next().value;
                    var ch = (channel || 0) & 0x0F;
                    // 先发送 bank select (GM bank 0) + program change，确保合成器
                    // 在收到 note-on 前已切换到目标音色；延迟 80ms 发音避免听到上一个音色
                    if (ch !== 9) {
                        try { output.send([0xB0 | ch, 0, 0]); } catch(e) {}
                        try { output.send([0xB0 | ch, 32, 0]); } catch(e) {}
                    }
                    try { output.send([0xC0 | ch, program & 0x7F]); } catch(e) {}
                    var tOn = setTimeout(function() {
                        try { output.send([0x90 | ch, midiNote & 0x7F, 100]); } catch(e) {}
                    }, 80);
                    _timbrePreviewNodes.push({
                        timeout: tOn,
                        noteOff: function() {
                            try { output.send([0x80 | ch, midiNote & 0x7F, 0]); } catch(e) {}
                        }
                    });
                    _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 950);
                    return;
                }
                previewMidiNoteTinySynth(channel, midiNote, program);
            }).catch(function() {
                previewMidiNoteTinySynth(channel, midiNote, program);
            });
        } else {
            previewMidiNoteTinySynth(channel, midiNote, program);
        }
    }

    function previewMidiNoteTinySynth(channel, midiNote, program) {
        var synth = getTinySynth();
        if (!synth) {
            if (_activePreviewBtn) _activePreviewBtn.classList.remove('playing');
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        var ch = prepareTinySynthProgram(synth, channel, program);
        try { synth.noteOn(ch, midiNote & 0x7F, 100); } catch(e) {}
        _timbrePreviewNodes.push({
            synth: synth,
            synthNoteOff: function() {
                try { synth.noteOff(ch, midiNote & 0x7F); } catch(e) {}
            }
        });
        _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
    }

    // 试听打击乐 MIDI 原音：在通道 9 播放原始鼓音符
    function previewMidiPercussion(drumNote, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');
        // 这里忽略用户选择的 midiNote（那是给 NBS 组合试听用的），使用原鼓音符 drumNote
        var playNote = (drumNote !== undefined && drumNote !== null) ? drumNote : midiNote;

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (outputs && outputs.size > 0) {
                    var output = outputs.values().next().value;
                    try { output.send([0x99, playNote & 0x7F, 100]); } catch(e) {}
                    _timbrePreviewNodes.push({
                        noteOff: function() {
                            try { output.send([0x89, playNote & 0x7F, 0]); } catch(e) {}
                        }
                    });
                    _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
                    return;
                }
                previewMidiPercussionTinySynth(playNote);
            }).catch(function() {
                previewMidiPercussionTinySynth(playNote);
            });
        } else {
            previewMidiPercussionTinySynth(playNote);
        }
    }

    function previewMidiPercussionTinySynth(drumNote) {
        var synth = getTinySynth();
        if (!synth) {
            if (_activePreviewBtn) _activePreviewBtn.classList.remove('playing');
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        try { synth.noteOn(9, drumNote & 0x7F, 100); } catch(e) {}
        _timbrePreviewNodes.push({
            synth: synth,
            synthNoteOff: function() {
                try { synth.noteOff(9, drumNote & 0x7F); } catch(e) {}
            }
        });
        _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
    }

    // 创建固定默认混响 (Convolution impulse)
    var _timbreReverbNode = null;
    function getTimbreReverbNode(ctx) {
        if (_timbreReverbNode) return _timbreReverbNode;
        try {
            var convolver = ctx.createConvolver();
            var rate = ctx.sampleRate;
            var length = Math.floor(rate * 1.2); // 1.2 秒混响
            var impulse = ctx.createBuffer(2, length, rate);
            for (var c = 0; c < 2; c++) {
                var data = impulse.getChannelData(c);
                for (var i = 0; i < length; i++) {
                    // 指数衰减白噪声
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
                }
            }
            convolver.buffer = impulse;
            var wetGain = ctx.createGain();
            wetGain.gain.value = 0.35; // 混响强度
            convolver.connect(wetGain);
            wetGain.connect(ctx.destination); // 湿声一次性连到输出
            _timbreReverbNode = { input: convolver, output: wetGain };
            return _timbreReverbNode;
        } catch(e) { return null; }
    }

    // 播放 NBS 组合音色和弦 (带固定混响)
    function previewTimbreChordWithReverb(instruments, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;

        var baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
        var reverb = getTimbreReverbNode(ctx);

        var playedCount = 0;
        for (var idx = 0; idx < instruments.length; idx++) {
            var instrument = instruments[idx];
            if (instrument < 0 || instrument === undefined) continue;

            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            if (reverb) gain.connect(reverb.input);

            // 与 previewTimbreChord 相同的波形映射
            if (instrument === 0) { osc.type = 'sine'; }
            else if (instrument === 1) { osc.type = 'triangle'; }
            else if (instrument === 2) { osc.type = 'sine'; }
            else if (instrument === 3) { osc.type = 'square'; }
            else if (instrument === 4) { osc.type = 'triangle'; }
            else if (instrument === 5) { osc.type = 'sawtooth'; }
            else if (instrument === 6) { osc.type = 'sine'; }
            else if (instrument === 7) { osc.type = 'triangle'; }
            else if (instrument === 8) { osc.type = 'sine'; }
            else if (instrument === 9) { osc.type = 'triangle'; }
            else if (instrument === 10) { osc.type = 'triangle'; }
            else if (instrument === 11) { osc.type = 'sawtooth'; }
            else if (instrument === 12) { osc.type = 'sine'; }
            else if (instrument === 13) { osc.type = 'square'; }
            else if (instrument === 14) { osc.type = 'triangle'; }
            else if (instrument === 15) { osc.type = 'sine'; }
            else { osc.type = 'sine'; }

            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.02);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.1);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.15);

            _timbrePreviewNodes.push({ osc: osc, gain: gain });
            playedCount++;
        }

        if (playedCount === 0) {
            if (btn) btn.classList.remove('playing');
            return;
        }

        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 1300);
    }

    // 图标数组：slot 按钮文字左侧显示的小图标 (不加边框/发光/阴影)
    function getInstrumentIconHtml(instIndex) {
        var idx = parseInt(instIndex);
        if (isNaN(idx) || idx < 0) return '<span class="timbre-slot-icon timbre-slot-icon-none">-</span>';
        return '<img class="timbre-slot-icon" src="static/sprites/spr_instrumenticons/inst_' + idx + '.png" alt="">';
    }

    // 音色拟合槽位数据
    // 结构: { programs, drums, programVolumes, drumVolumes }
    //   programs/drums:        { key: [inst1, inst2, inst3] }  (-1 = 无)
    //   programVolumes/drums:  { key: [vol1, vol2, vol3] }     (0-100, 缺省 100)
    // 音色拟合槽位数据: 只随 MIDI 导入配置保存在内存 (按文件哈希), 不再写 localStorage
    function emptyTimbreFittingSaved() {
        return { programs: {}, drums: {}, programVolumes: {}, drumVolumes: {} };
    }
    function getSavedFittingSlots(saved, program, drumNote) {
        if (drumNote !== null && drumNote !== undefined && saved.drums[drumNote] !== undefined) {
            return saved.drums[drumNote];
        }
        if (program !== null && program !== undefined && saved.programs[program] !== undefined) {
            return saved.programs[program];
        }
        return null;
    }
    // 读取已保存的槽位音量; 缺省返回 null (调用方回退 100)
    function getSavedFittingVolumes(saved, program, drumNote) {
        if (!saved) return null;
        if (drumNote !== null && drumNote !== undefined && saved.drumVolumes && saved.drumVolumes[drumNote] !== undefined) {
            return saved.drumVolumes[drumNote];
        }
        if (program !== null && program !== undefined && saved.programVolumes && saved.programVolumes[program] !== undefined) {
            return saved.programVolumes[program];
        }
        return null;
    }

    // ============ 音色拟合 · 推荐选项 (档位缩放拟合槽数) ============
    // 每个建槽都会为每个源音符额外叠加一个音符 (跨 layer 堆叠), 因此填满 3 槽 = 音符数 x3。
    // 档位用于缩放默认填充的槽数: 少音符=1 / 适量=2 / 多音符=3, 且不超过该音色实际设计出的替代槽数。
    var FITTING_LEVEL_KEY = 'webnbs_fitting_level';
    var FITTING_LEVEL_CAP = { few: 1, moderate: 2, many: 3 };
    var _fittingLevel = null;
    // 当前 MIDI 文件保存的档位 (按文件隔离); null = 用全局默认
    N.shared._midiFittingLevelOverride = null;

    function loadFittingLevel() {
        if (N.shared._midiFittingLevelOverride) return N.shared._midiFittingLevelOverride;
        if (_fittingLevel) return _fittingLevel;
        var v = null;
        try { v = localStorage.getItem(FITTING_LEVEL_KEY); } catch (e) {}
        _fittingLevel = (v === 'few' || v === 'moderate' || v === 'many') ? v : 'moderate';
        return _fittingLevel;
    }

    function saveFittingLevel(v) {
        _fittingLevel = v;
        // 用户手动改档位 = 放弃该文件恢复的档位, 以本次选择为准
        N.shared._midiFittingLevelOverride = null;
        try { localStorage.setItem(FITTING_LEVEL_KEY, v); } catch (e) {}
    }

    // 按档位 + GM 设计组合计算旋律行的 3 个默认槽
    //   GM_FITTING_SLOTS[prog] = [highSub, lowSub] 决定该音色的有效替代槽数 (按乐器自动决定)
    //   档位 cap 做缩放; 不足时按设计裁剪, 不留空槽 (不是每个槽都要填满)
    function computeFittingSlots(prog, mainInst) {
        var cap = FITTING_LEVEL_CAP[loadFittingLevel()] || 2;
        var fit = (window.NBSClient && NBSClient.GM_FITTING_SLOTS && NBSClient.GM_FITTING_SLOTS[prog]) || null;
        var subs = [];
        if (fit) {
            for (var i = 0; i < 2; i++) {
                var s = fit[i];
                if (s >= 0 && s !== mainInst && subs.indexOf(s) < 0) subs.push(s);
            }
        }
        var use = Math.min(cap, 1 + subs.length);
        var slots = [mainInst];
        for (var k = 1; k < use; k++) slots.push(subs[k - 1]);
        while (slots.length < 3) slots.push(-1);
        return slots;
    }

    function updateFittingLevelUI() {
        var lv = loadFittingLevel();
        var btns = document.querySelectorAll('#midi-fitting-level .fitting-level-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-level') === lv);
        }
    }

    function initFittingLevelControl() {
        updateFittingLevelUI();
        var wrap = $('midi-fitting-level');
        if (!wrap || wrap.dataset.levelBound) return;
        wrap.dataset.levelBound = '1';
        wrap.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('.fitting-level-btn') : null;
            if (!btn || !wrap.contains(btn)) return;
            var lv = btn.getAttribute('data-level');
            if (!lv || lv === loadFittingLevel()) { updateFittingLevelUI(); return; }
            saveFittingLevel(lv);
            updateFittingLevelUI();
            // 按档位重置全部 (旋律) 音色槽: 清除已保存的旋律拟合, 重建拟合表
            var saved = state._midiTimbreFittingSaved || emptyTimbreFittingSaved();
            var drums = saved.drums || {};
            var drumVols = saved.drumVolumes || {};
            state._midiTimbreFittingSaved = { programs: {}, drums: drums, programVolumes: {}, drumVolumes: drumVols };
            if (state._midiInfo) {
                buildTimbreFittingRows(state._midiInfo);
                fillChannelInstrumentNames();
            }
        });
    }

function buildTimbreFittingRows(info) {
        // 优先使用当前文件的配置快照; 没有配置时从空表开始 (按推荐档位生成默认槽)
        var savedFitting = state._midiTimbreFittingSaved || emptyTimbreFittingSaved();
        state._midiTimbreFittingSaved = savedFitting;

        // 收集旋律通道行
        var melodyRows = [];
        if (info.channels && info.channels.length) {
            for (var ci = 0; ci < info.channels.length; ci++) {
                var chInfo = info.channels[ci];
                if (chInfo.is_percussion) continue;
                if ((chInfo.note_count || 0) > 0) {
                    melodyRows.push({
                        type: 'melody',
                        channel: chInfo.channel,
                        program: chInfo.program,
                        name: chInfo.program_name || ('乐器 ' + chInfo.program),
                        noteCount: chInfo.note_count,
                        defaultInstrument: chInfo.default_instrument !== undefined ? chInfo.default_instrument : 0,
                        defaultOctave: chInfo.default_octave || 0
                    });
                }
            }
        }
        melodyRows.sort(function(a, b) {
            return (a.channel - b.channel) || ((a.program || 0) - (b.program || 0));
        });

        // 收集打击乐行
        var percussionRows = [];
        if (info.percussion && info.percussion.length) {
            for (var pi = 0; pi < info.percussion.length; pi++) {
                var pInfo = info.percussion[pi];
                percussionRows.push({
                    type: 'percussion',
                    channel: 9,
                    drumNote: pInfo.note,
                    name: pInfo.name || ('鼓 ' + pInfo.note),
                    noteCount: 1,
                    defaultInstrument: pInfo.default_instrument !== undefined ? pInfo.default_instrument : 0,
                    defaultPitch: pInfo.default_pitch
                });
            }
        }
        percussionRows.sort(function(a, b) {
            return (a.drumNote || 0) - (b.drumNote || 0);
        });

        var melodyTbody = $('midi-timbre-melody-rows');
        if (melodyTbody) {
            melodyTbody.innerHTML = '';
            buildTimbreRowsForTbody(melodyTbody, melodyRows, savedFitting);
        }
        var percussionTbody = $('midi-timbre-percussion-rows');
        if (percussionTbody) {
            percussionTbody.innerHTML = '';
            buildTimbreRowsForTbody(percussionTbody, percussionRows, savedFitting);
        }
        // 初始化拟合表的禁用状态（排除的 channel 行显示为只读）
        updateTimbreFittingDisabled();
    }

    function buildTimbreRowsForTbody(tbody, rowsData, savedFitting) {
        if (!tbody) return;
        // 试听音高选项, 默认 C5 (72)
        var pitchOptions = '';
        for (var p = 60; p <= 84; p += 4) {
            var selected = (p === 72) ? ' selected' : '';
            pitchOptions += '<option value="' + p + '"' + selected + '>' + MIDI_NOTE_NAMES[p] + '</option>';
        }

        for (var j = 0; j < rowsData.length; j++) {
            var rowData = rowsData[j];
            var isPercussion = rowData.type === 'percussion';
            var idKey = isPercussion ? (rowData.drumNote || 0) : (rowData.program || 0);
            var savedSlots = getSavedFittingSlots(savedFitting, isPercussion ? null : idKey, isPercussion ? idKey : null);
            var savedVols = getSavedFittingVolumes(savedFitting, isPercussion ? null : idKey, isPercussion ? idKey : null);
            var defaultSlots;
            if (savedSlots) {
                defaultSlots = savedSlots;
            } else if (isPercussion) {
                defaultSlots = [rowData.defaultInstrument, -1, -1];
            } else {
                // 旋律: 按推荐档位 + GM 设计组合计算默认槽 (档位越低叠加音符越少)
                defaultSlots = computeFittingSlots(rowData.program || 0, rowData.defaultInstrument);
            }

            var row = document.createElement('tr');
            row.className = 'timbre-main-row';
            if (isPercussion) {
                row.setAttribute('data-percussion', idKey);
                row.setAttribute('data-type', 'percussion');
            } else {
                row.setAttribute('data-channel', rowData.channel);
                row.setAttribute('data-program', idKey);
                row.setAttribute('data-type', 'melody');
            }

            // 乐器名称列
            var nameCell = document.createElement('td');
            var subText = isPercussion
                ? ('鼓音符 ' + idKey + ' · ' + rowData.name)
                : ('通道 ' + rowData.channel + ' · ' + rowData.noteCount + ' 音符');
            nameCell.innerHTML = '<span class="midi-inst-name">' + escapeHTML(rowData.name) + '</span>' +
                '<span class="midi-inst-sub">' + escapeHTML(subText) + '</span>';
            row.appendChild(nameCell);

            // MIDI 原音试听列
            var previewMidiCell = document.createElement('td');
            previewMidiCell.className = 'timbre-col-preview';
            var midiBtnAttr = isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '" data-program="' + idKey + '"');
            previewMidiCell.innerHTML = '<div class="timbre-preview-wrap">'
                + '<button class="timbre-preview-btn timbre-preview-midi" title="试听 MIDI 原音" ' + midiBtnAttr + '><i class="fa-solid fa-music"></i></button>'
                + '<select class="timbre-pitch-select" ' + (isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '"')) + '>' + pitchOptions + '</select>'
                + '</div>';
            row.appendChild(previewMidiCell);

            // NBS 组合试听按钮列
            var previewNbsCell = document.createElement('td');
            previewNbsCell.className = 'timbre-col-preview';
            previewNbsCell.innerHTML = '<button class="timbre-preview-btn timbre-preview-nbs" title="试听 NBS 组合音" ' + midiBtnAttr + '><i class="fa-solid fa-layer-group"></i></button>';
            row.appendChild(previewNbsCell);

            // 音色槽 (音色选择框 + 右侧紧凑音量输入框)
            var slotAttr = isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '"');
            for (var s = 0; s < 3; s++) {
                var slotVal = defaultSlots[s];
                if (slotVal === undefined || slotVal === null || isNaN(slotVal)) slotVal = -1;
                var slotVol = 100;
                if (savedVols && savedVols[s] !== undefined) {
                    var _sv = Number(savedVols[s]);
                    if (isFinite(_sv)) slotVol = Math.max(0, Math.min(100, Math.round(_sv)));
                }
                var slotCell = document.createElement('td');
                var displayName = getInstName(slotVal);
                slotCell.innerHTML = '<input type="hidden" class="timbre-slot" ' + slotAttr + ' data-slot="' + (s + 1) + '" value="' + slotVal + '">'
                    + '<div class="timbre-slot-inner">'
                    + '<div class="timbre-slot-btn" ' + slotAttr + ' data-slot="' + (s + 1) + '" title="' + escapeHTML(displayName) + '">' + getInstrumentIconHtml(slotVal) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>'
                    + '<input type="number" class="timbre-slot-vol" ' + slotAttr + ' data-slot="' + (s + 1) + '" min="0" max="100" step="1" value="' + slotVol + '" inputmode="numeric" title="音量 0-100（可按住上下拖动调节）"' + (slotVal < 0 ? ' disabled' : '') + '>'
                    + '</div>';
                row.appendChild(slotCell);
            }

            tbody.appendChild(row);
        }

        // 绑定试听 MIDI 原音按钮
        var midiPreviewBtns = tbody.querySelectorAll('.timbre-preview-midi');
        for (var n = 0; n < midiPreviewBtns.length; n++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var pitchSelect = row.querySelector('.timbre-pitch-select');
                    var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 72;
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    if (isPerc) {
                        var drumNote = parseInt(row.getAttribute('data-percussion'));
                        previewMidiPercussion(drumNote, midiNote, btn);
                    } else {
                        var ch = parseInt(btn.getAttribute('data-channel'));
                        previewMidiNote(ch, midiNote, btn);
                    }
                });
            })(midiPreviewBtns[n]);
        }

        // 绑定试听 NBS 组合按钮
        var nbsPreviewBtns = tbody.querySelectorAll('.timbre-preview-nbs');
        for (var m = 0; m < nbsPreviewBtns.length; m++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var pitchSelect = row.querySelector('.timbre-pitch-select');
                    var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 72;
                    var slots = row.querySelectorAll('.timbre-slot');
                    var instruments = [];
                    for (var si = 0; si < slots.length; si++) {
                        instruments.push(parseInt(slots[si].value));
                    }
                    var volInputs = row.querySelectorAll('.timbre-slot-vol');
                    var volumes = [];
                    for (var vi = 0; vi < volInputs.length; vi++) {
                        var vv = parseInt(volInputs[vi].value);
                        volumes.push(isFinite(vv) ? Math.max(0, Math.min(100, vv)) : 100);
                    }
                    previewNbsCombination(instruments, midiNote, btn, volumes);
                });
            })(nbsPreviewBtns[m]);
        }

        // 绑定音色槽右键菜单
        var slotBtns = tbody.querySelectorAll('.timbre-slot-btn');
        for (var s = 0; s < slotBtns.length; s++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    var channel = isPerc ? null : parseInt(btn.getAttribute('data-channel'));
                    var percussionNote = isPerc ? parseInt(btn.getAttribute('data-percussion')) : null;
                    var slotNum = parseInt(btn.getAttribute('data-slot'));
                    showTimbreSlotMenu(btn, channel, slotNum, percussionNote);
                });
                btn.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    var channel = isPerc ? null : parseInt(btn.getAttribute('data-channel'));
                    var percussionNote = isPerc ? parseInt(btn.getAttribute('data-percussion')) : null;
                    var slotNum = parseInt(btn.getAttribute('data-slot'));
                    showTimbreSlotMenu(btn, channel, slotNum, percussionNote);
                });
            })(slotBtns[s]);
        }

        // 绑定槽位音量输入框 (输入/微调箭头/上下拖动调节)
        bindTimbreSlotVolumeInputs(tbody);
    }

    // ============ 拟合槽位音量 ============
    // 槽位音量 0-100, 生成时: 音符音量 = MIDI 原音量 x 槽位音量 / 100
    var _slotVolDrag = null;
    var _slotVolDocBound = false;

    function clampSlotVolume(v) {
        var n = Number(v);
        if (!isFinite(n)) return null;
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    function bindTimbreSlotVolumeInputs(tbody) {
        if (!tbody) return;
        ensureSlotVolumeDocListeners();
        var inputs = tbody.querySelectorAll('.timbre-slot-vol');
        for (var i = 0; i < inputs.length; i++) bindTimbreSlotVolumeInput(inputs[i]);
    }

    function ensureSlotVolumeDocListeners() {
        if (_slotVolDocBound) return;
        _slotVolDocBound = true;
        document.addEventListener('mousemove', function(e) {
            if (!_slotVolDrag) return;
            updateSlotVolumeDrag(e.clientY, e);
        });
        document.addEventListener('mouseup', function() {
            if (_slotVolDrag) endSlotVolumeDrag();
        });
    }

    function bindTimbreSlotVolumeInput(input) {
        if (!input || input.dataset.volBound === '1') return;
        input.dataset.volBound = '1';

        // 聚焦时全选, 便于直接覆盖输入
        input.addEventListener('focus', function() {
            try { this.select(); } catch (e) {}
        });

        function commit(fromBlur) {
            if (input.disabled) return;
            var v = clampSlotVolume(input.value);
            if (v === null) {
                if (!fromBlur) return;   // 输入过程中的空值不打断
                v = 100;
            }
            if (String(v) !== String(input.value)) input.value = v;
            saveSlotVolume(input, v);
        }
        input.addEventListener('input', function() { commit(false); });
        input.addEventListener('change', function() { commit(true); });
        input.addEventListener('blur', function() { commit(true); });

        // 鼠标拖动: 超过阈值才进入拖动, 不影响点击编辑/点击上下微调箭头
        input.addEventListener('mousedown', function(e) {
            if (e.button !== 0 || input.disabled) return;
            beginSlotVolumeDrag(input, e.clientY);
        });
        // 触屏拖动: 进入拖动后阻止页面滚动
        input.addEventListener('touchstart', function(e) {
            if (input.disabled || !e.touches || !e.touches.length) return;
            beginSlotVolumeDrag(input, e.touches[0].clientY);
        }, { passive: true });
        input.addEventListener('touchmove', function(e) {
            if (!_slotVolDrag || _slotVolDrag.input !== input || !e.touches || !e.touches.length) return;
            updateSlotVolumeDrag(e.touches[0].clientY, e);
        }, { passive: false });
        input.addEventListener('touchend', function() {
            if (_slotVolDrag && _slotVolDrag.input === input) endSlotVolumeDrag();
        });
        input.addEventListener('touchcancel', function() {
            if (_slotVolDrag && _slotVolDrag.input === input) endSlotVolumeDrag();
        });
        // 拖动释放后浏览器仍会补发 click, 阻止其抢焦点/弹键盘
        input.addEventListener('click', function(e) {
            if (input.dataset.justDragged === '1') {
                input.dataset.justDragged = '';
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    function beginSlotVolumeDrag(input, clientY) {
        _slotVolDrag = {
            input: input,
            startY: clientY,
            startVal: clampSlotVolume(input.value) === null ? 0 : clampSlotVolume(input.value),
            active: false,
            lastVal: null
        };
    }

    function updateSlotVolumeDrag(clientY, e) {
        var d = _slotVolDrag;
        if (!d) return;
        var dy = clientY - d.startY;
        // 3px 阈值: 保留正常点击编辑与原生上下微调
        if (!d.active) {
            if (Math.abs(dy) < 3) return;
            d.active = true;
            d.input.dataset.justDragged = '1';
            try { d.input.blur(); } catch (err) {}
            document.body.style.cursor = 'ns-resize';
        }
        if (e && e.cancelable) e.preventDefault();
        // 每 2.5px 调整 1%, 上下各 250px 即可覆盖整个 0-100 区间
        var v = clampSlotVolume(d.startVal + dy / 2.5);
        if (v !== d.lastVal) {
            d.lastVal = v;
            d.input.value = v;
            saveSlotVolume(d.input, v);
        }
    }

    function endSlotVolumeDrag() {
        var d = _slotVolDrag;
        _slotVolDrag = null;
        document.body.style.cursor = '';
        if (!d) return;
        var v = clampSlotVolume(d.input.value);
        if (v === null) v = d.startVal;
        d.input.value = v;
        saveSlotVolume(d.input, v);
    }

    // 保存单个槽位音量到当前文件的内存配置
    function saveSlotVolume(input, value) {
        var row = input.closest ? input.closest('tr') : null;
        if (!row) return;
        var isPercussion = row.getAttribute('data-type') === 'percussion';
        var slotNum = parseInt(input.getAttribute('data-slot'));
        if (!(slotNum >= 1 && slotNum <= 3)) return;
        var idKey = isPercussion ? parseInt(row.getAttribute('data-percussion')) : parseInt(row.getAttribute('data-program'));
        if (!isFinite(idKey)) return;

        var saved = state._midiTimbreFittingSaved || emptyTimbreFittingSaved();
        var slotsKey = isPercussion ? 'drums' : 'programs';
        var volKey = isPercussion ? 'drumVolumes' : 'programVolumes';
        if (!saved[volKey]) saved[volKey] = {};
        var arr = saved[volKey][idKey];
        if (!arr) {
            arr = [100, 100, 100];
            saved[volKey][idKey] = arr;
        }
        while (arr.length < 3) arr.push(100);
        arr[slotNum - 1] = value;

        // 确保该行的槽位数组也落盘, 重建时才能一起匹配
        if (!saved[slotsKey][idKey]) {
            var hidden = row.querySelectorAll('.timbre-slot');
            var insts = [];
            for (var k = 0; k < hidden.length; k++) insts.push(parseInt(hidden[k].value));
            saved[slotsKey][idKey] = insts;
        }

        state._midiTimbreFittingSaved = saved;
    }

    // 显示音色槽右键菜单
    // channel: 旋律通道号; percussionNote: 鼓音符(非打击乐为 null)
    function showTimbreSlotMenu(anchorEl, channel, slotNum, percussionNote) {
        var existing = $('timbre-slot-menu');
        if (existing) existing.remove();

        var currentValue = -1;
        var slotInput;
        if (percussionNote !== null && percussionNote !== undefined) {
            slotInput = document.querySelector('.timbre-slot[data-percussion="' + percussionNote + '"][data-slot="' + slotNum + '"]');
        } else {
            slotInput = document.querySelector('.timbre-slot[data-channel="' + channel + '"][data-slot="' + slotNum + '"]');
        }
        if (slotInput) currentValue = parseInt(slotInput.value);

        var menu = document.createElement('div');
        menu.id = 'timbre-slot-menu';
        menu.className = 'timbre-slot-menu';

        var names = INSTRUMENT_NAMES.map(function(_, idx) { return getInstName(idx); });
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        // 如果是 slot 2 或 3，添加"无"选项
        if (slotNum > 1) {
            var noneItem = document.createElement('div');
            noneItem.className = 'timbre-menu-item';
            noneItem.innerHTML = '<span class="timbre-menu-icon timbre-menu-icon-none">-</span><span style="color:#888;font-style:italic;">无</span>';
            noneItem.addEventListener('click', function(e) {
                selectTimbreSlot(channel, slotNum, -1, '无', percussionNote);
                menu.remove();
                e.stopPropagation();
            });
            menu.appendChild(noneItem);
        }

        for (var i = 0; i < names.length; i++) {
            var item = document.createElement('div');
            var isSelected = (currentValue === i);
            item.className = 'timbre-menu-item' + (isSelected ? ' selected' : '');
            item.innerHTML = '<span class="timbre-menu-icon" style="background:' + colors[i] + ';">'
                + '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" alt="" />'
                + (isSelected ? '<span class="timbre-menu-check"><i class="fa-solid fa-check"></i></span>' : '')
                + '</span><span>' + escapeHTML(names[i]) + '</span>';
            item.addEventListener('click', (function(instIndex, instName) {
                return function(e) {
                    selectTimbreSlot(channel, slotNum, instIndex, instName, percussionNote);
                    menu.remove();
                    e.stopPropagation();
                };
            })(i, names[i]));
            menu.appendChild(item);
        }

        document.body.appendChild(menu);

        // 智能计算尺寸与位置
        var rect = anchorEl.getBoundingClientRect();
        var winHeight = window.innerHeight;
        var winWidth = window.innerWidth;
        var margin = 8;
        var naturalHeight = menu.scrollHeight;
        var menuWidth = Math.max(menu.offsetWidth, 150);

        // 垂直可用空间
        var spaceBelow = winHeight - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var preferredHeight = Math.min(naturalHeight, 260);

        // 如果空间紧张, 使用紧凑模式并进一步限制高度
        var compact = false;
        if (Math.max(spaceBelow, spaceAbove) < 220 || naturalHeight > Math.max(spaceBelow, spaceAbove)) {
            compact = true;
            menu.classList.add('compact');
            preferredHeight = Math.min(menu.scrollHeight, Math.max(spaceBelow, spaceAbove) - margin, 220);
        }
        preferredHeight = Math.max(preferredHeight, 80); // 至少显示几行

        // 默认放下方, 放不下则放上方
        var menuY = rect.bottom + 4;
        if (menuY + preferredHeight > winHeight - margin && spaceAbove > spaceBelow) {
            menuY = rect.top - preferredHeight - 4;
        }

        // 水平边界
        var menuX = rect.left;
        if (menuX + menuWidth > winWidth - margin) {
            menuX = winWidth - menuWidth - margin;
        }
        if (menuX < margin) menuX = margin;
        if (menuY < margin) menuY = margin;
        if (menuY + preferredHeight > winHeight - margin) {
            preferredHeight = winHeight - margin - menuY;
        }

        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.style.maxHeight = preferredHeight + 'px';
        menu.style.width = menuWidth + 'px';
        menu.style.transform = 'none';
        window.WebNBSPositionFlyout(menu, rect, {
            placement: menuY < rect.top ? 'top-start' : 'bottom-start',
            maxHeight: preferredHeight
        });

        // 播放选中音色的预览音效 (使用 MIDI 音调)
        if (window.AudioEngine && AudioEngine.playNote && currentValue >= 0) {
            var row = slotInput ? slotInput.closest('tr') : null;
            var pitchSelect = row ? row.querySelector('.timbre-pitch-select') : null;
            var previewPitch = pitchSelect ? parseInt(pitchSelect.value) : 60;
            AudioEngine.playNote(currentValue, previewPitch, 70);
        }

        // 点击其他地方关闭菜单
        var closeMenu = function(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // 选择音色槽后更新 UI, 保存到 localStorage, 并立即播放单个 NBS 音色音符 (使用 MIDI 音调)
    function selectTimbreSlot(channel, slotNum, value, displayName, percussionNote) {
        var selector;
        if (percussionNote !== null && percussionNote !== undefined) {
            selector = '[data-percussion="' + percussionNote + '"]';
        } else {
            selector = '[data-channel="' + channel + '"]';
        }
        var slotInput = document.querySelector('.timbre-slot' + selector + '[data-slot="' + slotNum + '"]');
        var slotBtn = document.querySelector('.timbre-slot-btn' + selector + '[data-slot="' + slotNum + '"]');
        if (slotInput) slotInput.value = value;
        if (slotBtn) {
            slotBtn.setAttribute('title', displayName);
            slotBtn.innerHTML = getInstrumentIconHtml(value) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i>';
        }
        // 槽位为"无"时, 该槽音量无意义 -> 禁用输入框
        var slotVolInput = slotInput && slotInput.parentElement
            ? slotInput.parentElement.querySelector('.timbre-slot-vol') : null;
        if (slotVolInput) slotVolInput.disabled = (value < 0);

        // 保存设置到当前文件的内存配置
        var row = slotInput ? slotInput.closest('tr') : null;
        var isPercussion = row ? (row.getAttribute('data-type') === 'percussion') : (percussionNote !== null && percussionNote !== undefined);
        var saved = state._midiTimbreFittingSaved || emptyTimbreFittingSaved();
        var idKey = isPercussion ? parseInt(row ? row.getAttribute('data-percussion') : percussionNote) : parseInt(row ? row.getAttribute('data-program') : channel);
        var slotsKey = isPercussion ? 'drums' : 'programs';
        if (!saved[slotsKey][idKey]) saved[slotsKey][idKey] = [-1, -1, -1];
        saved[slotsKey][idKey][slotNum - 1] = value;
        // 同步补齐该行槽位音量数组 (缺省 100, 与 UI 一致)
        var volKey = isPercussion ? 'drumVolumes' : 'programVolumes';
        if (!saved[volKey]) saved[volKey] = {};
        if (!saved[volKey][idKey]) saved[volKey][idKey] = [100, 100, 100];
        while (saved[volKey][idKey].length < 3) saved[volKey][idKey].push(100);
        state._midiTimbreFittingSaved = saved;

        // 立即播放单个 NBS 音色音符 (使用该行选择的 MIDI 音调与该槽位音量)
        var pitchSelect = row ? row.querySelector('.timbre-pitch-select') : null;
        var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 60;
        if (value >= 0) {
            var slotVol = slotVolInput ? parseInt(slotVolInput.value) : 100;
            if (!isFinite(slotVol)) slotVol = 100;
            slotVol = Math.max(0, Math.min(100, slotVol));
            if (slotVol > 0) {
                var nbsKey = Math.max(0, Math.min(87, midiNote - 21));
                if (window.AudioEngine && AudioEngine.playNote) {
                    AudioEngine.playNote(value, nbsKey, slotVol);
                } else {
                    previewTimbreNote(value, midiNote, slotBtn);
                }
            }
        }

        // 同步通道映射表: 更新 NBS 乐器列显示和偏移后音域
        // (slot1 是替代链的起点乐器, 变化后影响偏移和替代结果)
        if (!isPercussion && slotNum === 1) {
            fillChannelInstrumentNames();
            var _curMode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
            if (_curMode === 2 || _curMode === 3) {
                updateChannelOctaveForMode(_curMode);
            }
            updateOctaveModeHint(_curMode);
        }
    }

    // 试听 NBS 组合: 同时播放选中的 NBS 乐器 (使用真实 NBS 样本)
    // instruments: [inst1, inst2, inst3] 中 -1 表示"无"槽
    // volumes: 可选, 各槽位音量 0-100 (缺省 100); 音量为 0 的槽静音
    // midiNote: 音调 (沿用 midi 弹窗左侧选择, 默认 C5)
    function previewNbsCombination(instruments, midiNote, btn, volumes) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        if (!window.AudioEngine || !AudioEngine.playNote) return;

        var nbsKey = Math.max(0, Math.min(87, (midiNote || 72) - 21));
        var played = 0;
        for (var i = 0; i < instruments.length; i++) {
            var inst = instruments[i];
            if (inst === undefined || inst < 0) continue;
            var vol = 80;
            if (volumes && volumes[i] !== undefined && volumes[i] !== null) {
                var vn = Number(volumes[i]);
                if (isFinite(vn)) vol = Math.max(0, Math.min(100, vn));
            }
            if (vol <= 0) continue;
            AudioEngine.playNote(inst, nbsKey, vol);
            played++;
        }

        if (played === 0) {
            if (btn) btn.classList.remove('playing');
            return;
        }

        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 500);
    }

    // 播放组合音色和弦 (旧版 Web Audio 合成, 保留供 fallback 使用)
    // instruments: [inst1, inst2, inst3] 中 -1 表示"无"槽
    // midiNote: 音调 (沿用 midi 弹窗左侧选择)
    function previewTimbreChord(instruments, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;

        var baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);

        var playedCount = 0;
        for (var idx = 0; idx < instruments.length; idx++) {
            var instrument = instruments[idx];
            if (instrument < 0 || instrument === undefined) continue; // 跳过"无"槽

            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // 根据 NBS 乐器类型选择波形 (与 _timbrePreviewChord 旧版相同, 让各音色有辨识度)
            if (instrument === 0) { osc.type = 'sine'; }           // 钢琴
            else if (instrument === 1) { osc.type = 'triangle'; }  // 低音提琴
            else if (instrument === 2) { osc.type = 'sine'; }     // 低音鼓
            else if (instrument === 3) { osc.type = 'square'; }    // 小军鼓 (用方波代替 noise, browser 兼容)
            else if (instrument === 4) { osc.type = 'triangle'; } // 击打声
            else if (instrument === 5) { osc.type = 'sawtooth'; }  // 吉他
            else if (instrument === 6) { osc.type = 'sine'; }     // 长笛
            else if (instrument === 7) { osc.type = 'triangle'; } // 钟琴
            else if (instrument === 8) { osc.type = 'sine'; }     // 风铃
            else if (instrument === 9) { osc.type = 'triangle'; } // 木琴
            else if (instrument === 10) { osc.type = 'triangle'; } // 铁木琴
            else if (instrument === 11) { osc.type = 'sawtooth'; } // 牛铃
            else if (instrument === 12) { osc.type = 'sine'; }    // 迪吉里杜管
            else if (instrument === 13) { osc.type = 'square'; }  // 芯片音
            else if (instrument === 14) { osc.type = 'triangle'; } // 班卓琴
            else if (instrument === 15) { osc.type = 'sine'; }    // 电钢琴
            else { osc.type = 'sine'; }

            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.0);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.05);

            _timbrePreviewNodes.push({ osc: osc, gain: gain });
            playedCount++;
        }

        if (playedCount === 0) {
            // 全是"无"槽, 恢复按钮状态
            if (btn) btn.classList.remove('playing');
            return;
        }

        // 1.2 秒后恢复按钮状态
        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 1200);
    }

    // 收集音色拟合设置
    // 返回 {
    //   channels: {channel: [slot1,slot2,slot3]},
    //   drums: {drumNote: [slot1,slot2,slot3]},
    //   channel_volumes: {channel: [vol1,vol2,vol3]},   // 0-100
    //   drum_volumes: {drumNote: [vol1,vol2,vol3]}
    // }
    function collectTimbreFitting() {
        var result = { channels: {}, drums: {}, channel_volumes: {}, drum_volumes: {} };
        var rows = document.querySelectorAll('#midi-timbre-melody-rows tr, #midi-timbre-percussion-rows tr');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var isPercussion = row.getAttribute('data-type') === 'percussion';
            var slots = row.querySelectorAll('.timbre-slot');
            var instruments = [];
            for (var j = 0; j < slots.length; j++) {
                instruments.push(parseInt(slots[j].value));
            }
            // 只收集至少有 slot1 设置了的 (不是 -1 的都算)
            if (instruments[0] < 0) continue;

            var volInputs = row.querySelectorAll('.timbre-slot-vol');
            var volumes = [];
            for (var v = 0; v < 3; v++) {
                var volVal = volInputs[v] ? parseInt(volInputs[v].value) : 100;
                if (!isFinite(volVal)) volVal = 100;
                volumes.push(Math.max(0, Math.min(100, volVal)));
            }

            if (isPercussion) {
                var drumNote = parseInt(row.getAttribute('data-percussion'));
                result.drums[drumNote] = instruments;
                result.drum_volumes[drumNote] = volumes;
            } else {
                var ch = parseInt(row.getAttribute('data-channel'));
                result.channels[ch] = instruments;
                result.channel_volumes[ch] = volumes;
            }
        }
        return result;
    }

    function collectMidiSettings() {
        var settings = {
            channel_instruments: {},  // 留空，服务端默认强制使用拟合
            channel_octaves: {},
            channel_keys: {},
            percussion_instruments: {},
            percussion_pitches: {},
            remove_silent: $('midi-remove-silent') ? $('midi-remove-silent').checked : true,
            name_layers: $('midi-name-layers') ? $('midi-name-layers').checked : true,
            name_after_patches: true,
            same_tempo: true,
            read_velocity: $('midi-read-velocity') ? $('midi-read-velocity').checked : true,
            precision: $('midi-precision') ? parseInt($('midi-precision').value) : 1,
            keep_note_length: $('midi-keep-note-length') ? $('midi-keep-note-length').value : 'none',
            dedupe_notes: $('midi-dedupe-notes') ? $('midi-dedupe-notes').checked : false,
            dedupe_reorder: ($('midi-dedupe-notes') && $('midi-dedupe-notes').checked && $('midi-dedupe-reorder')) ? $('midi-dedupe-reorder').checked : false,
            sustain_tracks: N.shared._sustainTrackIndices.slice(),
            snap_enabled: $('midi-snap-enabled') ? $('midi-snap-enabled').checked : false,
            snap_beat: $('midi-snap-beat') ? parseInt($('midi-snap-beat').value) : 4,
            // 音域处理模式: 0=不应用, 1=单独音符归一法, 2=整体八度偏移法, 3=整体半音偏移法
            octave_mode: $('midi-octave-mode') ? parseInt($('midi-octave-mode').value) || 0 : 0,
            // 智能音色替代开关 (仅在模式 2/3 下有效, 模式 0/1 灰显无效)
            smart_substitute_enabled: $('midi-smart-substitute') ? $('midi-smart-substitute').checked : true,
            // 自动分割片段: 按 MIDI 通道拆成多条片段轨道 (默认开启)
            auto_split_segments: $('midi-auto-split-segments') ? $('midi-auto-split-segments').checked : true,
            // 查找并分割重复片段: 在 MIDI 事件层识别重复旋律并按小节切分 (默认开启)
            split_repeats: $('midi-split-repeats') ? $('midi-split-repeats').checked : true,
            // 颗粒度等级: small(最小1小节) / medium(最小2小节, 默认) / large(最小4小节)
            repeat_granularity: $('midi-repeat-granularity') ? $('midi-repeat-granularity').value : 'medium',
        };

        // 收集音色替代配置
        var substConfig = loadSubstituteConfig();
        settings.substitute_config = substConfig;
        settings.substitute_tracks = N.shared._substituteSelectedTracks
            ? Object.keys(N.shared._substituteSelectedTracks).filter(function(k) { return N.shared._substituteSelectedTracks[k]; }).map(function(k) { return parseInt(k); })
            : null; // null = 全部应用

        // 模式 0/1 下强制关闭智能替代 (灰显无效)
        if (settings.octave_mode !== 2 && settings.octave_mode !== 3) {
            settings.smart_substitute_enabled = false;
        }

        // 收集命名模式
        var nameModeRadios = document.getElementsByName('midi-name-mode');
        for (var i = 0; i < nameModeRadios.length; i++) {
            if (nameModeRadios[i].checked) {
                settings.name_after_patches = (nameModeRadios[i].value === 'patches');
            }
        }

        // 收集通道八度偏移与 key 微调（NBS 乐器强制使用拟合，不再单独选择）
        var octSelects = document.querySelectorAll('#midi-channel-rows .midi-octave-select');
        for (var k = 0; k < octSelects.length; k++) {
            var s = octSelects[k];
            var ch = parseInt(s.getAttribute('data-channel'));
            settings.channel_octaves[ch] = parseInt(s.value);
        }
        var keySelects = document.querySelectorAll('#midi-channel-rows .midi-key-shift-select');
        for (var kk = 0; kk < keySelects.length; kk++) {
            var ks = keySelects[kk];
            var ch = parseInt(ks.getAttribute('data-channel'));
            settings.channel_keys[ch] = parseInt(ks.value);
        }

        // 收集强制归位设置 (全局 checkbox, 仅模式 2/3 有效)
        settings.force_fold_enabled = $('midi-force-fold') ? $('midi-force-fold').checked : false;

        // 收集打击乐映射
        var percInstSelects = document.querySelectorAll('.midi-perc-instrument-select');
        for (var p = 0; p < percInstSelects.length; p++) {
            var ps = percInstSelects[p];
            var note = parseInt(ps.getAttribute('data-perc'));
            settings.percussion_instruments[note] = parseInt(ps.value);
        }
        var percPitchSelects = document.querySelectorAll('.midi-perc-pitch-select');
        for (var q = 0; q < percPitchSelects.length; q++) {
            var pp = percPitchSelects[q];
            var note = parseInt(pp.getAttribute('data-note'));
            settings.percussion_pitches[note] = parseInt(pp.value);
        }

        // 收集音色拟合设置
        settings.timbre_fitting = collectTimbreFitting();

        // 收集排除生成的 MIDI 轨道
        settings.excluded_tracks = [];
        for (var idx in N.shared._midiTrackStates) {
            if (N.shared._midiTrackStates[idx].excluded) {
                settings.excluded_tracks.push(parseInt(idx));
            }
        }

        // 仅在点「导入」时保存: 按文件内容哈希记住本次配置 (含音色拟合), 仅存内存
        saveMidiConfigForHash(state._midiHash, buildMidiConfigSnapshot(settings));

        return settings;
    }

    // 计算 MIDI 文件内容哈希 (按内容区分文件, 仅存内存)
    function computeMidiFileHash(file) {
        return new Promise(function(resolve) {
            try {
                if (!file) { resolve('empty'); return; }
                var fallback = 'name:' + file.name + ':' + file.size + ':' + (file.lastModified || 0);
                if (!window.crypto || !window.crypto.subtle || !file.arrayBuffer) { resolve(fallback); return; }
                file.arrayBuffer().then(function(ab) {
                    return window.crypto.subtle.digest('SHA-256', ab);
                }).then(function(buf) {
                    var bytes = new Uint8Array(buf);
                    var hex = '';
                    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
                    resolve(hex);
                }).catch(function() { resolve(fallback); });
            } catch(e) { resolve('fallback:' + (file ? file.name : 'none')); }
        });
    }

    function getMidiConfigForHash(hash) {
        if (!hash) return null;
        return _midiPrefsByHash[hash] || null;
    }

    // ---- 导出 ----
    N.stopMidiTrackPlayback = stopMidiTrackPlayback;
    N.stopAllPlaybackNotes = stopAllPlaybackNotes;
    N.bindMidiOctaveKeyChange = bindMidiOctaveKeyChange;
    N.getTimbrePreviewCtx = getTimbrePreviewCtx;
    N.stopTimbrePreview = stopTimbrePreview;
    N.previewTimbreNote = previewTimbreNote;
    N.previewMidiNote = previewMidiNote;
    N.previewMidiNoteTinySynth = previewMidiNoteTinySynth;
    N.previewMidiPercussion = previewMidiPercussion;
    N.previewMidiPercussionTinySynth = previewMidiPercussionTinySynth;
    N.getTimbreReverbNode = getTimbreReverbNode;
    N.previewTimbreChordWithReverb = previewTimbreChordWithReverb;
    N.getInstrumentIconHtml = getInstrumentIconHtml;
    N.emptyTimbreFittingSaved = emptyTimbreFittingSaved;
    N.getSavedFittingSlots = getSavedFittingSlots;
    N.getSavedFittingVolumes = getSavedFittingVolumes;
    N.loadFittingLevel = loadFittingLevel;
    N.saveFittingLevel = saveFittingLevel;
    N.computeFittingSlots = computeFittingSlots;
    N.updateFittingLevelUI = updateFittingLevelUI;
    N.initFittingLevelControl = initFittingLevelControl;
    N.buildTimbreFittingRows = buildTimbreFittingRows;
    N.buildTimbreRowsForTbody = buildTimbreRowsForTbody;
    N.clampSlotVolume = clampSlotVolume;
    N.bindTimbreSlotVolumeInputs = bindTimbreSlotVolumeInputs;
    N.ensureSlotVolumeDocListeners = ensureSlotVolumeDocListeners;
    N.bindTimbreSlotVolumeInput = bindTimbreSlotVolumeInput;
    N.beginSlotVolumeDrag = beginSlotVolumeDrag;
    N.updateSlotVolumeDrag = updateSlotVolumeDrag;
    N.endSlotVolumeDrag = endSlotVolumeDrag;
    N.saveSlotVolume = saveSlotVolume;
    N.showTimbreSlotMenu = showTimbreSlotMenu;
    N.selectTimbreSlot = selectTimbreSlot;
    N.previewNbsCombination = previewNbsCombination;
    N.previewTimbreChord = previewTimbreChord;
    N.collectTimbreFitting = collectTimbreFitting;
    N.collectMidiSettings = collectMidiSettings;
    N.computeMidiFileHash = computeMidiFileHash;
    N.getMidiConfigForHash = getMidiConfigForHash;
    N._timbrePreviewCtx = _timbrePreviewCtx;
    N._timbrePreviewNodes = _timbrePreviewNodes;
    N._timbrePreviewTimeout = _timbrePreviewTimeout;
    N._activePreviewBtn = _activePreviewBtn;
    N._timbreReverbNode = _timbreReverbNode;
    N.FITTING_LEVEL_KEY = FITTING_LEVEL_KEY;
    N.FITTING_LEVEL_CAP = FITTING_LEVEL_CAP;
    N._fittingLevel = _fittingLevel;
    N._slotVolDrag = _slotVolDrag;
    N._slotVolDocBound = _slotVolDocBound;
})(window.WebNBS);
