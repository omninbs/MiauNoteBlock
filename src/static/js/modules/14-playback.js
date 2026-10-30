/* 14-playback.js — MiauNoteBlock 功能模块
   来源: 原 main.js L7567-L8009; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    function $() { return N.$.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function saveOnPlay() { return N.saveOnPlay.apply(this, arguments); }
    function stopPerformanceRecording() { return N.stopPerformanceRecording.apply(this, arguments); }
    function startPerformanceRecordingSetup() { return N.startPerformanceRecordingSetup.apply(this, arguments); }
    function commitPerformanceNotes() { return N.commitPerformanceNotes.apply(this, arguments); }
    function stopPerformanceTickCounter() { return N.stopPerformanceTickCounter.apply(this, arguments); }
    function updatePlayButtonForRecording() { return N.updatePlayButtonForRecording.apply(this, arguments); }
    function stopContinuousMetronome() { return N.stopContinuousMetronome.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function getNotesAtTick() { return N.getNotesAtTick.apply(this, arguments); }
    function isTrackAudible() { return N.isTrackAudible.apply(this, arguments); }
    function isChannelAudible() { return N.isChannelAudible.apply(this, arguments); }
    function processLyricsAtTick() { return N.processLyricsAtTick.apply(this, arguments); }
    function resetStreamingLyrics() { return N.resetStreamingLyrics.apply(this, arguments); }
    function hideLyricsOverlay() { return N.hideLyricsOverlay.apply(this, arguments); }
    function formatTime() { return N.formatTime.apply(this, arguments); }


    // ============ 进度条 ============
    function getSongLengthTicks() {
        return Math.max(state.maxTick + 4, 64);
    }

    function updateAutoScrollBtnIcon() {
        // 工具栏上的旧按钮已移入设置弹窗，这里主要同步设置弹窗 UI
        var btn = $('btn-auto-scroll');
        if (btn) {
            var ic = btn.querySelector('i');
            if (state.smoothScroll) {
                if (ic) ic.className = 'fa-solid fa-arrows-to-dot icon';
                btn.title = '平滑翻页: 开启';
            } else {
                if (ic) ic.className = 'fa-solid fa-forward-step icon';
                btn.title = '平滑翻页: 关闭';
            }
        }
        // 同步设置弹窗开关
        var smoothChk = $('settings-smooth-scroll');
        if (smoothChk) smoothChk.checked = !!state.smoothScroll;
    }

    // 打开设置弹窗 (不含速度控制)
    function openSettingsDialog(focus) {
        var popup = $('settings-popup');
        if (popup) {
            popup.style.display = 'flex';
            popup.classList.add('active');
        }
        // 同步当前状态
        updateAutoScrollBtnIcon();
        // 同步平滑翻页开关
        var smoothChk = $('settings-smooth-scroll');
        if (smoothChk) smoothChk.checked = !!state.smoothScroll;
        var streamingChk = $('settings-streaming-lyrics');
        if (streamingChk) streamingChk.checked = !!state.streamingLyrics;
        var renderFpsSel = $('settings-render-fps');
        if (renderFpsSel) renderFpsSel.value = String(state.renderFpsLimit);
        // 同步音效开关
        var audioChk = $('settings-audio-enhance');
        if (audioChk && window.AudioEngine && typeof AudioEngine.isEnhanceEnabled === 'function') {
            try { audioChk.checked = AudioEngine.isEnhanceEnabled(); } catch(e) {}
        }
        // 同步音调文字八度数字开关
        var octChk = $('settings-show-octave');
        if (octChk) octChk.checked = N.shared.octaveLabelsEnabled;
    }

    function closeSettingsDialog() {
        var popup = $('settings-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    // 打开速度弹窗
    function openTempoDialog() {
        var popup = $('tempo-popup');
        if (popup) {
            popup.style.display = 'flex';
            popup.classList.add('active');
        }
        // 同步当前速度值
        var tempoVal = parseFloat(state.tempo) || 20;
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, tempoVal)));
        $setValue('settings-tempo-input', tempoVal);
        $setText('settings-tempo-value', tempoVal.toFixed(1));
    }

    function closeTempoDialog() {
        var popup = $('tempo-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    function updateProgressUI() {
        var totalTicks = getSongLengthTicks();
        // 同步 pianoRoll 的总 tick 数, 保证进度条/时间轴比例正确
        if (state.pianoRoll) {
            state.pianoRoll.totalTicks = totalTicks;
            // 歌曲变短后 scrollX 可能越界, 钳制回合法范围
            if (state.pianoRoll._clampScrollX) state.pianoRoll._clampScrollX();
        }
        var timeEl = $('progress-time');
        if (timeEl) {
            timeEl.textContent = Math.floor(state.currentTick) + ' / ' + Math.floor(totalTicks) + ' tick';
        }
    }

    function updatePlayheadPosition() {
        if (!state.pianoRoll) return;
        var pr = state.pianoRoll;
        if (pr.playheadTick === null) return;
        pr.playheadTick = state.currentTick;
    }

    function seekToTick(tick, immediate) {
        var totalTicks = getSongLengthTicks();
        if (tick < 0) tick = 0;
        if (tick > totalTicks) tick = totalTicks;
        state.currentTick = tick;
        // 记录用户主动 seek 的位置 (用于暂停后重新播放时跳回此位置)
        state._lastSeekTick = tick;
        updateProgressUI();
        if (state.pianoRoll) {
            state.pianoRoll.playheadTick = tick;
            state.pianoRoll.currentTick = tick;
            state.pianoRoll._smoothedProgressTick = tick;
            // 非播放状态下用补间动画平滑移动播放头; 播放中直接同步, 避免与播放循环冲突
            if (state.pianoRoll.isPlaying || immediate) {
                state.pianoRoll._smoothedPlayheadTick = tick;
            }
            state.pianoRoll._lastTickTime = 0;
            state.pianoRoll.render();
            if (!state.pianoRoll.isPlaying) {
                if (immediate) state.pianoRoll.redrawPlaybackOverlay();
                else state.pianoRoll.animatePlayheadTo(tick);
            }
        }
    }

    // ============ 播放控制 ============
    function setPlayButtonIcon(playing) {
        var pb = $('btn-play');
        if (pb) {
            var ic = pb.querySelector('i');
            if (ic) ic.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            if (playing) pb.classList.add('playing');
            else pb.classList.remove('playing');
        }
    }

    function handlePlayToggle() {
        if (state.isPlaying) {
            // 暂停: 保持 currentTick 和 playhead 位置, 不重置
            state.isPlaying = false;
            stopPlaybackLoop();
            if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
            setPlayButtonIcon(false);
            // 把钢琴卷帘播放头锁定在当前 tick
            if (state.pianoRoll) {
                state.pianoRoll.isPlaying = false;
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll._smoothedPlayheadTick = state.currentTick;
            }
            updateProgressUI();
        } else {
            // 开始播放: 播放时自动保存
            saveOnPlay();
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            // 暂停后重新播放: 跳转到上次 seek 的位置 (用户点击时间栏的位置)
            if (typeof state._lastSeekTick === 'number' && state._lastSeekTick >= 0) {
                state.currentTick = state._lastSeekTick;
            }
            // B 方案: 开始播放时立即把面板跳到 progress bar 当前 tick
            if (state.pianoRoll) {
                state.pianoRoll.isPlaying = true;
                var cfg = state.pianoRoll._cfg;
                var pw = state.pianoRoll._currentPanelWidth;
                var dw = state.pianoRoll.displayWidth;
                // 使用统一的 _zoomX(): 片段模式走独立横向缩放, 避免 scrollX 计算错误跳到极端位置
                var cellW = cfg.cellW * state.pianoRoll._zoomX();
                if (state.pianoRoll.smoothScrollEnabled) {
                    // 平滑翻页: tick 对齐播放头固定位置 (允许负 scrollX)
                    var playheadX = pw + (dw - pw) / 3;
                    state.pianoRoll.scrollX = state.currentTick * cellW + pw - playheadX;
                } else {
                    // 普通模式: 把 currentTick 对应位置滚到屏幕中间
                    var centerX = pw + (dw - pw) / 2;
                    state.pianoRoll.scrollX = state.currentTick * cellW + pw - centerX;
                    if (state.pianoRoll.scrollX < 0) state.pianoRoll.scrollX = 0;
                }
                // 钳制滚动上限, 防止视图跑到歌曲范围之外 (修复播放后内容不显示)
                var maxSX = state.pianoRoll._getMaxScrollX();
                if (isFinite(maxSX) && state.pianoRoll.scrollX > maxSX) {
                    state.pianoRoll.scrollX = Math.max(0, maxSX);
                }
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll._smoothedPlayheadTick = state.currentTick;
                state.pianoRoll._lastTickTime = performance.now();
            }
            state.isPlaying = true;
            setPlayButtonIcon(true);
            startPlaybackLoop();
            updateProgressUI();
        }
    }

    function togglePerformanceRecording() {
        if (!state.performanceMode) return;
        if (state.performanceRecording) {
            stopPerformanceRecording();
        } else {
            startPerformanceRecordingSetup();
        }
    }

    function handleStop() {
        state.isPlaying = false;
        stopPlaybackLoop();
        if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
        setPlayButtonIcon(false);
        state.currentTick = 0;
        // 清除上次 seek 位置 (停止后从头开始, 暂停重播才跳回 seek 位置)
        state._lastSeekTick = null;
        updateProgressUI();
        if (state.performanceRecording) {
            commitPerformanceNotes();
            state.performanceRecording = false;
            state.performanceActiveKeys = {};
            stopPerformanceTickCounter();
            var cdEl = $('performance-countdown');
            if (cdEl) cdEl.style.display = 'none';
            updatePlayButtonForRecording();
        }
        stopContinuousMetronome();
        // 隐藏钢琴卷帘播放头 (null = 隐藏)
        if (state.pianoRoll) {
            state.pianoRoll.playheadTick = null;
            state.pianoRoll.currentTick = 0;
            state.pianoRoll.isPlaying = false;
            state.pianoRoll.scrollToTick(0);
            state.pianoRoll.render();
        }
    }

    function startPlaybackLoop() {
        stopPlaybackLoop();
        if (!state.noteIndex || state.noteIndex.size === 0) {
            buildNoteIndex(state.notes);
        }
        if (state.pianoRoll) state.pianoRoll._smoothedPlayheadTick = state.currentTick;

        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        var totalTicks = getSongLengthTicks();
        if (state.pianoRoll) {
            state.pianoRoll._tickDuration = tickMs;
            state.pianoRoll._lastTickTime = performance.now();
        }

        var _accumulator = 0;
        var _lastFrameTime = performance.now();
        var _nextVisualFrame = 0;
        var _lastProgressUI = -Infinity;

        function playbackFrame(now) {
            if (!state.isPlaying) return;

            // 每帧重建轨道映射: 播放中切换静音/独奏需立即生效
            // (rebuildTracks 会替换 state.tracks 中的对象, 缓存引用会导致状态滞后, 独奏时全部静音)
            var trackByLayer = {};
            for (var trackIndex = 0; trackIndex < state.tracks.length; trackIndex++) {
                trackByLayer[state.tracks[trackIndex].layer] = state.tracks[trackIndex];
            }

            var elapsed = now - _lastFrameTime;
            _lastFrameTime = now;
            if (elapsed > 200) elapsed = tickMs;
            _accumulator += elapsed;

            while (_accumulator >= tickMs) {
                _accumulator -= tickMs;

                var tick = state.currentTick;

                var notesAtTick = getNotesAtTick(tick);
                for (var i = 0; i < notesAtTick.length; i++) {
                    var n = notesAtTick[i];
                    var audible = true;
                    var track = trackByLayer[n.layer];
                    if (track) {
                        audible = isTrackAudible(track);
                    }
                    if (audible && state.layerChannelMap) {
                        var midiCh = state.layerChannelMap[n.layer];
                        if (midiCh !== undefined && !isChannelAudible(midiCh)) {
                            audible = false;
                        }
                    }
                    if (audible && window.AudioEngine && AudioEngine.playNote) {
                        var trackVolume = track && track.volume !== undefined ? Number(track.volume) : 100;
                        trackVolume = isFinite(trackVolume) ? Math.max(0, Math.min(100, trackVolume)) : 100;
                        var noteVelocity = n.velocity === undefined ? 100 : n.velocity;
                        AudioEngine.playNote(n.instrument, n.key, noteVelocity * trackVolume / 100, n.pan || 50, n.pitch, n.layer);
                    }
                }

                if (state.pianoRoll && state.highlightAnimationEnabled) {
                    state.pianoRoll.highlightPlayingNotes(notesAtTick);
                }
                if (state.pianoRoll && state.trackHighlightEnabled) {
                    state.pianoRoll.highlightTriggeredTracks(notesAtTick);
                }

                if (state.pianoRoll) {
                    state.pianoRoll.playheadTick = tick;
                }

                // 歌词浮层: 触发该 tick 的歌词 / 处理到期隐藏
                processLyricsAtTick(tick);

                state.currentTick = tick + 1;
                if (state.currentTick > state.maxTick + 4) {
                    state.currentTick = 0;
                    resetStreamingLyrics();
                    hideLyricsOverlay();
                }

                if (tick - _lastProgressUI >= 2 || state.currentTick === 0) {
                    var timeEl = $('progress-time');
                    if (timeEl) {
                        timeEl.textContent = Math.floor(tick) + ' / ' + Math.floor(totalTicks) + ' tick';
                    }
                    $setText('current-pos', '位置: ' + state.currentTick);
                    _lastProgressUI = tick;
                }
            }

            // 更新 _lastTickTime 用于播放头平滑插值
            if (state.pianoRoll) {
                state.pianoRoll._lastTickTime = now - _accumulator;
            }

            var visualFrameMs = state.renderFpsLimit > 0 ? 1000 / state.renderFpsLimit : 0;
            var shouldRenderVisual = visualFrameMs === 0 || now >= _nextVisualFrame;
            if (state.pianoRoll && shouldRenderVisual) {
                if (state.pianoRoll.smoothScrollEnabled) {
                    var visibleWidth = state.pianoRoll.displayWidth - state.pianoRoll._currentPanelWidth;
                    var playheadX = state.pianoRoll._currentPanelWidth + visibleWidth / 3;
                    // 使用 _zoomX(): 片段模式走独立横向缩放, 避免 scrollX 跳到极端位置
                    var cellW = state.pianoRoll._cfg.cellW * state.pianoRoll._zoomX();
                    var targetScrollX = state.pianoRoll._getDisplayTick() * cellW + state.pianoRoll._currentPanelWidth - playheadX;
                    state.pianoRoll.scrollX = Math.max(0, Math.min(targetScrollX, state.pianoRoll._getMaxScrollX()));
                    state.pianoRoll._fullRedrawNeeded = true;
                }
                if (state.pianoRoll.redrawPlaybackOverlay) {
                    state.pianoRoll.redrawPlaybackOverlay();
                }
                state.pianoRoll.render();
                if (visualFrameMs > 0) {
                    if (_nextVisualFrame === 0) {
                        _nextVisualFrame = now + visualFrameMs;
                    } else {
                        _nextVisualFrame += visualFrameMs;
                        if (_nextVisualFrame < now) _nextVisualFrame = now + visualFrameMs;
                    }
                }
                state._fpsFrames++;
            }

            state._playbackRAF = requestAnimationFrame(playbackFrame);
        }
        state._playbackRAF = requestAnimationFrame(playbackFrame);
    }

    function stopPlaybackLoop() {
        if (state._playbackRAF) {
            cancelAnimationFrame(state._playbackRAF);
            state._playbackRAF = null;
        }
        // 停止/暂停时清除歌词浮层与流式累积 (避免再次播放时残留上一段文字)
        resetStreamingLyrics();
        hideLyricsOverlay();
        if (state.pianoRoll) {
            state.pianoRoll.clearPlayHighlights();
            if (state.pianoRoll.redrawPlaybackOverlay) {
                state.pianoRoll.redrawPlaybackOverlay();
            }
        }
    }

    function restartPlayback() {
        if (state.isPlaying) startPlaybackLoop();
    }

    // ============ 轨道管理 ============
    function findTrackByLayer(layer) {
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i].layer === layer) return state.tracks[i];
        }
        return null;
    }

    // NBS lock 只表达静音，独奏由歌曲扩展字段单独保存
    function lockToMutedSolo(lock) {
        lock = parseInt(lock) || 0;
        return { muted: lock === 1, solo: false };
    }

    function mutedSoloToLock(muted, solo) {
        return muted ? 1 : 0;
    }

    function getSoloLayerMap() {
        var map = {};
        var layers = state.song && Array.isArray(state.song.solo_layers) ? state.song.solo_layers : [];
        for (var i = 0; i < layers.length; i++) map[parseInt(layers[i], 10)] = true;
        return map;
    }

    function syncSoloLayersToSong() {
        if (!state.song) state.song = {};
        state.song.solo_layers = [];
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i].solo) state.song.solo_layers.push(state.tracks[i].layer);
        }
        state.soloActive = state.song.solo_layers.length > 0;
    }

    function stopUnaudibleTrackAudio() {
        if (!window.AudioEngine || !AudioEngine.stopLayer) return;
        for (var i = 0; i < state.tracks.length; i++) {
            if (!isTrackAudible(state.tracks[i])) AudioEngine.stopLayer(state.tracks[i].layer);
        }
    }

    // 从 state.song.layers 读取指定 layer 的 lock 值
    function getLayerLock(layer) {
        if (!state.song || !state.song.layers || !state.song.layers[layer]) return 0;
        return parseInt(state.song.layers[layer].lock) || 0;
    }

    // 更新 state.song.layers 中指定 layer 的 lock 值
    function setLayerLock(layer, lock) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        if (!state.song.layers[layer]) {
            state.song.layers[layer] = { name: 'Layer ' + (layer + 1), volume: 100, stereo: 100, lock: 0 };
        }
        state.song.layers[layer].lock = parseInt(lock) || 0;
    }

    // ---- 导出 ----
    N.getSongLengthTicks = getSongLengthTicks;
    N.formatTime = formatTime;
    N.updateAutoScrollBtnIcon = updateAutoScrollBtnIcon;
    N.openSettingsDialog = openSettingsDialog;
    N.closeSettingsDialog = closeSettingsDialog;
    N.openTempoDialog = openTempoDialog;
    N.closeTempoDialog = closeTempoDialog;
    N.updateProgressUI = updateProgressUI;
    N.updatePlayheadPosition = updatePlayheadPosition;
    N.seekToTick = seekToTick;
    N.setPlayButtonIcon = setPlayButtonIcon;
    N.handlePlayToggle = handlePlayToggle;
    N.togglePerformanceRecording = togglePerformanceRecording;
    N.handleStop = handleStop;
    N.startPlaybackLoop = startPlaybackLoop;
    N.stopPlaybackLoop = stopPlaybackLoop;
    N.restartPlayback = restartPlayback;
    N.findTrackByLayer = findTrackByLayer;
    N.lockToMutedSolo = lockToMutedSolo;
    N.mutedSoloToLock = mutedSoloToLock;
    N.getSoloLayerMap = getSoloLayerMap;
    N.syncSoloLayersToSong = syncSoloLayersToSong;
    N.stopUnaudibleTrackAudio = stopUnaudibleTrackAudio;
    N.getLayerLock = getLayerLock;
    N.setLayerLock = setLayerLock;
})(window.WebNBS);
