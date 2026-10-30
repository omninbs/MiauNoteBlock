/* 26-piano-keyboard.js — MiauNoteBlock 功能模块
   来源: 原 main.js L13552-L13989; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    function autoSaveLocal() { return N.autoSaveLocal.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function checkOctaveRange() { return N.checkOctaveRange.apply(this, arguments); }
    function exitLyricsEditMode() { return N.exitLyricsEditMode.apply(this, arguments); }
    function exitSegmentsEditMode() { return N.exitSegmentsEditMode.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function getNbsKeyDisplayLabel() { return N.getNbsKeyDisplayLabel.apply(this, arguments); }
    function getShiftedKeyboardPianoKey() { return N.getShiftedKeyboardPianoKey.apply(this, arguments); }
    function handleMidiOpen() { return N.handleMidiOpen.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function handleZipFile() { return N.handleZipFile.apply(this, arguments); }
    function hideWelcomeScreen() { return N.hideWelcomeScreen.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function renderTabs() { return N.renderTabs.apply(this, arguments); }
    function resetStreamingLyrics() { return N.resetStreamingLyrics.apply(this, arguments); }
    function resolveMissingCustomInstruments() { return N.resolveMissingCustomInstruments.apply(this, arguments); }
    function segmentCaptureFromSong() { return N.segmentCaptureFromSong.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function syncNbsLayerGroups() { return N.syncNbsLayerGroups.apply(this, arguments); }
    function tabGetActive() { return N.tabGetActive.apply(this, arguments); }
    function tabOpenInNewTabIfNeeded() { return N.tabOpenInNewTabIfNeeded.apply(this, arguments); }
    function tabStash() { return N.tabStash.apply(this, arguments); }
    function updateSongInfo() { return N.updateSongInfo.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function updateUndoRedoButtons() { return N.updateUndoRedoButtons.apply(this, arguments); }


    function updatePianoKeyboardHighlight() {
        var keyboard = $('piano-keyboard');
        if (!keyboard || keyboard.style.display === 'none') return;
        var keys = keyboard.querySelectorAll('.piano-key');
        var activeMap = {};
        var activeCodes = Object.keys(state._activePianoKeys || {});
        for (var ai = 0; ai < activeCodes.length; ai++) {
            if (state._activePianoKeys[activeCodes[ai]]) {
                var mappedKey = state._activePianoKeys[activeCodes[ai]];
                if (mappedKey === true) mappedKey = getShiftedKeyboardPianoKey(activeCodes[ai]);
                if (mappedKey !== undefined) activeMap[mappedKey] = true;
            }
        }
        for (var i = 0; i < keys.length; i++) {
            var k = parseInt(keys[i].dataset.key);
            var pitchLabel = keys[i].dataset.pitchLabel || keys[i].textContent || '';
            var keyLabel = keys[i].dataset.keyLabel || '';
            var isSelected = k === state.selectedPianoKey;
            var isActive = !!activeMap[k];
            if (state.keyboardPianoEnabled && keyLabel) {
                keys[i].textContent = pitchLabel + '\n' + keyLabel;
            } else {
                keys[i].textContent = pitchLabel;
            }
            if (isSelected || isActive) {
                keys[i].classList.add('selected');
            } else {
                keys[i].classList.remove('selected');
            }
        }
    }

    // 应用"音调文字显示八度数字"设置: 刷新底部钢琴键盘标签与钢琴卷帘音符标签
    function applyOctaveLabelSetting(enabled, rerender) {
        var kb = $('piano-keyboard');
        if (kb) {
            var keys = kb.querySelectorAll('.piano-key');
            for (var li = 0; li < keys.length; li++) {
                var lk = parseInt(keys[li].dataset.key);
                if (!isNaN(lk)) keys[li].dataset.pitchLabel = getNbsKeyDisplayLabel(lk);
            }
            updatePianoKeyboardHighlight();
        }
        if (state.pianoRoll && state.pianoRoll.setOctaveLabelSetting) {
            state.pianoRoll.setOctaveLabelSetting(enabled);
            if (rerender) state.pianoRoll.render();
        }
    }

    // ============ 文件操作 ============
    // 任务进度弹窗管理
    var _taskProgressTimer = null;
    var _taskProgressShown = false;
    var _taskLastPercent = 0;        // 上次显示的进度(0-100)
    var _taskLastSpeed = 0;          // 上次显示的速度(bytes/s)
    var _taskLastEta = 0;            // 上次显示的预计剩余时间(秒)
    var _taskLastLoaded = 0;         // 上次累计的 loaded
    var _taskLastTotal = 0;          // 上次累计的 total
    var _taskLastPhase = '';         // 上次显示的阶段

    function showTaskProgress(filename, title) {
        _taskProgressShown = false;
        _taskLastPercent = 0;
        _taskLastSpeed = 0;
        _taskLastEta = 0;
        _taskLastLoaded = 0;
        _taskLastTotal = 0;
        _taskLastPhase = '';
        _taskShowTime = Date.now();

        // 清除之前的定时器
        if (_taskProgressTimer) { clearTimeout(_taskProgressTimer); _taskProgressTimer = null; }
        if (_hideTaskTimer) { clearTimeout(_hideTaskTimer); _hideTaskTimer = null; }

        // 1.2 秒后才显示弹窗
        _taskProgressTimer = setTimeout(function() {
            _taskProgressShown = true;
            var popup = $('task-progress-popup');
            if (popup) { popup.classList.add('active'); popup.style.display = 'flex'; }
            var titleEl = $('task-progress-title');
            if (titleEl) titleEl.textContent = title || '处理中';
            var nameEl = $('task-progress-filename');
            if (nameEl) nameEl.textContent = filename || '';
            var bar = $('task-progress-bar');
            if (bar) bar.style.width = '0%';
            var pct = $('task-progress-percent');
            if (pct) pct.textContent = '0%';
            var spd = $('task-progress-speed');
            if (spd) spd.textContent = formatBytes(0) + '/s';
            var eta = $('task-progress-eta');
            if (eta) eta.textContent = '计算中…';
            var phaseEl = $('task-progress-phase');
            if (phaseEl) phaseEl.textContent = '';
            // 如果已有进度，立即更新
            if (_taskLastPercent > 0) {
                applyTaskProgress(_taskLastLoaded, _taskLastTotal, _taskLastSpeed, _taskLastPercent, _taskLastEta, _taskLastPhase);
            }
        }, 1200);
    }

    var _taskShowTime = 0;  // 弹窗开始显示的时间

    function hideTaskProgress() {
        if (_taskProgressTimer) { clearTimeout(_taskProgressTimer); _taskProgressTimer = null; }
        if (_hideTaskTimer) { clearTimeout(_hideTaskTimer); _hideTaskTimer = null; }
        var popup = $('task-progress-popup');
        if (popup) { popup.classList.remove('active'); popup.style.display = ''; }
        _taskProgressShown = false;
        _taskLastPercent = 0;
    }
    var _hideTaskTimer = null;

    // 把最新进度写入缓存（弹窗未到 1.2s 也会被记录）
    function updateTaskProgress(loaded, total, speed, percent, eta, phase) {
        _taskLastLoaded = loaded;
        _taskLastTotal = total;
        _taskLastSpeed = speed;
        _taskLastPercent = percent;
        _taskLastEta = eta;
        _taskLastPhase = phase || _taskLastPhase;

        if (!_taskProgressShown) {
            // 1.2s 之前收到的进度，先缓存
            return;
        }
        applyTaskProgress(loaded, total, speed, percent, eta, phase);
    }

    var _phaseNames = {
        'saving': '正在保存...',
        'parse': '正在解析...',
        'process': '正在处理...',
        'complete': '处理完成',
        'error': '处理失败'
    };

    // 实际应用进度到 DOM
    function applyTaskProgress(loaded, total, speed, percent, eta, phase) {
        var bar = $('task-progress-bar');
        if (bar) bar.style.width = percent + '%';
        var pct = $('task-progress-percent');
        if (pct) pct.textContent = percent + '%';
        var spd = $('task-progress-speed');
        if (spd) {
            if (phase === 'saving' || (loaded > 0 && total > 0)) {
                spd.textContent = formatBytes(speed) + '/s';
            } else {
                spd.textContent = '';
            }
        }
        var etaEl = $('task-progress-eta');
        if (etaEl) {
            if (eta >= 0 && isFinite(eta)) {
                etaEl.textContent = '预计 ' + formatTime(eta);
            } else {
                etaEl.textContent = '';
            }
        }
        var phaseEl = $('task-progress-phase');
        if (phaseEl) {
            phaseEl.textContent = _phaseNames[phase] || (phase ? phase : '');
        }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return Math.round(bytes) + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatTime(seconds) {
        if (seconds < 1) return '< 1秒';
        if (seconds < 60) return Math.round(seconds) + '秒';
        var m = Math.floor(seconds / 60);
        var s = Math.round(seconds % 60);
        return m + '分' + s + '秒';
    }

    function handleFileOpen(e) {
        // 从欢迎引导层打开文件: 隐藏引导层并复位文件类型过滤
        hideWelcomeScreen();
        e.target.accept = '.nbs,.mid,.midi,.zip';
        var file = e.target.files[0];
        if (!file) return;

        // 检查文件扩展名，MIDI 文件显示导入弹窗
        var fileName = file.name.toLowerCase();
        // zip 作品包 / 音色备份 → 走 zip 解析流程
        if (fileName.endsWith('.zip')) {
            e.target.value = '';
            handleZipFile(file);
            return;
        }
        if (fileName.endsWith('.mid') || fileName.endsWith('.midi')) {
            handleMidiOpen(e);
            e.target.value = '';
            return;
        }

        // NBS 文件直接加载
        // 新文件, 重置文件 ID
        state.currentFileId = null;
        showTaskProgress(file.name);
        API.loadSong(file, function(loaded, total, speed, percent, eta) {
            updateTaskProgress(loaded, total, speed, percent, eta);
        }).then(function(data) {
            hideTaskProgress();
            if (!data || !data.song) throw new Error('解析返回空数据');
            // 缺失自定义音色处理: 可选择替换后继续加载, 或稍后导入取消本次加载
            return resolveMissingCustomInstruments(data.song).then(function(proceed) {
                if (!proceed) { e.target.value = ''; return; }
                applyLoadedSongData(data, file, e.target);
            });
        }).catch(function(err) {
            hideTaskProgress();
            showAppAlert('加载失败: ' + formatError(err, '无法加载文件'), {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }

    // 应用解析出的 NBS 歌曲数据到编辑器 (resolveMissingCustomInstruments 通过后调用)
    function applyLoadedSongData(data, file, inputEl) {
        if (!data || !data.song) return;
        // 打开文件: 若当前标签页已有内容, 则用新标签页打开
        tabOpenInNewTabIfNeeded();
        var song = data.song;
        state.song = song;
        state.notes = song.notes || [];
        // 保存导入文件名（去掉扩展名）
        state.importedFileName = file.name.replace(/\.[^.]+$/, '');
        // 切换歌曲: 清空上一首的歌词标注 (NBS 不含歌词字段, 歌词为内存数据)
        state.lyrics = Array.isArray(song.lyrics) ? song.lyrics.slice() : [];
        lyricRebuildIndex();
        resetStreamingLyrics();
        exitLyricsEditMode();
        syncLyricsToRoll();
        // 切换歌曲: 片段分割信息优先从作品包恢复, 否则重置为整首一个片段
        exitSegmentsEditMode();
        state._segmentIdSeq = 0;
        state._segmentsTouched = false;
        state._segmentsEdited = false;
        var loadedSegs = Array.isArray(song.segments) ? song.segments : null;
        state.segmentLanes = [];
        if (Array.isArray(song.segmentLanes)) {
            for (var _li = 0; _li < song.segmentLanes.length; _li++) {
                var _ln = song.segmentLanes[_li] || {};
                state.segmentLanes.push({
                    id: _li + 1,
                    muted: !!_ln.muted, solo: !!_ln.solo,
                    volume: isFinite(_ln.volume) ? _ln.volume : 100,
                    height: isFinite(_ln.height) ? _ln.height : SEG_DEFAULT_LANE_H
                });
            }
        }
        state.segments = [];
        if (loadedSegs && loadedSegs.length) {
            for (var _si = 0; _si < loadedSegs.length; _si++) {
                var _sg = loadedSegs[_si];
                if (!_sg || !isFinite(_sg.start) || !isFinite(_sg.end)) continue;
                var _ss = Math.max(0, Math.floor(_sg.start));
                var _se = Math.max(_ss + 1, Math.floor(_sg.end));
                var _snotes = [];
                if (Array.isArray(_sg.notes)) {
                    for (var _ni = 0; _ni < _sg.notes.length; _ni++) {
                        var _sn = _sg.notes[_ni];
                        if (!_sn) continue;
                        _snotes.push({
                            rel: isFinite(_sn.rel) ? _sn.rel : 0,
                            layer: isFinite(_sn.layer) ? _sn.layer : 0,
                            instrument: _sn.instrument, key: _sn.key,
                            velocity: isFinite(_sn.velocity) ? _sn.velocity : 100,
                            pan: isFinite(_sn.pan) ? _sn.pan : 100,
                            pitch: _sn.pitch || 0
                        });
                    }
                }
                state.segments.push({
                    id: ++state._segmentIdSeq,
                    lane: isFinite(_sg.lane) ? _sg.lane : 0,
                    start: _ss, end: _se,
                    name: _sg.name || ('片段 ' + (_si + 1)),
                    notes: _snotes
                });
            }
        }
        segmentEnsure();
        // 旧格式 / 无片段音符数据: 从当前 NBS 音符重新捕获
        var _segHasNotes = false;
        for (var _chk = 0; _chk < state.segments.length; _chk++) {
            if (state.segments[_chk].notes && state.segments[_chk].notes.length) { _segHasNotes = true; break; }
        }
        if (!_segHasNotes && state.notes && state.notes.length) {
            segmentCaptureFromSong();
        }
        segmentSync();
        // NBS 文件没有 MIDI 映射，清除残留的 MIDI 音轨状态
        state.layerChannelMap = {};
        N.shared._midiTrackStates = {};
        state._channelTracks = {};

        var loadedTempo = parseFloat(song.tempo);
        if (!isFinite(loadedTempo) || loadedTempo <= 0) loadedTempo = 10;
        if (loadedTempo > 655) loadedTempo = 655;
        state.tempo = loadedTempo;

        $setValue('tempo-slider', state.tempo);
        $('tempo-value').value = state.tempo;
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
        $setValue('settings-tempo-input', state.tempo);
        $setText('settings-tempo-value', (state.tempo).toFixed(1));

        buildNoteIndex(state.notes);
        state.undoStack = [];
        state.redoStack = [];
        updateUndoRedoButtons();

        // 音符索引已就绪, 让默认片段覆盖整首歌曲
        segmentEnsure();
        segmentSync();

        if (state.pianoRoll) {
            state.pianoRoll._setupCanvas();
            state.pianoRoll.setNotes(state.notes);
        }

        updateSongInfo();
        checkOctaveRange(state.notes);
        // 切换文件时重置轨道状态, 再根据 NBS 文件中的 lock 字段初始化
        state.tracks = [];
        updateTrackPanelUI();
        // 载入的工程可能带有片段轨道分组, 重新计算 NBS 视图分割线
        syncNbsLayerGroups();
        handleStop();
        markDirty();
        // 打开的文件尚未修改: 写入标签页快照并清除未保存圆点
        tabStash();
        var _openedTab = tabGetActive();
        if (_openedTab) _openedTab.dirty = false;
        renderTabs();
        inputEl.value = '';
    }

    function handleSave() {
        // 导出锁: 防止与 exportNBS 冲突
        if (N.shared._isExporting) return;

        var song = state.song || {
            name: 'Untitled', song_name: 'Untitled',
            author: '', original_author: '', description: '',
            tempo: state.tempo, length: state.maxTick + 4,
            notes: state.notes, layers: []
        };
        song.notes = state.notes;
        song.tempo = state.tempo;
        song.length = state.maxTick + 4;

        if (!song.layers || song.layers.length === 0) {
            var maxLayer = 0;
            for (var i = 0; i < state.notes.length; i++) {
                if (state.notes[i].layer > maxLayer) maxLayer = state.notes[i].layer;
            }
            song.layers = [];
            for (var l = 0; l <= maxLayer; l++) {
                song.layers.push({ name: 'Layer ' + (l + 1), volume: 100, stereo: 100, lock: 0 });
            }
        }

        // 保存时根据当前轨道状态写入 lock 字段 (NBS 只表达静音)
        // 独奏不在标准 NBS 中, 以描述尾部标记 + solo_layers 字段承载
        for (var li = 0; li < song.layers.length; li++) {
            if (song.layers[li].lock === undefined) song.layers[li].lock = 0;
            var t = findTrackByLayer(li);
            if (t) {
                song.layers[li].lock = t.muted ? 1 : 0;
            }
        }

        var soloLayers = [];
        for (var si = 0; si < state.tracks.length; si++) {
            if (state.tracks[si].solo) soloLayers.push(state.tracks[si].layer);
        }
        // 独奏标记 / solo_layers 只写入导出副本, 不改动 state.song (避免界面描述显示标记)
        var baseDesc = String(song.description || '').replace(/\s*\[NoteBlockWeb:solo=v1:[^\]]*\]/g, '');
        if (soloLayers.length) baseDesc += (baseDesc ? '\n' : '') + '[NoteBlockWeb:solo=v1:' + soloLayers.join(',') + ']';
        var payload = {};
        for (var pk in song) {
            if (Object.prototype.hasOwnProperty.call(song, pk)) payload[pk] = song[pk];
        }
        payload.description = baseDesc;
        payload.solo_layers = soloLayers;

        var saveName = (state.importedFileName || song.name || song.song_name || 'Untitled') + '.nbs';
        showTaskProgress(saveName, '保存 NBS');
        API.saveSong(payload, function(loaded, total, speed, percent, eta, phase) {
            updateTaskProgress(loaded, total, speed, percent, eta, phase);
        }).then(function(result) {
            hideTaskProgress();
            var filename = result.filename || saveName;
            // 使用 <a download> 触发下载，保留文件名
            var a = document.createElement('a');
            a.href = result.downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(result.downloadUrl);
            }, 5000);
            autoSaveLocal();
        }).catch(function(err) {
            hideTaskProgress();
            showAppAlert('保存失败: ' + formatError(err, '无法保存文件'), {title: '保存失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }

    // ============ MIDI 导入 ============
    // NBS 乐器名称 (与后端 INSTRUMENT_NAMES 对应; 仅作为 i18n 缺失时的回退)
    var INSTRUMENT_NAMES = [
        "Harp/Piano", "Double Bass", "Bass Drum", "Snare Drum", "Click/Sticks",
        "Guitar", "Flute", "Bell/Glock", "Chime/Box", "Xylophone",
        "Iron Xylophone", "Cow Bell", "Didgeridoo", "Bit/Pluck", "Banjo", "Pling/Elec",
        "Copper Horn", "Exposed Copper Horn", "Weathered Copper Horn", "Oxidized Copper Horn"
    ];

    // 界面显示用的音色名: 内置 0-19 走 i18n (中文界面显示中文名), 其余回退英文原名
    function getInstName(instId) {
        var idx = parseInt(instId);
        if (!(idx >= 0)) return '无';
        var intl = window.WebNBSI18n;
        if (intl && typeof intl.instrumentName === 'function') {
            var localized = intl.instrumentName(idx);
            if (localized) return localized;
        }
        return INSTRUMENT_NAMES[idx] || ('乐器 ' + idx);
    }

    // NBS 音高名称 (0-87)
    var NOTE_NAMES = [];

    // ---- 导出 ----
    N.updatePianoKeyboardHighlight = updatePianoKeyboardHighlight;
    N.applyOctaveLabelSetting = applyOctaveLabelSetting;
    N.showTaskProgress = showTaskProgress;
    N.hideTaskProgress = hideTaskProgress;
    N.updateTaskProgress = updateTaskProgress;
    N.applyTaskProgress = applyTaskProgress;
    N.formatBytes = formatBytes;
    N.handleFileOpen = handleFileOpen;
    N.applyLoadedSongData = applyLoadedSongData;
    N.handleSave = handleSave;
    N.getInstName = getInstName;
    N._taskProgressTimer = _taskProgressTimer;
    N._taskProgressShown = _taskProgressShown;
    N._taskLastPercent = _taskLastPercent;
    N._taskLastSpeed = _taskLastSpeed;
    N._taskLastEta = _taskLastEta;
    N._taskLastLoaded = _taskLastLoaded;
    N._taskLastTotal = _taskLastTotal;
    N._taskLastPhase = _taskLastPhase;
    N._taskShowTime = _taskShowTime;
    N._hideTaskTimer = _hideTaskTimer;
    N._phaseNames = _phaseNames;
    N.INSTRUMENT_NAMES = INSTRUMENT_NAMES;
    N.NOTE_NAMES = NOTE_NAMES;
    N.formatTime = formatTime;
})(window.WebNBS);
