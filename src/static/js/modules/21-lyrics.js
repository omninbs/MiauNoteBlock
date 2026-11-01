/* 21-lyrics.js — MiauNoteBlock 功能模块
   歌词轨道 (额外轨道) + 歌词块数据层。
   歌词轨道不是 NBS 轨道: 不写入 .nbs, 只随工程元数据 (lyrics.json / 自动保存) 持久化;
   在钢琴卷帘中按 after 字段插在第 after 条 NBS 轨道下方显示, 行内只能放歌词块。
   依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function closeTransientFloats() { return N.closeTransientFloats.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function segmentCopy() { return N.segmentCopy.apply(this, arguments); }
    function segmentDelete() { return N.segmentDelete.apply(this, arguments); }
    function segmentPaste() { return N.segmentPaste.apply(this, arguments); }
    function segmentSplit() { return N.segmentSplit.apply(this, arguments); }
    function segmentTrimLeft() { return N.segmentTrimLeft.apply(this, arguments); }
    function segmentTrimRight() { return N.segmentTrimRight.apply(this, arguments); }
    function showSmallTip() { return N.showSmallTip.apply(this, arguments); }
    function syncSegmentToolbarTop() { return N.syncSegmentToolbarTop.apply(this, arguments); }
    function updateRadioTempoSlider() { return N.updateRadioTempoSlider.apply(this, arguments); }

    // 窗口 resize 时重定位 (因为容器宽度变化)
    window.addEventListener('resize', function() {
        updateRadioTempoSlider();
        // 画布重排后片段工具栏的落点可能变化 (时间栏高度/位置相关)
        if (state.segmentsEditMode) {
            syncSegmentToolbarTop();
            requestAnimationFrame(syncSegmentToolbarTop);
        }
        hideLyricClipMenu();
    });

    // ============ 常量 ============
    // 歌词轨道数量上限 (防止误点造成无限增长)
    var LYRIC_LANE_LIMIT = 16;
    var LYRIC_DEFAULT_DURATION = 4;
    var LYRIC_DEFAULT_TEXT = '请输入文本';

    // ============ 歌词轨道 (额外轨道) ============
    function lyricLaneCount() {
        return Array.isArray(state.lyricLanes) ? state.lyricLanes.length : 0;
    }

    // 当前 NBS 音轨数量 (歌词轨道的插入位置以它为参照)
    // 优先用 song.layers (与钢琴卷帘 trackCount 同源); state.tracks 只包含有音符的轨道, 数量可能更少
    function nbsTrackCount() {
        if (state.song && Array.isArray(state.song.layers) && state.song.layers.length) {
            return state.song.layers.length;
        }
        return Array.isArray(state.tracks) ? state.tracks.length : 0;
    }

    // 插入位置 after: 表示显示在第 after 条 NBS 音轨下方 (-1 = 最上方)
    // 未指定 / 越界时钳制到 [-1, trackCount-1]; 缺省落在最后一条 NBS 轨道下方
    function clampLyricAfter(after, trackCountHint) {
        var tc = (typeof trackCountHint === 'number') ? trackCountHint : nbsTrackCount();
        if (!isFinite(tc) || tc < 0) tc = 0;
        var v = parseInt(after, 10);
        if (!isFinite(v)) v = tc - 1;
        if (v < -1) v = -1;
        if (v > tc - 1) v = tc - 1;
        return v;
    }

    // 歌词轨道数组当前 id 顺序 (重排后据此把歌词块的 lane 索引重新映射)
    function laneIdList() {
        var ids = [];
        for (var i = 0; i < state.lyricLanes.length; i++) ids.push(state.lyricLanes[i].id);
        return ids;
    }

    function remapLyricClipLanes(oldIds) {
        var pos = {};
        for (var i = 0; i < state.lyricLanes.length; i++) pos[state.lyricLanes[i].id] = i;
        for (var j = 0; j < (state.lyrics || []).length; j++) {
            var c = state.lyrics[j];
            if (!c) continue;
            var oldIdx = c.lane || 0;
            var id = oldIds[oldIdx];
            if (id != null && pos[id] !== undefined) c.lane = pos[id];
        }
    }

    function genLyricLaneId() {
        state._lyricLaneIdSeq = (state._lyricLaneIdSeq || 0) + 1;
        return 'll' + state._lyricLaneIdSeq;
    }

    function defaultLaneName(index) {
        return i18nText('歌词') + ' ' + (index + 1);
    }

    // 归一化单条歌词轨道定义
    function normalizeLyricLane(lane, index) {
        if (!lane || typeof lane !== 'object') return null;
        var name = String(lane.name == null ? '' : lane.name).trim();
        var after = parseInt(lane.after, 10);
        return {
            id: lane.id || genLyricLaneId(),
            name: name || defaultLaneName(index),
            // null = 未指定, 由 ensureLyricLanes 按当前音轨数补齐
            after: isFinite(after) ? after : null
        };
    }

    // 保证 state.lyricLanes 合法, 并把越界/缺失的歌词块归位 (幂等, 可频繁调用)
    //   - 旧工程只有 lyrics (lane 0..2) 没有轨道定义时, 按最大 lane 自动补齐轨道
    function ensureLyricLanes() {
        if (!Array.isArray(state.lyricLanes)) state.lyricLanes = [];
        var lanes = state.lyricLanes;

        // 非法项清理 (仅在发现非法项时重建)
        var dirty = false;
        for (var i = 0; i < lanes.length; i++) {
            if (!lanes[i] || typeof lanes[i] !== 'object' || !lanes[i].id) { dirty = true; break; }
        }
        if (dirty) {
            var clean = [];
            for (var j = 0; j < lanes.length; j++) {
                var ln = normalizeLyricLane(lanes[j], clean.length);
                if (ln) clean.push(ln);
            }
            state.lyricLanes = lanes = clean;
        }

        // 旧数据迁移: 歌词引用到不存在的轨道 → 补齐
        var maxLane = -1;
        var lyrics = state.lyrics || [];
        for (var k = 0; k < lyrics.length; k++) {
            var c = lyrics[k];
            if (!c) continue;
            var l = parseInt(c.lane, 10);
            if (isFinite(l) && l > maxLane) maxLane = l;
        }
        while (state.lyricLanes.length <= maxLane && state.lyricLanes.length < LYRIC_LANE_LIMIT) {
            state.lyricLanes.push({ id: genLyricLaneId(), name: defaultLaneName(state.lyricLanes.length), after: null });
        }

        // 插入位置归位: 缺失/越界 → 最后一条 NBS 轨道下方 (按当前音轨数钳制)
        var tc = nbsTrackCount();
        for (var q = 0; q < state.lyricLanes.length; q++) {
            state.lyricLanes[q].after = clampLyricAfter(state.lyricLanes[q].after, tc);
            if (!state.lyricLanes[q].name) state.lyricLanes[q].name = defaultLaneName(q);
        }

        // lane 越界 → 压到最后一个轨道
        if (state.lyricLanes.length) {
            for (var m = 0; m < lyrics.length; m++) {
                if (!lyrics[m]) continue;
                var v = parseInt(lyrics[m].lane, 10);
                if (!isFinite(v) || v < 0) v = 0;
                if (v > state.lyricLanes.length - 1) v = state.lyricLanes.length - 1;
                lyrics[m].lane = v;
            }
        }
        return state.lyricLanes;
    }

    function lyricLaneList() {
        return ensureLyricLanes().slice();
    }

    // 追加一条歌词轨道 (after = 插入到第几条 NBS 轨道下方, 缺省为最后一条下方)
    // 返回新轨道索引, 失败返回 -1
    function addLyricLane(after) {
        ensureLyricLanes();
        if (state.lyricLanes.length >= LYRIC_LANE_LIMIT) {
            showSmallTip(i18nText('歌词轨道数量已达上限') + ' (' + LYRIC_LANE_LIMIT + ')');
            return -1;
        }
        pushUndo();
        var tc = nbsTrackCount();
        var a = clampLyricAfter(after, tc);
        var oldIds = laneIdList();
        var lane = { id: genLyricLaneId(), name: defaultLaneName(state.lyricLanes.length), after: a };
        // 追加到同插值组的末尾, 保持组内顺序稳定
        var insertAt = state.lyricLanes.length;
        for (var i = state.lyricLanes.length - 1; i >= 0; i--) {
            if (clampLyricAfter(state.lyricLanes[i].after, tc) === a) { insertAt = i + 1; break; }
        }
        state.lyricLanes.splice(insertAt, 0, lane);
        remapLyricClipLanes(oldIds);
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return insertAt;
    }

    // 删除一条歌词轨道 (其上的歌词块一并删除)
    function removeLyricLane(index) {
        ensureLyricLanes();
        var idx = parseInt(index, 10);
        if (!(idx >= 0 && idx < state.lyricLanes.length)) return false;
        pushUndo();
        state.lyricLanes.splice(idx, 1);
        var kept = [];
        for (var i = 0; i < (state.lyrics || []).length; i++) {
            var c = state.lyrics[i];
            if (!c) continue;
            var l = c.lane || 0;
            if (l === idx) {
                if (state.activeLyricId === c.id) state.activeLyricId = null;
                continue;
            }
            if (l > idx) c.lane = l - 1;
            kept.push(c);
        }
        state.lyrics = kept;
        if (state.pianoRoll && state.pianoRoll.lyricSelectedId != null) {
            var stillThere = false;
            for (var j = 0; j < kept.length; j++) {
                if (kept[j].id === state.pianoRoll.lyricSelectedId) { stillThere = true; break; }
            }
            if (!stillThere && state.pianoRoll._setLyricSelected) state.pianoRoll._setLyricSelected(null);
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    function renameLyricLane(index, name) {
        ensureLyricLanes();
        var idx = parseInt(index, 10);
        if (!(idx >= 0 && idx < state.lyricLanes.length)) return false;
        var next = String(name == null ? '' : name).trim();
        if (!next) next = defaultLaneName(idx);
        if (state.lyricLanes[idx].name === next) return false;
        pushUndo();
        state.lyricLanes[idx].name = next;
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // 拖动歌词轨道: 把它移到第 after 条 NBS 轨道下方 (after = -1 表示最上方)
    //   轨道在数组中的顺序只决定同一插值组内的先后, 因此同时把它排到目标组末尾
    function moveLyricLaneTo(index, after) {
        ensureLyricLanes();
        var lanes = state.lyricLanes;
        var idx = parseInt(index, 10);
        if (!isFinite(idx) || idx < 0 || idx >= lanes.length) return false;
        var tc = nbsTrackCount();
        var target = clampLyricAfter(after, tc);
        // 已在目标组末尾 → 无需改动
        var alreadyLast = true;
        for (var k = idx + 1; k < lanes.length; k++) {
            if (clampLyricAfter(lanes[k].after, tc) === target) { alreadyLast = false; break; }
        }
        if (clampLyricAfter(lanes[idx].after, tc) === target && alreadyLast) return false;
        pushUndo();
        var oldIds = laneIdList();
        var lane = lanes.splice(idx, 1)[0];
        lane.after = target;
        var insertAt = lanes.length;
        for (var i = lanes.length - 1; i >= 0; i--) {
            if (clampLyricAfter(lanes[i].after, tc) === target) { insertAt = i + 1; break; }
        }
        lanes.splice(insertAt, 0, lane);
        remapLyricClipLanes(oldIds);
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // 整体替换轨道定义 (导入 / 撤销快照恢复)
    function setLyricLanes(list) {
        var clean = [];
        if (Array.isArray(list)) {
            for (var i = 0; i < list.length && clean.length < LYRIC_LANE_LIMIT; i++) {
                var ln = normalizeLyricLane(list[i], clean.length);
                if (ln) clean.push(ln);
            }
        }
        state.lyricLanes = clean;
        return ensureLyricLanes();
    }

    // ============ 歌词块 ============
    // 轨道索引钳制 (创建/粘贴用; 无歌词轨道时返回 0, 由 ensureLyricLanes 负责补轨)
    function clampLaneIndex(lane) {
        var n = lyricLaneCount();
        var v = parseInt(lane, 10);
        if (!isFinite(v) || v < 0) v = 0;
        if (n <= 0) return 0;
        return v > n - 1 ? n - 1 : v;
    }

    // 归一化单个歌词片段 (补齐 id / lane / duration); 非法返回 null
    // 逐字对齐生成的片段额外带 lineStart / noteLayer / noteTick / charIndex, 一并保留
    //   laneCountHint: 传入轨道数量用于 clamp; 传 -1 表示不 clamp (导入场景, 由 applyLyricsData 统一归位)
    function normalizeLyricClip(c, laneCountHint) {
        if (!c || typeof c !== 'object') return null;
        var tick = parseInt(c.tick, 10);
        if (!isFinite(tick) || tick < 0) return null;
        var dur = parseInt(c.duration, 10);
        if (!isFinite(dur) || dur < 1) dur = LYRIC_DEFAULT_DURATION;
        var lane = parseInt(c.lane, 10);
        if (!isFinite(lane) || lane < 0) lane = 0;
        if (laneCountHint !== -1) {
            var maxLane = (typeof laneCountHint === 'number' && laneCountHint > 0)
                ? laneCountHint - 1
                : (lyricLaneCount() > 0 ? lyricLaneCount() - 1 : -1);
            if (maxLane >= 0 && lane > maxLane) lane = maxLane;
        }
        var out = {
            id: c.id || genLyricId(),
            tick: tick,
            lane: lane,
            text: String(c.text == null ? '' : c.text),
            duration: dur
        };
        if (c.lineStart) out.lineStart = true;
        var noteLayer = parseInt(c.noteLayer, 10);
        if (isFinite(noteLayer) && c.noteLayer !== null && c.noteLayer !== undefined) out.noteLayer = noteLayer;
        var noteTick = parseInt(c.noteTick, 10);
        if (isFinite(noteTick) && c.noteTick !== null && c.noteTick !== undefined) out.noteTick = Math.max(0, noteTick);
        var charIndex = parseInt(c.charIndex, 10);
        if (isFinite(charIndex) && c.charIndex !== null && c.charIndex !== undefined) out.charIndex = Math.max(0, charIndex);
        return out;
    }

    // tick -> [该 tick 上所有生效的歌词] (允许多条轨道同时有歌词)
    function lyricRebuildIndex() {
        state._lyricIndex = {};
        for (var i = 0; i < state.lyrics.length; i++) {
            var ly = state.lyrics[i];
            if (!ly || !ly.text) continue;
            if (!state._lyricIndex[ly.tick]) state._lyricIndex[ly.tick] = [];
            state._lyricIndex[ly.tick].push(ly);
        }
    }

    function getLyricsAt(tick) {
        if (!state._lyricIndex) lyricRebuildIndex();
        return state._lyricIndex[tick] || [];
    }

    function syncLyricsToRoll() {
        if (!state.pianoRoll) return;
        ensureLyricLanes();
        var out = [];
        for (var i = 0; i < state.lyrics.length; i++) {
            var c = normalizeLyricClip(state.lyrics[i]);
            if (c) out.push(c);
        }
        out.sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return (a.lane || 0) - (b.lane || 0);
        });
        state.lyrics = out;
        if (state.song) state.song.lyrics = JSON.parse(JSON.stringify(out));
        state.pianoRoll.lyricTicks = out;
        if (state.pianoRoll.setLyricLanes) state.pianoRoll.setLyricLanes(state.lyricLanes);
        state.pianoRoll._fullRedrawNeeded = true;
        state.pianoRoll.render();
    }

    // 歌词片段 id 生成器
    function genLyricId() {
        state._lyricIdSeq = (state._lyricIdSeq || 0) + 1;
        return 'ly' + state._lyricIdSeq + '_' + Date.now().toString(36);
    }

    // 在指定 tick / 轨道新建歌词片段 (同轨同 tick 已存在则返回既有片段)
    function createLyricClip(tick, lane) {
        if (!isFinite(tick) || tick < 0) return null;
        if (!lyricLaneCount()) return null;
        tick = Math.floor(tick);
        lane = clampLaneIndex(lane);
        for (var i = 0; i < state.lyrics.length; i++) {
            var c = state.lyrics[i];
            if (c.tick === tick && (c.lane || 0) === lane) return c;
        }
        var clip = { id: genLyricId(), tick: tick, lane: lane, text: '', duration: LYRIC_DEFAULT_DURATION };
        state.lyrics.push(clip);
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return clip;
    }

    // 删除指定 id 的歌词片段 (skipUndo=true 时由调用方自行处理撤销)
    function deleteLyricClip(id, skipUndo) {
        var removed = false;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { state.lyrics.splice(i, 1); removed = true; break; }
        }
        if (!removed) return;
        if (!skipUndo) pushUndo();
        if (state.activeLyricId === id) state.activeLyricId = null;
        if (state.pianoRoll && state.pianoRoll.lyricSelectedId === id) {
            state.pianoRoll._setLyricSelected(null);
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
    }

    // 当前选中的歌词片段 (优先取卷帘选中态)
    function getSelectedLyricClip() {
        var id = (state.pianoRoll && state.pianoRoll.lyricSelectedId != null)
            ? state.pianoRoll.lyricSelectedId : state.activeLyricId;
        if (id == null) return null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) return state.lyrics[i];
        }
        return null;
    }

    // 拖动结束提交: 仅 move 模式做「覆盖交换位置」(端点拉伸已被邻居边界钳制, 无需交换)
    function commitLyricClipDrag(id, origTick, origLane, mode) {
        var clip = null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { clip = state.lyrics[i]; break; }
        }
        if (clip && mode === 'move') {
            var lane = clip.lane || 0;
            var end = clip.tick + (clip.duration || LYRIC_DEFAULT_DURATION);
            var best = null, bestOv = 0;
            for (var j = 0; j < state.lyrics.length; j++) {
                var o = state.lyrics[j];
                if (o === clip || (o.lane || 0) !== lane) continue;
                var oEnd = o.tick + (o.duration || LYRIC_DEFAULT_DURATION);
                var ov = Math.min(end, oEnd) - Math.max(clip.tick, o.tick);
                if (ov > 0 && ov > bestOv) { bestOv = ov; best = o; }
            }
            if (best) {
                var bt = best.tick, bl = best.lane || 0;
                best.tick = origTick;
                best.lane = origLane;
                clip.tick = bt;
                clip.lane = bl;
            }
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
    }

    // ---- 歌词片段剪切 / 复制 / 粘贴 ----
    // clipId 缺省时使用当前选中片段 (键盘快捷键 / 右键菜单调用)
    function copyLyricClip(cut, clipId) {
        var clip = null;
        if (clipId != null) {
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === clipId) { clip = state.lyrics[i]; break; }
            }
        } else {
            clip = getSelectedLyricClip();
        }
        if (!clip) return false;
        state.lyricClipboard = [{
            text: clip.text,
            duration: clip.duration || LYRIC_DEFAULT_DURATION,
            lane: clip.lane || 0,
            relTick: 0
        }];
        if (cut) deleteLyricClip(clip.id);
        return true;
    }

    // 同轨是否已存在与该区间重叠的片段
    function findLyricConflict(lane, tick, dur) {
        for (var i = 0; i < state.lyrics.length; i++) {
            var o = state.lyrics[i];
            if ((o.lane || 0) !== lane) continue;
            var oEnd = o.tick + (o.duration || LYRIC_DEFAULT_DURATION);
            if (Math.min(tick + dur, oEnd) > Math.max(tick, o.tick)) return true;
        }
        return false;
    }

    // 粘贴到指定 tick / 轨道 (歌词轨道右键菜单用); tick 为负或未指定时用播放头
    function pasteLyricClipsAt(tick, lane) {
        if (!state.lyricClipboard.length || !lyricLaneCount()) return false;
        var base = (typeof tick === 'number' && isFinite(tick) && tick >= 0)
            ? Math.floor(tick)
            : Math.max(0, Math.floor(state.currentTick || 0));
        var forceLane = (typeof lane === 'number' && isFinite(lane) && lane >= 0) ? clampLaneIndex(lane) : -1;
        pushUndo();
        for (var i = 0; i < state.lyricClipboard.length; i++) {
            var it = state.lyricClipboard[i];
            var l = (forceLane >= 0) ? forceLane : clampLaneIndex(it.lane || 0);
            var dur = it.duration || LYRIC_DEFAULT_DURATION;
            var t = base + (it.relTick || 0);
            var guard = 0;
            while (findLyricConflict(l, t, dur) && guard++ < 512) t++;
            state.lyrics.push({
                id: genLyricId(), tick: t, lane: l,
                text: it.text || '', duration: dur
            });
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // 粘贴到播放头位置 (保留原轨道; 同轨冲突时依次后移)
    function pasteLyricClips() {
        return pasteLyricClipsAt(-1, -1);
    }

    // 删除多个歌词块 (一次撤销点); 单个时复用 deleteLyricClip
    function deleteLyricClips(ids) {
        ids = ids || [];
        if (!ids.length) return false;
        if (ids.length === 1) { deleteLyricClip(ids[0]); return true; }
        var set = {};
        for (var i = 0; i < ids.length; i++) set[ids[i]] = true;
        var kept = [];
        for (var j = 0; j < state.lyrics.length; j++) {
            if (!set[state.lyrics[j].id]) kept.push(state.lyrics[j]);
        }
        if (kept.length === state.lyrics.length) return false;
        pushUndo();
        state.lyrics = kept;
        if (set[state.activeLyricId]) state.activeLyricId = null;
        if (state.pianoRoll) {
            if (set[state.pianoRoll.lyricSelectedId]) state.pianoRoll.lyricSelectedId = null;
            state.pianoRoll.lyricSelectedIds = (state.pianoRoll.lyricSelectedIds || []).filter(function(id) { return !set[id]; });
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // 歌词编辑小悬浮窗 (剪映风格: 位置跟随鼠标, 挂在 body 上避免祖先 backdrop-filter 破坏 fixed 定位)
    // skipClean=true 时不做「空片段回收」(commit 已处理过数据)
    function closeLyricEditorPop(skipClean) {
        var pop = document.getElementById('lyric-editor-pop');
        if (!pop) return;
        if (!skipClean) {
            var cid = pop.getAttribute('data-clip-id');
            var c = null;
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === cid) { c = state.lyrics[i]; break; }
            }
            // 无文字的片段 (多为刚新建后放弃编辑) 直接回收 (不产生撤销步骤)
            if (c && !String(c.text || '').trim()) deleteLyricClip(cid, true);
        }
        pop.remove();
    }

    function showLyricEditorPop(id, clientX, clientY) {
        var clip = null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { clip = state.lyrics[i]; break; }
        }
        if (!clip) return;
        // 新建片段 (尚无文字) 的撤销点应为「片段不存在」的状态,
        // 因此保存时先摘除该片段再 pushUndo, 写入文字时再放回
        var isNewClip = !String(clip.text || '').trim();
        closeLyricEditorPop();
        closeTransientFloats();

        var pop = document.createElement('div');
        pop.className = 'lyric-editor-pop';
        pop.id = 'lyric-editor-pop';
        pop.setAttribute('data-clip-id', id);
        pop.innerHTML =
            '<div class="lyric-editor-pop-head">'
            + '<span class="lyric-editor-pop-title">' + i18nText('歌词') + '</span>'
            + '<button type="button" class="lyric-editor-pop-close" id="lyric-editor-pop-close">&times;</button>'
            + '</div>'
            + '<input type="text" class="lyric-editor-pop-input" id="lyric-editor-pop-input" maxlength="200">'
            + '<div class="lyric-editor-pop-actions">'
            + '<button type="button" class="lyric-editor-pop-btn is-danger" id="lyric-editor-pop-del">' + i18nText('删除') + '</button>'
            + (isNewClip ? '' :
                '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-cut" title="' + i18nText('剪切') + '"><i class="fa-solid fa-scissors"></i></button>'
                + '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-copy" title="' + i18nText('复制') + '"><i class="fa-regular fa-copy"></i></button>')
            + '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-paste" title="' + i18nText('粘贴') + '"'
            + (state.lyricClipboard.length ? '' : ' disabled') + '><i class="fa-solid fa-paste"></i></button>'
            + '<span class="lyric-editor-pop-spacer"></span>'
            + '<button type="button" class="lyric-editor-pop-btn" id="lyric-editor-pop-cancel">' + i18nText('取消') + '</button>'
            + '<button type="button" class="lyric-editor-pop-btn is-primary" id="lyric-editor-pop-save">' + i18nText('保存') + '</button>'
            + '</div>';
        document.body.appendChild(pop);

        var input = pop.querySelector('#lyric-editor-pop-input');
        input.value = clip.text || '';
        // 留空保存时将填入默认文本, 以 placeholder 提示用户
        input.placeholder = i18nText('请输入文本');

        // 定位在鼠标旁边 (默认右下, 越界时翻转到左上)
        var px = (typeof clientX === 'number') ? clientX : 0;
        var py = (typeof clientY === 'number') ? clientY : 0;
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var left = px + 14, top = py + 14;
        if (left + pw > window.innerWidth - 8) left = Math.max(8, px - pw - 14);
        if (top + ph > window.innerHeight - 8) top = Math.max(8, py - ph - 14);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        // 放弃尚未保存的新建片段 (不产生撤销步骤)
        var dropPending = function() {
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === id) { state.lyrics.splice(i, 1); break; }
            }
            if (state.pianoRoll && state.pianoRoll.lyricSelectedId === id) state.pianoRoll._setLyricSelected(null);
            lyricRebuildIndex();
            syncLyricsToRoll();
        };
        var commit = function(remove) {
            var v = String(input.value == null ? '' : input.value).trim();
            if (isNewClip) {
                if (remove) {
                    // 删除按钮: 放弃新建, 不产生撤销步骤
                    dropPending();
                } else {
                    // 保存: 留空则填入默认文本 (避免空文本片段)
                    dropPending();
                    pushUndo();          // 撤销点 = 片段尚不存在
                    clip.text = v || LYRIC_DEFAULT_TEXT;
                    state.lyrics.push(clip);
                    state.activeLyricId = clip.id;
                    lyricRebuildIndex();
                    syncLyricsToRoll();
                    markDirty();
                }
            } else {
                if (remove) {
                    pushUndo();
                    deleteLyricClip(id, true);
                } else {
                    // 保存: 留空则填入默认文本 (不删除, 避免误操作丢失片段)
                    pushUndo();
                    clip.text = v || LYRIC_DEFAULT_TEXT;
                    lyricRebuildIndex();
                    syncLyricsToRoll();
                    markDirty();
                }
            }
            closeLyricEditorPop(true);
        };
        // 取消 / 关闭: 若该片段仍无文字 (多为刚新建), 视为放弃, 一并移除
        var dismiss = function() {
            closeLyricEditorPop(false);
        };

        pop.querySelector('#lyric-editor-pop-close').addEventListener('click', dismiss);
        pop.querySelector('#lyric-editor-pop-cancel').addEventListener('click', dismiss);
        pop.querySelector('#lyric-editor-pop-del').addEventListener('click', function() { commit(true); });
        pop.querySelector('#lyric-editor-pop-save').addEventListener('click', function() { commit(false); });
        // 剪切 / 复制 / 粘贴 (手机端也可在片段编辑窗内直接操作; 新建空片段时不显示剪切/复制)
        var cutBtn2 = pop.querySelector('#lyric-editor-pop-cut');
        if (cutBtn2) cutBtn2.addEventListener('click', function() {
            if (copyLyricClip(true, id)) closeLyricEditorPop(true);
        });
        var copyBtn2 = pop.querySelector('#lyric-editor-pop-copy');
        if (copyBtn2) copyBtn2.addEventListener('click', function() {
            if (copyLyricClip(false, id)) closeLyricEditorPop(true);
        });
        pop.querySelector('#lyric-editor-pop-paste').addEventListener('click', function() {
            if (isNewClip) dropPending();   // 先丢弃尚未保存的空片段, 避免留下无文字片段
            pasteLyricClips();
            closeLyricEditorPop(true);
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(false); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); }
        });
        setTimeout(function() { input.focus(); input.select(); }, 30);
    }

    // ============ 歌词右键菜单 ============
    var _lyricCtxEl = null;
    function hideLyricClipMenu() {
        if (_lyricCtxEl && _lyricCtxEl.parentNode) _lyricCtxEl.parentNode.removeChild(_lyricCtxEl);
        _lyricCtxEl = null;
    }

    // 复用应用统一的 .context-menu 外观 (毛玻璃背景/圆角/阴影), 避免自建菜单没有底色
    function _ctxMenu() {
        var menu = document.createElement('div');
        menu.className = 'context-menu visible';
        menu.style.position = 'fixed';
        menu.style.zIndex = '100420';
        return menu;
    }

    function _ctxItem(icon, label, opts) {
        opts = opts || {};
        var el = document.createElement('div');
        el.className = 'context-menu-item' + (opts.danger ? ' danger' : '');
        if (opts.disabled) {
            el.style.opacity = '0.45';
            el.style.pointerEvents = 'none';
        }
        el.innerHTML = '<i class="' + (icon || '') + '"></i><span>' + label + '</span>';
        return el;
    }

    function _showCtxMenu(menu, clientX, clientY) {
        document.body.appendChild(menu);
        // 贴鼠标右下显示, 越界翻转
        var r = menu.getBoundingClientRect();
        var left = clientX + 6, top = clientY + 6;
        if (left + r.width > window.innerWidth - 6) left = Math.max(6, clientX - r.width - 6);
        if (top + r.height > window.innerHeight - 6) top = Math.max(6, clientY - r.height - 6);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        _lyricCtxEl = menu;
        setTimeout(function() {
            document.addEventListener('click', function onDoc(ev) {
                if (_lyricCtxEl && !_lyricCtxEl.contains(ev.target)) {
                    hideLyricClipMenu();
                    document.removeEventListener('click', onDoc);
                }
            });
        }, 0);
    }

    // 右键歌词块: 剪切 / 复制 / 删除 / 编辑 (全部作用于右键位置的这个块)
    function showLyricClipMenu(clipId, clientX, clientY) {
        hideLyricClipMenu();
        closeTransientFloats();
        var clip = null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === clipId) { clip = state.lyrics[i]; break; }
        }
        if (!clip) return;
        if (state.pianoRoll && state.pianoRoll._setLyricSelected) state.pianoRoll._setLyricSelected(clip.id);

        var menu = _ctxMenu();
        var acts = [
            { icon: 'fa-solid fa-scissors', label: i18nText('剪切'), run: function() { copyLyricClip(true, clip.id); } },
            { icon: 'fa-regular fa-copy', label: i18nText('复制'), run: function() { copyLyricClip(false, clip.id); } },
            { icon: 'fa-solid fa-trash-can', label: i18nText('删除'), danger: true, run: function() { deleteLyricClip(clip.id); } },
            { icon: 'fa-solid fa-pen-to-square', label: i18nText('编辑'), run: function() { showLyricEditorPop(clip.id, clientX, clientY); } }
        ];
        for (var k = 0; k < acts.length; k++) {
            (function(a) {
                var el = _ctxItem(a.icon, a.label, { danger: a.danger });
                el.addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    hideLyricClipMenu();
                    a.run();
                });
                menu.appendChild(el);
            })(acts[k]);
        }
        _showCtxMenu(menu, clientX, clientY);
    }

    // 右键歌词轨道空白区: 粘贴 / 全选
    function showLyricLaneMenu(lane, tick, clientX, clientY) {
        hideLyricClipMenu();
        closeTransientFloats();
        lane = clampLaneIndex(lane);
        var menu = _ctxMenu();
        var pasteEl = _ctxItem('fa-solid fa-paste', i18nText('粘贴'), { disabled: !state.lyricClipboard.length });
        pasteEl.addEventListener('click', function(ev) {
            ev.stopPropagation();
            hideLyricClipMenu();
            pasteLyricClipsAt(tick, lane);
        });
        var allEl = _ctxItem('fa-solid fa-object-group', i18nText('全选'));
        allEl.addEventListener('click', function(ev) {
            ev.stopPropagation();
            hideLyricClipMenu();
            selectLyricLaneClips(lane);
        });
        menu.appendChild(pasteEl);
        menu.appendChild(allEl);
        _showCtxMenu(menu, clientX, clientY);
    }

    // 选中某条歌词轨道上的全部歌词块
    function selectLyricLaneClips(lane) {
        lane = clampLaneIndex(lane);
        var ids = [];
        for (var i = 0; i < state.lyrics.length; i++) {
            if ((state.lyrics[i].lane || 0) === lane) ids.push(state.lyrics[i].id);
        }
        if (!ids.length) return false;
        if (state.pianoRoll && state.pianoRoll.setLyricMultiSelection) {
            state.pianoRoll.setLyricMultiSelection(ids);
        }
        return true;
    }

    // ============ 初始化 ============
    function initLyricsUI() {
        ensureLyricLanes();
        window.addEventListener('resize', hideLyricClipMenu);
        window.addEventListener('wheel', hideLyricClipMenu, { passive: true });
        syncLyricsToRoll();
    }

    // ============ 片段编辑 UI ============
    // 动作 (桌面顶部工具栏 / 手机悬浮条共用)
    function segActionSplit() {
        if (!segmentSplit()) showSmallTip(i18nText('请先把播放头移到选中片段内部'));
    }
    function segActionTrimLeft() {
        if (!segmentTrimLeft()) showSmallTip(i18nText('请选中片段，并把播放头放在片段内部'));
    }
    function segActionTrimRight() {
        if (!segmentTrimRight()) showSmallTip(i18nText('请选中片段，并把播放头放在片段内部'));
    }
    function segActionCopy() {
        if (!segmentCopy()) showSmallTip(i18nText('请先选中一个片段'));
    }
    function segActionPaste() {
        if (!segmentPaste()) showSmallTip(i18nText('请先复制一个片段'));
    }
    function segActionDelete() {
        if (!segmentDelete()) showSmallTip(i18nText('请先选中一个片段'));
    }

    // ---- 导出 ----
    N.lyricLaneCount = lyricLaneCount;
    N.lyricLaneList = lyricLaneList;
    N.ensureLyricLanes = ensureLyricLanes;
    N.addLyricLane = addLyricLane;
    N.removeLyricLane = removeLyricLane;
    N.renameLyricLane = renameLyricLane;
    N.moveLyricLaneTo = moveLyricLaneTo;
    N.setLyricLanes = setLyricLanes;
    N.normalizeLyricLane = normalizeLyricLane;
    N.normalizeLyricClip = normalizeLyricClip;
    N.lyricRebuildIndex = lyricRebuildIndex;
    N.getLyricsAt = getLyricsAt;
    N.syncLyricsToRoll = syncLyricsToRoll;
    N.genLyricId = genLyricId;
    N.createLyricClip = createLyricClip;
    N.deleteLyricClip = deleteLyricClip;
    N.deleteLyricClips = deleteLyricClips;
    N.getSelectedLyricClip = getSelectedLyricClip;
    N.commitLyricClipDrag = commitLyricClipDrag;
    N.copyLyricClip = copyLyricClip;
    N.findLyricConflict = findLyricConflict;
    N.pasteLyricClips = pasteLyricClips;
    N.pasteLyricClipsAt = pasteLyricClipsAt;
    N.closeLyricEditorPop = closeLyricEditorPop;
    N.showLyricEditorPop = showLyricEditorPop;
    N.showLyricClipMenu = showLyricClipMenu;
    N.showLyricLaneMenu = showLyricLaneMenu;
    N.selectLyricLaneClips = selectLyricLaneClips;
    N.hideLyricClipMenu = hideLyricClipMenu;
    N.initLyricsUI = initLyricsUI;
    N.segActionSplit = segActionSplit;
    N.segActionTrimLeft = segActionTrimLeft;
    N.segActionTrimRight = segActionTrimRight;
    N.segActionCopy = segActionCopy;
    N.segActionPaste = segActionPaste;
    N.segActionDelete = segActionDelete;
    N.LYRIC_LANE_LIMIT = LYRIC_LANE_LIMIT;
    N.LYRIC_DEFAULT_DURATION = LYRIC_DEFAULT_DURATION;
    N.LYRIC_DEFAULT_TEXT = LYRIC_DEFAULT_TEXT;
})(window.WebNBS);
