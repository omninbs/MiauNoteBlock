/* 08-app-init.js — MiauNoteBlock 功能模块
   来源: 原 main.js L3120-L4665; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    function loadNumpadRangeSettings() { return N.loadNumpadRangeSettings.apply(this, arguments); }
    function updateInstrumentSelectorUI() { return N.updateInstrumentSelectorUI.apply(this, arguments); }
    function updatePianoKeyboardHighlight() { return N.updatePianoKeyboardHighlight.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function showFileMenu() { return N.showFileMenu.apply(this, arguments); }
    function renderWelcomeRecent() { return N.renderWelcomeRecent.apply(this, arguments); }
    function updateWelcomeResumeHint() { return N.updateWelcomeResumeHint.apply(this, arguments); }
    function buildTimbreFittingRows() { return N.buildTimbreFittingRows.apply(this, arguments); }
    function fillChannelInstrumentNames() { return N.fillChannelInstrumentNames.apply(this, arguments); }
    function renderSubstituteRows() { return N.renderSubstituteRows.apply(this, arguments); }
    function createContextMenuDOM() { return N.createContextMenuDOM.apply(this, arguments); }
    function createInstrumentSelectorDOM() { return N.createInstrumentSelectorDOM.apply(this, arguments); }
    function createPianoKeyboardDOM() { return N.createPianoKeyboardDOM.apply(this, arguments); }
    function createTrackPanelDOM() { return N.createTrackPanelDOM.apply(this, arguments); }
    function createLandscapeDrawerDOM() { return N.createLandscapeDrawerDOM.apply(this, arguments); }
    function initPrivacyPopup() { return N.initPrivacyPopup.apply(this, arguments); }
    function initPianoRoll() { return N.initPianoRoll.apply(this, arguments); }
    function createMobileFabBar() { return N.createMobileFabBar.apply(this, arguments); }
    function initMobileToolSwitcher() { return N.initMobileToolSwitcher.apply(this, arguments); }
    function createFunctionsMenu() { return N.createFunctionsMenu.apply(this, arguments); }
    function initSegSplitPopup() { return N.initSegSplitPopup.apply(this, arguments); }
    function initLyricsUI() { return N.initLyricsUI.apply(this, arguments); }
    function initSegmentsUI() { return N.initSegmentsUI.apply(this, arguments); }
    function initTabsUI() { return N.initTabsUI.apply(this, arguments); }
    function initTabs() { return N.initTabs.apply(this, arguments); }
    function initClipboardPaste() { return N.initClipboardPaste.apply(this, arguments); }
    function initExternalClipboardPaste() { return N.initExternalClipboardPaste.apply(this, arguments); }
    function initMidiTrackPlayer() { return N.initMidiTrackPlayer.apply(this, arguments); }
    function hideFileMenu() { return N.hideFileMenu.apply(this, arguments); }
    function togglePerformanceRecording() { return N.togglePerformanceRecording.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function restartPlayback() { return N.restartPlayback.apply(this, arguments); }
    function openPianoKeyboard() { return N.openPianoKeyboard.apply(this, arguments); }
    function closeSettingsDialog() { return N.closeSettingsDialog.apply(this, arguments); }
    function closeTempoDialog() { return N.closeTempoDialog.apply(this, arguments); }
    function openSettingsDialog() { return N.openSettingsDialog.apply(this, arguments); }
    function resetStreamingLyrics() { return N.resetStreamingLyrics.apply(this, arguments); }
    function hideLyricsOverlay() { return N.hideLyricsOverlay.apply(this, arguments); }
    function syncSegmentToolbarTop() { return N.syncSegmentToolbarTop.apply(this, arguments); }
    function applyOctaveLabelSetting() { return N.applyOctaveLabelSetting.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function startSfDownload() { return N.startSfDownload.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function updateSfStatusText() { return N.updateSfStatusText.apply(this, arguments); }
    function initRadioTempoSlider() { return N.initRadioTempoSlider.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function updateRadioTempoSlider() { return N.updateRadioTempoSlider.apply(this, arguments); }
    function updateAutoScrollBtnIcon() { return N.updateAutoScrollBtnIcon.apply(this, arguments); }
    function updateOctaveModeHint() { return N.updateOctaveModeHint.apply(this, arguments); }
    function updateChannelOctaveForMode() { return N.updateChannelOctaveForMode.apply(this, arguments); }
    function readSubstituteConfigFromUI() { return N.readSubstituteConfigFromUI.apply(this, arguments); }
    function saveSubstituteConfig() { return N.saveSubstituteConfig.apply(this, arguments); }
    function showMidiNotice() { return N.showMidiNotice.apply(this, arguments); }
    function switchSubstituteTab() { return N.switchSubstituteTab.apply(this, arguments); }
    function switchMidiTab() { return N.switchMidiTab.apply(this, arguments); }
    function switchMidiSubTab() { return N.switchMidiSubTab.apply(this, arguments); }
    function initFittingLevelControl() { return N.initFittingLevelControl.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function initKeyboardShortcuts() { return N.initKeyboardShortcuts.apply(this, arguments); }
    function startFpsDisplayTimer() { return N.startFpsDisplayTimer.apply(this, arguments); }
    function initModalFloatGuard() { return N.initModalFloatGuard.apply(this, arguments); }
    function initCreativeAssist() { return N.initCreativeAssist.apply(this, arguments); }
    function initFindPanel() { return N.initFindPanel.apply(this, arguments); }
    function initCustomInstrumentsUI() { return N.initCustomInstrumentsUI.apply(this, arguments); }
    function getInstrumentNames() { return N.getInstrumentNames.apply(this, arguments); }
    function closeLyricEditorPop() { return N.closeLyricEditorPop.apply(this, arguments); }
    function hideContextMenu() { return N.hideContextMenu.apply(this, arguments); }
    function closeCustomInstPopup() { return N.closeCustomInstPopup.apply(this, arguments); }
    function ciCloseImportInfo() { return N.ciCloseImportInfo.apply(this, arguments); }
    function ciFixCloseWindow() { return N.ciFixCloseWindow.apply(this, arguments); }
    function findPickPop() { return N.findPickPop.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function loadInstruments() { return N.loadInstruments.apply(this, arguments); }
    function initTracks() { return N.initTracks.apply(this, arguments); }
    function syncTrackPanelToggleButton() { return N.syncTrackPanelToggleButton.apply(this, arguments); }
    function resetToNewFile() { return N.resetToNewFile.apply(this, arguments); }
    function startAutoSaveInterval() { return N.startAutoSaveInterval.apply(this, arguments); }
    function initWelcomeScreen() { return N.initWelcomeScreen.apply(this, arguments); }
    function migrateProjectsToIndexedDB() { return N.migrateProjectsToIndexedDB.apply(this, arguments); }
    function cleanupOrphanedFiles() { return N.cleanupOrphanedFiles.apply(this, arguments); }
    function checkStorageUsage() { return N.checkStorageUsage.apply(this, arguments); }


    // ============ 初始化 ============
    function init() {
        loadNumpadRangeSettings();
        if (window.WebNBSI18n) window.WebNBSI18n.init();
        document.addEventListener('webnbs:languagechange', function() {
            updateInstrumentSelectorUI();
            updatePianoKeyboardHighlight();
            if ($('file-menu')) showFileMenu();
            if (state.pianoRoll && state.pianoRoll.render) state.pianoRoll.render();
            if ($('welcome-screen')) {
                renderWelcomeRecent();
                updateWelcomeResumeHint();
            }
            // MIDI 导入弹窗内包含音色名等动态文案, 语言切换后重建相关列表
            var midiPopupEl = $('midi-popup');
            if (midiPopupEl && midiPopupEl.style.display !== 'none' && state._midiInfo) {
                buildTimbreFittingRows(state._midiInfo);
                fillChannelInstrumentNames();
            }
            var substPopupEl = $('midi-substitute-popup');
            if (substPopupEl && substPopupEl.style.display !== 'none' && typeof N.shared._substituteConfig !== 'undefined' && N.shared._substituteConfig) {
                renderSubstituteRows(N.shared._substituteConfig);
            }
        });
        // 创建 DOM 元素
        createContextMenuDOM();
        createInstrumentSelectorDOM();
        createPianoKeyboardDOM();
        createTrackPanelDOM();
        createLandscapeDrawerDOM();
        initPrivacyPopup();

        // 初始化钢琴卷帘
        initPianoRoll();
        // 初始化底部浮动操作按钮
        createMobileFabBar();
        // 初始化移动端工具切换器 (+ 悬浮按钮下方)
        initMobileToolSwitcher();
        // 初始化功能菜单
        createFunctionsMenu();
        // 初始化片段分割弹窗
        initSegSplitPopup();
        // 初始化歌词标注 UI
        initLyricsUI();
        // 初始化片段编辑 UI
        initSegmentsUI();
        // 初始化多文件标签页
        initTabsUI();
        initTabs();
        // 初始化外部 MIDI 数据粘贴
        initClipboardPaste();
        initExternalClipboardPaste();
        // 初始化 MIDI 轨道播放器
        initMidiTrackPlayer();

        // 文件操作 (btn-open 已移入文件菜单)
        $('btn-file').addEventListener('click', function(e) {
            e.stopPropagation();
            var menu = document.getElementById('file-menu');
            if (menu) {
                hideFileMenu();
            } else {
                showFileMenu();
            }
        });
        $('file-input').addEventListener('change', handleFileOpen);

        // 撤销重做
        $('btn-undo').addEventListener('click', performUndo);
        $('btn-redo').addEventListener('click', performRedo);

        // 播放控制 (现在在状态栏)
        var playBtn = $('btn-play');
        if (playBtn) playBtn.addEventListener('click', handlePlayToggle);
        var performanceRecordBtn = $('btn-performance-record');
        if (performanceRecordBtn) {
            performanceRecordBtn.addEventListener('click', function(e) {
                e.preventDefault();
                togglePerformanceRecording();
            });
        }
        var stopBtn = $('btn-stop');
        if (stopBtn) stopBtn.addEventListener('click', handleStop);

        var tempoSlider = $('tempo-slider');
        if (tempoSlider) {
            tempoSlider.addEventListener('mousedown', function(e) {
                pushUndo(); // 开始拖拽时记录快照, 避免每次 input 事件都创建 undo
            });
            tempoSlider.addEventListener('input', function(e) {
                state.tempo = parseFloat(e.target.value);
                $('tempo-value').value = state.tempo;
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
        }

        // 工具栏"调节速度"按钮已删除, 仅保留输入框

        // 键盘钢琴开关
        var btnKeyboardPiano = $('btn-keyboard-piano');
        if (btnKeyboardPiano) {
            btnKeyboardPiano.setAttribute('title', '钢琴键盘');
            btnKeyboardPiano.addEventListener('click', function() {
                state.keyboardPianoEnabled = !state.keyboardPianoEnabled;
                this.classList.toggle('active', state.keyboardPianoEnabled);
                if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                    state.pianoRoll.setShowKeyLabels(state.keyboardPianoEnabled);
                }
                if (state.keyboardPianoEnabled) {
                    openPianoKeyboard();
                }
                updatePianoKeyboardHighlight();
            });
        }

        // tempo-value 数字输入框
        var tempoValueInput = $('tempo-value');
        if (tempoValueInput) {
            tempoValueInput.addEventListener('focus', function(e) {
                pushUndo(); // 聚焦时记录快照, 避免每次 keystroke 都创建 undo
            });
            tempoValueInput.addEventListener('input', function(e) {
                var val = parseFloat(e.target.value);
                if (isNaN(val)) return;
                val = Math.max(0, Math.min(512, val));
                val = Math.round(val * 100) / 100;
                state.tempo = val;
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
            tempoValueInput.addEventListener('blur', function(e) {
                var val = parseFloat(e.target.value);
                if (isNaN(val)) val = state.tempo;
                val = Math.max(0, Math.min(512, val));
                val = Math.round(val * 100) / 100;
                e.target.value = val;
            });
            tempoValueInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });
        }

        // 设置弹窗关闭按钮
        var settingsCloseBtn = $('settings-close-btn');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeSettingsDialog();
            });
        }

        // 速度弹窗关闭按钮
        var tempoCloseBtn = $('tempo-close-btn');
        if (tempoCloseBtn) {
            tempoCloseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeTempoDialog();
            });
        }

        // 设置按钮 (工具栏)
        var btnSettings = $('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', function(e) {
                e.stopPropagation();
                var popup = $('settings-popup');
                if (!popup) return;
                if (popup.classList.contains('active')) {
                    closeSettingsDialog();
                } else {
                    openSettingsDialog();
                }
            });
        }

        // 设置弹窗中的"关于"按钮 (移动端)
        var settingsAboutBtn = $('settings-about-btn');
        if (settingsAboutBtn) {
            settingsAboutBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeSettingsDialog();
                var aboutPopup = $('about-popup');
                if (aboutPopup) {
                    aboutPopup.style.display = 'flex';
                    aboutPopup.classList.add('active');
                }
            });
        }

        // 平滑翻页开关 (在设置弹窗里)
        var smoothScrollChk = $('settings-smooth-scroll');
        if (smoothScrollChk) {
            smoothScrollChk.addEventListener('change', function(e) {
                e.stopPropagation();
                state.smoothScroll = this.checked;
                if (state.pianoRoll) {
                    state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                }
                markDirty();
            });
        }

        var streamingLyricsChk = $('settings-streaming-lyrics');
        if (streamingLyricsChk) {
            try {
                var savedStreamingLyrics = localStorage.getItem('streaming_lyrics');
                state.streamingLyrics = savedStreamingLyrics === null ? true : savedStreamingLyrics === '1';
            } catch(e) {}
            streamingLyricsChk.checked = !!state.streamingLyrics;
            streamingLyricsChk.addEventListener('change', function() {
                state.streamingLyrics = this.checked;
                resetStreamingLyrics();
                try { localStorage.setItem('streaming_lyrics', this.checked ? '1' : '0'); } catch(e) {}
                if (!this.checked) hideLyricsOverlay();
            });
        }

        // 音效优化开关
        var audioEnhanceChk = $('settings-audio-enhance');
        if (audioEnhanceChk) {
            audioEnhanceChk.addEventListener('change', function(e) {
                e.stopPropagation();
                if (window.AudioEngine && AudioEngine.setEnhance) {
                    AudioEngine.setEnhance(this.checked);
                }
            });
        }

        var renderFpsSel = $('settings-render-fps');
        if (renderFpsSel) {
            try {
                var savedFps = localStorage.getItem('render_fps_limit');
                if (savedFps === '30' || savedFps === '60' || savedFps === '0') {
                    state.renderFpsLimit = parseInt(savedFps, 10);
                }
            } catch(e) {}
            renderFpsSel.value = String(state.renderFpsLimit);
            renderFpsSel.addEventListener('change', function() {
                var value = parseInt(this.value, 10);
                state.renderFpsLimit = value === 30 || value === 60 ? value : 0;
                try { localStorage.setItem('render_fps_limit', String(state.renderFpsLimit)); } catch(e) {}
            });
        }

        // 音符播放高亮动画开关
        var highlightChk = $('settings-highlight-animation');
        if (highlightChk) {
            try {
                var saved = localStorage.getItem('highlight_animation');
                highlightChk.checked = saved === null ? true : saved === '1';
            } catch(e) {
                highlightChk.checked = true;
            }
            state.highlightAnimationEnabled = highlightChk.checked;
            highlightChk.addEventListener('change', function() {
                state.highlightAnimationEnabled = this.checked;
                try { localStorage.setItem('highlight_animation', this.checked ? '1' : '0'); } catch(e) {}
            });
        }

        // 录制时音符动画: 现已常开 (原「录制时显示音符动画」开关已移除)
        state.recordingAnimationEnabled = true;

        // NBS 导出版本已移入「导出 NBS」弹窗, 那里会读取/写入 nbs_export_version
        try {
            var savedExportVer = parseInt(localStorage.getItem('nbs_export_version'), 10);
            if (savedExportVer === 4 || savedExportVer === 5 || savedExportVer === 6) {
                window.NBS_EXPORT_VERSION = savedExportVer;
            }
        } catch (e) {}

        // 音量透明度开关 (默认开启)
        var volOpacityChk = $('settings-volume-opacity');
        if (volOpacityChk) {
            try {
                var savedVolOp = localStorage.getItem('volume_opacity');
                volOpacityChk.checked = (savedVolOp === null) ? true : (savedVolOp === '1');
            } catch(e) { volOpacityChk.checked = true; }
            if (state.pianoRoll) state.pianoRoll.setVolumeOpacityEnabled(volOpacityChk.checked);
            volOpacityChk.addEventListener('change', function() {
                if (state.pianoRoll) state.pianoRoll.setVolumeOpacityEnabled(this.checked);
                try { localStorage.setItem('volume_opacity', this.checked ? '1' : '0'); } catch(e) {}
            });
        }

        // 时间栏视图高度 (顶部导航条 / 音符缩略 map): 小(默认) / 中 / 大
        var timelineHSelect = $('settings-timeline-height');
        function applyTimelineBarLevel(level) {
            if (level !== 'small' && level !== 'medium' && level !== 'large') level = 'small';
            if (state.pianoRoll) state.pianoRoll.setTimelineBarHeight(level);
            // 时间栏高度变化会影响片段工具栏与片段绘画区的位置
            if (state.segmentsEditMode) syncSegmentToolbarTop();
        }
        if (timelineHSelect) {
            var savedTimelineLevel = 'small';
            try {
                var stl = localStorage.getItem('timeline_view_height');
                if (stl === 'medium' || stl === 'large') savedTimelineLevel = stl;
            } catch(e) {}
            timelineHSelect.value = savedTimelineLevel;
            applyTimelineBarLevel(savedTimelineLevel);
            timelineHSelect.addEventListener('change', function() {
                var lv = this.value;
                if (lv !== 'small' && lv !== 'medium' && lv !== 'large') lv = 'small';
                try { localStorage.setItem('timeline_view_height', lv); } catch(e) {}
                applyTimelineBarLevel(lv);
            });
        }

        // 时间栏位置 (NBS / 片段 各自独立) + 缩略地图纵轴模式
        var timelinePosNbsSel = $('settings-timeline-pos-nbs');
        var timelinePosSegSel = $('settings-timeline-pos-seg');
        var timelineMapModeSel = $('settings-timeline-map-mode');
        var segmentPreviewModeSel = $('settings-segment-preview-mode');
        if (timelinePosNbsSel) {
            var posNbs = 'top';
            try {
                if (localStorage.getItem('timeline_pos_nbs') === 'bottom') posNbs = 'bottom';
            } catch (e1) {}
            timelinePosNbsSel.value = posNbs;
            if (!state.segmentsEditMode && state.pianoRoll && state.pianoRoll.setTimelinePosition) {
                state.pianoRoll.setTimelinePosition(posNbs);
            }
            timelinePosNbsSel.addEventListener('change', function() {
                try { localStorage.setItem('timeline_pos_nbs', this.value); } catch (e2) {}
                if (!state.segmentsEditMode && state.pianoRoll && state.pianoRoll.setTimelinePosition) {
                    state.pianoRoll.setTimelinePosition(this.value);
                }
            });
        }
        if (timelinePosSegSel) {
            var posSeg = 'bottom';
            try {
                if (localStorage.getItem('timeline_pos_segment') === 'top') posSeg = 'top';
            } catch (e3) {}
            timelinePosSegSel.value = posSeg;
            timelinePosSegSel.addEventListener('change', function() {
                try { localStorage.setItem('timeline_pos_segment', this.value); } catch (e4) {}
                if (state.segmentsEditMode && state.pianoRoll && state.pianoRoll.setTimelinePosition) {
                    state.pianoRoll.setTimelinePosition(this.value);
                }
                // 时间栏位置变化会影响片段工具栏的落点
                syncSegmentToolbarTop();
            });
        }
        if (timelineMapModeSel) {
            var mapMode = 'track';
            try {
                if (localStorage.getItem('timeline_map_mode') === 'pitch') mapMode = 'pitch';
            } catch (e5) {}
            timelineMapModeSel.value = mapMode;
            if (state.pianoRoll && state.pianoRoll.setTimelineMapMode) {
                state.pianoRoll.setTimelineMapMode(mapMode);
            }
            timelineMapModeSel.addEventListener('change', function() {
                try { localStorage.setItem('timeline_map_mode', this.value); } catch (e6) {}
                if (state.pianoRoll && state.pianoRoll.setTimelineMapMode) {
                    state.pianoRoll.setTimelineMapMode(this.value);
                }
            });
        }
        if (segmentPreviewModeSel) {
            // 默认「根据音调大小」; 用户显式选过「根据轨道位置」时保持 track
            var segPrevMode = 'pitch';
            try {
                if (localStorage.getItem('segment_preview_mode') === 'track') segPrevMode = 'track';
            } catch (e7) {}
            segmentPreviewModeSel.value = segPrevMode;
            if (state.pianoRoll && state.pianoRoll.setSegmentPreviewMode) {
                state.pianoRoll.setSegmentPreviewMode(segPrevMode);
            }
            segmentPreviewModeSel.addEventListener('change', function() {
                try { localStorage.setItem('segment_preview_mode', this.value); } catch (e8) {}
                if (state.pianoRoll && state.pianoRoll.setSegmentPreviewMode) {
                    state.pianoRoll.setSegmentPreviewMode(this.value);
                }
            });
        }

        // NBS 模式下的片段可视化: 轨道分组横线 (默认开) / 片段边界竖线 (默认关)
        var segLaneDivChk = $('settings-seg-lane-dividers');
        var segBoundaryChk = $('settings-seg-boundary-lines');
        if (segLaneDivChk) {
            try {
                var savedLd = localStorage.getItem('segment_lane_dividers');
                segLaneDivChk.checked = savedLd === null ? true : savedLd === '1';
            } catch(e) { segLaneDivChk.checked = true; }
            segLaneDivChk.addEventListener('change', function() {
                try { localStorage.setItem('segment_lane_dividers', this.checked ? '1' : '0'); } catch(e) {}
                if (state.pianoRoll && state.pianoRoll.setSegmentLaneDividersEnabled) {
                    state.pianoRoll.setSegmentLaneDividersEnabled(this.checked);
                }
            });
        }
        if (segBoundaryChk) {
            try {
                segBoundaryChk.checked = localStorage.getItem('segment_boundary_lines') === '1';
            } catch(e) { segBoundaryChk.checked = false; }
            segBoundaryChk.addEventListener('change', function() {
                try { localStorage.setItem('segment_boundary_lines', this.checked ? '1' : '0'); } catch(e) {}
                if (state.pianoRoll && state.pianoRoll.setSegmentBoundariesVisible) {
                    state.pianoRoll.setSegmentBoundariesVisible(this.checked);
                }
            });
        }
        if (state.pianoRoll) {
            if (state.pianoRoll.setSegmentLaneDividersEnabled) {
                state.pianoRoll.setSegmentLaneDividersEnabled(segLaneDivChk ? segLaneDivChk.checked : true);
            }
            if (state.pianoRoll.setSegmentBoundariesVisible) {
                state.pianoRoll.setSegmentBoundariesVisible(segBoundaryChk ? segBoundaryChk.checked : false);
            }
        }

        // 音符触发时轨道高亮 (总开关默认关闭; 子选项默认开启)
        var trackHlChk = $('settings-track-highlight');
        var trackHlColorChk = $('settings-track-highlight-color');
        var trackHlPosRadios = document.querySelectorAll('input[name="settings-track-highlight-pos"]');
        var trackHlPosVolume = $('settings-track-highlight-pos-volume');
        var trackHlPosPitch = $('settings-track-highlight-pos-pitch');
        if (trackHlChk) {
            try {
                var savedTHl = localStorage.getItem('track_highlight');
                trackHlChk.checked = (savedTHl === '1');
            } catch(e) { trackHlChk.checked = false; }
            try {
                var savedTHlColor = localStorage.getItem('track_highlight_color');
                if (trackHlColorChk) trackHlColorChk.checked = (savedTHlColor === null) ? true : (savedTHlColor === '1');
            } catch(e) { if (trackHlColorChk) trackHlColorChk.checked = true; }
            // 高亮位置模式: 'pitch' 根据音调(默认) / 'volume' 根据音量
            try {
                var savedPosMode = localStorage.getItem('track_highlight_position');
                state.trackHighlightPositionMode = (savedPosMode === 'volume') ? 'volume' : 'pitch';
            } catch(e) { state.trackHighlightPositionMode = 'pitch'; }
            for (var _hi = 0; _hi < trackHlPosRadios.length; _hi++) {
                trackHlPosRadios[_hi].checked = (trackHlPosRadios[_hi].value === state.trackHighlightPositionMode);
            }

            // 总开关关闭时, 子选项禁用并变暗 (表示当前不生效)
            function syncTrackHighlightRows() {
                syncTrackHighlightSubRow('settings-track-highlight-color-row', trackHlChk.checked, trackHlColorChk);
                syncTrackHighlightSubRow('settings-track-highlight-pos-row', trackHlChk.checked, trackHlPosVolume);
                syncTrackHighlightSubRow('settings-track-highlight-pos-pitch-row', trackHlChk.checked, trackHlPosPitch);
            }
            state.trackHighlightEnabled = trackHlChk.checked;
            state.trackHighlightColorEnabled = trackHlColorChk ? trackHlColorChk.checked : true;
            applyTrackHighlightSettings();
            syncTrackHighlightRows();

            trackHlChk.addEventListener('change', function() {
                state.trackHighlightEnabled = this.checked;
                try { localStorage.setItem('track_highlight', this.checked ? '1' : '0'); } catch(e) {}
                syncTrackHighlightRows();
                applyTrackHighlightSettings();
            });
            if (trackHlColorChk) trackHlColorChk.addEventListener('change', function() {
                state.trackHighlightColorEnabled = this.checked;
                try { localStorage.setItem('track_highlight_color', this.checked ? '1' : '0'); } catch(e) {}
                applyTrackHighlightSettings();
            });
            for (var _hj = 0; _hj < trackHlPosRadios.length; _hj++) {
                trackHlPosRadios[_hj].addEventListener('change', function() {
                    if (!this.checked) return;
                    state.trackHighlightPositionMode = (this.value === 'pitch') ? 'pitch' : 'volume';
                    try { localStorage.setItem('track_highlight_position', state.trackHighlightPositionMode); } catch(e) {}
                    applyTrackHighlightSettings();
                });
            }
        }

        // 音调文字显示八度数字开关 (默认开启)
        var showOctaveChk = $('settings-show-octave');
        if (showOctaveChk) {
            try {
                var savedOct = localStorage.getItem('show_octave_labels');
                showOctaveChk.checked = (savedOct === null || savedOct === '1');
            } catch(e) { showOctaveChk.checked = true; }
            N.shared.octaveLabelsEnabled = showOctaveChk.checked;
            applyOctaveLabelSetting(N.shared.octaveLabelsEnabled, false);
            showOctaveChk.addEventListener('change', function() {
                N.shared.octaveLabelsEnabled = this.checked;
                try { localStorage.setItem('show_octave_labels', this.checked ? '1' : '0'); } catch(e) {}
                applyOctaveLabelSetting(N.shared.octaveLabelsEnabled, true);
            });
        }

        // 音符上显示 点击次数 / 方块名 (两个独立开关, 默认关闭)
        var showNoteClicksChk = $('settings-show-note-clicks');
        var showNoteBlockChk = $('settings-show-note-block');

        function syncNoteExtraState() {
            if (state.pianoRoll) {
                state.pianoRoll.setNoteExtraEnabled(
                    showNoteClicksChk ? showNoteClicksChk.checked : false,
                    showNoteBlockChk ? showNoteBlockChk.checked : false
                );
            }
        }
        if (showNoteClicksChk) {
            try { showNoteClicksChk.checked = localStorage.getItem('noteblock.show_note_clicks') === '1'; } catch(e) {}
            showNoteClicksChk.addEventListener('change', function() {
                try { localStorage.setItem('noteblock.show_note_clicks', this.checked ? '1' : '0'); } catch(e) {}
                syncNoteExtraState();
            });
        }
        if (showNoteBlockChk) {
            try { showNoteBlockChk.checked = localStorage.getItem('noteblock.show_note_block') === '1'; } catch(e) {}
            showNoteBlockChk.addEventListener('change', function() {
                try { localStorage.setItem('noteblock.show_note_block', this.checked ? '1' : '0'); } catch(e) {}
                syncNoteExtraState();
            });
        }
        syncNoteExtraState();

        // 总开关关闭时, 子选项行变暗 (表示当前不生效); 总开关打开则恢复
        function syncTrackHighlightSubRow(rowId, enabled, chk) {
            var row = $(rowId);
            if (!row) return;
            row.classList.toggle('is-disabled', !enabled);
            if (chk) chk.disabled = !enabled;
        }
        function applyTrackHighlightSettings() {
            if (!state.pianoRoll) return;
            state.pianoRoll.setTrackHighlightEnabled(state.trackHighlightEnabled);
            state.pianoRoll.setTrackHighlightColorEnabled(state.trackHighlightColorEnabled);
            state.pianoRoll.setTrackHighlightPositionMode(state.trackHighlightPositionMode);
        }

        // ============ 个性化: 网页背景图片层 (重构版) ============
        var bgLayer = $('page-bg');
        var panelOpacitySlider = $('settings-panel-opacity');

        // ---- 背景图持久化: IndexedDB (支持大图, 替代 localStorage) ----
        var BG_DB = 'webnbs_bg';
        function _bgOpenDb() {
            return new Promise(function(resolve, reject) {
                var req = indexedDB.open(BG_DB, 1);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        }
        function _bgGetImage() {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve) {
                    var tx = db.transaction(['kv'], 'readonly');
                    var req = tx.objectStore('kv').get('image');
                    req.onsuccess = function() { resolve(req.result || null); };
                    req.onerror = function() { resolve(null); };
                });
            }).catch(function() { return null; });
        }
        function _bgPutImage(dataUrl) {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction(['kv'], 'readwrite');
                    tx.objectStore('kv').put(dataUrl, 'image');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function(e) { reject(e.target.error); };
                });
            });
        }
        function _bgClearImage() {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve) {
                    var tx = db.transaction(['kv'], 'readwrite');
                    tx.objectStore('kv').delete('image');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { resolve(); };
                });
            }).catch(function() {});
        }

        // 同步面板透明度 (仅当背景图激活时生效, 否则面板完全不透明)
        function syncPanelAlpha() {
            var bgActive = document.body.classList.contains('bg-active');
            var v = panelOpacitySlider ? (parseInt(panelOpacitySlider.value) || 0) : 0;
            // 面板底色 alpha: 无背景=1.0 完全不透明; 有背景时 0%=1.0, 100%=0.3
            var alpha = bgActive ? (1.0 - (v / 100) * 0.7) : 1.0;
            document.documentElement.style.setProperty('--surface-bg-alpha', alpha.toFixed(3));
            if (state.pianoRoll) state.pianoRoll.setPanelAlpha(alpha);
            var pv = $('settings-panel-opacity-value');
            if (pv) pv.textContent = v + '%';
        }

        // 同步左侧音轨信息栏透明度 (独立于面板透明度, 仅当背景图激活时生效)
        var trackPanelOpacitySlider = $('settings-track-panel-opacity');
        function syncTrackPanelAlpha() {
            var bgActive = document.body.classList.contains('bg-active');
            var v = trackPanelOpacitySlider ? (parseInt(trackPanelOpacitySlider.value) || 0) : 0;
            // 音轨栏 alpha: 无背景=1.0 完全不透明; 有背景时 0%=1.0, 100%=0.3
            var alpha = bgActive ? (1.0 - (v / 100) * 0.7) : 1.0;
            if (state.pianoRoll) state.pianoRoll.setTrackPanelAlpha(alpha);
            var pv = $('settings-track-panel-opacity-value');
            if (pv) pv.textContent = v + '%';
        }

        // 应用背景图片到全网页层 (覆盖整个网页)
        function applyPageBgImage(dataUrl) {
            if (!bgLayer) return;
            if (!dataUrl) {
                bgLayer.style.backgroundImage = '';
                document.body.classList.remove('bg-active');
            } else {
                bgLayer.style.backgroundImage = 'url(' + dataUrl + ')';
                document.body.classList.add('bg-active');
            }
            syncPanelAlpha();
            syncTrackPanelAlpha();
        }

        // 背景模式 (平铺/拉伸/缩放), 通过 body class 控制, 避免内联样式互相覆盖
        function applyPageBgMode(mode) {
            document.body.classList.remove('bg-mode-tile', 'bg-mode-stretch', 'bg-mode-fit');
            if (mode === 'stretch' || mode === 'fit' || mode === 'tile') {
                document.body.classList.add('bg-mode-' + mode);
            }
        }

        // 背景图片不透明度: 0%=不透明(可见), 100%=完全透明(隐藏), 通过 CSS 变量控制
        function applyBgOpacity(v) {
            var opacity = Math.max(0, Math.min(100, parseInt(v) || 0));
            document.documentElement.style.setProperty('--bg-image-opacity', ((100 - opacity) / 100).toFixed(3));
            var valEl = $('settings-bg-opacity-value');
            if (valEl) valEl.textContent = opacity + '%';
            return opacity;
        }

        // 显示已选择背景图片的文件名 (标记"确实选择了图片", 刷新后依然显示)
        function updateBgFilename(name) {
            var el = $('settings-bg-filename');
            if (el) el.textContent = name ? ('已选择: ' + name) : '';
        }

        // 背景图片选择
        var bgImageInput = $('settings-bg-image');
        if (bgImageInput) {
            bgImageInput.addEventListener('change', function(e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var dataUrl = ev.target.result;
                    applyPageBgImage(dataUrl);
                    _bgPutImage(dataUrl).catch(function() {}); // 大图也能可靠持久化
                    var modeSel = $('settings-bg-mode');
                    if (modeSel) applyPageBgMode(modeSel.value);
                    // 记住文件名, 刷新后仍显示 (标记已选择图片)
                    updateBgFilename(file.name);
                    try { localStorage.setItem('bg_filename', file.name); } catch(err) {}
                };
                reader.readAsDataURL(file);
            });
        }

        // 清除背景图片
        var bgClearBtn = $('settings-bg-clear');
        if (bgClearBtn) {
            bgClearBtn.addEventListener('click', function() {
                applyPageBgImage(null);
                _bgClearImage();
                if (bgImageInput) bgImageInput.value = '';
                updateBgFilename('');
                try { localStorage.removeItem('bg_filename'); } catch(err) {}
            });
        }

        // 背景图片透明度滑块 (0-100, 0=不透明, 100=完全透明)
        var bgOpacitySlider = $('settings-bg-opacity');
        if (bgOpacitySlider) {
            try {
                var savedBgOp = localStorage.getItem('bg_opacity');
                if (savedBgOp !== null) {
                    var bop = parseInt(savedBgOp);
                    if (!isNaN(bop)) bgOpacitySlider.value = bop;
                }
            } catch(e) {}
            applyBgOpacity(bgOpacitySlider.value);
            bgOpacitySlider.addEventListener('input', function() {
                applyBgOpacity(this.value);
            });
            bgOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('bg_opacity', this.value); } catch(e) {}
            });
        }

        // 背景图片模式选择
        var bgModeSelect = $('settings-bg-mode');
        if (bgModeSelect) {
            try {
                var savedBgMode = localStorage.getItem('bg_mode');
                if (savedBgMode && (savedBgMode === 'tile' || savedBgMode === 'stretch' || savedBgMode === 'fit')) {
                    bgModeSelect.value = savedBgMode;
                }
            } catch(e) {}
            applyPageBgMode(bgModeSelect.value);
            bgModeSelect.addEventListener('change', function() {
                applyPageBgMode(this.value);
                try { localStorage.setItem('bg_mode', this.value); } catch(e) {}
            });
        }

        // 表面材质选择 (普通半透明/毛玻璃/亚克力)
        var bgMaterialSelect = $('settings-bg-material');
        if (bgMaterialSelect) {
            function applyMaterial(mat) {
                document.body.classList.remove('material-plain', 'material-frosted', 'material-acrylic');
                if (mat === 'plain' || mat === 'frosted' || mat === 'acrylic') {
                    document.body.classList.add('material-' + mat);
                }
            }
            try {
                var savedMat = localStorage.getItem('bg_material');
                if (savedMat && (savedMat === 'plain' || savedMat === 'frosted' || savedMat === 'acrylic')) {
                    bgMaterialSelect.value = savedMat;
                }
            } catch(e) {}
            applyMaterial(bgMaterialSelect.value);
            bgMaterialSelect.addEventListener('change', function() {
                applyMaterial(this.value);
                try { localStorage.setItem('bg_material', this.value); } catch(e) {}
            });
        }

        // 网格材质选择 (独立于工具栏材质, 控制音符网格区域)
        var gridMaterialSelect = $('settings-grid-material');
        if (gridMaterialSelect) {
            function applyGridMaterial(mat) {
                document.body.classList.remove('grid-material-plain', 'grid-material-frosted', 'grid-material-acrylic');
                if (mat === 'plain' || mat === 'frosted' || mat === 'acrylic') {
                    document.body.classList.add('grid-material-' + mat);
                }
            }
            try {
                var savedGridMat = localStorage.getItem('grid_material');
                if (savedGridMat && (savedGridMat === 'plain' || savedGridMat === 'frosted' || savedGridMat === 'acrylic')) {
                    gridMaterialSelect.value = savedGridMat;
                }
            } catch(e) {}
            applyGridMaterial(gridMaterialSelect.value);
            gridMaterialSelect.addEventListener('change', function() {
                applyGridMaterial(this.value);
                try { localStorage.setItem('grid_material', this.value); } catch(e) {}
            });
        }

        // 面板透明度滑块 (0-100, 100=面板几乎透明露出背景, 0=不透明)
        if (panelOpacitySlider) {
            try {
                var savedPanelOp = localStorage.getItem('panel_opacity');
                if (savedPanelOp !== null) {
                    var pop = parseInt(savedPanelOp);
                    if (!isNaN(pop)) panelOpacitySlider.value = pop;
                }
            } catch(e) {}
            syncPanelAlpha();
            panelOpacitySlider.addEventListener('input', function() {
                syncPanelAlpha();
            });
            panelOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('panel_opacity', this.value); } catch(e) {}
            });
        }

        // 音轨信息栏透明度滑块 (独立于面板透明度, 0-100, 100=几乎透明, 0=不透明)
        if (trackPanelOpacitySlider) {
            try {
                var savedTrackPanelOp = localStorage.getItem('track_panel_opacity');
                if (savedTrackPanelOp !== null) {
                    var tpop = parseInt(savedTrackPanelOp);
                    if (!isNaN(tpop)) trackPanelOpacitySlider.value = tpop;
                }
            } catch(e) {}
            syncTrackPanelAlpha();
            trackPanelOpacitySlider.addEventListener('input', function() {
                syncTrackPanelAlpha();
            });
            trackPanelOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('track_panel_opacity', this.value); } catch(e) {}
            });
        }

        // 网格透明度滑块
        var gridOpacitySlider = $('settings-grid-opacity');
        var gridOpacityValue = $('settings-grid-opacity-value');
        if (gridOpacitySlider) {
            try {
                var savedGridOp = localStorage.getItem('grid_opacity');
                if (savedGridOp !== null) {
                    gridOpacitySlider.value = parseFloat(savedGridOp) || 0;
                }
            } catch(e) {}
            var gop = Math.max(0, Math.min(1, parseFloat(gridOpacitySlider.value) || 0));
            if (state.pianoRoll) state.pianoRoll.setGridOpacity(gop);
            if (gridOpacityValue) gridOpacityValue.textContent = Math.round(gop * 100) + '%';
            gridOpacitySlider.addEventListener('input', function() {
                var op = Math.max(0, Math.min(1, parseFloat(this.value) || 0));
                if (state.pianoRoll) state.pianoRoll.setGridOpacity(op);
                if (gridOpacityValue) gridOpacityValue.textContent = Math.round(op * 100) + '%';
            });
            gridOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('grid_opacity', this.value); } catch(e) {}
            });
        }

        // MIDI 音色库: 下载/加载策略 (播放时询问/自动后台下载/不使用)
        var sfModeSelect = $('settings-midi-sf-mode');
        if (sfModeSelect) {
            try {
                var savedSfMode = localStorage.getItem('midi_sf_mode');
                if (savedSfMode && (savedSfMode === 'ask' || savedSfMode === 'auto' || savedSfMode === 'off')) {
                    sfModeSelect.value = savedSfMode;
                }
            } catch(e) {}
            sfModeSelect.addEventListener('change', function() {
                try { localStorage.setItem('midi_sf_mode', this.value); } catch(e) {}
            });
        }
        var sfDownloadBtn = $('settings-midi-sf-download');
        if (sfDownloadBtn) {
            sfDownloadBtn.addEventListener('click', function() {
                if (!N.shared._sfConfig) {
                    showAppAlert('未配置 MIDI 音色库下载地址 (服务端 config.yaml)', { icon: 'fa-solid fa-circle-info' });
                    return;
                }
                startSfDownload();
            });
        }
        var sfClearBtn = $('settings-midi-sf-clear');
        if (sfClearBtn) {
            sfClearBtn.addEventListener('click', function() {
                showAppConfirm('确定清除已下载的 MIDI 音色库缓存吗？清除后需重新下载。', {
                    title: '清除音色库缓存', icon: 'fa-solid fa-trash-can'
                }).then(function(ok) {
                    if (!ok) return;
                    if (window.SoundfontLoader) SoundfontLoader.clearCache();
                    updateSfStatusText('idle');
                });
            });
        }
        // 初始化状态文字
        if (window.SoundfontLoader) {
            updateSfStatusText(SoundfontLoader.getStatus());
        } else {
            updateSfStatusText('idle');
        }

        // ---- 恢复背景图: 迁移旧 localStorage 数据到 IndexedDB, 否则从 IndexedDB 读取 ----
        (function restoreBgImage() {
            var oldBg = null;
            try { oldBg = localStorage.getItem('bg_image_data'); } catch(e) {}
            if (oldBg) {
                // 旧版本将图片存 localStorage (仅小图可存), 迁移到 IndexedDB 后删除
                _bgPutImage(oldBg).then(function() {
                    try {
                        localStorage.removeItem('bg_image_data');
                        localStorage.setItem('bg_migrated_v2', '1');
                    } catch(e) {}
                    applyPageBgImage(oldBg);
                    var fname = null;
                    try { fname = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname || '');
                }).catch(function() {
                    // 迁移失败: 本次仍用 localStorage 数据, 下次访问再试
                    applyPageBgImage(oldBg);
                    var fname2 = null;
                    try { fname2 = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname2 || '');
                });
                return;
            }
            _bgGetImage().then(function(dataUrl) {
                if (dataUrl) {
                    applyPageBgImage(dataUrl);
                    var fname3 = null;
                    try { fname3 = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname3 || '');
                }
            });
        })();

        // 设置弹窗标签页切换
        var settingsTabs = document.querySelectorAll('.settings-tab');
        for (var st = 0; st < settingsTabs.length; st++) {
            (function(tab) {
                tab.addEventListener('click', function() {
                    var target = tab.getAttribute('data-settings-tab');
                    document.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.toggle('active', t === tab); });
                    document.querySelectorAll('.settings-tab-panel').forEach(function(p) {
                        p.classList.toggle('active', p.id === 'settings-tab-' + target);
                    });
                });
            })(settingsTabs[st]);
        }

        // 收音机式 (指针居中) 速度滑块
        var settingsTempoSlider = $('settings-tempo-slider');
        if (settingsTempoSlider) {
            // 旧版 range 隐藏 (但保留 DOM, 兼容旧引用)
            settingsTempoSlider.style.display = 'none';
        }
        initRadioTempoSlider();

        // 速度直接输入 (最多 3 位小数, 范围 1-512)
        var settingsTempoInput = $('settings-tempo-input');
        if (settingsTempoInput) {
            settingsTempoInput.addEventListener('input', function(e) {
                var rawStr = e.target.value;
                // 限制输入最多 3 位小数: 只允许数字 + 一个小数点 + 至多 3 位小数
                if (!/^\d*\.?\d{0,3}$/.test(rawStr)) {
                    // 回退到上次的合法值
                    e.target.value = (Math.round(state.tempo * 1000) / 1000).toString();
                    return;
                }
                var raw = parseFloat(rawStr);
                if (isNaN(raw)) return;
                // 限制范围 1 - 512
                var v = Math.max(1, Math.min(512, raw));
                state.tempo = v;
                $setText('settings-tempo-value', v.toFixed(3).replace(/\.?0+$/, ''));
                updateRadioTempoSlider();
                $('tempo-value').value = v.toFixed(1);
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
        }

        // 自动翻页模式切换 (工具栏旧按钮, 若存在)
        var autoScrollBtn = $('btn-auto-scroll');
        if (autoScrollBtn) {
            autoScrollBtn.addEventListener('click', function() {
                state.smoothScroll = !state.smoothScroll;
                if (state.pianoRoll) {
                    state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                }
                updateAutoScrollBtnIcon();
                markDirty();
            });
        }

        // MIDI 弹窗事件
        var midiImportBtn = $('midi-import-btn');
        if (midiImportBtn) midiImportBtn.addEventListener('click', doImportMidi);
        var midiCancelBtn = $('midi-cancel-btn');
        if (midiCancelBtn) midiCancelBtn.addEventListener('click', closeMidiPopup);
        var midiCloseBtn = $('midi-close-btn');
        if (midiCloseBtn) midiCloseBtn.addEventListener('click', closeMidiPopup);
        var keepNoteLengthSelect = $('midi-keep-note-length');
        if (keepNoteLengthSelect) keepNoteLengthSelect.addEventListener('change', updateSustainTracksUI);
        var sustainTracksBtn = $('midi-sustain-tracks-btn');
        if (sustainTracksBtn) sustainTracksBtn.addEventListener('click', showSustainTracksDialog);

        // 音域处理模式切换
        var octaveModeSel = $('midi-octave-mode');
        if (octaveModeSel) {
            octaveModeSel.addEventListener('change', function() {
                var mode = parseInt(this.value) || 0;
                updateOctaveModeHint(mode);
                // 模式切换时重新计算通道映射表的默认八度
                updateChannelOctaveForMode(mode);
            });
            // 触发一次以初始化提示状态
            var initMode = parseInt(octaveModeSel.value) || 0;
            updateOctaveModeHint(initMode);
            // 初始化强制折叠 checkbox 可见性
            updateChannelOctaveForMode(initMode);
        }

        // 智能音色替代开关: 改变时重新计算偏移和提示 (仅在模式 2/3 下生效)
        var smartSubstituteCheck = $('midi-smart-substitute');
        if (smartSubstituteCheck) {
            smartSubstituteCheck.addEventListener('change', function() {
                if (this.disabled) return;
                var mode = parseInt(octaveModeSel ? octaveModeSel.value : 0) || 0;
                if (mode === 2 || mode === 3) {
                    updateChannelOctaveForMode(mode);
                }
                updateOctaveModeHint(mode);
            });
        }

        // 强制归位开关: 改变时仅刷新提示 (不影响偏移计算)
        var forceFoldCheck = $('midi-force-fold');
        if (forceFoldCheck) {
            forceFoldCheck.addEventListener('change', function() {
                if (this.disabled) return;
                var mode = parseInt(octaveModeSel ? octaveModeSel.value : 0) || 0;
                updateOctaveModeHint(mode);
            });
        }

        // 音色替代设置按钮
        var substituteBtn = $('midi-substitute-settings-btn');
        if (substituteBtn) substituteBtn.addEventListener('click', openSubstituteSettings);
        var substituteCloseBtn = $('midi-substitute-close-btn');
        if (substituteCloseBtn) substituteCloseBtn.addEventListener('click', closeSubstituteSettings);
        var substituteCancelBtn = $('midi-substitute-cancel-btn');
        if (substituteCancelBtn) substituteCancelBtn.addEventListener('click', closeSubstituteSettings);
        var substituteSaveBtn = $('midi-substitute-save-btn');
        if (substituteSaveBtn) substituteSaveBtn.addEventListener('click', function() {
            var config = readSubstituteConfigFromUI();
            saveSubstituteConfig(config);
            closeSubstituteSettings();
            showMidiNotice('音色替代配置已保存', 'success');
            // 替代配置变化后刷新通道映射偏移和音域提示
            var _mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
            if (_mode === 2 || _mode === 3) {
                updateChannelOctaveForMode(_mode);
            }
            updateOctaveModeHint(_mode);
        });
        var substituteResetBtn = $('midi-substitute-reset-btn');
        if (substituteResetBtn) substituteResetBtn.addEventListener('click', function() {
            N.shared._substituteConfig = JSON.parse(JSON.stringify(N.shared.DEFAULT_SUBSTITUTE));
            saveSubstituteConfig(N.shared._substituteConfig);
            renderSubstituteRows(N.shared._substituteConfig);
            showMidiNotice('已恢复默认替代配置', 'info');
        });
        // 点击遮罩关闭
        var substitutePopup = $('midi-substitute-popup');
        if (substitutePopup) substitutePopup.addEventListener('click', function(e) {
            if (e.target === this) closeSubstituteSettings();
        });

        // Tab 切换事件
        var subTabBtns = document.querySelectorAll('#midi-substitute-popup .midi-sub-tab');
        for (var sti = 0; sti < subTabBtns.length; sti++) {
            subTabBtns[sti].addEventListener('click', function(e) {
                e.stopPropagation();
                var tabName = this.getAttribute('data-subtab');
                if (tabName) switchSubstituteTab(tabName);
            });
        }

        // MIDI 标签页切换
        var midiTabs = document.querySelectorAll('.midi-tab');
        for (var ti = 0; ti < midiTabs.length; ti++) {
            midiTabs[ti].addEventListener('click', function() {
                switchMidiTab(this.getAttribute('data-tab'));
            });
        }

        // MIDI 子标签页切换
        var midiSubTabs = document.querySelectorAll('.midi-sub-tab');
        for (var si = 0; si < midiSubTabs.length; si++) {
            midiSubTabs[si].addEventListener('click', function() {
                switchMidiSubTab(this.getAttribute('data-subtab'));
            });
        }

        // MIDI 导入配置按文件哈希保存在内存, 打开文件时再应用 (此处不预加载)

        // 音色拟合「推荐选项」档位控件 (档位缩放拟合槽数)
        initFittingLevelControl();

        // 八度警告
        var octaveCloseBtn = $('octave-close-btn');
        var octaveCloseX = $('octave-close-x');
        function closeOctavePopup() {
            var p = $('octave-popup');
            if (p) { p.style.display = ''; p.classList.remove('active'); }
        }
        if (octaveCloseBtn) octaveCloseBtn.addEventListener('click', closeOctavePopup);
        if (octaveCloseX) octaveCloseX.addEventListener('click', closeOctavePopup);

        // 关于我们弹窗
        var aboutBtn = $('btn-about');
        var aboutPopup = $('about-popup');
        var aboutClose = $('about-close-btn');
        var aboutCloseX = $('about-close-x');
        if (aboutBtn && aboutPopup) {
            aboutBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isVisible = aboutPopup.style.display === 'flex';
                if (isVisible) {
                    aboutPopup.style.display = '';
                    aboutPopup.classList.remove('active');
                } else {
                    aboutPopup.style.display = 'flex';
                    aboutPopup.classList.add('active');
                }
            });
        }
        function closeAboutPopup(e) {
            if (e) e.stopPropagation();
            if (aboutPopup) {
                aboutPopup.style.display = '';
                aboutPopup.classList.remove('active');
            }
        }
        if (aboutClose) aboutClose.addEventListener('click', closeAboutPopup);
        if (aboutCloseX) aboutCloseX.addEventListener('click', closeAboutPopup);

        // ============ 工具栏响应式折叠：自动把溢出项收进"更多"菜单 ============
        function refreshToolbarLayout() {
            var toolbar = $('toolbar');
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!toolbar || !moreBtn || !moreMenu) return;

            // 只折叠带有 data-group="overflow" 的项; 不带这个属性的始终保留 (例如速度按钮)
            // 排除 btn-settings 和 btn-functions, 它们在移动端始终可见
            var allCollapsibles = toolbar.querySelectorAll('.toolbar-collapsible[data-group="overflow"]');
            var collapsibles = [];
            for (var ai = 0; ai < allCollapsibles.length; ai++) {
                var cid = allCollapsibles[ai].id;
                if (cid !== 'btn-settings' && cid !== 'btn-functions') {
                    collapsibles.push(allCollapsibles[ai]);
                }
            }
            var rightSection = toolbar.querySelector('.toolbar-right');
            if (!rightSection) return;

            // 先恢复所有 collapsible 可见
            for (var ci = 0; ci < collapsibles.length; ci++) {
                collapsibles[ci].style.display = '';
            }
            moreBtn.style.display = 'none';
            moreMenu.style.display = 'none';

            // 移动端: 工具栏更紧凑
            if (window.innerWidth <= 768) {
                toolbar.classList.add('toolbar-compact');
            } else {
                toolbar.classList.remove('toolbar-compact');
            }

            // 测量实际剩余宽度
            var toolbarW = toolbar.clientWidth;
            var leftSection = toolbar.querySelector('.toolbar-section');
            var usedW = (leftSection ? leftSection.offsetWidth : 0);
            // 估算右侧"必须"宽度: undo/redo + 速度按钮 + margin
            var minRightFixed = 200;
            var availableForOverflow = toolbarW - usedW - minRightFixed - 60;

            // 如果 collapsibles 总宽度超过可用空间，则逐个收起
            var collapsibleWidths = [];
            var totalCollapsibleW = 0;
            for (var cj = 0; cj < collapsibles.length; cj++) {
                var w = collapsibles[cj].offsetWidth || 60;
                collapsibleWidths.push(w);
                totalCollapsibleW += w;
            }

            if (availableForOverflow < totalCollapsibleW && collapsibles.length > 0) {
                moreBtn.style.display = '';
                var collectedItems = [];
                var overflowW = totalCollapsibleW - availableForOverflow;
                // 倒序检测, 优先收起靠后的按钮
                for (var ck = collapsibles.length - 1; ck >= 0; ck--) {
                    if (overflowW > 0 || collectedItems.length > 0) {
                        collectedItems.push(collapsibles[ck]);
                        overflowW -= collapsibleWidths[ck];
                    }
                }
                // 小屏幕 (<=560px) 且有 collected, 全部收起
                if (toolbarW <= 560) {
                    collectedItems = Array.prototype.slice.call(collapsibles);
                }
                if (collectedItems.length > 0) {
                    renderMoreMenu(collectedItems);
                    for (var cm = 0; cm < collectedItems.length; cm++) {
                        collectedItems[cm].style.display = 'none';
                    }
                }
            }
        }

        function renderMoreMenu(items) {
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!moreBtn || !moreMenu) return;

            moreMenu.innerHTML = '';
            for (var ii = 0; ii < items.length; ii++) {
                var el = items[ii];
                var menuItem = document.createElement('div');
                menuItem.className = 'toolbar-more-item';
                if (el.classList && el.classList.contains('toolbar-tempo')) {
                    menuItem.innerHTML = el.innerHTML;
                    var slider = menuItem.querySelector('input[type="range"]');
                    if (slider) {
                        slider.value = el.querySelector('input[type="range"]').value;
                        slider.addEventListener('input', function(e) {
                            var mainSlider = $('tempo-slider');
                            if (mainSlider) {
                                mainSlider.value = e.target.value;
                                var evt = new Event('input', { bubbles: true });
                                mainSlider.dispatchEvent(evt);
                            }
                        });
                    }
                    var valLabel = menuItem.querySelector('#tempo-value');
                    if (valLabel) valLabel.id = 'tempo-value-menu';
                } else {
                    var iconEl = el.querySelector('.icon');
                    var iconHtml = iconEl ? iconEl.outerHTML : '';
                    // 纯图标工具栏按钮的 title 已被自定义 tooltip 迁移为 data-tip,
                    // 因此标签需按 title -> data-tip -> aria-label -> textContent 依次取;
                    // 若都不存在则跳过该项, 避免出现只有图标没有文字的空白菜单项
                    var label = (el.title || el.getAttribute('data-tip') || el.getAttribute('aria-label') || el.textContent || '').trim();
                    if (!label && !iconHtml) continue;
                    menuItem.innerHTML = iconHtml + '<span></span>';
                    var labelSpan = menuItem.querySelector('span');
                    if (labelSpan) labelSpan.textContent = label;
                    menuItem.addEventListener('click', function(srcEl) {
                        return function() {
                            srcEl.click();
                            moreMenu.style.display = 'none';
                        };
                    }(el));
                }
                moreMenu.appendChild(menuItem);
            }
        }

        // 更多按钮切换显示
        (function setupMoreBtn() {
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!moreBtn || !moreMenu) return;
            moreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isVisible = moreMenu.style.display === 'block';
                moreMenu.style.display = isVisible ? 'none' : 'block';
                // 定位到按钮下方
                if (!isVisible) {
                    var rect = moreBtn.getBoundingClientRect();
                    window.WebNBSPositionFlyout(moreMenu, rect, { placement: 'bottom-end' });
                }
            });
            document.addEventListener('click', function(e) {
                if (!moreMenu.contains(e.target) && e.target !== moreBtn) {
                    moreMenu.style.display = 'none';
                }
            });
        })();

        // 初始刷新 & 窗口变化时再次刷新
        // 注: 不再以初始宽度是否为移动端为条件 —— 桌面/移动之间来回切换时也必须重算,
        //     否则先前被收进"更多"的按钮会残留在隐藏状态。
        var _toolbarRefreshTimer = null;
        function scheduleToolbarRefresh() {
            if (_toolbarRefreshTimer) return;
            _toolbarRefreshTimer = setTimeout(function() {
                _toolbarRefreshTimer = null;
                refreshToolbarLayout();
            }, 80);
        }
        scheduleToolbarRefresh();
        window.addEventListener('resize', scheduleToolbarRefresh);
        window.addEventListener('orientationchange', scheduleToolbarRefresh);
        // 图标字体加载完成后按钮实际宽度会变化, 需重新测量一次, 避免折叠结果与实际宽度不符
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
            document.fonts.ready.then(function() { refreshToolbarLayout(); });
        }

        updateProgressUI();

        // 键盘快捷键
        initKeyboardShortcuts();
        startFpsDisplayTimer();
        // 模态弹窗打开时自动关闭残留的悬浮菜单
        initModalFloatGuard();

        // 创作辅助悬浮窗 + 音符查找/替换浮层
        initCreativeAssist();
        initFindPanel();

        // 自定义音色系统
        initCustomInstrumentsUI();
        if (window.CustomInstruments) {
            CustomInstruments.init(function() {
                // 启动后懒加载注册全部自定义音色缓冲 (供播放)
                CustomInstruments.setReservedNames(getInstrumentNames());
                // 等待首次交互音频初始化后再解码注册, 避免页面加载即建 AudioContext
            });
        }

        // 全局点击/触摸关闭上下文菜单 + 其他弹窗
        // 使用 capture 阶段拦截, 关闭菜单时阻止事件继续传播到 canvas (避免误放置音符)
        var suppressNextCanvasClick = false;
        var closeAllPopups = function(e) {
            // 歌词编辑小悬浮窗 (挂在 body 上): 点击内部不关闭
            var lyricEditorPop = document.getElementById('lyric-editor-pop');
            if (lyricEditorPop && lyricEditorPop.contains(e.target)) {
                return;
            }
            if (lyricEditorPop) {
                closeLyricEditorPop();
                suppressNextCanvasClick = true;
            }
            // 音色子菜单项被触摸/点击时, 不关闭任何弹窗 (优先判断, 避免 capture 阶段误删子菜单)
            var instSubMenu = $('instrument-submenu');
            if (instSubMenu && instSubMenu.contains(e.target)) {
                return;
            }
            // 音色槽子菜单同理
            var timbreSlotMenu = $('timbre-slot-menu');
            if (timbreSlotMenu && timbreSlotMenu.contains(e.target)) {
                return;
            }
            // 右键菜单
            var menu = $('context-menu');
            if (menu && menu.style.display === 'block' && !menu.contains(e.target)) {
                hideContextMenu();
                suppressNextCanvasClick = true;
            }
            // 乐器选择弹窗
            var instPopup = $('instrument-popup');
            if (instPopup && instPopup.classList.contains('visible')
                && !instPopup.contains(e.target) && e.target.id !== 'btn-instrument-selector'
                && !(e.target.parentElement && e.target.parentElement.id === 'btn-instrument-selector')) {
                instPopup.classList.remove('visible');
                suppressNextCanvasClick = true;
            }
            // 乐器浮动窗口 (桌面端): 不再因点击外部而关闭
            // 仅通过再次点击乐器选择器按钮来切换 (toggleInstrumentPopup)
            // 乐器子菜单
            var subMenu = $('instrument-submenu');
            if (subMenu && !subMenu.contains(e.target) && (!menu || !menu.contains(e.target))) {
                subMenu.remove();
                suppressNextCanvasClick = true;
            }
            // 关于我们弹窗
            var aboutPopup = $('about-popup');
            if (aboutPopup && aboutPopup.classList.contains('active')
                && !aboutPopup.contains(e.target) && e.target.id !== 'btn-about') {
                // 检查点击是否在其他弹窗内部 (避免误关闭)
                if (!(e.target.closest && (e.target.closest('#midi-substitute-popup') || e.target.closest('.cdd-list.cdd-visible') || e.target.closest('.app-dialog-overlay')))) {
                    aboutPopup.classList.remove('active');
                    aboutPopup.style.display = '';
                }
            }
            // 延音轨道弹窗：点击其内部时不关闭 MIDI 导入弹窗
            if (e.target.closest && e.target.closest('#sustain-tracks-popup')) {
                return;
            }
            // 音色替代设置弹窗：点击其内部时不关闭 MIDI 导入弹窗
            if (e.target.closest && e.target.closest('#midi-substitute-popup')) {
                return;
            }
            // 自定义下拉框列表：点击下拉框内部时不关闭弹窗 (cdd-list 挂载在 body 上)
            if (e.target.closest && e.target.closest('.cdd-list.cdd-visible')) {
                return;
            }
            // 音色槽菜单挂载在 body 上，点击菜单内部时不关闭弹窗
            if (e.target.closest && e.target.closest('#substitute-slot-menu')) {
                return;
            }
            if (e.target.closest && e.target.closest('#timbre-slot-menu')) {
                return;
            }
            // AppDialog 弹窗：点击 AppDialog 内部时不关闭 MIDI 弹窗
            if (e.target.closest && e.target.closest('.app-dialog-overlay')) {
                return;
            }
            // MIDI 导入弹窗
            var midiPopup = $('midi-popup');
            var midiOverrideWarning = $('midi-override-warning-popup');
            if (midiPopup && midiPopup.classList.contains('active')
                && !midiPopup.contains(e.target) && e.target.id !== 'midi-close-btn'
                && !(midiOverrideWarning && midiOverrideWarning.contains(e.target))) {
                closeMidiPopup();
            }
            // 设置弹窗
            var settingsPopup = $('settings-popup');
            if (settingsPopup && (settingsPopup.classList.contains('active') || settingsPopup.style.display === 'flex')
                && !settingsPopup.contains(e.target)
                && e.target.id !== 'btn-settings' && !(e.target.closest && e.target.closest('#btn-settings'))) {
                // 检查点击是否在其他弹窗内部 (避免误关闭)
                if (!(e.target.closest && (e.target.closest('#midi-substitute-popup') || e.target.closest('.cdd-list.cdd-visible') || e.target.closest('.app-dialog-overlay')))) {
                    settingsPopup.classList.remove('active');
                    settingsPopup.style.display = 'none';
                }
            }
            // 速度弹窗 (btn-open-tempo 已删除, 保留关闭逻辑兼容)
            var tempoPopup = $('tempo-popup');
            if (tempoPopup && (tempoPopup.classList.contains('active') || tempoPopup.style.display === 'flex')
                && !tempoPopup.contains(e.target)) {
                tempoPopup.classList.remove('active');
                tempoPopup.style.display = 'none';
            }
            // 自定义音色管理弹窗
            var ciPopup = $('custom-instruments-popup');
            if (ciPopup && ciPopup.classList.contains('active')
                && !ciPopup.contains(e.target)
                && e.target.id !== 'btn-custom-instruments'
                && !(e.target.closest && e.target.closest('#btn-custom-instruments'))) {
                closeCustomInstPopup();
            }
            // 自定义音色信息设置弹窗: 点击外部 = 取消导入
            var ciInfoPopup = $('custom-inst-info-popup');
            if (ciInfoPopup && ciInfoPopup.classList.contains('active') && !ciInfoPopup.contains(e.target)) {
                ciCloseImportInfo(true);
            }
            // 音频修正窗口: 点击外部 = 取消导入
            var ciFixPopup = $('custom-inst-fix-popup');
            if (ciFixPopup && ciFixPopup.classList.contains('active') && !ciFixPopup.contains(e.target)) {
                ciFixCloseWindow(true);
            }
            // 文件菜单 (点击历史子菜单内不关闭文件菜单, 由子菜单项自行处理)
            var fileMenu = document.getElementById('file-menu');
            var historySub = document.getElementById('history-submenu');
            if (fileMenu && !fileMenu.contains(e.target)
                && (!historySub || !historySub.contains(e.target))
                && e.target.id !== 'btn-file') {
                hideFileMenu();
            }
            // 创作辅助悬浮窗: 常驻面板, 不因点击外部关闭 (仅通过按钮/Esc/×关闭)
            // 音符查找/替换浮层: 点击面板外部区域关闭
            // (悬浮选择窗 #find-pick-pop 挂在 body 上, 视觉上是面板的一部分, 需一并视为「内部」)
            var findPick = findPickPop();
            if (findPanelVisible() && !$('find-panel').contains(e.target)
                && !(findPick && findPick.style.display !== 'none' && findPick.contains(e.target))) {
                closeFindPanel();
            }
            // 历史对话框
            var historyDialog = document.getElementById('history-dialog');
            if (historyDialog && !historyDialog.contains(e.target)) {
                historyDialog.remove();
            }
        };
        document.addEventListener('click', closeAllPopups, true);   // capture 阶段
        document.addEventListener('touchstart', closeAllPopups, true, { passive: true });

        // 让 piano_roll 知道"刚关闭菜单" - 抑制下一次 canvas mousedown 触发放置
        if (state.pianoRoll) {
            state.pianoRoll._suppressNextClick = false;
        }
        document.addEventListener('mousedown', function(e) {
            if (suppressNextCanvasClick) {
                suppressNextCanvasClick = false;
                if (state.pianoRoll) {
                    state.pianoRoll._suppressNextClick = true;
                    setTimeout(function() { if (state.pianoRoll) state.pianoRoll._suppressNextClick = false; }, 250);
                }
            }
        }, true);

        // AudioContext 初始化
        var audioInit = false;
        function onFirstInteract() {
            if (audioInit) return;
            audioInit = true;
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            // 首次交互后懒加载注册自定义音色 (解码为 AudioBuffer 供播放)
            if (window.CustomInstruments) {
                CustomInstruments.registerAll();
            }
            document.removeEventListener('click', onFirstInteract);
            document.removeEventListener('touchstart', onFirstInteract);
            document.removeEventListener('keydown', onFirstInteract);
        }
        document.addEventListener('click', onFirstInteract);
        document.addEventListener('touchstart', onFirstInteract);
        document.addEventListener('keydown', onFirstInteract);

        // 加载乐器
        loadInstruments();

        // 初始化轨道
        initTracks();

        updateProgressUI();
        updateInstrumentSelectorUI();

        // 轨道面板折叠按钮
        var trackPanelToggle = $('track-panel-toggle');
        if (trackPanelToggle) {
            var _panelToggleLastTime = 0;
            var _panelToggleHandler = function(e) {
                e.stopPropagation();
                e.preventDefault();
                if (!state.pianoRoll) return;
                // 防止移动端 touchend + click 双重触发 (350ms 内只响应一次)
                var now = Date.now();
                if (now - _panelToggleLastTime < 350) return;
                _panelToggleLastTime = now;

                // 判断当前是否已折叠 (注意: 0 是有效值, 不能用 ||)
                var currentWidth = state.pianoRoll._currentPanelWidth;
                if (currentWidth === undefined || currentWidth === null) {
                    currentWidth = state.pianoRoll._cfg.sidePanelWidth;
                }
                if (currentWidth === undefined || currentWidth === null) currentWidth = 134;
                var collapsed = currentWidth > 10;
                // 调用 setPanelCollapsed (若存在), 否则回退到直接修改 _cfg.sidePanelWidth
                if (typeof state.pianoRoll.setPanelCollapsed === 'function') {
                    state.pianoRoll.setPanelCollapsed(collapsed);
                } else {
                    if (collapsed) {
                        state.pianoRoll._cfg.sidePanelWidth = 0;
                    } else {
                        state.pianoRoll._cfg.sidePanelWidth = 200;
                    }
                    state.pianoRoll.render();
                }
                // 更新图标
                setTimeout(syncTrackPanelToggleButton, 0);
            };
            trackPanelToggle.addEventListener('click', _panelToggleHandler);
            // 移动端 touchend 也处理, 但通过时间戳防抖避免与 click 重复
            trackPanelToggle.addEventListener('touchend', function(e) {
                e.stopPropagation();
                e.preventDefault();
                _panelToggleHandler.call(this, e);
            });
            syncTrackPanelToggleButton();
        }

        // 建立干净的初始状态 (不自动恢复上次内容, 由欢迎引导层决定进入方式)
        resetToNewFile(false);
        syncTrackPanelToggleButton();

        // 启动自动保存定时器 (每 15 秒)
        startAutoSaveInterval();

        // 显示欢迎引导界面 (每次打开都显示, 可从引导层恢复上一次的项目)
        initWelcomeScreen();

        // 迁移旧版 localStorage 历史数据到 IndexedDB, 再清理孤儿文件。
        // 迁移完成后刷新最近歌曲列表, 之前被标记「已清理」的作品会重新可用。
        migrateProjectsToIndexedDB().then(function(migrated) {
            cleanupOrphanedFiles();
            if (migrated && $('welcome-screen')) {
                renderWelcomeRecent();
                updateWelcomeResumeHint();
            }
        }).catch(function() {
            cleanupOrphanedFiles();
        });

        // 本地缓存占用检查 (超过阈值时提示用户清理)
        checkStorageUsage();

        // 初始化按钮 Tooltip 系统
        if (window.attachTooltips) window.attachTooltips();
    }

    // ---- 导出 ----
    N.init = init;
})(window.WebNBS);
