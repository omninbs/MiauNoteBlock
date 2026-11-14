/* 09-piano-roll.js — MiauNoteBlock 功能模块
   来源: 原 main.js L4666-L4931; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function addLyricLane() { return N.addLyricLane.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function closeTransientFloats() { return N.closeTransientFloats.apply(this, arguments); }
    function commitLyricClipDrag() { return N.commitLyricClipDrag.apply(this, arguments); }
    function createLyricClip() { return N.createLyricClip.apply(this, arguments); }
    function deleteTrack() { return N.deleteTrack.apply(this, arguments); }
    function ensureLyricLanes() { return N.ensureLyricLanes.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function moveLyricLaneTo() { return N.moveLyricLaneTo.apply(this, arguments); }
    function moveTrackDown() { return N.moveTrackDown.apply(this, arguments); }
    function moveTrackUp() { return N.moveTrackUp.apply(this, arguments); }
    function mutedSoloToLock() { return N.mutedSoloToLock.apply(this, arguments); }
    function openAudioFilePicker() { return N.openAudioFilePicker.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function removeLyricLane() { return N.removeLyricLane.apply(this, arguments); }
    function renameLyricLane() { return N.renameLyricLane.apply(this, arguments); }
    function renderSegmentSidePanel() { return N.renderSegmentSidePanel.apply(this, arguments); }
    function reorderTrack() { return N.reorderTrack.apply(this, arguments); }
    function registerAudioPianoRollCallbacks() { return N.registerAudioPianoRollCallbacks.apply(this, arguments); }
    function seekToTick() { return N.seekToTick.apply(this, arguments); }
    function segmentAdoptTick() { return N.segmentAdoptTick.apply(this, arguments); }
    function segmentCommitDrag() { return N.segmentCommitDrag.apply(this, arguments); }
    function segmentFollowSongEnd() { return N.segmentFollowSongEnd.apply(this, arguments); }
    function setLayerLock() { return N.setLayerLock.apply(this, arguments); }
    function setTrackVolume() { return N.setTrackVolume.apply(this, arguments); }
    function showContextMenu() { return N.showContextMenu.apply(this, arguments); }
    function showLyricClipMenu() { return N.showLyricClipMenu.apply(this, arguments); }
    function showLyricLaneMenu() { return N.showLyricLaneMenu.apply(this, arguments); }
    function showLyricEditorPop() { return N.showLyricEditorPop.apply(this, arguments); }
    function stopUnaudibleTrackAudio() { return N.stopUnaudibleTrackAudio.apply(this, arguments); }
    function switchTool() { return N.switchTool.apply(this, arguments); }
    function syncSoloLayersToSong() { return N.syncSoloLayersToSong.apply(this, arguments); }
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

            // 时间栏右键菜单 (播放跟随 / 区间)
            state.pianoRoll.onTimelineContextMenu = function(x, y, tick) {
                if (N.showTimelineContextMenu) N.showTimelineContextMenu(x, y, tick);
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
            };
            // 歌词块右键菜单 (剪切 / 复制 / 删除 / 编辑)
            state.pianoRoll.onLyricClipContextMenu = function(id, clientX, clientY) {
                showLyricClipMenu(id, clientX, clientY);
            };
            // 歌词轨道空白区右键菜单 (粘贴 / 全选)
            state.pianoRoll.onLyricLaneContextMenu = function(lane, tick, clientX, clientY) {
                showLyricLaneMenu(lane, tick, clientX, clientY);
            };
            // 歌词轨道 (额外轨道) 的增删改与排序
            state.pianoRoll.onAddLyricLane = function() {
                addLyricLane();
            };
            state.pianoRoll.onDeleteLyricLane = function(laneIndex) {
                removeLyricLane(laneIndex);
            };
            state.pianoRoll.onRenameLyricLane = function(laneIndex, newName) {
                renameLyricLane(laneIndex, newName);
            };
            // after: 目标插入位置 (第几条 NBS 音轨下方, -1 = 最上方)
            state.pianoRoll.onReorderLyricLane = function(fromLane, after) {
                moveLyricLaneTo(fromLane, after);
            };

            // 音频轨道回调 (实现在 22-audio.js)
            registerAudioPianoRollCallbacks();
            // 「添加」按钮: 弹出轨道类型菜单 (NBS 音轨 / 歌词轨道 / 音频轨道)
            state.pianoRoll.onAddTrackMenu = function(clientX, clientY) {
                showAddTrackMenu(clientX, clientY);
            };

            // 同步初始状态
            state.pianoRoll.trackCount = (state.song && state.song.layers) ? state.song.layers.length : 1;
            // smoothScrollEnabled 只是派生值: 开启跟随且非按页时才固定播放头居中
            state.pianoRoll.smoothScrollEnabled = state.followProgress !== false && state.followMode !== 'page';
            state.pianoRoll.setLyricLanes(ensureLyricLanes());

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

    // ============ 「添加」轨道类型菜单 ============
    // 钢琴卷帘侧栏「添加」按钮触发: 选择要添加的轨道类型
    var _addTrackMenuEl = null;
    var _addTrackMenuBgDown = false;
    var _addTrackMenuDocClick = null;
    var _addTrackMenuDocPointerDown = null;
    var _addTrackMenuDocKey = null;
    var _addTrackMenuWin = null;
    function hideAddTrackMenu() {
        if (_addTrackMenuEl && _addTrackMenuEl.parentNode) _addTrackMenuEl.parentNode.removeChild(_addTrackMenuEl);
        _addTrackMenuEl = null;
        if (_addTrackMenuDocClick) {
            document.removeEventListener('click', _addTrackMenuDocClick);
            _addTrackMenuDocClick = null;
        }
        if (_addTrackMenuDocPointerDown) {
            document.removeEventListener('pointerdown', _addTrackMenuDocPointerDown, true);
            _addTrackMenuDocPointerDown = null;
        }
        if (_addTrackMenuDocKey) {
            document.removeEventListener('keydown', _addTrackMenuDocKey);
            _addTrackMenuDocKey = null;
        }
        if (_addTrackMenuWin) {
            window.removeEventListener('resize', _addTrackMenuWin);
            window.removeEventListener('scroll', _addTrackMenuWin, true);
            _addTrackMenuWin = null;
        }
    }

    // 片段模式: 音频导入是异步的, 轮询轨道数变化 (最长 10s), 导入完成后补生成 special 片段轨道
    function waitAudioLaneForSegment() {
        var lanes0 = (state.audioLanes || []).length;
        var started = Date.now();
        var timer = setInterval(function() {
            if (!state.segmentsEditMode) { clearInterval(timer); return; }
            var changed = (state.audioLanes || []).length !== lanes0;
            if (!changed && Date.now() - started < 10000) return;
            clearInterval(timer);
            if (!changed) return;
            if (N.segmentEnsureLanes) N.segmentEnsureLanes();
            if (N.segmentSync) N.segmentSync();
            if (N.renderSegmentSidePanel) N.renderSegmentSidePanel();
            if (state.pianoRoll) state.pianoRoll.render();
        }, 200);
    }

    function showAddTrackMenu(clientX, clientY, mode) {
        hideAddTrackMenu();
        closeTransientFloats();
        if (!state.pianoRoll) return;
        var inSegment = mode === 'segment';

        // 复用应用统一的 .context-menu 外观 (照 21-lyrics 的 _ctxMenu/_ctxItem 写法)
        var menu = document.createElement('div');
        menu.className = 'context-menu visible';
        menu.style.position = 'fixed';
        menu.style.zIndex = '100420';
        // NBS 音轨复用既有 onAddTrack 逻辑 (原注册保留不动, 此处仅调用)
        var acts = [
            { icon: 'fa-solid fa-layer-group', label: i18nText('NBS 音轨'), run: function() {
                if (inSegment) {
                    // 片段模式: 添加普通片段轨道
                    if (N.segmentAddLane) N.segmentAddLane();
                    if (N.renderSegmentSidePanel) N.renderSegmentSidePanel();
                    if (state.pianoRoll) state.pianoRoll.render();
                    return;
                }
                if (state.pianoRoll && state.pianoRoll.onAddTrack) state.pianoRoll.onAddTrack();
            } },
            { icon: 'fa-solid fa-closed-captioning', label: i18nText('歌词轨道'), run: function() {
                if (!inSegment) {
                    addLyricLane();
                    return;
                }
                addLyricLane(null);
                if (N.segmentEnsureLanes) N.segmentEnsureLanes();
                if (N.segmentSync) N.segmentSync();
                if (N.syncLyricsToRoll) N.syncLyricsToRoll();
                if (N.renderSegmentSidePanel) N.renderSegmentSidePanel();
                if (state.pianoRoll) state.pianoRoll.render();
                markDirty();
            } },
            { icon: 'fa-solid fa-file-audio', label: i18nText('音频轨道'), run: function() {
                openAudioFilePicker();
                if (inSegment) waitAudioLaneForSegment();
            } }
        ];
        for (var k = 0; k < acts.length; k++) {
            (function(a) {
                var el = document.createElement('div');
                el.className = 'context-menu-item';
                el.innerHTML = '<i class="' + a.icon + '"></i><span>' + a.label + '</span>';
                el.addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    hideAddTrackMenu();
                    a.run();
                });
                menu.appendChild(el);
            })(acts[k]);
        }

        document.body.appendChild(menu);
        // 贴鼠标右下显示, 越界翻转
        var r = menu.getBoundingClientRect();
        var left = clientX + 6, top = clientY + 6;
        if (left + r.width > window.innerWidth - 6) left = Math.max(6, clientX - r.width - 6);
        if (top + r.height > window.innerHeight - 6) top = Math.max(6, clientY - r.height - 6);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        _addTrackMenuEl = menu;
        // 打开菜单的动作本身 (mousedown / click on「添加」) 会产生同一次手势的后续事件,
        // 用打开时刻拦截: 这些事件的 timeStamp 不晚于 openedTs, 不能当成"点击外部"。
        var openedTs = performance.now();
        _addTrackMenuBgDown = false;
        _addTrackMenuDocPointerDown = function(ev) {
            if (!_addTrackMenuEl) return;
            if (ev.timeStamp && ev.timeStamp <= openedTs + 1) return;
            if (_addTrackMenuEl.contains(ev.target)) return;
            _addTrackMenuBgDown = true;
            hideAddTrackMenu();
        };
        _addTrackMenuDocClick = function(ev) {
            if (!_addTrackMenuEl) return;
            if (ev.timeStamp && ev.timeStamp <= openedTs + 1) return;
            if (_addTrackMenuEl.contains(ev.target)) return;
            // 鼠标点击已由 pointerdown 关闭; 这里兜底键盘触发的 click (detail === 0)
            if (ev.detail > 0 && !_addTrackMenuBgDown) return;
            hideAddTrackMenu();
        };
        _addTrackMenuDocKey = function(ev) {
            if (ev.key === 'Escape' || ev.key === 'Esc') hideAddTrackMenu();
        };
        _addTrackMenuWin = function() { hideAddTrackMenu(); };
        document.addEventListener('pointerdown', _addTrackMenuDocPointerDown, true);
        document.addEventListener('click', _addTrackMenuDocClick);
        document.addEventListener('keydown', _addTrackMenuDocKey);
        window.addEventListener('resize', _addTrackMenuWin);
        window.addEventListener('scroll', _addTrackMenuWin, true);
    }

    // ---- 导出 ----
    N.initPianoRoll = initPianoRoll;
    N.initToolSwitcher = initToolSwitcher;
    N.showAddTrackMenu = showAddTrackMenu;
    N.hideAddTrackMenu = hideAddTrackMenu;
})(window.WebNBS);
