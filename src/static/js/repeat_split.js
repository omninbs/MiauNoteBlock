/**
 * MiauNoteBlock - MIDI 重复片段分割 (v2)
 *
 * 设计要点:
 *   1. 在 MIDI 原始事件层分析重复 (长音符天然只有一个 note-on, 不存在 NBS sustain 展开的重复)
 *   2. 所有切割点强制对齐小节线 (NBS 4/4: 16 tick = 1 小节)
 *   3. 硬约束: 切割点不得落在任何音符的持续区间内部 (延音不会被从中间断开)
 *   4. 自动寻优: 对候选模式长度 (1/2/4/8 小节) 分别切分并评分,
 *      优先「片段种类数最少」, 其次片段数量接近目标, 并抑制过长片段;
 *      没有可利用的重复结构时退化为「按周期均匀切块」(片段名各自不同), 不会整轨不切
 *   5. 每轨独立切点
 */
(function () {
    'use strict';

    var NBS_TICKS_PER_BEAT = 4;              // NBS 标准: 4 tick = 1 拍
    var NBS_TICKS_PER_BAR = 16;              // 4/4 拍: 1 小节 = 4 拍
    var CANDIDATE_BARS = [1, 2, 4, 8];       // 旋律候选模式长度 (小节)
    // 打击乐候选周期: 爵士鼓/流行鼓的 basic groove 通常 1 小节,
    // 两小节变化或 fill 形成 2 小节循环, 4 小节为一个 phrase。
    // 鼓点密集、规律性强, 因此以 1 小节为主, 不设 8 小节 (过长无意义)。
    var DRUM_CANDIDATE_BARS = [1, 2, 4];
    var MAX_PIECE_BARS = 8;                  // 单片段超过此长度视为"过长"
    var MIN_PIECES = 2;                      // 少于 2 段等于没切
    var MIN_AVG_NOTES = 2.5;                 // 平均每段音符数低于此值时视为"碎得没意义"

    // 颗粒度等级 -> 旋律允许的最小片段长度 (小节)
    // 小: 允许 1 小节细碎循环; 中(默认): 最小 2 小节; 大: 最小 4 小节, 只保留较长重复块
    // 打击乐固定按 1 小节识别, 不受此限制 (鼓组 basic groove 天然是 1 小节)
    var GRANULARITY_MIN_BARS = { small: 1, medium: 2, large: 4 };
    // 颗粒度等级 -> 目标片段长度 (小节), 用于评分时偏好更细/更粗的切法
    var GRANULARITY_TARGET_BARS = { small: 2, medium: 4, large: 8 };

    function _clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    // ============ 坐标换算 (MIDI tick -> NBS tick) ============

    function toNbsTick(midiTick, meta) {
        var raw = (midiTick - meta.silent_offset) / meta.delta_per_tick;
        if (!isFinite(raw)) return 0;
        var grid = meta.nbs_ticks_per_grid || 1;
        if (grid > 1) return Math.floor(Math.round(raw / grid) * grid);
        return Math.floor(raw);
    }

    function toNbsEnd(midiTick, durationTicks, meta) {
        var dur = isFinite(durationTicks) && durationTicks > 0 ? durationTicks : 1;
        var raw = (midiTick + dur - meta.silent_offset) / meta.delta_per_tick;
        if (!isFinite(raw)) return toNbsTick(midiTick, meta) + 1;
        return Math.floor(raw);
    }

    // ============ 事件收集与单元构建 ============

    // 收集指定通道的事件 (已换算为 NBS tick)
    function collectEvents(events, channel, excludedSet, meta) {
        var out = [];
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (excludedSet[e.track]) continue;
            if (channel === null || channel === undefined) continue;
            if (e.channel !== channel) continue;
            if (e.note === undefined || e.note === null) continue;
            var st = toNbsTick(e.tick, meta);
            var en = toNbsEnd(e.tick, e.duration_ticks, meta);
            if (en <= st) en = st + 1;
            out.push({ tick: st, end: en, note: e.note });
        }
        // 排序: 时间升序, 同 tick 内音高降序 (与 NBS 和弦排序一致)
        out.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return b.note - a.note;
        });
        return out;
    }

    // 收集 NBS 工程里的音符 (NBS tick, 无需换算)
    // layerChannelMap 决定音符归属哪条轨道; 同层上音高相同且首尾相接的音符
    // 会在 buildUnits 中合并为延音单元, 因此清除延音前后的数据都能正确处理
    function collectNbsEvents(notes, channel, layerChannelMap) {
        var out = [];
        if (!notes || !notes.length) return out;
        var chKey = String(channel);
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (!isFinite(n.tick)) continue;
            var layerCh = layerChannelMap ? layerChannelMap[n.layer] : undefined;
            if (layerCh === undefined || layerCh === null) {
                // 无 channel 映射的工程: 以音轨 (layer) 本身作为分组键
                if (String(n.layer) !== chKey) continue;
            } else if (String(layerCh) !== chKey) {
                continue;
            }
            var t = Math.max(0, Math.floor(n.tick));
            out.push({
                tick: t,
                end: t + 1,
                note: isFinite(n.key) ? n.key : 0,
                tag: isFinite(n.instrument) ? String(n.instrument) : ''
            });
        }
        // 时间升序, 同 tick 内音高降序 (与 NBS 和弦排序一致); tag 兜底保证顺序稳定
        out.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            if (a.note !== b.note) return b.note - a.note;
            return a.tag < b.tag ? -1 : (a.tag > b.tag ? 1 : 0);
        });
        return out;
    }

    // 构建分析单元: 序列上相邻且音高相同、且首尾严格相接 (间隔为 0) 的事件合并为一个单元
    // tag 用于区分乐器 (MIDI 事件无 tag, 行为不变)
    // 返回 units: [{ note, tag, ticks:[], startTick, endTick }]
    function buildUnits(evs) {
        var units = [];
        if (!evs.length) return units;

        var cur = null;
        for (var i = 0; i < evs.length; i++) {
            var e = evs[i];
            if (cur && e.note === cur.note && e.tag === cur.tag && e.tick === cur.endTick) {
                // 严格首尾相接 (间隔为 0) 且音高相同 -> 并入同一延音单元
                cur.ticks.push(e.tick);
                cur.endTick = e.end;
            } else {
                cur = {
                    note: e.note,
                    tag: e.tag,
                    ticks: [e.tick],
                    startTick: e.tick,
                    endTick: e.end
                };
                units.push(cur);
            }
        }
        return units;
    }

    // ============ 切点生成 ============
    // 说明: 切点严格按小节周期步进 (保证周期均匀, 内容签名才可比)。
    // 若切点恰好落在某个长音符内部, 该音符整体归入前一段 (不复制、不截断),
    // 因此延音不会被"从中间断开", 只是归属前一段自然延续。

    function buildCutsForPeriod(totalBars, periodBars, endTick, startTick) {
        var st = isFinite(startTick) ? Math.max(0, Math.floor(startTick)) : 0;
        var cuts = [st];
        var startBar = Math.floor(st / NBS_TICKS_PER_BAR);
        for (var b = startBar + periodBars; b < totalBars; b += periodBars) {
            cuts.push(b * NBS_TICKS_PER_BAR);
        }
        if (cuts[cuts.length - 1] < endTick) cuts.push(endTick);
        return cuts;
    }

    // ============ 片段签名 (种类判定) ============

    function lowerBound(units, tick) {
        var lo = 0, hi = units.length;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (units[mid].startTick < tick) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    // 段签名 = 段长 + 段内每个「实际音符」相对起点的 (tick:note) 序列
    // 忽略音量; 长度不同则签名不同
    // 逐音符 tick 收集, 以正确处理跨越段边界的延音单元 (如连续踩镲)
    function signatureOf(units, start, end) {
        var parts = [String(end - start)];
        var i = lowerBound(units, start);
        if (i > 0 && units[i - 1].endTick > start) i--;
        for (; i < units.length; i++) {
            var u = units[i];
            if (u.startTick >= end) break;
            for (var t = 0; t < u.ticks.length; t++) {
                var tk = u.ticks[t];
                if (tk >= start && tk < end) {
                    parts.push((tk - start) + ':' + u.note + (u.tag ? '@' + u.tag : ''));
                }
            }
        }
        return parts.join(',');
    }

    function countUnique(sigs) {
        var seen = {};
        var n = 0;
        for (var i = 0; i < sigs.length; i++) {
            if (!seen[sigs[i]]) { seen[sigs[i]] = 1; n++; }
        }
        return n;
    }

    // 统计区间 [start, end) 内实际落下的音符数
    // 注意: 单元可能跨越区间边界 (如连续踩镲 0/8/16 被合并为一个延音单元),
    // 因此必须逐音符 tick 判断, 不能只用单元的 startTick
    function countNotesInRange(units, start, end) {
        var c = 0;
        var i = lowerBound(units, start);
        // 前一个单元可能延伸到 start 之后
        if (i > 0 && units[i - 1].endTick > start) i--;
        for (; i < units.length; i++) {
            var u = units[i];
            if (u.startTick >= end) break;
            for (var t = 0; t < u.ticks.length; t++) {
                var tk = u.ticks[t];
                if (tk >= start && tk < end) c++;
            }
        }
        return c;
    }

    function hasNotesInRange(units, start, end) {
        var i = lowerBound(units, start);
        if (i > 0 && units[i - 1].endTick > start) i--;
        for (; i < units.length; i++) {
            var u = units[i];
            if (u.startTick >= end) break;
            for (var t = 0; t < u.ticks.length; t++) {
                if (u.ticks[t] >= start && u.ticks[t] < end) return true;
            }
        }
        return false;
    }

    // 把均匀切点列表转换为「非空片段区间」列表
    // 空段 (整段没有任何音符) 直接丢弃, 不并入相邻段,
    // 避免把前一片段尾部无意义地拉长
    function nonEmptyRanges(units, cuts) {
        var ranges = [];
        if (!cuts || cuts.length < 2) return ranges;
        for (var i = 0; i + 1 < cuts.length; i++) {
            var s = cuts[i], e = cuts[i + 1];
            if (e <= s) continue;
            if (!hasNotesInRange(units, s, e)) continue;
            ranges.push({ start: s, end: e });
        }
        return ranges;
    }

    function maxPieceBars(ranges) {
        var m = 0;
        for (var i = 0; i < ranges.length; i++) {
            var len = ranges[i].end - ranges[i].start;
            if (len > m) m = len;
        }
        return m / NBS_TICKS_PER_BAR;
    }

    // 片段内部「大面积空白」阈值: 连续无音符 >= 2 小节即视为需要裁掉的空白
    // (1 小节以内的空隙允许保留, 属于正常呼吸/休止)
    var GAP_SPLIT_TICKS = NBS_TICKS_PER_BAR * 2;

    // 把一条片段区间按「大面积空白」拆分成若干非空子区间,
    // 并且每个子区间收缩到其音符所在的小节边界 (首尾空白一并裁掉)。
    // 返回 [{start, end}] (已小节对齐, 升序, 互不重叠)
    function splitRangeByGaps(units, range) {
        var out = [];
        if (!range || range.end <= range.start) return out;

        // 收集该区间内的音符 (tick + 结束位置)
        var notes = [];
        var i = lowerBound(units, range.start);
        if (i > 0 && units[i - 1].endTick > range.start) i--;
        for (; i < units.length; i++) {
            var u = units[i];
            if (u.startTick >= range.end) break;
            for (var t = 0; t < u.ticks.length; t++) {
                var tk = u.ticks[t];
                if (tk >= range.start && tk < range.end) {
                    notes.push({ tick: tk, end: u.endTick });
                }
            }
        }
        if (!notes.length) return out;
        notes.sort(function(a, b) { return a.tick - b.tick; });

        // 按空隙拆分
        var segments = [];
        var curStart = notes[0].tick;
        var curEnd = notes[0].end;
        for (var k = 1; k < notes.length; k++) {
            var n = notes[k];
            if (n.tick - curEnd >= GAP_SPLIT_TICKS) {
                segments.push({ first: curStart, lastEnd: curEnd });
                curStart = n.tick;
                curEnd = n.end;
            } else if (n.end > curEnd) {
                curEnd = n.end;
            }
        }
        segments.push({ first: curStart, lastEnd: curEnd });

        // 每个子区间收缩到小节边界 (不超出原区间)
        for (var s = 0; s < segments.length; s++) {
            var ns = Math.max(range.start,
                Math.floor(segments[s].first / NBS_TICKS_PER_BAR) * NBS_TICKS_PER_BAR);
            var ne = Math.min(range.end,
                Math.ceil(segments[s].lastEnd / NBS_TICKS_PER_BAR) * NBS_TICKS_PER_BAR);
            if (ne <= ns) ne = Math.min(range.end, ns + NBS_TICKS_PER_BAR);
            if (ne > ns) out.push({ start: ns, end: ne });
        }
        return out;
    }

    // ============ 候选评估 ============

    // 片段种类标签: 0->A, 25->Z, 26->AA (Excel 列名风格)
    function kindLabel(idx) {
        var s = '';
        var n = idx;
        do {
            s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return s;
    }

    // ============ 单轨分析 ============

    function analyzeLane(lane, evs, granularity) {
        if (!evs || evs.length < 2) return null;

        var units = buildUnits(evs);
        if (units.length < 2) return null;

        // 片段覆盖范围: 裁剪到实际音符所在的小节区间, 避免首尾大段空白
        var laneStart = isFinite(lane.start) ? Math.max(0, Math.floor(lane.start)) : 0;
        var firstTick = units[0].startTick;
        var lastEnd = units[units.length - 1].endTick;
        for (var u = 0; u < units.length; u++) {
            if (units[u].endTick > lastEnd) lastEnd = units[u].endTick;
        }
        // 起点对齐到包含首个音符的小节线, 但不早于原片段起点
        var startBar = Math.floor(firstTick / NBS_TICKS_PER_BAR);
        var trimmedStart = Math.max(laneStart, startBar * NBS_TICKS_PER_BAR);
        if (lastEnd <= trimmedStart) return null;

        var totalBars = Math.max(1, Math.ceil(lastEnd / NBS_TICKS_PER_BAR));
        var endTick = totalBars * NBS_TICKS_PER_BAR;
        if (endTick <= trimmedStart) return null;

        // ---- 打击乐与旋律采用不同策略 ----
        // 打击乐: 鼓点密集、规律性强, basic groove 通常 1 小节;
        //         允许大量 1 小节片段 (上限接近总小节数), 目标直指 1 小节,
        //         且不受「颗粒度等级」限制。
        // 旋律:   按颗粒度等级决定最小片段长度 (小 1 / 中 2 / 大 4 小节),
        //         目标片段长度也随等级变化 (2 / 4 / 8 小节),
        //         并由「平均音符数」惩罚避免碎成无意义片段。
        var gran = GRANULARITY_MIN_BARS.hasOwnProperty(granularity) ? granularity : 'medium';
        var isDrum = !!lane.isDrum;
        var minPieceBars = isDrum ? 1 : GRANULARITY_MIN_BARS[gran];
        var allBars = isDrum ? DRUM_CANDIDATE_BARS : CANDIDATE_BARS;
        var candidateBars = [];
        for (var bi2 = 0; bi2 < allBars.length; bi2++) {
            if (allBars[bi2] >= minPieceBars) candidateBars.push(allBars[bi2]);
        }
        if (!candidateBars.length) candidateBars = [Math.max(1, minPieceBars)];

        var targetPieces, maxPieces;
        if (isDrum) {
            targetPieces = _clamp(Math.round(totalBars), 4, 512);
            maxPieces = Math.min(600, Math.max(8, totalBars + 4));
        } else {
            var targetBars = GRANULARITY_TARGET_BARS[gran];
            targetPieces = _clamp(Math.round(totalBars / targetBars), 4, 96);
            maxPieces = Math.min(256, Math.max(8, totalBars));
        }

        // ---- 自动寻优: 贪心求「片段种类数最少」 ----
        // 第一优先级: 种类数 u 最小 (核心目标)
        // 第二优先级: 片段数 n 更接近目标 (数量适量)
        // 第三优先级: 单片段更短 (避免长片段)
        // 质量门槛 (超限直接剔除候选): 单片段过长 / 平均音符数过少 / 片段数超出合理区间
        var minAccept = Math.max(MIN_PIECES, Math.round(targetPieces * 0.4));
        var maxAccept = Math.min(maxPieces, Math.max(Math.round(targetPieces * 2.0), 8));
        if (maxAccept < minAccept) maxAccept = minAccept;

        var candidates = [];
        for (var ci = 0; ci < candidateBars.length; ci++) {
            var P = candidateBars[ci];
            if (P > totalBars) continue;
            var rawCuts = buildCutsForPeriod(totalBars, P, endTick, trimmedStart);
            var ranges = nonEmptyRanges(units, rawCuts);
            var n = ranges.length;
            if (n < minAccept || n > maxAccept) continue;

            var sigs = [];
            var noteCount = 0;
            for (var ri = 0; ri < ranges.length; ri++) {
                sigs.push(signatureOf(units, ranges[ri].start, ranges[ri].end));
                noteCount += countNotesInRange(units, ranges[ri].start, ranges[ri].end);
            }
            var kinds = countUnique(sigs);
            var maxBars = maxPieceBars(ranges);
            var avgNotes = n > 0 ? (noteCount / n) : 0;

            // 质量门槛
            if (maxBars > MAX_PIECE_BARS * 1.5) continue;
            if (avgNotes < MIN_AVG_NOTES * 0.4) continue;

            candidates.push({
                ranges: ranges, sigs: sigs, pieces: n, kinds: kinds,
                maxBars: maxBars, periodBars: P, avgNotes: avgNotes
            });
        }
        if (!candidates.length) return null;

        candidates.sort(function(a, b) {
            if (a.kinds !== b.kinds) return a.kinds - b.kinds;
            var da = Math.abs(a.pieces - targetPieces);
            var db = Math.abs(b.pieces - targetPieces);
            if (da !== db) return da - db;
            if (a.maxBars !== b.maxBars) return a.maxBars - b.maxBars;
            return a.periodBars - b.periodBars;
        });

        var best;
        if (isDrum) {
            // 打击乐: basic groove 固定 1 小节。只要 1 小节方案的质量可接受,
            // 就不因为"种类更少"而退化成 2/4 小节 (否则鼓的循环块会变粗)。
            var drumOne = null;
            for (var di = 0; di < candidates.length; di++) {
                if (candidates[di].periodBars === 1) { drumOne = candidates[di]; break; }
            }
            if (drumOne) {
                var drumReuse = drumOne.pieces > 0 ? (1 - drumOne.kinds / drumOne.pieces) : 0;
                best = (drumReuse >= 0.16) ? drumOne : candidates[0];
            } else {
                best = candidates[0];
            }
        } else {
            best = candidates[0];
        }

        // 门槛: 至少切成 2 段才有意义
        // (不再按"重用率"拒绝: 无重复结构时按周期均匀切块, 只是片段名各不相同)
        if (best.pieces < MIN_PIECES) return null;

        // ---- 裁掉片段内部的「大面积空白」 ----
        // 一个周期块内部若有 >= 2 小节完全没有音符, 该片段会被切成若干非空子片段,
        // 空白区域不再被片段覆盖 (1 小节以内的小空隙保留)
        var finalRanges = [];
        for (var bi = 0; bi < best.ranges.length; bi++) {
            var subs = splitRangeByGaps(units, best.ranges[bi]);
            for (var sj = 0; sj < subs.length; sj++) finalRanges.push(subs[sj]);
        }
        if (finalRanges.length < MIN_PIECES) return null;

        // 裁剪后重新计算签名与统计
        var finalSigs = [];
        for (var fi = 0; fi < finalRanges.length; fi++) {
            finalSigs.push(signatureOf(units, finalRanges[fi].start, finalRanges[fi].end));
        }

        // ---- 为片段种类命名: 内容完全相同的片段共享同一个名字 ----
        // 出现次数多的种类优先取名 A, 其次 B/C..., 便于一眼看出哪些是重复段落
        var sigCount = {};
        for (var si = 0; si < finalSigs.length; si++) {
            var sg = finalSigs[si];
            sigCount[sg] = (sigCount[sg] || 0) + 1;
        }
        var sigList = Object.keys(sigCount);
        sigList.sort(function(a, b) {
            if (sigCount[b] !== sigCount[a]) return sigCount[b] - sigCount[a];
            return a < b ? -1 : (a > b ? 1 : 0);
        });
        var sigName = {};
        for (var ki = 0; ki < sigList.length; ki++) sigName[sigList[ki]] = kindLabel(ki);

        var namedRanges = [];
        for (var ni = 0; ni < finalRanges.length; ni++) {
            namedRanges.push({
                start: finalRanges[ni].start,
                end: finalRanges[ni].end,
                name: sigName[finalSigs[ni]] || 'A'
            });
        }

        return {
            ranges: namedRanges,
            stats: {
                pieces: namedRanges.length,
                kinds: sigList.length,
                maxBars: maxPieceBars(namedRanges),
                periodBars: best.periodBars,
                // 重用率: 1 - 种类数/片段数 (越高说明重复段落越多)
                reuse: namedRanges.length > 0
                    ? (1 - sigList.length / namedRanges.length) : 0
            }
        };
    }

    // ============ 主入口 ============

    /**
     * @param {Object} input
     *   events: [{ tick, channel, note, velocity, duration_ticks, track }]  MIDI 原始事件
     *   meta:   { silent_offset, delta_per_tick, ticks_per_beat, nbs_ticks_per_grid }
     *   lanes:  [{ lane, channel, start, end }]
     *   excludedTracks: number[]
     *   granularity: 'small' | 'medium' | 'large'  (默认 'medium')
     * @returns {{ rangesByLane: Object, stats: Object }}
     *   rangesByLane[lane] = [{ start, end, name }]  name 为种类标签 (A/B/C..., 同内容同名)
     */
    function splitLanes(input) {
        var result = { rangesByLane: {}, stats: {} };
        if (!input || !input.events || !input.events.length) return result;
        var meta = input.meta;
        if (!meta || !isFinite(meta.delta_per_tick) || !(meta.delta_per_tick > 0)) return result;

        var excludedSet = {};
        var ex = input.excludedTracks || [];
        for (var i = 0; i < ex.length; i++) excludedSet[ex[i]] = true;

        var gran = input.granularity || 'medium';
        var lanes = input.lanes || [];

        for (var li = 0; li < lanes.length; li++) {
            var lane = lanes[li];
            if (lane.channel === null || lane.channel === undefined) continue;
            var res;
            try {
                var evs = collectEvents(input.events, lane.channel, excludedSet, meta);
                res = analyzeLane({
                    start: lane.start,
                    channel: lane.channel,
                    isDrum: lane.channel === 9
                }, evs, gran);
            } catch (err) {
                res = null;
            }
            if (!res || !res.ranges || res.ranges.length < 2) continue;
            result.rangesByLane[lane.lane] = res.ranges;
            result.stats[lane.lane] = res.stats;
        }
        return result;
    }

    /**
     * NBS 工程音符层分割 (功能菜单 → 片段分割)
     * 与 splitLanes 的区别: 不依赖 MIDI 原始事件, 直接分析当前工程的音符。
     * 建议先对工程执行「清除延音」, 让展开的延音音符变短, 重复结构更清晰;
     * 即使未清除也能工作 (连续同音高音符会合并为延音单元)。
     *
     * @param {Object} input
     *   notes: [{ tick, layer, key, instrument }]  NBS 音符
     *   layerChannelMap: { layerIndex: channel }
     *   lanes: [{ lane, channel, start, end, isDrum }]
     *   granularity: 'small' | 'medium' | 'large'
     */
    function splitLanesFromNbs(input) {
        var result = { rangesByLane: {}, stats: {} };
        if (!input || !input.notes || !input.notes.length) return result;

        var map = input.layerChannelMap || {};
        var gran = input.granularity || 'medium';
        var lanes = input.lanes || [];

        for (var li = 0; li < lanes.length; li++) {
            var lane = lanes[li];
            if (lane.channel === null || lane.channel === undefined) continue;
            var res;
            try {
                var evs = collectNbsEvents(input.notes, lane.channel, map);
                res = analyzeLane({
                    start: lane.start,
                    channel: lane.channel,
                    isDrum: !!lane.isDrum
                }, evs, gran);
            } catch (err) {
                res = null;
            }
            if (!res || !res.ranges || res.ranges.length < 2) continue;
            result.rangesByLane[lane.lane] = res.ranges;
            result.stats[lane.lane] = res.stats;
        }
        return result;
    }

    window.MidiRepeatSplit = {
        splitLanes: splitLanes,
        splitLanesFromNbs: splitLanesFromNbs,
        // 供测试使用
        _internal: {
            toNbsTick: toNbsTick,
            collectEvents: collectEvents,
            collectNbsEvents: collectNbsEvents,
            buildUnits: buildUnits,
            buildCutsForPeriod: buildCutsForPeriod,
            nonEmptyRanges: nonEmptyRanges,
            splitRangeByGaps: splitRangeByGaps,
            signatureOf: signatureOf,
            kindLabel: kindLabel,
            NBS_TICKS_PER_BAR: NBS_TICKS_PER_BAR
        }
    };
})();
