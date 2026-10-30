/* 29-midi-tracks.js — MiauNoteBlock 功能模块
   来源: 原 main.js L17098-L17888; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    var MiniMidiRoll = N.MiniMidiRoll;
    var _midiTrackPlayback = N._midiTrackPlayback;
    function ensureSoundfontOnDemand() { return N.ensureSoundfontOnDemand.apply(this, arguments); }
    function extractTrackNotes() { return N.extractTrackNotes.apply(this, arguments); }
    function getEffectiveMidiSource() { return N.getEffectiveMidiSource.apply(this, arguments); }
    function getMidiTrackState() { return N.getMidiTrackState.apply(this, arguments); }
    function getTinySynth() { return N.getTinySynth.apply(this, arguments); }
    function initMidiTrackStates() { return N.initMidiTrackStates.apply(this, arguments); }
    function setMidiTrackState() { return N.setMidiTrackState.apply(this, arguments); }
    function showMidiNotice() { return N.showMidiNotice.apply(this, arguments); }
    function stopMidiTrackPlayback() { return N.stopMidiTrackPlayback.apply(this, arguments); }


    // 将像素 X 坐标转换为时间（用于点击跳转）
    MiniMidiRoll.prototype.pixelToTime = function(px) {
        var availW = Math.max(10, this.width - this.paddingLeft - this.paddingRight);
        var timeRange = Math.max(0.1, this.maxTime - this.minTime);
        var scaleX = availW / timeRange;
        return this.minTime + (px - this.paddingLeft - this.scrollX) / scaleX;
    };

    MiniMidiRoll.prototype.destroy = function() {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
    };

    function renderMidiTrackRow(index) {
        var row = document.querySelector('#midi-track-rows tr[data-track-index="' + index + '"]');
        if (!row) return;
        var st = getMidiTrackState(index);
        row.classList.toggle('muted', !!st.muted);
        row.classList.toggle('excluded', !!st.excluded);

        var muteBtn = row.querySelector('.midi-track-btn.mute');
        var soloBtn = row.querySelector('.midi-track-btn.solo');
        var excludeBtn = row.querySelector('.midi-track-btn.exclude');

        if (muteBtn) {
            muteBtn.classList.toggle('on', !!st.muted);
            muteBtn.disabled = !!st.excluded;
            // Force red background when muted, overriding td background
            if (st.muted) {
                muteBtn.style.background = 'var(--accent-red)';
                muteBtn.style.borderColor = 'var(--accent-red)';
                muteBtn.style.color = '#fff';
            } else {
                muteBtn.style.background = '';
                muteBtn.style.borderColor = '';
                muteBtn.style.color = '';
            }
        }
        if (soloBtn) {
            soloBtn.classList.toggle('on', !!st.solo);
            soloBtn.disabled = !!st.excluded;
        }
        if (excludeBtn) {
            excludeBtn.classList.toggle('on', !!st.excluded);
        }
    }

    function renderAllMidiTrackRows() {
        var rows = document.querySelectorAll('#midi-track-rows tr[data-track-index]');
        for (var i = 0; i < rows.length; i++) {
            renderMidiTrackRow(parseInt(rows[i].getAttribute('data-track-index')));
        }
    }

    function buildMidiTrackRows(info) {
        var trackRows = $('midi-track-rows');
        if (!trackRows) return;
        trackRows.innerHTML = '';
        var tracks = info.tracks || [];
        // 第一次构建或文件变化时重置状态
        if (!state._midiTrackInfo || state._midiTrackInfo.fileKey !== (state._midiFile ? state._midiFile.name : '')) {
            initMidiTrackStates(info);
            state._midiTrackInfo = { fileKey: state._midiFile ? state._midiFile.name : '', trackCount: tracks.length };
        }
        for (var k = 0; k < tracks.length; k++) {
            var t = tracks[k];
            var st = getMidiTrackState(t.index);
            var row = document.createElement('tr');
            row.setAttribute('data-track-index', t.index);
            row.className = (st.muted ? 'muted ' : '') + (st.excluded ? 'excluded' : '');
            row.innerHTML =
                '<td>' + (t.index + 1) + '</td>' +
                '<td>' + (t.name || 'Track ' + (t.index + 1)) + '</td>' +
                '<td>' + (t.event_count || 0) + '</td>' +
                '<td>' + (t.note_count || 0) + '</td>' +
                '<td><button class="midi-track-btn mute' + (st.muted ? ' on' : '') + '" data-track="' + t.index + '" data-action="mute"' + (st.excluded ? ' disabled' : '') + '>M</button></td>' +
                '<td><button class="midi-track-btn solo' + (st.solo ? ' on' : '') + '" data-track="' + t.index + '" data-action="solo"' + (st.excluded ? ' disabled' : '') + '>S</button></td>' +
                '<td><button class="midi-track-btn exclude' + (st.excluded ? ' on' : '') + '" data-track="' + t.index + '" data-action="exclude">X</button></td>' +
                '<td><div class="midi-track-mini-roll" data-track="' + t.index + '" style="width:140px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:default;"><canvas style="display:block;width:100%;height:100%;"></canvas></div></td>';
            trackRows.appendChild(row);
        }
        bindMidiTrackButtons();
        updateMidiTrackProgressDuration(info.duration_seconds || 0);
    }

    function bindMidiTrackButtons() {
        var tbody = $('midi-track-rows');
        if (tbody && !tbody._midiTrackButtonsBound) {
            tbody._midiTrackButtonsBound = true;
            tbody.addEventListener('click', function(e) {
                var btn = e.target && e.target.closest ? e.target.closest('.midi-track-btn') : null;
                if (!btn || !tbody.contains(btn)) return;
                e.preventDefault();
                e.stopPropagation();
                var trackIndex = parseInt(btn.getAttribute('data-track'));
                var action = btn.getAttribute('data-action');
                var st = getMidiTrackState(trackIndex);
                if (action === 'mute') {
                    if (st.excluded) return;
                    setMidiTrackState(trackIndex, 'muted', !st.muted);
                } else if (action === 'solo') {
                    if (st.excluded) return;
                    setMidiTrackState(trackIndex, 'solo', !st.solo);
                } else if (action === 'exclude') {
                    setMidiTrackState(trackIndex, 'excluded', !st.excluded);
                }
            });
        }
        // 初始化每行的迷你音符图
        initMidiTrackMiniRolls();
    }

    // 为 MIDI 音轨表格每行初始化迷你音符图
    var _midiTrackMiniRolls = {}; // trackIndex → MiniMidiRoll
    function initMidiTrackMiniRolls() {
        // 清理旧的
        for (var k in _midiTrackMiniRolls) {
            if (_midiTrackMiniRolls[k] && _midiTrackMiniRolls[k].destroy) {
                _midiTrackMiniRolls[k].destroy();
            }
        }
        _midiTrackMiniRolls = {};

        var events = state._midiParsedEvents || [];

        var containers = document.querySelectorAll('#midi-track-rows .midi-track-mini-roll');
        for (var i = 0; i < containers.length; i++) {
            (function(container) {
                var trackIdx = parseInt(container.getAttribute('data-track'));
                var notes = extractTrackNotes(events, trackIdx);
                var canvas = container.querySelector('canvas');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || _midiTrackPlayback.duration || 0;
                var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                _midiTrackMiniRolls[trackIdx] = mr;
                // 不允许拖拽，仅作为预览显示
            })(containers[i]);
        }
    }

    // 播放时更新所有迷你音符图的播放头
    function updateMidiTrackMiniRollsPlayhead(time) {
        for (var k in _midiTrackMiniRolls) {
            if (_midiTrackMiniRolls[k]) {
                _midiTrackMiniRolls[k].setPlayhead(time);
            }
        }
    }

    function updateMidiTrackRollTime(time) {
        var el = $('midi-track-roll-time');
        if (el) el.textContent = time.toFixed(1) + 's';
    }

    function updateMidiTrackPlayerButtons() {
        var playBtn = $('midi-track-play');
        if (playBtn) {
            playBtn.classList.toggle('playing', _midiTrackPlayback.playing);
            var icon = playBtn.querySelector('i');
            if (icon) icon.className = _midiTrackPlayback.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        }
    }

    function formatMidiTrackTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) seconds = 0;
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateMidiTrackProgressDuration(seconds) {
        _midiTrackPlayback.duration = seconds || 0;
        var timeEl = $('midi-track-progress-time');
        if (timeEl) {
            timeEl.textContent = '0:00 / ' + formatMidiTrackTime(_midiTrackPlayback.duration);
        }
    }

    function updateMidiTrackProgressUI(currentSeconds) {
        var duration = _midiTrackPlayback.duration || 1;
        if (currentSeconds < 0) currentSeconds = 0;
        if (currentSeconds > duration) currentSeconds = duration;
        var pct = duration > 0 ? (currentSeconds / duration * 100) : 0;
        var fill = $('midi-track-progress-fill');
        var handle = $('midi-track-progress-handle');
        var timeEl = $('midi-track-progress-time');
        if (fill) fill.style.width = pct + '%';
        if (handle) handle.style.left = pct + '%';
        if (timeEl) timeEl.textContent = formatMidiTrackTime(currentSeconds) + ' / ' + formatMidiTrackTime(duration);
        // 同步迷你音符图的播放头
        updateMidiTrackMiniRollsPlayhead(currentSeconds);
    }

    function initMidiTrackPlayer() {
        var playBtn = $('midi-track-play');
        var stopBtn = $('midi-track-stop');
        var progress = $('midi-track-progress');

        if (playBtn) {
            playBtn.addEventListener('click', function() {
                if (_midiTrackPlayback.playing) {
                    pauseMidiTrackPlayback();
                } else {
                    startMidiTrackPlayback();
                }
            });
        }
        if (stopBtn) {
            stopBtn.addEventListener('click', function() {
                stopMidiTrackPlayback();
            });
        }
        if (progress) {
            var isDragging = false;
            function seekFromEvent(e) {
                var rect = progress.getBoundingClientRect();
                var clientX = e.clientX;
                if (clientX === undefined && e.touches && e.touches.length) clientX = e.touches[0].clientX;
                if (clientX === undefined && e.changedTouches && e.changedTouches.length) clientX = e.changedTouches[0].clientX;
                var x = (clientX !== undefined ? clientX : rect.left) - rect.left;
                var pct = Math.max(0, Math.min(1, x / rect.width));
                var duration = _midiTrackPlayback.duration || 1;
                return pct * duration;
            }
            function applySeek(e) {
                var targetTime = seekFromEvent(e);
                if (_midiTrackPlayback.playing) {
                    stopMidiTrackPlayback();
                    _midiTrackPlayback.pauseTime = targetTime;
                    startMidiTrackPlayback();
                } else {
                    _midiTrackPlayback.pauseTime = targetTime;
                    updateMidiTrackProgressUI(targetTime);
                }
            }
            progress.addEventListener('click', function(e) {
                if (isDragging) return;
                applySeek(e);
            });
            progress.addEventListener('pointerdown', function(e) {
                isDragging = true;
                try { progress.setPointerCapture(e.pointerId); } catch(ex) {}
                applySeek(e);
            });
            progress.addEventListener('pointermove', function(e) {
                if (!isDragging) return;
                e.preventDefault();
                var targetTime = seekFromEvent(e);
                updateMidiTrackProgressUI(targetTime);
            });
            progress.addEventListener('pointerup', function(e) {
                if (!isDragging) return;
                isDragging = false;
                try { progress.releasePointerCapture(e.pointerId); } catch(ex) {}
                applySeek(e);
            });
            progress.addEventListener('pointercancel', function(e) {
                isDragging = false;
                try { progress.releasePointerCapture(e.pointerId); } catch(ex) {}
            });
        }
    }

    // 解析 MIDI 文件为事件列表（简化版，仅用于试听/预览）
    // 优先使用与 getMidiInfo 相同的解析器，保证 track 索引一致
    function parseMidiFileForPlayback(arrayBuffer, info) {
        // 优先使用 @tonejs/midi (与 getMidiInfo 保持一致)
        if (typeof window.__ToneMidi !== 'undefined') {
            var toneParseFn = null;
            if (window.NBSClient && typeof NBSClient._parseMidiWithToneJS === 'function') {
                toneParseFn = NBSClient._parseMidiWithToneJS;
            } else if (typeof _parseMidiWithToneJS === 'function') {
                toneParseFn = _parseMidiWithToneJS;
            }
            if (toneParseFn) {
                try {
                    var toneData = toneParseFn(arrayBuffer);
                    if (toneData && toneData.events && toneData.events.length > 0) {
                        return _convertToneEventsForPlayback(toneData);
                    }
                } catch (e) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[MiauNoteBlock] parseMidiFileForPlayback: @tonejs/midi 解析失败, 回退到自包含解析器', e);
                    }
                }
            }
        }
        return _parseMidiFileForPlaybackFallback(arrayBuffer, info);
    }

    // 将 @tonejs/midi 解析结果转换为试听/预览所需的事件格式
    // toneData.events 中只包含音符事件 (无 programChange), 需从 channelFirstProgram 生成
    function _convertToneEventsForPlayback(toneData) {
        var events = [];
        var tempoChanges = (toneData.tempoChangesList && toneData.tempoChangesList.length > 0)
            ? toneData.tempoChangesList.slice()
            : [{ tick: 0, tempo_us: 500000 }];
        tempoChanges.sort(function(a, b) { return a.tick - b.tick; });
        var ppq = toneData.ticksPerBeat || 480;

        // 从 channelFirstProgram 生成 programChange 事件 (tick 0, 供 TinySynth 设置音色)
        var cfp = toneData.channelFirstProgram || {};
        for (var chKey in cfp) {
            if (!Object.prototype.hasOwnProperty.call(cfp, chKey)) continue;
            events.push({
                track: -1,
                tick: 0,
                type: 'programChange',
                channel: parseInt(chKey, 10),
                program: cfp[chKey],
                time: 0
            });
        }

        for (var i = 0; i < toneData.events.length; i++) {
            var ev = toneData.events[i];
            // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
            if (ev.type && ev.type !== 'note') continue;
            // 音符事件 -> 拆为 noteOn / noteOff
            var dur = ev.duration_ticks || 0;
            events.push({
                track: ev.track,
                tick: ev.tick,
                type: 'noteOn',
                channel: ev.channel,
                note: ev.note,
                velocity: ev.velocity || 100,
                time: _tickToSeconds(ev.tick, tempoChanges, ppq)
            });
            events.push({
                track: ev.track,
                tick: ev.tick + dur,
                type: 'noteOff',
                channel: ev.channel,
                note: ev.note,
                velocity: 0,
                time: _tickToSeconds(ev.tick + dur, tempoChanges, ppq)
            });
        }
        events.sort(function(a, b) { return a.time - b.time; });
        return events;
    }

    function _tickToSeconds(tick, tempoChanges, ppq) {
        var time = 0;
        var lastTick = 0;
        var currentTempoUs = tempoChanges[0].tempo_us;
        for (var i = 1; i < tempoChanges.length; i++) {
            if (tempoChanges[i].tick > tick) break;
            time += (tempoChanges[i].tick - lastTick) / ppq * (currentTempoUs / 1000000);
            lastTick = tempoChanges[i].tick;
            currentTempoUs = tempoChanges[i].tempo_us;
        }
        time += (tick - lastTick) / ppq * (currentTempoUs / 1000000);
        return time;
    }

    // 自包含 MIDI 解析器（@tonejs/midi 不可用时回退）
    function _parseMidiFileForPlaybackFallback(arrayBuffer, info) {
        var data = new Uint8Array(arrayBuffer);
        var pos = 0;
        function readByte() { return data[pos++]; }
        function readUint16() { return (data[pos++] << 8) | data[pos++]; }
        function readUint32() { return (data[pos++] << 24) | (data[pos++] << 16) | (data[pos++] << 8) | data[pos++]; }
        function readVarLen() {
            var result = 0;
            while (true) {
                var b = data[pos++];
                result = (result << 7) | (b & 0x7F);
                if (!(b & 0x80)) break;
            }
            return result;
        }

        if (readUint32() !== 0x4D546864) return []; // MThd
        var headerLen = readUint32();
        pos += headerLen;

        var events = [];
        var trackIndex = 0;
        var ticksPerBeat = info.ticks_per_beat || 480;
        var tempo = 500000; // 默认 120 BPM
        var tempoByTick = [{ tick: 0, tempo: tempo }];

        while (pos < data.length) {
            if (readUint32() !== 0x4D54726B) { // MTrk
                // 跳过未知块
                var len = readUint32();
                pos += len;
                continue;
            }
            var trackLen = readUint32();
            var trackEnd = pos + trackLen;
            var currentTick = 0;
            var lastStatus = 0;

            while (pos < trackEnd) {
                var delta = readVarLen();
                currentTick += delta;
                var status = data[pos];
                if (status & 0x80) {
                    lastStatus = status;
                    pos++;
                } else {
                    status = lastStatus;
                }

                var type = (status & 0xF0) >> 4;
                var channel = status & 0x0F;

                if (status === 0xFF) { // Meta
                    var metaType = readByte();
                    var metaLen = readVarLen();
                    var metaData = data.slice(pos, pos + metaLen);
                    pos += metaLen;
                    if (metaType === 0x51 && metaLen >= 3) {
                        tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                        tempoByTick.push({ tick: currentTick, tempo: tempo });
                    }
                } else if (status === 0xF0 || status === 0xF7) { // SysEx
                    var sysLen = readVarLen();
                    pos += sysLen;
                } else if (type === 0x9) { // Note On
                    var note = readByte();
                    var velocity = readByte();
                    if (velocity > 0) {
                        events.push({
                            track: trackIndex,
                            tick: currentTick,
                            type: 'noteOn',
                            channel: channel,
                            note: note,
                            velocity: velocity
                        });
                    } else {
                        events.push({
                            track: trackIndex,
                            tick: currentTick,
                            type: 'noteOff',
                            channel: channel,
                            note: note,
                            velocity: 0
                        });
                    }
                } else if (type === 0x8) { // Note Off
                    var note = readByte();
                    var velocity = readByte();
                    events.push({
                        track: trackIndex,
                        tick: currentTick,
                        type: 'noteOff',
                        channel: channel,
                        note: note,
                        velocity: 0
                    });
                } else if (type === 0xC) { // Program Change
                    var program = readByte();
                    events.push({
                        track: trackIndex,
                        tick: currentTick,
                        type: 'programChange',
                        channel: channel,
                        program: program
                    });
                } else if (type === 0xB) { // Control Change
                    readByte(); readByte();
                } else if (type === 0xE) { // Pitch Bend
                    readByte(); readByte();
                } else if (type === 0xA) { // Polyphonic Aftertouch
                    readByte(); readByte();
                } else if (type === 0xD) { // Channel Aftertouch
                    readByte();
                }
            }
            trackIndex++;
        }

        // 按 tick 排序
        events.sort(function(a, b) { return a.tick - b.tick; });

        // 计算每个事件的时间（秒）
        tempoByTick.sort(function(a, b) { return a.tick - b.tick; });
        var tempoIdx = 0;
        var currentTempo = tempoByTick[0].tempo;
        var lastTick = 0;
        var lastTime = 0;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            while (tempoIdx + 1 < tempoByTick.length && tempoByTick[tempoIdx + 1].tick <= e.tick) {
                var segTicks = tempoByTick[tempoIdx + 1].tick - lastTick;
                lastTime += (segTicks / ticksPerBeat) * (currentTempo / 1000000);
                lastTick = tempoByTick[tempoIdx + 1].tick;
                currentTempo = tempoByTick[tempoIdx + 1].tempo;
                tempoIdx++;
            }
            e.time = lastTime + ((e.tick - lastTick) / ticksPerBeat) * (currentTempo / 1000000);
        }

        return events;
    }

    function midiTrackShouldPlay(trackIndex) {
        var st = getMidiTrackState(trackIndex);
        if (st.excluded || st.muted) return false;
        // 检查是否有独奏
        var hasSolo = false;
        for (var idx in N.shared._midiTrackStates) {
            if (N.shared._midiTrackStates[idx].solo) { hasSolo = true; break; }
        }
        if (hasSolo && !st.solo) return false;
        return true;
    }

    function startMidiTrackPlayback() {
        if (!state._midiFile || !state._midiInfo) return;
        stopMidiTrackPlayback();

        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var events = parseMidiFileForPlayback(arrayBuffer, state._midiInfo);
            _midiTrackPlayback.events = events;
            _midiTrackPlayback.duration = state._midiInfo.duration_seconds || 0;
            if (_midiTrackPlayback.duration <= 0 && events.length > 0) {
                _midiTrackPlayback.duration = events[events.length - 1].time || 0;
            }

            var source = getEffectiveMidiSource();
            if (source === 'webmidi') {
                // 尝试 Web MIDI API
                if (navigator.requestMIDIAccess) {
                    navigator.requestMIDIAccess().then(function(access) {
                        var outputs = access.outputs;
                        if (outputs && outputs.size > 0) {
                            _midiTrackPlayback.output = outputs.values().next().value;
                            _midiTrackPlayback.useWebMidi = true;
                            _midiTrackPlayback.backend = 'webmidi';
                            scheduleMidiTrackEvents(events);
                        } else {
                            startMidiTrackFallback(events);
                        }
                    }).catch(function() {
                        startMidiTrackFallback(events);
                    });
                } else {
                    startMidiTrackFallback(events);
                }
            } else {
                startMidiTrackFallback(events);
            }
        };
        reader.readAsArrayBuffer(state._midiFile);
    }

    function scheduleMidiTrackEvents(events) {
        _midiTrackPlayback.playing = true;
        _midiTrackPlayback.startTime = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext().currentTime : performance.now() / 1000;
        _midiTrackPlayback.startTime -= _midiTrackPlayback.pauseTime;
        updateMidiTrackPlayerButtons();

        var backend = _midiTrackPlayback.backend || 'webmidi';
        var out = _midiTrackPlayback.output;
        var programsSent = {};
        var batchSizeMs = 100; // 每 100ms 一个批次，避免创建过多定时器

        // 不在调度时过滤，所有事件都保留，在批次回调中实时检查静音/独奏状态
        // 这样播放过程中切换静音/独奏会立即生效
        var allEvents = events.slice();

        // 按时间分批次调度
        var batches = [];
        for (var j = 0; j < allEvents.length; j++) {
            var ev = allEvents[j];
            var delayMs = Math.max(0, (ev.time - _midiTrackPlayback.pauseTime) * 1000);
            var batchIdx = Math.floor(delayMs / batchSizeMs);
            if (!batches[batchIdx]) batches[batchIdx] = { delayMs: batchIdx * batchSizeMs, events: [] };
            batches[batchIdx].events.push(ev);
        }

        for (var b = 0; b < batches.length; b++) {
            if (!batches[b]) continue;
            var batch = batches[b];
            var t = setTimeout((function(bt) {
                return function() {
                    if (!_midiTrackPlayback.playing) return;
                    if (backend === 'webmidi' && !out) return;
                    for (var k = 0; k < bt.events.length; k++) {
                        var evt = bt.events[k];
                        // 实时检查静音/独奏状态（noteOff 总是发送，确保被静音的音符能停止）
                        var shouldPlay = midiTrackShouldPlay(evt.track);
                        if (evt.type === 'programChange') {
                            if (!shouldPlay) continue;
                            var progKey = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey]) {
                                if (backend === 'webmidi') {
                                    try { out.send([0xC0 | evt.channel, evt.program & 0x7F]); } catch(e) {}
                                }
                                programsSent[progKey] = true;
                            }
                        } else if (evt.type === 'noteOn') {
                            if (!shouldPlay) continue; // 被静音/独奏过滤的音符不触发
                            var progKey2 = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey2]) {
                                var program = findProgramForChannel(evt.track, evt.channel);
                                // channel 9 (鼓组) 返回 null, 跳过 programChange 以保持鼓组模式
                                if (program !== null && backend === 'webmidi') {
                                    try { out.send([0xC0 | evt.channel, program & 0x7F]); } catch(e) {}
                                }
                                programsSent[progKey2] = true;
                            }
                            if (backend === 'webmidi') {
                                try { out.send([0x90 | evt.channel, evt.note & 0x7F, evt.velocity & 0x7F]); } catch(e) {}
                            }
                        } else if (evt.type === 'noteOff') {
                            // noteOff 总是发送，防止音符卡住
                            if (backend === 'webmidi') {
                                try { out.send([0x80 | evt.channel, evt.note & 0x7F, 0]); } catch(e) {}
                            }
                        }
                    }
                };
            })(batch), batch.delayMs);
            _midiTrackPlayback.scheduled.push({ timeout: t });
        }

        // 进度条动画
        function tick() {
            if (!_midiTrackPlayback.playing) return;
            var ctx2 = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
            var now = ctx2 ? ctx2.currentTime : (performance.now() / 1000);
            var current = now - _midiTrackPlayback.startTime;
            updateMidiTrackProgressUI(current);
            if (current >= _midiTrackPlayback.duration) {
                stopMidiTrackPlayback();
                _midiTrackPlayback.pauseTime = 0;
                updateMidiTrackProgressUI(0);
                return;
            }
            _midiTrackPlayback.rafId = requestAnimationFrame(tick);
        }
        _midiTrackPlayback.rafId = requestAnimationFrame(tick);

        // 自动停止
        var endDelay = Math.max(0, (_midiTrackPlayback.duration - _midiTrackPlayback.pauseTime) * 1000) + 300;
        var endT = setTimeout(function() {
            stopMidiTrackPlayback();
        }, endDelay);
        _midiTrackPlayback.scheduled.push({ timeout: endT });
    }

    function findProgramForChannel(trackIndex, channel) {
        // 鼓组通道 (channel 9) 不需要 programChange, 返回 null 表示跳过
        // 发送 programChange 到 channel 9 会破坏鼓组模式, 导致鼓音符无声
        if (channel === 9) return null;
        var events = _midiTrackPlayback.events;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (e.track === trackIndex && e.channel === channel && e.type === 'programChange') {
                return e.program;
            }
        }
        // 查找全局该通道的第一个 program
        for (var j = 0; j < events.length; j++) {
            var e2 = events[j];
            if (e2.channel === channel && e2.type === 'programChange') {
                return e2.program;
            }
        }
        return 0;
    }

    function startMidiTrackFallback(events) {
        // 真正需要播放 MIDI 音符时: 按设置触发音色库下载/询问
        ensureSoundfontOnDemand();
        var synth = getTinySynth();
        if (!synth) {
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。', 'error');
            return;
        }

        _midiTrackPlayback.playing = true;
        _midiTrackPlayback.useWebMidi = false;
        _midiTrackPlayback.backend = 'tinysynth';
        updateMidiTrackPlayerButtons();

        var synthCtx = synth.getAudioContext ? synth.getAudioContext() : null;
        if (!synthCtx) synthCtx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (!synthCtx) {
            showMidiNotice('音频上下文未就绪，无法试听。', 'error');
            _midiTrackPlayback.playing = false;
            updateMidiTrackPlayerButtons();
            return;
        }
        _midiTrackPlayback.startTime = synthCtx.currentTime;
        _midiTrackPlayback.startTime -= _midiTrackPlayback.pauseTime;

        try { synth.reset(); } catch(ex) {}

        var programsSent = {};
        var batchSizeMs = 100; // 每 100ms 一个批次

        // 不在调度时过滤，所有事件都保留，在批次回调中实时检查静音/独奏状态
        // 这样播放过程中切换静音/独奏会立即生效
        var allEvents = events.slice();

        // 按时间分批次，每批一次性用 Web Audio 精确时间发送
        var batches = [];
        for (var j = 0; j < allEvents.length; j++) {
            var ev = allEvents[j];
            var delayMs = Math.max(0, (ev.time - _midiTrackPlayback.pauseTime) * 1000);
            var batchIdx = Math.floor(delayMs / batchSizeMs);
            if (!batches[batchIdx]) batches[batchIdx] = { baseDelayMs: batchIdx * batchSizeMs, events: [] };
            batches[batchIdx].events.push(ev);
        }

        for (var b = 0; b < batches.length; b++) {
            if (!batches[b]) continue;
            var batch = batches[b];
            var t = setTimeout((function(bt) {
                return function() {
                    if (!_midiTrackPlayback.playing) return;
                    for (var k = 0; k < bt.events.length; k++) {
                        var evt = bt.events[k];
                        // 实时检查静音/独奏状态（noteOff 总是发送，确保被静音的音符能停止）
                        var shouldPlay = midiTrackShouldPlay(evt.track);
                        var delaySec = Math.max(0, evt.time - _midiTrackPlayback.pauseTime);
                        var sendT = _midiTrackPlayback.startTime + delaySec;
                        if (evt.type === 'programChange') {
                            if (!shouldPlay) continue;
                            var progKey = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey]) {
                                try { synth.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F], sendT); } catch(ex) {}
                                programsSent[progKey] = true;
                            }
                        } else if (evt.type === 'noteOn') {
                            if (!shouldPlay) continue; // 被静音/独奏过滤的音符不触发
                            var progKey2 = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey2]) {
                                var program2 = findProgramForChannel(evt.track, evt.channel);
                                // channel 9 (鼓组) 返回 null, 跳过 programChange 以保持鼓组模式
                                if (program2 !== null) {
                                    try { synth.send([0xC0 | (evt.channel & 0x0F), program2 & 0x7F], sendT - 0.001); } catch(ex) {}
                                }
                                programsSent[progKey2] = true;
                            }
                            try { synth.send([0x90 | (evt.channel & 0x0F), evt.note & 0x7F, (evt.velocity || 100) & 0x7F], sendT); } catch(ex) {}
                        } else if (evt.type === 'noteOff') {
                            // noteOff 总是发送，防止音符卡住
                            try { synth.send([0x80 | (evt.channel & 0x0F), evt.note & 0x7F, 0], sendT); } catch(ex) {}
                        }
                    }
                };
            })(batch), batch.baseDelayMs);
            _midiTrackPlayback.scheduled.push({ timeout: t });
        }

        function tick() {
            if (!_midiTrackPlayback.playing) return;
            var current = synthCtx.currentTime - _midiTrackPlayback.startTime;
            updateMidiTrackProgressUI(current);
            if (current >= _midiTrackPlayback.duration) {
                stopMidiTrackPlayback();
                _midiTrackPlayback.pauseTime = 0;
                updateMidiTrackProgressUI(0);
                return;
            }
            _midiTrackPlayback.rafId = requestAnimationFrame(tick);
        }
        _midiTrackPlayback.rafId = requestAnimationFrame(tick);

        var endDelay = Math.max(0, (_midiTrackPlayback.duration - _midiTrackPlayback.pauseTime) * 1000) + 300;
        var endT = setTimeout(function() {
            stopMidiTrackPlayback();
        }, endDelay);
        _midiTrackPlayback.scheduled.push({ timeout: endT });
    }

    function pauseMidiTrackPlayback() {
        if (!_midiTrackPlayback.playing) return;
        var ctx = null;
        if (_midiTrackPlayback.useWebMidi) {
            ctx = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
        } else {
            var synth = getTinySynth();
            ctx = synth && synth.getAudioContext ? synth.getAudioContext() : null;
            if (!ctx) ctx = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
        }
        var now = ctx ? ctx.currentTime : (performance.now() / 1000);
        _midiTrackPlayback.pauseTime = now - _midiTrackPlayback.startTime;
        stopMidiTrackPlayback(false);
        updateMidiTrackProgressUI(_midiTrackPlayback.pauseTime);
    }

    // ---- 导出 ----
    N.renderMidiTrackRow = renderMidiTrackRow;
    N.renderAllMidiTrackRows = renderAllMidiTrackRows;
    N.buildMidiTrackRows = buildMidiTrackRows;
    N.bindMidiTrackButtons = bindMidiTrackButtons;
    N.initMidiTrackMiniRolls = initMidiTrackMiniRolls;
    N.updateMidiTrackMiniRollsPlayhead = updateMidiTrackMiniRollsPlayhead;
    N.updateMidiTrackRollTime = updateMidiTrackRollTime;
    N.updateMidiTrackPlayerButtons = updateMidiTrackPlayerButtons;
    N.formatMidiTrackTime = formatMidiTrackTime;
    N.updateMidiTrackProgressDuration = updateMidiTrackProgressDuration;
    N.updateMidiTrackProgressUI = updateMidiTrackProgressUI;
    N.initMidiTrackPlayer = initMidiTrackPlayer;
    N.parseMidiFileForPlayback = parseMidiFileForPlayback;
    N._convertToneEventsForPlayback = _convertToneEventsForPlayback;
    N._tickToSeconds = _tickToSeconds;
    N._parseMidiFileForPlaybackFallback = _parseMidiFileForPlaybackFallback;
    N.midiTrackShouldPlay = midiTrackShouldPlay;
    N.startMidiTrackPlayback = startMidiTrackPlayback;
    N.scheduleMidiTrackEvents = scheduleMidiTrackEvents;
    N.findProgramForChannel = findProgramForChannel;
    N.startMidiTrackFallback = startMidiTrackFallback;
    N.pauseMidiTrackPlayback = pauseMidiTrackPlayback;
    N._midiTrackMiniRolls = _midiTrackMiniRolls;
})(window.WebNBS);
