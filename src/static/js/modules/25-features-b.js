/* 25-features-b.js — MiauNoteBlock 功能模块
   来源: 原 main.js L12571-L13551; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    var _appDialogStack = N._appDialogStack;
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }
    function applySubstituteToNote() { return N.applySubstituteToNote.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }
    function getKeyboardLabelForNbsKey() { return N.getKeyboardLabelForNbsKey.apply(this, arguments); }
    function getNbsKeyDisplayLabel() { return N.getNbsKeyDisplayLabel.apply(this, arguments); }
    function getNbsKeyOctave() { return N.getNbsKeyOctave.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function loadSubstituteConfig() { return N.loadSubstituteConfig.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function nbsKeyToMidiNote() { return N.nbsKeyToMidiNote.apply(this, arguments); }
    function openSubstituteSettings() { return N.openSubstituteSettings.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function saveNumpadRangeSettings() { return N.saveNumpadRangeSettings.apply(this, arguments); }
    function saveSubstituteConfig() { return N.saveSubstituteConfig.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updatePianoKeyboardHighlight() { return N.updatePianoKeyboardHighlight.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }

    function showSustainFillAlert(message, title) {
        showAppAlert(message, {title: title || '延音填充', icon: 'fa-solid fa-circle-info', okText: '知道了'});
    }

    // 实际执行延音填充
    // 按行处理选中音符：在相邻原音符之间的空隙内，用前一个音符的音调/音色/音量填充，
    // 最后一个音符向后延长 4 个 tick。
    function applySustainFill(interval) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length < 2) {
            showSustainFillAlert('未选中有效音符');
            return;
        }

        pushUndo();

        // 按 layer 分组, 每组内按 tick 排序
        var byLayer = {};
        for (var i = 0; i < selected.length; i++) {
            var n = selected[i];
            if (!byLayer[n.layer]) byLayer[n.layer] = [];
            byLayer[n.layer].push(n);
        }
        for (var L in byLayer) {
            byLayer[L].sort(function(a, b) { return a.tick - b.tick; });
        }

        // 建立已有音符位置映射, 避免覆盖
        var noteMap = {};
        function mapKey(t, l) { return t + ':' + l; }
        for (var i = 0; i < notes.length; i++) {
            noteMap[mapKey(notes[i].tick, notes[i].layer)] = true;
        }

        var addedCount = 0;
        var step = 1 + Math.max(0, interval);

        for (var layerId in byLayer) {
            var list = byLayer[layerId];
            var layerNum = parseInt(layerId);

            // 在相邻原音符之间填充
            for (var idx = 0; idx < list.length - 1; idx++) {
                var a = list[idx];
                var b = list[idx + 1];
                var t = a.tick + step;
                while (t < b.tick) {
                    var k = mapKey(t, layerNum);
                    if (!noteMap[k]) {
                        notes.push({
                            tick: t,
                            layer: layerNum,
                            instrument: a.instrument,
                            key: a.key,
                            velocity: a.velocity,
                            pan: a.pan,
                            pitch: a.pitch
                        });
                        noteMap[k] = true;
                        addedCount++;
                    }
                    t += step;
                }
            }

            // 最后一个音符向后延长 4 个 tick
            var last = list[list.length - 1];
            var t = last.tick + step;
            var endTick = last.tick + 4;
            while (t <= endTick) {
                var k = mapKey(t, layerNum);
                if (!noteMap[k]) {
                    notes.push({
                        tick: t,
                        layer: layerNum,
                        instrument: last.instrument,
                        key: last.key,
                        velocity: last.velocity,
                        pan: last.pan,
                        pitch: last.pitch
                    });
                    noteMap[k] = true;
                    addedCount++;
                }
                t += step;
            }
        }

        // 应用回 piano roll
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        if (addedCount === 0) {
            showSustainFillAlert('没有添加任何音符 (可能选中区间已满)');
        } else {
            console.log('[Sustain Fill] 间隔=' + interval + ', 填充了 ' + addedCount + ' 个音符');
        }
    }

    // ============ 清除延音 ============
    function showClearSustainDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) {
            showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用清除延音。', '清除延音');
            return;
        }

        var existing = $('clear-sustain-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="clear-sustain-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-eraser"></i>'
            + '<h4>清除延音</h4>'
            + '<button class="settings-close-btn" id="clear-sustain-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>按音轨处理选中的音符，把同一音轨里连续重复的音符截短，并在每组音符之间保留固定的空 tick 数。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '例子 (留空长度 = 2)：<br>'
            + '11111O2222OOO333444666 &rarr; 1111OO2222OOO3OO4OO6OO<br>'
            + '11OOO2223333 &rarr; 11OOO2OO33OO'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">留空长度 (空 tick 数)：</label>'
            + '<input type="number" id="clear-sustain-gap" min="0" max="16" value="2" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">0 = 只删除同 tick 的完全重复音符；推荐 1-3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="clear-sustain-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="clear-sustain-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('clear-sustain-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#clear-sustain-close-x').addEventListener('click', close);
        wrapper.querySelector('#clear-sustain-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#clear-sustain-ok-btn').addEventListener('click', function() {
            var gap = parseInt(wrapper.querySelector('#clear-sustain-gap').value);
            if (isNaN(gap) || gap < 0) gap = 0;
            if (gap > 16) gap = 16;
            applyClearSustain(gap);
            close();
        });

        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    // 清除延音核心逻辑 (供「清除延音」对话框与「功能菜单 → 片段分割」共用)
    // 按音轨分组，把同一音轨内连续重复的音符截短，保证相邻两组之间至少留出 gap 个空 tick
    // targetNotes: 参与处理的音符 (通常为选中音符; 整曲处理时传全部音符)
    // 返回 { notes: 处理后的全部音符, removed: 删除数量 }
    function trimSustainNotes(allNotes, targetNotes, gap) {
        var byLayer = {};
        for (var i = 0; i < targetNotes.length; i++) {
            var n = targetNotes[i];
            if (!byLayer[n.layer]) byLayer[n.layer] = [];
            byLayer[n.layer].push(n);
        }
        for (var L in byLayer) {
            if (byLayer.hasOwnProperty(L)) {
                byLayer[L].sort(function(a, b) { return a.tick - b.tick; });
            }
        }

        var removeIds = {};

        for (var layerId in byLayer) {
            if (!byLayer.hasOwnProperty(layerId)) continue;
            var list = byLayer[layerId];
            // 把连续且 key+instrument 相同的音符归为一组
            var runs = [];
            var runStart = 0;
            while (runStart < list.length) {
                var runEnd = runStart + 1;
                while (runEnd < list.length &&
                       list[runEnd].tick === list[runEnd - 1].tick + 1 &&
                       list[runEnd].key === list[runStart].key &&
                       list[runEnd].instrument === list[runStart].instrument) {
                    runEnd++;
                }
                runs.push({ start: runStart, end: runEnd, startTick: list[runStart].tick });
                runStart = runEnd;
            }

            for (var r = 0; r < runs.length; r++) {
                var run = runs[r];
                var runLen = run.end - run.start;
                var keepCount;
                if (r < runs.length - 1) {
                    var nextStartTick = runs[r + 1].startTick;
                    // 要保证下一组开始前有 gap 个空 tick
                    keepCount = Math.min(runLen, Math.max(1, nextStartTick - gap - run.startTick));
                } else {
                    // 最后一组：尾部也留出 gap 个空 tick
                    keepCount = runLen <= gap ? runLen : Math.max(1, runLen - gap);
                }
                for (var idx = run.start + keepCount; idx < run.end; idx++) {
                    removeIds[list[idx].id] = true;
                }
            }
        }

        var out = [];
        for (var j = 0; j < allNotes.length; j++) {
            if (!removeIds[allNotes[j].id]) out.push(allNotes[j]);
        }
        return { notes: out, removed: Object.keys(removeIds).length };
    }

    // 实际执行清除延音 (仅处理选中音符)
    function applyClearSustain(gap) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) return;

        pushUndo();

        var res = trimSustainNotes(notes, selected, gap);
        var newNotes = res.notes;

        state.pianoRoll.setNotes(newNotes);
        state.notes = newNotes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        console.log('[Clear Sustain] 留空=' + gap + ', 删除了 ' + res.removed + ' 个音符');
    }

    // ============ 上下起伏（跨音轨规律分布） ============
    function showArpeggioTracksDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) {
            showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用上下起伏。', '上下起伏');
            return;
        }

        var existing = $('arpeggio-tracks-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="arpeggio-tracks-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-arrow-up-right-dots"></i>'
            + '<h4>上下起伏</h4>'
            + '<button class="settings-close-btn" id="arpeggio-tracks-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>将选中的音符按时间顺序依次分配到不同音轨，形成跨音轨的起伏规律。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '规律使用“|”分隔，数字代表相对于选择区域的第几条音轨。<br>'
            + '例如 <b>1|2|1|3</b>：第1个音符放到第1轨，第2个放到第2轨，第3个回到第1轨，第4个放到第3轨，然后循环。'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">规律：</label>'
            + '<input type="text" id="arpeggio-tracks-pattern" value="1|2|1|3" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">用“|”分隔正整数，如 1|2|1|3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="arpeggio-tracks-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="arpeggio-tracks-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('arpeggio-tracks-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#arpeggio-tracks-close-x').addEventListener('click', close);
        wrapper.querySelector('#arpeggio-tracks-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#arpeggio-tracks-ok-btn').addEventListener('click', function() {
            var pattern = wrapper.querySelector('#arpeggio-tracks-pattern').value;
            applyArpeggioTracks(pattern);
            close();
        });

        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    // 实际执行上下起伏
    function applyArpeggioTracks(patternStr) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) return;

        // 解析规律
        var parts = patternStr.split('|');
        var pattern = [];
        for (var p = 0; p < parts.length; p++) {
            var val = parseInt(parts[p].trim());
            if (!isNaN(val) && val > 0) pattern.push(val);
        }
        if (pattern.length === 0) {
            showSustainFillAlert('规律格式错误，请使用“|”分隔正整数，例如 1|2|1|3。', '上下起伏');
            return;
        }

        pushUndo();

        // 按时间顺序排列选中音符（同 tick 时按 layer 排序）
        selected.sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.layer - b.layer;
        });

        // 基准音轨：选择区域里最上面的音轨
        var baseLayer = selected[0].layer;
        for (var s = 1; s < selected.length; s++) {
            if (selected[s].layer < baseLayer) baseLayer = selected[s].layer;
        }

        // 计算目标最大音轨，必要时扩展工程层数
        var maxOffset = 0;
        for (var o = 0; o < pattern.length; o++) {
            if (pattern[o] - 1 > maxOffset) maxOffset = pattern[o] - 1;
        }
        var maxTargetLayer = baseLayer + maxOffset;
        ensureLayerCount(maxTargetLayer + 1);

        var selectedIds = {};
        for (var k = 0; k < selected.length; k++) selectedIds[selected[k].id] = true;

        // 记录未选中音符占用的位置
        var occupied = {};
        for (var i = 0; i < notes.length; i++) {
            if (!selectedIds[notes[i].id]) {
                occupied[notes[i].tick + '_' + notes[i].layer] = true;
            }
        }

        var newNotes = [];
        // 未选中音符保持不动
        for (var j = 0; j < notes.length; j++) {
            if (!selectedIds[notes[j].id]) newNotes.push(notes[j]);
        }

        var movedIds = [];
        for (var idx = 0; idx < selected.length; idx++) {
            var note = selected[idx];
            var offset = pattern[idx % pattern.length] - 1;
            var targetLayer = baseLayer + offset;
            var posKey = note.tick + '_' + targetLayer;

            if (!occupied[posKey]) {
                note.layer = targetLayer;
                occupied[posKey] = true;
            }
            // 若目标位置已被未选中音符占用，则保留在原音轨
            newNotes.push(note);
            movedIds.push(note.id);
        }

        state.pianoRoll.setNotes(newNotes);
        state.notes = newNotes;
        // 保持选中状态
        state.pianoRoll.selectNotes(movedIds);
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        updateTrackPanelUI();
        state.pianoRoll.render();

        console.log('[Arpeggio Tracks] 规律=' + pattern.join('|') + ', 处理了 ' + selected.length + ' 个音符');
    }

    // 确保工程的 layer 数量至少为 count
    function ensureLayerCount(count) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length < count) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }
        if (state.pianoRoll) state.pianoRoll.trackCount = state.song.layers.length;
    }

    // 转8度内：将所有超出 Minecraft 标准音域 (33~57) 的音符按八度折叠回该范围
    // 逻辑与 MIDI 导入时的 keep_octave 一致：小于 33 反复加 12，大于 57 反复减 12，最后钳制到 0~87
    function applyTransposeToOctaveRange() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (!notes || notes.length === 0) return;

        pushUndo();

        var MIN = 33;
        var MAX = 57;
        var NBS_MIN = 0;
        var NBS_MAX = 87;
        var changed = 0;

        for (var i = 0; i < notes.length; i++) {
            var note = notes[i];
            if (typeof note.key !== 'number') continue;
            var newKey = note.key;
            if (newKey < MIN) {
                while (newKey < MIN) newKey += 12;
                changed++;
            } else if (newKey > MAX) {
                while (newKey > MAX) newKey -= 12;
                changed++;
            }
            // 保险钳制，确保仍在 NBS 可播放范围
            if (newKey < NBS_MIN) newKey = NBS_MIN;
            if (newKey > NBS_MAX) newKey = NBS_MAX;
            note.key = newKey;
        }

        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        showSustainFillAlert('已处理 ' + changed + ' 个音符，超出 Minecraft 标准音域的音符已按八度折叠。', '转8度内');
        console.log('[Transpose Octave] 处理了 ' + changed + ' 个音符');
    }

    // Applies the same three-stage idea as MIDI import to existing NBS tracks.
    function showRangeProcessDialog() {
        if (!state.song || !state.song.layers || !state.notes || state.notes.length === 0) {
            showAppAlert('当前没有可处理的音符。', {title: '音域处理'});
            return;
        }
        var overlay = _appDialogOverlay();
        var t = i18nText;
        var box = _appDialogBox(t('音域处理'), '', 'fa-solid fa-sliders', {maxWidth: 640});
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        body.style.whiteSpace = 'normal';
        body.innerHTML = '<p style="margin:0 0 8px;color:var(--text-secondary);font-size:12px;">' + t('目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。') + '</p>'
            + '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' + t('偏移转换') + ' <select id="range-mode" class="settings-control"><option value="0">' + t('不启用') + '</option><option value="1">' + t('单独音符归一法') + '</option><option value="2">' + t('整体八度偏移法') + '</option><option value="3">' + t('整体音调偏移法') + '</option></select></label>'
            + '<label id="range-key-bias-row" style="display:none;align-items:center;gap:8px;margin-bottom:8px;">' + t('同分偏移') + ' <select id="range-key-bias" class="settings-control"><option value="major">' + t('优先大调') + '</option><option value="minor">' + t('优先小调') + '</option></select></label>'
            + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">'
            + '<label style="display:flex;align-items:center;gap:8px;margin:0;"><input type="checkbox" id="range-substitute" checked> ' + t('启用音色替代') + '</label>'
            + '<button id="range-substitute-settings" style="padding:2px 10px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-primary);cursor:pointer;">' + t('音色替代设置') + '</button>'
            + '<button id="range-substitute-reset" style="padding:2px 10px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-secondary);cursor:pointer;">' + t('恢复默认替代') + '</button>'
            + '</div>'
            + '<label style="display:block;margin-bottom:10px;"><input type="checkbox" id="range-force-fold"> ' + t('强制转音域内') + '</label>'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;"><strong style="font-size:12px;">' + t('应用音轨') + '</strong><label style="font-size:11px;"><input type="checkbox" id="range-all-tracks" checked> ' + t('全部') + '</label></div>'
            + '<div id="range-track-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:4px;max-height:170px;overflow:auto;padding:6px;border-radius:6px;background:var(--ctrl-fill-tertiary);"></div>';
        var trackList = body.querySelector('#range-track-list');
        for (var i = 0; i < state.song.layers.length; i++) {
            var layer = state.song.layers[i] || {};
            var label = document.createElement('label');
            label.style.cssText = 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.innerHTML = '<input type="checkbox" class="range-track" value="' + i + '" checked> ' + escapeHTML(layer.name || ('Track ' + (i + 1)));
            trackList.appendChild(label);
        }
        var mode = body.querySelector('#range-mode');
        var biasRow = body.querySelector('#range-key-bias-row');
        mode.addEventListener('change', function() { biasRow.style.display = mode.value === '3' ? 'flex' : 'none'; });

        // 音色替代设置: 打开替代配置弹窗 (与 MIDI 导入共用, 功能区场景直接进入配置页签)
        var subSettingsBtn = body.querySelector('#range-substitute-settings');
        if (subSettingsBtn) subSettingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openSubstituteSettings('instrument');
        });
        // 恢复默认替代配置
        var subResetBtn = body.querySelector('#range-substitute-reset');
        if (subResetBtn) subResetBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            N.shared._substituteConfig = JSON.parse(JSON.stringify(N.shared.DEFAULT_SUBSTITUTE));
            saveSubstituteConfig(N.shared._substituteConfig);
            showAppAlert(t('音色替代配置已恢复为默认。'), {title: t('音域处理')});
        });

        body.querySelector('#range-all-tracks').addEventListener('change', function(e) {
            var inputs = trackList.querySelectorAll('.range-track');
            for (var j = 0; j < inputs.length; j++) inputs[j].checked = e.target.checked;
        });
        function close() { _closeAppDialog(overlay); }
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var cancel = _appDialogBtn(t('取消'), false);
        cancel.addEventListener('click', close);
        var apply = _appDialogBtn(t('应用'), true);
        apply.addEventListener('click', function() {
            var selected = {};
            var trackInputs = trackList.querySelectorAll('.range-track');
            for (var k = 0; k < trackInputs.length; k++) if (trackInputs[k].checked) selected[parseInt(trackInputs[k].value, 10)] = true;
            applyRangeProcessing(parseInt(mode.value, 10), selected, body.querySelector('#range-substitute').checked, body.querySelector('#range-force-fold').checked);
            close();
        });
        box.querySelector('.popup-actions').appendChild(cancel);
        box.querySelector('.popup-actions').appendChild(apply);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
    }

    function foldToMinecraftRange(key) {
        while (key < 33) key += 12;
        while (key > 57) key -= 12;
        return Math.max(33, Math.min(57, key));
    }

    function getBestRangeOffset(notes, unit) {
        var best = 0, bestOutside = Infinity, bestDistance = Infinity;
        for (var offset = -60; offset <= 60; offset += unit) {
            var outside = 0;
            for (var i = 0; i < notes.length; i++) {
                var key = notes[i].key + offset;
                if (key < 33 || key > 57) outside++;
            }
            if (outside < bestOutside || (outside === bestOutside && Math.abs(offset) < bestDistance)) {
                best = offset;
                bestOutside = outside;
                bestDistance = Math.abs(offset);
            }
        }
        return best;
    }

    function applyRangeProcessing(mode, selectedLayers, enableSubstitute, forceFold) {
        var notes = state.pianoRoll.getNotes();
        var groups = {};
        for (var i = 0; i < notes.length; i++) {
            if (selectedLayers[notes[i].layer]) (groups[notes[i].layer] || (groups[notes[i].layer] = [])).push(notes[i]);
        }
        if (Object.keys(groups).length === 0) return;
        pushUndo();
        var changed = 0;
        Object.keys(groups).forEach(function(layer) {
            var group = groups[layer];
            var offset = mode === 2 ? getBestRangeOffset(group, 12) : (mode === 3 ? getBestRangeOffset(group, 1) : 0);
            for (var j = 0; j < group.length; j++) {
                var note = group[j];
                var originalKey = note.key;
                if (mode === 1) note.key = foldToMinecraftRange(note.key);
                else if (mode === 2 || mode === 3) note.key += offset;
                if (enableSubstitute) applyInstrumentRangeSubstitute(note);
                if (forceFold && (note.key < 33 || note.key > 57)) note.key = foldToMinecraftRange(note.key);
                if (note.key !== originalKey) changed++;
            }
        });
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        markDirty();
        showAppAlert('已完成音域处理，调整了 ' + changed + ' 个音符。', {title: '音域处理'});
    }

    function applyInstrumentRangeSubstitute(note) {
        if (note.key >= 33 && note.key <= 57 || note.instrument === 2 || note.instrument === 3 || note.instrument === 4) return;
        // 使用与 MIDI 导入一致的链条式替代配置 (用户可在"音色替代设置"中修改)
        var config = loadSubstituteConfig();
        if (!config || !config[note.instrument]) return;
        var result = applySubstituteToNote(note.key + 21, note.instrument, config);
        if (result && result.substituted) {
            note.instrument = result.instrument;
            note.key = Math.max(0, Math.min(87, result.midi - 21));
        }
    }

    // ============ 钢琴键盘 (状态栏可折叠) ============
    // 在钢琴键盘区域左右拖拽平移 (替代底部滚动条)
    function setupPianoKeyboardDrag(keyboard) {
        if (!keyboard || keyboard._dragSetup) return;
        keyboard._dragSetup = true;
        var isDown = false, startX = 0, startScroll = 0, moved = false;
        var threshold = 5;
        function getClientX(e) {
            if (e.clientX !== undefined) return e.clientX;
            if (e.touches && e.touches[0]) return e.touches[0].clientX;
            return 0;
        }
        function onStart(e) {
            isDown = true;
            moved = false;
            startX = getClientX(e);
            startScroll = keyboard.scrollLeft;
            keyboard._pianoDragging = false;
        }
        function onMove(e) {
            if (!isDown) return;
            var clientX = getClientX(e);
            var dx = startX - clientX;
            if (Math.abs(dx) > threshold) {
                keyboard._pianoDragging = true;
                moved = true;
            }
            if (moved) {
                keyboard.scrollLeft = startScroll + dx;
                e.preventDefault();
                e.stopPropagation();
            }
        }
        function onEnd(e) {
            isDown = false;
            // 延迟清除拖动标记, 避免 touchend 误触发 key 点击
            setTimeout(function() { keyboard._pianoDragging = false; }, 50);
        }
        keyboard.addEventListener('mousedown', onStart, true);
        keyboard.addEventListener('mousemove', onMove, true);
        keyboard.addEventListener('mouseup', onEnd, true);
        keyboard.addEventListener('mouseleave', onEnd, true);
        keyboard.addEventListener('touchstart', onStart, { passive: false, capture: true });
        keyboard.addEventListener('touchmove', onMove, { passive: false, capture: true });
        keyboard.addEventListener('touchend', onEnd, { capture: true });
        keyboard.addEventListener('touchcancel', onEnd, { capture: true });
    }

    function createPianoKeyboardDOM() {
        var container = $('piano-roll-container');
        if (!container) return;

        // 折叠栏 (作为状态栏内)
        var statusBar = $('status-bar');
        if (statusBar && !$('btn-toggle-keyboard')) {
            var btn = document.createElement('button');
            btn.id = 'btn-toggle-keyboard';
            btn.className = 'status-control-btn';
            btn.title = '展开/折叠钢琴键盘';
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="16" height="16" fill="currentColor"><rect x="4" y="12" width="56" height="40" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><rect x="12" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="28" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="44" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="18" y="12" width="6" height="14" fill="currentColor"/><rect x="34" y="12" width="6" height="14" fill="currentColor"/></svg>';
            btn.addEventListener('click', togglePianoKeyboard);
            var statusControls = statusBar.querySelector('.status-controls');
            if (statusControls) {
                var timeEl = $('progress-time');
                if (timeEl && timeEl.parentNode) {
                    timeEl.parentNode.insertBefore(btn, timeEl.nextSibling);
                } else {
                    statusControls.appendChild(btn);
                }
                if (!$('btn-numpad-range')) {
                    var rangeBtn = document.createElement('button');
                    rangeBtn.id = 'btn-numpad-range';
                    rangeBtn.className = 'status-control-btn';
                    rangeBtn.title = '设置小键盘弹奏音域';
                    rangeBtn.innerHTML = '<i class="fa-solid fa-sliders"></i>';
                    rangeBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showNumpadRangeSettings(rangeBtn);
                    });
                    statusControls.insertBefore(rangeBtn, btn.nextSibling);
                }
            }
        }

        // 键盘面板
        var keyboard = document.createElement('div');
        keyboard.id = 'piano-keyboard';
        keyboard.className = 'piano-keyboard-new';
        keyboard.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:148px;'
            + 'border-top:1px solid #2a2a4a;display:none;z-index:35;'
            + 'overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding:4px 2px;'
            + 'scrollbar-width:thin;scrollbar-color:#555 transparent;';
        container.appendChild(keyboard);
        setupPianoKeyboardDrag(keyboard);

        // 键盘参数
        var WHITE_W = 30;
        var WHITE_H = 140;
        var BLACK_W = 18;
        var BLACK_H = 90;
        var isMobile = window.innerWidth <= 768;
        if (isMobile) {
            WHITE_W = 24;
            WHITE_H = 100;
            BLACK_W = 14;
            BLACK_H = 64;
            keyboard.style.height = '108px';
        }

        var whiteKeyIndices = {0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6};
        var blackBoundaries = {1:1, 3:2, 6:4, 8:5, 10:6};

        // Build positions from the actual NBS range (A0 through C8). Using full
        // octave positions would leave a blank C-to-G segment before the first key.
        var totalWhiteKeys = 0;
        var whitePositions = {};
        for (var k = 0; k <= 87; k++) {
            if (whiteKeyIndices[(k + 9) % 12] !== undefined) totalWhiteKeys++;
            if (whiteKeyIndices[(k + 9) % 12] !== undefined) {
                whitePositions[k] = totalWhiteKeys - 1;
            }
        }
        var containerWidth = totalWhiteKeys * WHITE_W + 4;
        var innerEl = document.createElement('div');
        // Auto margins center the full keyboard on wide displays; when it is
        // wider than the viewport they resolve to zero and horizontal scrolling
        // continues to use the actual keyboard centre.
        innerEl.style.cssText = 'position:relative;width:' + containerWidth + 'px;height:' + WHITE_H + 'px;margin:0 auto;';
        keyboard.appendChild(innerEl);
        keyboard._innerEl = innerEl;

        var MIN_MC_KEY = 33;
        var MAX_MC_KEY = 57;

        // 先创建白键
        for (var key = 0; key <= 87; key++) {
            // NBS key 0 maps to MIDI A0, so use MIDI pitch classes for display.
            var noteInOctave = (key + 9) % 12;
            var whiteIdx = whiteKeyIndices[noteInOctave];
            if (whiteIdx === undefined) continue;
            var midiNote = nbsKeyToMidiNote(key);
            var octave = getNbsKeyOctave(key);
            var pos = whitePositions[key];
            var isOutOfRange = (key < MIN_MC_KEY || key > MAX_MC_KEY);
            var keyEl = document.createElement('div');
            keyEl.className = 'piano-key white' + (isOutOfRange ? ' out-of-range' : '');
            keyEl.dataset.key = key;
            keyEl.style.cssText = 'position:absolute;left:' + (pos * WHITE_W) + 'px;top:0;'
                + 'width:' + WHITE_W + 'px;height:' + WHITE_H + 'px;'
                + 'display:flex;align-items:flex-end;justify-content:center;padding:0 1px 6px;'
                + 'white-space:pre-line;line-height:1.05;text-align:center;overflow:hidden;'
                + 'font-size:' + (isMobile ? '8px' : '10px') + ';cursor:pointer;z-index:1;'
                + 'box-sizing:border-box;border-radius:0 0 4px 4px;'
                + (isOutOfRange
                    ? 'background:#f0d0d0;color:#a33;border:1px solid #d0a0a0;'
                    : 'background:linear-gradient(to bottom,#fcfcfc,#e6e6e6);color:#333;border:1px solid #bbb;');
            var label = getNbsKeyDisplayLabel(key);
            keyEl.dataset.pitchLabel = label;
            keyEl.dataset.keyLabel = getKeyboardLabelForNbsKey(key);
            keyEl.textContent = label;
            keyEl.title = label + (isOutOfRange ? ' (超出范围)' : '');
            attachPianoKeyEvent(keyboard, keyEl, key);
            innerEl.appendChild(keyEl);
        }

        // 再创建黑键 (在最上层)
        for (var key2 = 0; key2 <= 87; key2++) {
            var note8va = (key2 + 9) % 12;
            var boundary = blackBoundaries[note8va];
            if (boundary === undefined) continue;
            var midiNote2 = nbsKeyToMidiNote(key2);
            var octave2 = getNbsKeyOctave(key2);
            var previousWhite = key2 - 1;
            while (previousWhite >= 0 && whitePositions[previousWhite] === undefined) previousWhite--;
            if (previousWhite < 0) continue;
            var leftPos = (whitePositions[previousWhite] + 1) * WHITE_W - BLACK_W / 2;
            var isOutOfRange2 = (key2 < MIN_MC_KEY || key2 > MAX_MC_KEY);
            var keyEl2 = document.createElement('div');
            keyEl2.className = 'piano-key black' + (isOutOfRange2 ? ' out-of-range' : '');
            keyEl2.dataset.key = key2;
            keyEl2.style.cssText = 'position:absolute;left:' + leftPos + 'px;top:0;'
                + 'width:' + BLACK_W + 'px;height:' + BLACK_H + 'px;'
                + 'display:flex;align-items:flex-end;justify-content:center;padding:0 1px 3px;'
                + 'white-space:pre-line;line-height:1.05;text-align:center;overflow:hidden;'
                + 'font-size:' + (isMobile ? '7px' : '8px') + ';cursor:pointer;z-index:2;'
                + 'box-sizing:border-box;border-radius:0 0 3px 3px;'
                + (isOutOfRange2
                    ? 'background:#4a1a1a;color:#e88;border:1px solid #6a2a2a;'
                    : 'background:linear-gradient(to bottom,#3a3a3a,#1a1a1a);color:#ccc;border:1px solid #111;');
            var label2 = getNbsKeyDisplayLabel(key2);
            keyEl2.dataset.pitchLabel = label2;
            keyEl2.dataset.keyLabel = getKeyboardLabelForNbsKey(key2);
            keyEl2.textContent = label2;
            keyEl2.title = label2 + (isOutOfRange2 ? ' (超出范围)' : '');
            attachPianoKeyEvent(keyboard, keyEl2, key2);
            innerEl.appendChild(keyEl2);
        }
    }

    function attachPianoKeyEvent(keyboard, el, key) {
        var activate = function(e) {
            if (keyboard._pianoDragging) { e.preventDefault(); e.stopPropagation(); return; }
            if (e) { e.preventDefault(); e.stopPropagation(); }
            state.selectedPianoKey = key;
            if (state.pianoRoll) {
                state.pianoRoll.setSelectedKey(key);
            }
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(state.currentInstrument, key, 80);
            }
            updatePianoKeyboardHighlight();
        };
        el.addEventListener('mousedown', activate);
        el.addEventListener('touchstart', activate, { passive: false });
    }

    function refreshPianoKeyboardKeyLabels() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return;
        var keys = keyboard.querySelectorAll('.piano-key');
        for (var i = 0; i < keys.length; i++) {
            var key = parseInt(keys[i].dataset.key, 10);
            keys[i].dataset.keyLabel = getKeyboardLabelForNbsKey(key);
        }
        updatePianoKeyboardHighlight();
    }

    function showNumpadRangeSettings(anchor) {
        var old = $('numpad-range-popover');
        if (old) old.remove();
        var t = i18nText;

        var pop = document.createElement('div');
        pop.id = 'numpad-range-popover';
        pop.style.cssText = 'position:fixed;z-index:10000;min-width:240px;background:rgba(18,18,42,0.98);'
            + 'border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px;'
            + 'box-shadow:0 12px 36px rgba(0,0,0,0.45);color:#eee;font-size:12px;';
        pop.innerHTML =
            '<div style="font-weight:700;margin-bottom:10px;font-size:13px;">' + t('弹奏音域设置') + '</div>' +
            '<div style="font-weight:600;margin-bottom:6px;color:#4ecdc4;">' + t('字母键盘') + '</div>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('八度偏移') + '</span><input id="letter-octave-shift" type="number" min="-4" max="4" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('半音偏移') + '</span><input id="letter-semitone-shift" type="number" min="-12" max="12" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<div style="height:1px;background:rgba(255,255,255,0.1);margin:10px 0;"></div>' +
            '<div style="font-weight:600;margin-bottom:6px;color:#4ecdc4;">' + t('小键盘') + '</div>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('八度偏移') + '</span><input id="numpad-octave-shift" type="number" min="-4" max="4" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('半音偏移') + '</span><input id="numpad-semitone-shift" type="number" min="-12" max="12" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;">' +
            '<button id="numpad-range-reset" class="popup-btn popup-btn-cancel" style="padding:4px 9px;font-size:12px;">' + t('重置') + '</button>' +
            '<button id="numpad-range-close" class="popup-btn popup-btn-primary" style="padding:4px 9px;font-size:12px;">' + t('确定') + '</button></div>';
        document.body.appendChild(pop);

        var rect = anchor ? anchor.getBoundingClientRect() : { left: 12, top: window.innerHeight - 40, bottom: window.innerHeight - 8 };
        window.WebNBSPositionFlyout(pop, rect, { placement: 'top-start' });

        var letterOctaveInput = $('letter-octave-shift');
        var letterSemitoneInput = $('letter-semitone-shift');
        var octaveInput = $('numpad-octave-shift');
        var semitoneInput = $('numpad-semitone-shift');
        if (letterOctaveInput) letterOctaveInput.value = state.letterOctaveShift;
        if (letterSemitoneInput) letterSemitoneInput.value = state.letterSemitoneShift;
        if (octaveInput) octaveInput.value = state.numpadOctaveShift;
        if (semitoneInput) semitoneInput.value = state.numpadSemitoneShift;

        function applySettings() {
            state.letterOctaveShift = Math.max(-4, Math.min(4, parseInt(letterOctaveInput.value, 10) || 0));
            state.letterSemitoneShift = Math.max(-12, Math.min(12, parseInt(letterSemitoneInput.value, 10) || 0));
            state.numpadOctaveShift = Math.max(-4, Math.min(4, parseInt(octaveInput.value, 10) || 0));
            state.numpadSemitoneShift = Math.max(-12, Math.min(12, parseInt(semitoneInput.value, 10) || 0));
            saveNumpadRangeSettings();
            refreshPianoKeyboardKeyLabels();
        }
        if (letterOctaveInput) letterOctaveInput.addEventListener('input', applySettings);
        if (letterSemitoneInput) letterSemitoneInput.addEventListener('input', applySettings);
        if (octaveInput) octaveInput.addEventListener('input', applySettings);
        if (semitoneInput) semitoneInput.addEventListener('input', applySettings);
        var resetBtn = $('numpad-range-reset');
        if (resetBtn) resetBtn.addEventListener('click', function() {
            letterOctaveInput.value = '0';
            letterSemitoneInput.value = '0';
            octaveInput.value = '0';
            semitoneInput.value = '0';
            applySettings();
        });
        var closeBtn = $('numpad-range-close');
        if (closeBtn) closeBtn.addEventListener('click', function() { pop.remove(); });
        setTimeout(function() {
            document.addEventListener('mousedown', function closeOutside(e) {
                if (!pop.contains(e.target) && e.target !== anchor) {
                    pop.remove();
                    document.removeEventListener('mousedown', closeOutside);
                }
            });
        }, 0);
    }

    function togglePianoKeyboard() {
        var keyboard = $('piano-keyboard');
        var btn = $('btn-toggle-keyboard');
        if (!keyboard) return;
        var container = $('piano-roll-container') || keyboard.parentNode;

        var isOpen = keyboard.style.display === 'block';
        if (isOpen) {
            keyboard.classList.add('collapsing');
            if (btn) btn.classList.remove('active');
            // 立即释放底部预留: 若等动画结束再释放, 期间切到片段模式会让时间栏停在半空
            if (state.pianoRoll && state.pianoRoll.setBottomReserve) {
                state.pianoRoll.setBottomReserve(0);
            }
            setTimeout(function() {
                keyboard.style.display = 'none';
                keyboard.classList.remove('collapsing');
                if (container) container.classList.remove('keyboard-open');
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 260);
            // 额外延迟重绘, 确保容器尺寸稳定后画布正确显示
            setTimeout(function() {
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 320);
        } else {
            keyboard.style.display = 'block';
            keyboard.classList.remove('collapsing');
            if (container) container.classList.add('keyboard-open');
            if (btn) btn.classList.add('active');
            // 底部时间栏让位于键盘上方
            if (state.pianoRoll) {
                if (state.pianoRoll.setBottomReserve) state.pianoRoll.setBottomReserve(keyboard.offsetHeight || 148);
            }
            updatePianoKeyboardHighlight();
            // 默认滚动到完整 88 键键盘的水平中心
            // 先设置 display 后需要等待下一帧, 以确保元素已有尺寸
            centerPianoKeyboard(keyboard);
            requestAnimationFrame(function() { centerPianoKeyboard(keyboard); });
            setTimeout(function() { centerPianoKeyboard(keyboard); }, 0);
            // 显示后重设画布尺寸并重绘, 避免画布消失
            setTimeout(function() {
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 50);
            setTimeout(function() { centerPianoKeyboard(keyboard); }, 50);
        }
    }

    function centerPianoKeyboard(keyboard) {
        if (!keyboard || keyboard.style.display === 'none') return;
        var inner = keyboard._innerEl;
        var keyboardWidth = inner ? inner.offsetWidth : keyboard.scrollWidth;
        keyboard.scrollLeft = Math.max(0, (keyboardWidth - keyboard.clientWidth) / 2);
    }

    function schedulePianoKeyboardCenter() {
        var keyboard = $('piano-keyboard');
        if (!keyboard || keyboard.style.display !== 'block') return;
        requestAnimationFrame(function() { centerPianoKeyboard(keyboard); });
        setTimeout(function() { centerPianoKeyboard(keyboard); }, 80);
    }

    window.addEventListener('resize', schedulePianoKeyboardCenter);
    window.addEventListener('orientationchange', schedulePianoKeyboardCenter);

    function openPianoKeyboard() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return;
        if (keyboard.style.display !== 'block') {
            togglePianoKeyboard();
        } else {
            updatePianoKeyboardHighlight();
        }
    }

    // ---- 导出 ----
    N.showSustainFillAlert = showSustainFillAlert;
    N.applySustainFill = applySustainFill;
    N.showClearSustainDialog = showClearSustainDialog;
    N.trimSustainNotes = trimSustainNotes;
    N.applyClearSustain = applyClearSustain;
    N.showArpeggioTracksDialog = showArpeggioTracksDialog;
    N.applyArpeggioTracks = applyArpeggioTracks;
    N.ensureLayerCount = ensureLayerCount;
    N.applyTransposeToOctaveRange = applyTransposeToOctaveRange;
    N.showRangeProcessDialog = showRangeProcessDialog;
    N.foldToMinecraftRange = foldToMinecraftRange;
    N.getBestRangeOffset = getBestRangeOffset;
    N.applyRangeProcessing = applyRangeProcessing;
    N.applyInstrumentRangeSubstitute = applyInstrumentRangeSubstitute;
    N.setupPianoKeyboardDrag = setupPianoKeyboardDrag;
    N.createPianoKeyboardDOM = createPianoKeyboardDOM;
    N.attachPianoKeyEvent = attachPianoKeyEvent;
    N.refreshPianoKeyboardKeyLabels = refreshPianoKeyboardKeyLabels;
    N.showNumpadRangeSettings = showNumpadRangeSettings;
    N.togglePianoKeyboard = togglePianoKeyboard;
    N.centerPianoKeyboard = centerPianoKeyboard;
    N.schedulePianoKeyboardCenter = schedulePianoKeyboardCenter;
    N.openPianoKeyboard = openPianoKeyboard;
})(window.WebNBS);
