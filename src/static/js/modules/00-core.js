/* 00-core.js — MiauNoteBlock 功能模块
   来源: 原 main.js L6-L379; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    'use strict';

    // ============ 全局状态 ============
    var state = {
        notes: [],
        tempo: 20,
        currentTick: 0,
        maxTick: 0,
        isPlaying: false,
        noteIndex: null,

        pianoRoll: null,
        currentInstrument: 0,
        // NBS key 39 is MIDI C4 (NBS key 0 is MIDI A0).
        selectedPianoKey: 39,
        importedFileName: '',  // 导入/加载时的原始文件名（不含扩展名），用于导出时命名

        // 剪贴板 & 撤销
        clipboard: [],
        undoStack: [],
        redoStack: [],
        maxUndo: 50,

        // 轨道
        tracks: [],
        soloActive: false,

        // 上下文菜单
        contextMenuTarget: null,

        // 歌曲
        song: null,

        // 歌词标注: [{ id, tick, text, duration, lane }]
        //   lane: 0..2 三条歌词轨道 (允许不同轨道在同一 tick 重叠)
        //   duration: 固定时长(tick), 恒 >= 1; 新建默认 LYRIC_DEFAULT_DURATION
        lyrics: [],
        lyricsEditMode: false,
        _lyricIndex: null,
        _lyricIdSeq: 0,
        activeLyricId: null,
        _activeLyric: null,
        lyricClipboard: [],   // 歌词片段剪贴板: [{ text, duration, lane, relTick }]
        // 片段编辑: 多轨剪辑模型
        // segments: [{ id, lane, start, end, name, notes:[{rel,layer,...}] }]
        segments: [],
        segmentLanes: [],         // [{ id, muted, solo, volume, height }]
        segmentsEditMode: false,
        segmentClipboard: null,   // { duration, notes, lane, start, name }
        _segmentIdSeq: 0,
        _segmentsTouched: false,  // 用户使用过片段编辑
        _segmentsEdited: false,   // 用户改变过片段边界(裁剪/分割/删除)后, 不再自动覆盖全曲
        // 多文件标签页: [{ id, title, snapshot, dirty }]
        tabs: [],
        tabSeq: 0,
        activeTabId: null,
        streamingLyrics: true,
        _streamingLyricLanes: ['', '', ''],
        _streamingLyricEndTick: [null, null, null],

        // 平滑翻页开关: false=超出后翻页, true=播放头始终居中
        smoothScroll: false,
        renderFpsLimit: 60,
        showFps: false,
        _fpsFrames: 0,
        _fpsLastTime: 0,
        _fpsValue: 0,
        _fpsDisplayTimer: null,

        // 当前文件的持久 ID (用于自动保存覆盖, 而非产生重复)
        currentFileId: null,

        // 键盘钢琴
        keyboardPianoEnabled: false,
        numpadOctaveShift: 0,
        numpadSemitoneShift: 0,
        letterOctaveShift: 0,
        letterSemitoneShift: 0,
        _activePianoKeys: {},

        // 演奏模式
        performanceMode: false,
        performanceRecording: false,
        performanceNotes: [],
        performanceActiveKeys: {},
        performanceTrackLayers: [],
        performanceSettings: null
    };

    // 安全的 DOM 访问
    var $ = function(id) { return document.getElementById(id); };
    var $setText = function(id, text) { var el = $(id); if (el) el.textContent = text; };
    var $setValue = function(id, val) { var el = $(id); if (el) el.value = val; };
    var i18nText = function(text) {
        return window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate(text) : text;
    };
    var i18nKey = function(key, fallback) {
        return window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t(key) : fallback;
    };

    // Keep every flyout inside the visual viewport.  Menus are created in a
    // number of modules, so exposing this helper also keeps their behaviour
    // consistent on small touch screens and in landscape.
    window.WebNBSPositionFlyout = function(element, anchor, options) {
        if (!element) return;
        options = options || {};
        var margin = options.margin === undefined ? 8 : options.margin;
        var gap = options.gap === undefined ? 6 : options.gap;
        var viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
        var viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
        var maxFlyoutHeight = options.maxHeight === undefined
            ? Math.max(1, viewportHeight - margin * 2)
            : Math.max(1, Math.min(options.maxHeight, viewportHeight - margin * 2));
        var point = anchor || {};
        var leftEdge = Number(point.left);
        var topEdge = Number(point.top);
        if (isNaN(leftEdge)) leftEdge = margin;
        if (isNaN(topEdge)) topEdge = margin;
        var rightEdge = Number(point.right);
        var bottomEdge = Number(point.bottom);
        if (isNaN(rightEdge)) rightEdge = leftEdge;
        if (isNaN(bottomEdge)) bottomEdge = topEdge;
        var placement = options.placement || 'pointer';

        element.style.position = 'fixed';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        element.style.maxWidth = Math.max(1, viewportWidth - margin * 2) + 'px';
        element.style.maxHeight = maxFlyoutHeight + 'px';
        element.style.overflowX = 'auto';
        element.style.overflowY = 'auto';
        element.style.overscrollBehavior = 'contain';

        // A flyout needs to be measurable before a safe placement can be
        // calculated.  Callers normally make it visible first; the fallback
        // also keeps dynamically-created menus safe.
        var temporarilyVisible = false;
        if (getComputedStyle(element).display === 'none') {
            element.style.visibility = 'hidden';
            element.style.display = 'block';
            temporarilyVisible = true;
        }
        element.style.left = '-10000px';
        element.style.top = '-10000px';
        var rect = element.getBoundingClientRect();
        var width = rect.width;
        var height = rect.height;

        var left = leftEdge;
        var top = topEdge;
        if (placement === 'bottom-start') {
            left = leftEdge;
            top = bottomEdge + gap;
        } else if (placement === 'bottom-end') {
            left = rightEdge - width;
            top = bottomEdge + gap;
        } else if (placement === 'top-start') {
            left = leftEdge;
            top = topEdge - height - gap;
        } else if (placement === 'top-end') {
            left = rightEdge - width;
            top = topEdge - height - gap;
        } else if (placement === 'right-start') {
            left = rightEdge + gap;
            top = topEdge;
        } else if (placement === 'left-start') {
            left = leftEdge - width - gap;
            top = topEdge;
        }

        // Prefer the opposite side whenever it has enough space.  Otherwise
        // clamp the flyout and retain a scrollable interior instead of hiding
        // actions beyond the edge of the display.
        if ((placement === 'right-start' || placement === 'pointer') && left + width > viewportWidth - margin) {
            var leftAlternative = leftEdge - width - gap;
            if (leftAlternative >= margin) left = leftAlternative;
        } else if (placement === 'left-start' && left < margin) {
            var rightAlternative = rightEdge + gap;
            if (rightAlternative + width <= viewportWidth - margin) left = rightAlternative;
        }
        if ((placement === 'bottom-start' || placement === 'bottom-end' || placement === 'pointer') && top + height > viewportHeight - margin) {
            var topAlternative = topEdge - height - gap;
            if (topAlternative >= margin) top = topAlternative;
        } else if ((placement === 'top-start' || placement === 'top-end') && top < margin) {
            var bottomAlternative = bottomEdge + gap;
            if (bottomAlternative + height <= viewportHeight - margin) top = bottomAlternative;
        }

        left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
        top = Math.max(margin, Math.min(top, viewportHeight - height - margin));
        element.style.left = Math.round(left) + 'px';
        element.style.top = Math.round(top) + 'px';
        if (temporarilyVisible) element.style.visibility = '';
    };

    // NBS stores A0 as key 0. Use this single conversion for every piano
    // surface so the visible label, selected key and audio pitch stay aligned.
    var NBS_MIDI_OFFSET = 21;
    var PIANO_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // 音调文字是否显示八度数字 (如 A4/C5), 默认开启, 可在设置中关闭
    N.shared.octaveLabelsEnabled = true;
    try { N.shared.octaveLabelsEnabled = localStorage.getItem('show_octave_labels') !== '0'; } catch(e) {}
    function nbsKeyToMidiNote(key) {
        return Math.max(0, Math.min(87, Math.round(Number(key) || 0))) + NBS_MIDI_OFFSET;
    }
    function getNbsKeyPitchLabel(key) {
        return PIANO_NOTE_NAMES[nbsKeyToMidiNote(key) % 12];
    }
    function getNbsKeyOctave(key) {
        return Math.floor(nbsKeyToMidiNote(key) / 12) - 1;
    }
    // 音调显示标签: 开启八度时返回 "A4", 关闭时返回 "A"
    function getNbsKeyDisplayLabel(key) {
        return getNbsKeyPitchLabel(key) + (N.shared.octaveLabelsEnabled ? getNbsKeyOctave(key) : '');
    }

    function getInstrumentNames() {
        var names = ['竖琴','低音提琴','大鼓','小鼓','击打声','吉他','长笛','钟琴','风铃','木琴','铁木琴','牛铃','迪吉里杜管','芯片音','班卓琴','电钢琴','铜号角','斑驳的铜号角','锈蚀的铜号角','氧化的铜号角'];
        for (var i = 0; i < names.length; i++) names[i] = i18nText(names[i]);
        return names;
    }

    N.shared.KEYBOARD_PIANO_MAP = {
        'Backquote': 0, 'Digit1': 1, 'Digit2': 2, 'Digit3': 3, 'Digit4': 4, 'Digit5': 5,
        'Digit6': 6, 'Digit7': 7, 'Digit8': 8, 'Digit9': 9, 'Digit0': 10, 'Minus': 11,
        'Equal': 12, 'Backspace': 13,
        'Tab': 14, 'KeyQ': 15, 'KeyW': 16, 'KeyE': 17, 'KeyR': 18, 'KeyT': 19,
        'KeyY': 20, 'KeyU': 21, 'KeyI': 22, 'KeyO': 23, 'KeyP': 24,
        'BracketLeft': 25, 'BracketRight': 26, 'Backslash': 27,
        'CapsLock': 28, 'KeyA': 29, 'KeyS': 30, 'KeyD': 31, 'KeyF': 32, 'KeyG': 33,
        'KeyH': 34, 'KeyJ': 35, 'KeyK': 36, 'KeyL': 37, 'Semicolon': 38,
        'Quote': 39, 'Enter': 40,
        'KeyZ': 41, 'KeyX': 42, 'KeyC': 43, 'KeyV': 44, 'KeyB': 45, 'KeyN': 46,
        'KeyM': 47, 'Comma': 48, 'Period': 49, 'Slash': 50,
        'Insert': 51, 'Home': 52, 'PageUp': 53, 'Delete': 54, 'End': 55, 'PageDown': 56,
        'ArrowLeft': 57, 'ArrowUp': 58, 'ArrowRight': 59, 'ArrowDown': 60,
        'F1': 61, 'F2': 62, 'F3': 63, 'F4': 64, 'F5': 65, 'F6': 66,
        'F7': 67, 'F8': 68, 'F9': 69, 'F10': 70, 'F11': 71, 'F12': 72,
        // 小键盘作为右手简谱区: 只触发白键, 与字母/主键区数字区分开。
        'Numpad1': 60, 'Numpad2': 62, 'Numpad3': 64, 'Numpad4': 65, 'Numpad5': 67,
        'Numpad6': 69, 'Numpad7': 71, 'Numpad8': 72, 'Numpad9': 74, 'Numpad0': 76,
        'NumpadDecimal': 77, 'NumpadDivide': 79, 'NumpadMultiply': 81,
        'NumpadSubtract': 83, 'NumpadAdd': 84, 'NumpadEnter': 86
    };

    var KEYBOARD_CODE_LABELS = {
        Backquote: '`', Minus: '-', Equal: '=', Backspace: 'Bk',
        Tab: 'Tab', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
        CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Ent',
        Comma: ',', Period: '.', Slash: '/',
        Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
        PageUp: 'PgUp', PageDown: 'PgDn', ArrowLeft: '←', ArrowUp: '↑',
        ArrowRight: '→', ArrowDown: '↓',
        Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3',
        Numpad4: 'Num4', Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7',
        Numpad8: 'Num8', Numpad9: 'Num9', NumpadDecimal: 'Num.',
        NumpadDivide: 'Num/', NumpadMultiply: 'Num*', NumpadSubtract: 'Num-',
        NumpadAdd: 'Num+', NumpadEnter: 'Num↵'
    };

    N.shared.KEYBOARD_PIANO_MAP = {
        'KeyZ': 36, 'KeyS': 37, 'KeyX': 38, 'KeyD': 39, 'KeyC': 40, 'KeyV': 41,
        'KeyG': 42, 'KeyB': 43, 'KeyH': 44, 'KeyN': 45, 'KeyJ': 46, 'KeyM': 47,
        'KeyQ': 48, 'Digit2': 49, 'KeyW': 50, 'Digit3': 51, 'KeyE': 52, 'KeyR': 53,
        'Digit5': 54, 'KeyT': 55, 'Digit6': 56, 'KeyY': 57, 'Digit7': 58, 'KeyU': 59,
        'KeyI': 60, 'Digit9': 61, 'KeyO': 62, 'Digit0': 63, 'KeyP': 64,
        'BracketLeft': 65, 'Equal': 66, 'BracketRight': 67,
        // Numpad is an extra right-hand white-key layout; it does not change the original mapping.
        'Numpad1': 60, 'Numpad2': 62, 'Numpad3': 64, 'Numpad4': 65, 'Numpad5': 67,
        'Numpad6': 69, 'Numpad7': 71, 'Numpad8': 72, 'Numpad9': 74, 'Numpad0': 76,
        'NumpadDecimal': 77, 'NumpadDivide': 79, 'NumpadMultiply': 81,
        'NumpadSubtract': 83, 'NumpadAdd': 84, 'NumpadEnter': 86
    };

    KEYBOARD_CODE_LABELS.NumpadEnter = 'NumEnter';

    function clampNbsKey(key) {
        return Math.max(0, Math.min(87, key));
    }

    function isNumpadCode(code) {
        return code && code.indexOf('Numpad') === 0;
    }

    function getShiftedKeyboardPianoKey(code) {
        var key = N.shared.KEYBOARD_PIANO_MAP[code];
        if (key === undefined) return undefined;
        if (isNumpadCode(code)) {
            key += state.numpadOctaveShift * 12 + state.numpadSemitoneShift;
        } else {
            key += state.letterOctaveShift * 12 + state.letterSemitoneShift;
        }
        return clampNbsKey(key);
    }

    function loadNumpadRangeSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem('webnbs:numpad-range') || '{}');
            state.numpadOctaveShift = parseInt(saved.octaveShift, 10) || 0;
            state.numpadSemitoneShift = parseInt(saved.semitoneShift, 10) || 0;
        } catch (e) {
            state.numpadOctaveShift = 0;
            state.numpadSemitoneShift = 0;
        }
        try {
            var savedLetter = JSON.parse(localStorage.getItem('webnbs:letter-range') || '{}');
            state.letterOctaveShift = parseInt(savedLetter.octaveShift, 10) || 0;
            state.letterSemitoneShift = parseInt(savedLetter.semitoneShift, 10) || 0;
        } catch (e) {
            state.letterOctaveShift = 0;
            state.letterSemitoneShift = 0;
        }
    }

    function saveNumpadRangeSettings() {
        try {
            localStorage.setItem('webnbs:numpad-range', JSON.stringify({
                octaveShift: state.numpadOctaveShift,
                semitoneShift: state.numpadSemitoneShift
            }));
        } catch (e) {}
        try {
            localStorage.setItem('webnbs:letter-range', JSON.stringify({
                octaveShift: state.letterOctaveShift,
                semitoneShift: state.letterSemitoneShift
            }));
        } catch (e) {}
    }

    function getKeyboardLabelForNbsKey(nbsKey) {
        var codes = Object.keys(N.shared.KEYBOARD_PIANO_MAP);
        var labels = [];
        for (var i = 0; i < codes.length; i++) {
            if (getShiftedKeyboardPianoKey(codes[i]) === nbsKey) {
                var code = codes[i];
                labels.push(KEYBOARD_CODE_LABELS[code] || code.replace('Key', '').replace('Digit', ''));
                if (labels.length >= 2) break;
            }
        }
        return labels.join('/');
    }

    function getPianoKeyFromKeyboardEvent(e) {
        return getShiftedKeyboardPianoKey(e.code);
    }

    function isEditableTarget(target) {
        return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    }

    function isAllowedPianoEditShortcut(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
        var k = (e.key || '').toLowerCase();
        return k === 'a' || k === 'c' || k === 'v' || k === 'z';
    }

    // 统一格式化错误对象，避免 alert 出现 [object Object]
    function formatError(err, fallback) {
        fallback = fallback || '操作失败';
        if (!err) return fallback;
        if (typeof err === 'string') return err;
        if (err instanceof Error) return err.message || fallback;
        if (err.message && typeof err.message === 'string') return err.message;
        if (err.detail && typeof err.detail === 'string') return err.detail;
        if (err.error && typeof err.error === 'string') return err.error;
        try {
            var json = JSON.stringify(err);
            if (json && json !== '{}') return json;
        } catch (e) {}
        return fallback;
    }

    // ============ 自定义弹窗系统（替代 alert/confirm/prompt） ============
    // 全局唯一活动弹窗栈，支持嵌套

    // ---- 导出 ----
    N.state = state;
    N.$ = $;
    N.$setText = $setText;
    N.$setValue = $setValue;
    N.i18nText = i18nText;
    N.i18nKey = i18nKey;
    N.WebNBSPositionFlyout = WebNBSPositionFlyout;
    N.NBS_MIDI_OFFSET = NBS_MIDI_OFFSET;
    N.PIANO_NOTE_NAMES = PIANO_NOTE_NAMES;
    N.nbsKeyToMidiNote = nbsKeyToMidiNote;
    N.getNbsKeyPitchLabel = getNbsKeyPitchLabel;
    N.getNbsKeyOctave = getNbsKeyOctave;
    N.getNbsKeyDisplayLabel = getNbsKeyDisplayLabel;
    N.getInstrumentNames = getInstrumentNames;
    N.KEYBOARD_CODE_LABELS = KEYBOARD_CODE_LABELS;
    N.clampNbsKey = clampNbsKey;
    N.isNumpadCode = isNumpadCode;
    N.getShiftedKeyboardPianoKey = getShiftedKeyboardPianoKey;
    N.loadNumpadRangeSettings = loadNumpadRangeSettings;
    N.saveNumpadRangeSettings = saveNumpadRangeSettings;
    N.getKeyboardLabelForNbsKey = getKeyboardLabelForNbsKey;
    N.getPianoKeyFromKeyboardEvent = getPianoKeyFromKeyboardEvent;
    N.isEditableTarget = isEditableTarget;
    N.isAllowedPianoEditShortcut = isAllowedPianoEditShortcut;
    N.formatError = formatError;
})(window.WebNBS = window.WebNBS || {});
