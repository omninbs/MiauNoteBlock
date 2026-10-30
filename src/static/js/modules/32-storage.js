/* 32-storage.js — MiauNoteBlock 功能模块
   来源: 原 main.js L19684-L20204; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    function tabGetActive() { return N.tabGetActive.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function tabMarkSaved() { return N.tabMarkSaved.apply(this, arguments); }
    function tabOpenInNewTabIfNeeded() { return N.tabOpenInNewTabIfNeeded.apply(this, arguments); }
    function resetStreamingLyrics() { return N.resetStreamingLyrics.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateUndoRedoButtons() { return N.updateUndoRedoButtons.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function updateSongInfo() { return N.updateSongInfo.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function tabStash() { return N.tabStash.apply(this, arguments); }
    function renderTabs() { return N.renderTabs.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }


    function hideHistorySubmenu() {
        var sub = document.getElementById('history-submenu');
        if (sub) sub.remove();
    }

    // 清理孤儿 nbs_file_* 文件 (历史列表中被截断的旧文件)
    function cleanupOrphanedFiles() {
        try {
            var history = getHistoryFiles();
            var validIds = {};
            for (var i = 0; i < history.length; i++) {
                validIds[history[i].id] = true;
            }
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('nbs_file_') === 0) {
                    var fileId = key.substring('nbs_file_'.length);
                    if (!validIds[fileId]) {
                        keysToRemove.push(key);
                    }
                }
            }
            for (var k = 0; k < keysToRemove.length; k++) {
                localStorage.removeItem(keysToRemove[k]);
            }
            if (keysToRemove.length > 0) {
                console.info('已清理 ' + keysToRemove.length + ' 个孤儿历史文件');
            }
            // 同时清理 IndexedDB 中没有对应历史记录的孤儿文件
            projectDbKeys().then(function(ids) {
                var orphans = ids.filter(function(id) { return !validIds[id]; });
                if (!orphans.length) return;
                orphans.forEach(function(id) { projectDbDelete(id); });
                console.info('已清理 ' + orphans.length + ' 个 IndexedDB 孤儿文件');
            }).catch(function() {});
            return keysToRemove.length;
        } catch(e) {
            console.warn('清理孤儿文件失败:', e);
            return 0;
        }
    }

    // 尝试保存到 localStorage, 配额超限时自动清理最旧文件后重试
    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch(e) {
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                // 历史文件已改存 IndexedDB, 这里的配额压力主要来自自动保存快照。
                // 依次释放最旧的历史记录与快照, 尽量保住用户最新的工作内容。
                try {
                    var history = getHistoryFiles();
                    while (history.length > 1) {
                        var oldest = history.pop();
                        projectDbDelete(oldest.id);
                        try { localStorage.removeItem('nbs_file_' + oldest.id); } catch(e2) {}
                        try {
                            localStorage.setItem('nbs_history', JSON.stringify(history));
                            localStorage.setItem(key, value);
                            console.info('配额超限, 已清理最旧的历史记录: ' + oldest.id);
                            return true;
                        } catch(e2) {
                            continue;
                        }
                    }
                    try { localStorage.removeItem('noteblockweb_data'); } catch(e3) {}
                    try {
                        localStorage.setItem(key, value);
                        console.info('清理自动保存数据后重试成功');
                        return true;
                    } catch(e3) {
                        console.warn('localStorage 配额严重不足, 保存失败:', e3);
                        return false;
                    }
                } catch(e2) {
                    console.warn('清理配额失败:', e2);
                    return false;
                }
            }
            console.warn('localStorage 保存失败:', e);
            return false;
        }
    }

    function saveFileToLocalStorage(silent) {
        // 保存歌曲元数据 (author/original_author/description/name)
        var songMeta = state.song || {};
        var data = {
            song: {
                name: songMeta.name || songMeta.song_name || 'Untitled',
                song_name: songMeta.name || songMeta.song_name || 'Untitled',
                author: songMeta.author || '',
                original_author: songMeta.original_author || '',
                description: songMeta.description || '',
                tempo: state.tempo,
                notes: state.notes,
                layers: songMeta.layers || [],
                solo_layers: Array.isArray(songMeta.solo_layers) ? songMeta.solo_layers.slice() : [],
                lyrics: JSON.parse(JSON.stringify(state.lyrics || []))
            },
            notes: state.notes,
            tempo: state.tempo,
            tracks: JSON.parse(JSON.stringify(state.tracks || [])),
            solo_layers: Array.isArray(songMeta.solo_layers) ? songMeta.solo_layers.slice() : []
        };
        var history = getHistoryFiles();
        // 使用当前文件的持久 ID (多次保存覆盖同一文件, 不产生重复)
        if (!state.currentFileId) {
            state.currentFileId = Date.now().toString();
        }
        // 当前标签页记录持久 ID, 切换标签页后可继续覆盖同一文件
        var _activeTabForSave = tabGetActive();
        if (_activeTabForSave && _activeTabForSave.snapshot) {
            _activeTabForSave.snapshot.fileId = state.currentFileId;
        }
        var id = state.currentFileId;
        var name = (state.song && (state.song.name || state.song.song_name)) || 'Untitled';
        // 查找是否已有该 ID 的历史记录
        var existingIdx = -1;
        for (var i = 0; i < history.length; i++) {
            if (history[i].id === id) { existingIdx = i; break; }
        }
        var entry = { id: id, name: name, date: new Date().toLocaleString(), ts: Date.now(), size: state.notes.length, tempo: state.tempo };
        if (existingIdx >= 0) {
            // 覆盖已有记录, 但保持在列表中的位置
            history[existingIdx] = entry;
        } else {
            history.unshift(entry);
            // 上限 12 条 (与欢迎界面「最近歌曲」显示条数一致), 超出部分连同文件一起清理
            if (history.length > 12) {
                var removed = history.splice(12);
                // 被截断的记录连同 IndexedDB 中的文件一起清理
                for (var r = 0; r < removed.length; r++) {
                    projectDbDelete(removed[r].id);
                    try { localStorage.removeItem('nbs_file_' + removed[r].id); } catch(e) {}
                }
            }
        }
        var historyOk = safeSetItem('nbs_history', JSON.stringify(history));
        // 歌曲数据写入 IndexedDB (容量远大于 localStorage, 不会再触发配额清理)
        projectDbPut(id, data).then(function() {
            if (!silent) showAppAlert('保存成功', {title: '保存', icon: 'fa-solid fa-circle-check'});
            tabMarkSaved();
        }).catch(function() {
            // IndexedDB 不可用时的回退: 仍尝试写入 localStorage
            var fileOk = safeSetItem('nbs_file_' + id, JSON.stringify(data));
            if (fileOk) tabMarkSaved();
            if (!silent) {
                if (fileOk) {
                    showAppAlert('保存成功', {title: '保存', icon: 'fa-solid fa-circle-check'});
                } else {
                    showAppAlert('存储空间不足, 部分数据可能未保存', {title: '警告', icon: 'fa-solid fa-triangle-exclamation'});
                }
            }
        });
        return historyOk;
    }

    // 自动保存定时器 (每 15 秒保存一次)
    var _autoSaveIntervalMs = 15000;
    var _autoSaveIntervalTimer = null;

    function startAutoSaveInterval() {
        if (_autoSaveIntervalTimer) clearInterval(_autoSaveIntervalTimer);
        _autoSaveIntervalTimer = setInterval(function() {
            // 只在有音符且不在播放时自动保存 (避免播放时序列化阻塞)
            if (state.notes && state.notes.length > 0 && !state.isPlaying) {
                // 使用 setTimeout(0) 推迟到下一帧, 避免阻塞 UI
                setTimeout(function() {
                    saveFileToLocalStorage(true);
                }, 0);
            }
        }, _autoSaveIntervalMs);
    }

    // 播放时保存 (延迟执行, 避免阻塞播放启动)
    function saveOnPlay() {
        if (state.notes && state.notes.length > 0) {
            setTimeout(function() {
                saveFileToLocalStorage(true);
            }, 100);
        }
    }

    // ============ 历史项目数据存储 (IndexedDB) ============
    // 歌曲数据体积大 (单首常见 200KB~1MB), 而 localStorage 配额仅约 5MB。
    // 早期把历史文件存在 localStorage, 配额超限后会被自动清理, 表现为
    // 「本地数据已被清理」。现改为存 IndexedDB, localStorage 只保留轻量元数据。
    var PROJECT_DB = 'webnbs_projects';
    var PROJECT_STORE = 'files';
    var PROJECT_MIGRATED_KEY = 'webnbs_projects_migrated_v1';
    var _projectDbPromise = null;

    function openProjectDB() {
        if (_projectDbPromise) return _projectDbPromise;
        _projectDbPromise = new Promise(function(resolve, reject) {
            if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
            var req;
            try { req = indexedDB.open(PROJECT_DB, 1); }
            catch (e) { reject(e); return; }
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
        // 打开失败时清掉缓存, 便于下次重试
        _projectDbPromise.catch(function() { _projectDbPromise = null; });
        return _projectDbPromise;
    }

    function projectDbPut(id, data) {
        return openProjectDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(PROJECT_STORE, 'readwrite');
                tx.objectStore(PROJECT_STORE).put(data, String(id));
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { reject(tx.error); };
                tx.onabort = function() { reject(tx.error || new Error('put aborted')); };
            });
        });
    }

    function projectDbGet(id) {
        return openProjectDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(PROJECT_STORE, 'readonly');
                var rq = tx.objectStore(PROJECT_STORE).get(String(id));
                rq.onsuccess = function() { resolve(rq.result || null); };
                rq.onerror = function() { reject(rq.error); };
            });
        });
    }

    function projectDbDelete(id) {
        return openProjectDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(PROJECT_STORE, 'readwrite');
                    tx.objectStore(PROJECT_STORE).delete(String(id));
                    tx.oncomplete = function() { resolve(true); };
                    tx.onerror = function() { resolve(false); };
                } catch (e) { resolve(false); }
            });
        }).catch(function() { return false; });
    }

    function projectDbKeys() {
        return openProjectDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(PROJECT_STORE, 'readonly');
                    var rq = tx.objectStore(PROJECT_STORE).getAllKeys();
                    rq.onsuccess = function() { resolve((rq.result || []).map(String)); };
                    rq.onerror = function() { resolve([]); };
                } catch (e) { resolve([]); }
            });
        }).catch(function() { return []; });
    }

    function measureStoredValue(v) {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'string') return v.length * 2;
        if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size || 0;
        if (typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer) return v.byteLength || 0;
        try { return JSON.stringify(v).length * 2; } catch (e) { return 0; }
    }

    // 估算 IndexedDB 中某个 objectStore 的占用字节数 (库不存在时返回 0)
    function estimateStoreBytes(dbName, storeName) {
        return new Promise(function(resolve) {
            if (!window.indexedDB) { resolve(0); return; }
            var req;
            try { req = indexedDB.open(dbName); }
            catch (e) { resolve(0); return; }
            req.onupgradeneeded = function() {
                // 库不存在会被隐式创建, 立即回滚避免留下空库
                try { req.transaction.abort(); } catch (e) {}
            };
            req.onsuccess = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(0); return; }
                var total = 0;
                try {
                    var tx = db.transaction(storeName, 'readonly');
                    var store = tx.objectStore(storeName);
                    var keysReq = store.getAllKeys();
                    keysReq.onsuccess = function() {
                        var keys = keysReq.result || [];
                        if (!keys.length) { db.close(); resolve(0); return; }
                        var pending = keys.length;
                        keys.forEach(function(k) {
                            var vReq = store.get(k);
                            vReq.onsuccess = function() {
                                total += measureStoredValue(vReq.result);
                                if (--pending === 0) { db.close(); resolve(total); }
                            };
                            vReq.onerror = function() {
                                if (--pending === 0) { db.close(); resolve(total); }
                            };
                        });
                    };
                    keysReq.onerror = function() { db.close(); resolve(0); };
                } catch (e) { db.close(); resolve(0); }
            };
            req.onerror = function() { resolve(0); };
            req.onblocked = function() { resolve(0); };
        });
    }

    // 迁移旧版数据: 把 localStorage 中的 nbs_file_* 搬到 IndexedDB (仅执行一次)
    function migrateProjectsToIndexedDB() {
        var already = false;
        try { already = localStorage.getItem(PROJECT_MIGRATED_KEY) === '1'; } catch (e) { already = true; }
        if (already) return Promise.resolve(false);

        var legacyKeys = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('nbs_file_') === 0) legacyKeys.push(key);
            }
        } catch (e) { legacyKeys = []; }

        if (!legacyKeys.length) {
            try { localStorage.setItem(PROJECT_MIGRATED_KEY, '1'); } catch (e) {}
            return Promise.resolve(false);
        }

        var moved = 0;
        var jobs = legacyKeys.map(function(key) {
            var id = key.substring('nbs_file_'.length);
            var data = null;
            try {
                var raw = localStorage.getItem(key);
                data = raw ? JSON.parse(raw) : null;
            } catch (e) { data = null; }
            if (!data) {
                try { localStorage.removeItem(key); } catch (e) {}
                return Promise.resolve();
            }
            return projectDbPut(id, data).then(function() {
                moved++;
                try { localStorage.removeItem(key); } catch (e) {}
            }).catch(function() {});
        });

        return Promise.all(jobs).then(function() {
            if (moved === legacyKeys.length) {
                try { localStorage.setItem(PROJECT_MIGRATED_KEY, '1'); } catch (e) {}
            }
            if (moved === 0) return false;
            // 迁移成功的历史条目解除「已清理」标记, 让用户之前的作品重新可用
            return projectDbKeys().then(function(ids) {
                var idSet = {};
                ids.forEach(function(k) { idSet[k] = true; });
                try {
                    var history = getHistoryFiles();
                    var changed = false;
                    history.forEach(function(h) {
                        if (h.missing && idSet[String(h.id)]) { delete h.missing; changed = true; }
                    });
                    if (changed) localStorage.setItem('nbs_history', JSON.stringify(history));
                } catch (e) {}
                return true;
            });
        });
    }

    function getHistoryFiles() {
        try { return JSON.parse(localStorage.getItem('nbs_history') || '[]'); } catch(e) { return []; }
    }

    // 应用已取出的存档数据 (来源可能是 IndexedDB, 也可能是 localStorage 回退)
    function applyStoredFileData(data, id) {
        // 兼容旧格式: 早期只保存了 data.song, 没有顶层 data.notes
        var song = data && data.song ? data.song : {};
        var notes = Array.isArray(data && data.notes) ? data.notes
            : (Array.isArray(song.notes) ? song.notes : []);
        if (!data || (!data.song && !Array.isArray(data.notes) && !Array.isArray(song.notes))) {
            showAppAlert('文件数据不完整', {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
            console.warn('[loadFileFromLocalStorage] id=' + id + ' 数据缺失:', data);
            return;
        }
        // 设置当前文件 ID, 后续保存将覆盖此文件
        // 打开历史文件: 当前标签页有内容时, 用新标签页打开
        tabOpenInNewTabIfNeeded();
        state.currentFileId = id;
        state.song = song;
        if (!state.song.layers) state.song.layers = [];
        state.tracks = Array.isArray(data.tracks)
            ? JSON.parse(JSON.stringify(data.tracks))
            : [];
        if (Array.isArray(data.solo_layers)) state.song.solo_layers = data.solo_layers.slice();
        state.lyrics = Array.isArray(data.lyrics)
            ? data.lyrics.slice()
            : (Array.isArray(song.lyrics) ? song.lyrics.slice() : []);
        resetStreamingLyrics();
        lyricRebuildIndex();
        syncLyricsToRoll();
        state.notes = notes;
        // 从历史记录加载，清除残留的 MIDI 音轨状态
        state.layerChannelMap = {};
        N.shared._midiTrackStates = {};
        state._channelTracks = {};
        state.tempo = data.tempo || song.tempo || 20;
        // 同步速度 UI
        $setValue('tempo-slider', state.tempo);
        $('tempo-value').value = state.tempo;
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
        $setValue('settings-tempo-input', state.tempo);
        $setText('settings-tempo-value', (state.tempo).toFixed(1));
        buildNoteIndex(state.notes);
        state.undoStack = [];
        state.redoStack = [];
        updateUndoRedoButtons();
        segmentEnsure();
        segmentSync();
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateSongInfo();
        updateTrackPanelUI();
        handleStop();
        markDirty();
        // 历史文件已存在: 清除未保存圆点
        tabStash();
        var _histTab = tabGetActive();
        if (_histTab) _histTab.dirty = false;
        renderTabs();
    }

    function loadFileFromLocalStorage(id) {
        // localStorage 回退: 兼容尚未迁移的旧数据, 以及 IndexedDB 不可用的环境
        var fromLocalStorage = function() {
            var raw = null;
            try { raw = localStorage.getItem('nbs_file_' + id); } catch (e) {}
            if (!raw) {
                showAppAlert('文件数据不存在，可能已被清理', {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
                return;
            }
            try {
                applyStoredFileData(JSON.parse(raw), id);
            } catch (e) {
                showAppAlert('加载失败: ' + formatError(e, '无法加载本地文件'), {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
            }
        };
        projectDbGet(id).then(function(data) {
            if (!data) { fromLocalStorage(); return; }
            try {
                applyStoredFileData(data, id);
            } catch (e) {
                showAppAlert('加载失败: ' + formatError(e, '无法加载本地文件'), {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
            }
        }).catch(function() { fromLocalStorage(); });
    }

    function showHistoryDialog() {
        // WinUI 3 / Fluent Design ContentDialog 风格
        var mask = document.createElement('div');
        mask.id = 'history-dialog-mask';
        mask.className = 'popup active';

        var history = getHistoryFiles();
        var tableHtml = '';
        if (history.length === 0) {
            tableHtml = '<div class="history-empty"><i class="fa-regular fa-folder-open"></i><p>暂无历史文件</p></div>';
        } else {
            tableHtml = '<div class="history-table-wrap"><table class="history-table">';
            tableHtml += '<thead><tr><th>名称</th><th>时间</th><th>大小</th><th class="history-action-col">操作</th></tr></thead><tbody>';
            for (var i = 0; i < history.length; i++) {
                var h = history[i];
                tableHtml += '<tr>';
                tableHtml += '<td class="history-name">' + escapeHTML(h.name) + '</td>';
                tableHtml += '<td class="history-date">' + (h.date || '') + '</td>';
                tableHtml += '<td class="history-size">' + (h.size || 0) + ' 音符</td>';
                tableHtml += '<td class="history-action"><button class="popup-btn popup-btn-primary" data-id="' + escapeHTML(h.id) + '">加载</button></td>';
                tableHtml += '</tr>';
            }
            tableHtml += '</tbody></table></div>';
        }

        var html = ''+
            '<div class="popup-content settings-dialog history-dialog">'+
                '<div class="settings-header">'+
                    '<i class="fa-solid fa-clock-rotate-left"></i>'+
                    '<h4>历史文件</h4>'+
                    '<button class="settings-close-btn" id="history-close-btn" title="关闭">&times;</button>'+
                '</div>'+
                '<div class="settings-body history-body">'+
                    tableHtml +
                '</div>'+
                '<div class="popup-actions">'+
                    '<button class="popup-btn popup-btn-cancel" id="history-close-btn-2">关闭</button>'+
                '</div>'+
            '</div>';

        mask.innerHTML = html;
        document.body.appendChild(mask);

        function close() { mask.remove(); }
        $('history-close-btn').addEventListener('click', close);
        $('history-close-btn-2').addEventListener('click', close);
        mask.addEventListener('click', function(e) { if (e.target === mask) close(); });

        var loadBtns = mask.querySelectorAll('.history-action .popup-btn');
        for (var j = 0; j < loadBtns.length; j++) {
            (function(btn){
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-id');
                    close();
                    loadFileFromLocalStorage(id);
                });
            })(loadBtns[j]);
        }
    }

    // 导出锁: 防止在导出过程中再次触发导出 (修复不刷新网页无法再次导出的问题)
    N.shared._isExporting = false;

    // ---- 导出 ----
    N.hideHistorySubmenu = hideHistorySubmenu;
    N.cleanupOrphanedFiles = cleanupOrphanedFiles;
    N.safeSetItem = safeSetItem;
    N.saveFileToLocalStorage = saveFileToLocalStorage;
    N._autoSaveIntervalMs = _autoSaveIntervalMs;
    N._autoSaveIntervalTimer = _autoSaveIntervalTimer;
    N.startAutoSaveInterval = startAutoSaveInterval;
    N.saveOnPlay = saveOnPlay;
    N.PROJECT_DB = PROJECT_DB;
    N.PROJECT_STORE = PROJECT_STORE;
    N.PROJECT_MIGRATED_KEY = PROJECT_MIGRATED_KEY;
    N._projectDbPromise = _projectDbPromise;
    N.openProjectDB = openProjectDB;
    N.projectDbPut = projectDbPut;
    N.projectDbGet = projectDbGet;
    N.projectDbDelete = projectDbDelete;
    N.projectDbKeys = projectDbKeys;
    N.measureStoredValue = measureStoredValue;
    N.estimateStoreBytes = estimateStoreBytes;
    N.migrateProjectsToIndexedDB = migrateProjectsToIndexedDB;
    N.getHistoryFiles = getHistoryFiles;
    N.applyStoredFileData = applyStoredFileData;
    N.loadFileFromLocalStorage = loadFileFromLocalStorage;
    N.showHistoryDialog = showHistoryDialog;
})(window.WebNBS);
