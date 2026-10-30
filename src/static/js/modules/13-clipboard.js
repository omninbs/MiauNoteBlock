/* 13-clipboard.js — MiauNoteBlock 功能模块
   来源: 原 main.js L7213-L7566; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function mutedSoloToLock() { return N.mutedSoloToLock.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function setLayerLock() { return N.setLayerLock.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function stopUnaudibleTrackAudio() { return N.stopUnaudibleTrackAudio.apply(this, arguments); }
    function syncPianoRollTrackInfo() { return N.syncPianoRollTrackInfo.apply(this, arguments); }
    function syncSoloLayersToSong() { return N.syncSoloLayersToSong.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }


    function handlePaste(targetTick, targetLayer) {
        if (!state.pianoRoll || !state.pianoRoll.hasClipboard()) return;
        pushUndo();
        var clipboard = state.pianoRoll.clipboard;
        if (!clipboard || clipboard.length === 0) return;
        var minTick = Math.min.apply(null, clipboard.map(function(n) { return n.tick; }));
        var minLayer = Math.min.apply(null, clipboard.map(function(n) { return n.layer; }));
        var offsetTick, offsetLayer;
        if (typeof targetTick === 'number') {
            offsetTick = targetTick - minTick;
        } else {
            // 优先使用鼠标所在格子作为粘贴起点
            if (state.pianoRoll._lastMouseX != null && state.pianoRoll._lastMouseY != null) {
                var mouseTick = state.pianoRoll._screenToTick(state.pianoRoll._lastMouseX);
                var mouseLayer = state.pianoRoll._screenToLayer(state.pianoRoll._lastMouseY);
                offsetTick = mouseTick - minTick;
                offsetLayer = mouseLayer - minLayer;
            } else {
                offsetTick = state.currentTick - minTick;
                var selNotes = state.pianoRoll.getSelectedNotes();
                if (selNotes.length > 0) {
                    offsetTick = selNotes[0].tick + 1 - minTick;
                }
                offsetLayer = 0;
            }
        }
        if (typeof targetLayer === 'number') {
            offsetLayer = targetLayer - minLayer;
        }
        state.pianoRoll.paste(offsetTick, offsetLayer);
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
    }

    function handlePasteOrSystemClipboard(targetTick, targetLayer) {
        if (state.pianoRoll && state.pianoRoll.hasClipboard()) {
            handlePaste(targetTick, targetLayer);
            return;
        }
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(text) {
                if (text && text.trim()) {
                    handleTextClipboardPaste(text);
                } else {
                    showSmallTip('Clipboard has no readable MIDI notes.');
                }
            }).catch(function() {
                showSmallTip('Use Ctrl+V to paste external MIDI data, or copy notes inside MiauNoteBlock first.');
            });
            return;
        }
        showSmallTip('Use Ctrl+V to paste external MIDI data, or copy notes inside MiauNoteBlock first.');
    }

    // 监听系统剪贴板，支持粘贴外部 MIDI 数据（桌面端 DAW 复制）
    function initClipboardPaste() {
        document.addEventListener('paste', function(e) {
            // 输入框中不拦截
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                return;
            }
            // 片段编辑模式下, 粘贴由片段剪贴板处理 (Ctrl+V), 不走外部 MIDI 粘贴
            if (state.segmentsEditMode) return;
            var cd = e.clipboardData;
            if (!cd || !cd.items) return;
            var midiItem = null;
            var textItem = null;
            var audioItem = null;
            for (var i = 0; i < cd.items.length; i++) {
                var t = cd.items[i].type;
                if (t === 'audio/midi' || t === 'audio/x-midi' || t === 'application/x-midi' || t === 'application/midi' || t === 'application/octet-stream') {
                    midiItem = cd.items[i];
                } else if (t === 'text/plain') {
                    textItem = cd.items[i];
                } else if (t && t.indexOf('audio/') === 0) {
                    audioItem = cd.items[i];
                }
            }
            if (midiItem) {
                e.preventDefault();
                var blob = midiItem.getAsFile();
                if (blob) handleMidiClipboardPaste(blob);
            } else if (textItem) {
                // 暂不处理纯文本 MIDI 数据
            }
        });
    }

    function initExternalClipboardPaste() {
        document.addEventListener('paste', function(e) {
            if (e.defaultPrevented) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            var cd = e.clipboardData;
            if (!cd || !cd.items) return;
            var textItem = null;
            var audioItem = null;
            for (var i = 0; i < cd.items.length; i++) {
                var type = cd.items[i].type || '';
                if (type === 'text/plain') textItem = cd.items[i];
                else if (type.indexOf('audio/') === 0) audioItem = cd.items[i];
            }
            if (textItem) {
                e.preventDefault();
                textItem.getAsString(function(text) {
                    handleTextClipboardPaste(text);
                });
            } else if (audioItem) {
                e.preventDefault();
                showSmallTip('Audio clips do not contain convertible MIDI notes. Copy MIDI notes or MIDI clips instead.');
            }
        });
    }

    function showSmallTip(message) {
        var tip = document.createElement('div');
        tip.textContent = message;
        tip.style.cssText = 'position:fixed;left:50%;bottom:72px;z-index:100600;transform:translateX(-50%);'
            + 'max-width:min(92vw,420px);padding:8px 12px;border-radius:10px;background:rgba(20,20,32,0.94);'
            + 'border:1px solid rgba(255,255,255,0.12);box-shadow:0 10px 28px rgba(0,0,0,0.35);'
            + 'color:#fff;font-size:12px;line-height:1.35;text-align:center;pointer-events:none;opacity:0;'
            + 'transition:opacity 140ms ease, transform 140ms ease;';
        document.body.appendChild(tip);
        requestAnimationFrame(function() {
            tip.style.opacity = '1';
            tip.style.transform = 'translateX(-50%) translateY(-4px)';
        });
        setTimeout(function() {
            tip.style.opacity = '0';
            tip.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 180);
        }, 2200);
    }

    function handleTextClipboardPaste(text) {
        if (!text || !text.trim()) return;
        var midiBlob = tryDecodeMidiText(text);
        if (midiBlob) {
            handleMidiClipboardPaste(midiBlob);
            return;
        }
        var notes = parseTextNotes(text);
        if (notes && notes.length > 0) {
            mergeMidiNotes(notes);
            return;
        }
        if (/fl studio|fruity|midi|score|piano roll|pattern|clip/i.test(text)) {
            showSmallTip('FL Studio private clipboard data is not exposed to browsers. Copy MIDI notes or export/drop a MIDI file.');
        }
    }

    function tryDecodeMidiText(text) {
        var s = text.trim();
        if (s.indexOf('data:audio/midi;base64,') === 0 || s.indexOf('data:audio/x-midi;base64,') === 0) {
            s = s.substring(s.indexOf(',') + 1);
        }
        if (s.indexOf('TVRoZ') !== 0 && s.indexOf('MThd') !== 0) return null;
        try {
            var bin = atob(s.replace(/\s+/g, ''));
            if (bin.substring(0, 4) !== 'MThd') return null;
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Blob([bytes], { type: 'audio/midi' });
        } catch(e) {
            return null;
        }
    }

    function noteNameToMidi(name) {
        var m = String(name || '').trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
        if (!m) return null;
        var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
        if (m[2] === '#') base += 1;
        if (m[2] === 'b') base -= 1;
        return (parseInt(m[3], 10) + 1) * 12 + base;
    }

    function parseTextNotes(text) {
        var lines = text.split(/\r?\n/);
        var notes = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || /^[#;]/.test(line)) continue;
            var parts = line.split(/[\t,; ]+/).filter(Boolean);
            if (parts.length < 3) continue;
            var midi = noteNameToMidi(parts[0]);
            if (midi === null) midi = parseInt(parts[0], 10);
            if (isNaN(midi) || midi < 0 || midi > 127) continue;
            var tick = parseFloat(parts[1]);
            var layer = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;
            var velocity = parts[4] !== undefined ? parseInt(parts[4], 10) : 100;
            if (!isFinite(tick)) continue;
            notes.push({
                tick: Math.max(0, Math.round(tick)),
                layer: Math.max(0, layer || 0),
                instrument: 0,
                key: Math.max(0, Math.min(87, Math.round(midi) - 21)),
                velocity: Math.max(1, Math.min(100, Math.round(velocity / 127 * 100) || 80)),
                pan: 50,
                pitch: 0
            });
        }
        return notes;
    }

    function handleMidiClipboardPaste(blob) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var file = new File([arrayBuffer], 'clipboard.mid', { type: 'audio/midi' });
            var settings = {
                channel_instruments: {}, channel_octaves: {}, channel_keys: {},
                percussion_instruments: {}, percussion_pitches: {},
                remove_silent: true, name_layers: false, name_after_patches: false,
                same_tempo: true,
                read_velocity: true, precision: 1,
                keep_note_length: 'none', timbre_fitting: {}, percussion_fitting: {}
            };
            API.importMidi(file, settings, function() {}).then(function(data) {
                if (data.song && data.song.notes && data.song.notes.length > 0) {
                    mergeMidiNotes(data.song.notes);
                } else {
                    showAppAlert('MIDI 中没有可导入的音符', {
                        title: '提示',
                        icon: 'fa-solid fa-circle-info'
                    });
                }
            }).catch(function(err) {
                // 粘贴时 MIDI 弹窗未打开, showMidiNotice 不可见
                showAppAlert('MIDI 粘贴失败: ' + formatError(err, '无法解析'), {
                    title: '粘贴失败',
                    icon: 'fa-solid fa-triangle-exclamation'
                });
            });
        };
        reader.readAsArrayBuffer(blob);
    }

    function mergeMidiNotes(notes) {
        if (!state.pianoRoll || !notes || notes.length === 0) return;
        pushUndo();
        var minTick = Math.min.apply(null, notes.map(function(n) { return n.tick; }));
        var offsetTick = state.currentTick - minTick;
        for (var i = 0; i < notes.length; i++) {
            var src = notes[i];
            state.pianoRoll.notes.push({
                id: state.pianoRoll._nextId(),
                tick: src.tick + offsetTick,
                layer: src.layer,
                instrument: src.instrument,
                key: Math.max(0, Math.min(87, src.key)),
                velocity: src.velocity,
                pan: src.pan,
                pitch: src.pitch
            });
        }
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
        state.pianoRoll.render();
    }

    function handleDuplicate() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        pushUndo();
        state.pianoRoll.duplicateSelected();
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
    }

    function handleArrowKey(key) {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        pushUndo();

        var tickDelta = 0, layerDelta = 0;
        if (key === 'ArrowLeft') tickDelta = -1;
        if (key === 'ArrowRight') tickDelta = 1;
        if (key === 'ArrowUp') layerDelta = 1;
        if (key === 'ArrowDown') layerDelta = -1;

        for (var i = 0; i < state.notes.length; i++) {
            var n = state.notes[i];
            if (state.pianoRoll.selectedNotes[n.id]) {
                n.tick = Math.max(0, n.tick + tickDelta);
                n.layer = Math.max(0, Math.min(87, n.layer + layerDelta));
                // 注意: 不修改 n.key, 保持音符原音调
            }
        }
        // 移除被覆盖的音符
        state.pianoRoll._removeOverlappedNotes();
        state.pianoRoll.render();
        state.notes = state.pianoRoll.getNotes();
        updateProgressUI();
        markDirty();
    }

    function toggleMuteSelectedTrack() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        var layer = sel[0].layer;
        var track = findTrackByLayer(layer);
        if (!track) return;
        pushUndo();
        track.muted = !track.muted;
        setLayerLock(layer, mutedSoloToLock(track.muted, track.solo));
        stopUnaudibleTrackAudio();
        syncSoloLayersToSong();
        syncPianoRollTrackInfo();
        updateTrackPanelUI();
        markDirty();
    }

    function toggleSoloSelectedTrack() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        var layer = sel[0].layer;
        var track = findTrackByLayer(layer);
        if (!track) return;
        pushUndo();
        track.solo = !track.solo;
        state.soloActive = track.solo;
        // 如果关闭 solo，清除所有 solo
        if (!state.soloActive) {
            for (var j = 0; j < state.tracks.length; j++) {
                state.tracks[j].solo = false;
                setLayerLock(state.tracks[j].layer, mutedSoloToLock(state.tracks[j].muted, false));
            }
        } else {
            setLayerLock(layer, mutedSoloToLock(track.muted, track.solo));
        }
        stopUnaudibleTrackAudio();
        syncSoloLayersToSong();
        syncPianoRollTrackInfo();
        updateTrackPanelUI();
        markDirty();
    }

    function isTrackAudible(track) {
        if (state.soloActive) {
            return !!track.solo;
        }
        return !track.muted;
    }

    // ---- 导出 ----
    N.handlePaste = handlePaste;
    N.handlePasteOrSystemClipboard = handlePasteOrSystemClipboard;
    N.initClipboardPaste = initClipboardPaste;
    N.initExternalClipboardPaste = initExternalClipboardPaste;
    N.showSmallTip = showSmallTip;
    N.handleTextClipboardPaste = handleTextClipboardPaste;
    N.tryDecodeMidiText = tryDecodeMidiText;
    N.noteNameToMidi = noteNameToMidi;
    N.parseTextNotes = parseTextNotes;
    N.handleMidiClipboardPaste = handleMidiClipboardPaste;
    N.mergeMidiNotes = mergeMidiNotes;
    N.handleDuplicate = handleDuplicate;
    N.handleArrowKey = handleArrowKey;
    N.toggleMuteSelectedTrack = toggleMuteSelectedTrack;
    N.toggleSoloSelectedTrack = toggleSoloSelectedTrack;
    N.isTrackAudible = isTrackAudible;
})(window.WebNBS);
