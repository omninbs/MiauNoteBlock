/* 27-file-io.js — MiauNoteBlock 功能模块
   来源: 原 main.js L13990-L14328; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var NOTE_NAMES = N.NOTE_NAMES;
    function midiNoteToName() { return N.midiNoteToName.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function stopSustainTrackPreview() { return N.stopSustainTrackPreview.apply(this, arguments); }
    function stopMidiTrackPlayback() { return N.stopMidiTrackPlayback.apply(this, arguments); }
    function escapeHtml() { return N.escapeHtml.apply(this, arguments); }
    function toggleSustainTrackPreview() { return N.toggleSustainTrackPreview.apply(this, arguments); }
    function parseMidiFileForPlayback() { return N.parseMidiFileForPlayback.apply(this, arguments); }
    function extractTrackNotes() { return N.extractTrackNotes.apply(this, arguments); }
    function MiniMidiRoll() { return N.MiniMidiRoll.apply(this, arguments); }
    function previewSustainTrack() { return N.previewSustainTrack.apply(this, arguments); }
    function getInstrumentIconHtml() { return N.getInstrumentIconHtml.apply(this, arguments); }
    function escapeHTML() { return N.escapeHTML.apply(this, arguments); }
    function getInstName() { return N.getInstName.apply(this, arguments); }
    function showSubstituteSlotMenu() { return N.showSubstituteSlotMenu.apply(this, arguments); }

    (function() {
        var noteLetters = ['F#','G','G#','A','A#','B','C','C#','D','D#','E','F'];
        for (var i = 0; i < 88; i++) {
            var letter = noteLetters[i % 12];
            var octave = Math.floor((i - 3) / 12);
            NOTE_NAMES.push(letter + octave);
        }
    })();

    // MIDI 音高名称 (用于试听下拉)
    var MIDI_NOTE_NAMES = {
        60: 'C4', 61: 'C#4', 62: 'D4', 63: 'D#4', 64: 'E4', 65: 'F4', 66: 'F#4', 67: 'G4',
        68: 'G#4', 69: 'A4', 70: 'A#4', 71: 'B4', 72: 'C5', 73: 'C#5', 74: 'D5', 75: 'D#5',
        76: 'E5', 77: 'F5', 78: 'F#5', 79: 'G5', 80: 'G#5', 81: 'A5', 82: 'A#5', 83: 'B5',
        84: 'C6'
    };

    // ============ 音色替代: 音域偏移量表 + 默认替代配置 ============
    // 每个旋律乐器相对于竖琴(基准 0)的半音偏移量 (基于 MC 官方数据)
    // NBS key 33~57 对应该乐器自身音域的 25 档 (F# 起始)
    // 实际 MIDI 音高 = NBS_key + 21 + INSTRUMENT_OFFSET[id]
    var INSTRUMENT_OFFSET = {
        0: 0,    // 竖琴 Harp (F#3~F#5, MIDI 54~78)
        1: -24,  // 贝斯 Bass (F#1~F#3, MIDI 30~54)
        5: -12,  // 吉他 Guitar (F#2~F#4, MIDI 42~66)
        6: 12,   // 长笛 Flute (F#4~F#6, MIDI 66~90)
        7: 24,   // 钟 Bell (F#5~F#7, MIDI 78~102)
        8: 24,   // 管钟 Chime (F#5~F#7)
        9: 24,   // 木琴 Xylophone (F#5~F#7)
        10: 0,   // 颤音琴 Iron Xylophone (F#3~F#5)
        11: 12,  // 牛铃 Cow Bell (F#4~F#6)
        12: -24, // 迪吉里杜管 Didgeridoo (F#1~F#3)
        13: 0,   // 方波 Bit (F#3~F#5)
        14: 0,   // 班卓琴 Banjo (F#3~F#5)
        15: 0,   // 电钢琴 Pling (F#3~F#5)
        16: 0, 17: 0, 18: 0, 19: 0  // 铜号角 (假设与竖琴相同)
    };

    // 全局音域 (actualMIDI 层面): F#1~F#7, 跨度 72 半音
    var GLOBAL_MIDI_MIN = 42;
    var GLOBAL_MIDI_MAX = 114;
    var GLOBAL_MIDI_SPAN = 72;

    // NBS 格式硬性限制: nbsKey ∈ [0, 87], 对应 processedMidi ∈ [21, 108]
    // processedMidi > 108 时 nbsKey > 87 会被 clamp, 导致音高丢失
    // 因此 calculateOptimalOffset 使用 PROCESSED_MIDI_MAX (108) 作为有效上限
    var NBS_KEY_MAX = 87;
    var PROCESSED_MIDI_MAX = NBS_KEY_MAX + 21;  // 108

    // Minecraft 标准音域 (与 piano_roll.js MINECRAFT_PITCH_MIN/MAX 一致)
    // NBS key 33~57, 对应 processedMidi 54~78 (F#3~F#5, 竖琴的两个八度)
    // 超出此范围的音符在 piano_roll 中显示红色 (音色偏离 Minecraft 原版效果)
    // 智能替代/偏移/归一/兜底的目标都是让 processedMidi 落入 [MC_MIDI_MIN, MC_MIDI_MAX]
    var MC_KEY_MIN = 33;
    var MC_KEY_MAX = 57;
    var MC_MIDI_MIN = MC_KEY_MIN + 21;  // 54
    var MC_MIDI_MAX = MC_KEY_MAX + 21;  // 78
    var MC_MIDI_SPAN = MC_KEY_MAX - MC_KEY_MIN;  // 24

    // 旋律乐器 ID 列表 (排除打击乐 2/3/4)
    var MELODY_INSTRUMENT_IDS = [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    // 默认音色替代配置 (链条式, 基于最终版规范文档 §4)
    // 高频链: Harp(0,offset=0) → Flute(6,+12) → Chime(8,+24) → [end]
    // 低频链: Harp(0,offset=0) → Guitar(5,-12) → Bass(1,-24) → [end]
    // high: 超出高音时跳转的下一个音色; low: 超出低音时跳转的下一个音色; -1 = 链尾
    // 同基调偏移的音色共享同一链位置 (例如 Bit/Banjo/Pling 与 Harp 同为 offset=0)
    N.shared.DEFAULT_SUBSTITUTE = {
        0:  { high: 6,  low: 5  },  // 竖琴 Harp (offset=0)   → 高:长笛, 低:吉他
        1:  { high: 5,  low: -1 },  // 贝斯 Bass (offset=-24) → 高:吉他, 低:链尾
        5:  { high: 0,  low: 1  },  // 吉他 Guitar (offset=-12) → 高:竖琴, 低:贝斯
        6:  { high: 8,  low: 0  },  // 长笛 Flute (offset=+12) → 高:管钟, 低:竖琴
        7:  { high: -1, low: 6  },  // 钟 Bell (offset=+24)   → 高:链尾, 低:长笛
        8:  { high: -1, low: 6  },  // 管钟 Chime (offset=+24) → 高:链尾, 低:长笛
        9:  { high: -1, low: 6  },  // 木琴 Xylophone (offset=+24) → 高:链尾, 低:长笛
        10: { high: 6,  low: 5  },  // 颤音琴 Iron_Xylophone (offset=0) → 高:长笛, 低:吉他
        11: { high: 8,  low: 0  },  // 牛铃 Cow_Bell (offset=+12) → 高:管钟, 低:竖琴
        12: { high: 0,  low: -1 },  // 迪吉里杜管 Didgeridoo (offset=-24) → 高:竖琴(→长笛), 低:链尾
        13: { high: 6,  low: 5  },  // 方波 Bit (offset=0)    → 高:长笛, 低:吉他
        14: { high: 6,  low: 5  },  // 班卓琴 Banjo (offset=0) → 高:长笛, 低:吉他
        15: { high: 6,  low: 5  }   // 电钢琴 Pling (offset=0) → 高:长笛, 低:吉他
    };

    // 音色替代配置 (运行时, 从 localStorage 加载或使用默认)
    N.shared._substituteConfig = null;
    N.shared._substituteSelectedTracks = null; // null = 全部, 或 { trackIndex: true }

    function loadSubstituteConfig() {
        if (N.shared._substituteConfig) return N.shared._substituteConfig;
        try {
            var saved = localStorage.getItem('webnbs_substitute_config');
            if (saved) {
                N.shared._substituteConfig = JSON.parse(saved);
            }
        } catch(e) {}
        if (!N.shared._substituteConfig) {
            N.shared._substituteConfig = JSON.parse(JSON.stringify(N.shared.DEFAULT_SUBSTITUTE));
        }
        return N.shared._substituteConfig;
    }

    function saveSubstituteConfig(config) {
        N.shared._substituteConfig = config;
        try {
            localStorage.setItem('webnbs_substitute_config', JSON.stringify(config));
        } catch(e) {}
    }

    // 获取乐器音域文本 (用于 UI 显示)
    function getInstrumentRangeText(instId) {
        var offset = INSTRUMENT_OFFSET[instId] || 0;
        // NBS key 33~57 对应该乐器音域, 实际 MIDI = key + 21 + offset
        var minMidi = 33 + 21 + offset;
        var maxMidi = 57 + 21 + offset;
        return midiNoteToName(minMidi) + '~' + midiNoteToName(maxMidi);
    }

    // ============ 音色替代设置弹窗 ============
    function openSubstituteSettings(initialTab) {
        var popup = $('midi-substitute-popup');
        if (!popup) return;
        popup.style.display = 'flex';
        popup.classList.add('active');

        var config = loadSubstituteConfig();
        var info = state._midiInfo;

        // 起始页签: 功能区音域处理默认进入"音色替代配置" (应用音轨仅对 MIDI 导入有意义)
        var startTab = (initialTab === 'instrument') ? 'sub-instrument' : 'sub-track';
        var tabTrack = $('midi-substitute-tab-track');
        var tabInstrument = $('midi-substitute-tab-instrument');
        var tabBtns = popup.querySelectorAll('.midi-sub-tab');
        if (tabTrack) tabTrack.style.display = (startTab === 'sub-track') ? '' : 'none';
        if (tabInstrument) tabInstrument.style.display = (startTab === 'sub-instrument') ? '' : 'none';
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].classList.toggle('active', tabBtns[ti].getAttribute('data-subtab') === startTab);
        }

        // 渲染音轨列表
        renderSubstituteTracks(info);

        // 渲染音色替代配置表
        renderSubstituteRows(config);

        // 隐藏警告
        var warnEl = $('midi-substitute-warning');
        if (warnEl) warnEl.style.display = 'none';
    }

    function closeSubstituteSettings() {
        // 关闭弹窗时停止所有 MIDI 预览播放
        stopSustainTrackPreview();
        stopMidiTrackPlayback();
        var popup = $('midi-substitute-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    // Tab 切换
    function switchSubstituteTab(tabName) {
        var tabTrack = $('midi-substitute-tab-track');
        var tabInstrument = $('midi-substitute-tab-instrument');
        if (tabTrack) tabTrack.style.display = (tabName === 'sub-track') ? '' : 'none';
        if (tabInstrument) tabInstrument.style.display = (tabName === 'sub-instrument') ? '' : 'none';
        var tabBtns = document.querySelectorAll('#midi-substitute-popup .midi-sub-tab');
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].classList.toggle('active', tabBtns[ti].getAttribute('data-subtab') === tabName);
        }
    }

    function renderSubstituteTracks(info) {
        var container = $('midi-substitute-tracks');
        if (!container) return;
        container.innerHTML = '';

        if (!info || !info.tracks || info.tracks.length === 0) {
            container.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:11px;text-align:center;">暂无 MIDI 音轨数据</div>';
            return;
        }

        // 初始化选中状态: 默认全选
        if (!N.shared._substituteSelectedTracks) {
            N.shared._substituteSelectedTracks = {};
            for (var i = 0; i < info.tracks.length; i++) {
                N.shared._substituteSelectedTracks[info.tracks[i].index] = true;
            }
        }

        // 渲染每个 track (风格与 sustain-tracks-popup 一致)
        for (var i = 0; i < info.tracks.length; i++) {
            (function(track) {
                var checked = N.shared._substituteSelectedTracks[track.index] ? 'checked' : '';
                var trackName = escapeHtml(track.name || ('Track ' + (track.index + 1)));
                var row = document.createElement('div');
                row.className = 'sustain-track-item';
                row.setAttribute('data-track', track.index);
                row.innerHTML = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:180px;overflow:hidden;flex-shrink:0;">'
                    + '<input type="checkbox" class="substitute-track-checkbox" value="' + track.index + '" ' + checked + '>'
                    + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#' + track.index + ' ' + trackName + '</span>'
                    + '</label>'
                    + '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;width:56px;text-align:right;">音符 ' + (track.note_count || 0) + '</span>'
                    + '<button class="sustain-track-preview-btn" data-track="' + track.index + '" title="试听此轨道" style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);background:var(--ctrl-fill-default);color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.15s;">'
                    + '<i class="fa-solid fa-play"></i></button>'
                    + '<div class="sustain-track-mini-roll" data-track="' + track.index + '" style="flex:1;min-width:120px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:pointer;">'
                    + '<canvas style="display:block;width:100%;height:100%;"></canvas>'
                    + '</div>';
                container.appendChild(row);
            })(info.tracks[i]);
        }

        // 绑定复选框变化
        var checkboxes = container.querySelectorAll('.substitute-track-checkbox');
        for (var ci = 0; ci < checkboxes.length; ci++) {
            (function(chk) {
                chk.addEventListener('change', function() {
                    N.shared._substituteSelectedTracks[parseInt(chk.value)] = chk.checked;
                });
            })(checkboxes[ci]);
        }

        // 绑定试听按钮
        var previewBtns = container.querySelectorAll('.sustain-track-preview-btn');
        for (var k = 0; k < previewBtns.length; k++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackIdx = parseInt(btn.getAttribute('data-track'));
                    toggleSustainTrackPreview(trackIdx, btn);
                });
            })(previewBtns[k]);
        }

        // 解析 MIDI 文件，为每行初始化迷你音符图
        if (state._midiFile) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var allEvents = parseMidiFileForPlayback(e.target.result, state._midiInfo);
                var miniRolls = container.querySelectorAll('.sustain-track-mini-roll');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || 0;
                if (!fullDuration) {
                    for (var d = 0; d < allEvents.length; d++) {
                        if (allEvents[d].time > fullDuration) fullDuration = allEvents[d].time;
                    }
                }
                for (var mi = 0; mi < miniRolls.length; mi++) {
                    (function(container2) {
                        var trackIdx = parseInt(container2.getAttribute('data-track'));
                        var notes = extractTrackNotes(allEvents, trackIdx);
                        var canvas = container2.querySelector('canvas');
                        var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                        container2._miniRoll = mr;
                        container2.addEventListener('click', function(ev) {
                            var rect = container2.getBoundingClientRect();
                            var clickX = ev.clientX - rect.left;
                            var seekT = mr.pixelToTime(clickX);
                            var trackIdx2 = parseInt(container2.getAttribute('data-track'));
                            var previewBtn = container2.parentNode.querySelector('.sustain-track-preview-btn[data-track="' + trackIdx2 + '"]');
                            stopSustainTrackPreview();
                            if (previewBtn) {
                                previewBtn.classList.add('playing');
                                var pIcon = previewBtn.querySelector('i');
                                if (pIcon) pIcon.className = 'fa-solid fa-stop';
                            }
                            previewSustainTrack(trackIdx2, previewBtn, seekT);
                        });
                    })(miniRolls[mi]);
                }
            };
            reader.readAsArrayBuffer(state._midiFile);
        }
    }

    function renderSubstituteRows(config) {
        var tbody = $('midi-substitute-rows');
        if (!tbody) return;
        tbody.innerHTML = '';

        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            (function(instId) {
                var cfg = config[instId] || { high: -1, low: -1 };
                var tr = document.createElement('tr');
                tr.setAttribute('data-inst', instId);

                // 音色名称 (左侧显示对应音色的图标)
                var nameTd = document.createElement('td');
                nameTd.style.cssText = 'padding:5px 8px;white-space:nowrap;';
                nameTd.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">'
                    + getInstrumentIconHtml(instId)
                    + '<span>' + escapeHTML(getInstName(instId)) + '</span></span>';
                tr.appendChild(nameTd);

                // 音域
                var rangeTd = document.createElement('td');
                rangeTd.textContent = getInstrumentRangeText(instId);
                rangeTd.style.cssText = 'padding:5px 8px;font-size:10px;color:var(--text-tertiary);';
                tr.appendChild(rangeTd);

                // 高音替代槽 (timbre-slot-btn 风格)
                var highTd = document.createElement('td');
                highTd.style.padding = '5px 8px';
                highTd.innerHTML = '<input type="hidden" class="substitute-slot" data-inst="' + instId + '" data-type="high" value="' + cfg.high + '">'
                    + '<div class="timbre-slot-btn substitute-slot-btn" data-inst="' + instId + '" data-type="high" title="点击选择高音替代音色">'
                    + getInstrumentIconHtml(cfg.high) + '<span class="timbre-slot-text">' + escapeHTML(getInstName(cfg.high)) + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>';
                tr.appendChild(highTd);

                // 低音替代槽 (timbre-slot-btn 风格)
                var lowTd = document.createElement('td');
                lowTd.style.padding = '5px 8px';
                lowTd.innerHTML = '<input type="hidden" class="substitute-slot" data-inst="' + instId + '" data-type="low" value="' + cfg.low + '">'
                    + '<div class="timbre-slot-btn substitute-slot-btn" data-inst="' + instId + '" data-type="low" title="点击选择低音替代音色">'
                    + getInstrumentIconHtml(cfg.low) + '<span class="timbre-slot-text">' + escapeHTML(getInstName(cfg.low)) + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>';
                tr.appendChild(lowTd);

                tbody.appendChild(tr);
            })(MELODY_INSTRUMENT_IDS[i]);
        }

        // 绑定替代槽点击
        var slotBtns = tbody.querySelectorAll('.substitute-slot-btn');
        for (var si = 0; si < slotBtns.length; si++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var instId = parseInt(btn.getAttribute('data-inst'));
                    var type = btn.getAttribute('data-type');
                    showSubstituteSlotMenu(btn, instId, type);
                });
                btn.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var instId = parseInt(btn.getAttribute('data-inst'));
                    var type = btn.getAttribute('data-type');
                    showSubstituteSlotMenu(btn, instId, type);
                });
            })(slotBtns[si]);
        }
    }

    // ---- 导出 ----
    N.MIDI_NOTE_NAMES = MIDI_NOTE_NAMES;
    N.INSTRUMENT_OFFSET = INSTRUMENT_OFFSET;
    N.GLOBAL_MIDI_MIN = GLOBAL_MIDI_MIN;
    N.GLOBAL_MIDI_MAX = GLOBAL_MIDI_MAX;
    N.GLOBAL_MIDI_SPAN = GLOBAL_MIDI_SPAN;
    N.NBS_KEY_MAX = NBS_KEY_MAX;
    N.PROCESSED_MIDI_MAX = PROCESSED_MIDI_MAX;
    N.MC_KEY_MAX = MC_KEY_MAX;
    N.MC_MIDI_MIN = MC_MIDI_MIN;
    N.loadSubstituteConfig = loadSubstituteConfig;
    N.saveSubstituteConfig = saveSubstituteConfig;
    N.getInstrumentRangeText = getInstrumentRangeText;
    N.openSubstituteSettings = openSubstituteSettings;
    N.closeSubstituteSettings = closeSubstituteSettings;
    N.switchSubstituteTab = switchSubstituteTab;
    N.renderSubstituteTracks = renderSubstituteTracks;
    N.renderSubstituteRows = renderSubstituteRows;
})(window.WebNBS);
