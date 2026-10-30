/* 12-keyboard.js — MiauNoteBlock 功能模块
   来源: 原 main.js L6043-L7212; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    var _appDialogStack = N._appDialogStack;
    function addNoteToIndex() { return N.addNoteToIndex.apply(this, arguments); }
    function assistPanelVisible() { return N.assistPanelVisible.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function closeAssistPanel() { return N.closeAssistPanel.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function copyLyricClip() { return N.copyLyricClip.apply(this, arguments); }
    function deleteLyricClip() { return N.deleteLyricClip.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function getPianoKeyFromKeyboardEvent() { return N.getPianoKeyFromKeyboardEvent.apply(this, arguments); }
    function getSelectedLyricClip() { return N.getSelectedLyricClip.apply(this, arguments); }
    function handleArrowKey() { return N.handleArrowKey.apply(this, arguments); }
    function handleDuplicate() { return N.handleDuplicate.apply(this, arguments); }
    function handlePaste() { return N.handlePaste.apply(this, arguments); }
    function handlePlayToggle() { return N.handlePlayToggle.apply(this, arguments); }
    function handleSave() { return N.handleSave.apply(this, arguments); }
    function handleStop() { return N.handleStop.apply(this, arguments); }
    function hideContextMenu() { return N.hideContextMenu.apply(this, arguments); }
    function isAllowedPianoEditShortcut() { return N.isAllowedPianoEditShortcut.apply(this, arguments); }
    function isEditableTarget() { return N.isEditableTarget.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function openFindPanel() { return N.openFindPanel.apply(this, arguments); }
    function openPianoKeyboard() { return N.openPianoKeyboard.apply(this, arguments); }
    function pasteLyricClips() { return N.pasteLyricClips.apply(this, arguments); }
    function performRedo() { return N.performRedo.apply(this, arguments); }
    function performUndo() { return N.performUndo.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function removeNoteFromIndex() { return N.removeNoteFromIndex.apply(this, arguments); }
    function schedulePerformanceUIUpdate() { return N.schedulePerformanceUIUpdate.apply(this, arguments); }
    function segZoomAxis() { return N.segZoomAxis.apply(this, arguments); }
    function segmentCopy() { return N.segmentCopy.apply(this, arguments); }
    function segmentDelete() { return N.segmentDelete.apply(this, arguments); }
    function segmentPaste() { return N.segmentPaste.apply(this, arguments); }
    function segmentSplit() { return N.segmentSplit.apply(this, arguments); }
    function segmentTrimLeft() { return N.segmentTrimLeft.apply(this, arguments); }
    function segmentTrimRight() { return N.segmentTrimRight.apply(this, arguments); }
    function tabSaveAll() { return N.tabSaveAll.apply(this, arguments); }
    function toggleMuteSelectedTrack() { return N.toggleMuteSelectedTrack.apply(this, arguments); }
    function togglePerformanceRecording() { return N.togglePerformanceRecording.apply(this, arguments); }
    function toggleSoloSelectedTrack() { return N.toggleSoloSelectedTrack.apply(this, arguments); }
    function updateAssistPanelForTool() { return N.updateAssistPanelForTool.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updatePianoKeyboardHighlight() { return N.updatePianoKeyboardHighlight.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }


    function switchTool(tool) {
        if (!state.pianoRoll) return;
        state.pianoRoll.setTool(tool);
        var allBtns = document.querySelectorAll('.tool-btn');
        for (var j = 0; j < allBtns.length; j++) {
            allBtns[j].classList.remove('active');
            if (allBtns[j].getAttribute('data-tool') === tool) {
                allBtns[j].classList.add('active');
            }
        }
        // 创作辅助悬浮窗内容跟随当前工具
        if (assistPanelVisible()) updateAssistPanelForTool();
        if (tool === 'performance') {
            state.performanceMode = true;
            // 强制开启键盘钢琴
            state.keyboardPianoEnabled = true;
            var kpBtn = $('btn-keyboard-piano');
            if (kpBtn) kpBtn.classList.add('active');
            if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                state.pianoRoll.setShowKeyLabels(true);
            }
            openPianoKeyboard();
            // 节拍器按钮已删除 (功能废弃)
            updatePlayButtonForRecording();
        } else {
            state.performanceMode = false;
            stopPerformanceRecording();
            // 恢复键盘钢琴状态 (关闭, 因为是强制开启的)
            state.keyboardPianoEnabled = false;
            var kpBtn2 = $('btn-keyboard-piano');
            if (kpBtn2) kpBtn2.classList.remove('active');
            if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                state.pianoRoll.setShowKeyLabels(false);
            }
            // 节拍器按钮已删除
            updatePlayButtonForRecording();
            // 清除音轨选择
            if (state.pianoRoll) {
                state.pianoRoll.performanceSelectedLayers = [];
                state.pianoRoll._highlightLayer = -1;
                state.pianoRoll.render();
            }
        }
    }

    // ============ 键盘钢琴处理 ============
    function handlePianoKeyDown(nbsKey, code) {
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(nbsKey, true);
        }
        if (window.AudioEngine && AudioEngine.playNote) {
            AudioEngine.playNote(state.currentInstrument, nbsKey, 100, 50);
        }
        // 同时选中该键作为当前音高, 点击画布时会在此音高放置音符
        if (state.pianoRoll) {
            state.pianoRoll.selectedKey = nbsKey;
            state.pianoRoll._highlightKey = nbsKey;
            state.pianoRoll._fullRedrawNeeded = true;
            if (state.pianoRoll.setSelectedKey) state.pianoRoll.setSelectedKey(nbsKey);
            if (state.pianoRoll.render) state.pianoRoll.render();
        }
        state.selectedPianoKey = nbsKey;
        updatePianoKeyboardHighlight();
        if (state.performanceRecording) {
            recordPerformanceKeyDown(nbsKey);
        }
    }

    function handlePianoKeyUp(nbsKey, code) {
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(nbsKey, false);
        }
        updatePianoKeyboardHighlight();
        if (state.performanceRecording) {
            recordPerformanceKeyUp(nbsKey);
        }
    }

    // ============ 演奏模式录制 ============
    function showPerformanceSetupDialog(callback) {
        var popup = $('performance-setup-popup');
        if (!popup) return;

        var tempoInput = $('perf-tempo');
        if (tempoInput) tempoInput.value = state.tempo;

        // 显示当前选择的音轨
        var trackInfoEl = $('perf-track-name');
        if (trackInfoEl) {
            var layers = state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : [];
            state.performanceTrackLayers = layers;
            if (layers.length === 0) {
                trackInfoEl.textContent = '请在画布中点击选择要录制的音轨';
                trackInfoEl.style.color = '#ff6b6b';
            } else {
                var names = [];
                for (var i = 0; i < layers.length; i++) {
                    var track = findTrackByLayer(layers[i]);
                    names.push(track ? track.name : ('Layer ' + (layers[i] + 1)));
                }
                trackInfoEl.textContent = '录制到: ' + names.join(', ');
                trackInfoEl.style.color = 'var(--text-secondary)';
            }
        }

        // 更新吸附提示
        var snapInfoEl = $('perf-snap-info');
        function updateSnapInfo() {
            var snapEnabled = $('perf-snap-enabled').checked;
            var snapBeat = parseInt($('perf-snap-beat').value) || 4;
            if (snapInfoEl) {
                if (snapEnabled) {
                    var beatName = {2:'1/2音符', 4:'1/4音符', 8:'1/8音符', 16:'1/16音符', 32:'1/32音符'}[snapBeat] || '1/4音符';
                    var ticksPerBeat = 4;
                    var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
                    snapInfoEl.textContent = '吸附到: ' + beatName + ' (每' + gridStep + 'tick)';
                    snapInfoEl.style.display = 'block';
                } else {
                    snapInfoEl.textContent = '未开启吸附，默认到各子';
                    snapInfoEl.style.display = 'block';
                }
            }
        }

        var snapCheckbox = $('perf-snap-enabled');
        var snapSelect = $('perf-snap-beat');
        if (snapCheckbox) snapCheckbox.addEventListener('change', updateSnapInfo);
        if (snapSelect) snapSelect.addEventListener('change', updateSnapInfo);
        updateSnapInfo();

        var midiCheckbox = $('perf-midi-device');
        function onMidiCheckboxChange() {
            if (this.checked && !_midiAccess) {
                initMidiDeviceAccess();
            } else if (!this.checked) {
                stopMidiDeviceListening();
            }
            var midiStatusEl = $('perf-midi-device-status');
            if (midiStatusEl && !this.checked) {
                midiStatusEl.style.opacity = '0.5';
            } else if (midiStatusEl) {
                midiStatusEl.style.opacity = '1';
            }
        }
        if (midiCheckbox) midiCheckbox.addEventListener('change', onMidiCheckboxChange);

        popup.style.display = 'flex';
        popup.classList.add('active');

        var startBtn = $('perf-start-btn');
        var cancelBtn = $('perf-cancel-btn');
        var closeBtn = $('performance-setup-close-btn');

        function cleanup() {
            popup.style.display = '';
            popup.classList.remove('active');
            if (startBtn) startBtn.removeEventListener('click', onStart);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            if (snapCheckbox) snapCheckbox.removeEventListener('change', updateSnapInfo);
            if (snapSelect) snapSelect.removeEventListener('change', updateSnapInfo);
            if (midiCheckbox) midiCheckbox.removeEventListener('change', onMidiCheckboxChange);
        }

        function onCancel() {
            cleanup();
        }

        function onStart() {
            var layers = state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : [];
            if (layers.length === 0) {
                // 未选择音轨, 显示错误并阻止播放
                var trackInfoEl = $('perf-track-name');
                if (trackInfoEl) {
                    trackInfoEl.textContent = '请先在画布中点击选择要录制的音轨！';
                    trackInfoEl.style.color = '#ff6b6b';
                    trackInfoEl.style.fontWeight = 'bold';
                    // 闪烁效果
                    trackInfoEl.style.animation = 'none';
                    setTimeout(function() { trackInfoEl.style.animation = ''; }, 10);
                }
                return; // 不调用 callback, 不关闭弹窗
            }
            state.performanceTrackLayers = layers;

            var tempo = parseFloat($('perf-tempo').value) || state.tempo;
            var beat = parseInt($('perf-beat').value) || 4;
            var metronomeEnabled = $('perf-metronome-enabled') ? $('perf-metronome-enabled').checked : true;
            var snapEnabled = $('perf-snap-enabled').checked;
            var snapBeat = parseInt($('perf-snap-beat').value) || 4;
            var midiDeviceEnabled = $('perf-midi-device').checked;
            var sustainRecordEnabled = $('perf-sustain-record') && $('perf-sustain-record').checked;

            var settings = {
                tempo: tempo,
                beat: beat,
                metronomeEnabled: metronomeEnabled,
                snapEnabled: snapEnabled,
                snapBeat: snapBeat,
                midiDeviceEnabled: midiDeviceEnabled,
                sustainRecordEnabled: sustainRecordEnabled
            };

            cleanup();
            if (callback) callback(settings);
        }

        if (startBtn) startBtn.addEventListener('click', onStart);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
    }

    var _midiAccess = null;
    var _midiInputHandler = null;
    var _midiPerformanceActiveNotes = {};
    var _midiPerformanceHeldNotes = {};
    var _midiPerformanceSustain = {};

    function midiNoteToNbsKey(note) {
        if (note === undefined || note === null || isNaN(note)) return null;
        return Math.max(0, Math.min(87, Math.round(note) - 21));
    }

    function midiVelocityToNbsVelocity(velocity) {
        velocity = Math.max(1, Math.min(127, velocity || 1));
        return Math.max(1, Math.min(100, Math.round(velocity / 127 * 100)));
    }

    function getMidiMessageKey(input, channel, note) {
        var inputId = (input && (input.id || input.name || input.manufacturer)) || 'midi';
        return inputId + ':' + channel + ':' + note;
    }

    function releaseMidiPerformanceNote(messageKey) {
        var entry = _midiPerformanceActiveNotes[messageKey];
        if (!entry) return;
        recordPerformanceKeyUp(entry.nbsKey);
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(entry.nbsKey, false);
        }
        delete _midiPerformanceActiveNotes[messageKey];
        delete _midiPerformanceHeldNotes[messageKey];
        updatePianoKeyboardHighlight();
    }

    function releaseSustainedMidiNotes(input, channel) {
        var inputId = (input && (input.id || input.name || input.manufacturer)) || 'midi';
        var prefix = inputId + ':' + channel + ':';
        var keys = Object.keys(_midiPerformanceHeldNotes);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(prefix) === 0) {
                releaseMidiPerformanceNote(keys[i]);
            }
        }
    }

    function stopAllMidiPerformanceNotes() {
        var keys = Object.keys(_midiPerformanceActiveNotes);
        for (var i = 0; i < keys.length; i++) {
            releaseMidiPerformanceNote(keys[i]);
        }
        _midiPerformanceActiveNotes = {};
        _midiPerformanceHeldNotes = {};
        _midiPerformanceSustain = {};
    }

    function initMidiDeviceAccess() {
        if (!navigator.requestMIDIAccess) {
            var statusEl = $('perf-midi-device-status');
            if (statusEl) statusEl.textContent = '浏览器不支持 MIDI 设备';
            return;
        }
        navigator.requestMIDIAccess({ sysex: false }).then(function(access) {
            _midiAccess = access;
            updateMidiDeviceList();
            access.onstatechange = function() {
                updateMidiDeviceList();
                if (state.performanceRecording && state.performanceSettings && state.performanceSettings.midiDeviceEnabled) {
                    startMidiDeviceListening();
                }
            };
        }).catch(function(err) {
            var statusEl = $('perf-midi-device-status');
            if (statusEl) statusEl.textContent = 'MIDI 设备访问被拒绝';
        });
    }

    function updateMidiDeviceList() {
        if (!_midiAccess) return;
        var inputs = _midiAccess.inputs;
        var count = inputs.size;
        var statusEl = $('perf-midi-device-status');
        if (statusEl) {
            if (count === 0) {
                statusEl.textContent = '未检测到 MIDI 设备';
            } else {
                var names = [];
                inputs.forEach(function(input) { names.push(input.name); });
                statusEl.textContent = '已连接: ' + names.join(', ');
                statusEl.style.color = 'var(--accent)';
            }
        }
    }

    function updateMidiDeviceList() {
        if (!_midiAccess) return;
        var activeInputs = [];
        _midiAccess.inputs.forEach(function(input) {
            if (input.state !== 'disconnected') activeInputs.push(input);
        });
        var statusEl = $('perf-midi-device-status');
        if (!statusEl) return;
        if (activeInputs.length === 0) {
            statusEl.textContent = '未检测到 MIDI 设备';
            statusEl.style.color = 'var(--text-tertiary)';
            return;
        }
        var names = [];
        for (var i = 0; i < activeInputs.length; i++) {
            names.push(activeInputs[i].name || activeInputs[i].manufacturer || ('MIDI 输入 ' + (i + 1)));
        }
        statusEl.textContent = '已连接 ' + names.join(', ');
        statusEl.style.color = 'var(--accent)';
    }

    function startMidiDeviceListening() {
        if (!_midiAccess) {
            initMidiDeviceAccess();
            // Wait for access then try again
            setTimeout(function() {
                if (_midiAccess) startMidiDeviceListening();
            }, 500);
            return;
        }
        stopMidiDeviceListening(false);
        _midiInputHandler = function(message) {
            handleMidiPerformanceMessage(message.currentTarget || message.target || this, message);
        };
        _midiAccess.inputs.forEach(function(input) {
            if (input.state === 'connected' || input.connection === 'open' || input.connection === 'pending') {
                if (input.open) {
                    try { input.open(); } catch(e) {}
                }
                input.onmidimessage = _midiInputHandler;
            }
        });
        updateMidiDeviceList();
    }

    function handleMidiPerformanceMessage(input, message) {
        if (!state.performanceRecording || !message || !message.data || message.data.length < 1) return;
        var data = message.data;
        var status = data[0];
        if (status >= 0xF8) return; // realtime clock/active sensing
        var command = status & 0xF0;
        var channel = status & 0x0F;
        var note = data[1];
        var velocity = data[2] || 0;
        var channelKey = ((input && (input.id || input.name)) || 'midi') + ':' + channel;

        if (command === 0x90 && velocity > 0) {
            var nbsKey = midiNoteToNbsKey(note);
            if (nbsKey === null) return;
            var messageKey = getMidiMessageKey(input, channel, note);
            if (_midiPerformanceActiveNotes[messageKey]) return;
            _midiPerformanceActiveNotes[messageKey] = { nbsKey: nbsKey, note: note, channel: channel };
            recordPerformanceKeyDown(nbsKey, midiVelocityToNbsVelocity(velocity));
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(state.currentInstrument, nbsKey, midiVelocityToNbsVelocity(velocity), 50);
            }
            state.selectedPianoKey = nbsKey;
            if (state.pianoRoll && state.pianoRoll.setSelectedKey) {
                state.pianoRoll.setSelectedKey(nbsKey);
            }
            if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
                state.pianoRoll.highlightPianoKey(nbsKey, true);
            }
            updatePianoKeyboardHighlight();
        } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
            var offKey = getMidiMessageKey(input, channel, note);
            if (_midiPerformanceSustain[channelKey]) {
                _midiPerformanceHeldNotes[offKey] = true;
            } else {
                releaseMidiPerformanceNote(offKey);
            }
        } else if (command === 0xB0) {
            var controller = note;
            var value = velocity;
            if (controller === 64) {
                var sustainOn = value >= 64;
                _midiPerformanceSustain[channelKey] = sustainOn;
                if (!sustainOn) releaseSustainedMidiNotes(input, channel);
            } else if (controller === 120 || controller === 121 || controller === 123) {
                stopAllMidiPerformanceNotes();
            }
        }
    }

    function stopMidiDeviceListening(clearActive) {
        if (clearActive !== false) stopAllMidiPerformanceNotes();
        if (_midiAccess) {
            _midiAccess.inputs.forEach(function(input) {
                input.onmidimessage = null;
            });
        }
        _midiInputHandler = null;
    }

    function playMetronomeClick(volume) {
        if (!window.AudioEngine || !AudioEngine.getContext) return;
        var ctx = AudioEngine.getContext();
        if (!ctx) return;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(volume || 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        var masterGain = AudioEngine.isEnhanceEnabled ? null : null;
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    function startMetronomeCountdown(countdownBeats, beatPerMeasure, onComplete, metronomeEnabled) {
        var countdownEl = $('performance-countdown');
        var countdownText = $('performance-countdown-text');
        if (countdownEl) {
            countdownEl.style.display = 'flex';
        }

        var beatIndex = 0;
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        var beatMs = tickMs * 4; // NBS: 4 ticks per beat

        function tick() {
            if (beatIndex >= countdownBeats) {
                if (countdownEl) countdownEl.style.display = 'none';
                if (onComplete) onComplete();
                return;
            }

            var remaining = countdownBeats - beatIndex;
            var beatInMeasure = beatIndex % beatPerMeasure;
            var isDownBeat = beatInMeasure === 0;

            if (countdownText) {
                countdownText.textContent = String(remaining);
                countdownText.style.color = isDownBeat ? 'var(--accent)' : '#ffffff';
            }

            if (metronomeEnabled !== false) {
                if (isDownBeat) {
                    playMetronomeClick(0.5);
                } else {
                    playMetronomeClick(0.25);
                }
            }

            beatIndex++;
            setTimeout(tick, beatMs);
        }

        tick();
    }

    function startContinuousMetronome(beatPerMeasure, metronomeEnabled) {
        stopContinuousMetronome();
        if (metronomeEnabled === false) return; // 节拍器关闭时不启动
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        var beatMs = tickMs * 4; // NBS: 4 ticks per beat
        var beatIdx = 0;
        state._metronomeInterval = setInterval(function() {
            if (!state.performanceRecording) {
                stopContinuousMetronome();
                return;
            }
            if (beatIdx % beatPerMeasure === 0) {
                playMetronomeClick(0.4);
            } else {
                playMetronomeClick(0.2);
            }
            beatIdx++;
        }, beatMs);
    }

    function stopContinuousMetronome() {
        if (state._metronomeInterval) {
            clearInterval(state._metronomeInterval);
            state._metronomeInterval = null;
        }
    }

    function startPerformanceRecordingSetup() {
        showPerformanceSetupDialog(function(settings) {
            state.performanceSettings = settings;
            state.performanceNotes = [];
            state.performanceActiveKeys = {};
            if (settings.tempo !== state.tempo) {
                state.tempo = settings.tempo;
                var tempoInput = $('tempo-value');
                if (tempoInput) tempoInput.value = state.tempo;
            }

            var countdown = settings.beat * 2; // 2 小节

            startMetronomeCountdown(countdown, settings.beat, function() {
                // onComplete 回调
                state.performanceRecording = true;
                state.keyboardPianoEnabled = true;
                var kpBtn = $('btn-keyboard-piano');
                if (kpBtn) kpBtn.classList.add('active');
                pushUndo();
                state._perfRecordStartTick = state.currentTick;
                updatePlayButtonForRecording();
                startPerformanceTickCounter();
                // 演奏中持续节拍器 (受设置控制)
                startContinuousMetronome(settings.beat, settings.metronomeEnabled);
                if (settings.midiDeviceEnabled) {
                    startMidiDeviceListening();
                }
            }, settings.metronomeEnabled);
        });
    }

    function startPerformanceTickCounter() {
        stopPerformanceTickCounter();
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        state._perfTickInterval = setInterval(function() {
            if (!state.performanceRecording) {
                stopPerformanceTickCounter();
                return;
            }
            state.currentTick++;
            var timeEl = $('progress-time');
            if (timeEl) {
                timeEl.textContent = Math.floor(state.currentTick) + ' / ' + Math.floor(Math.max(state.maxTick + 100, state.currentTick + 100)) + ' tick';
            }
            if (state.pianoRoll) {
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll.currentTick = state.currentTick;
                state.pianoRoll.isPlaying = true;
                state.pianoRoll._lastTickTime = performance.now();
                state.pianoRoll._tickDuration = tickMs;
                state.pianoRoll.render();
            }
        }, tickMs);
    }

    function stopPerformanceTickCounter() {
        if (state._perfTickInterval) {
            clearInterval(state._perfTickInterval);
            state._perfTickInterval = null;
        }
        if (state.pianoRoll) {
            state.pianoRoll.isPlaying = false;
        }
    }

    function recordPerformanceKeyDown(nbsKey, velocity) {
        if (!state.performanceRecording) return;
        if (state.performanceActiveKeys[nbsKey]) return;
        velocity = Math.max(1, Math.min(100, Math.round(velocity || 100)));

        var nowTick = state.currentTick;
        if (state.performanceSettings && state.performanceSettings.snapEnabled) {
            var snapBeat = state.performanceSettings.snapBeat;
            var ticksPerBeat = 4;
            var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
            nowTick = Math.round(nowTick / gridStep) * gridStep;
        }

        var layers = state.performanceTrackLayers && state.performanceTrackLayers.length
            ? state.performanceTrackLayers.slice()
            : (state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : []);
        if (!layers.length) return;

        var activeCount = Object.keys(state.performanceActiveKeys).length;
        var layer = layers[Math.min(activeCount, layers.length - 1)];

        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layer) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }

        var note = {
            tick: nowTick,
            layer: layer,
            instrument: state.currentInstrument,
            key: nbsKey,
            velocity: velocity,
            pan: 50,
            pitch: 0
        };

        // 性能优化：使用 noteIndex 快速查找同位置旧音符（O(1) 替代 O(n) 线性扫描）
        // addNote 内部已会删除同位置旧音符，这里只需同步更新 noteIndex
        var tickKey = Math.floor(nowTick);
        var tickNotes = state.noteIndex ? state.noteIndex.get(tickKey) : null;
        if (tickNotes) {
            for (var ti = tickNotes.length - 1; ti >= 0; ti--) {
                if (tickNotes[ti].tick === nowTick && tickNotes[ti].layer === layer) {
                    removeNoteFromIndex(tickNotes[ti]);
                }
            }
        }

        var createdNote = note;
        if (state.pianoRoll) {
            createdNote = state.pianoRoll.addNote(note);
            // skipPreview=true: handlePianoKeyDown 已播放过音色，避免双重播放
            // 录制时默认关闭放置动画以提升性能 (可在设置中开启)
            if (state.pianoRoll._addPlaceAnimation && state.recordingAnimationEnabled) {
                state.pianoRoll._addPlaceAnimation(createdNote, true);
            }
            state.notes = state.pianoRoll.getNotes();
        } else {
            createdNote.id = 'perf_' + Date.now() + '_' + Math.random().toString(16).slice(2);
            state.notes.push(createdNote);
        }

        // 增量更新索引（替代全量 buildNoteIndex 重建）
        addNoteToIndex(createdNote);
        // 节流 DOM 更新（合并多次按键的 UI 刷新为一次 RAF）
        schedulePerformanceUIUpdate();

        state.performanceActiveKeys[nbsKey] = {
            note: { key: nbsKey, instrument: state.currentInstrument, velocity: velocity, pan: 50, pitch: 0 },
            startTick: nowTick,
            layer: layer,
            noteId: createdNote.id
        };
    }

    function recordPerformanceKeyUp(nbsKey) {
        if (!state.performanceRecording) return;

        var entry = state.performanceActiveKeys[nbsKey];
        if (!entry) return;

        delete state.performanceActiveKeys[nbsKey];

        var nowTick = state.currentTick;
        var gridStep = 1;
        if (state.performanceSettings && state.performanceSettings.snapEnabled) {
            var snapBeat = state.performanceSettings.snapBeat;
            // NBS standard: 4 ticks per beat (quarter note)
            // snapBeat: 2=1/2 note, 4=1/4 note, 8=1/8 note, 16=1/16 note, 32=1/32 note
            var ticksPerBeat = 4; // NBS standard
            gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
            nowTick = Math.round(nowTick / gridStep) * gridStep;
        }

        if (state.performanceSettings && state.performanceSettings.sustainRecordEnabled && nowTick > entry.startTick) {
            var base = entry.note || {};
            var added = false;
            for (var tick = entry.startTick + gridStep; tick <= nowTick; tick += gridStep) {
                // 性能优化：用 noteIndex 快速查找旧音符 + 增量更新索引
                // addNote 内部已会删除同位置旧音符，无需手动 removeNotesByIds
                var sTickKey = Math.floor(tick);
                var sTickNotes = state.noteIndex ? state.noteIndex.get(sTickKey) : null;
                if (sTickNotes) {
                    for (var si = sTickNotes.length - 1; si >= 0; si--) {
                        if (sTickNotes[si].tick === tick && sTickNotes[si].layer === entry.layer) {
                            removeNoteFromIndex(sTickNotes[si]);
                        }
                    }
                }
                var note = {
                    tick: tick,
                    layer: entry.layer,
                    instrument: base.instrument,
                    key: base.key,
                    velocity: base.velocity,
                    pan: base.pan,
                    pitch: base.pitch
                };
                if (state.pianoRoll) {
                    var sCreated = state.pianoRoll.addNote(note);
                    addNoteToIndex(sCreated);
                    state.notes = state.pianoRoll.getNotes();
                } else {
                    note.id = 'perf_sustain_' + Date.now() + '_' + Math.random().toString(16).slice(2);
                    state.notes.push(note);
                    addNoteToIndex(note);
                }
                added = true;
            }
            if (added) {
                schedulePerformanceUIUpdate();
            }
        }

        if (state.pianoRoll) {
            state.pianoRoll.setSelectedKey(nbsKey);
        }
    }

    function commitPerformanceNotes() {
        if (state.performanceNotes.length === 0) return;

        pushUndo();

        for (var i = 0; i < state.performanceNotes.length; i++) {
            var pn = state.performanceNotes[i];

            if (!state.song) state.song = {};
            if (!state.song.layers) state.song.layers = [];
            while (state.song.layers.length <= pn.layer) {
                state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
            }

            var existingIds = [];
            for (var j = state.notes.length - 1; j >= 0; j--) {
                if (state.notes[j].tick === pn.tick && state.notes[j].layer === pn.layer) {
                    existingIds.push(state.notes[j].id);
                }
            }
            if (existingIds.length > 0 && state.pianoRoll) {
                state.pianoRoll.removeNotesByIds(existingIds);
            }

            var note = {
                id: 'perf_' + i + '_' + Date.now(),
                tick: pn.tick,
                layer: pn.layer,
                instrument: pn.instrument,
                key: pn.key,
                velocity: pn.velocity,
                pan: pn.pan,
                pitch: pn.pitch
            };
            state.notes.push(note);
            if (state.pianoRoll) {
                state.pianoRoll.addNote(note);
            }
        }

        buildNoteIndex(state.notes);
        updateTrackPanelUI();
        updateNoteCount();
        markDirty();

        state.performanceNotes = [];
    }

    function stopPerformanceRecording() {
        if (state.performanceRecording) {
            commitPerformanceNotes();
        }
        var activeKeys = Object.keys(state._activePianoKeys || {});
        for (var i = 0; i < activeKeys.length; i++) {
            var pianoKey = state._activePianoKeys[activeKeys[i]];
            if (pianoKey === true) pianoKey = N.shared.KEYBOARD_PIANO_MAP[activeKeys[i]];
            if (pianoKey !== undefined && state.pianoRoll && state.pianoRoll.highlightPianoKey) {
                state.pianoRoll.highlightPianoKey(pianoKey, false);
            }
        }
        state.performanceRecording = false;
        state.performanceActiveKeys = {};
        state._activePianoKeys = {};
        state._perfRecordStartTick = null;
        stopPerformanceTickCounter();
        stopContinuousMetronome();
        stopMidiDeviceListening();

        var countdownEl = $('performance-countdown');
        if (countdownEl) countdownEl.style.display = 'none';

        updatePianoKeyboardHighlight();
        updatePlayButtonForRecording();
    }

    function updatePlayButtonForRecording() {
        var playBtn = $('btn-play');
        if (!playBtn) return;
        var icon = playBtn.querySelector('i');
        playBtn.classList.remove('perf-recording');
        if (state.performanceRecording) {
            playBtn.classList.add('perf-recording');
            if (icon) {
                icon.className = 'fa-solid fa-stop';
            }
            playBtn.setAttribute('title', '停止录制');
        } else if (state.performanceMode) {
            if (icon) {
                icon.className = 'fa-solid fa-circle';
            }
            playBtn.setAttribute('title', '开始演奏录制');
        } else {
            if (icon) {
                icon.className = 'fa-solid fa-play';
            }
            playBtn.setAttribute('title', '播放/暂停 (Space)');
        }
    }

    function updatePlayButtonForRecording() {
        var recordBtn = $('btn-performance-record');
        if (recordBtn) {
            var recordIcon = recordBtn.querySelector('i');
            recordBtn.style.display = state.performanceMode ? 'inline-flex' : 'none';
            recordBtn.classList.toggle('perf-recording', !!state.performanceRecording);
            if (recordIcon) {
                recordIcon.className = state.performanceRecording ? 'fa-solid fa-stop' : 'fa-solid fa-circle';
            }
            recordBtn.setAttribute('title', state.performanceRecording ? '停止录制' : '开始录制 (Space)');
        }

        var playBtn = $('btn-play');
        if (!playBtn) return;
        var icon = playBtn.querySelector('i');
        playBtn.classList.remove('perf-recording');
        if (icon) {
            icon.className = state.isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        }
        playBtn.setAttribute('title', state.performanceMode ? '播放/暂停试听' : '播放/暂停 (Space)');
    }

    function getFpsText(value) {
        var prefix = window.WebNBSI18n && window.WebNBSI18n.t
            ? window.WebNBSI18n.t('FPS: ')
            : 'FPS: ';
        return prefix + value;
    }

    function updateFpsIndicator() {
        if (!state.showFps) return;
        var now = performance.now();
        var elapsed = state._fpsLastTime ? now - state._fpsLastTime : 0;
        state._fpsValue = elapsed > 0 ? state._fpsFrames * 1000 / elapsed : 0;
        state._fpsFrames = 0;
        state._fpsLastTime = now;
        var fpsEl = $('fps-indicator');
        if (fpsEl) fpsEl.textContent = getFpsText(Math.round(state._fpsValue));
    }

    function startFpsDisplayTimer() {
        if (state._fpsDisplayTimer) return;
        state._fpsDisplayTimer = setInterval(updateFpsIndicator, 500);
    }

    // 元素是否真实可见 (综合内联 display / aria-hidden / 计算样式)
    function _isElementVisible(el) {
        if (!el) return false;
        if (el.style && el.style.display === 'none') return false;
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
        var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
        return true;
    }

    // 判断当前是否有模态弹窗打开 (自定义弹窗 / .popup / 隐私弹窗)
    // 用途: 弹窗打开时阻塞主窗口快捷键 (空格播放、Delete 删除、Escape 停止等)
    function isAnyModalOpen() {
        if (_appDialogStack.length > 0) return true;
        var nodes = document.querySelectorAll('.popup, .privacy-popup-mask, .app-dialog-overlay');
        for (var i = 0; i < nodes.length; i++) {
            if (_isElementVisible(nodes[i])) return true;
        }
        return false;
    }

    // 关闭所有临时悬浮层 (工具栏菜单 / 右键菜单 / 乐器浮层 / FAB 菜单 / 横屏抽屉)。
    // 模态弹窗打开时调用: 避免这些悬浮层被弹窗遮罩盖住却仍占据点击热区
    // (用户以为点在悬浮层上, 实际点在遮罩上)。常驻工具面板(创作辅助/查找替换)不在此列。
    function closeTransientFloats() {
        hideContextMenu();
        var ids = ['functions-menu', 'toolbar-more-menu', 'instrument-popup', 'fab-context-menu',
                   'timbre-slot-menu', 'substitute-slot-menu', 'find-pick-pop'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) el.style.display = 'none';
        }
        var menus = document.querySelectorAll('.context-menu');
        for (var m = 0; m < menus.length; m++) menus[m].style.display = 'none';
        var drawer = document.getElementById('landscape-drawer');
        if (drawer) drawer.classList.remove('visible');
        var drawerMask = document.getElementById('landscape-drawer-mask');
        if (drawerMask) drawerMask.classList.remove('visible');
    }

    // 观察所有模态弹窗容器: 一旦变为可见就关闭残留的悬浮层
    function initModalFloatGuard() {
        if (!window.MutationObserver) return;
        var popups = document.querySelectorAll('.popup, .privacy-popup-mask');
        if (!popups.length) return;
        var observer = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (_isElementVisible(mutations[i].target)) { closeTransientFloats(); return; }
            }
        });
        for (var i = 0; i < popups.length; i++) {
            observer.observe(popups[i], { attributes: true, attributeFilter: ['style', 'class'] });
        }
    }

    // ============ 键盘快捷键 ============
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            if (e.code === 'F3') {
                e.preventDefault();
                state.showFps = !state.showFps;
                state._fpsFrames = 0;
                state._fpsLastTime = performance.now();
                var fpsEl = $('fps-indicator');
                if (fpsEl) {
                    fpsEl.style.display = state.showFps ? 'block' : 'none';
                    fpsEl.textContent = getFpsText('--');
                }
                return;
            }

            // 有模态弹窗打开时, 阻塞主窗口快捷键 (空格播放 / Delete 删除 / Escape 停止等),
            // 让弹窗自身与弹窗内输入框处理按键 (等效 Windows 子窗口阻塞父窗口)
            if (isAnyModalOpen()) {
                var modalTarget = e.target;
                var modalEditing = modalTarget && (modalTarget.tagName === 'INPUT' || modalTarget.tagName === 'TEXTAREA' || modalTarget.tagName === 'SELECT' || modalTarget.isContentEditable);
                if (!modalEditing && (e.code === 'Space' || e.key === 'PageDown' || e.key === 'PageUp')) {
                    e.preventDefault();
                }
                return;
            }

            var editableTarget = isEditableTarget(e.target);

            // ---- 片段编辑快捷键 (仅片段模式, 输入框内不拦截) ----
            if (state.segmentsEditMode && !editableTarget) {
                var segCtrl = e.ctrlKey || e.metaKey;
                var segKey = (e.key || '').toLowerCase();
                if (!segCtrl && (segKey === 'delete' || segKey === 'backspace')) {
                    if (segmentDelete()) { e.preventDefault(); return; }
                } else if (!segCtrl && segKey === 'q') {
                    if (segmentTrimLeft()) { e.preventDefault(); return; }
                } else if (!segCtrl && segKey === 'e') {
                    if (segmentTrimRight()) { e.preventDefault(); return; }
                } else if (segCtrl && segKey === 'b') {
                    if (segmentSplit()) { e.preventDefault(); return; }
                } else if (segCtrl && segKey === 'w') {
                    // 注意: 多数浏览器会拦截 Ctrl+W 关闭标签页, 此处尽力处理
                    if (segmentTrimRight()) e.preventDefault();
                    return;
                } else if (segCtrl && (segKey === '=' || segKey === '+')) {
                    // 横向放大 (标准: Ctrl + =)
                    segZoomAxis('x', 1.2);
                    e.preventDefault();
                    return;
                } else if (segCtrl && (segKey === '-' || segKey === '_')) {
                    // 横向缩小 (标准: Ctrl + -)
                    segZoomAxis('x', 1 / 1.2);
                    e.preventDefault();
                    return;
                } else if (segCtrl && segKey === '0') {
                    // 重置缩放 (标准: Ctrl + 0)
                    if (state.pianoRoll) state.pianoRoll.resetZoomAxis();
                    e.preventDefault();
                    return;
                } else if (e.altKey && (segKey === '=' || segKey === '+')) {
                    // 纵向放大 (Alt + =)
                    segZoomAxis('y', 1.2);
                    e.preventDefault();
                    return;
                } else if (e.altKey && (segKey === '-' || segKey === '_')) {
                    // 纵向缩小 (Alt + -)
                    segZoomAxis('y', 1 / 1.2);
                    e.preventDefault();
                    return;
                } else if (segCtrl && segKey === 'c') {
                    if (segmentCopy()) { e.preventDefault(); return; }
                } else if (segCtrl && segKey === 'v') {
                    if (segmentPaste()) { e.preventDefault(); return; }
                } else if (segCtrl && segKey === 'x') {
                    if (segmentCopy()) {
                        segmentDelete();
                        e.preventDefault();
                        return;
                    }
                }
            }

            var pianoKey = getPianoKeyFromKeyboardEvent(e);
            var allowedEditShortcut = isAllowedPianoEditShortcut(e);

            if (state.performanceRecording) {
                if (pianoKey !== undefined && !editableTarget) {
                    e.preventDefault();
                    if (!state._activePianoKeys[e.code]) {
                        state._activePianoKeys[e.code] = pianoKey;
                        handlePianoKeyDown(pianoKey, e.code);
                    }
                    return;
                }
                // 演奏录制模式下允许 Delete 键删除选中的音符
                if (e.key === 'Delete' && !editableTarget) {
                    // 不 preventDefault, 让下面的 Delete 处理逻辑执行
                } else if (!editableTarget) {
                    e.preventDefault();
                    return;
                }
            }

            if (state.performanceMode && e.code === 'Space' && !editableTarget) {
                e.preventDefault();
                togglePerformanceRecording();
                return;
            }

            if (state.keyboardPianoEnabled && !editableTarget) {
                if (!allowedEditShortcut && pianoKey !== undefined) {
                    e.preventDefault();
                    if (!state._activePianoKeys[e.code]) {
                        state._activePianoKeys[e.code] = pianoKey;
                        handlePianoKeyDown(pianoKey, e.code);
                    }
                    return;
                }
                if (!allowedEditShortcut) {
                    e.preventDefault();
                    return;
                }
            }

            // 键盘钢琴按键处理（不拦截输入框）
            if (state.keyboardPianoEnabled) {
                // Don't intercept when Ctrl/Cmd is pressed (allow copy/paste/select-all)
                if (e.ctrlKey || e.metaKey) {
                    // Fall through to normal shortcut handling
                } else {
                    var pianoKey = N.shared.KEYBOARD_PIANO_MAP[e.code];
                    if (pianoKey !== undefined && !state._activePianoKeys[e.code]) {
                        var isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
                        if (!isInput) {
                            e.preventDefault();
                            state._activePianoKeys[e.code] = true;
                            handlePianoKeyDown(pianoKey, e.code);
                            return;
                        }
                    }
                }
            }

            // 忽略输入框中的快捷键
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                // 但允许 Escape
                if (e.key !== 'Escape') return;
            }

            var handled = true;

            // K 键不再作为快捷键，保留给钢琴键盘映射使用。
            if (false && e.code === 'KeyK' && !e.ctrlKey && !e.metaKey) {
                state.keyboardPianoEnabled = !state.keyboardPianoEnabled;
                var kpBtn = $('btn-keyboard-piano');
                if (kpBtn) kpBtn.classList.toggle('active', state.keyboardPianoEnabled);
                if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                    state.pianoRoll.setShowKeyLabels(state.keyboardPianoEnabled);
                }
                updatePianoKeyboardHighlight();
                return;
            }

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                handlePlayToggle();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleStop();
                if (state.pianoRoll) state.pianoRoll._clearSelection();
                hideContextMenu();
                if (assistPanelVisible()) closeAssistPanel();
                if (findPanelVisible()) closeFindPanel();
                var aboutEl = $('about-popup');
                if (aboutEl) { aboutEl.style.display = ''; aboutEl.classList.remove('active'); }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                var lclip = state.lyricsEditMode ? getSelectedLyricClip() : null;
                if (lclip) {
                    deleteLyricClip(lclip.id);
                } else if (state.pianoRoll) {
                    var sel = state.pianoRoll.getSelectedNotes();
                    if (sel.length > 0) {
                        pushUndo();
                        state.pianoRoll.deleteSelected();
                        state.notes = state.pianoRoll.getNotes();
                        buildNoteIndex(state.notes);
                        updateNoteCount();
                        markDirty();
                    }
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                if (state.lyricsEditMode && getSelectedLyricClip()) {
                    copyLyricClip(false);
                } else if (state.pianoRoll) {
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                e.preventDefault();
                if (state.lyricsEditMode && getSelectedLyricClip()) copyLyricClip(true);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                if (state.lyricsEditMode && state.lyricClipboard.length) pasteLyricClips();
                else handlePaste();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                if (state.pianoRoll) state.pianoRoll.selectAll();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                performUndo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                performRedo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's' && e.shiftKey) {
                e.preventDefault();
                tabSaveAll();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleDuplicate();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                if (findPanelVisible()) closeFindPanel();
                else openFindPanel();
            } else if (window.innerWidth < 768 && e.key === 'm' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                toggleMuteSelectedTrack();
            } else if (window.innerWidth < 768 && e.key === 's' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                toggleSoloSelectedTrack();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                handleArrowKey(e.key);
            } else if (window.innerWidth >= 768 && (e.key === 'd' || e.key === 'D' || e.key === '1')) {
                switchTool('default');
            } else if (window.innerWidth >= 768 && (e.key === 's' || e.key === 'S' || e.key === '2')) {
                switchTool('select');
            } else if (window.innerWidth >= 768 && (e.key === 'e' || e.key === 'E' || e.key === '3')) {
                switchTool('eraser');
            } else if (window.innerWidth >= 768 && (e.key === 'b' || e.key === 'B' || e.key === '4')) {
                switchTool('brush');
            } else if (window.innerWidth >= 768 && (e.key === 'p' || e.key === 'P' || e.key === '5')) {
                switchTool('performance');
            } else {
                handled = false;
            }

            if (handled) {
                updateProgressUI();
                updateTrackPanelUI();
            }
        });

        document.addEventListener('keyup', function(e) {
            if (state.keyboardPianoEnabled && state._activePianoKeys[e.code]) {
                var pianoKey = state._activePianoKeys[e.code];
                state._activePianoKeys[e.code] = false;
                if (pianoKey === true) pianoKey = getPianoKeyFromKeyboardEvent(e);
                if (pianoKey !== undefined) {
                    handlePianoKeyUp(pianoKey, e.code);
                }
            }
        });
    }

    // ---- 导出 ----
    N.switchTool = switchTool;
    N.handlePianoKeyDown = handlePianoKeyDown;
    N.handlePianoKeyUp = handlePianoKeyUp;
    N.showPerformanceSetupDialog = showPerformanceSetupDialog;
    N.midiNoteToNbsKey = midiNoteToNbsKey;
    N.midiVelocityToNbsVelocity = midiVelocityToNbsVelocity;
    N.getMidiMessageKey = getMidiMessageKey;
    N.releaseMidiPerformanceNote = releaseMidiPerformanceNote;
    N.releaseSustainedMidiNotes = releaseSustainedMidiNotes;
    N.stopAllMidiPerformanceNotes = stopAllMidiPerformanceNotes;
    N.initMidiDeviceAccess = initMidiDeviceAccess;
    N.updateMidiDeviceList = updateMidiDeviceList;
    N.startMidiDeviceListening = startMidiDeviceListening;
    N.handleMidiPerformanceMessage = handleMidiPerformanceMessage;
    N.stopMidiDeviceListening = stopMidiDeviceListening;
    N.playMetronomeClick = playMetronomeClick;
    N.startMetronomeCountdown = startMetronomeCountdown;
    N.startContinuousMetronome = startContinuousMetronome;
    N.stopContinuousMetronome = stopContinuousMetronome;
    N.startPerformanceRecordingSetup = startPerformanceRecordingSetup;
    N.startPerformanceTickCounter = startPerformanceTickCounter;
    N.stopPerformanceTickCounter = stopPerformanceTickCounter;
    N.recordPerformanceKeyDown = recordPerformanceKeyDown;
    N.recordPerformanceKeyUp = recordPerformanceKeyUp;
    N.commitPerformanceNotes = commitPerformanceNotes;
    N.stopPerformanceRecording = stopPerformanceRecording;
    N.updatePlayButtonForRecording = updatePlayButtonForRecording;
    N.getFpsText = getFpsText;
    N.updateFpsIndicator = updateFpsIndicator;
    N.startFpsDisplayTimer = startFpsDisplayTimer;
    N._isElementVisible = _isElementVisible;
    N.isAnyModalOpen = isAnyModalOpen;
    N.closeTransientFloats = closeTransientFloats;
    N.initModalFloatGuard = initModalFloatGuard;
    N.initKeyboardShortcuts = initKeyboardShortcuts;
    N._midiAccess = _midiAccess;
    N._midiInputHandler = _midiInputHandler;
    N._midiPerformanceActiveNotes = _midiPerformanceActiveNotes;
    N._midiPerformanceHeldNotes = _midiPerformanceHeldNotes;
    N._midiPerformanceSustain = _midiPerformanceSustain;
})(window.WebNBS);
