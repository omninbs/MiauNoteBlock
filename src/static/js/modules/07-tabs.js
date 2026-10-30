/* 07-tabs.js — MiauNoteBlock 功能模块
   来源: 原 main.js L2591-L3119; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function exitLyricsEditMode() { return N.exitLyricsEditMode.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function exitSegmentsEditMode() { return N.exitSegmentsEditMode.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateUndoRedoButtons() { return N.updateUndoRedoButtons.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function updateSongInfo() { return N.updateSongInfo.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function updateInstrumentSelectorUI() { return N.updateInstrumentSelectorUI.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function updatePianoKeyboardHighlight() { return N.updatePianoKeyboardHighlight.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function deepCloneNotes() { return N.deepCloneNotes.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function clearAutoSaveLocal() { return N.clearAutoSaveLocal.apply(this, arguments); }
    function getHistoryFiles() { return N.getHistoryFiles.apply(this, arguments); }
    function projectDbDelete() { return N.projectDbDelete.apply(this, arguments); }
    function safeSetItem() { return N.safeSetItem.apply(this, arguments); }
    function projectDbPut() { return N.projectDbPut.apply(this, arguments); }
    function saveFileToLocalStorage() { return N.saveFileToLocalStorage.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }


    function createDefaultLayers(count) {
        count = count || 8;
        var layers = [];
        for (var i = 0; i < count; i++) {
            layers.push({ name: 'Layer ' + (i + 1), volume: 100, stereo: 100, lock: 0 });
        }
        return layers;
    }

    function resetToNewFile(markAsDirty) {
        state.notes = [];
        state.tempo = 20;
        state.currentTick = 0;
        state.maxTick = 0;
        state.isPlaying = false;
        state.currentInstrument = 0;
        state.selectedPianoKey = 39;
        state.importedFileName = '';
        state.currentFileId = null;
        // 新建文件: 清空歌词标注 (歌词为内存数据, 不随新文件保留)
        state.lyrics = [];
        lyricRebuildIndex();
        exitLyricsEditMode();
        syncLyricsToRoll();
        // 新建文件: 片段重置为整个工程一个片段
        exitSegmentsEditMode();
        state.segments = [];
        state.segmentLanes = [];
        state.segmentClipboard = null;
        state._segmentIdSeq = 0;
        state._segmentsTouched = false;
        state._segmentsEdited = false;
        segmentEnsure();
        segmentSync();
        state.song = {
            name: 'Untitled',
            song_name: 'Untitled',
            author: '',
            original_author: '',
            description: '',
            tempo: 20,
            solo_layers: [],
            lyrics: [],
            notes: state.notes,
            layers: createDefaultLayers(8)
        };
        state.tracks = [];
        state.undoStack = [];
        state.redoStack = [];
        buildNoteIndex(state.notes);
        updateUndoRedoButtons();
        if (state.pianoRoll) {
            state.pianoRoll.clearSelection();
            state.pianoRoll.trackInfo = {};
            state.pianoRoll.trackCount = state.song.layers.length;
            state.pianoRoll.setNotes(state.notes);
            state.pianoRoll.setInstrument(state.currentInstrument);
            state.pianoRoll.scrollX = 0;
            state.pianoRoll.scrollY = 0;
            state.pianoRoll.playheadTick = 0;
            state.pianoRoll.currentTick = 0;
            state.pianoRoll.setSelectedKey(39);
            if (state.pianoRoll.clearPlayHighlights) state.pianoRoll.clearPlayHighlights();
            state.pianoRoll.render();
        }
        $setValue('tempo-slider', state.tempo);
        $setValue('tempo-value', state.tempo);
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
        $setValue('settings-tempo-input', state.tempo);
        $setText('settings-tempo-value', state.tempo.toFixed(1));
        updateSongInfo();
        updateTrackPanelUI();
        updateInstrumentSelectorUI();
        updateNoteCount();
        updateProgressUI();
        handleStop();
        updatePianoKeyboardHighlight();
        if (markAsDirty) markDirty();
        else N.shared._dirty = false;
    }

    function createNewFile() {
        var proceed = function() {
            // 多标签页: 新建文件 = 新建标签页, 当前工程保留
            tabNew();
        };
        if (N.shared._dirty || (state.notes && state.notes.length > 0)) {
            showAppConfirm('将新建一个空白标签页，当前工程会保留在标签页中。是否继续？', {
                title: '新建文件',
                icon: 'fa-solid fa-file-circle-plus'
            }).then(function(ok) {
                if (ok) proceed();
            });
        } else {
            proceed();
        }
    }

    // ============ 多文件标签页 ============
    // 每个标签页保存一份完整工程快照; 切换时整体换入换出
    // 剪贴板 (音符/歌词/片段) 为全局共享, 标签页之间天然互通
    function tabGetActive() {
        var tabs = state.tabs || [];
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id === state.activeTabId) return tabs[i];
        }
        return null;
    }

    function tabCapture() {
        var song = state.song || {};
        return {
            notes: deepCloneNotes(state.notes || []),
            layers: JSON.parse(JSON.stringify(song.layers || [])),
            meta: {
                name: song.name || song.song_name || 'Untitled',
                song_name: song.name || song.song_name || 'Untitled',
                author: song.author || '',
                original_author: song.original_author || '',
                description: song.description || '',
                time_signature: song.time_signature || 4,
                auto_save: song.auto_save || false,
                auto_save_minutes: song.auto_save_minutes || 0,
                loop: song.loop || 0,
                max_loop_count: song.max_loop_count || 0,
                loop_start: song.loop_start || 0,
                solo_layers: Array.isArray(song.solo_layers) ? song.solo_layers.slice() : []
            },
            tempo: state.tempo,
            currentTick: state.currentTick || 0,
            currentInstrument: state.currentInstrument,
            selectedPianoKey: state.selectedPianoKey,
            lyrics: JSON.parse(JSON.stringify(state.lyrics || [])),
            segments: JSON.parse(JSON.stringify(state.segments || [])),
            segmentLanes: JSON.parse(JSON.stringify(state.segmentLanes || [])),
            segmentSeq: state._segmentIdSeq || 0,
            segmentsTouched: !!state._segmentsTouched,
            segmentsEdited: !!state._segmentsEdited,
            importedFileName: state.importedFileName || '',
            fileId: state.currentFileId || null,
            // MIDI 相关元信息: 片段分割依赖 layer→channel 映射与 tick 换算参数
            layerChannelMap: JSON.parse(JSON.stringify(song.layer_channel_map || {})),
            channelNames: JSON.parse(JSON.stringify(song.channel_names || {})),
            midiMeta: song._midi_meta ? JSON.parse(JSON.stringify(song._midi_meta)) : null,
            zoom: state.pianoRoll ? state.pianoRoll.zoom : 1,
            scrollX: state.pianoRoll ? state.pianoRoll.scrollX : 0,
            scrollY: state.pianoRoll ? state.pianoRoll.scrollY : 0
        };
    }

    function tabApply(tab) {
        var s = tab.snapshot;
        if (!s) return;
        state.notes = deepCloneNotes(s.notes || []);
        state.tempo = s.tempo;
        state.currentTick = s.currentTick || 0;
        state.currentInstrument = s.currentInstrument;
        state.selectedPianoKey = s.selectedPianoKey;
        state.lyrics = JSON.parse(JSON.stringify(s.lyrics || []));
        state.segments = JSON.parse(JSON.stringify(s.segments || []));
        state.segmentLanes = JSON.parse(JSON.stringify(s.segmentLanes || []));
        state._segmentIdSeq = s.segmentSeq || 0;
        state._segmentsTouched = !!s.segmentsTouched;
        state._segmentsEdited = !!s.segmentsEdited;
        state.importedFileName = s.importedFileName || '';
        state.currentFileId = s.fileId || null;
        state.layerChannelMap = s.layerChannelMap || {};
        state.song = Object.assign({}, s.meta || {}, {
            notes: state.notes,
            layers: JSON.parse(JSON.stringify(s.layers || [])),
            layer_channel_map: s.layerChannelMap || {},
            channel_names: s.channelNames || {},
            _midi_meta: s.midiMeta || null
        });
        if (!state.song.layers || !state.song.layers.length) {
            state.song.layers = createDefaultLayers(8);
        }
        // 重建索引与 UI
        buildNoteIndex(state.notes);
        if (state.pianoRoll) {
            state.pianoRoll.setNotes(state.notes);
            state.pianoRoll.clearSelection();
            state.pianoRoll.setInstrument(state.currentInstrument);
            state.pianoRoll.zoom = s.zoom || 1;
            state.pianoRoll.zoomX = 1;
            state.pianoRoll.zoomY = 1;
            state.pianoRoll.scrollX = s.scrollX || 0;
            state.pianoRoll.scrollY = s.scrollY || 0;
            state.pianoRoll._smoothedPlayheadTick = null;
            state.pianoRoll.playheadTick = null;
            state.pianoRoll._fullRedrawNeeded = true;
        }
        updateTrackPanelUI();
        lyricRebuildIndex();
        syncLyricsToRoll();
        segmentSync();
        updateSongInfo();
        updateNoteCount();
        updateProgressUI();
        updateInstrumentSelectorUI();
        var tv = $('tempo-value');
        if (tv) tv.value = state.tempo;
        $setValue('tempo-slider', state.tempo);
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
        $setValue('settings-tempo-input', state.tempo);
        $setText('settings-tempo-value', (state.tempo).toFixed(1));
        state.undoStack = [];
        state.redoStack = [];
        updateUndoRedoButtons();
        if (state.pianoRoll) state.pianoRoll.render();
    }

    function renderTabs() {
        var wrap = $('editor-tabs');
        var list = $('editor-tabs-list');
        if (!wrap || !list) return;
        var tabs = state.tabs || [];
        if (tabs.length <= 1) {
            wrap.style.display = 'none';
            list.textContent = '';
            return;
        }
        wrap.style.display = '';
        wrap.setAttribute('data-count-label', i18nText('标签页') + ' (' + tabs.length + ')');
        list.textContent = '';
        for (var i = 0; i < tabs.length; i++) {
            (function(tab) {
                var el = document.createElement('div');
                el.className = 'editor-tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.dirty ? ' is-dirty' : '');
                el.setAttribute('data-tab-id', tab.id);
                el.title = tab.title || 'Untitled';
                var dot = document.createElement('span');
                dot.className = 'editor-tab-dirty';
                el.appendChild(dot);
                var tt = document.createElement('span');
                tt.className = 'editor-tab-title';
                tt.textContent = tab.title || 'Untitled';
                el.appendChild(tt);
                var close = document.createElement('button');
                close.className = 'editor-tab-close';
                close.type = 'button';
                close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                close.addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    tabClose(tab.id);
                });
                el.appendChild(close);
                el.addEventListener('click', function() { tabSwitch(tab.id); });
                list.appendChild(el);
            })(tabs[i]);
        }
    }

    function tabSyncMeta() {
        var tab = tabGetActive();
        if (!tab) return;
        var title = (state.song && (state.song.name || state.song.song_name)) || 'Untitled';
        if (tab.title === title) return;
        tab.title = title;
        renderTabs();
    }

    // 把当前编辑状态写回当前标签页的快照
    function tabStash() {
        var tab = tabGetActive();
        if (!tab) return;
        tab.snapshot = tabCapture();
        tab.title = (state.song && (state.song.name || state.song.song_name)) || tab.title || 'Untitled';
    }

    function tabSwitch(id) {
        if (id === state.activeTabId) return;
        tabStash();
        var target = null;
        var tabs = state.tabs || [];
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id === id) { target = tabs[i]; break; }
        }
        if (!target) return;
        exitSegmentsEditMode();
        state.activeTabId = id;
        tabApply(target);
        renderTabs();
    }

    function tabNew() {
        tabStash();
        exitSegmentsEditMode();
        clearAutoSaveLocal();
        resetToNewFile(false);
        var tab = {
            id: 'tab_' + (++state.tabSeq),
            title: 'Untitled',
            snapshot: tabCapture(),
            dirty: false,
            pristine: false
        };
        state.tabs.push(tab);
        state.activeTabId = tab.id;
        renderTabs();
        updateSongInfo();
    }

    function tabClose(id) {
        var tabs = state.tabs || [];
        if (tabs.length <= 1) return;
        var idx = -1;
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id === id) { idx = i; break; }
        }
        if (idx < 0) return;
        var tab = tabs[idx];
        var doClose = function() {
            tabs.splice(idx, 1);
            if (state.activeTabId === id) {
                var next = tabs[Math.max(0, idx - 1)];
                state.activeTabId = next.id;
                tabApply(next);
            }
            renderTabs();
        };
        if (tab.dirty) {
            showAppConfirm('「' + (tab.title || 'Untitled') + '」有未保存的修改，仍要关闭吗？', {
                title: '关闭标签页',
                icon: 'fa-solid fa-xmark'
            }).then(function(ok) { if (ok) doClose(); });
        } else {
            doClose();
        }
    }

    // 标记当前标签页为已修改
    function tabMarkDirty() {
        var tab = tabGetActive();
        if (!tab) return;
        tab.title = (state.song && (state.song.name || state.song.song_name)) || tab.title || 'Untitled';
        tab.pristine = false;
        if (!tab.dirty) {
            tab.dirty = true;
            renderTabs();
        }
    }

    function tabMarkSaved() {
        var tab = tabGetActive();
        if (!tab) return;
        tab.dirty = false;
        tab.snapshot = tabCapture();
        renderTabs();
    }

    function initTabsUI() {
        var addBtn = $('editor-tab-add');
        if (addBtn) addBtn.addEventListener('click', function() { tabNew(); });
        var menuBtn = $('editor-tab-menu');
        if (menuBtn) {
            menuBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                showTabsMenu(menuBtn);
            });
        }
    }

    // 手机端: 用菜单展示全部标签页
    function showTabsMenu(anchor) {
        var old = $('tabs-menu');
        if (old) { old.parentNode.removeChild(old); return; }
        var menu = document.createElement('div');
        menu.id = 'tabs-menu';
        menu.className = 'file-menu';
        menu.style.cssText = 'position:fixed;z-index:10000;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:190px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';
        var tabs = state.tabs || [];
        for (var i = 0; i < tabs.length; i++) {
            (function(tab) {
                var item = document.createElement('div');
                item.className = 'file-menu-item';
                var dot = tab.dirty ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffb43c;margin-right:6px;"></span>' : '';
                item.innerHTML = '<i class="fa-solid fa-file-lines"></i><span>' + dot + (tab.title || 'Untitled') + '</span>';
                if (tab.id === state.activeTabId) item.style.background = 'rgba(76,194,255,0.14)';
                item.addEventListener('click', function() {
                    menu.parentNode.removeChild(menu);
                    tabSwitch(tab.id);
                });
                menu.appendChild(item);
            })(tabs[i]);
        }
        var div = document.createElement('div');
        div.className = 'file-menu-divider';
        menu.appendChild(div);
        var addItem = document.createElement('div');
        addItem.className = 'file-menu-item';
        addItem.innerHTML = '<i class="fa-solid fa-plus"></i><span>' + i18nText('新建标签页') + '</span>';
        addItem.addEventListener('click', function() {
            if (menu.parentNode) menu.parentNode.removeChild(menu);
            tabNew();
        });
        menu.appendChild(addItem);
        document.body.appendChild(menu);
        var rect = anchor.getBoundingClientRect();
        window.WebNBSPositionFlyout(menu, rect, { placement: 'bottom-start' });
        setTimeout(function() {
            document.addEventListener('click', function closeM(e) {
                if (!menu.contains(e.target) && e.target !== anchor) {
                    if (menu.parentNode) menu.parentNode.removeChild(menu);
                    document.removeEventListener('click', closeM);
                }
            });
        }, 0);
    }

    // ---- 保存全部标签页 ----
    function tabBuildSaveData(tab) {
        var s = tab.snapshot || {};
        var meta = s.meta || {};
        return {
            song: {
                name: meta.name || 'Untitled',
                song_name: meta.name || 'Untitled',
                author: meta.author || '',
                original_author: meta.original_author || '',
                description: meta.description || '',
                tempo: s.tempo || 20,
                notes: s.notes || [],
                layers: s.layers || [],
                solo_layers: Array.isArray(meta.solo_layers) ? meta.solo_layers.slice() : [],
                lyrics: JSON.parse(JSON.stringify(s.lyrics || [])),
                segments: JSON.parse(JSON.stringify(s.segments || []))
            },
            notes: s.notes || [],
            tempo: s.tempo || 20,
            tracks: [],
            solo_layers: Array.isArray(meta.solo_layers) ? meta.solo_layers.slice() : []
        };
    }

    function tabPersist(tab) {
        var s = tab.snapshot || {};
        var meta = s.meta || {};
        var data = tabBuildSaveData(tab);
        var history = getHistoryFiles();
        if (!s.fileId) {
            s.fileId = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6);
            tab.snapshot.fileId = s.fileId;
        }
        var id = s.fileId;
        var name = meta.name || 'Untitled';
        var existingIdx = -1;
        for (var i = 0; i < history.length; i++) {
            if (history[i].id === id) { existingIdx = i; break; }
        }
        var entry = { id: id, name: name, date: new Date().toLocaleString(), ts: Date.now(), size: (s.notes || []).length, tempo: s.tempo || 20 };
        if (existingIdx >= 0) history[existingIdx] = entry;
        else history.unshift(entry);
        if (history.length > 12) {
            var removed = history.splice(12);
            for (var r = 0; r < removed.length; r++) {
                projectDbDelete(removed[r].id);
                try { localStorage.removeItem('nbs_file_' + removed[r].id); } catch(e) {}
            }
        }
        safeSetItem('nbs_history', JSON.stringify(history));
        return projectDbPut(id, data).then(function() {
            tab.dirty = false;
            return true;
        }).catch(function() {
            var ok = safeSetItem('nbs_file_' + id, JSON.stringify(data));
            if (ok) tab.dirty = false;
            return ok;
        });
    }

    function tabSaveAll() {
        tabStash();
        var tabs = state.tabs || [];
        if (!tabs.length) { saveFileToLocalStorage(); return; }
        var tasks = tabs.map(function(tab) { return tabPersist(tab); });
        Promise.all(tasks).then(function(results) {
            var ok = 0;
            for (var i = 0; i < results.length; i++) if (results[i]) ok++;
            renderTabs();
            showAppAlert('已保存 ' + ok + ' / ' + tabs.length + ' 个文件', { title: '保存全部', icon: 'fa-solid fa-circle-check' });
        });
    }

    // 初始化标签页 (启动时调用一次)
    function initTabs() {
        if (!Array.isArray(state.tabs)) state.tabs = [];
        if (typeof state.tabSeq !== 'number') state.tabSeq = 0;
        if (state.tabs.length === 0) {
            state.tabs.push({
                id: 'tab_' + (++state.tabSeq),
                title: (state.song && (state.song.name || state.song.song_name)) || 'Untitled',
                snapshot: tabCapture(),
                dirty: false,
                pristine: true
            });
            state.activeTabId = state.tabs[0].id;
        }
        renderTabs();
    }

    // 打开文件前准备: 总是用新标签页承载即将载入的文件
    // 例外: 应用启动后的初始空标签 (pristine) 可直接复用, 避免留下空标签
    function tabOpenInNewTabIfNeeded() {
        tabStash();
        var cur = tabGetActive();
        var canReuse = !!cur && cur.pristine && !cur.dirty && (state.tabs || []).length === 1;
        if (canReuse) {
            cur.pristine = false;
            return;
        }
        var tab = {
            id: 'tab_' + (++state.tabSeq),
            title: 'Untitled',
            snapshot: tabCapture(),
            dirty: false,
            pristine: false
        };
        state.tabs.push(tab);
        state.activeTabId = tab.id;
        exitSegmentsEditMode();
        renderTabs();
    }

    function getNotesAtTick(tick) {
        if (!state.noteIndex) return [];
        return state.noteIndex.get(tick) || [];
    }

    // ---- 导出 ----
    N.createDefaultLayers = createDefaultLayers;
    N.resetToNewFile = resetToNewFile;
    N.createNewFile = createNewFile;
    N.tabGetActive = tabGetActive;
    N.tabCapture = tabCapture;
    N.tabApply = tabApply;
    N.renderTabs = renderTabs;
    N.tabSyncMeta = tabSyncMeta;
    N.tabStash = tabStash;
    N.tabSwitch = tabSwitch;
    N.tabNew = tabNew;
    N.tabClose = tabClose;
    N.tabMarkDirty = tabMarkDirty;
    N.tabMarkSaved = tabMarkSaved;
    N.initTabsUI = initTabsUI;
    N.showTabsMenu = showTabsMenu;
    N.tabBuildSaveData = tabBuildSaveData;
    N.tabPersist = tabPersist;
    N.tabSaveAll = tabSaveAll;
    N.initTabs = initTabs;
    N.tabOpenInNewTabIfNeeded = tabOpenInNewTabIfNeeded;
    N.getNotesAtTick = getNotesAtTick;
})(window.WebNBS);
