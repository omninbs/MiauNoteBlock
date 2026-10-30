/* 34-autosave.js — MiauNoteBlock 功能模块
   来源: 原 main.js L21264-L22050; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var STORAGE_KEY = N.STORAGE_KEY;
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    var PROJECT_DB = N.PROJECT_DB;
    var _appDialogStack = N._appDialogStack;
    function tabMarkDirty() { return N.tabMarkDirty.apply(this, arguments); }
    function safeSetItem() { return N.safeSetItem.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function createDefaultLayers() { return N.createDefaultLayers.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateUndoRedoButtons() { return N.updateUndoRedoButtons.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function resetStreamingLyrics() { return N.resetStreamingLyrics.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function segmentCaptureFromSong() { return N.segmentCaptureFromSong.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function updateSongInfo() { return N.updateSongInfo.apply(this, arguments); }
    function updateInstrumentSelectorUI() { return N.updateInstrumentSelectorUI.apply(this, arguments); }
    function updateAutoScrollBtnIcon() { return N.updateAutoScrollBtnIcon.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function updatePianoKeyboardHighlight() { return N.updatePianoKeyboardHighlight.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function getHistoryFiles() { return N.getHistoryFiles.apply(this, arguments); }
    function loadFileFromLocalStorage() { return N.loadFileFromLocalStorage.apply(this, arguments); }
    function resetToNewFile() { return N.resetToNewFile.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function projectDbDelete() { return N.projectDbDelete.apply(this, arguments); }
    function saveFileToLocalStorage() { return N.saveFileToLocalStorage.apply(this, arguments); }
    function showToast() { return N.showToast.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function performUndo() { return N.performUndo.apply(this, arguments); }
    function performRedo() { return N.performRedo.apply(this, arguments); }
    function seekToTick() { return N.seekToTick.apply(this, arguments); }
    function segmentCompose() { return N.segmentCompose.apply(this, arguments); }

    var _saveTimer = null;
    var _saveDebounceMs = 800;
    var _autoSaveQuotaWarned = false;

    function markDirty() {
        if (!N.shared._dirty) {
            N.shared._dirty = true;
        }
        // 当前标签页显示未保存圆点
        tabMarkDirty();
        // 防抖保存
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(autoSaveLocal, _saveDebounceMs);
    }

    function autoSaveLocal() {
        try {
            var data = {
                notes: state.notes,
                tempo: state.tempo,
                currentInstrument: state.currentInstrument,
                zoom: state.pianoRoll ? state.pianoRoll.zoom : 1,
                scrollX: state.pianoRoll ? state.pianoRoll.scrollX : 0,
                scrollY: state.pianoRoll ? state.pianoRoll.scrollY : 0,
                trackInfo: state.pianoRoll ? state.pianoRoll.trackInfo : {},
                smoothScroll: state.smoothScroll,
                selectedPianoKey: state.selectedPianoKey,
                song: state.song ? {
                    name: state.song.name || state.song.song_name,
                    song_name: state.song.name || state.song.song_name,
                    author: state.song.author || '',
                    original_author: state.song.original_author || '',
                    description: state.song.description || '',
                    layers: state.song.layers || [],
                    solo_layers: Array.isArray(state.song.solo_layers) ? state.song.solo_layers.slice() : [],
                    lyrics: JSON.parse(JSON.stringify(state.lyrics || []))
                } : null,
                lyrics: JSON.parse(JSON.stringify(state.lyrics || [])),
                segments: JSON.parse(JSON.stringify(state.segments || [])),
                segmentLanes: JSON.parse(JSON.stringify(state.segmentLanes || [])),
                segmentsEdited: !!state._segmentsEdited,
                currentFileId: state.currentFileId || null,
                savedAt: Date.now()
            };
            // 使用 safeSetItem, 配额超限时自动清理旧历史文件
            if (safeSetItem(STORAGE_KEY, JSON.stringify(data))) {
                N.shared._dirty = false;
                _autoSaveQuotaWarned = false;
            } else if (!_autoSaveQuotaWarned) {
                // 清理旧历史文件后仍写入失败: 提示一次, 避免用户误以为已保存
                _autoSaveQuotaWarned = true;
                showAppAlert('本地存储空间不足，自动保存未成功。请及时「导出 NBS」备份当前作品。', {
                    title: '自动保存失败',
                    icon: 'fa-solid fa-triangle-exclamation'
                });
            }
        } catch(e) {
            console.warn('保存本地数据失败:', e);
        }
    }

    function autoLoadLocal() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!data || !data.notes) return false;

            state.notes = data.notes || [];
            state.tempo = data.tempo || 20;
            state.currentInstrument = data.currentInstrument || 0;
            // 恢复上一次的持久文件 ID, 避免刷新后保存产生重复的历史记录
            state.currentFileId = data.currentFileId || null;
            // 兼容旧版 autoScrollMode 数据: 非 0 视为开启
            if (data.smoothScroll !== undefined) {
                state.smoothScroll = !!data.smoothScroll;
            } else if (data.autoScrollMode !== undefined) {
                state.smoothScroll = data.autoScrollMode !== 0;
            }
            // A refresh always returns to C4 so drawing has a predictable default.
            state.selectedPianoKey = 39;
            if (data.song) {
                state.song = {
                    name: data.song.name || '',
                    song_name: data.song.song_name || data.song.name || '',
                    author: data.song.author || '',
                    original_author: data.song.original_author || data.song.author || '',
                    description: data.song.description || '',
                    tempo: state.tempo,
                    notes: state.notes,
                    layers: data.song.layers || [],
                    solo_layers: Array.isArray(data.song.solo_layers) ? data.song.solo_layers.slice() : [],
                    lyrics: Array.isArray(data.song.lyrics) ? data.song.lyrics.slice() : []
                };
            }
            if (!state.song) {
                state.song = {
                    name: 'Untitled',
                    song_name: 'Untitled',
                    author: '',
                    original_author: '',
                    description: '',
                    tempo: state.tempo,
                    notes: state.notes,
                    layers: []
                };
            }
            if ((!state.notes || state.notes.length === 0) && (!state.song.layers || state.song.layers.length === 0)) {
                state.song.layers = createDefaultLayers(8);
            }

            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();

            if (state.pianoRoll) {
                state.pianoRoll.trackCount = state.song.layers ? state.song.layers.length : 8;
                state.pianoRoll.setNotes(state.notes);
                state.pianoRoll.setInstrument(state.currentInstrument);
                state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                if (data.zoom) state.pianoRoll.setZoom(data.zoom);
                if (data.scrollX !== undefined) state.pianoRoll.scrollX = data.scrollX;
                if (data.scrollY !== undefined) state.pianoRoll.scrollY = data.scrollY;
                if (data.trackInfo) state.pianoRoll.trackInfo = data.trackInfo;
                state.pianoRoll.setSelectedKey(state.selectedPianoKey);
            }

            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));

            state.lyrics = Array.isArray(data.lyrics)
                ? data.lyrics.slice()
                : (data.song && Array.isArray(data.song.lyrics) ? data.song.lyrics.slice() : []);
            resetStreamingLyrics();
            lyricRebuildIndex();
            syncLyricsToRoll();
            // 片段数据随自动保存一并恢复
            state._segmentIdSeq = 0;
            state._segmentsEdited = !!data.segmentsEdited;
            state.segmentLanes = [];
            if (Array.isArray(data.segmentLanes)) {
                for (var _sli = 0; _sli < data.segmentLanes.length; _sli++) {
                    var _sld = data.segmentLanes[_sli] || {};
                    state.segmentLanes.push({
                        id: _sli + 1,
                        muted: !!_sld.muted, solo: !!_sld.solo,
                        volume: isFinite(_sld.volume) ? _sld.volume : 100,
                        height: isFinite(_sld.height) ? _sld.height : SEG_DEFAULT_LANE_H
                    });
                }
            }
            state.segments = [];
            var _savedSegs = Array.isArray(data.segments) ? data.segments : [];
            for (var _sgi = 0; _sgi < _savedSegs.length; _sgi++) {
                var _sgd = _savedSegs[_sgi];
                if (!_sgd || !isFinite(_sgd.start) || !isFinite(_sgd.end)) continue;
                var _sgs = Math.max(0, Math.floor(_sgd.start));
                var _sge = Math.max(_sgs + 1, Math.floor(_sgd.end));
                var _sn2 = [];
                if (Array.isArray(_sgd.notes)) {
                    for (var _sni = 0; _sni < _sgd.notes.length; _sni++) {
                        var _snd = _sgd.notes[_sni];
                        if (!_snd) continue;
                        _sn2.push({
                            rel: isFinite(_snd.rel) ? _snd.rel : 0,
                            layer: isFinite(_snd.layer) ? _snd.layer : 0,
                            instrument: _snd.instrument, key: _snd.key,
                            velocity: isFinite(_snd.velocity) ? _snd.velocity : 100,
                            pan: isFinite(_snd.pan) ? _snd.pan : 100,
                            pitch: _snd.pitch || 0
                        });
                    }
                }
                state.segments.push({
                    id: ++state._segmentIdSeq,
                    lane: isFinite(_sgd.lane) ? _sgd.lane : 0,
                    start: _sgs, end: _sge,
                    name: _sgd.name || ('片段 ' + (_sgi + 1)),
                    notes: _sn2
                });
            }
            segmentEnsure();
            var _autoSegHasNotes = false;
            for (var _achk = 0; _achk < state.segments.length; _achk++) {
                if (state.segments[_achk].notes && state.segments[_achk].notes.length) { _autoSegHasNotes = true; break; }
            }
            if (!_autoSegHasNotes && state.notes && state.notes.length) segmentCaptureFromSong();
            segmentSync();
            updateSongInfo();
            updateInstrumentSelectorUI();
            updateAutoScrollBtnIcon();
            updateTrackPanelUI();
            updateNoteCount();
            updateProgressUI();
            handleStop();
            updatePianoKeyboardHighlight();

            N.shared._dirty = false;
            return true;
        } catch(e) {
            console.warn('加载本地数据失败:', e);
            return false;
        }
    }

    function clearAutoSaveLocal() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            N.shared._dirty = false;
        } catch(e) {}
    }

    // ============ 欢迎引导界面 ============
    function formatRelativeTime(ts) {
        if (!ts || typeof ts !== 'number') return '';
        var diff = Date.now() - ts;
        if (diff < 0) diff = 0;
        var min = Math.floor(diff / 60000);
        if (min < 1) return i18nText('刚刚');
        if (min < 60) return min + ' ' + i18nText('分钟前');
        var hour = Math.floor(min / 60);
        if (hour < 24) return hour + ' ' + i18nText('小时前');
        var day = Math.floor(hour / 24);
        if (day < 7) return day + ' ' + i18nText('天前');
        if (day < 30) return Math.floor(day / 7) + ' ' + i18nText('周前');
        var month = Math.floor(day / 30);
        if (month < 12) return month + ' ' + i18nText('个月前');
        return Math.floor(month / 12) + ' ' + i18nText('年前');
    }

    // 查找可恢复的编辑内容: 优先实时快照, 再退回历史文件
    function getRecoverableInfo() {
        var info = { has: false, source: '', fileId: null, name: '', savedAt: 0, noteCount: 0 };
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var d = JSON.parse(raw);
                var count = (d && Array.isArray(d.notes)) ? d.notes.length : 0;
                if (count > 0) {
                    info.has = true;
                    info.source = 'snapshot';
                    info.name = (d.song && (d.song.name || d.song.song_name)) || 'Untitled';
                    info.savedAt = d.savedAt || 0;
                    info.noteCount = count;
                    return info;
                }
            }
        } catch (e) {}
        var history = getHistoryFiles();
        for (var hi = 0; hi < history.length; hi++) {
            if (!history[hi].missing) {
                var h = history[hi];
                info.has = true;
                info.source = 'history';
                info.fileId = h.id;
                info.name = h.name || 'Untitled';
                info.savedAt = typeof h.ts === 'number' ? h.ts : 0;
                info.noteCount = h.size || 0;
                break;
            }
        }
        return info;
    }

    function updateWelcomeResumeHint() {
        var btn = $('welcome-resume');
        if (!btn) return;
        var hint = $('welcome-resume-hint');
        var info = getRecoverableInfo();
        if (!info.has) {
            btn.disabled = true;
            btn.style.opacity = '0.45';
            btn.style.cursor = 'default';
            if (hint) hint.textContent = i18nText('暂无记录');
            return;
        }
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        if (hint) {
            var when = formatRelativeTime(info.savedAt);
            var countText = info.noteCount + ' ' + i18nText('音符');
            hint.textContent = when ? (when + ' · ' + countText) : countText;
        }
    }

    // 最近歌曲列表最多显示的条数 (超出部分可滚动)
    var WELCOME_RECENT_LIMIT = 12;

    function renderWelcomeRecent() {
        var list = $('welcome-recent-list');
        if (!list) return;
        list.innerHTML = '';
        var history = getHistoryFiles().slice(0, WELCOME_RECENT_LIMIT);
        if (!history.length) {
            var empty = document.createElement('div');
            empty.className = 'welcome-recent-empty';
            empty.textContent = i18nText('暂无最近打开的项目');
            list.appendChild(empty);
            return;
        }
        history.forEach(function(h) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'welcome-recent-item' + (h.missing ? ' missing' : '');
            var nameEl = document.createElement('span');
            nameEl.className = 'welcome-recent-name';
            nameEl.textContent = h.name || 'Untitled';
            nameEl.title = h.missing ? (i18nText('本地数据已被清理') ) : (h.name || 'Untitled');
            var timeEl = document.createElement('span');
            timeEl.className = 'welcome-recent-time';
            timeEl.textContent = formatRelativeTime(h.ts) || (h.date || '');
            row.appendChild(nameEl);
            row.appendChild(timeEl);
            if (!h.missing) {
                row.addEventListener('click', function() {
                    hideWelcomeScreen();
                    loadFileFromLocalStorage(h.id);
                });
            }
            list.appendChild(row);
        });
    }

    function showWelcomeScreen() {
        var el = $('welcome-screen');
        if (!el) return;
        renderWelcomeRecent();
        updateWelcomeResumeHint();
        el.style.display = 'flex';
    }

    function hideWelcomeScreen() {
        var el = $('welcome-screen');
        if (el) el.style.display = 'none';
    }

    // 打开上一次的项目: 优先恢复实时快照, 否则加载最近的历史文件
    function welcomeResume() {
        var info = getRecoverableInfo();
        if (!info.has) {
            showAppAlert('暂无可恢复的项目', { title: '打开上一次的项目', icon: 'fa-solid fa-clock-rotate-left' });
            return;
        }
        hideWelcomeScreen();
        if (info.source === 'snapshot') {
            if (!autoLoadLocal()) resetToNewFile(false);
        } else {
            loadFileFromLocalStorage(info.fileId);
        }
    }

    function welcomeCreateNew() {
        var info = getRecoverableInfo();
        hideWelcomeScreen();
        if (!info.has) {
            clearAutoSaveLocal();
            resetToNewFile(true);
            return;
        }
        showAppConfirm('检测到上一次的编辑内容，新建歌曲会将其清空且无法恢复。是否继续？', {
            title: '新建歌曲',
            icon: 'fa-solid fa-file-circle-plus'
        }).then(function(ok) {
            if (ok) {
                clearAutoSaveLocal();
                resetToNewFile(true);
            } else {
                showWelcomeScreen();
            }
        });
    }

    function initWelcomeScreen() {
        var el = $('welcome-screen');
        if (!el) return;
        var newBtn = $('welcome-new');
        var openBtn = $('welcome-open');
        var midiBtn = $('welcome-midi');
        var resumeBtn = $('welcome-resume');

        if (newBtn) newBtn.addEventListener('click', welcomeCreateNew);
        if (openBtn) openBtn.addEventListener('click', function() {
            var input = $('file-input');
            if (input) {
                input.accept = '.nbs,.mid,.midi,.zip';
                input.click();
            }
        });
        if (midiBtn) midiBtn.addEventListener('click', function() {
            var input = $('file-input');
            if (input) {
                input.accept = '.mid,.midi';
                input.click();
            }
        });
        if (resumeBtn) resumeBtn.addEventListener('click', welcomeResume);

        // 版本号: 与 config.yaml 的 release.version 保持一致
        fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
            if (cfg && cfg.release && cfg.release.version && $('welcome-version')) {
                $('welcome-version').textContent = cfg.release.version;
            }
        }).catch(function() {});

        showWelcomeScreen();
    }

    // ============ 本地缓存占用检查与清理 ============
    var STORAGE_WARN_BYTES = 100 * 1024 * 1024;      // 提醒阈值 100 MB
    var STORAGE_SNOOZE_KEY = 'webnbs_storage_warn_snooze';
    var STORAGE_SNOOZE_STEP = 50 * 1024 * 1024;      // 忽略后需再增长 50 MB 才重新提醒
    var STORAGE_KEEP_RECENT = 3;                     // 清理历史时保留的最近记录数

    function formatStorageSize(bytes) {
        bytes = bytes || 0;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function measureLocalStorageBytes() {
        var total = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k) continue;
                var v = localStorage.getItem(k) || '';
                total += (k.length + v.length) * 2;
            }
        } catch (e) {}
        return total;
    }

    // 统计各部分占用: 设置/元数据, 历史项目, 自定义音色, 音色库, 背景图
    function collectStorageBreakdown() {
        return Promise.all([
            estimateStoreBytes(PROJECT_DB, PROJECT_STORE),
            estimateStoreBytes('webnbs_custom_instruments', 'audio'),
            estimateStoreBytes('webnbs_soundfont', 'files'),
            estimateStoreBytes('webnbs_bg', 'kv')
        ]).then(function(res) {
            var localBytes = measureLocalStorageBytes();
            return {
                settings: localBytes,
                projects: res[0],
                customInstruments: res[1],
                soundfont: res[2],
                background: res[3],
                total: localBytes + res[0] + res[1] + res[2] + res[3]
            };
        });
    }

    function getStorageSnoozeBytes() {
        try {
            var raw = localStorage.getItem(STORAGE_SNOOZE_KEY);
            var n = raw ? parseInt(raw, 10) : 0;
            return isFinite(n) ? n : 0;
        } catch (e) { return 0; }
    }

    function checkStorageUsage() {
        collectStorageBreakdown().then(function(b) {
            if (b.total < STORAGE_WARN_BYTES) return;
            // 用户点过「忽略」时, 只有占用继续明显增长才再次提醒
            var snoozed = getStorageSnoozeBytes();
            if (snoozed && b.total < snoozed + STORAGE_SNOOZE_STEP) return;
            showStorageCleanupDialog(b);
        }).catch(function() {});
    }

    function clearObjectStore(dbName, storeName) {
        return new Promise(function(resolve) {
            if (!window.indexedDB) { resolve(false); return; }
            var req;
            try { req = indexedDB.open(dbName); } catch (e) { resolve(false); return; }
            req.onupgradeneeded = function() { try { req.transaction.abort(); } catch (e) {} };
            req.onsuccess = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(false); return; }
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).clear();
                    tx.oncomplete = function() { db.close(); resolve(true); };
                    tx.onerror = function() { db.close(); resolve(false); };
                    tx.onabort = function() { db.close(); resolve(false); };
                } catch (e2) { db.close(); resolve(false); }
            };
            req.onerror = function() { resolve(false); };
            req.onblocked = function() { resolve(false); };
        });
    }

    function showStorageCleanupDialog(breakdown) {
        var overlay = _appDialogOverlay();
        var box = _appDialogBox(i18nText('本地缓存占用提醒'), '', 'fa-solid fa-hard-drive', { maxWidth: 520 });
        var body = box.querySelector('.settings-body');
        body.style.whiteSpace = 'normal';
        body.innerHTML = '';

        var desc = document.createElement('p');
        desc.className = 'storage-clean-desc';
        desc.textContent = i18nText('本地缓存占用已超过 100 MB，可勾选下方内容进行清理，或选择忽略。');
        body.appendChild(desc);

        var list = document.createElement('div');
        list.className = 'storage-clean-list';
        body.appendChild(list);

        var items = [
            { key: 'projects', label: i18nText('历史歌曲数据'), size: breakdown.projects, checked: true },
            {
                key: 'customInstruments', label: i18nText('自定义音色音频'), size: breakdown.customInstruments,
                checked: true, warn: i18nText('清理后自定义音色会被移除，内置音色不受影响。')
            },
            {
                key: 'soundfont', label: i18nText('音色库文件'), size: breakdown.soundfont, checked: false,
                warn: i18nText('清理后需要重新下载音色库，且可能导致 MIDI 音色不准确或丢失。')
            },
            { key: 'background', label: i18nText('背景图片'), size: breakdown.background, checked: true }
        ];

        var inputs = {};
        items.forEach(function(it) {
            var row = document.createElement('label');
            row.className = 'storage-clean-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = it.checked && it.size > 0;
            if (!it.size) cb.disabled = true;
            inputs[it.key] = cb;

            var name = document.createElement('span');
            name.className = 'storage-clean-name';
            name.textContent = it.label;
            var size = document.createElement('span');
            size.className = 'storage-clean-size';
            size.textContent = formatStorageSize(it.size);

            row.appendChild(cb);
            row.appendChild(name);
            row.appendChild(size);
            list.appendChild(row);

            if (it.warn) {
                var warn = document.createElement('div');
                warn.className = 'storage-clean-warn';
                warn.textContent = it.warn;
                list.appendChild(warn);
            }
        });

        var totalEl = document.createElement('div');
        totalEl.className = 'storage-clean-total';
        totalEl.textContent = i18nText('当前总占用') + ': ' + formatStorageSize(breakdown.total);
        body.appendChild(totalEl);

        var close = function() { _closeAppDialog(overlay); };
        var ignoreBtn = _appDialogBtn(i18nText('忽略'), false);
        var cleanBtn = _appDialogBtn(i18nText('立即清理'), true);

        ignoreBtn.addEventListener('click', function() {
            // 记住本次占用, 只有继续明显增长才会再次提醒
            try { localStorage.setItem(STORAGE_SNOOZE_KEY, String(breakdown.total)); } catch (e) {}
            close();
        });

        cleanBtn.addEventListener('click', function() {
            var picked = Object.keys(inputs).filter(function(k) {
                return inputs[k].checked && !inputs[k].disabled;
            });
            close();
            if (!picked.length) return;
            performStorageCleanup(picked);
        });

        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var actions = box.querySelector('.popup-actions');
        actions.appendChild(ignoreBtn);
        actions.appendChild(cleanBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
    }

    function performStorageCleanup(picked) {
        var needsReload = false;
        var jobs = [];

        if (picked.indexOf('projects') >= 0) {
            // 保留最近若干条与当前正在编辑的作品, 其余连同文件一起删除
            var history = getHistoryFiles();
            var keepIds = {};
            var kept = 0;
            for (var i = 0; i < history.length; i++) {
                var isCurrent = state.currentFileId && String(history[i].id) === String(state.currentFileId);
                if (isCurrent || kept < STORAGE_KEEP_RECENT) {
                    keepIds[String(history[i].id)] = true;
                    if (!isCurrent) kept++;
                }
            }
            history.forEach(function(h) {
                if (!keepIds[String(h.id)]) jobs.push(projectDbDelete(h.id));
            });
            var keptList = history.filter(function(h) { return keepIds[String(h.id)]; });
            safeSetItem('nbs_history', JSON.stringify(keptList));
        }

        if (picked.indexOf('customInstruments') >= 0) {
            needsReload = true;
            jobs.push(clearObjectStore('webnbs_custom_instruments', 'audio'));
            try { localStorage.removeItem('webnbs_custom_list'); } catch (e) {}
        }

        if (picked.indexOf('soundfont') >= 0) {
            needsReload = true;
            jobs.push(clearObjectStore('webnbs_soundfont', 'files'));
        }

        if (picked.indexOf('background') >= 0) {
            needsReload = true;
            jobs.push(clearObjectStore('webnbs_bg', 'kv'));
            try {
                localStorage.removeItem('bg_filename');
                localStorage.removeItem('bg_migrated_v2');
            } catch (e) {}
        }

        Promise.all(jobs).then(function() {
            try { localStorage.removeItem(STORAGE_SNOOZE_KEY); } catch (e) {}
            if (picked.indexOf('projects') >= 0 && $('welcome-screen')) {
                renderWelcomeRecent();
                updateWelcomeResumeHint();
            }
            if (needsReload) {
                return showAppConfirm('已清理所选内容。部分内容需要刷新页面后才会生效，是否立即刷新？', {
                    title: '清理完成',
                    icon: 'fa-solid fa-broom'
                }).then(function(ok) { if (ok) location.reload(); });
            }
            showAppAlert('已清理所选内容。', { title: '清理完成', icon: 'fa-solid fa-circle-check' });
        }).catch(function() {
            showAppAlert('清理过程中出现异常，请重试。', { title: '清理失败', icon: 'fa-solid fa-triangle-exclamation' });
        });
    }

    // 立即把待写入内容落盘 (用于防抖尚未触发时的紧急保存)
    var _lastFlushAt = 0;
    function flushPendingSave() {
        var now = Date.now();
        if (now - _lastFlushAt < 3000) return;
        _lastFlushAt = now;
        // 先写入最新快照 (含防抖未落盘的内容)
        if (N.shared._dirty) autoSaveLocal();
        // 再覆盖式写入历史文件, 保证「打开上一次的项目」拿到最新数据
        if (state.notes && state.notes.length > 0) {
            saveFileToLocalStorage(true);
        }
    }

    // 页面关闭前提醒
    window.addEventListener('beforeunload', function(e) {
        if (N.shared._dirty) {
            // 紧急保存一次
            autoSaveLocal();
            e.preventDefault();
            e.returnValue = '您有未保存的编辑内容，确定要离开吗？数据已自动保存到本地。';
            return e.returnValue;
        }
    });

    // 移动端/切后台/关闭标签页时 beforeunload 常常不触发, 用这两个事件兜底落盘
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') flushPendingSave();
    });
    window.addEventListener('pagehide', flushPendingSave);

    // ============ 通用 Tooltip 系统 ============
    // 所有带 title 属性的元素 (含动态创建): 悬浮显示, 延迟 0.4s
    // 使用自定义样式, 背景完整包裹文字; 显示时暂存并清除原生 title, 避免双重 tooltip
    (function() {
        var tooltipEl = null;
        var tooltipTimeout = null;
        var tooltipTarget = null;
        var TOOLTIP_DELAY = 400;

        function ensureTooltip() {
            if (tooltipEl) return;
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'btn-tooltip';
            tooltipEl.style.cssText = 'position:fixed;z-index:99999;padding:6px 10px;background:rgba(0,0,0,0.88);color:#fff;font-size:12px;line-height:1.45;border-radius:6px;pointer-events:none;opacity:0;transition:opacity 0.15s;max-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.3);word-break:break-word;white-space:normal;';
            document.body.appendChild(tooltipEl);
        }

        function showTooltip(el, text) {
            ensureTooltip();
            tooltipEl.textContent = text;
            tooltipEl.style.opacity = '1';
            var rect = el.getBoundingClientRect();
            var tw = tooltipEl.offsetWidth;
            var th = tooltipEl.offsetHeight;
            var x = rect.left + rect.width / 2 - tw / 2;
            x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
            var y = rect.bottom + 8;
            if (y + th > window.innerHeight - 8) {
                y = Math.max(8, rect.top - th - 8);
            }
            tooltipEl.style.left = x + 'px';
            tooltipEl.style.top = y + 'px';
        }

        function hideTooltip() {
            if (tooltipEl) tooltipEl.style.opacity = '0';
            tooltipTarget = null;
            if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
        }

        // 事件委托: 覆盖所有带 title 的元素 (含动态创建)
        document.addEventListener('mouseover', function(e) {
            var t = e.target;
            if (!t || !t.getAttribute) return;
            // 检测鼠标是否已离开当前 tooltipTarget (移入其外部元素)
            var tt = tooltipTarget;
            if (tt && tt !== t && !tt.contains(t)) {
                restoreTitle(tt);
                hideTooltip();
            }
            if (tooltipTarget === t) return;
            var title = t.getAttribute('title');
            if (!title) return;
            // 暂存并移除原生 title, 避免浏览器原生 tooltip 双重显示
            t.setAttribute('data-tt-title', title);
            t.removeAttribute('title');
            if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
            tooltipTarget = t;
            tooltipTimeout = setTimeout(function() { showTooltip(t, title); }, TOOLTIP_DELAY);
        });

        // 移出窗口/文档边界时兜底隐藏并恢复 title
        document.addEventListener('mouseout', function(e) {
            if (!e.relatedTarget && tooltipTarget) {
                restoreTitle(tooltipTarget);
                hideTooltip();
            }
        });

        // 点击时隐藏
        document.addEventListener('mousedown', hideTooltip);

        function restoreTitle(el) {
            if (!el) return;
            var orig = el.getAttribute('data-tt-title');
            if (orig !== null) {
                el.setAttribute('title', orig);
                el.removeAttribute('data-tt-title');
            }
        }

        // 兼容旧接口 (保留空实现, 动态元素已由委托覆盖)
        window.attachTooltips = function() {};
    })();

    // ============ 片段窗口宿主接口 ============
    // 供 segment_piano_window.js 使用: 只暴露必要能力, 不把整个内部实现变成公共 API
    window.WebNBS = window.WebNBS || {};
    window.WebNBS.host = {
        state: state,
        i18nText: i18nText,
        showToast: function(msg, opts) { return showToast(msg, opts); },
        pushUndo: function() { return pushUndo(); },
        performUndo: function() { return performUndo(); },
        performRedo: function() { return performRedo(); },
        markDirty: function() { return markDirty(); },
        segmentSync: function() { return segmentSync(); },
        seekToTick: function(tick, immediate) { return seekToTick(tick, immediate); },
        segmentCaptureFromSong: function() { return segmentCaptureFromSong(); },
        segmentCompose: function() { return segmentCompose(); }
    };

    // ============ 启动 ============
    document.addEventListener('DOMContentLoaded', init);

    // ---- 导出 ----
    N._saveTimer = _saveTimer;
    N._saveDebounceMs = _saveDebounceMs;
    N._autoSaveQuotaWarned = _autoSaveQuotaWarned;
    N.markDirty = markDirty;
    N.autoSaveLocal = autoSaveLocal;
    N.autoLoadLocal = autoLoadLocal;
    N.clearAutoSaveLocal = clearAutoSaveLocal;
    N.formatRelativeTime = formatRelativeTime;
    N.getRecoverableInfo = getRecoverableInfo;
    N.updateWelcomeResumeHint = updateWelcomeResumeHint;
    N.WELCOME_RECENT_LIMIT = WELCOME_RECENT_LIMIT;
    N.renderWelcomeRecent = renderWelcomeRecent;
    N.showWelcomeScreen = showWelcomeScreen;
    N.hideWelcomeScreen = hideWelcomeScreen;
    N.welcomeResume = welcomeResume;
    N.welcomeCreateNew = welcomeCreateNew;
    N.initWelcomeScreen = initWelcomeScreen;
    N.STORAGE_WARN_BYTES = STORAGE_WARN_BYTES;
    N.STORAGE_SNOOZE_STEP = STORAGE_SNOOZE_STEP;
    N.bytes = bytes;
    N.measureLocalStorageBytes = measureLocalStorageBytes;
    N.collectStorageBreakdown = collectStorageBreakdown;
    N.getStorageSnoozeBytes = getStorageSnoozeBytes;
    N.checkStorageUsage = checkStorageUsage;
    N.clearObjectStore = clearObjectStore;
    N.showStorageCleanupDialog = showStorageCleanupDialog;
    N.performStorageCleanup = performStorageCleanup;
    N._lastFlushAt = _lastFlushAt;
    N.flushPendingSave = flushPendingSave;
    N.WebNBS = WebNBS;
})(window.WebNBS);
