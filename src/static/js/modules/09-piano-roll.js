/* 09-piano-roll.js — MiauNoteBlock 功能模块
   来源: 原 main.js L4666-L4931; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function commitLyricClipDrag() { return N.commitLyricClipDrag.apply(this, arguments); }
    function createLyricClip() { return N.createLyricClip.apply(this, arguments); }
    function deleteTrack() { return N.deleteTrack.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function moveTrackDown() { return N.moveTrackDown.apply(this, arguments); }
    function moveTrackUp() { return N.moveTrackUp.apply(this, arguments); }
    function mutedSoloToLock() { return N.mutedSoloToLock.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function renderSegmentSidePanel() { return N.renderSegmentSidePanel.apply(this, arguments); }
    function reorderTrack() { return N.reorderTrack.apply(this, arguments); }
    function seekToTick() { return N.seekToTick.apply(this, arguments); }
    function segmentAdoptTick() { return N.segmentAdoptTick.apply(this, arguments); }
    function segmentCommitDrag() { return N.segmentCommitDrag.apply(this, arguments); }
    function segmentFollowSongEnd() { return N.segmentFollowSongEnd.apply(this, arguments); }
    function setLayerLock() { return N.setLayerLock.apply(this, arguments); }
    function setTrackVolume() { return N.setTrackVolume.apply(this, arguments); }
    function showContextMenu() { return N.showContextMenu.apply(this, arguments); }
    function showLyricEditorPop() { return N.showLyricEditorPop.apply(this, arguments); }
    function stopUnaudibleTrackAudio() { return N.stopUnaudibleTrackAudio.apply(this, arguments); }
    function switchTool() { return N.switchTool.apply(this, arguments); }
    function syncSoloLayersToSong() { return N.syncSoloLayersToSong.apply(this, arguments); }
    function updateLyricsEditBar() { return N.updateLyricsEditBar.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackName() { return N.updateTrackName.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }


    // ============ 钢琴卷帘初始化 ============
    function initPianoRoll() {
        if (!window.PianoRoll) return;
        try {
            state.pianoRoll = new PianoRoll('piano-roll');
            if (!state.pianoRoll) return;
            // Keep the roll's drawing pitch aligned with the default C4 before
            // any note is placed or a saved project is loaded.
            state.pianoRoll.setSelectedKey(state.selectedPianoKey);
            // 应用「时间栏视图高度」设置 (顶部导航条 / 音符缩略 map)
            try {
                var _tlv = localStorage.getItem('timeline_view_height');
                state.pianoRoll.setTimelineBarHeight((_tlv === 'medium' || _tlv === 'large') ? _tlv : 'small');
            } catch(e) {}

            // 设置回调
            // 片段编辑: 选中片段 / 拖动提交 (端点剪裁与整体移动都会真正改动音符)
            state.pianoRoll.onSegmentScroll = function() {
                if (state.segmentsEditMode) renderSegmentSidePanel();
            };
            state.pianoRoll.onSegmentSelect = function(id) {
                state.pianoRoll.segmentSelectedId = id;
            };
            state.pianoRoll.onSegmentCommit = function(id, newStart, newEnd, mode) {
                segmentCommitDrag(id, newStart, newEnd, mode);
            };
            state.pianoRoll.onPerformanceLayersChanged = function(layers) {
                state.performanceTrackLayers = layers.slice();
                var trackInfoEl = $('perf-track-name');
                if (trackInfoEl) {
                    if (layers.length === 0) {
                        trackInfoEl.textContent = '请在画布中点击选择要录制的音轨';
                    } else {
                        var names = [];
                        for (var i = 0; i < layers.length; i++) {
                            var track = findTrackByLayer(layers[i]);
                            names.push(track ? track.name : ('Layer ' + (layers[i] + 1)));
                        }
                        trackInfoEl.textContent = '录制到: ' + names.join(', ');
                    }
                }
            };

            state.pianoRoll.onNoteAdded = function(noteData) {
                pushUndo();
                // 钢琴键盘选中的音调覆盖 key, 但 layer 保持 Y 轴位置
                var pianoKey = null;
                if (state.pianoRoll) pianoKey = state.pianoRoll.getSelectedKey();
                if (pianoKey !== null && pianoKey !== undefined && pianoKey >= 0) {
                    noteData.key = pianoKey;
                }
                var note = state.pianoRoll.addNote(noteData);
                state.notes = state.pianoRoll.getNotes();
                buildNoteIndex(state.notes);
                // 默认单片段: 先跟随全曲长度自动扩展 (新音符落在末尾之外也能覆盖)
                segmentFollowSongEnd();
                // 裁剪后的空洞中放置音符: 自动创建/扩展片段
                segmentAdoptTick(note.tick);
                updateNoteCount();
                updateProgressUI();
                markDirty();
                // 播放放置动画
                if (state.pianoRoll && state.pianoRoll._addPlaceAnimation) {
                    state.pianoRoll._addPlaceAnimation(note);
                }
            };

            // 整组放置回调 (延音放置): 一次动作 = 一次撤销, 批量写入并单次渲染
            state.pianoRoll.onNoteGroupAdded = function(group) {
                pushUndo();
                if (!group || group.length === 0) return;
                // 钢琴键盘选中的音调覆盖组内所有音符 key
                var pianoKey = state.pianoRoll ? state.pianoRoll.getSelectedKey() : null;
                if (pianoKey !== null && pianoKey !== undefined && pianoKey >= 0) {
                    for (var gi = 0; gi < group.length; gi++) group[gi].key = pianoKey;
                }
                var added = [];
                for (var gj = 0; gj < group.length; gj++) {
                    state.pianoRoll._removeNoteAtPos(group[gj].tick, group[gj].layer);
                    var note = state.pianoRoll.addNote(group[gj]);
                    added.push(note);
                }
                state.notes = state.pianoRoll.getNotes();
                buildNoteIndex(state.notes);
                // 默认单片段: 先跟随全曲长度自动扩展
                segmentFollowSongEnd();
                // 整组放置: 对每个落点检查是否需要新建片段
                for (var ga = 0; ga < added.length; ga++) {
                    if (added[ga] && isFinite(added[ga].tick)) segmentAdoptTick(added[ga].tick);
                }
                updateNoteCount();
                updateProgressUI();
                markDirty();
                // 只给首音符播放放置动画, 避免整组同时弹动画
                if (state.pianoRoll && state.pianoRoll._addPlaceAnimation && added.length > 0) {
                    state.pianoRoll._addPlaceAnimation(added[0]);
                }
            };

            // 音符预览回调 (用于动画播放音色)
            state.pianoRoll.onNotePreview = function(instrument, key) {
                if (window.AudioEngine && AudioEngine.playNote) {
                    AudioEngine.playNote(instrument, key, 80);
                }
            };

            state.pianoRoll.onNotesChanged = function(selectedNotes) {
                state.notes = state.pianoRoll.getNotes();
                buildNoteIndex(state.notes);
                updateNoteCount();
                updateProgressUI();
                updateTrackPanelUI();
                markDirty();
            };

            state.pianoRoll.onNoteDragStart = function() {
                pushUndo();
            };

            state.pianoRoll.onContextMenu = function(x, y, noteIds, isLongPress) {
                showContextMenu(x, y, noteIds, isLongPress);
            };

            state.pianoRoll.onSelectionChanged = function(selectedNotes) {
                updateTrackPanelUI();
            };

            // 轨道 M/S/删除 按钮变化回调 (与 canvas 交互)
            state.pianoRoll.onTrackChanged = function(layer, updatedInfo) {
                pushUndo();
                // 同步 state.tracks 与 pianoRoll.trackInfo
                var track = findTrackByLayer(layer);
                if (track) {
                    track.muted = updatedInfo.muted;
                    track.solo = updatedInfo.solo;
                    track.name = updatedInfo.name;
                } else {
                    state.tracks.push({
                        layer: layer,
                        name: updatedInfo.name,
                        muted: updatedInfo.muted,
                        solo: updatedInfo.solo,
                        volume: (updatedInfo.volume !== undefined) ? updatedInfo.volume : 100,
                        noteCount: 0,
                        instrument: 0
                    });
                }
                // 同步到 state.song.layers 的 lock 字段
                setLayerLock(layer, mutedSoloToLock(!!updatedInfo.muted, !!updatedInfo.solo));
                stopUnaudibleTrackAudio();
                syncSoloLayersToSong();
                // 判断是否有 solo 激活
                state.soloActive = false;
                for (var ti = 0; ti < state.tracks.length; ti++) {
                    if (state.tracks[ti].solo) { state.soloActive = true; break; }
                }
                updateTrackPanelUI();
                markDirty();
            };

            // 轨道重命名回调
            state.pianoRoll.onTrackRename = function(layer, newName) {
                pushUndo();
                updateTrackName(layer, newName);
            };

            state.pianoRoll.onSetTrackVolume = function(layer, volume) {
                setTrackVolume(layer, volume);
            };

            state.pianoRoll.onVolumeChangeStart = function(layer) {
                pushUndo();
            };

            // 添加轨道回调
            state.pianoRoll.onAddTrack = function() {
                pushUndo();
                if (!state.song) state.song = {};
                if (!state.song.layers) state.song.layers = [];
                state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
                state.pianoRoll.trackCount = state.song.layers.length;
                updateTrackPanelUI();
                markDirty();
            };

            // 移动轨道回调 (direction: -1=上移, 1=下移)
            state.pianoRoll.onMoveTrack = function(layer, direction) {
                if (direction < 0) {
                    moveTrackUp(layer);
                } else {
                    moveTrackDown(layer);
                }
            };

            // 拖拽排序回调 (fromLayer → toLayer)
            state.pianoRoll.onReorderTrack = function(fromLayer, toLayer) {
                reorderTrack(fromLayer, toLayer);
            };

            // 删除轨道回调
            state.pianoRoll.onDeleteTrack = function(layer) {
                deleteTrack(layer);
            };

            // 选中该层所有音符回调
            state.pianoRoll.onSelectAllInLayer = function(layer) {
                if (!state.pianoRoll) return;
                var notes = state.pianoRoll.getNotes();
                var ids = [];
                for (var i = 0; i < notes.length; i++) {
                    if (notes[i].layer === layer) ids.push(notes[i].id);
                }
                var selected = state.pianoRoll.getSelectedNotes ? state.pianoRoll.getSelectedNotes() : [];
                var merged = {};
                for (var si = 0; si < selected.length; si++) {
                    if (selected[si] && selected[si].id) merged[selected[si].id] = true;
                }
                for (var ii = 0; ii < ids.length; ii++) merged[ids[ii]] = true;
                state.pianoRoll.selectNotes(Object.keys(merged));
            };

            // 时间轴点击跳转回调 (immediate=true 表示拖动中, 直接跟手)
            state.pianoRoll.onTimelineSeek = function(tick, immediate) {
                seekToTick(tick, immediate);
            };

            // 歌词轨道: 片段双击编辑 / 空白双击新建 / 拖动结束提交
            state.pianoRoll.onLyricClipEdit = function(id, clientX, clientY) {
                showLyricEditorPop(id, clientX, clientY);
            };
            state.pianoRoll.onLyricClipCreate = function(tick, lane, clientX, clientY) {
                var clip = createLyricClip(tick, lane);
                if (clip) showLyricEditorPop(clip.id, clientX, clientY);
            };
            state.pianoRoll.onLyricClipDragStart = function() { pushUndo(); };
            state.pianoRoll.onLyricClipCommit = function(id, origTick, origLane, mode) {
                commitLyricClipDrag(id, origTick, origLane, mode);
            };
            state.pianoRoll.onLyricClipSelect = function(id) {
                state.activeLyricId = id;
                updateLyricsEditBar();
            };

            // 同步初始状态
            state.pianoRoll.trackCount = (state.song && state.song.layers) ? state.song.layers.length : 1;
            state.pianoRoll.smoothScrollEnabled = state.smoothScroll;

            state.pianoRoll.setNotes([]);

            initToolSwitcher();
        } catch(e) {
            console.warn('PianoRoll init error:', e);
        }
    }

    // ============ 工具切换 ============
    function initToolSwitcher() {
        var toolBtns = document.querySelectorAll('.tool-btn');
        for (var i = 0; i < toolBtns.length; i++) {
            toolBtns[i].addEventListener('click', function() {
                var tool = this.getAttribute('data-tool');
                if (tool && state.pianoRoll) switchTool(tool);
            });
        }
    }

    // ---- 导出 ----
    N.initPianoRoll = initPianoRoll;
    N.initToolSwitcher = initToolSwitcher;
})(window.WebNBS);
