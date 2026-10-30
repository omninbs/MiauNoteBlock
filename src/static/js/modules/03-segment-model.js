/* 03-segment-model.js — MiauNoteBlock 功能模块
   来源: 原 main.js L1113-L1515; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    function splitSegmentByRanges() { return N.splitSegmentByRanges.apply(this, arguments); }


    function segmentEnsureLanes() {
        if (!Array.isArray(state.segmentLanes)) state.segmentLanes = [];
        if (state.segmentLanes.length === 0) {
            state.segmentLanes.push({
                id: 1, muted: false, solo: false, volume: 100, height: SEG_DEFAULT_LANE_H
            });
        }
        for (var i = 0; i < state.segmentLanes.length; i++) {
            var ln = state.segmentLanes[i];
            if (!ln.id) ln.id = i + 1;
            if (typeof ln.muted !== 'boolean') ln.muted = false;
            if (typeof ln.solo !== 'boolean') ln.solo = false;
            if (!isFinite(ln.volume)) ln.volume = 100;
            if (!isFinite(ln.height) || ln.height < 24) ln.height = SEG_DEFAULT_LANE_H;
        }
    }

    // 确保最下方始终保留一条「空轨道」, 方便用户继续向下拖入新轨道
    // (只检查最后一条 lane 是否被占用; 中间的空轨道保留不动)
    function segmentEnsureEmptyLane() {
        segmentEnsureLanes();
        var lanes = state.segmentLanes;
        var lastIdx = lanes.length - 1;
        var used = {};
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) used[segs[i].lane] = true;
        if (!used[lastIdx]) return false;
        lanes.push({
            id: lanes.length + 1, muted: false, solo: false,
            volume: 100, height: SEG_DEFAULT_LANE_H
        });
        return true;
    }

    // 由「分组定义」生成片段轨道 + 整曲片段
    // defs: [{ name, channel, isDrum, notes }]
    function buildSegmentTracks(defs) {
        if (!defs || !defs.length) return false;

        var endTick = 0;
        for (var i = 0; i < defs.length; i++) {
            var list = defs[i].notes;
            for (var j = 0; j < list.length; j++) {
                if (isFinite(list[j].tick) && list[j].tick > endTick) endTick = list[j].tick;
            }
        }
        endTick = Math.max(64, endTick + 1);

        var seq = 0;
        var lanes = [];
        var segments = [];
        for (var d = 0; d < defs.length; d++) {
            var g = defs[d];
            var lane = {
                id: lanes.length + 1, muted: false, solo: false,
                volume: 100, height: SEG_DEFAULT_LANE_H,
                channel: (g.channel === null || g.channel === undefined) ? undefined : g.channel,
                name: g.name || '',
                // isDrum 显式标记: 按 layer 分组时 channel 只是音轨索引, 不能用 === 9 判断打击乐
                isDrum: !!g.isDrum
            };
            // 按音轨 (非 MIDI 通道) 分组时记录归属 layer, 供进入片段模式时精确归位
            if (g.layerKey !== undefined) lane.layerKey = g.layerKey;
            lanes.push(lane);

            var segNotes = [];
            for (var ni = 0; ni < g.notes.length; ni++) {
                var gn = g.notes[ni];
                segNotes.push({
                    rel: gn.tick,
                    layer: isFinite(gn.layer) ? gn.layer : 0,
                    instrument: gn.instrument,
                    key: gn.key,
                    velocity: isFinite(gn.velocity) ? gn.velocity : 100,
                    pan: isFinite(gn.pan) ? gn.pan : 100,
                    pitch: gn.pitch || 0
                });
            }
            segments.push({
                id: ++seq, lane: lanes.length - 1,
                start: 0, end: endTick,
                name: lane.name,
                notes: segNotes
            });
        }
        // 末尾保留一条空轨, 方便继续拖入新轨
        lanes.push({
            id: lanes.length + 1, muted: false, solo: false,
            volume: 100, height: SEG_DEFAULT_LANE_H
        });

        state.segmentLanes = lanes;
        state.segments = segments;
        state._segmentIdSeq = seq;
        // 多片段时不参与「单片段自动跟随全曲长度」逻辑
        state._segmentsEdited = true;
        return true;
    }

    // MIDI 导入: 按通道生成片段轨道
    // - 每个 MIDI 通道一条片段轨 (片段覆盖整曲)
    // - 通道 9 (打击乐) 合并为一条片段轨
    // - 无法映射通道的音符归入「其他」轨, 保证不丢音符
    // 每条 lane 记录 channel, 供再次进入片段模式时按通道还原音符归属
    function segmentBuildChannelSplit(song) {
        var notes = (song && song.notes) || [];
        var channelMap = (song && song.layer_channel_map) || {};
        var groups = {};      // key -> { channel, notes: [] }
        var order = [];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var ch = channelMap[n.layer];
            var key = (ch === undefined || ch === null) ? 'x' : String(ch);
            if (!groups[key]) {
                groups[key] = { channel: (key === 'x') ? null : ch, notes: [] };
                order.push(key);
            }
            groups[key].notes.push(n);
        }
        if (!order.length) return false;

        // 排序: 旋律通道按通道号升序, 打击乐 (9) 放最后, 未映射的更后
        order.sort(function(a, b) {
            if (a === 'x') return 1;
            if (b === 'x') return -1;
            var ca = groups[a].channel, cb = groups[b].channel;
            if (ca === 9) return 1;
            if (cb === 9) return -1;
            return ca - cb;
        });

        var defs = [];
        for (var oi = 0; oi < order.length; oi++) {
            var g = groups[order[oi]];
            var name;
            // 轨道名: 打击乐 / 通道号 + 通道名 / 其他
            if (g.channel === 9) {
                name = '打击乐';
            } else if (g.channel === null) {
                name = '其他';
            } else {
                var chName = (song.channel_names && song.channel_names[g.channel]) ? song.channel_names[g.channel] : '';
                name = chName
                    ? ('通道 ' + (g.channel + 1) + ' · ' + chName)
                    : ('通道 ' + (g.channel + 1));
            }
            defs.push({
                name: name,
                channel: g.channel,
                isDrum: g.channel === 9,
                notes: g.notes
            });
        }
        return buildSegmentTracks(defs);
    }

    // 非 MIDI 导入的 NBS 工程: 按音轨 (layer) 生成片段轨道
    // 没有 channel 映射时无法按乐器通道分组, 只能以 layer 为单位
    function segmentBuildLayerSplit(song) {
        var notes = (song && song.notes) || [];
        var groups = {};
        var order = [];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var key = isFinite(n.layer) ? n.layer : 0;
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push(n);
        }
        if (!order.length) return false;
        order.sort(function(a, b) { return a - b; });

        var defs = [];
        for (var oi = 0; oi < order.length; oi++) {
            var idx = order[oi];
            var layerInfo = (song.layers && song.layers[idx]) || null;
            var lname = (layerInfo && layerInfo.name) ? layerInfo.name : '';
            defs.push({
                name: lname ? ('音轨 ' + (idx + 1) + ' · ' + lname) : ('音轨 ' + (idx + 1)),
                channel: idx,
                layerKey: idx,
                isDrum: false,
                notes: groups[idx]
            });
        }
        return buildSegmentTracks(defs);
    }

    // 功能菜单 → 片段分割: 自动选择分组方式
    // 有 layer→channel 映射 (MIDI 导入) 时按通道分组, 否则按音轨分组
    function segmentBuildNbsSplit(song) {
        var map = (song && song.layer_channel_map) || {};
        var hasChannel = false;
        for (var k in map) {
            if (map.hasOwnProperty(k)) { hasChannel = true; break; }
        }
        return hasChannel ? segmentBuildChannelSplit(song) : segmentBuildLayerSplit(song);
    }

    // 把 (片段音符所在的层 -> 所属通道) 记录到目标片段轨道上
    // 合并轨道后一条片段轨会覆盖多个 NBS 层, 进入片段模式时按层精确归位
    function addMergedLayer(target, seg, channel) {
        if (!target.layerKeys) target.layerKeys = [];
        if (!target.layerChannels) target.layerChannels = {};
        var notes = (seg && seg.notes) || [];
        for (var i = 0; i < notes.length; i++) {
            var L = isFinite(notes[i].layer) ? notes[i].layer : 0;
            if (target.layerKeys.indexOf(L) < 0) target.layerKeys.push(L);
            if (target.layerChannels[L] === undefined) target.layerChannels[L] = channel;
        }
    }

    // 合并内容完全相同的片段轨道 (功能菜单 → 片段分割的可选项)
    // 判定: 两条轨道的音符「相对时间 + 音高 + 力度 + 声道 + 音高偏移」序列完全一致,
    //       音色 (instrument) 允许不同; 满足时共用一条片段轨道, 音符各自保留音色。
    // 只在「每轨一个整曲片段」的初始布局上执行 (已分割的布局不再合并)。
    // 返回合并掉的轨道数
    function mergeIdenticalSegmentTracks() {
        var segs = state.segments || [];
        var lanes = state.segmentLanes || [];
        if (!segs.length || !lanes.length) return 0;

        var laneSeg = {};
        for (var i = 0; i < segs.length; i++) {
            var si = segs[i].lane;
            if (laneSeg[si] !== undefined) return 0;   // 已分割的布局: 不合并
            laneSeg[si] = segs[i];
        }

        function segSignature(seg) {
            var list = (seg.notes || []).slice();
            list.sort(function(a, b) {
                var ra = a.rel || 0, rb = b.rel || 0;
                if (ra !== rb) return ra - rb;
                return (b.key || 0) - (a.key || 0);   // 同 tick 内音高降序 (与 NBS 和弦顺序一致)
            });
            var parts = [String(seg.end - seg.start)];   // 片段长度也必须一致
            for (var k = 0; k < list.length; k++) {
                var n = list[k];
                parts.push((n.rel || 0) + ':' + (n.key || 0) + ':'
                    + (isFinite(n.velocity) ? n.velocity : 100) + ':'
                    + (isFinite(n.pan) ? n.pan : 100) + ':' + (n.pitch || 0));
            }
            return parts.join(',');
        }

        var removed = {};
        var mergedCount = 0;
        for (var a = 0; a < lanes.length; a++) {
            if (removed[a] || !laneSeg[a]) continue;
            var sigA = segSignature(laneSeg[a]);
            for (var b = a + 1; b < lanes.length; b++) {
                if (removed[b] || !laneSeg[b]) continue;
                if (segSignature(laneSeg[b]) !== sigA) continue;

                // 两条轨道共用一个片段轨: 记录双方覆盖的层与通道
                addMergedLayer(lanes[a], laneSeg[a], lanes[a].channel);
                addMergedLayer(lanes[a], laneSeg[b], lanes[b].channel);
                delete lanes[a].layerKey;

                var srcNotes = laneSeg[b].notes || [];
                for (var n = 0; n < srcNotes.length; n++) {
                    var sn = srcNotes[n];
                    laneSeg[a].notes.push({
                        rel: sn.rel, layer: sn.layer,
                        instrument: sn.instrument, key: sn.key,
                        velocity: sn.velocity, pan: sn.pan, pitch: sn.pitch
                    });
                }
                removed[b] = true;
                mergedCount++;
            }
        }
        if (!mergedCount) return 0;

        // 删除被合并的轨道与片段, 重排索引/ID
        var keepSegs = [];
        for (var s2 = 0; s2 < segs.length; s2++) {
            if (!removed[segs[s2].lane]) keepSegs.push(segs[s2]);
        }
        var newLanes = [];
        var laneMap = {};
        for (var l = 0; l < lanes.length; l++) {
            if (removed[l]) continue;
            laneMap[l] = newLanes.length;
            newLanes.push(lanes[l]);
        }
        for (var s3 = 0; s3 < keepSegs.length; s3++) {
            keepSegs[s3].lane = laneMap[keepSegs[s3].lane];
            keepSegs[s3].id = s3 + 1;
        }
        for (var l2 = 0; l2 < newLanes.length; l2++) newLanes[l2].id = l2 + 1;

        state.segmentLanes = newLanes;
        state.segments = keepSegs;
        state._segmentIdSeq = keepSegs.length;
        return mergedCount;
    }

    // ============ MIDI 后处理: 查找并分割重复片段 (v2) ============
    // 分析在 MIDI 原始事件层完成 (算法见 repeat_split.js):
    //   - 长音符天然只有一个 note-on, 不会出现 NBS sustain 展开的重复音符;
    //   - 所有切割点强制对齐小节线 (NBS 4/4: 16 tick = 1 小节);
    //   - 切割点不得落在任何音符的持续区间内部 (延音不会被从中间断开);
    //   - 自动模式逐候选周期 (1/2/4/8 小节) 评分, 目标为片段种类最少 + 数量适量.

    // 收集需要分割的片段轨道 (lane -> channel)
    function collectSplitLanes() {
        var lanes = [];
        var seenLane = {};
        var segs = state.segments || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var laneIdx = seg.lane;
            if (seenLane[laneIdx]) continue;
            seenLane[laneIdx] = true;
            var laneCfg = (state.segmentLanes || [])[laneIdx];
            if (!laneCfg) continue;
            lanes.push({
                lane: laneIdx,
                channel: (laneCfg.channel === undefined ? null : laneCfg.channel),
                isDrum: !!laneCfg.isDrum,
                start: seg.start,
                end: seg.end
            });
        }
        return lanes;
    }

    // 把算法给出的区间应用到片段轨道; 返回新增的片段数量
    function applyRepeatRanges(rangesByLane) {
        var segs = state.segments || [];
        var replacedLanes = {};
        var nextSegs = [];
        for (var s = 0; s < segs.length; s++) {
            var cur = segs[s];
            var ranges = rangesByLane[cur.lane];
            if (!ranges || ranges.length < 2 || replacedLanes[cur.lane]) {
                nextSegs.push(cur);
                continue;
            }
            replacedLanes[cur.lane] = true;
            var pieces = splitSegmentByRanges(cur, ranges);
            for (var p = 0; p < pieces.length; p++) nextSegs.push(pieces[p]);
        }
        if (!nextSegs.length) return 0;

        var seq = 0;
        for (var k = 0; k < nextSegs.length; k++) nextSegs[k].id = ++seq;
        state.segments = nextSegs;
        state._segmentIdSeq = seq;
        state._segmentsEdited = true;
        return nextSegs.length - segs.length;
    }

    // 把 MIDI 分析结果应用到片段轨道; 返回新增的片段数量
    function applyMidiRepeatSplit(midiEvents, song, trackStates, granularity) {
        if (!midiEvents || !midiEvents.length) return 0;
        if (!window.MidiRepeatSplit || !window.MidiRepeatSplit.splitLanes) return 0;
        var meta = song && song._midi_meta;
        if (!meta) return 0;   // 老数据/异常: 静默跳过

        var lanes = collectSplitLanes();
        if (!lanes.length) return 0;

        // 被排除的 MIDI 轨道
        var excluded = [];
        for (var t in trackStates) {
            if (!trackStates.hasOwnProperty(t)) continue;
            if (trackStates[t] && trackStates[t].excluded) excluded.push(parseInt(t, 10));
        }

        var res = window.MidiRepeatSplit.splitLanes({
            events: midiEvents,
            meta: meta,
            lanes: lanes,
            excludedTracks: excluded,
            granularity: granularity || 'medium'
        });
        if (!res || !res.rangesByLane) return 0;
        return applyRepeatRanges(res.rangesByLane);
    }

    // 把 NBS 音符分析结果应用到片段轨道 (功能菜单 → 片段分割); 返回新增的片段数量
    function applyNbsRepeatSplit(song, granularity) {
        if (!window.MidiRepeatSplit || !window.MidiRepeatSplit.splitLanesFromNbs) return 0;
        var lanes = collectSplitLanes();
        if (!lanes.length) return 0;

        var res = window.MidiRepeatSplit.splitLanesFromNbs({
            notes: (song && song.notes) || [],
            layerChannelMap: (song && song.layer_channel_map) || {},
            lanes: lanes,
            granularity: granularity || 'medium'
        });
        if (!res || !res.rangesByLane) return 0;
        return applyRepeatRanges(res.rangesByLane);
    }

    // ============ 片段分割弹窗 (功能菜单 → 片段分割) ============
    // 该入口基于当前 NBS 工程分析, 会先对整曲执行一次「清除延音」
    // (与清除延音功能同一套逻辑), 让延音展开出的连续音符变短, 重复结构更清晰。
    // 效果不如 MIDI 导入时的后处理分割 (后者直接分析 MIDI 事件, 不受延音展开影响)。

    // ---- 导出 ----
    N.segmentEnsureLanes = segmentEnsureLanes;
    N.segmentEnsureEmptyLane = segmentEnsureEmptyLane;
    N.buildSegmentTracks = buildSegmentTracks;
    N.segmentBuildChannelSplit = segmentBuildChannelSplit;
    N.segmentBuildLayerSplit = segmentBuildLayerSplit;
    N.segmentBuildNbsSplit = segmentBuildNbsSplit;
    N.addMergedLayer = addMergedLayer;
    N.mergeIdenticalSegmentTracks = mergeIdenticalSegmentTracks;
    N.collectSplitLanes = collectSplitLanes;
    N.applyRepeatRanges = applyRepeatRanges;
    N.applyMidiRepeatSplit = applyMidiRepeatSplit;
    N.applyNbsRepeatSplit = applyNbsRepeatSplit;
})(window.WebNBS);
