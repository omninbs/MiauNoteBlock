/* 02-history.js — MiauNoteBlock 功能模块
   来源: 原 main.js L988-L1112; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function showAppPrompt() { return N.showAppPrompt.apply(this, arguments); }
    function showExportDialog() { return N.showExportDialog.apply(this, arguments); }
    function updateTrackPanelUI() { return N.updateTrackPanelUI.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }


    // 暴露到全局
    window.showAppAlert = showAppAlert;
    window.showAppConfirm = showAppConfirm;
    window.showAppPrompt = showAppPrompt;
    window.showExportDialog = showExportDialog;

    // ============ 工具函数 ============
    function deepCloneNotes(notes) {
        return notes.map(function(n) {
            return {
                id: n.id, tick: n.tick, layer: n.layer, instrument: n.instrument,
                key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch
            };
        });
    }

    function takeSnapshot() {
        return {
            notes: deepCloneNotes(state.notes),
            tracks: JSON.parse(JSON.stringify(state.tracks || [])),
            layers: JSON.parse(JSON.stringify((state.song && state.song.layers) ? state.song.layers : [])),
            tempo: state.tempo,
            maxTick: state.maxTick,
            // 歌词标注随快照一并记录, 使歌词编辑同样可撤销/重做
            lyrics: JSON.parse(JSON.stringify(state.lyrics || [])),
            // 片段数据随快照记录, 使片段编辑同样可撤销/重做
            segments: JSON.parse(JSON.stringify(state.segments || [])),
            segmentLanes: JSON.parse(JSON.stringify(state.segmentLanes || []))
        };
    }

    function restoreSnapshot(snapshot) {
        state.notes = deepCloneNotes(snapshot.notes || []);
        state.tracks = JSON.parse(JSON.stringify(snapshot.tracks || []));
        if (!state.song) state.song = {};
        state.song.layers = JSON.parse(JSON.stringify(snapshot.layers || []));
        state.tempo = snapshot.tempo;
        state.maxTick = snapshot.maxTick;
        state.lyrics = JSON.parse(JSON.stringify(snapshot.lyrics || []));
        state.segments = JSON.parse(JSON.stringify(snapshot.segments || []));
        state.segmentLanes = JSON.parse(JSON.stringify(snapshot.segmentLanes || []));
        rebuildFromNotes();
        updateTrackPanelUI();
        // 歌词恢复后重建索引并同步到轨道
        lyricRebuildIndex();
        syncLyricsToRoll();
        segmentSync();
        // 撤销/重做会替换片段与轨道对象, 浮动钢琴卷帘窗口需重新绑定后再绘制
        if (window.SegmentPianoWindow) window.SegmentPianoWindow.refresh();
    }

    function pushUndo() {
        // 保存完整状态快照 (音符 + 轨道 + 层 + tempo)
        state.undoStack.push(takeSnapshot());
        if (state.undoStack.length > state.maxUndo) {
            state.undoStack.shift();
        }
        state.redoStack = [];
        updateUndoRedoButtons();
    }

    function performUndo() {
        if (state.undoStack.length === 0) return;
        // 保存当前状态到 redo
        state.redoStack.push(takeSnapshot());
        // 恢复 undo 状态
        var prev = state.undoStack.pop();
        restoreSnapshot(prev);
        markDirty();
        updateUndoRedoButtons();
    }

    function performRedo() {
        if (state.redoStack.length === 0) return;
        // 保存到 undo
        state.undoStack.push(takeSnapshot());
        // 恢复 redo 状态
        var next = state.redoStack.pop();
        restoreSnapshot(next);
        markDirty();
        updateUndoRedoButtons();
    }

    function updateUndoRedoButtons() {
        var undoBtn = $('btn-undo');
        var redoBtn = $('btn-redo');
        if (undoBtn) {
            if (state.undoStack.length === 0) {
                undoBtn.classList.add('disabled');
                undoBtn.disabled = true;
            } else {
                undoBtn.classList.remove('disabled');
                undoBtn.disabled = false;
            }
        }
        if (redoBtn) {
            if (state.redoStack.length === 0) {
                redoBtn.classList.add('disabled');
                redoBtn.disabled = true;
            } else {
                redoBtn.classList.remove('disabled');
                redoBtn.disabled = false;
            }
        }
    }

    function rebuildFromNotes() {
        if (state.pianoRoll) {
            state.pianoRoll.setNotes(state.notes);
        }
        buildNoteIndex(state.notes);
        updateNoteCount();
        updateProgressUI();
    }

    // ============ 片段编辑 (多轨剪辑型, 真剪辑) ============
    // 数据模型:
    //   state.segmentLanes = [{ id, muted, solo, volume, height }]   // 从上到下的片段轨道
    //   state.segments = [{ id, lane, start, end, name,
    //                       notes: [{ rel, layer, instrument, key, velocity, pan, pitch }] }]
    //   - rel   : 相对片段 start 的 tick
    //   - layer : 片段内部的相对轨道号 (缝合时按 lane 顺序重新映射为全局 layer)
    //   - 片段音符独立存储; 切回 NBS / 播放 / 导出时由 segmentCompose() 缝合为 state.notes
    var SEG_DEFAULT_LANE_H = 52;

    // ---- 导出 ----
    N.deepCloneNotes = deepCloneNotes;
    N.takeSnapshot = takeSnapshot;
    N.restoreSnapshot = restoreSnapshot;
    N.pushUndo = pushUndo;
    N.performUndo = performUndo;
    N.performRedo = performRedo;
    N.updateUndoRedoButtons = updateUndoRedoButtons;
    N.rebuildFromNotes = rebuildFromNotes;
    N.SEG_DEFAULT_LANE_H = SEG_DEFAULT_LANE_H;
})(window.WebNBS);
