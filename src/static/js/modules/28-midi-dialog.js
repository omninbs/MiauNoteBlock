/* 28-midi-dialog.js — MiauNoteBlock 功能模块
   来源: 原 main.js L14329-L17097; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    var INSTRUMENT_NAMES = N.INSTRUMENT_NAMES;
    var INSTRUMENT_OFFSET = N.INSTRUMENT_OFFSET;
    var MC_MIDI_MAX = N.MC_MIDI_MAX;
    var MC_MIDI_MIN = N.MC_MIDI_MIN;
    var MC_MIDI_SPAN = N.MC_MIDI_SPAN;
    var MELODY_INSTRUMENT_IDS = N.MELODY_INSTRUMENT_IDS;
    var NOTE_NAMES = N.NOTE_NAMES;
    function applyMidiBasicConfig() { return N.applyMidiBasicConfig.apply(this, arguments); }
    function applySavedPercussionPrefs() { return N.applySavedPercussionPrefs.apply(this, arguments); }
    function bindMidiOctaveKeyChange() { return N.bindMidiOctaveKeyChange.apply(this, arguments); }
    function buildMidiTrackRows() { return N.buildMidiTrackRows.apply(this, arguments); }
    function buildTimbreFittingRows() { return N.buildTimbreFittingRows.apply(this, arguments); }
    function collectTimbreFitting() { return N.collectTimbreFitting.apply(this, arguments); }
    function computeMidiFileHash() { return N.computeMidiFileHash.apply(this, arguments); }
    function emptyTimbreFittingSaved() { return N.emptyTimbreFittingSaved.apply(this, arguments); }
    function ensureSoundfontOnDemand() { return N.ensureSoundfontOnDemand.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function getInstName() { return N.getInstName.apply(this, arguments); }
    function getInstrumentIconHtml() { return N.getInstrumentIconHtml.apply(this, arguments); }
    function getMidiConfigForHash() { return N.getMidiConfigForHash.apply(this, arguments); }
    function handlePlayToggle() { return N.handlePlayToggle.apply(this, arguments); }
    function hideTaskProgress() { return N.hideTaskProgress.apply(this, arguments); }
    function initMidiTrackMiniRolls() { return N.initMidiTrackMiniRolls.apply(this, arguments); }
    function loadSubstituteConfig() { return N.loadSubstituteConfig.apply(this, arguments); }
    function midiTrackShouldPlay() { return N.midiTrackShouldPlay.apply(this, arguments); }
    function parseMidiFileForPlayback() { return N.parseMidiFileForPlayback.apply(this, arguments); }
    function renderAllMidiTrackRows() { return N.renderAllMidiTrackRows.apply(this, arguments); }
    function resetMidiBasicToDefaults() { return N.resetMidiBasicToDefaults.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showTaskProgress() { return N.showTaskProgress.apply(this, arguments); }
    function stopMidiTrackPlayback() { return N.stopMidiTrackPlayback.apply(this, arguments); }
    function updateFittingLevelUI() { return N.updateFittingLevelUI.apply(this, arguments); }
    function updateMidiTrackPlayerButtons() { return N.updateMidiTrackPlayerButtons.apply(this, arguments); }
    function updateSnapGridInfo() { return N.updateSnapGridInfo.apply(this, arguments); }
    function updateTaskProgress() { return N.updateTaskProgress.apply(this, arguments); }


    // 显示音色替代槽选择菜单 (风格与 timbre-slot-menu 一致)
    function showSubstituteSlotMenu(anchorEl, instId, type) {
        var existing = $('substitute-slot-menu');
        if (existing) existing.remove();

        var slotInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="' + type + '"]');
        var currentValue = slotInput ? parseInt(slotInput.value) : -1;

        var menu = document.createElement('div');
        menu.id = 'substitute-slot-menu';
        menu.className = 'timbre-slot-menu';

        // 旋律乐器颜色 (与 timbre-slot-menu 一致)
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        // "无" 选项
        var noneItem = document.createElement('div');
        noneItem.className = 'timbre-menu-item' + (currentValue < 0 ? ' selected' : '');
        noneItem.innerHTML = '<span class="timbre-menu-icon timbre-menu-icon-none">-</span><span style="color:#888;font-style:italic;">无</span>';
        noneItem.addEventListener('click', function(e) {
            selectSubstituteSlot(instId, type, -1, '无');
            menu.remove();
            e.stopPropagation();
        });
        menu.appendChild(noneItem);

        // 旋律乐器选项 (排除自身)
        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            var optId = MELODY_INSTRUMENT_IDS[i];
            if (optId === instId) continue;
            (function(optId2) {
                var item = document.createElement('div');
                var isSelected = (currentValue === optId2);
                item.className = 'timbre-menu-item' + (isSelected ? ' selected' : '');
                item.innerHTML = '<span class="timbre-menu-icon" style="background:' + colors[optId2] + ';">'
                    + '<img src="static/sprites/spr_instrumenticons/inst_' + optId2 + '.png" alt="" />'
                    + (isSelected ? '<span class="timbre-menu-check"><i class="fa-solid fa-check"></i></span>' : '')
                    + '</span><span>' + escapeHTML(getInstName(optId2)) + '</span>';
                item.addEventListener('click', function(e) {
                    selectSubstituteSlot(instId, type, optId2, getInstName(optId2));
                    menu.remove();
                    e.stopPropagation();
                });
                menu.appendChild(item);
            })(optId);
        }

        document.body.appendChild(menu);

        // 智能计算尺寸与位置 (与 showTimbreSlotMenu 一致)
        var rect = anchorEl.getBoundingClientRect();
        var winHeight = window.innerHeight;
        var winWidth = window.innerWidth;
        var margin = 8;
        var naturalHeight = menu.scrollHeight;
        var menuWidth = Math.max(menu.offsetWidth, 150);
        var spaceBelow = winHeight - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var preferredHeight = Math.min(naturalHeight, 260);
        var compact = false;
        if (Math.max(spaceBelow, spaceAbove) < 220 || naturalHeight > Math.max(spaceBelow, spaceAbove)) {
            compact = true;
            menu.classList.add('compact');
            preferredHeight = Math.min(menu.scrollHeight, Math.max(spaceBelow, spaceAbove) - margin, 220);
        }
        preferredHeight = Math.max(preferredHeight, 80);
        var menuY = rect.bottom + 4;
        if (menuY + preferredHeight > winHeight - margin && spaceAbove > spaceBelow) {
            menuY = rect.top - preferredHeight - 4;
        }
        var menuX = rect.left;
        if (menuX + menuWidth > winWidth - margin) menuX = winWidth - menuWidth - margin;
        if (menuX < margin) menuX = margin;
        if (menuY < margin) menuY = margin;
        if (menuY + preferredHeight > winHeight - margin) preferredHeight = winHeight - margin - menuY;
        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.style.maxHeight = preferredHeight + 'px';
        menu.style.width = menuWidth + 'px';
        menu.style.transform = 'none';
        window.WebNBSPositionFlyout(menu, rect, {
            placement: menuY < rect.top ? 'top-start' : 'bottom-start',
            maxHeight: preferredHeight
        });

        // 播放当前选中的音色预览
        if (window.AudioEngine && AudioEngine.playNote && currentValue >= 0) {
            AudioEngine.playNote(currentValue, 60, 70);
        }

        // 点击其他地方关闭菜单
        var closeMenu = function(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    function selectSubstituteSlot(instId, type, value, displayName) {
        var slotInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="' + type + '"]');
        var slotBtn = document.querySelector('.substitute-slot-btn[data-inst="' + instId + '"][data-type="' + type + '"]');
        if (slotInput) slotInput.value = value;
        if (slotBtn) {
            slotBtn.innerHTML = getInstrumentIconHtml(value) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i>';
        }
        // 选择成功后立即试听该 NBS 音色
        if (value >= 0) {
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(value, 60, 80);
            }
        }
    }

    // 从 UI 读取音色替代配置
    function readSubstituteConfigFromUI() {
        var config = {};
        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            var instId = MELODY_INSTRUMENT_IDS[i];
            var highInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="high"]');
            var lowInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="low"]');
            var high = highInput ? parseInt(highInput.value) : -1;
            var low = lowInput ? parseInt(lowInput.value) : -1;
            if (isNaN(high)) high = -1;
            if (isNaN(low)) low = -1;
            config[instId] = { high: high, low: low };
        }
        return config;
    }

    // ============ 音色替代核心算法 ============
    // 跨乐器等音高换算: 将原音色的 NBS key 换算为目标音色的 NBS key, 保证实际音高不变
    // 公式: newKey = origKey + (origOffset - targetOffset)
    // 因为 实际MIDI = key + 21 + offset, 要保持 MIDI 不变:
    //   origKey + 21 + origOffset = newKey + 21 + targetOffset
    //   newKey = origKey + origOffset - targetOffset
    function convertKeyAcrossInstruments(origKey, origInstId, targetInstId) {
        var origOffset = INSTRUMENT_OFFSET[origInstId] || 0;
        var targetOffset = INSTRUMENT_OFFSET[targetInstId] || 0;
        return origKey + origOffset - targetOffset;
    }

    // 应用音色替代到单个音符 (链条式, 与 nbs_client.js 保持一致)
    // 入参为 MIDI 表示值 (而非 NBS key), 目标音域为 Minecraft 标准音域 [54, 78]
    // 返回 { midi, instrument, substituted: 'high'|'low'|null, outOfRange: bool }
    function applySubstituteToNote(midiNote, instId, config) {
        var result = { midi: midiNote, instrument: instId, substituted: null, outOfRange: false };
        // 在 Minecraft 标准音域内 [54, 78] 不需要替代 (nbsKey 33~57)
        if (midiNote >= MC_MIDI_MIN && midiNote <= MC_MIDI_MAX) {
            return result;
        }

        if (!config) {
            result.outOfRange = (midiNote < MC_MIDI_MIN || midiNote > MC_MIDI_MAX);
            return result;
        }

        // 链条式替代: 从当前音色开始, 按 high/low 跳到下一个音色
        var chainInst = instId;
        var chainMidi = midiNote;
        var maxChainSteps = 4;

        for (var chainStep = 0; chainStep < maxChainSteps; chainStep++) {
            var substCfg = config[chainInst];
            if (!substCfg) break;

            var targetInst = -1;
            var direction = null;
            if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                targetInst = substCfg.high;
                direction = 'high';
            } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                targetInst = substCfg.low;
                direction = 'low';
            } else {
                break;
            }

            var chainOrigOffset = INSTRUMENT_OFFSET[chainInst] || 0;
            var chainTargetOffset = INSTRUMENT_OFFSET[targetInst] || 0;
            // 新MIDI = 原MIDI - (新基调 - 原基调), 保持绝对声学频率不变
            var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);

            if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                // 替代成功
                return { midi: newMidi, instrument: targetInst, substituted: direction, outOfRange: false };
            }

            // 继续链条
            chainInst = targetInst;
            chainMidi = newMidi;
        }

        // 链条用尽仍未在 Minecraft 标准音域内
        result.outOfRange = (chainMidi < MC_MIDI_MIN || chainMidi > MC_MIDI_MAX);
        return result;
    }

    // 判断某个 MIDI track 是否在用户选中的应用范围内
    function isTrackSelectedForSubstitute(trackIndex) {
        if (!N.shared._substituteSelectedTracks) return true; // null = 全部应用
        return !!N.shared._substituteSelectedTracks[trackIndex];
    }

    // ============ 音域处理模式: 计算最优偏移量 ============
    // 模式 2: 整体八度偏移法 (步长 12, 仅取 12 倍数)
    // 模式 3: 整体音调偏移法 (步长 1, 任意半音)
    // 目标音域: Minecraft 标准音域 processedMidi [54, 78] (nbsKey 33~57, F#3~F#5)
    // 返回 { offset: 最优偏移量(半音), outOfRangeCount: 超出音符数 }
    function calculateOptimalOffset(notes, channel, mode) {
        if (!notes || notes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 收集该 channel 的所有音符的 MIDI 值 (偏移前)
        var midis = [];
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].channel === channel) {
                midis.push(notes[i].note); // 原始 MIDI 音高
            }
        }
        if (midis.length === 0) return { offset: 0, outOfRangeCount: 0 };

        var minN = Math.min.apply(null, midis);
        var maxN = Math.max.apply(null, midis);
        var span = maxN - minN;

        // 所有音符已在 Minecraft 标准音域内, 直接返回 0 偏移
        // 目标音域: [54, 78] (processedMidi), 对应 nbsKey [33, 57]
        if (minN >= MC_MIDI_MIN && maxN <= MC_MIDI_MAX) {
            return { offset: 0, outOfRangeCount: 0 };
        }

        var step = (mode === 2) ? 12 : 1;

        // ---- 分支 1: span <= 24 (Minecraft 音域跨度) ----
        // 理论可平移区间 [54 - minN, 78 - maxN], 在此区间内选取绝对值最小的 N
        if (span <= MC_MIDI_SPAN) {
            var rangeMin = MC_MIDI_MIN - minN; // 使最低音刚好进入音域下限
            var rangeMax = MC_MIDI_MAX - maxN; // 使最高音刚好进入音域上限
            // 若 N=0 在区间内, 直接返回 (保留原调)
            if (rangeMin <= 0 && rangeMax >= 0) {
                return { offset: 0, outOfRangeCount: 0 };
            }
            // 选取区间内绝对值最小的 N (对齐到 step)
            var bestN = null;
            if (rangeMin > 0) {
                // 区间整体 > 0, 取最小值 (向上对齐到 step)
                bestN = Math.ceil(rangeMin / step) * step;
                if (bestN > rangeMax) bestN = null; // 对齐后超出区间
            } else if (rangeMax < 0) {
                // 区间整体 < 0, 取最大值 (向下对齐到 step)
                bestN = Math.floor(rangeMax / step) * step;
                if (bestN < rangeMin) bestN = null;
            }
            if (bestN !== null) {
                // 验证并计算超出音符数
                var oor = 0;
                for (var k = 0; k < midis.length; k++) {
                    var s = midis[k] + bestN;
                    if (s < MC_MIDI_MIN || s > MC_MIDI_MAX) oor++;
                }
                return { offset: bestN, outOfRangeCount: oor };
            }
            // 对齐后无解 (例如八度模式下区间内无 12 倍数), 落入搜索分支
        }

        // ---- 分支 2: span > 24 或分支 1 无解 ----
        // 暴力搜索: 八度模式 N ∈ [-72, 72] 步长 12; 音调模式 N ∈ [-36, 36] 步长 1
        var searchMin, searchMax;
        if (mode === 2) {
            searchMin = -72; searchMax = 72; step = 12; // -6~+6 八度
        } else {
            searchMin = -36; searchMax = 36; step = 1;  // -36~+36 半音
        }

        var bestOffset = 0;
        var bestOutOfRange = Infinity;
        var bestInRange = -1;

        for (var off = searchMin; off <= searchMax; off += step) {
            var outOfRange = 0;
            var inRange = 0;
            for (var k2 = 0; k2 < midis.length; k2++) {
                var shifted = midis[k2] + off;
                if (shifted < MC_MIDI_MIN || shifted > MC_MIDI_MAX) {
                    outOfRange++;
                } else {
                    inRange++;
                }
            }
            // 优先选超出最少的, 其次选在音域内最多的, 最后选绝对值最小的
            if (outOfRange < bestOutOfRange || (outOfRange === bestOutOfRange && inRange > bestInRange)) {
                bestOutOfRange = outOfRange;
                bestInRange = inRange;
                bestOffset = off;
            } else if (outOfRange === bestOutOfRange && inRange === bestInRange) {
                if (Math.abs(off) < Math.abs(bestOffset)) bestOffset = off;
            }
        }

        return { offset: bestOffset, outOfRangeCount: bestOutOfRange };
    }

    // 模式切换时, 为通道映射表自动计算并填充最优八度/音调偏移
    function updateChannelOctaveForMode(mode) {
        if (!state._midiInfo || !state._midiInfo.channels) return;

        // 智能音色替代 checkbox 可见性: 仅模式 2/3 可见可勾选
        // (模式 0 不处理; 模式 1 归一法无需替代)
        var smartSubLabel = $('midi-smart-substitute-label');
        var smartSubCheck = $('midi-smart-substitute');
        if (smartSubLabel) {
            var smartSubVisible = (mode === 2 || mode === 3);
            if (smartSubVisible) {
                smartSubLabel.style.display = '';
                if (smartSubCheck) smartSubCheck.disabled = false;
            } else {
                smartSubLabel.style.display = 'none';
                if (smartSubCheck) {
                    smartSubCheck.disabled = true;
                    // 模式 0/1 下不强制取消勾选, 保留用户选择以便切回模式 2/3 时恢复
                }
            }
        }

        // 全局强制归位 checkbox 可见性: 仅模式 2/3 可见可勾选
        // (模式 0 不处理; 模式 1 逐音符归一化已保证合法, 不需要兜底)
        var forceFoldLabel = $('midi-force-fold-label');
        var forceFoldCheck = $('midi-force-fold');
        if (forceFoldLabel) {
            var forceFoldVisible = (mode === 2 || mode === 3);
            if (forceFoldVisible) {
                forceFoldLabel.style.display = '';
                if (forceFoldCheck) forceFoldCheck.disabled = false;
            } else {
                forceFoldLabel.style.display = 'none';
                if (forceFoldCheck) {
                    forceFoldCheck.disabled = true;
                    forceFoldCheck.checked = false;
                }
            }
        }

        var rows = document.querySelectorAll('#midi-channel-rows tr');

        // 模式 0 (不启用): 始终清零, select 可编辑
        if (mode === 0) {
            for (var i = 0; i < rows.length; i++) {
                var octSel = rows[i].querySelector('.midi-octave-select');
                setMidiSelectValue(octSel, 0);
                var keySel = rows[i].querySelector('.midi-key-shift-select');
                setMidiSelectValue(keySel, 0);
                updateChannelRangeAfter(rows[i], mode);
            }
            return;
        }

        // 模式 1 (单独音符归一法): 逐音符 ±12 取模到 [42, 114], 不需要音轨级偏移, select 只读
        if (mode === 1) {
            for (var i2 = 0; i2 < rows.length; i2++) {
                var octSel2 = rows[i2].querySelector('.midi-octave-select');
                setMidiSelectValue(octSel2, 0);
                var keySel2 = rows[i2].querySelector('.midi-key-shift-select');
                setMidiSelectValue(keySel2, 0);
                updateChannelRangeAfter(rows[i2], mode);
            }
            return;
        }

        // 模式 2 (整体八度偏移法) / 模式 3 (整体音调偏移法): 自动计算最优偏移, select 只读
        // 新流程 (补充补丁): 先模拟音色替代, 再对残留超限的音轨计算偏移
        var smartSubEnabled = smartSubCheck && !smartSubCheck.disabled && smartSubCheck.checked;
        var substConfig = smartSubEnabled ? loadSubstituteConfig() : null;
        var midiEvents = state._midiInfo._rawEvents;
        // 收集音色拟合 (用户在 UI 中为通道设置的 slot1 主乐器, 优先作为替代链起点)
        var timbreFitting = collectTimbreFitting();
        // 拟合面板的 channels map (channel -> [slot1, slot2, slot3])
        var timbreFittingChannels = (timbreFitting && timbreFitting.channels) ? timbreFitting.channels : {};

        // 构建 trackIndex -> 是否在替代作用域内的映射
        var substTracksSet = null;
        if (N.shared._substituteSelectedTracks) {
            substTracksSet = N.shared._substituteSelectedTracks;
        }

        if (!midiEvents || midiEvents.length === 0) {
            // 回退到用 channel 的 min_note/max_note 估算
            for (var r = 0; r < rows.length; r++) {
                var ch2 = parseInt(rows[r].getAttribute('data-channel'));
                var chInfo2 = null;
                for (var ci2 = 0; ci2 < state._midiInfo.channels.length; ci2++) {
                    if (state._midiInfo.channels[ci2].channel === ch2) { chInfo2 = state._midiInfo.channels[ci2]; break; }
                }
                if (!chInfo2 || chInfo2.min_note == null) {
                    updateChannelRangeAfter(rows[r], mode);
                    continue;
                }
                var fakeNotes = [];
                for (var fn = chInfo2.min_note; fn <= chInfo2.max_note; fn += Math.max(1, Math.floor((chInfo2.max_note - chInfo2.min_note) / 20))) {
                    fakeNotes.push({ channel: ch2, note: fn });
                }
                fakeNotes.push({ channel: ch2, note: chInfo2.min_note });
                fakeNotes.push({ channel: ch2, note: chInfo2.max_note });
                var result = calculateOptimalOffsetWithSubstitute(fakeNotes, ch2, mode, substConfig, substTracksSet, timbreFittingChannels);
                applyOffsetToChannelRow(rows[r], result.offset, mode);
            }
            return;
        }

        // 有原始 events, 按通道计算
        for (var r3 = 0; r3 < rows.length; r3++) {
            var ch3 = parseInt(rows[r3].getAttribute('data-channel'));
            var result3 = calculateOptimalOffsetWithSubstitute(midiEvents, ch3, mode, substConfig, substTracksSet, timbreFittingChannels);
            applyOffsetToChannelRow(rows[r3], result3.offset, mode);
        }
    }

    // 计算最优偏移量 (考虑智能音色替代)
    // 新流程: 先对音符模拟替代, 再对残留超限的音轨计算偏移
    // 如果替代后所有音符都在音域内, 返回 offset=0 (跳过偏移)
    // timbreFittingChannels: 可选, {channel: [slot1, slot2, slot3]}, 用于优先确定替代链起点
    function calculateOptimalOffsetWithSubstitute(notes, channel, mode, substConfig, substTracksSet, timbreFittingChannels) {
        if (!notes || notes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 收集该 channel 的所有音符 (原始 MIDI, 含 track 索引)
        var channelNotes = [];
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].channel === channel) {
                channelNotes.push(notes[i]);
            }
        }
        if (channelNotes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 鼓组通道 (channel 9) 不参与替代和偏移
        if (channel === 9) return { offset: 0, outOfRangeCount: 0 };

        // 确定该通道的替代链起点乐器 (与 nbs_client.js 保持一致):
        // 优先级: timbre_fitting slot1 (>=0) > default_instrument (GM 表) > 0 (Harp)
        var defaultInst = 0; // Harp
        if (timbreFittingChannels && Object.prototype.hasOwnProperty.call(timbreFittingChannels, channel)) {
            var fitSlots = timbreFittingChannels[channel];
            if (fitSlots && fitSlots[0] >= 0) {
                defaultInst = fitSlots[0];
            }
        }
        if (defaultInst === 0 && state._midiInfo && state._midiInfo.channels) {
            for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                if (state._midiInfo.channels[ci].channel === channel) {
                    defaultInst = state._midiInfo.channels[ci].default_instrument || 0;
                    break;
                }
            }
        }

        // 阶段1: 模拟音色替代 (如果启用)
        // 替代触发条件: processedMidi 超出 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
        var substitutedMidis = [];
        for (var i2 = 0; i2 < channelNotes.length; i2++) {
            var n = channelNotes[i2];
            var m = n.note;
            if (m >= MC_MIDI_MIN && m <= MC_MIDI_MAX) {
                substitutedMidis.push(m);
                continue;
            }
            if (substConfig) {
                var trackIdx = n.track || 0;
                var trackInScope = true;
                if (substTracksSet) trackInScope = !!substTracksSet[trackIdx];
                if (trackInScope) {
                    // 模拟链条式替代
                    var chainInst = defaultInst;
                    var chainMidi = m;
                    for (var step = 0; step < 4; step++) {
                        var substCfg = substConfig[chainInst];
                        if (!substCfg) break;
                        var targetInst = -1;
                        if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                            targetInst = substCfg.high;
                        } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                            targetInst = substCfg.low;
                        } else {
                            break;
                        }
                        var chainOrigOffset = INSTRUMENT_OFFSET[chainInst] || 0;
                        var chainTargetOffset = INSTRUMENT_OFFSET[targetInst] || 0;
                        var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);
                        if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                            m = newMidi; // 替代成功, 更新 MIDI
                            break;
                        }
                        chainInst = targetInst;
                        chainMidi = newMidi;
                    }
                }
            }
            substitutedMidis.push(m);
        }

        // 阶段2: 统计残留超限 (基于 Minecraft 标准音域)
        var minSubst = Math.min.apply(null, substitutedMidis);
        var maxSubst = Math.max.apply(null, substitutedMidis);

        // 如果替代后所有音符都在 Minecraft 标准音域内, 跳过偏移
        if (minSubst >= MC_MIDI_MIN && maxSubst <= MC_MIDI_MAX) {
            return { offset: 0, outOfRangeCount: 0 };
        }

        // 阶段3: 对残留超限的音轨计算最优偏移 (基于替代后的 MIDI)
        var fakeNotes = [];
        for (var fn2 = 0; fn2 < substitutedMidis.length; fn2++) {
            fakeNotes.push({ channel: channel, note: substitutedMidis[fn2] });
        }
        return calculateOptimalOffset(fakeNotes, channel, mode);
    }

    // 更新音域处理模式提示的可见性。导入前不再展示不可靠的超出数量估算。
    function updateOctaveModeHint(mode) {
        var hint = $('midi-octave-mode-hint');
        var text = $('midi-octave-mode-hint-text');
        if (!hint || !text) return;

        // 所有模式都显示提示
        hint.style.display = '';

        var baseMsg = 'MC 音域 F#3~F#5 (MIDI 54~78)';
        if (mode === 0) {
            text.textContent = baseMsg + ' · 不进行音域转换';
        } else if (mode === 1) {
            text.textContent = baseMsg + ' · 超出音域的音符会按八度归一';
        } else {
            var forceFoldCheck = $('midi-force-fold');
            var forceFold = forceFoldCheck && !forceFoldCheck.disabled && forceFoldCheck.checked;
            if (forceFold) {
                text.textContent = baseMsg + ' · 自动偏移、音色替代并强制归位';
            } else {
                text.textContent = baseMsg + ' · 自动偏移并按需使用音色替代';
            }
        }
    }

    // 计算当前设置下预计超出音域的音符数
    // mode 0: 原始超出数; mode 1: 0; mode 2/3: 替代+偏移后超出数 (不考虑 forceFold)
    function calculateExpectedOutOfRange(mode) {
        if (!state._midiInfo) return 0;
        var midiEvents = state._midiInfo._rawEvents;
        if (!midiEvents || midiEvents.length === 0) return 0;

        if (mode === 1) return 0; // 归一化保证合法

        var smartSubCheck = $('midi-smart-substitute');
        var smartSubEnabled = smartSubCheck && !smartSubCheck.disabled && smartSubCheck.checked;
        var substConfig = (smartSubEnabled && (mode === 2 || mode === 3)) ? loadSubstituteConfig() : null;
        var timbreFitting = collectTimbreFitting();
        var timbreFittingChannels = (timbreFitting && timbreFitting.channels) ? timbreFitting.channels : {};
        var substTracksSet = N.shared._substituteSelectedTracks || null;

        if (mode === 0) {
            // 模式 0: 统计原始 MIDI 超出 [MC_MIDI_MIN, MC_MIDI_MAX] 的音符数
            var count0 = 0;
            for (var i = 0; i < midiEvents.length; i++) {
                var ev0 = midiEvents[i];
                if (ev0.type !== 'noteOn') continue;
                if (ev0.channel === 9) continue; // 鼓组不参与
                if (ev0.note < MC_MIDI_MIN || ev0.note > MC_MIDI_MAX) count0++;
            }
            return count0;
        }

        // 模式 2/3: 累加每通道的 outOfRangeCount
        var totalCount = 0;
        var processedChannels = {};
        for (var j = 0; j < midiEvents.length; j++) {
            var ev = midiEvents[j];
            if (ev.type !== 'noteOn') continue;
            if (ev.channel === 9) continue;
            if (processedChannels[ev.channel]) continue;
            processedChannels[ev.channel] = true;
            var result = calculateOptimalOffsetWithSubstitute(
                midiEvents, ev.channel, mode, substConfig, substTracksSet, timbreFittingChannels
            );
            totalCount += result.outOfRangeCount || 0;
        }
        return totalCount;
    }

    // 通用辅助: 确保 select 中存在目标值的选项, 且选项 enabled, 然后设置 value
    // 关键修复: buildOctaveSelect 会给"无效"八度加 disabled 属性,
    // 浏览器会拒绝把 select.value 设到 disabled option, 导致设置静默失败 (间歇性BUG根因)
    function setMidiSelectValue(sel, val) {
        if (!sel) return;
        var targetOpt = null;
        for (var i = 0; i < sel.options.length; i++) {
            if (parseInt(sel.options[i].value) === val) { targetOpt = sel.options[i]; break; }
        }
        if (!targetOpt) {
            targetOpt = document.createElement('option');
            targetOpt.value = val;
            targetOpt.textContent = (val >= 0 ? '+' : '') + val;
            sel.appendChild(targetOpt);
        }
        // 移除 disabled 属性, 否则设置 value 会被浏览器拒绝
        targetOpt.disabled = false;
        sel.disabled = false;
        sel.value = val;
        // 如果 value 仍未设置成功 (极端情况), 强制设置 selected 属性
        if (parseInt(sel.value) !== val) {
            targetOpt.selected = true;
        }
        // 通知 custom_dropdown 刷新显示
        try {
            if (sel._cdd && sel._cdd.refresh) sel._cdd.refresh();
            else if (window.CustomDropdown && window.CustomDropdown.refresh) window.CustomDropdown.refresh(sel);
        } catch(e) {}
    }

    // 将计算出的偏移量应用到通道映射表行
    function applyOffsetToChannelRow(row, offset, mode) {
        if (mode === 2) {
            // 八度偏移: 写入八度列, 音调列清零
            var octaves = Math.round(offset / 12);
            var octSel = row.querySelector('.midi-octave-select');
            setMidiSelectValue(octSel, octaves);
            var keySel = row.querySelector('.midi-key-shift-select');
            setMidiSelectValue(keySel, 0);
        } else if (mode === 3) {
            // 半音偏移: 拆分为八度 + 音调
            var oct = Math.floor(offset / 12);
            var keyShift = offset - oct * 12;
            var octSel2 = row.querySelector('.midi-octave-select');
            setMidiSelectValue(octSel2, oct);
            var keySel2 = row.querySelector('.midi-key-shift-select');
            setMidiSelectValue(keySel2, keyShift);
        }
        updateChannelRangeAfter(row, mode);
    }

    // 根据当前模式更新单行的偏移后音域显示和 select 的 disabled 状态
    function updateChannelRangeAfter(row, mode) {
        var octSel = row.querySelector('.midi-octave-select');
        var keySel = row.querySelector('.midi-key-shift-select');
        var afterCell = row.querySelector('.midi-range-after');
        if (!afterCell) return;

        // select 的 disabled 状态: mode 0 可编辑, mode 1/2/3 只读
        var readOnly = (mode !== 0);
        if (octSel) octSel.disabled = readOnly;
        if (keySel) keySel.disabled = readOnly;
        // 视觉反馈: disabled 时灰显 (因为 HTML 内联样式覆盖了 CSS 的 select:disabled)
        var dimStyle = readOnly ? '0.55' : '1';
        var dimColor = readOnly ? 'var(--text-disabled)' : 'var(--text-primary)';
        var dimBg = readOnly ? 'var(--ctrl-fill-disabled)' : 'var(--ctrl-fill-default)';
        if (octSel) { octSel.style.opacity = dimStyle; octSel.style.color = dimColor; octSel.style.backgroundColor = dimBg; }
        if (keySel) { keySel.style.opacity = dimStyle; keySel.style.color = dimColor; keySel.style.backgroundColor = dimBg; }
        // 通知 custom_dropdown 刷新禁用状态
        try {
            if (window.CustomDropdown) {
                if (octSel) window.CustomDropdown.refresh && window.CustomDropdown.refresh(octSel);
                if (keySel) window.CustomDropdown.refresh && window.CustomDropdown.refresh(keySel);
            }
        } catch(e) {}

        // 计算偏移后音域
        var ch = parseInt(row.getAttribute('data-channel'));
        var chInfo = null;
        if (state._midiInfo && state._midiInfo.channels) {
            for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                if (state._midiInfo.channels[ci].channel === ch) { chInfo = state._midiInfo.channels[ci]; break; }
            }
        }
        if (!chInfo) return;
        var octave = octSel ? (parseInt(octSel.value) || 0) : 0;
        var keyShift = keySel ? (parseInt(keySel.value) || 0) : 0;
        afterCell.innerHTML = getChannelRangeAfterText(chInfo, octave, keyShift, mode);

        // 标记超出 MC 标准音域的偏移后音域为红色
        var minNote = chInfo.min_note;
        var maxNote = chInfo.max_note;
        if (minNote != null && maxNote != null && mode !== 1) {
            var afterMin = minNote + octave * 12 + keyShift;
            var afterMax = maxNote + octave * 12 + keyShift;
            if (afterMin < MC_MIDI_MIN || afterMax > MC_MIDI_MAX) {
                afterCell.style.color = 'var(--accent-orange,#ff8c42)';
            } else {
                afterCell.style.color = 'var(--text-secondary)';
            }
        } else {
            afterCell.style.color = 'var(--text-secondary)';
        }
    }

    function showMidiPopup() {
        var p = $('midi-popup');
        if (!p) return;
        // 打开 MIDI 导入弹窗时暂停 NBS 播放
        if (state.isPlaying) {
            handlePlayToggle();
        }
        p.classList.add('active');
        p.style.display = 'flex';
        // 默认显示乐器标签页
        switchMidiTab('midi-basic');
        // 重置已解析事件，populateMidiDialog 会在行构建后重新解析
        state._midiParsedEvents = null;
    }

    function closeMidiPopup() {
        stopMidiTrackPlayback();
        stopSustainTrackPreview();
        stopMidiPreview();
        var p = $('midi-popup');
        if (p) { p.classList.remove('active'); p.style.display = ''; }
        $('file-input').value = '';
        state._midiFile = null;
        state._midiInfo = null;
        state._midiTrackInfo = null;
        N.shared._midiTrackStates = {};
        N.shared._substituteSelectedTracks = null; // 重置音色替代 track 选择
    }

    function switchMidiTab(tabName) {
        // 更新标签按钮
        var tabs = document.querySelectorAll('.midi-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
        }
        // 更新面板
        var panels = document.querySelectorAll('.midi-tab-panel');
        var activePanel = null;
        for (var j = 0; j < panels.length; j++) {
            var isActive = panels[j].id === 'midi-tab-' + tabName.replace('midi-', '');
            panels[j].classList.toggle('active', isActive);
            if (isActive) activePanel = panels[j];
        }
        // 若该主标签页下没有子标签页被激活，默认显示第一个，避免内容空白
        if (activePanel) {
            var activeSub = activePanel.querySelector('.midi-sub-tab.active');
            if (!activeSub) {
                var firstSub = activePanel.querySelector('.midi-sub-tab');
                if (firstSub) switchMidiSubTab(firstSub.getAttribute('data-subtab'));
            }
        }
    }

    function switchMidiSubTab(subtabName) {
        var subtabs = document.querySelectorAll('.midi-sub-tab');
        for (var i = 0; i < subtabs.length; i++) {
            subtabs[i].classList.toggle('active', subtabs[i].getAttribute('data-subtab') === subtabName);
        }
        var panels = document.querySelectorAll('.midi-sub-panel');
        for (var j = 0; j < panels.length; j++) {
            panels[j].classList.toggle('active', panels[j].id === 'midi-sub-' + subtabName);
        }
    }

    function buildInstrumentSelect(currentValue, channel, useAuto) {
        var html = '<select class="midi-instrument-select" data-channel="' + channel + '"' + (useAuto ? ' data-auto="1"' : '') + '>';
        if (useAuto) {
            html += '<option value="auto"' + (currentValue === 'auto' ? ' selected' : '') + '>自动(用拟合音色)</option>';
        }
        html += '<option value="-1"' + (currentValue === -1 ? ' selected' : '') + '>忽略</option>';
        for (var i = 0; i < INSTRUMENT_NAMES.length; i++) {
            var sel = (currentValue === i) ? ' selected' : '';
            html += '<option value="' + i + '"' + sel + '>' + escapeHTML(getInstName(i)) + '</option>';
        }
        html += '</select>';
        return html;
    }

    // 绑定 MIDI 导入通道乐器选择事件：当用户从"自动(用拟合音色)"切换为具体乐器时提示
    // _midiManualOverrideChannels 记录"本次导入中已提示过的通道", 仅在 populateMidiDialog 时重置
    function bindMidiInstrumentChangeEvents() {
        var selects = document.querySelectorAll('.midi-instrument-select[data-auto="1"]');
        for (var i = 0; i < selects.length; i++) {
            (function(sel) {
                // 移除旧事件避免重复绑定
                sel.onchange = null;
                sel.addEventListener('change', function() {
                    var channel = sel.getAttribute('data-channel');
                    var val = sel.value;
                    // 只有切到具体乐器时才提示; 切回"自动"不做任何提示, 也不清除已提示标记
                    if (val === 'auto') return;
                    // 如果此前没有手动覆盖过, 弹窗提示
                    if (!state._midiManualOverrideChannels[channel]) {
                        showMidiOverrideWarning(sel, channel);
                    }
                    state._midiManualOverrideChannels[channel] = true;
                });
            })(selects[i]);
        }
    }

    function showMidiOverrideWarning(sel, channel) {
        var existing = $('midi-override-warning-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="midi-override-warning-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-triangle-exclamation" style="color:#ff9500;"></i>'
            + '<h4>音色覆盖提示</h4>'
            + '<button class="settings-close-btn" id="midi-override-close-x">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0;font-size:13px;color:var(--text-primary);line-height:1.6;">'
            + '通道 <b>' + channel + '</b> 当前使用拟合音色。你手动选择了具体乐器后，'
            + '<b>该通道将不再跟随拟合结果改变</b>，即后续在"音色拟合"标签页中调整的组合音色不会应用到这个通道。'
            + '</p>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="midi-override-cancel">恢复自动</button>'
            + '<button class="popup-btn popup-btn-primary" id="midi-override-confirm">知道了</button>'
            + '</div>'
            + '</div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var p = $('midi-override-warning-popup');
            if (p) p.remove();
        }

        wrapper.querySelector('#midi-override-close-x').addEventListener('click', close);
        wrapper.querySelector('#midi-override-confirm').addEventListener('click', close);
        wrapper.querySelector('#midi-override-cancel').addEventListener('click', function() {
            sel.value = 'auto';
            close();
        });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) close();
        });
    }

    function buildOctaveSelect(currentValue, channel, minNote, maxNote) {
        var valid = getValidOctaveRange(minNote, maxNote);
        var html = '<select class="midi-octave-select" data-channel="' + channel + '" data-min-note="' + (minNote || 0) + '" data-max-note="' + (maxNote || 0) + '">';
        for (var o = -3; o <= 3; o++) {
            var disabled = valid.indexOf(o) < 0 ? ' disabled' : '';
            var sel = (currentValue === o) ? ' selected' : '';
            var label = o >= 0 ? '+' + o : '' + o;
            html += '<option value="' + o + '"' + sel + disabled + '>' + label + '</option>';
        }
        html += '</select>';
        return html;
    }

    function buildKeyShiftSelect(currentValue, channel, minNote, maxNote, octave) {
        var range = getValidKeyRange(minNote, maxNote, octave);
        var html = '<select class="midi-key-shift-select" data-channel="' + channel + '">';
        for (var k = -12; k <= 12; k++) {
            var disabled = (k < range.min || k > range.max) ? ' disabled' : '';
            var sel = (currentValue === k) ? ' selected' : '';
            var label = k >= 0 ? '+' + k : '' + k;
            html += '<option value="' + k + '"' + sel + disabled + '>' + label + '</option>';
        }
        html += '</select>';
        return html;
    }

    // 计算通道在 NBS 音域(0~87)内的有效八度偏移范围
    function getValidOctaveRange(minNote, maxNote) {
        var targetMin = 0;
        var targetMax = 87;
        var min0 = (minNote || 0) - 21;
        var max0 = (maxNote || 0) - 21;
        var valid = [];
        for (var o = -10; o <= 10; o++) {
            if (min0 + 12 * o >= targetMin && max0 + 12 * o <= targetMax) {
                valid.push(o);
            }
        }
        if (valid.length === 0) {
            // 如果 NBS 全音域都无法满足, 返回所有八度作为可选
            for (var o2 = -10; o2 <= 10; o2++) valid.push(o2);
        }
        return valid;
    }

    // 计算指定八度下的有效 Key 微调范围
    function getValidKeyRange(minNote, maxNote, octave) {
        var min0 = (minNote || 0) - 21;
        var max0 = (maxNote || 0) - 21;
        var minKey = min0 + 12 * (octave || 0);
        var maxKey = max0 + 12 * (octave || 0);
        var minK = -minKey;
        var maxK = 87 - maxKey;
        return { min: Math.max(-12, minK), max: Math.min(12, maxK) };
    }

    // 根据用户偏好选择默认八度偏移
    function getDefaultOctave(minNote, maxNote, preferredOctave) {
        var valid = getValidOctaveRange(minNote, maxNote);
        if (valid.length === 0) return 0;
        if (valid.indexOf(preferredOctave) >= 0) return preferredOctave;
        // 优先选 0，否则选绝对值最小的
        if (valid.indexOf(0) >= 0) return 0;
        return valid.reduce(function(prev, curr) {
            return Math.abs(curr) < Math.abs(prev) ? curr : prev;
        });
    }

    // 显示 MIDI 弹窗内的非阻塞提示（替代 alert）
    function showMidiNotice(message, type) {
        type = type || 'info';
        var existing = document.getElementById('midi-notice');
        if (existing) existing.remove();
        var notice = document.createElement('div');
        notice.id = 'midi-notice';
        notice.className = 'midi-notice midi-notice-' + type;
        notice.textContent = message;
        var dialog = document.querySelector('.midi-import-dialog');
        if (dialog) dialog.appendChild(notice);
        setTimeout(function() {
            if (notice.parentNode) notice.parentNode.removeChild(notice);
        }, 3000);
    }

    // 完整的 MIDI note 名称 (0~127, C-1 ~ G9, C4=中央C=60)
    function midiNoteToName(note) {
        if (note === undefined || note === null || note < 0 || note > 127) return '-';
        var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        var octave = Math.floor(note / 12) - 1;
        return names[note % 12] + octave;
    }

    // 根据通道的 min_note/max_note 生成八度范围显示文本
    // 格式: "范围: C3 ~ C6 (3 个八度)"
    function getChannelNoteRangeText(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '范围: -';
        }
        var minName = midiNoteToName(minNote);
        var maxName = midiNoteToName(maxNote);
        var octaves = Math.max(0, Math.floor(maxNote / 12) - Math.floor(minNote / 12));
        return '范围: ' + minName + ' ~ ' + maxName + ' (' + octaves + ' 个八度)';
    }

    // 短格式音域文本: "F#2 ~ F#4 (2 个八度)" - 用于通道映射表
    function getChannelRangeShort(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '-';
        }
        var minName = midiNoteToName(minNote);
        var maxName = midiNoteToName(maxNote);
        var octaves = Math.max(0, Math.round((maxNote - minNote) / 12));
        return minName + ' ~ ' + maxName + '<br><span style="font-size:10px;color:var(--text-tertiary);">' + octaves + ' 八度</span>';
    }

    // 计算偏移后音域文本 (基于 octave + keyShift)
    // mode 0: 偏移前=偏移后; mode 1: 归一化结果; mode 2/3: 偏移前+偏移量
    function getChannelRangeAfterText(ch, octave, keyShift, mode) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '-';
        }
        if (mode === 1) {
            // 单独音符归一法: 每个音符 ±12 取模到 [MC_MIDI_MIN, MC_MIDI_MAX]
            return midiNoteToName(MC_MIDI_MIN) + ' ~ ' + midiNoteToName(MC_MIDI_MAX) + '<br><span style="font-size:10px;color:var(--text-tertiary);">归一化</span>';
        }
        var offset = (octave || 0) * 12 + (keyShift || 0);
        if (offset === 0) {
            // 无偏移: 直接返回偏移前音域
            var minName0 = midiNoteToName(minNote);
            var maxName0 = midiNoteToName(maxNote);
            return minName0 + ' ~ ' + maxName0 + '<br><span style="font-size:10px;color:var(--text-tertiary);">无偏移</span>';
        }
        var afterMin = minNote + offset;
        var afterMax = maxNote + offset;
        var minName = midiNoteToName(afterMin);
        var maxName = midiNoteToName(afterMax);
        var sign = offset >= 0 ? '+' : '';
        return minName + ' ~ ' + maxName + '<br><span style="font-size:10px;color:var(--text-tertiary);">总偏移 ' + sign + offset + '</span>';
    }

    // 从拟合表读取每通道实际乐器名, 填入通道映射表 NBS 乐器列
    function fillChannelInstrumentNames() {
        var fitting = collectTimbreFitting();
        var channels = fitting && fitting.channels ? fitting.channels : {};
        var rows = document.querySelectorAll('#midi-channel-rows tr[data-channel]');
        for (var i = 0; i < rows.length; i++) {
            var ch = parseInt(rows[i].getAttribute('data-channel'));
            var cell = rows[i].querySelector('.midi-channel-inst');
            if (!cell) continue;
            var slots = channels[ch];
            var instId = (slots && slots[0] >= 0) ? slots[0] : -1;
            if (instId < 0) {
                // 回退到 default_instrument (info.channels 中)
                var defInst = 0;
                if (state._midiInfo && state._midiInfo.channels) {
                    for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                        if (state._midiInfo.channels[ci].channel === ch) {
                            defInst = state._midiInfo.channels[ci].default_instrument || 0;
                            break;
                        }
                    }
                }
                instId = defInst;
            }
            cell.textContent = getInstName(instId);
            // 标记超出 MC 标准音域的乐器
            var instOffset = INSTRUMENT_OFFSET[instId] || 0;
            if (instOffset !== 0) {
                cell.style.color = 'var(--text-primary)';
            } else {
                cell.style.color = 'var(--text-secondary)';
            }
        }
    }

    // 计算通道试听音符: 取平均音高，四舍五入到最近八度，返回该八度的 C-D-E-F (MIDI note)
    function getChannelPreviewNotes(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return [60, 62, 64, 65]; // 默认 C4-D4-E4-F4
        }
        var avg = Math.round((minNote + maxNote) / 2);
        // 四舍五入到最近八度的 C (12 的倍数，C-1=0)
        var baseOctave = Math.round(avg / 12);
        var base = baseOctave * 12;
        return [base, base + 2, base + 4, base + 5];
    }

    function buildPitchSelect(currentValue, note) {
        var html = '<select class="midi-pitch-select" data-note="' + note + '">';
        for (var i = 0; i < 88; i++) {
            var sel = (currentValue === i) ? ' selected' : '';
            html += '<option value="' + i + '"' + sel + '>' + NOTE_NAMES[i] + ' (' + i + ')</option>';
        }
        html += '</select>';
        return html;
    }

    function handleMidiOpen(e) {
        var file = e.target.files[0];
        if (!file) return;
        state._midiFile = file;
        state._midiHash = null;

        // 显示弹窗
        showMidiPopup();

        // 显示文件名
        $setText('midi-file-name', file.name);
        $setText('midi-type', '...');
        $setText('midi-duration', '...');
        $setText('midi-tracks', '...');
        $setText('midi-notes', '...');

        // 请求 MIDI 信息 + 计算文件内容哈希 (配置按哈希区分)
        showTaskProgress(file.name);
        var infoPromise = API.getMidiInfo(file, function(loaded, total, speed, percent, eta) {
            updateTaskProgress(loaded, total, speed, percent, eta);
        });
        Promise.all([computeMidiFileHash(file), infoPromise]).then(function(res) {
            hideTaskProgress();
            state._midiHash = res[0];
            var data = res[1];
            if (data.success && data.info) {
                state._midiInfo = data.info;
                populateMidiDialog(data.info);
            }
        }).catch(function(err) {
            hideTaskProgress();
            var msg = formatError(err, '无法读取 MIDI 信息');
            $setText('midi-type', '错误: ' + msg);
            showAppAlert('读取 MIDI 信息失败: ' + msg, {title: 'MIDI 信息', icon: 'fa-solid fa-file-audio'});
        });
    }

    function populateMidiDialog(info) {
        // 该 MIDI 文件之前导入过 → 恢复它的完整配置; 没有则回到默认推荐值
        var fileConfig = getMidiConfigForHash(state._midiHash);
        if (fileConfig && fileConfig.basic) applyMidiBasicConfig(fileConfig.basic);
        else resetMidiBasicToDefaults();
        N.shared._midiFittingLevelOverride = (fileConfig && fileConfig.fitting_level) ? fileConfig.fitting_level : null;
        updateFittingLevelUI();
        state._midiTimbreFittingSaved = (fileConfig && fileConfig.fitting_saved)
            ? JSON.parse(JSON.stringify(fileConfig.fitting_saved))
            : emptyTimbreFittingSaved();

        // 更新文件信息
        $setText('midi-type', info.type);
        $setText('midi-duration', info.duration);
        $setText('midi-tracks', info.track_count + ' 轨道');
        $setText('midi-notes', info.total_notes + ' 音符');

        // 构建通道表格（音轨设置）
        var channelRows = $('midi-channel-rows');
        if (channelRows) {
            channelRows.innerHTML = '';
            var channels = info.channels || [];
            // 保存通道信息供试听使用
            state._midiChannelInfo = channels;
            for (var i = 0; i < channels.length; i++) {
                var ch = channels[i];
                if (ch.is_percussion) continue; // 打击乐在拟合表中设置
                if ((ch.note_count || 0) === 0) continue; // 只显示有音符的旋律通道
                var rangeBefore = getChannelRangeShort(ch);
                var defaultOctave = getDefaultOctave(ch.min_note, ch.max_note, ch.default_octave || 0);
                var row = document.createElement('tr');
                row.setAttribute('data-channel', ch.channel);
                row.setAttribute('data-program', ch.program || 0);
                row.innerHTML =
                    '<td>' + ch.channel + '</td>' +
                    '<td>' + (ch.program_name || 'Unknown') + '</td>' +
                    '<td class="midi-channel-inst" style="font-size:11px;color:var(--text-secondary);">-</td>' +
                    '<td class="midi-range-before" style="font-size:11px;color:var(--text-secondary);">' + rangeBefore + '</td>' +
                    '<td>' + buildOctaveSelect(defaultOctave, ch.channel, ch.min_note, ch.max_note) + '</td>' +
                    '<td>' + buildKeyShiftSelect(0, ch.channel, ch.min_note, ch.max_note, defaultOctave) + '</td>' +
                    '<td class="midi-range-after" style="font-size:11px;color:var(--text-secondary);">-</td>' +
                    '<td>' +
                    '  <button class="midi-preview-btn midi-preview-midi" data-channel="' + ch.channel + '" title="试听 MIDI 原音"><i class="fa-solid fa-music"></i></button>' +
                    '  <button class="midi-preview-btn midi-preview-nbs" data-channel="' + ch.channel + '" title="试听 NBS 拟合音色"><i class="fa-solid fa-layer-group"></i></button>' +
                    '</td>';
                channelRows.appendChild(row);
            }
            // 如果没有通道数据，显示提示
            if (channelRows.children.length === 0) {
                channelRows.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);">未检测到旋律通道</td></tr>';
            } else {
                bindMidiPreviewButtons();
                bindMidiOctaveKeyChange();
                fillChannelInstrumentNames();
            }
        }

        // 构建打击乐表格
        var percussionRows = $('midi-percussion-rows');
        if (percussionRows) {
            percussionRows.innerHTML = '';
            var percussion = info.percussion || [];
            for (var j = 0; j < percussion.length; j++) {
                var p = percussion[j];
                var row = document.createElement('tr');
                var instHtml = buildInstrumentSelect(p.default_instrument, 'perc_' + p.note);
                // 用 data-note 区分打击乐
                instHtml = instHtml.replace('data-channel="perc_', 'data-perc="');
                instHtml = instHtml.replace('midi-instrument-select', 'midi-perc-instrument-select');
                var pitchHtml = buildPitchSelect(p.default_pitch, p.note);
                pitchHtml = pitchHtml.replace('midi-pitch-select', 'midi-perc-pitch-select');
                row.innerHTML =
                    '<td class="percussion-note">' + p.note + '</td>' +
                    '<td>' + p.name + '</td>' +
                    '<td>' + instHtml + '</td>' +
                    '<td>' + pitchHtml + '</td>';
                percussionRows.appendChild(row);
            }
            if (percussion.length === 0) {
                percussionRows.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">未检测到打击乐音符</td></tr>';
            }
        }

        // 构建 MIDI 轨道表格
        buildMidiTrackRows(info);
        // 构建音色拟合行
        buildTimbreFittingRows(info);
        // 拟合表建立后, 刷新通道映射表的 NBS 乐器列 (使用拟合 slot1 实际值)
        fillChannelInstrumentNames();

        // 解析 MIDI 文件用于轨道可视化（每行迷你音符图）
        // 在 buildMidiTrackRows 之后调用，确保行已存在
        if (state._midiFile && !state._midiParsedEvents) {
            var _preader = new FileReader();
            _preader.onload = function(e) {
                state._midiParsedEvents = parseMidiFileForPlayback(e.target.result, info);
                initMidiTrackMiniRolls();
            };
            _preader.readAsArrayBuffer(state._midiFile);
        }

        // 延音轨道: 该文件保存过 → 沿用; 否则按 GM 持续型音色自动判定
        if (fileConfig && Array.isArray(fileConfig.sustain_track_indices)) {
            N.shared._sustainTrackIndices = fileConfig.sustain_track_indices.slice();
        } else {
            N.shared._sustainTrackIndices = detectSustainTrackIndices(info);
            if (N.shared._sustainTrackIndices.length > 0) {
                var _knlSel = $('midi-keep-note-length');
                if (_knlSel && _knlSel.value === 'none') _knlSel.value = 'sustain';
            }
        }
        // 恢复保存的打击乐音色/音高映射
        applySavedPercussionPrefs(fileConfig);
        updateSustainTracksUI();
        updateSnapGridInfo();

        // 去重/重排序依赖关系: 未勾选"消除重复音符"时禁用"重排序音符"
        var _dupChkBinder = $('midi-dedupe-notes');
        if (_dupChkBinder && !_dupChkBinder.dataset.reorderBinder) {
            _dupChkBinder.dataset.reorderBinder = '1';
            _dupChkBinder.addEventListener('change', updateMidiDedupeReorderUI);
        }
        updateMidiDedupeReorderUI();

        // 关键修复: 通道行构建完成后, 必须重新应用当前音域处理模式
        // 否则 updateChannelOctaveForMode 不会被执行, 通道行会停留在默认值,
        // 导致导入时八度偏移错误 (间歇性BUG的根因)
        var _curMode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
        updateChannelOctaveForMode(_curMode);
        // 刷新音域处理提示 (显示预计超出音符数)
        updateOctaveModeHint(_curMode);
    }

    // ========== 音轨设置试听 ==========

    var _midiPreviewTimeout = null;
    var _midiPreviewNotes = []; // 当前正在试听的音符 {source, timeout}

    // TinySynth 软合成器（Web MIDI 不可用时回退使用）
    // SF3 音色库就绪时, 优先使用 SF3Player 替代 TinySynth
    var _tinySynth = null;
    function getTinySynth() {
        // SF3 音色库就绪 → 优先使用
        if (window.SoundfontLoader && SoundfontLoader.isReady()) {
            return SoundfontLoader.getPlayer();
        }
        if (typeof WebAudioTinySynth === 'undefined') return null;
        if (!_tinySynth) {
            _tinySynth = new WebAudioTinySynth({ quality: 2, useReverb: 1, voices: 96 });
            // 尽量与项目 AudioEngine 共享 AudioContext，保证时间线一致
            var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
            if (!ctx && window.AudioEngine && AudioEngine.init) {
                try { AudioEngine.init(); } catch(e) {}
                ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
            }
            if (ctx) {
                try { _tinySynth.setAudioContext(ctx); } catch(e) {}
            }
        }
        return _tinySynth;
    }
    function prepareTinySynthProgram(synth, channel, program) {
        var ch = (channel || 0) & 0x0F;
        var pgm = Math.max(0, Math.min(127, program || 0));
        try { synth.setQuality && synth.setQuality(2); } catch(e) {}
        try { synth.setReverb && synth.setReverb(0.22); } catch(e2) {}
        try { synth.send([0xB0 | ch, 0, 0]); } catch(e3) {}
        try { synth.send([0xB0 | ch, 32, 0]); } catch(e4) {}
        try { synth.setProgram(ch, pgm); } catch(e5) {
            try { synth.send([0xC0 | ch, pgm]); } catch(e6) {}
        }
        return ch;
    }
    function stopTinySynthAll() {
        var synth = getTinySynth();
        if (!synth) return;
        // SF3Player 有 noteOffAll 方法, TinySynth 逐通道 allSoundOff
        if (synth.noteOffAll) {
            try { synth.noteOffAll(); } catch(e) {}
        } else {
            for (var ch = 0; ch < 16; ch++) {
                try { synth.allSoundOff(ch); } catch(e) {}
            }
        }
    }

    // ========== MIDI 音源选择设置 ==========
    function getEffectiveMidiSource() {
        if (navigator.requestMIDIAccess) return 'webmidi';
        if (window.SoundfontLoader && SoundfontLoader.isReady()) return 'sf3';
        return 'tinysynth';
    }

    function stopMidiPreview() {
        if (_midiPreviewTimeout) {
            clearTimeout(_midiPreviewTimeout);
            _midiPreviewTimeout = null;
        }
        for (var i = 0; i < _midiPreviewNotes.length; i++) {
            var n = _midiPreviewNotes[i];
            if (n.timeout) clearTimeout(n.timeout);
            if (n.source) {
                try { n.source.stop(); } catch(e) {}
                try { n.source.disconnect(); } catch(e) {}
            }
            if (n.noteOff) n.noteOff();
            if (n.synth && n.synthNoteOff) n.synthNoteOff();
        }
        _midiPreviewNotes = [];
        stopTinySynthAll();
    }

    function getChannelSettings(channel) {
        var row = document.querySelector('#midi-channel-rows tr[data-channel="' + channel + '"]');
        if (!row) return { octave: 0, keyShift: 0 };
        var octSel = row.querySelector('.midi-octave-select');
        var keySel = row.querySelector('.midi-key-shift-select');
        return {
            octave: octSel ? parseInt(octSel.value) || 0 : 0,
            keyShift: keySel ? parseInt(keySel.value) || 0 : 0
        };
    }

    function getFittingSlotsForChannel(channel) {
        // 从音色拟合表中查找该通道的 slot 设置
        var row = document.querySelector('#midi-timbre-melody-rows tr[data-type="melody"][data-channel="' + channel + '"]');
        if (!row) return null;
        var slots = row.querySelectorAll('.timbre-slot');
        var result = [];
        for (var i = 0; i < slots.length; i++) {
            result.push(parseInt(slots[i].value));
        }
        return result;
    }

    function midiNoteToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    // GM program → 试听用 NBS 乐器（Web MIDI 不可用时作为 TinySynth 回退）
    function gmProgramToNbsInstrument(program) {
        // 与后端 GM_PROGRAM_TABLE 保持一致，仅列出常见映射
        var map = {
            0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0,
            8:7, 9:7, 10:7, 11:10, 12:10, 13:9, 14:7, 15:5,
            16:6, 17:10, 18:6, 19:6, 20:6, 21:6, 22:6, 23:6,
            24:5, 25:5, 26:0, 27:5, 28:1, 29:5, 30:5, 31:5,
            32:1, 33:1, 34:1, 35:1, 36:1, 37:1, 38:1, 39:1,
            40:6, 41:6, 42:6, 43:6, 44:1, 45:6, 46:6, 47:6,
            48:6, 49:6, 50:6, 51:6, 52:6, 53:6, 54:6, 55:6,
            56:6, 57:6, 58:12, 59:12, 60:12, 61:12, 62:6, 63:6,
            64:6, 65:6, 66:6, 67:6, 68:6, 69:6, 70:6, 71:6,
            72:6, 73:6, 74:6, 75:6, 76:6, 77:6, 78:6, 79:6,
            80:13, 81:13, 82:13, 83:13, 84:5, 85:15, 86:5, 87:5,
            88:8, 89:6, 90:8, 91:6, 92:8, 93:6, 94:6, 95:8,
            96:8, 97:6, 98:8, 99:6, 100:15, 101:6, 102:6, 103:5,
            104:14, 105:14, 106:14, 107:5, 108:10, 109:6, 110:6, 111:6,
            112:8, 113:11, 114:10, 115:9, 116:2, 117:3, 118:3, 119:8,
            120:5, 121:6, 122:8, 123:6, 124:7, 125:7, 126:7, 127:3
        };
        return map[program] !== undefined ? map[program] : 0;
    }

    function playMidiPreviewWithWebMidi(notes, channel, program, onUnavailable) {
        if (!navigator.requestMIDIAccess) {
            if (onUnavailable) onUnavailable();
            return false;
        }
        try {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (!outputs || outputs.size === 0) {
                    if (onUnavailable) onUnavailable();
                    return;
                }
                var output = outputs.values().next().value;
                var ch = (channel || 0) & 0x0F;
                // 先发送 bank select (GM bank 0) + program change，再延迟发音，
                // 确保合成器在收到 note-on 前已完成音色切换（避免听到上一个音色）
                if (ch !== 9) {
                    try { output.send([0xB0 | ch, 0, 0]); } catch(e) {}
                    try { output.send([0xB0 | ch, 32, 0]); } catch(e) {}
                }
                try {
                    output.send([0xC0 | ch, program & 0x7F]);
                } catch(e) {}
                notes.forEach(function(note, index) {
                    var t = 80 + index * 200;
                    var timeoutOn = setTimeout(function() {
                        try {
                            output.send([0x90 | ch, note & 0x7F, 100]);
                        } catch(e) {}
                    }, t);
                    var timeoutOff = setTimeout(function() {
                        try {
                            output.send([0x80 | ch, note & 0x7F, 0]);
                        } catch(e) {}
                    }, t + 180);
                    _midiPreviewNotes.push({ timeout: timeoutOn });
                    _midiPreviewNotes.push({ timeout: timeoutOff });
                });
                var stopT = setTimeout(stopMidiPreview, 80 + notes.length * 200 + 300);
                _midiPreviewTimeout = stopT;
            }).catch(function(err) {
                console.warn('Web MIDI API 失败:', err);
                if (onUnavailable) onUnavailable();
            });
            return true;
        } catch(e) {
            if (onUnavailable) onUnavailable();
            return false;
        }
    }

    // Web MIDI 不可用时，使用 TinySynth 软合成器回退，严格遵循原 MIDI 乐器/音符
    function playMidiPreviewFallback(notes, channel, program) {
        // 真正需要播放 MIDI 音符时: 按设置触发音色库下载/询问
        ensureSoundfontOnDemand();
        var synth = getTinySynth();
        if (!synth) {
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        var ch = prepareTinySynthProgram(synth, channel, program);
        notes.forEach(function(note, index) {
            var tOn = setTimeout(function() {
                try { synth.noteOn(ch, note & 0x7F, 100); } catch(e) {}
            }, index * 200);
            var tOff = setTimeout(function() {
                try { synth.noteOff(ch, note & 0x7F); } catch(e) {}
            }, index * 200 + 180);
            _midiPreviewNotes.push({ timeout: tOn });
            _midiPreviewNotes.push({ timeout: tOff });
        });
        var stopT = setTimeout(stopMidiPreview, notes.length * 200 + 300);
        _midiPreviewTimeout = stopT;
    }

    function previewMidiChannel(channel) {
        stopMidiPreview();
        var info = state._midiInfo;
        if (!info) return;
        var chInfo = null;
        var channels = info.channels || [];
        for (var i = 0; i < channels.length; i++) {
            if (channels[i].channel === channel) {
                chInfo = channels[i];
                break;
            }
        }
        if (!chInfo) return;
        var notes = getChannelPreviewNotes(chInfo);
        var program = chInfo.program || 0;

        var started = playMidiPreviewWithWebMidi(notes, channel, program, function() {
            // Web MIDI 不可用或失败时静默回退到 TinySynth
            playMidiPreviewFallback(notes, channel, program);
        });
        if (!started) {
            playMidiPreviewFallback(notes, channel, program);
        }
    }

    function previewNbsChannel(channel) {
        stopMidiPreview();
        if (!window.AudioEngine || !AudioEngine.playNote) {
            showAppAlert('无法试听：NBS 音频引擎未就绪。', {title: '试听失败', icon: 'fa-solid fa-volume-xmark'});
            return;
        }
        var settings = getChannelSettings(channel);
        var slots = getFittingSlotsForChannel(channel);
        var info = state._midiInfo;
        var chInfo = null;
        if (info && info.channels) {
            for (var i = 0; i < info.channels.length; i++) {
                if (info.channels[i].channel === channel) {
                    chInfo = info.channels[i];
                    break;
                }
            }
        }
        var notes = chInfo ? getChannelPreviewNotes(chInfo) : [60, 62, 64, 65];

        // 过滤出有效的 slot
        var instruments = [];
        if (slots) {
            for (var s = 0; s < slots.length; s++) {
                if (slots[s] >= 0) instruments.push(slots[s]);
            }
        }
        if (instruments.length === 0) {
            // 没有拟合设置时使用 GM 默认映射
            instruments = [gmProgramToNbsInstrument(chInfo ? chInfo.program : 0)];
        }

        notes.forEach(function(midiNote, index) {
            var nbsKey = midiNote - 21 + 12 * settings.octave + settings.keyShift;
            if (nbsKey < 0 || nbsKey > 87) {
                // 单个音符越界跳过，不影响其他音符
                return;
            }
            var t = setTimeout(function() {
                for (var j = 0; j < instruments.length; j++) {
                    AudioEngine.playNote(instruments[j], nbsKey, 85);
                }
            }, index * 200);
            _midiPreviewNotes.push({ timeout: t });
        });
        var stopT = setTimeout(stopMidiPreview, notes.length * 200 + 300);
        _midiPreviewTimeout = stopT;
    }

    function bindMidiPreviewButtons() {
        var midiBtns = document.querySelectorAll('#midi-channel-rows .midi-preview-midi');
        for (var i = 0; i < midiBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var ch = parseInt(btn.getAttribute('data-channel'));
                    previewMidiChannel(ch);
                });
            })(midiBtns[i]);
        }
        var nbsBtns = document.querySelectorAll('#midi-channel-rows .midi-preview-nbs');
        for (var j = 0; j < nbsBtns.length; j++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var ch = parseInt(btn.getAttribute('data-channel'));
                    previewNbsChannel(ch);
                });
            })(nbsBtns[j]);
        }
    }

    // ========== MIDI 轨道播放控制 ==========

    N.shared._midiTrackStates = {};  // { trackIndex: { muted, solo, excluded } }
    N.shared._sustainTrackIndices = []; // 用户手动选择的需要应用延音的 MIDI 轨道索引
    // MIDI 导入配置: 仅内存缓存, 按「文件内容哈希」区分, 刷新页面即清空 (不持久化)
    var _midiPrefsByHash = {};
    var _midiTrackPlayback = {
        playing: false,
        startTime: 0,
        pauseTime: 0,
        duration: 0,
        rafId: null,
        scheduled: [],  // { timeout, source/noteOff }
        output: null,
        events: [],     // 解析后的 MIDI 事件列表 {track, tick, type, channel, note, velocity, duration}
        useWebMidi: false
    };

    function initMidiTrackStates(info) {
        N.shared._midiTrackStates = {};
        state._trackChannels = {};   // trackIndex → [channels]
        state._channelTracks = {};   // channel → [trackIndices]
        var tracks = info && info.tracks ? info.tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            var tIdx = tracks[i].index;
            N.shared._midiTrackStates[tIdx] = { muted: false, solo: false, excluded: false };
            // 保存 track → channels 映射
            var chs = tracks[i].channels || [];
            state._trackChannels[tIdx] = chs;
            // 构建反向映射 channel → tracks
            for (var c = 0; c < chs.length; c++) {
                var ch = chs[c];
                if (!state._channelTracks[ch]) state._channelTracks[ch] = [];
                if (state._channelTracks[ch].indexOf(tIdx) === -1) {
                    state._channelTracks[ch].push(tIdx);
                }
            }
        }
    }

    // 检查某 channel 的所有相关 track 是否都被排除
    function isChannelExcluded(channel) {
        var trackIndices = state._channelTracks ? state._channelTracks[channel] : null;
        if (!trackIndices || trackIndices.length === 0) return false;
        for (var i = 0; i < trackIndices.length; i++) {
            var st = getMidiTrackState(trackIndices[i]);
            if (!st.excluded) return false;
        }
        return true;
    }

    // 检查某 channel 是否应该播放（用于 NBS 播放过滤）
    function isChannelAudible(channel) {
        var trackIndices = state._channelTracks ? state._channelTracks[channel] : null;
        if (!trackIndices || trackIndices.length === 0) return true; // 无映射信息时不阻止播放
        // 如果所有相关 track 都被排除或静音，则不播放
        var hasSolo = false;
        for (var i = 0; i < trackIndices.length; i++) {
            if (getMidiTrackState(trackIndices[i]).solo) { hasSolo = true; break; }
        }
        for (var j = 0; j < trackIndices.length; j++) {
            var st = getMidiTrackState(trackIndices[j]);
            if (st.excluded || st.muted) continue;
            if (hasSolo && !st.solo) continue;
            return true; // 至少有一个 track 可播放
        }
        return false;
    }

    function getMidiTrackState(index) {
        if (!N.shared._midiTrackStates[index]) {
            N.shared._midiTrackStates[index] = { muted: false, solo: false, excluded: false };
        }
        return N.shared._midiTrackStates[index];
    }

    function setMidiTrackState(index, key, value) {
        var st = getMidiTrackState(index);
        // 记录变更前各音轨是否可播放（用于判断哪些音轨需要立即停止发声）
        var wasPlayable = {};
        for (var idx in N.shared._midiTrackStates) {
            wasPlayable[idx] = midiTrackShouldPlay(parseInt(idx));
        }
        st[key] = value;
        // 排除生成自动静音并禁止静音/独奏
        if (key === 'excluded' && value) {
            st.muted = true;
            st.solo = false;
        }
        renderAllMidiTrackRows();
        updateMidiTrackPlayerButtons();
        // 排除/静音/独奏状态改变后，刷新拟合表的禁用状态
        updateTimbreFittingDisabled();
        // 播放中：立即停止变更后不再可播放的音轨正在响的音符
        if (_midiTrackPlayback.playing) {
            for (var idx2 in N.shared._midiTrackStates) {
                var ti = parseInt(idx2);
                var nowPlayable = midiTrackShouldPlay(ti);
                if (wasPlayable[idx2] && !nowPlayable) {
                    stopTrackActiveNotes(ti);
                }
            }
        }
    }

    // 获取当前播放时间（秒），用于判断哪些音符正在响
    function getCurrentPlaybackTime() {
        if (!_midiTrackPlayback.playing) return null;
        var ctx = null;
        if (_midiTrackPlayback.backend === 'tinysynth') {
            var synth = getTinySynth();
            ctx = synth && synth.getAudioContext ? synth.getAudioContext() : null;
        }
        if (!ctx) {
            ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        }
        var now = ctx ? ctx.currentTime : (performance.now() / 1000);
        return now - _midiTrackPlayback.startTime;
    }

    // 停止指定音轨当前正在响的音符（只发 noteOff，不影响其他音轨共享同一通道的音符）
    function stopTrackActiveNotes(trackIndex) {
        if (!_midiTrackPlayback.playing) return;
        var events = _midiTrackPlayback.events;
        if (!events || events.length === 0) return;
        var now = getCurrentPlaybackTime();
        if (now == null) return;

        // 配对 noteOn/noteOff，找出当前正在响的音符（noteOn.time <= now < noteOff.time）
        var pending = {}; // key: "ch-note" → noteOn event
        var activeNotes = []; // [{channel, note}]
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.track !== trackIndex) continue;
            var key = ev.channel + '-' + ev.note;
            if (ev.type === 'noteOn') {
                pending[key] = ev;
            } else if (ev.type === 'noteOff') {
                var onEv = pending[key];
                if (onEv) {
                    if (onEv.time <= now && now < ev.time) {
                        activeNotes.push({ channel: ev.channel, note: ev.note });
                    }
                    delete pending[key];
                }
            }
        }
        // 未关闭的 noteOn（noteOn.time <= now，但无匹配 noteOff）
        for (var k in pending) {
            if (pending[k].time <= now) {
                activeNotes.push({ channel: pending[k].channel, note: pending[k].note });
            }
        }

        if (activeNotes.length === 0) return;
        var backend = _midiTrackPlayback.backend;
        for (var j = 0; j < activeNotes.length; j++) {
            var n = activeNotes[j];
            if (backend === 'webmidi' && _midiTrackPlayback.output) {
                try { _midiTrackPlayback.output.send([0x80 | (n.channel & 0x0F), n.note & 0x7F, 0]); } catch(e) {}
            } else if (backend === 'tinysynth') {
                var synth = getTinySynth();
                if (synth) {
                    try { synth.send([0x80 | (n.channel & 0x0F), n.note & 0x7F, 0]); } catch(e2) {}
                }
            }
        }
    }

    // 刷新拟合表中因音轨排除/静音而禁用的行
    function updateTimbreFittingDisabled() {
        var melodyTbody = $('midi-timbre-melody-rows');
        var percTbody = $('midi-timbre-percussion-rows');
        if (melodyTbody) {
            var rows = melodyTbody.querySelectorAll('tr.timbre-main-row');
            for (var i = 0; i < rows.length; i++) {
                var ch = parseInt(rows[i].getAttribute('data-channel'));
                var excluded = isChannelExcluded(ch);
                rows[i].classList.toggle('channel-excluded', excluded);
            }
        }
        // 打击乐 (channel 9)
        if (percTbody) {
            var prow = percTbody.querySelectorAll('tr.timbre-main-row');
            var percExcluded = isChannelExcluded(9);
            for (var j = 0; j < prow.length; j++) {
                prow[j].classList.toggle('channel-excluded', percExcluded);
            }
        }
    }

    // 根据 MIDI 音色与实际音符时值自动判定需要启用延音的轨道
    // 判定条件 (满足任一即视为延音轨道):
    //   1. 音色为 GM 持续型音色 (弦乐/管风琴/合唱/管乐/铜管/合成 Pad 等);
    //   2. 音色虽非持续型, 但实际余音/拖尾很长 (电钢琴/颤音琴/管钟/电吉他/合成贝斯/钢鼓);
    //   3. 该轨道音符实际持续时值明显偏长 (长音占比高且平均时值 >= 2 拍),
    //      说明音乐本身就有持续发声 (管乐连奏等), 视为延音。
    function detectSustainTrackIndices(info) {
        var result = [];
        if (!info) return result;
        var sustainMap = (window.NBSClient && NBSClient.GM_SUSTAIN_PROGRAMS) || null;
        if (!sustainMap) return result;
        var longTailMap = (window.NBSClient && NBSClient.GM_LONG_TAIL_PROGRAMS) || {};
        var ticksPerBeat = info.ticks_per_beat || 480;
        // 通道 → program 映射 (排除打击乐通道)
        var chProgram = {};
        var channels = info.channels || [];
        for (var i = 0; i < channels.length; i++) {
            if (channels[i].is_percussion) continue;
            chProgram[channels[i].channel] = channels[i].program || 0;
        }
        var tracks = info.tracks || [];
        for (var t = 0; t < tracks.length; t++) {
            var tr = tracks[t];
            var tl = tr.channels || [];
            var byTimbre = false;
            for (var c = 0; c < tl.length; c++) {
                var prog = chProgram[tl[c]];
                if (prog === undefined) continue;
                if (sustainMap[prog] || longTailMap[prog]) { byTimbre = true; break; }
            }
            // 实际时值判定: 长音(>=1拍)占比 >= 75% 且平均时值 >= 2 拍
            var ratio = tr.long_note_ratio || 0;
            var avgDur = tr.avg_duration_ticks || 0;
            var byDuration = (ratio >= 0.75 && avgDur >= ticksPerBeat * 2);
            if (byTimbre || byDuration) {
                result.push(tr.index);
            }
        }
        return result;
    }

    // 延音轨道选择：更新“选择延音轨道”按钮和已选数量显示
    function updateSustainTracksUI() {
        var select = $('midi-keep-note-length');
        var btn = $('midi-sustain-tracks-btn');
        var count = $('midi-sustain-tracks-count');
        if (!select || !btn || !count) return;
        var isSustain = select.value === 'sustain';
        btn.style.display = isSustain ? 'inline-flex' : 'none';
        count.style.display = isSustain ? 'inline' : 'none';
        count.textContent = '已选择 ' + N.shared._sustainTrackIndices.length + ' 个轨道';
    }

    // MIDI 导入: "重排序音符"依赖"消除重复音符", 未勾选去重时自动禁用
    function updateMidiDedupeReorderUI() {
        var dupChk = $('midi-dedupe-notes');
        var reChk = $('midi-dedupe-reorder');
        if (!dupChk || !reChk || !reChk.closest) return;
        var enabled = dupChk.checked;
        reChk.disabled = !enabled;
        var wrap = reChk.closest('label');
        if (wrap) wrap.style.opacity = enabled ? '1' : '0.45';
    }

    // 转义 HTML 文本，避免弹窗中轨道名称出现注入
    function escapeHtml(text) {
        if (text == null) return '';
        return String(text).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    // 打开延音轨道多选弹窗
    function showSustainTracksDialog() {
        var info = state._midiInfo;
        if (!info || !info.tracks || info.tracks.length === 0) return;
        var existing = $('sustain-tracks-popup');
        if (existing) existing.remove();

        var tracks = info.tracks;
        var listHtml = '';
        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            var checked = N.shared._sustainTrackIndices.indexOf(t.index) !== -1 ? 'checked' : '';
            listHtml += '<div class="sustain-track-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--ctrl-stroke-default);">'
                + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:180px;overflow:hidden;flex-shrink:0;">'
                + '<input type="checkbox" class="sustain-track-checkbox" value="' + t.index + '" ' + checked + '>'
                + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#' + t.index + ' ' + escapeHtml(t.name) + '</span>'
                + '</label>'
                + '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;width:56px;text-align:right;">音符 ' + (t.note_count || 0) + '</span>'
                + '<button class="sustain-track-preview-btn" data-track="' + t.index + '" title="试听此轨道" style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);background:var(--ctrl-fill-default);color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.15s;">'
                + '<i class="fa-solid fa-play"></i></button>'
                + '<div class="sustain-track-mini-roll" data-track="' + t.index + '" style="flex:1;min-width:120px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:pointer;">'
                + '<canvas style="display:block;width:100%;height:100%;"></canvas>'
                + '</div>'
                + '</div>';
        }

        var html = '<div class="popup active" id="sustain-tracks-popup">'
            + '<div class="popup-content" style="max-width:760px;max-height:85vh;display:flex;flex-direction:column;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-list-check"></i>'
            + '<h4>选择延音轨道</h4>'
            + '<button class="settings-mini-btn" id="sustain-tracks-reset-btn" title="恢复默认的延音轨道选择（仅重置这一项）">重置配置</button>'
            + '<button class="settings-close-btn" id="sustain-tracks-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body" style="overflow-y:auto;">'
            + '<p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary);">勾选需要应用延音的 MIDI 轨道（多选）。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。</p>'
            + '<div class="sustain-tracks-list">' + listHtml + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="sustain-tracks-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="sustain-tracks-ok-btn">确定</button>'
            + '</div>'
            + '</div></div>';
        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            stopSustainTrackPreview();
            var p = $('sustain-tracks-popup'); if (p) p.remove();
        }
        wrapper.querySelector('#sustain-tracks-close-x').addEventListener('click', close);
        wrapper.querySelector('#sustain-tracks-cancel-btn').addEventListener('click', close);
        // 重置配置: 仅恢复延音轨道的默认勾选 (依据 GM 持续型音色自动判定)
        var sustainResetBtn = wrapper.querySelector('#sustain-tracks-reset-btn');
        if (sustainResetBtn) sustainResetBtn.addEventListener('click', function() {
            N.shared._sustainTrackIndices = detectSustainTrackIndices(state._midiInfo || {});
            var allBoxes = wrapper.querySelectorAll('.sustain-track-checkbox');
            for (var b = 0; b < allBoxes.length; b++) {
                allBoxes[b].checked = N.shared._sustainTrackIndices.indexOf(parseInt(allBoxes[b].value, 10)) !== -1;
            }
            updateSustainTracksUI();
            // 重置只影响本次导入; 配置在点「导入」时才写入该文件的记录
        });
        wrapper.querySelector('#sustain-tracks-ok-btn').addEventListener('click', function() {
            var selected = [];
            var boxes = wrapper.querySelectorAll('.sustain-track-checkbox:checked');
            for (var j = 0; j < boxes.length; j++) selected.push(parseInt(boxes[j].value));
            N.shared._sustainTrackIndices = selected;
            updateSustainTracksUI();
            close();
        });
        wrapper.addEventListener('click', function(e) { if (e.target === wrapper) close(); });

        // 解析 MIDI 文件，为每行初始化迷你音符图
        if (state._midiFile) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var allEvents = parseMidiFileForPlayback(e.target.result, state._midiInfo);
                var miniRolls = wrapper.querySelectorAll('.sustain-track-mini-roll');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || 0;
                if (!fullDuration) {
                    for (var d = 0; d < allEvents.length; d++) {
                        if (allEvents[d].time > fullDuration) fullDuration = allEvents[d].time;
                    }
                }
                for (var i = 0; i < miniRolls.length; i++) {
                    (function(container) {
                        var trackIdx = parseInt(container.getAttribute('data-track'));
                        var notes = extractTrackNotes(allEvents, trackIdx);
                        var canvas = container.querySelector('canvas');
                        var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                        container._miniRoll = mr;
                        // 点击跳转到该位置开始试听
                        container.addEventListener('click', function(ev) {
                            var rect = container.getBoundingClientRect();
                            var clickX = ev.clientX - rect.left;
                            var seekT = mr.pixelToTime(clickX);
                            var trackIdx2 = parseInt(container.getAttribute('data-track'));
                            var previewBtn = wrapper.querySelector('.sustain-track-preview-btn[data-track="' + trackIdx2 + '"]');
                            stopSustainTrackPreview();
                            if (previewBtn) {
                                previewBtn.classList.add('playing');
                                var pIcon = previewBtn.querySelector('i');
                                if (pIcon) pIcon.className = 'fa-solid fa-stop';
                            }
                            previewSustainTrack(trackIdx2, previewBtn, seekT);
                        });
                    })(miniRolls[i]);
                }
            };
            reader.readAsArrayBuffer(state._midiFile);
        }

        // 绑定试听按钮
        var previewBtns = wrapper.querySelectorAll('.sustain-track-preview-btn');
        for (var k = 0; k < previewBtns.length; k++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackIdx = parseInt(btn.getAttribute('data-track'));
                    toggleSustainTrackPreview(trackIdx, btn);
                });
            })(previewBtns[k]);
        }
    }

    function getMidiTrackMeta(trackIdx) {
        var info = state._midiInfo;
        var tracks = info && info.tracks ? info.tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            if (parseInt(tracks[i].index) === parseInt(trackIdx)) return tracks[i];
        }
        return null;
    }

    function buildFallbackTrackPreviewNotes(trackIdx) {
        var meta = getMidiTrackMeta(trackIdx);
        if (!meta || !(meta.note_count > 0)) return [];
        var duration = (state._midiInfo && state._midiInfo.duration_seconds) || _midiTrackPlayback.duration || 5;
        var count = Math.max(1, Math.min(24, meta.note_count || 1));
        var notes = [];
        for (var i = 0; i < count; i++) {
            var t = count === 1 ? 0 : (duration * i / count);
            notes.push({
                note: 60 + (i % 12),
                start: t,
                end: Math.min(duration, t + Math.max(0.08, duration / Math.max(8, count * 2))),
                velocity: 80
            });
        }
        return notes;
    }

    // 从事件列表提取指定轨道的音符（配对 noteOn/noteOff）
    function extractTrackNotes(events, trackIdx) {
        var notes = [];
        var active = {};
        var wanted = parseInt(trackIdx);
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (parseInt(e.track) !== wanted) continue;
            var key = (e.channel !== undefined ? e.channel : 0) + ':' + e.note;
            if (e.type === 'noteOn') {
                if (!active[key]) active[key] = [];
                active[key].push({ note: e.note, start: e.time, velocity: e.velocity });
            } else if (e.type === 'noteOff') {
                var stack = active[key];
                var start = stack && stack.length ? stack.shift() : null;
                if (start) {
                    notes.push({
                        note: start.note,
                        start: start.start,
                        end: Math.max(start.start + 0.05, e.time),
                        velocity: start.velocity
                    });
                    if (stack && stack.length === 0) delete active[key];
                }
            }
        }
        for (var n in active) {
            var pending = active[n] || [];
            for (var p = 0; p < pending.length; p++) {
                notes.push({
                    note: pending[p].note,
                    start: pending[p].start,
                    end: Math.max(pending[p].start + 0.5, _midiTrackPlayback.duration || 5),
                    velocity: pending[p].velocity
                });
            }
        }
        notes.sort(function(a, b) { return a.start - b.start; });
        return notes.length ? notes : buildFallbackTrackPreviewNotes(trackIdx);
    }

    // ========== 延音轨道试听 ==========
    var _sustainPreview = {
        playing: false,
        trackIndex: -1,
        scheduled: [],
        endTime: 0,
        startTime: 0,
        miniRoll: null,
        playheadRAF: null
    };

    function toggleSustainTrackPreview(trackIndex, btn) {
        // 如果正在试听同一轨道，停止
        if (_sustainPreview.playing && _sustainPreview.trackIndex === trackIndex) {
            stopSustainTrackPreview();
            return;
        }
        // 停止当前试听
        stopSustainTrackPreview();
        // 开始试听新轨道
        previewSustainTrack(trackIndex, btn);
    }

    function stopSustainTrackPreview() {
        // 清除所有调度
        for (var i = 0; i < _sustainPreview.scheduled.length; i++) {
            var s = _sustainPreview.scheduled[i];
            if (s.timeout) clearTimeout(s.timeout);
        }
        _sustainPreview.scheduled = [];

        // 停止播放头动画
        if (_sustainPreview.playheadRAF) {
            cancelAnimationFrame(_sustainPreview.playheadRAF);
            _sustainPreview.playheadRAF = null;
        }

        // 停止所有音符
        stopTinySynthAll();
        if (_midiTrackPlayback.output) {
            for (var ch = 0; ch < 16; ch++) {
                try { _midiTrackPlayback.output.send([0xB0 | ch, 0x7B, 0]); } catch(e) {} // All Notes Off
            }
        }
        _sustainPreview.playing = false;
        _sustainPreview.trackIndex = -1;
        _sustainPreview.miniRoll = null;
        // 恢复所有按钮图标
        var btns = document.querySelectorAll('.sustain-track-preview-btn');
        for (var j = 0; j < btns.length; j++) {
            btns[j].classList.remove('playing');
            var icon = btns[j].querySelector('i');
            if (icon) icon.className = 'fa-solid fa-play';
        }
    }

    function previewSustainTrack(trackIndex, btn, seekTime) {
        if (!state._midiFile || !state._midiInfo) return;

        // 真正需要播放 MIDI 音符时: 按设置触发音色库下载/询问 (与 playMidiPreviewFallback 一致)
        ensureSoundfontOnDemand();

        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var allEvents = parseMidiFileForPlayback(arrayBuffer, state._midiInfo);
            // 过滤出指定轨道的事件
            var trackEvents = [];
            for (var i = 0; i < allEvents.length; i++) {
                var ev = allEvents[i];
                if (ev.track === trackIndex) {
                    trackEvents.push(ev);
                }
            }
            if (trackEvents.length === 0) {
                showMidiNotice('该轨道没有音符事件', 'error');
                return;
            }

            // 找到该轨道的结束时间
            var endTime = 0;
            for (var j = 0; j < trackEvents.length; j++) {
                if (trackEvents[j].time > endTime) endTime = trackEvents[j].time;
            }
            // Remove the 15 second limit - play full track

            // 默认跳过前面的空白：找到第一个 noteOn 事件的时间
            var skipTime = 0;
            if (seekTime !== undefined && seekTime !== null) {
                // 用户点击缩略图跳转
                skipTime = Math.max(0, Math.min(seekTime, endTime));
            } else {
                // 默认跳过前面的空白
                for (var k = 0; k < trackEvents.length; k++) {
                    if (trackEvents[k].type === 'noteOn') {
                        skipTime = trackEvents[k].time;
                        break;
                    }
                }
            }

            _sustainPreview.playing = true;
            _sustainPreview.trackIndex = trackIndex;
            _sustainPreview.endTime = endTime;
            _sustainPreview.startTime = skipTime;
            _sustainPreview.scheduled = [];

            // 找到对应的 MiniMidiRoll 用于更新播放头
            var miniRollContainer = document.querySelector('.sustain-track-mini-roll[data-track="' + trackIndex + '"]');
            _sustainPreview.miniRoll = miniRollContainer ? miniRollContainer._miniRoll : null;
            if (_sustainPreview.miniRoll) {
                _sustainPreview.miniRoll.setPlayhead(skipTime);
            }

            // 更新按钮图标
            if (btn) {
                btn.classList.add('playing');
                var icon = btn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-stop';
            }

            // 使用 TinySynth 播放
            var synth = getTinySynth();
            var useWebMidi = false;
            var output = null;

            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess().then(function(access) {
                    var outputs = access.outputs;
                    if (outputs && outputs.size > 0) {
                        output = outputs.values().next().value;
                        useWebMidi = true;
                    }
                    schedulePreview(trackEvents, synth, useWebMidi, output, endTime, btn, skipTime);
                }).catch(function() {
                    schedulePreview(trackEvents, synth, false, null, endTime, btn, skipTime);
                });
            } else {
                schedulePreview(trackEvents, synth, false, null, endTime, btn, skipTime);
            }
        };
        reader.readAsArrayBuffer(state._midiFile);
    }

    function schedulePreview(trackEvents, synth, useWebMidi, output, endTime, btn, skipTime) {
        var audioStartTime;
        var programsSent = {};
        skipTime = skipTime || 0;

        // 延音轨道试听: 始终走 GM MIDI 路径 (播放 MIDI 原始音色, 不走 NBS 转换)
        // 用户诉求: 延音音轨选择中应播放 MIDI, 而非 NBS 音色
        var useNbsPath = false;

        if (!useNbsPath) {
            // 回退到原 GM MIDI 路径
            if (useWebMidi && output) {
                audioStartTime = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext().currentTime : performance.now() / 1000;
            } else if (synth) {
                try { synth.reset(); } catch(ex) {}
                var synthCtx = synth.getAudioContext ? synth.getAudioContext() : null;
                if (!synthCtx) synthCtx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
                if (!synthCtx) {
                    showMidiNotice('音频上下文未就绪，无法试听。', 'error');
                    stopSustainTrackPreview();
                    return;
                }
                audioStartTime = synthCtx.currentTime;
            } else {
                showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。', 'error');
                stopSustainTrackPreview();
                return;
            }
        }

        // 收集 NBS 转换所需的设置
        var nbsSettings = useNbsPath ? collectNbsPreviewSettings() : null;

        // 发送 skipTime 之前的 programChange（确保音色已设置）— 仅 GM 路径需要
        if (!useNbsPath) {
            for (var pi = 0; pi < trackEvents.length; pi++) {
                var pev = trackEvents[pi];
                if (pev.time > skipTime) break;
                if (pev.type === 'programChange') {
                    var progKey = pev.track + '-' + pev.channel;
                    if (!programsSent[progKey]) {
                        if (useWebMidi && output) {
                            try { output.send([0xC0 | (pev.channel & 0x0F), pev.program & 0x7F]); } catch(e) {}
                        } else if (synth) {
                            try { synth.send([0xC0 | (pev.channel & 0x0F), pev.program & 0x7F]); } catch(e) {}
                        }
                        programsSent[progKey] = true;
                    }
                }
            }
        }

        for (var i = 0; i < trackEvents.length; i++) {
            var ev = trackEvents[i];
            if (ev.time > endTime) break;
            // 跳过 skipTime 之前的事件
            if (ev.time < skipTime) continue;

            if (ev.type === 'programChange') {
                if (useNbsPath) continue; // NBS 路径不需要发送 programChange
                var progKey2 = ev.track + '-' + ev.channel;
                if (!programsSent[progKey2]) {
                    var delayMs = Math.max(0, (ev.time - skipTime) * 1000);
                    var t = setTimeout((function(evt) {
                        return function() {
                            if (!_sustainPreview.playing) return;
                            if (useWebMidi && output) {
                                try { output.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F]); } catch(e) {}
                            } else if (synth) {
                                try { synth.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F]); } catch(e) {}
                            }
                        };
                    })(ev), delayMs);
                    _sustainPreview.scheduled.push({ timeout: t });
                    programsSent[progKey2] = true;
                }
                continue;
            }

            if (ev.type === 'noteOn' || ev.type === 'noteOff') {
                var delayMs2 = Math.max(0, (ev.time - skipTime) * 1000);

                if (useNbsPath) {
                    // NBS 转换路径: 仅处理 noteOn (NBS 音色为短样本, noteOff 不需要主动停止)
                    if (ev.type === 'noteOn') {
                        var tNbs = setTimeout((function(evt) {
                            return function() {
                                if (!_sustainPreview.playing) return;
                                playNoteAsNbs(evt, nbsSettings);
                            };
                        })(ev), delayMs2);
                        _sustainPreview.scheduled.push({ timeout: tNbs });
                    }
                    // noteOff 在 NBS 路径下忽略
                } else {
                    // GM MIDI 路径
                    var t2 = setTimeout((function(evt) {
                        return function() {
                            if (!_sustainPreview.playing) return;
                            var status = evt.type === 'noteOn' ? 0x90 : 0x80;
                            var velocity = evt.type === 'noteOn' ? (evt.velocity || 100) : 0;
                            if (useWebMidi && output) {
                                try { output.send([status | (evt.channel & 0x0F), evt.note & 0x7F, velocity & 0x7F]); } catch(e) {}
                            } else if (synth) {
                                try { synth.send([status | (evt.channel & 0x0F), evt.note & 0x7F, velocity & 0x7F]); } catch(e) {}
                            }
                        };
                    })(ev), delayMs2);
                    _sustainPreview.scheduled.push({ timeout: t2 });
                }
            }
        }

        // 播放头动画更新
        var playheadStart = performance.now();
        function updatePlayhead() {
            if (!_sustainPreview.playing) return;
            var elapsed = (performance.now() - playheadStart) / 1000;
            var currentT = skipTime + elapsed;
            if (_sustainPreview.miniRoll) {
                _sustainPreview.miniRoll.setPlayhead(currentT);
            }
            if (currentT < endTime) {
                _sustainPreview.playheadRAF = requestAnimationFrame(updatePlayhead);
            }
        }
        _sustainPreview.playheadRAF = requestAnimationFrame(updatePlayhead);

        // 自动停止
        var stopDelay = (endTime - skipTime + 1) * 1000;
        var stopT = setTimeout(function() {
            stopSustainTrackPreview();
        }, stopDelay);
        _sustainPreview.scheduled.push({ timeout: stopT });
    }

    // 收集 NBS 预览所需的设置 (拟合、八度、替代配置等)
    function collectNbsPreviewSettings() {
        var settings = {
            octaveMode: $('midi-octave-mode') ? parseInt($('midi-octave-mode').value) || 0 : 0,
            smartSubstituteEnabled: $('midi-smart-substitute') ? $('midi-smart-substitute').checked : false,
            forceFoldEnabled: $('midi-force-fold') ? $('midi-force-fold').checked : false,
            substituteConfig: loadSubstituteConfig(),
            substituteTracksSet: N.shared._substituteSelectedTracks,
            channelInstruments: {}, // 留空, 由 fitting/GM 表决定
            timbreFitting: collectTimbreFitting()
        };
        if (settings.octaveMode !== 2 && settings.octaveMode !== 3) {
            settings.smartSubstituteEnabled = false;
        }
        return settings;
    }

    // 把单个 MIDI noteOn 事件转换为 NBS 音色并播放 (与 importMidi 流水线一致)
    function playNoteAsNbs(ev, settings) {
        if (!ev || ev.type !== 'noteOn') return;
        if (!window.AudioEngine || !AudioEngine.playNote) return;

        var ch = ev.channel;
        var midiNote = ev.note;
        var velocity = Math.min(100, Math.floor((ev.velocity || 100) / 127.0 * 100));

        if (ch === 9) {
            // 鼓组: 直接用 DRUM_NOTE_TABLE 查找
            var drumInfo = (typeof DRUM_NOTE_TABLE !== 'undefined') ? DRUM_NOTE_TABLE[midiNote] : null;
            if (drumInfo) {
                var drumInst = drumInfo[1];
                var drumKey = drumInfo[2] + 33;
                AudioEngine.playNote(drumInst, drumKey, velocity);
            }
            return;
        }

        // 旋律通道: 走完整转换链
        // 1. 确定乐器 (优先 fitting slot1 > GM 表 > 0)
        var inst = 0;
        var fitting = settings.timbreFitting && settings.timbreFitting.channels ? settings.timbreFitting.channels[ch] : null;
        if (fitting && fitting[0] >= 0) {
            inst = fitting[0];
        } else {
            var prog = 0;
            if (state._midiInfo && state._midiInfo.channelFirstProgram) {
                prog = state._midiInfo.channelFirstProgram[ch] || 0;
            }
            if (typeof GM_PROGRAM_TABLE !== 'undefined' && GM_PROGRAM_TABLE[prog]) {
                inst = GM_PROGRAM_TABLE[prog][1];
            }
        }

        // 2. 获取八度/keyShift 偏移
        var chSettings = getChannelSettings(ch);
        var octaveOffset = chSettings.octave || 0;
        var keyOffset = chSettings.keyShift || 0;

        // 3. 走转换流水线 (与 nbs_client.js 一致)
        var processedMidi;
        var octaveMode = settings.octaveMode;

        if (octaveMode === 0) {
            // 模式 0: 不处理
            processedMidi = midiNote;
        } else if (octaveMode === 1) {
            // 模式 1: 单独归一 (折叠到 MC 标准音域 [54, 78])
            processedMidi = midiNote + 12 * octaveOffset + keyOffset;
            while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
            while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
        } else {
            // 模式 2/3: 先替代, 后偏移
            processedMidi = midiNote;
            if (settings.smartSubstituteEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                var trackInScope = true;
                if (settings.substituteTracksSet) {
                    trackInScope = !!settings.substituteTracksSet[ev.track || 0];
                }
                if (trackInScope && settings.substituteConfig) {
                    var substResult = applySubstituteToNote(processedMidi, inst, settings.substituteConfig);
                    if (substResult.midi !== processedMidi) {
                        // 替代成功
                        inst = substResult.instrument;
                        processedMidi = substResult.midi;
                    }
                }
            }
            // 应用偏移
            processedMidi += 12 * octaveOffset + keyOffset;
            // 强制兜底
            if (settings.forceFoldEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
            }
        }

        // 4. 转换为 NBS key
        var nbsKey = processedMidi - 21;
        if (nbsKey < 0) nbsKey = 0;
        if (nbsKey > 87) nbsKey = 87;

        // 5. 播放所有 fitting 槽位 (slot1 主乐器 + slot2/3 副乐器)
        AudioEngine.playNote(inst, nbsKey, velocity);
        if (fitting && fitting.length > 1) {
            for (var si = 1; si < fitting.length; si++) {
                if (fitting[si] >= 0) {
                    AudioEngine.playNote(fitting[si], nbsKey, velocity);
                }
            }
        }
    }

    // ========== 简易 MIDI 钢琴卷帘可视化 ==========
    function SimpleMidiRoll(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.notes = [];
        this.minNote = 60;
        this.maxNote = 72;
        this.minTime = 0;
        this.maxTime = 10;
        this.paddingLeft = 36;
        this.paddingRight = 8;
        this.paddingTop = 8;
        this.paddingBottom = 24;
        this.scrollX = 0; // 像素偏移
        this.scrollY = 0;
        this.scaleX = 50; // 像素/秒
        this.scaleY = 12; // 像素/半音
        this.playheadTime = 0;
        this.isPlaying = false;
        this.lastFrameTime = 0;
        this.rafId = null;
        this.onSeek = null;
        this.onTimeUpdate = null;
        this.dragging = false;
        this.dragStartX = 0;
        this.dragStartScrollX = 0;
        this.dragStartY = 0;
        this.dragStartScrollY = 0;
        this.resizeObserver = null;

        this._setupHiDPI();
        this._bindEvents();
        this.fitToNotes();
    }

    SimpleMidiRoll.prototype._setupHiDPI = function() {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    };

    SimpleMidiRoll.prototype._bindEvents = function() {
        var self = this;
        // 窗口大小变化重绘
        var ro = new ResizeObserver(function() {
            self._setupHiDPI();
            self.render();
        });
        ro.observe(this.canvas.parentElement || this.canvas);
        this.resizeObserver = ro;

        // 鼠标滚轮缩放
        this.canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            var rect = self.canvas.getBoundingClientRect();
            var mouseX = e.clientX - rect.left;
            var timeBefore = self._pixelToTime(mouseX);
            if (e.deltaY < 0) {
                self.scaleX *= 1.15;
                self.scaleY *= 1.1;
            } else {
                self.scaleX /= 1.15;
                self.scaleY /= 1.1;
            }
            self.scaleX = Math.max(5, Math.min(5000, self.scaleX));
            self.scaleY = Math.max(4, Math.min(40, self.scaleY));
            var timeAfter = self._pixelToTime(mouseX);
            self.scrollX += (timeAfter - timeBefore) * self.scaleX;
            self.render();
        }, { passive: false });

        // 拖拽平移
        function onPointerDown(e) {
            if (e.button !== 0) return;
            self.dragging = true;
            self.dragStartX = e.clientX;
            self.dragStartY = e.clientY;
            self.dragStartScrollX = self.scrollX;
            self.dragStartScrollY = self.scrollY;
            self.canvas.setPointerCapture(e.pointerId);
        }
        function onPointerMove(e) {
            if (!self.dragging) return;
            e.preventDefault();
        }
        function onPointerUp(e) {
            if (!self.dragging) return;
            var dx = e.clientX - self.dragStartX;
            var dy = e.clientY - self.dragStartY;
            self.dragging = false;
            // 点击（几乎没移动）则 seek
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
                var rect = self.canvas.getBoundingClientRect();
                var t = self._pixelToTime(e.clientX - rect.left);
                if (self.onSeek) self.onSeek(Math.max(0, t));
            }
            try { self.canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
        }
        this.canvas.addEventListener('pointerdown', onPointerDown);
        this.canvas.addEventListener('pointermove', onPointerMove);
        this.canvas.addEventListener('pointerup', onPointerUp);
        this.canvas.addEventListener('pointerleave', function(e) { self.dragging = false; });
    };

    SimpleMidiRoll.prototype.setNotes = function(notes) {
        this.notes = notes || [];
        if (this.notes.length === 0) {
            this.minNote = 60; this.maxNote = 72;
            this.minTime = 0; this.maxTime = 5;
        } else {
            this.minNote = 127; this.maxNote = 0;
            this.minTime = Infinity; this.maxTime = 0;
            for (var i = 0; i < this.notes.length; i++) {
                var n = this.notes[i];
                if (n.note < this.minNote) this.minNote = n.note;
                if (n.note > this.maxNote) this.maxNote = n.note;
                if (n.start < this.minTime) this.minTime = n.start;
                if (n.end > this.maxTime) this.maxTime = n.end;
            }
            this.minNote = Math.max(0, this.minNote - 2);
            this.maxNote = Math.min(127, this.maxNote + 2);
        }
        this.fitToNotes();
    };

    SimpleMidiRoll.prototype.fitToNotes = function() {
        if (this.notes.length === 0) {
            this.scrollX = 0;
            this.scrollY = 0;
            this.scaleX = 50;
            this.scaleY = 12;
        } else {
            var timeRange = Math.max(1, this.maxTime - this.minTime);
            var noteRange = Math.max(12, this.maxNote - this.minNote);
            var availW = Math.max(50, this.width - this.paddingLeft - this.paddingRight);
            var availH = Math.max(50, this.height - this.paddingTop - this.paddingBottom);
            this.scaleX = availW / timeRange;
            this.scaleY = availH / noteRange;
            this.scrollX = 0;
            this.scrollY = (availH - noteRange * this.scaleY) / 2;
        }
        this.render();
    };

    SimpleMidiRoll.prototype._timeToPixel = function(t) {
        return this.paddingLeft + (t - this.minTime) * this.scaleX + this.scrollX;
    };

    SimpleMidiRoll.prototype._pixelToTime = function(x) {
        return this.minTime + (x - this.paddingLeft - this.scrollX) / this.scaleX;
    };

    SimpleMidiRoll.prototype._noteToPixel = function(note) {
        return this.height - this.paddingBottom - (note - this.minNote) * this.scaleY + this.scrollY;
    };

    SimpleMidiRoll.prototype.setPlayhead = function(t) {
        this.playheadTime = t;
        this.render();
    };

    SimpleMidiRoll.prototype.play = function() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        var self = this;
        function loop() {
            if (!self.isPlaying) return;
            var now = performance.now();
            var dt = (now - self.lastFrameTime) / 1000;
            self.lastFrameTime = now;
            self.playheadTime += dt;
            if (self.playheadTime > self.maxTime + 1) {
                self.playheadTime = 0;
            }
            self.render();
            if (self.onTimeUpdate) self.onTimeUpdate(self.playheadTime);
            self.rafId = requestAnimationFrame(loop);
        }
        this.rafId = requestAnimationFrame(loop);
    };

    SimpleMidiRoll.prototype.pause = function() {
        this.isPlaying = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    };

    SimpleMidiRoll.prototype.stop = function() {
        this.pause();
        this.playheadTime = 0;
        this.render();
    };

    SimpleMidiRoll.prototype.destroy = function() {
        this.pause();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    };

    SimpleMidiRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.width, h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, 0, w, h);

        // 网格
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        // 时间网格（每 1 秒）
        var startSec = Math.floor(this._pixelToTime(0));
        var endSec = Math.ceil(this._pixelToTime(w));
        for (var s = startSec; s <= endSec; s++) {
            var x = this._timeToPixel(s);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - this.paddingBottom); ctx.stroke();
        }
        // 音高网格（每个 note）
        for (var n = this.minNote; n <= this.maxNote; n++) {
            var y = this._noteToPixel(n);
            ctx.beginPath(); ctx.moveTo(this.paddingLeft, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // 绘制音符块
        for (var i = 0; i < this.notes.length; i++) {
            var note = this.notes[i];
            var x = this._timeToPixel(note.start);
            var y = this._noteToPixel(note.note) - this.scaleY * 0.5;
            var width = Math.max(2, (note.end - note.start) * this.scaleX);
            var height = this.scaleY * 0.85;
            // 根据 velocity 调整透明度
            var alpha = 0.5 + (note.velocity || 100) / 255;
            ctx.fillStyle = 'rgba(76, 194, 255, ' + alpha + ')';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = 'rgba(76, 194, 255, 0.8)';
            ctx.strokeRect(x, y, width, height);
        }

        // 绘制播放头
        var px = this._timeToPixel(this.playheadTime);
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();

        // 底部时间轴
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, h - this.paddingBottom, w, this.paddingBottom);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        for (var t = startSec; t <= endSec; t++) {
            var tx = this._timeToPixel(t);
            ctx.fillText(t + 's', tx, h - 8);
        }

        // 左侧音高轴
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, this.paddingLeft, h - this.paddingBottom);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'right';
        for (var nn = this.minNote; nn <= this.maxNote; nn += 2) {
            var ny = this._noteToPixel(nn);
            ctx.fillText(nn, this.paddingLeft - 6, ny + 3);
        }
    };

    // ========== 迷你 MIDI 音符图（每行右侧用，Y自动压缩音域，仅左右拖拽） ==========
    function MiniMidiRoll(canvas, notes, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.notes = notes || [];
        this.options = options || {};
        this.scrollX = 0; // 像素偏移
        this.paddingLeft = 2;
        this.paddingRight = 2;
        this.paddingTop = 2;
        this.paddingBottom = 2;
        // 自动计算音域范围
        this.minNote = 60; this.maxNote = 72;
        this.minTime = 0; this.maxTime = 5;
        this._computeRange();
        this._setupHiDPI();
        this.render();
        // 监听容器大小变化
        var self = this;
        this._ro = new ResizeObserver(function() {
            self._setupHiDPI();
            self.render();
        });
        this._ro.observe(this.canvas.parentElement || this.canvas);
    }

    MiniMidiRoll.prototype._computeRange = function() {
        if (this.notes.length === 0) {
            this.minNote = 60; this.maxNote = 72;
            this.minTime = 0; this.maxTime = 5;
            return;
        }
        this.minNote = 127; this.maxNote = 0;
        this.minTime = this.options.fullDuration ? 0 : Infinity;
        this.maxTime = this.options.fullDuration ? this.options.fullDuration : 0;
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            if (n.note < this.minNote) this.minNote = n.note;
            if (n.note > this.maxNote) this.maxNote = n.note;
            if (!this.options.fullDuration && n.start < this.minTime) this.minTime = n.start;
            if (n.end > this.maxTime) this.maxTime = n.end;
        }
        if (this.options.fullDuration) this.maxTime = Math.max(this.maxTime, this.options.fullDuration);
        // 至少要有 1 个半音的范围
        if (this.maxNote <= this.minNote) this.maxNote = this.minNote + 1;
        // 至少要有 0.5 秒的范围
        if (this.maxTime <= this.minTime) this.maxTime = this.minTime + 0.5;
    };

    MiniMidiRoll.prototype._setupHiDPI = function() {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    };

    MiniMidiRoll.prototype.setNotes = function(notes) {
        this.notes = notes || [];
        this._computeRange();
        this.scrollX = 0;
        this.render();
    };

    MiniMidiRoll.prototype.setPlayhead = function(t) {
        this.playheadTime = t;
        this.render();
    };

    MiniMidiRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.width, h = this.height;
        if (w <= 0 || h <= 0) return;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, 0, w, h);

        if (this.notes.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('无音符', w / 2, h / 2 + 3);
            return;
        }

        var availW = Math.max(10, w - this.paddingLeft - this.paddingRight);
        var availH = Math.max(10, h - this.paddingTop - this.paddingBottom);
        var timeRange = Math.max(0.1, this.maxTime - this.minTime);
        var noteRange = Math.max(1, this.maxNote - this.minNote);

        // 默认缩放：填满宽度
        var scaleX = availW / timeRange;
        var scaleY = availH / noteRange;

        var self = this;
        function timeToX(t) {
            return self.paddingLeft + (t - self.minTime) * scaleX + self.scrollX;
        }
        function noteToY(note) {
            // 高音在上
            return self.paddingTop + (self.maxNote - note) * scaleY;
        }

        // 绘制音符块
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            var x = timeToX(n.start);
            var y = noteToY(n.note);
            var width = Math.max(1.5, (n.end - n.start) * scaleX);
            var height = Math.max(2, scaleY * 0.8);
            var alpha = 0.5 + (n.velocity || 100) / 255;
            ctx.fillStyle = 'rgba(76, 194, 255, ' + alpha + ')';
            ctx.fillRect(x, y + (scaleY - height) / 2, width, height);
        }

        // 播放头
        if (this.playheadTime !== undefined && this.playheadTime !== null) {
            var px = timeToX(this.playheadTime);
            if (px >= 0 && px <= w) {
                ctx.strokeStyle = '#ff6b6b';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
            }
        }
    };

    // ---- 导出 ----
    N.showSubstituteSlotMenu = showSubstituteSlotMenu;
    N.selectSubstituteSlot = selectSubstituteSlot;
    N.readSubstituteConfigFromUI = readSubstituteConfigFromUI;
    N.convertKeyAcrossInstruments = convertKeyAcrossInstruments;
    N.applySubstituteToNote = applySubstituteToNote;
    N.isTrackSelectedForSubstitute = isTrackSelectedForSubstitute;
    N.calculateOptimalOffset = calculateOptimalOffset;
    N.updateChannelOctaveForMode = updateChannelOctaveForMode;
    N.calculateOptimalOffsetWithSubstitute = calculateOptimalOffsetWithSubstitute;
    N.updateOctaveModeHint = updateOctaveModeHint;
    N.calculateExpectedOutOfRange = calculateExpectedOutOfRange;
    N.setMidiSelectValue = setMidiSelectValue;
    N.applyOffsetToChannelRow = applyOffsetToChannelRow;
    N.updateChannelRangeAfter = updateChannelRangeAfter;
    N.showMidiPopup = showMidiPopup;
    N.closeMidiPopup = closeMidiPopup;
    N.switchMidiTab = switchMidiTab;
    N.switchMidiSubTab = switchMidiSubTab;
    N.buildInstrumentSelect = buildInstrumentSelect;
    N.bindMidiInstrumentChangeEvents = bindMidiInstrumentChangeEvents;
    N.showMidiOverrideWarning = showMidiOverrideWarning;
    N.buildOctaveSelect = buildOctaveSelect;
    N.buildKeyShiftSelect = buildKeyShiftSelect;
    N.getValidOctaveRange = getValidOctaveRange;
    N.getValidKeyRange = getValidKeyRange;
    N.getDefaultOctave = getDefaultOctave;
    N.showMidiNotice = showMidiNotice;
    N.midiNoteToName = midiNoteToName;
    N.getChannelNoteRangeText = getChannelNoteRangeText;
    N.getChannelRangeShort = getChannelRangeShort;
    N.getChannelRangeAfterText = getChannelRangeAfterText;
    N.fillChannelInstrumentNames = fillChannelInstrumentNames;
    N.getChannelPreviewNotes = getChannelPreviewNotes;
    N.buildPitchSelect = buildPitchSelect;
    N.handleMidiOpen = handleMidiOpen;
    N.populateMidiDialog = populateMidiDialog;
    N.getTinySynth = getTinySynth;
    N.prepareTinySynthProgram = prepareTinySynthProgram;
    N.stopTinySynthAll = stopTinySynthAll;
    N.getEffectiveMidiSource = getEffectiveMidiSource;
    N.stopMidiPreview = stopMidiPreview;
    N.getChannelSettings = getChannelSettings;
    N.getFittingSlotsForChannel = getFittingSlotsForChannel;
    N.midiNoteToFreq = midiNoteToFreq;
    N.gmProgramToNbsInstrument = gmProgramToNbsInstrument;
    N.playMidiPreviewWithWebMidi = playMidiPreviewWithWebMidi;
    N.playMidiPreviewFallback = playMidiPreviewFallback;
    N.previewMidiChannel = previewMidiChannel;
    N.previewNbsChannel = previewNbsChannel;
    N.bindMidiPreviewButtons = bindMidiPreviewButtons;
    N.initMidiTrackStates = initMidiTrackStates;
    N.isChannelExcluded = isChannelExcluded;
    N.isChannelAudible = isChannelAudible;
    N.getMidiTrackState = getMidiTrackState;
    N.setMidiTrackState = setMidiTrackState;
    N.getCurrentPlaybackTime = getCurrentPlaybackTime;
    N.stopTrackActiveNotes = stopTrackActiveNotes;
    N.updateTimbreFittingDisabled = updateTimbreFittingDisabled;
    N.detectSustainTrackIndices = detectSustainTrackIndices;
    N.updateSustainTracksUI = updateSustainTracksUI;
    N.updateMidiDedupeReorderUI = updateMidiDedupeReorderUI;
    N.escapeHtml = escapeHtml;
    N.showSustainTracksDialog = showSustainTracksDialog;
    N.getMidiTrackMeta = getMidiTrackMeta;
    N.buildFallbackTrackPreviewNotes = buildFallbackTrackPreviewNotes;
    N.extractTrackNotes = extractTrackNotes;
    N.toggleSustainTrackPreview = toggleSustainTrackPreview;
    N.stopSustainTrackPreview = stopSustainTrackPreview;
    N.previewSustainTrack = previewSustainTrack;
    N.schedulePreview = schedulePreview;
    N.collectNbsPreviewSettings = collectNbsPreviewSettings;
    N.playNoteAsNbs = playNoteAsNbs;
    N.SimpleMidiRoll = SimpleMidiRoll;
    N.MiniMidiRoll = MiniMidiRoll;
    N._midiPreviewTimeout = _midiPreviewTimeout;
    N._midiPreviewNotes = _midiPreviewNotes;
    N._tinySynth = _tinySynth;
    N._midiPrefsByHash = _midiPrefsByHash;
    N._midiTrackPlayback = _midiTrackPlayback;
    N._sustainPreview = _sustainPreview;
})(window.WebNBS);
