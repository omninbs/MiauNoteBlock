/* 22-segment-ui.js — MiauNoteBlock 功能模块
   来源: 原 main.js L10821-L11203; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var LYRIC_DEFAULT_DURATION = N.LYRIC_DEFAULT_DURATION;
    var LYRIC_LANE_COUNT = N.LYRIC_LANE_COUNT;
    function segmentMergeAll() { return N.segmentMergeAll.apply(this, arguments); }
    function showSmallTip() { return N.showSmallTip.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function exitSegmentsEditMode() { return N.exitSegmentsEditMode.apply(this, arguments); }
    function enterSegmentsEditMode() { return N.enterSegmentsEditMode.apply(this, arguments); }
    function segmentCommitDrag() { return N.segmentCommitDrag.apply(this, arguments); }
    function seekToTick() { return N.seekToTick.apply(this, arguments); }
    function renderSegmentSidePanel() { return N.renderSegmentSidePanel.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function segmentSelectedIds() { return N.segmentSelectedIds.apply(this, arguments); }
    function segmentById() { return N.segmentById.apply(this, arguments); }
    function segmentSelected() { return N.segmentSelected.apply(this, arguments); }
    function segmentMergeSelected() { return N.segmentMergeSelected.apply(this, arguments); }
    function segmentExportOne() { return N.segmentExportOne.apply(this, arguments); }
    function segmentCopy() { return N.segmentCopy.apply(this, arguments); }
    function segmentPaste() { return N.segmentPaste.apply(this, arguments); }
    function segmentDelete() { return N.segmentDelete.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function getLyricsAt() { return N.getLyricsAt.apply(this, arguments); }

    function segActionMerge() {
        if (!segmentMergeAll()) showSmallTip(i18nText('当前只有一个片段，无需合并'));
    }

    function bindSegButton(id, fn) {
        var el = $(id);
        if (el) el.addEventListener('click', fn);
    }

    function initSegmentsUI() {
        var enterBtn = $('btn-segments');
        if (enterBtn) {
            enterBtn.addEventListener('click', function() {
                if (state.segmentsEditMode) exitSegmentsEditMode();
                else enterSegmentsEditMode();
            });
        }
        bindSegButton('segment-edit-exit', function() { exitSegmentsEditMode(); });
        bindSegButton('segment-split', segActionSplit);
        bindSegButton('segment-trim-left', segActionTrimLeft);
        bindSegButton('segment-trim-right', segActionTrimRight);
        bindSegButton('segment-copy', segActionCopy);
        bindSegButton('segment-paste', segActionPaste);
        bindSegButton('segment-delete', segActionDelete);
        bindSegButton('segment-merge', segActionMerge);
        // 桌面端顶部工具栏 (图标按钮)
        bindSegButton('seg-tb-exit', function() { exitSegmentsEditMode(); });
        bindSegButton('seg-tb-split', segActionSplit);
        bindSegButton('seg-tb-trim-left', segActionTrimLeft);
        bindSegButton('seg-tb-trim-right', segActionTrimRight);
        bindSegButton('seg-tb-copy', segActionCopy);
        bindSegButton('seg-tb-paste', segActionPaste);
        bindSegButton('seg-tb-delete', segActionDelete);
        bindSegButton('seg-tb-merge', segActionMerge);
        // 分轴缩放按钮 (触屏也可用)
        bindSegButton('seg-zoom-x-in', function() { segZoomAxis('x', 1.2); });
        bindSegButton('seg-zoom-x-out', function() { segZoomAxis('x', 1 / 1.2); });
        bindSegButton('seg-zoom-y-in', function() { segZoomAxis('y', 1.2); });
        bindSegButton('seg-zoom-y-out', function() { segZoomAxis('y', 1 / 1.2); });
        bindSegButton('seg-zoom-reset', function() {
            if (state.pianoRoll) state.pianoRoll.resetZoomAxis();
        });
        // 编辑模式切换滑块 (桌面端状态栏左下角)
        var modeSwitch = $('edit-mode-switch');
        if (modeSwitch) {
            modeSwitch.addEventListener('click', function(e) {
                var opt = e.target.closest ? e.target.closest('.ems-opt') : null;
                var wantSeg = opt ? (opt.getAttribute('data-mode') === 'segment') : !state.segmentsEditMode;
                if (wantSeg && !state.segmentsEditMode) enterSegmentsEditMode();
                else if (!wantSeg && state.segmentsEditMode) exitSegmentsEditMode();
            });
        }
        // 片段编辑器回调
        if (state.pianoRoll) {
            state.pianoRoll.onSegmentCommit = function(id, s, e2, lane, mode) {
                segmentCommitDrag(id, s, e2, lane, mode);
            };
            state.pianoRoll.onSegmentOpen = function(seg) {
                if (!seg) return;
                // 双击片段: 打开该轨道的浮动钢琴卷帘窗口 (不再退出片段模式)
                if (window.SegmentPianoWindow) {
                    window.SegmentPianoWindow.open(seg);
                    return;
                }
                var at = Math.max(0, Math.floor(seg.start || 0));
                exitSegmentsEditMode();
                seekToTick(at);
                if (state.pianoRoll && state.pianoRoll.scrollToTick) {
                    state.pianoRoll.scrollToTick(at);
                }
            };
            state.pianoRoll.onSegmentContextMenu = function(segId, cx, cy) {
                showSegmentContextMenu(segId, cx, cy);
            };
            state.pianoRoll.onSegmentLaneHeightChange = function() {
                try {
                    localStorage.setItem('segment_lane_heights', JSON.stringify(
                        (state.segmentLanes || []).map(function(l) { return l.height; })));
                } catch (er) {}
                renderSegmentSidePanel();
                markDirty();
            };
            state.pianoRoll.onSegmentSelectionChange = function() {
                // 选中变化时仅需要保持工具栏状态; 计数与侧边板无需刷新
            };
        }
        // 片段模式: 拦截页面级 Ctrl/Alt + 滚轮, 避免浏览器缩放整个页面
        document.addEventListener('wheel', function(e) {
            if (!state.segmentsEditMode || !state.pianoRoll) return;
            if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
            // 画布内部由 canvas 自己的 wheel 处理
            if (e.target === state.pianoRoll.canvas) return;
            e.preventDefault();
            var dy = e.deltaY || 0;
            if (e.deltaMode === 1) dy *= 16;
            else if (e.deltaMode === 2) dy *= 100;
            if (!dy) return;
            var factor = Math.max(0.2, Math.min(5, 1 - dy * 0.0025));
            if (e.altKey) state.pianoRoll.zoomSegmentLanes(factor);
            else state.pianoRoll.zoomSegment(factor);
        }, { passive: false });
    }

    // 片段缩放按钮: 横向走 zoomSegment (播放指示器锚点), 纵向调整轨道高度
    function segZoomAxis(axis, factor) {
        if (!state.pianoRoll) return;
        if (axis === 'y') state.pianoRoll.zoomSegmentLanes(factor);
        else state.pianoRoll.zoomSegment(factor);
    }

    // ---- 片段右键菜单 ----
    var _segMenuEl = null;
    function hideSegmentContextMenu() {
        var el = $('segment-context-menu');
        if (el) el.style.display = 'none';
    }
    function showSegmentContextMenu(segId, cx, cy) {
        var menu = $('segment-context-menu');
        if (!menu) return;
        var ids = segmentSelectedIds();
        var canMerge = false;
        if (ids.length === 2) {
            var a = segmentById(ids[0]), b = segmentById(ids[1]);
            if (a && b && a.lane === b.lane) {
                var left = a.start <= b.start ? a : b;
                var right = left === a ? b : a;
                canMerge = (left.end === right.start);
            }
        }
        var seg = segmentById(segId) || segmentSelected();
        var html = '';
        html += '<div class="seg-menu-item" data-act="rename">'
            + '<i class="fa-solid fa-pen-to-square"></i><span>' + i18nText('重命名片段') + '</span></div>';
        html += '<div class="seg-menu-sep"></div>';
        html += '<div class="seg-menu-item' + (canMerge ? '' : ' disabled') + '" data-act="merge">'
            + '<i class="fa-solid fa-object-union"></i><span>' + i18nText('合并片段') + '</span></div>';
        html += '<div class="seg-menu-item" data-act="export">'
            + '<i class="fa-solid fa-file-arrow-down"></i><span>' + i18nText('导出片段为 NBS') + '</span></div>';
        html += '<div class="seg-menu-sep"></div>';
        html += '<div class="seg-menu-item" data-act="copy"><i class="fa-regular fa-copy"></i><span>'
            + i18nText('复制片段') + '</span></div>';
        html += '<div class="seg-menu-item' + (state.segmentClipboard ? '' : ' disabled')
            + '" data-act="paste"><i class="fa-regular fa-paste"></i><span>' + i18nText('粘贴片段') + '</span></div>';
        html += '<div class="seg-menu-item" data-act="delete"><i class="fa-solid fa-trash-can"></i><span>'
            + i18nText('删除片段') + '</span></div>';
        html += '<div class="seg-menu-sep"></div>';
        html += '<div class="seg-menu-item" data-act="mergeAll"><i class="fa-solid fa-object-group"></i><span>'
            + i18nText('合并全部片段') + '</span></div>';
        menu.innerHTML = html;
        menu.style.display = 'block';
        // 边界翻转
        var mw = menu.offsetWidth || 160;
        var mh = menu.offsetHeight || 200;
        var x = Math.min(cx, window.innerWidth - mw - 8);
        var y = Math.min(cy, window.innerHeight - mh - 8);
        menu.style.left = Math.max(8, x) + 'px';
        menu.style.top = Math.max(8, y) + 'px';
        menu.onclick = function(ev) {
            var item = ev.target.closest ? ev.target.closest('.seg-menu-item') : null;
            if (!item || item.classList.contains('disabled')) return;
            var act = item.getAttribute('data-act');
            if (act === 'rename') {
                hideSegmentContextMenu();
                if (seg) showSegmentRename(seg.id, cx, cy);
                return;
            }
            if (act === 'merge') segmentMergeSelected();
            else if (act === 'export') { if (seg) segmentExportOne(seg.id); }
            else if (act === 'copy') segmentCopy();
            else if (act === 'paste') segmentPaste();
            else if (act === 'delete') segmentDelete();
            else if (act === 'mergeAll') segmentMergeAll();
            hideSegmentContextMenu();
        };
        if (!_segMenuEl) {
            _segMenuEl = menu;
            document.addEventListener('mousedown', function(ev) {
                if (menu.style.display === 'none') return;
                if (menu.contains(ev.target)) return;
                hideSegmentContextMenu();
            }, true);
        }
    }

    // ---- 片段重命名 (悬浮输入框) ----
    var _renameSegId = null;
    var _renameBinderDone = false;

    function hideSegmentRename() {
        var pop = $('seg-rename-pop');
        if (pop) pop.style.display = 'none';
        _renameSegId = null;
    }

    function commitSegmentRename() {
        var id = _renameSegId;
        if (id === null) return;
        var seg = segmentById(id);
        var input = $('seg-rename-input');
        if (seg && input) {
            var v = String(input.value || '').trim();
            if (v) seg.name = v;      // 空值则保留原名, 不覆盖
            segmentSync();
            markDirty();
        }
        hideSegmentRename();
    }

    function showSegmentRename(segId, cx, cy) {
        var pop = $('seg-rename-pop');
        var input = $('seg-rename-input');
        if (!pop || !input) return;
        var seg = segmentById(segId);
        if (!seg) return;

        _renameSegId = segId;
        input.value = seg.name || '';
        pop.style.display = 'block';

        // 边界翻转, 避免浮层跑出视口
        var pw = pop.offsetWidth || 194;
        var ph = pop.offsetHeight || 46;
        var x = Math.min(cx, window.innerWidth - pw - 8);
        var y = Math.min(cy, window.innerHeight - ph - 8);
        pop.style.left = Math.max(8, x) + 'px';
        pop.style.top = Math.max(8, y) + 'px';

        input.focus();
        input.select();

        if (!_renameBinderDone) {
            _renameBinderDone = true;
            input.addEventListener('keydown', function(ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    commitSegmentRename();
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    hideSegmentRename();
                }
            });
            input.addEventListener('blur', function() {
                // 失焦即提交 (点击画布/别处时也能保存)
                commitSegmentRename();
            });
        }
    }

    // ---- 播放时的歌词浮层 (屏幕中间偏下, 多条轨道同时触达时按行显示) ----
    var _lastLyricOverlayKey = null;

    function showLyricsOverlay(lines) {
        var el = $('lyrics-overlay');
        var tx = $('lyrics-overlay-text');
        if (!el || !tx) return;
        var arr = lines || [];
        var key = arr.join('\u0001');
        if (key !== _lastLyricOverlayKey) {
            _lastLyricOverlayKey = key;
            var html = '';
            for (var i = 0; i < arr.length; i++) {
                var d = document.createElement('div');
                d.textContent = arr[i];       // 用 textContent 转义, 避免 XSS
                html += '<span class="lyrics-overlay-line">' + d.innerHTML + '</span>';
            }
            tx.innerHTML = html;
        }
        el.style.display = arr.length ? 'block' : 'none';
    }

    function hideLyricsOverlay() {
        var el = $('lyrics-overlay');
        if (el) el.style.display = 'none';
        var tx = $('lyrics-overlay-text');
        if (tx) tx.innerHTML = '';
        _lastLyricOverlayKey = null;
        state._activeLyric = null;
    }

    function resetStreamingLyrics() {
        state._streamingLyricLanes = ['', '', ''];
        state._streamingLyricEndTick = [null, null, null];
    }

    // 拼接流式歌词: 中文等非 ASCII 字符直接相连, 拉丁字母/数字之间补空格, 避免单词粘连
    function joinStreamingText(prev, next) {
        if (!prev) return next;
        if (!next) return prev;
        var a = prev.charAt(prev.length - 1);
        var b = next.charAt(0);
        var isWordChar = /[0-9A-Za-z]/.test(a) && /[0-9A-Za-z]/.test(b);
        return prev + (isWordChar ? ' ' : '') + next;
    }

    // 单轨流式文字的最大长度, 超过则清空当前累积后从新片段重新开始
    var STREAMING_LYRIC_MAX = 40;

    // 取歌词片段的结束 tick (tick + duration), duration 非法时回退默认时长
    function streamingLyricEndTick(clip) {
        var dur = parseInt(clip && clip.duration, 10);
        if (!isFinite(dur) || dur < 1) dur = LYRIC_DEFAULT_DURATION;
        return clip.tick + dur;
    }

    function processStreamingLyricsAtTick(tick) {
        var incoming = getLyricsAt(tick);
        var incomingLanes = [false, false, false];
        for (var i = 0; i < incoming.length; i++) {
            var clip = incoming[i];
            var text = String(clip && clip.text ? clip.text : '');
            if (!text) continue;
            var lane = Math.max(0, Math.min(LYRIC_LANE_COUNT - 1, parseInt(clip.lane, 10) || 0));
            incomingLanes[lane] = true;
            var prevEnd = state._streamingLyricEndTick[lane];
            if (prevEnd !== null && clip.tick !== prevEnd) {
                state._streamingLyricLanes[lane] = '';
            }
            var merged = joinStreamingText(state._streamingLyricLanes[lane], text);
            if (merged.length > STREAMING_LYRIC_MAX) merged = text;
            state._streamingLyricLanes[lane] = merged;
            state._streamingLyricEndTick[lane] = streamingLyricEndTick(clip);
        }
        for (var li = 0; li < LYRIC_LANE_COUNT; li++) {
            var endTick = state._streamingLyricEndTick[li];
            if (!incomingLanes[li] && endTick !== null && tick >= endTick) {
                state._streamingLyricLanes[li] = '';
                state._streamingLyricEndTick[li] = null;
            }
        }
        var lines = [];
        for (var lineIndex = 0; lineIndex < LYRIC_LANE_COUNT; lineIndex++) {
            if (state._streamingLyricLanes[lineIndex]) lines.push(state._streamingLyricLanes[lineIndex]);
        }
        if (lines.length) showLyricsOverlay(lines);
        else hideLyricsOverlay();
    }

    function processLyricsAtTick(tick) {
        if (state.streamingLyrics) {
            processStreamingLyricsAtTick(tick);
            return;
        }
        var lines = [];
        for (var i = 0; i < state.lyrics.length; i++) {
            var c = state.lyrics[i];
            if (!c || !c.text) continue;
            var dur = c.duration || LYRIC_DEFAULT_DURATION;
            if (tick >= c.tick && tick < c.tick + dur) lines.push(c);
        }
        if (!lines.length) {
            if (state._activeLyric) hideLyricsOverlay();
            return;
        }
        lines.sort(function(a, b) { return (a.lane || 0) - (b.lane || 0); });
        var texts = [];
        for (var j = 0; j < lines.length; j++) texts.push(lines[j].text);
        state._activeLyric = { count: texts.length };
        showLyricsOverlay(texts);
    }

    // 导出歌词数据 (lyrics.json): formatVersion 2 使用数组以支持同 tick 多轨
    function buildLyricsJson() {
        var sorted = state.lyrics.slice().sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return (a.lane || 0) - (b.lane || 0);
        });
        var arr = [];
        for (var i = 0; i < sorted.length; i++) {
            arr.push({
                tick: sorted[i].tick,
                lane: sorted[i].lane || 0,
                text: sorted[i].text,
                duration: sorted[i].duration || LYRIC_DEFAULT_DURATION
            });
        }
        return {
            type: 'noteblock-web-lyrics',
            formatVersion: 2,
            laneCount: LYRIC_LANE_COUNT,
            tempo: state.tempo,
            lyrics: arr
        };
    }

    // ---- 导出 ----
    N.segActionMerge = segActionMerge;
    N.bindSegButton = bindSegButton;
    N.initSegmentsUI = initSegmentsUI;
    N.segZoomAxis = segZoomAxis;
    N._segMenuEl = _segMenuEl;
    N.hideSegmentContextMenu = hideSegmentContextMenu;
    N.showSegmentContextMenu = showSegmentContextMenu;
    N._renameSegId = _renameSegId;
    N._renameBinderDone = _renameBinderDone;
    N.hideSegmentRename = hideSegmentRename;
    N.commitSegmentRename = commitSegmentRename;
    N.showSegmentRename = showSegmentRename;
    N._lastLyricOverlayKey = _lastLyricOverlayKey;
    N.showLyricsOverlay = showLyricsOverlay;
    N.hideLyricsOverlay = hideLyricsOverlay;
    N.resetStreamingLyrics = resetStreamingLyrics;
    N.joinStreamingText = joinStreamingText;
    N.STREAMING_LYRIC_MAX = STREAMING_LYRIC_MAX;
    N.streamingLyricEndTick = streamingLyricEndTick;
    N.processStreamingLyricsAtTick = processStreamingLyricsAtTick;
    N.processLyricsAtTick = processLyricsAtTick;
    N.buildLyricsJson = buildLyricsJson;
})(window.WebNBS);
