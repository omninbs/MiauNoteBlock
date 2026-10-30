/* 04-segment-split.js — MiauNoteBlock 功能模块
   来源: 原 main.js L1516-L1643; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function applyNbsRepeatSplit() { return N.applyNbsRepeatSplit.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function enterSegmentsEditMode() { return N.enterSegmentsEditMode.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function mergeIdenticalSegmentTracks() { return N.mergeIdenticalSegmentTracks.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function segmentBuildNbsSplit() { return N.segmentBuildNbsSplit.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function showToast() { return N.showToast.apply(this, arguments); }
    function trimSustainNotes() { return N.trimSustainNotes.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }

    var SEG_SPLIT_SUSTAIN_GAP = 2;

    function openSegSplitPopup() {
        if (!state.song || !state.notes || !state.notes.length) {
            showToast(i18nText('请先打开或导入歌曲'));
            return;
        }
        var popup = $('seg-split-popup');
        if (!popup) return;
        // 初始值与「MIDI 导入 → 后处理」中的同名选项保持一致
        var granEl = $('seg-split-granularity');
        var srcGran = $('midi-repeat-granularity');
        if (granEl) granEl.value = (srcGran && srcGran.value) || 'medium';
        var enEl = $('seg-split-enabled');
        var srcEn = $('midi-split-repeats');
        if (enEl) enEl.checked = srcEn ? srcEn.checked : true;
        popup.style.display = 'flex';
    }

    function closeSegSplitPopup() {
        var popup = $('seg-split-popup');
        if (popup) popup.style.display = 'none';
    }

    function runSegSplit() {
        var enabled = $('seg-split-enabled') ? $('seg-split-enabled').checked : true;
        var gran = $('seg-split-granularity') ? $('seg-split-granularity').value : 'medium';
        var mergeTracks = $('seg-split-merge-tracks') ? $('seg-split-merge-tracks').checked : false;
        closeSegSplitPopup();
        if (!state.song || !state.pianoRoll) return;
        if (!enabled) return;

        // 1. 先对当前工程清除延音 (与「清除延音」功能同一套逻辑, 作用于全部音符)
        //    延音在 NBS 里是同一音轨上连续重复的同音高音符, 会让重复片段的签名变长变脏
        var allNotes = state.pianoRoll.getNotes();
        pushUndo();
        var trimmed = trimSustainNotes(allNotes, allNotes, SEG_SPLIT_SUSTAIN_GAP);
        state.pianoRoll.setNotes(trimmed.notes);
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.song.notes = state.notes;

        // 2. 直接对 NBS 音符做重复分析
        // 以整曲为单位重建片段轨道, 保证可重复执行 (不在已有碎片上再切一层)
        if (!segmentBuildNbsSplit(state.song)) {
            showToast(i18nText('当前歌曲没有可分割的轨道'));
            return;
        }
        // 3. 可选: 合并内容完全相同的轨道 (音色不同也允许), 减少片段轨道数量
        var mergedTracks = mergeTracks ? mergeIdenticalSegmentTracks() : 0;
        var laneCount = (state.segments || []).length;
        applyNbsRepeatSplit(state.song, gran);
        segmentSync();
        markDirty();

        var total = (state.segments || []).length;
        if (total > laneCount) {
            var msg = i18nText('已分割为 ') + total + i18nText(' 个片段');
            if (mergedTracks > 0) msg += i18nText('，合并了 ') + mergedTracks + i18nText(' 条相同轨道');
            showToast(msg);
        } else {
            showToast(i18nText('没有找到值得分割的重复结构'));
        }
        // 片段已构建完毕, 跳过重新捕获 (否则会按 tick 把音符重新塞回片段, 丢掉分轨归属)
        if (!state.segmentsEditMode) enterSegmentsEditMode(true);
    }

    function initSegSplitPopup() {
        var popup = $('seg-split-popup');
        if (!popup) return;
        var closeBtn = $('seg-split-close');
        var cancelBtn = $('seg-split-cancel');
        var okBtn = $('seg-split-ok');
        if (closeBtn) closeBtn.addEventListener('click', closeSegSplitPopup);
        if (cancelBtn) cancelBtn.addEventListener('click', closeSegSplitPopup);
        if (okBtn) okBtn.addEventListener('click', runSegSplit);
        popup.addEventListener('click', function(e) {
            if (e.target === popup) closeSegSplitPopup();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && popup.style.display !== 'none') closeSegSplitPopup();
        });
    }

    // 按「片段区间列表」把一条片段切成多条; 音符 rel 重算为相对各自起点
    // 区间之间的空白 (无音符) 会被直接丢弃, 不生成片段, 也不会拉长相邻片段
    function splitSegmentByRanges(seg, ranges) {
        var notes = (seg.notes || []).slice();
        var segStart = isFinite(seg.start) ? seg.start : 0;
        notes.sort(function(a, b) { return (a.rel || 0) - (b.rel || 0); });
        var out = [];
        var ptr = 0;
        for (var i = 0; i < ranges.length; i++) {
            var pStart = ranges[i].start, pEnd = ranges[i].end;
            if (!(pEnd > pStart)) continue;
            // 跳过落在本区间之前的音符 (区间之间可能存在空白)
            while (ptr < notes.length && (segStart + (notes[ptr].rel || 0)) < pStart) ptr++;
            var pn = [];
            var q = ptr;
            while (q < notes.length) {
                var abs = segStart + (notes[q].rel || 0);
                if (abs >= pEnd) break;
                var src = notes[q];
                pn.push({
                    rel: abs - pStart,
                    layer: src.layer,
                    instrument: src.instrument,
                    key: src.key,
                    velocity: src.velocity,
                    pan: src.pan,
                    pitch: src.pitch
                });
                q++;
            }
            ptr = q;
            if (!pn.length) continue;
            out.push({
                id: 0, lane: seg.lane,
                start: pStart, end: pEnd,
                name: ranges[i].name || seg.name,
                notes: pn
            });
        }
        return out.length ? out : [seg];
    }

    // ---- 导出 ----
    N.openSegSplitPopup = openSegSplitPopup;
    N.closeSegSplitPopup = closeSegSplitPopup;
    N.runSegSplit = runSegSplit;
    N.initSegSplitPopup = initSegSplitPopup;
    N.splitSegmentByRanges = splitSegmentByRanges;
    N.SEG_SPLIT_SUSTAIN_GAP = SEG_SPLIT_SUSTAIN_GAP;
})(window.WebNBS);
