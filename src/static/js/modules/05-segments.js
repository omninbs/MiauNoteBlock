/* 05-segments.js — MiauNoteBlock 功能模块
   来源: 原 main.js L1644-L2535; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    function segmentEnsureLanes() { return N.segmentEnsureLanes.apply(this, arguments); }
    function segmentEnsureEmptyLane() { return N.segmentEnsureEmptyLane.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function rebuildFromNotes() { return N.rebuildFromNotes.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function dlBlob() { return N.dlBlob.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function escapeHtml() { return N.escapeHtml.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function exitLyricsEditMode() { return N.exitLyricsEditMode.apply(this, arguments); }
    function syncTrackPanelToggleButton() { return N.syncTrackPanelToggleButton.apply(this, arguments); }


    function segmentSongEnd() {
        var end = 0;
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) {
            if (segs[i].end > end) end = segs[i].end;
        }
        var notes = state.notes || [];
        var maxTick = 0;
        for (var n = 0; n < notes.length; n++) {
            if (isFinite(notes[n].tick) && notes[n].tick > maxTick) maxTick = notes[n].tick;
        }
        var mt = Math.max(maxTick + 4, getSongLengthTicks());
        if (mt > end) end = mt;
        return Math.max(64, end);
    }

    // 单片段且用户尚未裁剪/分割时, 保持"默认片段覆盖全曲"
    function segmentFollowSongEnd() {
        if (!Array.isArray(state.segments)) return false;
        if (state.segments.length !== 1) return false;
        if (state._segmentsEdited) return false;
        var s = state.segments[0];
        var full = segmentSongEnd();
        var changed = false;
        if (s.start !== 0) { s.start = 0; changed = true; }
        if (s.end < full) { s.end = full; changed = true; }
        if (changed) segmentSync();
        return changed;
    }

    function segmentEnsure() {
        segmentEnsureLanes();
        if (!Array.isArray(state.segments)) state.segments = [];
        if (typeof state._segmentIdSeq !== 'number') state._segmentIdSeq = 0;
        if (state.segments.length === 0) {
            state.segments.push({
                id: ++state._segmentIdSeq, lane: 0, start: 0, end: segmentSongEnd(),
                name: '片段 1', notes: []
            });
            segmentEnsureEmptyLane();
            return;
        }
        for (var i = 0; i < state.segments.length; i++) {
            var s = state.segments[i];
            if (!isFinite(s.lane)) s.lane = 0;
            if (!Array.isArray(s.notes)) s.notes = [];
            if (!s.name) s.name = '片段 ' + (i + 1);
            if (!isFinite(s.id)) s.id = ++state._segmentIdSeq;
        }
        segmentFollowSongEnd();
        segmentEnsureEmptyLane();
    }

    function segmentLaneCount() {
        return (state.segmentLanes || []).length;
    }

    function segmentSorted() {
        return (state.segments || []).slice().sort(function(a, b) { return a.start - b.start; });
    }

    function segmentSelectedIds() {
        var pr = state.pianoRoll;
        if (!pr) return [];
        var ids = pr.segmentSelectedIds;
        if (Array.isArray(ids)) return ids.slice();
        if (pr.segmentSelectedId != null) return [pr.segmentSelectedId];
        return [];
    }

    function segmentSelected() {
        var ids = segmentSelectedIds();
        if (!ids.length) return null;
        return segmentById(ids[0]);
    }

    function segmentById(id) {
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) {
            if (segs[i].id === id) return segs[i];
        }
        return null;
    }

    // 某条 lane 内 [start, end) 是否与其他片段重叠
    function segmentLaneOverlaps(lane, start, end, excludeId) {
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) {
            var s = segs[i];
            if (s.id === excludeId) continue;
            if (s.lane !== lane) continue;
            if (start < s.end && end > s.start) return true;
        }
        return false;
    }

    // 把绝对 tick 的音符放入片段 (rel 相对片段起点)
    function pushSegmentNote(seg, nt) {
        seg.notes.push({
            rel: nt.tick - seg.start,
            layer: isFinite(nt.layer) ? nt.layer : 0,
            instrument: nt.instrument, key: nt.key,
            velocity: isFinite(nt.velocity) ? nt.velocity : 100,
            pan: isFinite(nt.pan) ? nt.pan : 100, pitch: nt.pitch || 0
        });
    }

    // 从当前 state.notes 重新捕获片段内容 (进入片段模式时调用)
    // 落在所有片段之外的音符 (裁剪后的空洞): 单片段未编辑时扩展片段, 否则按簇新建片段
    function segmentCaptureFromSong() {
        segmentEnsure();
        var segs = state.segments;
        for (var i = 0; i < segs.length; i++) segs[i].notes = [];
        var orphans = [];
        var notes = state.notes || [];
        var lanes = state.segmentLanes || [];
        for (var n = 0; n < notes.length; n++) {
            var nt = notes[n];
            var placed = false;
            var fallbackSeg = null;
            // 音符所属 MIDI 通道: 自动分割生成的多片段轨道要按通道归位,
            // 否则所有音符都会落进第一条片段 (整曲片段会互相重叠)
            var ntChannel = (state.layerChannelMap && nt.layer !== undefined)
                ? state.layerChannelMap[nt.layer] : undefined;
            for (var k = 0; k < segs.length; k++) {
                if (!(nt.tick >= segs[k].start && nt.tick < segs[k].end)) continue;
                if (!fallbackSeg) fallbackSeg = segs[k];
                var laneCfg = lanes[segs[k].lane];
                // 合并后的轨道覆盖多个 NBS 层: 命中任意一层即归入该片段
                if (laneCfg && Array.isArray(laneCfg.layerKeys)) {
                    var ntLayer = isFinite(nt.layer) ? nt.layer : 0;
                    if (laneCfg.layerKeys.indexOf(ntLayer) >= 0) {
                        pushSegmentNote(segs[k], nt);
                        placed = true;
                        break;
                    }
                    continue;
                }
                // 按音轨分组 (非 MIDI 通道) 的轨道: 直接按 layer 归位,
                // 否则同 tick 的多轨片段会互相抢占, 导致除第一条轨道外全为空白
                if (laneCfg && laneCfg.layerKey !== undefined) {
                    if (laneCfg.layerKey === (isFinite(nt.layer) ? nt.layer : 0)) {
                        pushSegmentNote(segs[k], nt);
                        placed = true;
                        break;
                    }
                    continue;
                }
                var laneCh = laneCfg ? laneCfg.channel : undefined;
                if (ntChannel !== undefined && laneCh !== undefined && laneCh === ntChannel) {
                    pushSegmentNote(segs[k], nt);
                    placed = true;
                    break;
                }
            }
            if (!placed && fallbackSeg) {
                pushSegmentNote(fallbackSeg, nt);
                placed = true;
            }
            if (!placed) orphans.push(nt);
        }
        if (!orphans.length) return;
        if (segs.length === 1 && !state._segmentsEdited) {
            var maxT = 0;
            for (var o = 0; o < orphans.length; o++) {
                if (orphans[o].tick > maxT) maxT = orphans[o].tick;
            }
            segs[0].end = Math.max(segs[0].end, maxT + 1);
            for (var o2 = 0; o2 < orphans.length; o2++) {
                var no = orphans[o2];
                segs[0].notes.push({
                    rel: no.tick - segs[0].start,
                    layer: isFinite(no.layer) ? no.layer : 0,
                    instrument: no.instrument, key: no.key,
                    velocity: isFinite(no.velocity) ? no.velocity : 100,
                    pan: isFinite(no.pan) ? no.pan : 100, pitch: no.pitch || 0
                });
            }
            return;
        }
        orphans.sort(function(a, b) { return a.tick - b.tick; });
        var clusters = [];
        for (var q = 0; q < orphans.length; q++) {
            var tk = orphans[q].tick;
            var last = clusters[clusters.length - 1];
            if (last && tk - last.end <= 32) last.items.push(orphans[q]);
            else clusters.push({ start: tk, end: tk + 1, items: [orphans[q]] });
            last = clusters[clusters.length - 1];
            if (tk + 1 > last.end) last.end = tk + 1;
        }
        for (var c = 0; c < clusters.length; c++) {
            var cl = clusters[c];
            var lane = 0;
            while (lane < segmentLaneCount()
                && segmentLaneOverlaps(lane, cl.start, cl.end, null)) lane++;
            if (lane >= segmentLaneCount()) {
                state.segmentLanes.push({
                    id: state.segmentLanes.length + 1, muted: false, solo: false,
                    volume: 100, height: SEG_DEFAULT_LANE_H
                });
            }
            var ns = {
                id: ++state._segmentIdSeq, lane: lane,
                start: cl.start, end: Math.max(cl.end, cl.start + 1),
                name: '片段 ' + (state.segments.length + 1), notes: []
            };
            for (var it = 0; it < cl.items.length; it++) {
                var oi = cl.items[it];
                ns.notes.push({
                    rel: oi.tick - ns.start,
                    layer: isFinite(oi.layer) ? oi.layer : 0,
                    instrument: oi.instrument, key: oi.key,
                    velocity: isFinite(oi.velocity) ? oi.velocity : 100,
                    pan: isFinite(oi.pan) ? oi.pan : 100, pitch: oi.pitch || 0
                });
            }
            state.segments.push(ns);
        }
        segmentEnsureEmptyLane();
    }

    // 缝合: 片段 -> state.notes (绝对 tick + 全局 layer)
    // 静音 / 非独奏 lane: velocity = 0 (保留音符, 导出后可还原分组)
    function segmentCompose() {
        segmentEnsureLanes();
        var lanes = state.segmentLanes;
        var anySolo = false;
        for (var a = 0; a < lanes.length; a++) if (lanes[a].solo) anySolo = true;
        var base = 0;
        var out = [];
        var seq = 0;
        var layerChannelOut = null;   // 片段合成后的 layer -> MIDI 通道 (自动分轨工程用)
        for (var li = 0; li < lanes.length; li++) {
            var lane = lanes[li];
            var segs = [];
            for (var si = 0; si < (state.segments || []).length; si++) {
                if (state.segments[si].lane === li) segs.push(state.segments[si]);
            }
            segs.sort(function(x, y) { return x.start - y.start; });
            var used = {};
            for (var s1 = 0; s1 < segs.length; s1++) {
                var sn = segs[s1].notes || [];
                for (var n1 = 0; n1 < sn.length; n1++) {
                    used[isFinite(sn[n1].layer) ? sn[n1].layer : 0] = true;
                }
            }
            var rels = Object.keys(used).map(Number).sort(function(x, y) { return x - y; });
            var map = {};
            for (var r = 0; r < rels.length; r++) map[rels[r]] = base + r;
            // 记录本轨合成后的新 layer 归属, 再次进入片段模式时按通道归位
            if (lane.layerChannels) {
                // 合并轨道: 每个原始层保留自己的通道
                if (!layerChannelOut) layerChannelOut = {};
                for (var lc in lane.layerChannels) {
                    if (lane.layerChannels.hasOwnProperty(lc) && map[lc] !== undefined) {
                        layerChannelOut[map[lc]] = lane.layerChannels[lc];
                    }
                }
            } else if (lane.channel !== undefined) {
                if (!layerChannelOut) layerChannelOut = {};
                for (var rk in map) {
                    if (map.hasOwnProperty(rk)) layerChannelOut[map[rk]] = lane.channel;
                }
            }
            // 按音轨分组生成的轨道: layer 重排后同步 layerKey, 否则再次进入片段模式时无法归位
            if (lane.layerKey !== undefined && map[lane.layerKey] !== undefined) {
                lane.layerKey = map[lane.layerKey];
            }
            // 合并轨道: 层集合与层->通道映射同步重排
            if (Array.isArray(lane.layerKeys)) {
                var newKeys = [];
                for (var qk = 0; qk < lane.layerKeys.length; qk++) {
                    if (map[lane.layerKeys[qk]] !== undefined) newKeys.push(map[lane.layerKeys[qk]]);
                }
                lane.layerKeys = newKeys;
            }
            if (lane.layerChannels) {
                var newChannels = {};
                for (var ck in lane.layerChannels) {
                    if (lane.layerChannels.hasOwnProperty(ck) && map[ck] !== undefined) {
                        newChannels[map[ck]] = lane.layerChannels[ck];
                    }
                }
                lane.layerChannels = newChannels;
            }
            var audible = !lane.muted && (!anySolo || lane.solo);
            var vol = Math.max(0, Math.min(100, isFinite(lane.volume) ? lane.volume : 100));
            for (var s2 = 0; s2 < segs.length; s2++) {
                var seg = segs[s2];
                var sn2 = seg.notes || [];
                for (var n2 = 0; n2 < sn2.length; n2++) {
                    var nn = sn2[n2];
                    var relLayer = isFinite(nn.layer) ? nn.layer : 0;
                    var vel = isFinite(nn.velocity) ? nn.velocity : 100;
                    if (!audible) vel = 0;
                    else vel = Math.max(0, Math.min(100, Math.round(vel * vol / 100)));
                    var lid = map[relLayer];
                    if (lid === undefined) lid = base;
                    out.push({
                        id: 'sg' + seg.id + '_' + n2 + '_' + (seq++),
                        tick: Math.max(0, Math.floor(seg.start + (nn.rel || 0))),
                        layer: lid, instrument: nn.instrument, key: nn.key,
                        velocity: vel,
                        pan: isFinite(nn.pan) ? nn.pan : 100,
                        pitch: nn.pitch || 0
                    });
                }
            }
            base += rels.length;
        }
        state.notes = out;
        if (state.song) state.song.notes = out;
        if (layerChannelOut) state.layerChannelMap = layerChannelOut;
        var layerCount = Math.max(1, base);
        if (state.song && Array.isArray(state.song.layers)) {
            while (state.song.layers.length < layerCount) {
                state.song.layers.push({
                    name: 'Layer ' + (state.song.layers.length + 1),
                    volume: 100, stereo: 100, lock: 0
                });
            }
        }
        return out;
    }

    function segmentAt(tick) {
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) {
            if (tick >= segs[i].start && tick < segs[i].end) return segs[i];
        }
        return null;
    }

    // 删除 [start, end) 内的音符 (就地修改, 保持 state.notes 引用不变)
    function segmentDropNotes(start, end) {
        if (end <= start) return 0;
        var kept = [];
        var removed = 0;
        for (var i = 0; i < state.notes.length; i++) {
            var n = state.notes[i];
            if (n.tick >= start && n.tick < end) { removed++; continue; }
            kept.push(n);
        }
        if (!removed) return 0;
        state.notes.length = 0;
        for (var j = 0; j < kept.length; j++) state.notes.push(kept[j]);
        return removed;
    }

    function segmentSync() {
        if (state.pianoRoll) {
            state.pianoRoll.setSegments(state.segments || []);
            state.pianoRoll.setSegmentLanes(state.segmentLanes || []);
        }
        var n = (state.segments || []).length;
        var cnt = $('segment-count');
        if (cnt) cnt.textContent = String(n);
        var cnt2 = $('seg-tool-count');
        if (cnt2) cnt2.textContent = String(n);
        if (state.segmentsEditMode) renderSegmentSidePanel();
        syncNbsLayerGroups();
    }

    // NBS 模式: 依据片段轨道把 NBS 层分组, 供画布与音轨栏绘制横向分割线
    // 每条片段轨道的片段里出现的 layer 归为同一组; 空层并入上一组
    function syncNbsLayerGroups() {
        if (!state.pianoRoll) return;
        var groups = [];
        var segs = state.segments || [];
        var total = state.pianoRoll.trackCount
            || (state.song && state.song.layers ? state.song.layers.length : 0);
        if (segs.length > 0 && total > 0) {
            var laneOfLayer = {};
            for (var i = 0; i < segs.length; i++) {
                var ns = segs[i].notes || [];
                for (var j = 0; j < ns.length; j++) {
                    var L = isFinite(ns[j].layer) ? ns[j].layer : 0;
                    if (laneOfLayer[L] === undefined) laneOfLayer[L] = segs[i].lane;
                }
            }
            var cur = null;
            for (var L2 = 0; L2 < total; L2++) {
                var lane = laneOfLayer[L2];
                if (lane === undefined) {
                    if (cur) cur.to = L2;
                    continue;
                }
                if (!cur || cur.lane !== lane) {
                    cur = { lane: lane, from: L2, to: L2 };
                    groups.push(cur);
                } else {
                    cur.to = L2;
                }
            }
            if (groups.length < 2) groups = [];
        }
        state.pianoRoll.setLayerGroups(groups);
    }

    // 兼容旧调用: 新模型下片段内容在进入片段模式时统一捕获,
    // 这里只负责让默认片段跟随歌曲长度变化
    function segmentAdoptTick(tick) {
        return segmentFollowSongEnd();
    }

    function segmentAfterEdit() {
        // 保证始终有一条空轨道可拖入
        segmentEnsureEmptyLane();
        // 片段是权威数据: 先缝合回 NBS 音符, 再刷新索引与界面
        segmentCompose();
        if (state.pianoRoll) state.pianoRoll.clearSelection();
        rebuildFromNotes();
        segmentSync();
        markDirty();
    }

    // 拖动片段提交: mode = 'body'(移动, 可换 lane) / 'left' / 'right'
    function segmentCommitDrag(id, newStart, newEnd, newLane, mode) {
        var seg = segmentById(id);
        if (!seg) return;
        newStart = Math.max(0, Math.floor(newStart));
        newEnd = Math.max(newStart + 1, Math.floor(newEnd));
        if (typeof newLane !== 'number' || !isFinite(newLane)) newLane = seg.lane;
        newLane = Math.max(0, Math.min(segmentLaneCount() - 1, newLane));
        // 同一 lane 内不允许时间重叠: 非法落点直接放弃
        if (segmentLaneOverlaps(newLane, newStart, newEnd, seg.id)) return;
        if (newStart === seg.start && newEnd === seg.end && newLane === seg.lane) return;
        pushUndo();
        state._segmentsEdited = true;
        var oStart = seg.start, oEnd = seg.end;
        if (mode === 'left') {
            var cutL = newStart - oStart;
            if (cutL > 0) {
                seg.notes = seg.notes.filter(function(n) { return (n.rel || 0) >= cutL; });
                for (var i = 0; i < seg.notes.length; i++) seg.notes[i].rel = (seg.notes[i].rel || 0) - cutL;
            }
            seg.start = newStart;
            seg.end = Math.max(newStart + 1, oEnd);
            seg.lane = newLane;
        } else if (mode === 'right') {
            var maxRel = newEnd - oStart;
            seg.notes = seg.notes.filter(function(n) { return (n.rel || 0) < maxRel; });
            seg.end = newEnd;
            seg.lane = newLane;
        } else {
            seg.start = newStart;
            seg.end = newEnd;
            seg.lane = newLane;
        }
        segmentAfterEdit();
    }

    // 在播放头处分割选中片段
    function segmentSplit() {
        var at = Math.max(0, Math.floor(state.currentTick || 0));
        var seg = segmentAt(at) || segmentSelected();
        if (!seg || at <= seg.start || at >= seg.end) return false;
        pushUndo();
        state._segmentsEdited = true;
        var cut = at - seg.start;
        var leftNotes = [], rightNotes = [];
        for (var i = 0; i < seg.notes.length; i++) {
            var nn = seg.notes[i];
            if ((nn.rel || 0) < cut) leftNotes.push(nn);
            else {
                var c = {};
                for (var k in nn) if (Object.prototype.hasOwnProperty.call(nn, k)) c[k] = nn[k];
                c.rel = (nn.rel || 0) - cut;
                rightNotes.push(c);
            }
        }
        var right = {
            id: ++state._segmentIdSeq, lane: seg.lane, start: at, end: seg.end,
            name: seg.name + '·2', notes: rightNotes
        };
        seg.notes = leftNotes;
        seg.end = at;
        state.segments.push(right);
        if (state.pianoRoll) {
            state.pianoRoll.segmentSelectedIds = [right.id];
            state.pianoRoll.segmentSelectedId = right.id;
        }
        segmentAfterEdit();
        return true;
    }

    // 左剪裁: 把选中片段的起点裁到播放头 (丢弃左侧音符)
    function segmentTrimLeft() {
        var seg = segmentSelected();
        var at = Math.floor(state.currentTick || 0);
        if (!seg || at <= seg.start || at >= seg.end) return false;
        segmentCommitDrag(seg.id, at, seg.end, seg.lane, 'left');
        return true;
    }

    // 右剪裁: 把选中片段的终点裁到播放头 (丢弃右侧音符)
    function segmentTrimRight() {
        var seg = segmentSelected();
        var at = Math.floor(state.currentTick || 0);
        if (!seg || at <= seg.start || at >= seg.end) return false;
        segmentCommitDrag(seg.id, seg.start, at, seg.lane, 'right');
        return true;
    }

    function segmentCopy() {
        var seg = segmentSelected();
        if (!seg) return false;
        var arr = [];
        for (var i = 0; i < seg.notes.length; i++) {
            var n = seg.notes[i];
            arr.push({
                rel: n.rel || 0, layer: n.layer || 0, instrument: n.instrument,
                key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch || 0
            });
        }
        state.segmentClipboard = {
            duration: seg.end - seg.start, notes: arr,
            lane: seg.lane, start: seg.start, name: seg.name
        };
        return true;
    }

    // 粘贴: 放到被复制片段的正下方一行 + 相同起点 (用户确认的规则)
    function segmentPaste() {
        var clip = state.segmentClipboard;
        if (!clip || !clip.notes) return false;
        var at = Math.max(0, Math.floor(clip.start || 0));
        var dur = Math.max(1, clip.duration || 1);
        var lane = Math.min(segmentLaneCount() - 1, (clip.lane || 0) + 1);
        while (lane < segmentLaneCount() && segmentLaneOverlaps(lane, at, at + dur, null)) lane++;
        if (lane >= segmentLaneCount()) {
            state.segmentLanes.push({
                id: state.segmentLanes.length + 1, muted: false, solo: false,
                volume: 100, height: SEG_DEFAULT_LANE_H
            });
        }
        pushUndo();
        var nid = ++state._segmentIdSeq;
        var notes = [];
        for (var i = 0; i < clip.notes.length; i++) {
            var c = clip.notes[i];
            notes.push({
                rel: c.rel || 0, layer: c.layer || 0, instrument: c.instrument,
                key: c.key, velocity: c.velocity,
                pan: (c.pan === undefined ? 100 : c.pan), pitch: c.pitch || 0
            });
        }
        state.segments.push({
            id: nid, lane: lane, start: at, end: at + dur,
            name: (clip.name || '片段') + ' 副本', notes: notes
        });
        if (state.pianoRoll) {
            state.pianoRoll.segmentSelectedIds = [nid];
            state.pianoRoll.segmentSelectedId = nid;
        }
        segmentAfterEdit();
        return true;
    }

    // 删除选中片段 (支持多选)
    function segmentDelete() {
        var ids = segmentSelectedIds();
        if (!ids.length) return false;
        pushUndo();
        state._segmentsEdited = true;
        var keep = [];
        for (var i = 0; i < state.segments.length; i++) {
            if (ids.indexOf(state.segments[i].id) < 0) keep.push(state.segments[i]);
        }
        state.segments = keep;
        if (state.pianoRoll) {
            state.pianoRoll.segmentSelectedIds = [];
            state.pianoRoll.segmentSelectedId = null;
        }
        segmentAfterEdit();
        return true;
    }

    // 右键「合并片段」: 仅同 lane 且首尾相接的两个选中片段
    function segmentMergeSelected() {
        var ids = segmentSelectedIds();
        if (ids.length !== 2) return false;
        var a = segmentById(ids[0]), b = segmentById(ids[1]);
        if (!a || !b) return false;
        if (a.lane !== b.lane) return false;
        var left = a.start <= b.start ? a : b;
        var right = left === a ? b : a;
        if (left.end !== right.start) return false;
        pushUndo();
        state._segmentsEdited = true;
        var notes = left.notes.slice();
        var off = right.start - left.start;
        for (var i = 0; i < right.notes.length; i++) {
            var nn = right.notes[i];
            notes.push({
                rel: (nn.rel || 0) + off, layer: nn.layer || 0, instrument: nn.instrument,
                key: nn.key, velocity: nn.velocity, pan: nn.pan, pitch: nn.pitch || 0
            });
        }
        left.end = right.end;
        left.notes = notes;
        state.segments = state.segments.filter(function(s) { return s.id !== right.id; });
        if (state.pianoRoll) {
            state.pianoRoll.segmentSelectedIds = [left.id];
            state.pianoRoll.segmentSelectedId = left.id;
        }
        segmentAfterEdit();
        return true;
    }

    // 合并全部片段: 按 lane 从上到下、时间从左到右首尾相接, 合成 lane0 的单片段
    function segmentMergeAll() {
        segmentEnsure();
        var sorted = segmentSorted();
        if (sorted.length <= 1) return false;
        pushUndo();
        var pos = 0;
        var merged = [];
        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            var span = Math.max(1, s.end - s.start);
            for (var j = 0; j < s.notes.length; j++) {
                var nn = s.notes[j];
                merged.push({
                    rel: pos + (nn.rel || 0), layer: nn.layer || 0,
                    instrument: nn.instrument, key: nn.key, velocity: nn.velocity,
                    pan: nn.pan, pitch: nn.pitch || 0
                });
            }
            pos += span;
        }
        state.segments = [{
            id: ++state._segmentIdSeq, lane: 0, start: 0,
            end: Math.max(pos, 1), name: '片段 1', notes: merged
        }];
        state.segmentLanes = [{
            id: 1, muted: false, solo: false, volume: 100, height: SEG_DEFAULT_LANE_H
        }];
        state._segmentsEdited = false;
        if (state.pianoRoll) {
            state.pianoRoll.segmentSelectedIds = [state.segments[0].id];
            state.pianoRoll.segmentSelectedId = state.segments[0].id;
        }
        segmentAfterEdit();
        return true;
    }

    // 右键「导出片段」: 以该片段为完整歌曲导出 NBS (tick 从 0 开始)
    function segmentExportOne(id) {
        var seg = segmentById(id);
        if (!seg) return;
        var used = {};
        for (var i = 0; i < seg.notes.length; i++) used[seg.notes[i].layer || 0] = true;
        var rels = Object.keys(used).map(Number).sort(function(a, b) { return a - b; });
        var map = {};
        for (var r = 0; r < rels.length; r++) map[rels[r]] = r;
        var notes = [];
        for (var j = 0; j < seg.notes.length; j++) {
            var n = seg.notes[j];
            notes.push({
                id: 'part_' + j, tick: n.rel || 0, layer: map[n.layer || 0] || 0,
                instrument: n.instrument, key: n.key, velocity: n.velocity,
                pan: isFinite(n.pan) ? n.pan : 100, pitch: n.pitch || 0
            });
        }
        var song = {
            name: seg.name || '片段',
            song_name: seg.name || '片段',
            author: (state.song && state.song.author) || '',
            original_author: (state.song && state.song.original_author) || '',
            description: (state.song && state.song.description) || '',
            tempo: (state.song && state.song.tempo) || state.tempo || 20,
            solo_layers: [],
            notes: notes,
            layers: rels.map(function(_, idx) {
                return { name: 'Layer ' + (idx + 1), volume: 100, stereo: 100, lock: 0 };
            })
        };
        NBSClient.saveNBS(song).then(function(blob) {
            dlBlob(blob, (seg.name || 'segment') + '.nbs');
        }).catch(function(err) {
            showAppAlert('片段导出失败: ' + (err && err.message ? err.message : '未知错误'),
                { title: '导出失败', icon: 'fa-solid fa-triangle-exclamation' });
        });
    }

    // 侧边板 (轨道头): 每行 = 一条片段轨道 lane
    var _sidePanelRetry = 0;
    function renderSegmentSidePanel() {
        var panel = $('segment-side-panel');
        var pr = state.pianoRoll;
        if (!panel || !pr) return;
        if (!state.segmentsEditMode) { panel.style.display = 'none'; return; }
        if (window.innerWidth <= 768) { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        var top = pr.getSegmentAreaTop ? pr.getSegmentAreaTop() : 0;
        var availH = Math.max(0, pr.displayHeight - top);
        panel.style.top = top + 'px';
        panel.style.height = availH + 'px';
        panel.style.width = (pr.getSegmentPanelWidth ? pr.getSegmentPanelWidth() : 120) + 'px';
        var html = '';
        var renderedRows = 0;
        for (var i = 0; i < state.segmentLanes.length; i++) {
            var ln = state.segmentLanes[i];
            var relY = pr.getSegmentLaneRelTop ? pr.getSegmentLaneRelTop(i) : 0;
            var rh = ln.height;
            if (relY + rh < 0 || relY > availH) continue;
            renderedRows++;
            html += '<div class="seg-lane-row" data-lane="' + i + '" style="top:' + relY + 'px;height:' + rh + 'px;">'
                + '<div class="seg-lane-title"><span class="seg-lane-name" title="' + escapeHtml(ln.name || '') + '">'
                + escapeHtml(ln.name || (i18nText('轨道') + ' ' + (i + 1)))
                + '</span>'
                + '<span>'
                + '<button class="seg-lane-btn' + (ln.muted ? ' active' : '') + '" data-act="mute" title="' + i18nText('静音') + '">M</button>'
                + '<button class="seg-lane-btn' + (ln.solo ? ' active' : '') + '" data-act="solo" title="' + i18nText('独奏') + '">S</button>'
                + '</span></div>'
                + '<input type="range" class="seg-lane-vol" data-lane="' + i + '" min="0" max="100" step="1" value="' + Math.round(ln.volume) + '">'
                + '<div class="seg-lane-resize" data-lane="' + i + '"></div>'
                + '</div>';
        }
        panel.innerHTML = html;

        // 有轨道但一条都没渲染出来 → 说明画布尺寸尚未就绪, 下一帧重试 (最多 3 次)
        if (renderedRows === 0 && state.segmentLanes.length > 0 && _sidePanelRetry < 3) {
            _sidePanelRetry++;
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(renderSegmentSidePanel);
            }
        } else {
            _sidePanelRetry = 0;
        }
    }

    var _segLaneResize = null;
    function bindSegmentSidePanel() {
        var panel = $('segment-side-panel');
        if (!panel || panel._bound) return;
        panel._bound = true;
        panel.addEventListener('click', function(e) {
            var btn = e.target.closest ? e.target.closest('.seg-lane-btn') : null;
            if (!btn) return;
            var row = btn.closest('.seg-lane-row');
            if (!row) return;
            var idx = parseInt(row.getAttribute('data-lane'), 10);
            var ln = state.segmentLanes[idx];
            if (!ln) return;
            var act = btn.getAttribute('data-act');
            if (act === 'mute') ln.muted = !ln.muted;
            else if (act === 'solo') ln.solo = !ln.solo;
            segmentAfterEdit();
        });
        panel.addEventListener('input', function(e) {
            if (!e.target || !e.target.classList || !e.target.classList.contains('seg-lane-vol')) return;
            var idx = parseInt(e.target.getAttribute('data-lane'), 10);
            var ln = state.segmentLanes[idx];
            if (!ln) return;
            ln.volume = parseFloat(e.target.value);
            segmentCompose();
            if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
            rebuildFromNotes();
            markDirty();
        });
        panel.addEventListener('mousedown', function(e) {
            var rz = e.target.closest ? e.target.closest('.seg-lane-resize') : null;
            if (!rz) return;
            e.preventDefault();
            var idx = parseInt(rz.getAttribute('data-lane'), 10);
            _segLaneResize = { idx: idx, startY: e.clientY, startH: state.segmentLanes[idx].height };
            var move = function(ev) {
                if (!_segLaneResize) return;
                var h = Math.max(28, Math.min(180, _segLaneResize.startH + (ev.clientY - _segLaneResize.startY)));
                state.segmentLanes[_segLaneResize.idx].height = h;
                if (state.pianoRoll) state.pianoRoll.render();
                renderSegmentSidePanel();
            };
            var up = function() {
                _segLaneResize = null;
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                try {
                    localStorage.setItem('segment_lane_heights', JSON.stringify(
                        state.segmentLanes.map(function(l) { return l.height; })));
                } catch (er) {}
                markDirty();
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    // 片段工具栏定位: 与画布内几何共用同一算法 (时间栏在顶部时贴其下方, 否则固定在顶部工具栏下方)
    function syncSegmentToolbarTop() {
        var tb = $('segment-toolbar');
        if (!tb) return;
        var pr = state.pianoRoll;
        var top = (pr && pr.getSegmentToolbarTop) ? pr.getSegmentToolbarTop() : 64;
        tb.style.top = top + 'px';
    }

    // skipCapture=true: 片段已由调用方 (如「片段分割」) 构建好, 不要再从 state.notes 重新捕获
    function enterSegmentsEditMode(skipCapture) {
        segmentEnsure();
        // 进入片段模式前, 把 NBS 当前音符重新捕获进片段 (NBS 是唯一编辑音符的地方)
        if (!skipCapture) segmentCaptureFromSong();
        state._segmentsTouched = true;
        if (state.pianoRoll && state.pianoRoll.playheadTick == null) {
            var pt = Math.max(0, Math.floor(state.currentTick || 0));
            state.pianoRoll.playheadTick = pt;
            state.pianoRoll._smoothedPlayheadTick = pt;
            state.pianoRoll.redrawPlaybackOverlay();
        }
        if (typeof state.lyricsEditMode !== 'undefined' && state.lyricsEditMode) exitLyricsEditMode();
        state.segmentsEditMode = true;
        if (state.pianoRoll) {
            state.pianoRoll.setSegments(state.segments);
            state.pianoRoll.setSegmentLanes(state.segmentLanes);
            state.pianoRoll.setSegmentsEditMode(true);
        }
        var bar = $('segment-edit-bar');
        if (bar) bar.style.display = '';
        var tb = $('segment-toolbar');
        if (tb) {
            tb.style.display = 'flex';
            syncSegmentToolbarTop();
        }
        // 片段模式: 用 body class 统一隐藏 NBS 专属控件 (折叠音轨按钮 / 绘图工具条)
        document.body.classList.add('segment-edit-mode');
        syncTrackPanelToggleButton();
        var btn = $('btn-segments');
        if (btn) btn.classList.add('active');
        var sw = $('edit-mode-switch');
        if (sw) {
            sw.setAttribute('data-mode', 'segment');
            sw.setAttribute('aria-checked', 'true');
            var on = sw.querySelector('.ems-opt-nbs'), off = sw.querySelector('.ems-opt-seg');
            if (on) on.classList.remove('active');
            if (off) off.classList.add('active');
        }
        bindSegmentSidePanel();
        segmentSync();
        renderSegmentSidePanel();
        // 画布尺寸/布局在下一帧才完全稳定, 再刷新一次侧边板,
        // 避免刚切到片段模式时轨道信息空白 (需要拖动音轨才出现)
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function() {
                if (!state.segmentsEditMode) return;
                renderSegmentSidePanel();
                if (state.pianoRoll) state.pianoRoll.render();
            });
        }
    }

    function exitSegmentsEditMode() {
        if (!state.segmentsEditMode) return;
        state.segmentsEditMode = false;
        // 退出片段模式时关闭所有浮动钢琴卷帘窗口 (片段时间轴已不在编辑态)
        if (window.SegmentPianoWindow) window.SegmentPianoWindow.closeAll();
        // 退出时把片段结果缝合回 NBS
        segmentCompose();
        if (state.pianoRoll) {
            state.pianoRoll.setSegmentsEditMode(false);
            state.pianoRoll.setNotes(state.notes);
        }
        rebuildFromNotes();
        // 片段合成后层号会重排, 重新计算 NBS 视图的轨道分组
        syncNbsLayerGroups();
        var bar = $('segment-edit-bar');
        if (bar) bar.style.display = 'none';
        var tb = $('segment-toolbar');
        if (tb) tb.style.display = 'none';
        // 恢复 NBS 专属控件 (由 body class 控制)
        document.body.classList.remove('segment-edit-mode');
        syncTrackPanelToggleButton();
        var btn = $('btn-segments');
        if (btn) btn.classList.remove('active');
        var panel = $('segment-side-panel');
        if (panel) panel.style.display = 'none';
        var sw = $('edit-mode-switch');
        if (sw) {
            sw.setAttribute('data-mode', 'nbs');
            sw.setAttribute('aria-checked', 'false');
            var on = sw.querySelector('.ems-opt-nbs'), off = sw.querySelector('.ems-opt-seg');
            if (on) on.classList.add('active');
            if (off) off.classList.remove('active');
        }
    }

    function toggleSegmentsEditMode() {
        if (state.segmentsEditMode) exitSegmentsEditMode();
        else enterSegmentsEditMode();
    }

    // ---- 导出 ----
    N.segmentSongEnd = segmentSongEnd;
    N.segmentFollowSongEnd = segmentFollowSongEnd;
    N.segmentEnsure = segmentEnsure;
    N.segmentLaneCount = segmentLaneCount;
    N.segmentSorted = segmentSorted;
    N.segmentSelectedIds = segmentSelectedIds;
    N.segmentSelected = segmentSelected;
    N.segmentById = segmentById;
    N.segmentLaneOverlaps = segmentLaneOverlaps;
    N.pushSegmentNote = pushSegmentNote;
    N.segmentCaptureFromSong = segmentCaptureFromSong;
    N.segmentCompose = segmentCompose;
    N.segmentAt = segmentAt;
    N.segmentDropNotes = segmentDropNotes;
    N.segmentSync = segmentSync;
    N.syncNbsLayerGroups = syncNbsLayerGroups;
    N.segmentAdoptTick = segmentAdoptTick;
    N.segmentAfterEdit = segmentAfterEdit;
    N.segmentCommitDrag = segmentCommitDrag;
    N.segmentSplit = segmentSplit;
    N.segmentTrimLeft = segmentTrimLeft;
    N.segmentTrimRight = segmentTrimRight;
    N.segmentCopy = segmentCopy;
    N.segmentPaste = segmentPaste;
    N.segmentDelete = segmentDelete;
    N.segmentMergeSelected = segmentMergeSelected;
    N.segmentMergeAll = segmentMergeAll;
    N.segmentExportOne = segmentExportOne;
    N._sidePanelRetry = _sidePanelRetry;
    N.renderSegmentSidePanel = renderSegmentSidePanel;
    N._segLaneResize = _segLaneResize;
    N.bindSegmentSidePanel = bindSegmentSidePanel;
    N.syncSegmentToolbarTop = syncSegmentToolbarTop;
    N.enterSegmentsEditMode = enterSegmentsEditMode;
    N.exitSegmentsEditMode = exitSegmentsEditMode;
    N.toggleSegmentsEditMode = toggleSegmentsEditMode;
})(window.WebNBS);
