/* 31-midi-config.js — MiauNoteBlock 功能模块
   来源: 原 main.js L19229-L19683; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    var _midiPrefsByHash = N._midiPrefsByHash;
    function applyMidiRepeatSplit() { return N.applyMidiRepeatSplit.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function closeMidiPopup() { return N.closeMidiPopup.apply(this, arguments); }
    function collectMidiSettings() { return N.collectMidiSettings.apply(this, arguments); }
    function createNewFile() { return N.createNewFile.apply(this, arguments); }
    function emptyTimbreFittingSaved() { return N.emptyTimbreFittingSaved.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }
    function exportNBS() { return N.exportNBS.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function getHistoryFiles() { return N.getHistoryFiles.apply(this, arguments); }
    function getInstrumentNames() { return N.getInstrumentNames.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function hideHistorySubmenu() { return N.hideHistorySubmenu.apply(this, arguments); }
    function hideTaskProgress() { return N.hideTaskProgress.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function loadFileFromLocalStorage() { return N.loadFileFromLocalStorage.apply(this, arguments); }
    function loadFittingLevel() { return N.loadFittingLevel.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function saveFileToLocalStorage() { return N.saveFileToLocalStorage.apply(this, arguments); }
    function segmentBuildChannelSplit() { return N.segmentBuildChannelSplit.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showAudioExportDialog() { return N.showAudioExportDialog.apply(this, arguments); }
    function showBatchExportDialog() { return N.showBatchExportDialog.apply(this, arguments); }
    function showHistoryDialog() { return N.showHistoryDialog.apply(this, arguments); }
    function showTaskProgress() { return N.showTaskProgress.apply(this, arguments); }
    function syncNbsLayerGroups() { return N.syncNbsLayerGroups.apply(this, arguments); }
    function tabSaveAll() { return N.tabSaveAll.apply(this, arguments); }
    function tabSyncMeta() { return N.tabSyncMeta.apply(this, arguments); }
    function toggleSegmentsEditMode() { return N.toggleSegmentsEditMode.apply(this, arguments); }
    function updateInstrumentSelectorUI() { return N.updateInstrumentSelectorUI.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTaskProgress() { return N.updateTaskProgress.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function updateUndoRedoButtons() { return N.updateUndoRedoButtons.apply(this, arguments); }


    function saveMidiConfigForHash(hash, snapshot) {
        if (!hash) return;
        _midiPrefsByHash[hash] = snapshot;
    }

    // 生成当前导入配置快照 (仅在点「导入」时调用)
    function buildMidiConfigSnapshot(settings) {
        return {
            basic: {
                remove_silent: settings.remove_silent,
                name_layers: settings.name_layers,
                name_after_patches: settings.name_after_patches,
                octave_mode: settings.octave_mode,
                force_fold_enabled: settings.force_fold_enabled,
                smart_substitute_enabled: settings.smart_substitute_enabled,
                read_velocity: settings.read_velocity,
                precision: settings.precision,
                keep_note_length: settings.keep_note_length,
                dedupe_notes: settings.dedupe_notes,
                dedupe_reorder: settings.dedupe_reorder,
                snap_enabled: settings.snap_enabled,
                snap_beat: settings.snap_beat,
                auto_split_segments: !!settings.auto_split_segments,
                split_repeats: settings.split_repeats !== false,
                repeat_granularity: settings.repeat_granularity || 'medium',
                separate_voices: !!settings.separate_voices,
                voice_ignore_metadata: !!settings.voice_ignore_metadata
            },
            sustain_track_indices: (settings.sustain_tracks || []).slice(),
            percussion_instruments: settings.percussion_instruments || {},
            percussion_pitches: settings.percussion_pitches || {},
            // 音色拟合: 传给转换器的按通道数据 + 弹窗重建用的按音色数据
            timbre_fitting: settings.timbre_fitting || null,
            fitting_saved: state._midiTimbreFittingSaved || emptyTimbreFittingSaved(),
            fitting_level: loadFittingLevel()
        };
    }

    // 把保存的基本设置写回弹窗控件
    function applyMidiBasicConfig(saved) {
        if (!saved) return;
        if (saved.remove_silent !== undefined && $('midi-remove-silent')) $('midi-remove-silent').checked = saved.remove_silent;
        if (saved.name_layers !== undefined && $('midi-name-layers')) $('midi-name-layers').checked = saved.name_layers;
        if (saved.name_after_patches !== undefined) {
            var val = saved.name_after_patches ? 'patches' : 'channels';
            var radios = document.getElementsByName('midi-name-mode');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === val);
            }
        }
        if (saved.octave_mode !== undefined && $('midi-octave-mode')) $('midi-octave-mode').value = saved.octave_mode;
        if (saved.force_fold_enabled !== undefined && $('midi-force-fold')) $('midi-force-fold').checked = saved.force_fold_enabled;
        if (saved.smart_substitute_enabled !== undefined && $('midi-smart-substitute')) $('midi-smart-substitute').checked = saved.smart_substitute_enabled;
        if (saved.read_velocity !== undefined && $('midi-read-velocity')) $('midi-read-velocity').checked = saved.read_velocity;
        if (saved.precision !== undefined && $('midi-precision')) $('midi-precision').value = saved.precision;
        if (saved.keep_note_length !== undefined && $('midi-keep-note-length')) $('midi-keep-note-length').value = saved.keep_note_length;
        if (saved.dedupe_notes !== undefined && $('midi-dedupe-notes')) $('midi-dedupe-notes').checked = saved.dedupe_notes;
        if (saved.dedupe_reorder !== undefined && $('midi-dedupe-reorder')) $('midi-dedupe-reorder').checked = saved.dedupe_reorder;
        if (saved.auto_split_segments !== undefined && $('midi-auto-split-segments')) $('midi-auto-split-segments').checked = !!saved.auto_split_segments;
        if (saved.split_repeats !== undefined && $('midi-split-repeats')) $('midi-split-repeats').checked = saved.split_repeats !== false;
        if (saved.repeat_granularity !== undefined && $('midi-repeat-granularity')) $('midi-repeat-granularity').value = saved.repeat_granularity;
        if (saved.separate_voices !== undefined && $('midi-separate-voices')) $('midi-separate-voices').checked = !!saved.separate_voices;
        if (saved.voice_ignore_metadata !== undefined && $('midi-voice-ignore-metadata')) $('midi-voice-ignore-metadata').checked = !!saved.voice_ignore_metadata;
        if (saved.snap_enabled !== undefined && $('midi-snap-enabled')) $('midi-snap-enabled').checked = saved.snap_enabled;
        if (saved.snap_beat !== undefined && $('midi-snap-beat')) $('midi-snap-beat').value = saved.snap_beat;
    }

    // 无该文件配置时: 恢复默认推荐值 (与 HTML 默认值保持一致)
    function resetMidiBasicToDefaults() {
        var setChk = function(id, v) { var el = $(id); if (el) el.checked = !!v; };
        var setVal = function(id, v) { var el = $(id); if (el) el.value = v; };
        setChk('midi-remove-silent', true);
        setChk('midi-name-layers', true);
        var radios = document.getElementsByName('midi-name-mode');
        for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === 'patches');
        setVal('midi-octave-mode', '2');
        setChk('midi-smart-substitute', true);
        setChk('midi-force-fold', false);
        setChk('midi-read-velocity', true);
        setVal('midi-precision', '1');
        setVal('midi-keep-note-length', 'none');
        setChk('midi-dedupe-notes', false);
        setChk('midi-dedupe-reorder', true);
        setChk('midi-auto-split-segments', true);
        setChk('midi-split-repeats', true);
        setVal('midi-repeat-granularity', 'medium');
        setChk('midi-separate-voices', true);
        setChk('midi-voice-ignore-metadata', false);
        setChk('midi-snap-enabled', false);
        setVal('midi-snap-beat', '4');
    }

    // 把保存的打击乐映射写回弹窗表格
    function applySavedPercussionPrefs(config) {
        if (!config) return;
        var insts = config.percussion_instruments || {};
        var pitches = config.percussion_pitches || {};
        var instSelects = document.querySelectorAll('.midi-perc-instrument-select');
        for (var i = 0; i < instSelects.length; i++) {
            var note = parseInt(instSelects[i].getAttribute('data-perc'));
            if (insts[note] !== undefined) instSelects[i].value = String(insts[note]);
        }
        var pitchSelects = document.querySelectorAll('.midi-perc-pitch-select');
        for (var j = 0; j < pitchSelects.length; j++) {
            var pn = parseInt(pitchSelects[j].getAttribute('data-note'));
            if (pitches[pn] !== undefined) pitchSelects[j].value = String(pitches[pn]);
        }
    }

    function doImportMidi() {
        var file = state._midiFile;
        if (!file) return;
        var settings = collectMidiSettings();

        // 导入 MIDI 前自动暂停当前 NBS 播放
        if (state.isPlaying) {
            handleStop();
        }

        // 在关闭弹窗前保存音轨状态（closeMidiPopup 会清除 _midiTrackStates）
        var savedTrackStates = {};
        for (var idx in N.shared._midiTrackStates) {
            savedTrackStates[idx] = {
                muted: N.shared._midiTrackStates[idx].muted,
                solo: N.shared._midiTrackStates[idx].solo,
                excluded: N.shared._midiTrackStates[idx].excluded
            };
        }
        var savedChannelTracks = state._channelTracks ? JSON.parse(JSON.stringify(state._channelTracks)) : {};

        // 快照 MIDI 原始事件 (closeMidiPopup 会清空 _midiInfo)
        // 重复片段分割改在 MIDI 事件层分析, 需要原始 tick / duration / channel
        var midiEventsSnapshot = (state._midiInfo && state._midiInfo._rawEvents)
            ? state._midiInfo._rawEvents : null;

        // 关闭 MIDI 配置弹窗
        closeMidiPopup();

        // 新文件, 重置文件 ID
        state.currentFileId = null;

        showTaskProgress(file.name);
        API.importMidi(file, settings, function(loaded, total, speed, percent, eta) {
            updateTaskProgress(loaded, total, speed, percent, eta);
        }).then(function(data) {
            hideTaskProgress();
            state.song = data.song;
            state.notes = data.song.notes || [];
            // 恢复音轨状态（用于 NBS 播放时过滤静音/排除的音轨）
            N.shared._midiTrackStates = savedTrackStates;
            state._channelTracks = savedChannelTracks;
            // 保存 layer → channel 映射（用于 NBS 播放时查找音符所属 MIDI channel）
            state.layerChannelMap = data.song.layer_channel_map || {};
            // 自动分割片段: 按 MIDI 通道生成片段轨道 (片段模式二次编辑用)
            if (settings.auto_split_segments) {
                segmentBuildChannelSplit(state.song);
            } else {
                state.segments = [];
                state.segmentLanes = [];
                state._segmentIdSeq = 0;
                state._segmentsEdited = false;
                segmentEnsure();
            }
            // 后处理: 查找并分割重复片段 (MIDI 事件层分析, 小节对齐, 不切断延音)
            if (settings.split_repeats) {
                applyMidiRepeatSplit(midiEventsSnapshot, data.song, savedTrackStates, settings.repeat_granularity);
            }
            if (state.pianoRoll) {
                state.pianoRoll.setSegmentLanes(state.segmentLanes);
                state.pianoRoll.setSegments(state.segments);
            }
            // 保存导入文件名（去掉扩展名）
            state.importedFileName = file.name.replace(/\.[^.]+$/, '');
            var t = parseFloat(data.song.tempo);
            if (!isFinite(t) || t <= 0) t = 10;
            state.tempo = t;
            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));
            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();

            if (state.pianoRoll) {
                state.pianoRoll.setNotes(state.notes);
            }

            updateSongInfo();
            checkOctaveRange(state.notes);
            updateTrackPanelUI();
            // 轨道数已更新, 重新计算片段轨道分组横线
            syncNbsLayerGroups();
            updateProgressUI();
            handleStop();
            markDirty();
            $('file-input').value = '';
            state._midiFile = null;
            state._midiInfo = null;
        }).catch(function(err) {
            hideTaskProgress();
            // 弹窗已关闭, showMidiNotice 会写入隐藏的弹窗导致用户看不到错误
            // 改用 showAppAlert 显示可见的错误提示
            showAppAlert('MIDI 导入失败: ' + formatError(err, '无法导入 MIDI'), {
                title: '导入失败',
                icon: 'fa-solid fa-triangle-exclamation'
            });
        });
    }

    function updateSnapGridInfo() {
        var snapEnabled = $('midi-snap-enabled') && $('midi-snap-enabled').checked;
        var snapBeat = $('midi-snap-beat') ? parseInt($('midi-snap-beat').value) : 4;
        // NBS standard: 4 ticks per beat (quarter note)
        // gridStep 必须是整数 tick, 与 applySnap 保持一致
        var ticksPerBeat = 4; // NBS standard
        var nbsTicksPerGrid = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
        var infoEl = $('midi-snap-grid-info');
        var beatLabel = $('midi-snap-beat-label');
        if (beatLabel) beatLabel.style.display = snapEnabled ? '' : 'none';
        if (infoEl) {
            if (snapEnabled) {
                infoEl.textContent = '吸附网格: ' + nbsTicksPerGrid + ' tick';
            } else {
                infoEl.textContent = '';
            }
        }
    }

    // 监听吸附控件变化
    if ($('midi-snap-enabled')) $('midi-snap-enabled').addEventListener('change', updateSnapGridInfo);
    if ($('midi-snap-beat')) $('midi-snap-beat').addEventListener('change', updateSnapGridInfo);
    if ($('midi-precision')) $('midi-precision').addEventListener('change', updateSnapGridInfo);
    updateSnapGridInfo();

    // ============ UI 辅助 ============
    function updateSongInfo() {
        var name = state.song ? (state.song.name || state.song.song_name || '未命名') : '未加载歌曲';
        $setText('song-name', name);
        tabSyncMeta();
        updateNoteCount();
    }

    function updateNoteCount() {
        var count = state.notes.length;
        $setText('note-count', '音符: ' + count);
        // 也更新轨道面板
        updateTrackPanelUI();
    }

    function checkOctaveRange(notes) {
        if (!notes || notes.length === 0) return;
        var outside = 0;
        for (var i = 0; i < notes.length; i++) {
            var k = notes[i].key;
            if (k < 33 || k > 57) outside++;
        }
        if (outside > 0) {
            var octCountEl = $('octave-count');
            if (octCountEl) octCountEl.textContent = outside;
            var p = $('octave-popup');
            if (p) { p.classList.add('active'); p.style.display = 'flex'; }
        }
    }

    function loadInstruments() {
        // 使用本地乐器列表
        renderInstrumentList(getDefaultInstruments());
    }

    function getDefaultInstruments() {
        var names = getInstrumentNames();
        var arr = [];
        for (var i = 0; i < names.length; i++) arr.push({ id: i, name: names[i] });
        return arr;
    }

    function renderInstrumentList(instruments) {
        // 不再使用旧的乐器列表面板，而是使用乐器选择器弹窗
        updateInstrumentSelectorUI();
    }

    // ============ DOM 工具 ============
    function hideElement(id) { var el = $(id); if (el) el.style.display = 'none'; }
    function showElement(id) { var el = $(id); if (el) el.style.display = ''; }
    function hideByClass(cls) {
        var els = document.getElementsByClassName(cls);
        for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
    }
    function showByClass(cls) {
        var els = document.getElementsByClassName(cls);
        for (var i = 0; i < els.length; i++) els[i].style.display = '';
    }
    function hideByQuery(sel) {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
    }

    // ============ 文件菜单 ============
    function showFileMenu() {
        var btn = $('btn-file');
        if (!btn) return;
        hideFileMenu();
        var menu = document.createElement('div');
        var t = i18nText;
        menu.id = 'file-menu';
        menu.className = 'file-menu';
        menu.style.cssText = 'position:fixed;z-index:10000;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';
        var rect = btn.getBoundingClientRect();

        // 打开文件 (第一个选项)
        var itemOpen = document.createElement('div');
        itemOpen.className = 'file-menu-item';
        itemOpen.innerHTML = '<i class="fa-solid fa-folder-open"></i><span>' + t('打开文件') + '</span>';
        itemOpen.addEventListener('click', function() { hideFileMenu(); $('file-input').click(); });
        menu.appendChild(itemOpen);

        // 新建
        var item0 = document.createElement('div');
        item0.className = 'file-menu-item';
        item0.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i><span>' + t('新建文件') + '</span>';
        item0.addEventListener('click', function() { hideFileMenu(); createNewFile(); });
        menu.appendChild(item0);

        var dividerOpen = document.createElement('div');
        dividerOpen.className = 'file-menu-divider';
        menu.appendChild(dividerOpen);

        // 保存当前文件
        var item1 = document.createElement('div');
        item1.className = 'file-menu-item';
        item1.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>' + t('保存当前文件') + '</span>';
        item1.addEventListener('click', function() { hideFileMenu(); saveFileToLocalStorage(); });
        menu.appendChild(item1);

        // 保存全部文件
        var itemSaveAll = document.createElement('div');
        itemSaveAll.className = 'file-menu-item';
        itemSaveAll.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>' + t('保存全部文件') + '</span>';
        itemSaveAll.addEventListener('click', function() { hideFileMenu(); tabSaveAll(); });
        menu.appendChild(itemSaveAll);

        // 批量导出
        var itemBatch = document.createElement('div');
        itemBatch.className = 'file-menu-item';
        itemBatch.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>' + t('批量导出…') + '</span>';
        itemBatch.addEventListener('click', function() { hideFileMenu(); showBatchExportDialog(); });
        menu.appendChild(itemBatch);

        // 片段编辑 / NBS 编辑 切换 (手机端没有状态栏滑块, 从这里进入)
        var itemSegMode = document.createElement('div');
        itemSegMode.className = 'file-menu-item';
        itemSegMode.innerHTML = '<i class="fa-solid fa-film"></i><span>'
            + (state.segmentsEditMode ? t('退出片段编辑') : t('片段编辑')) + '</span>';
        itemSegMode.addEventListener('click', function() { hideFileMenu(); toggleSegmentsEditMode(); });
        menu.appendChild(itemSegMode);

        // 导出 NBS
        var item2 = document.createElement('div');
        item2.className = 'file-menu-item';
        item2.innerHTML = '<i class="fa-solid fa-file-export"></i><span>' + t('导出 NBS') + '</span>';
        item2.addEventListener('click', function() { hideFileMenu(); exportNBS(); });
        menu.appendChild(item2);

        // 导入歌词
        var itemLyrics = document.createElement('div');
        itemLyrics.className = 'file-menu-item';
        itemLyrics.innerHTML = '<i class="fa-solid fa-file-import"></i><span>' + t('导入歌词 (JSON)') + '</span>';
        itemLyrics.addEventListener('click', function() {
            hideFileMenu();
            var lfi = $('lyrics-file-input');
            if (lfi) lfi.click();
        });
        menu.appendChild(itemLyrics);

        // 导出为音频 (MP3/WAV + 音效风格)
        var itemAudio = document.createElement('div');
        itemAudio.className = 'file-menu-item';
        itemAudio.innerHTML = '<i class="fa-solid fa-music"></i><span>' + t('导出为音频') + '</span>';
        itemAudio.addEventListener('click', function() { hideFileMenu(); showAudioExportDialog(); });
        menu.appendChild(itemAudio);

        var dividerExport = document.createElement('div');
        dividerExport.className = 'file-menu-divider';
        menu.appendChild(dividerExport);

        // 历史文件 (带子菜单)
        var item3 = document.createElement('div');
        item3.className = 'file-menu-item file-menu-has-sub';
        item3.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i><span>' + t('历史文件') + '</span><i class="fa-solid fa-chevron-right file-menu-arrow"></i>';
        item3.addEventListener('mouseenter', function() { showHistorySubmenu(item3, menu); });
        menu.appendChild(item3);
        
        document.body.appendChild(menu);
        window.WebNBSPositionFlyout(menu, rect, { placement: 'bottom-start' });
        
        setTimeout(function() {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target.id !== 'btn-file') {
                    hideFileMenu();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    }

    function hideFileMenu() {
        var menu = document.getElementById('file-menu');
        if (menu) menu.remove();
        hideHistorySubmenu();
    }

    function showHistorySubmenu(parentItem, parentMenu) {
        hideHistorySubmenu();
        var sub = document.createElement('div');
        sub.id = 'history-submenu';
        sub.className = 'file-menu';
        sub.style.cssText = 'position:fixed;z-index:10001;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;max-height:360px;overflow-y:auto;';
        var parentRect = parentItem.getBoundingClientRect();
        
        var history = getHistoryFiles();
        history = history.slice(0, 10);
        for (var i = 0; i < history.length; i++) {
            (function(h) {
                var item = document.createElement('div');
                item.className = 'file-menu-item';
                item.innerHTML = '<span>' + escapeHTML(h.name) + '</span><span style="font-size:10px;color:#888;margin-left:auto;">' + (h.date || '') + '</span>';
                item.addEventListener('click', function() {
                    hideFileMenu();
                    hideHistorySubmenu();
                    loadFileFromLocalStorage(h.id);
                });
                sub.appendChild(item);
            })(history[i]);
        }
        
        if (history.length === 0) {
            var emptyItem = document.createElement('div');
            emptyItem.className = 'file-menu-item';
            emptyItem.style.color = '#888';
            emptyItem.textContent = i18nText('暂无历史文件');
            sub.appendChild(emptyItem);
        }
        
        // 更多选项
        var moreItem = document.createElement('div');
        moreItem.className = 'file-menu-item';
        moreItem.innerHTML = '<i class="fa-solid fa-ellipsis"></i><span>' + i18nText('更多...') + '</span>';
        moreItem.addEventListener('click', function() {
            hideFileMenu();
            hideHistorySubmenu();
            showHistoryDialog();
        });
        sub.appendChild(moreItem);
        
        document.body.appendChild(sub);
        window.WebNBSPositionFlyout(sub, parentRect, { placement: 'right-start' });
    }

    // ---- 导出 ----
    N.saveMidiConfigForHash = saveMidiConfigForHash;
    N.buildMidiConfigSnapshot = buildMidiConfigSnapshot;
    N.applyMidiBasicConfig = applyMidiBasicConfig;
    N.resetMidiBasicToDefaults = resetMidiBasicToDefaults;
    N.applySavedPercussionPrefs = applySavedPercussionPrefs;
    N.doImportMidi = doImportMidi;
    N.updateSnapGridInfo = updateSnapGridInfo;
    N.updateSongInfo = updateSongInfo;
    N.updateNoteCount = updateNoteCount;
    N.checkOctaveRange = checkOctaveRange;
    N.loadInstruments = loadInstruments;
    N.getDefaultInstruments = getDefaultInstruments;
    N.renderInstrumentList = renderInstrumentList;
    N.hideElement = hideElement;
    N.showElement = showElement;
    N.hideByClass = hideByClass;
    N.showByClass = showByClass;
    N.hideByQuery = hideByQuery;
    N.showFileMenu = showFileMenu;
    N.hideFileMenu = hideFileMenu;
    N.showHistorySubmenu = showHistorySubmenu;
})(window.WebNBS);
