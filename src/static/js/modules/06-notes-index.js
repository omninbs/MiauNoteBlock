/* 06-notes-index.js — MiauNoteBlock 功能模块
   来源: 原 main.js L2536-L2590; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $setText() { return N.$setText.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }


    // ============ 音符索引 ============
    function buildNoteIndex(notes) {
        var idx = new Map();
        var max = 0;
        if (notes) {
            for (var i = 0; i < notes.length; i++) {
                var n = notes[i];
                if (!n || typeof n.tick !== 'number') continue;
                var tick = Math.floor(n.tick);
                if (tick > max) max = tick;
                if (!idx.has(tick)) idx.set(tick, []);
                idx.get(tick).push(n);
            }
        }
        state.noteIndex = idx;
        state.maxTick = max;
    }

    // 增量更新音符索引（避免全量 buildNoteIndex 重建，提升录制性能）
    function addNoteToIndex(note) {
        if (!note || typeof note.tick !== 'number') return;
        if (!state.noteIndex) state.noteIndex = new Map();
        var tick = Math.floor(note.tick);
        if (!state.noteIndex.has(tick)) state.noteIndex.set(tick, []);
        state.noteIndex.get(tick).push(note);
        if (tick > state.maxTick) state.maxTick = tick;
    }

    function removeNoteFromIndex(note) {
        if (!note || typeof note.tick !== 'number') return;
        if (!state.noteIndex) return;
        var tick = Math.floor(note.tick);
        var arr = state.noteIndex.get(tick);
        if (!arr) return;
        for (var i = arr.length - 1; i >= 0; i--) {
            if (arr[i].id === note.id) { arr.splice(i, 1); break; }
        }
        if (arr.length === 0) state.noteIndex.delete(tick);
    }

    // 节流 DOM 更新：录制时高频按键合并为一次 RAF 更新
    var _perfUIUpdatePending = false;
    function schedulePerformanceUIUpdate() {
        if (_perfUIUpdatePending) return;
        _perfUIUpdatePending = true;
        requestAnimationFrame(function() {
            _perfUIUpdatePending = false;
            // 直接更新音符计数文本（避免 updateNoteCount 内部再次调用 updateTrackPanelUI 导致双重刷新）
            $setText('note-count', '音符: ' + state.notes.length);
            updateTrackPanelUI();
            updateProgressUI();
            markDirty();
        });
    }

    // ---- 导出 ----
    N.buildNoteIndex = buildNoteIndex;
    N.addNoteToIndex = addNoteToIndex;
    N.removeNoteFromIndex = removeNoteFromIndex;
    N.schedulePerformanceUIUpdate = schedulePerformanceUIUpdate;
    N._perfUIUpdatePending = _perfUIUpdatePending;
})(window.WebNBS);
