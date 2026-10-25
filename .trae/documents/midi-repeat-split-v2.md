# MIDI 重复片段分割 v2 — 改造为 MIDI 层分析 + 小节对齐 + 自动寻优

## 1. 概要

把「查找并分割重复片段」从**基于 NBS 转换结果**改为**基于 MIDI 原始事件**分析，并重写切割逻辑：

- 在 MIDI 事件层分析重复（长音符天然只占一个事件，从根本上消除"延音被切断"）
- 所有切割点强制对齐到**小节线**（NBS 4/4：16 tick = 1 小节）
- 硬约束：切割点不得落在任何音符的持续区间内部
- 自动寻优：贪心搜索「模式长度（小节）」参数，目标为**片段种类数最小化 + 片段数量按歌曲长度适量 + 抑制过长片段**
- 每轨独立切点，打击乐也参与分割
- 重复结构稀少的轨道允许保留长片段，不强行切

## 2. 现状分析与问题根因

### 现有实现位置

| 位置 | 作用 |
|---|---|
| [main.js#L1242-L1610](file:///d:/软件开发项目/NoteBlockWeb/src/static/js/main.js#L1242-L1610) | 重复分割全套算法（`_findRepeatBlocks` / `_pickRepeatBlocks` / `_autoGrainForSegment` / `_splitOneSegmentByRepeats` / `midiSplitRepeatedSegments`） |
| [main.js#L19233-L19236](file:///d:/软件开发项目/NoteBlockWeb/src/static/js/main.js#L19233-L19236) | 导入后调用 `midiSplitRepeatedSegments` |
| [main.js#L1151-L1240](file:///d:/软件开发项目/NoteBlockWeb/src/static/js/main.js#L1151-L1240) | `segmentBuildChannelSplit`：先按通道生成"整曲一条"长片段 |
| [nbs_client.js#L1928-L1940](file:///d:/软件开发项目/NoteBlockWeb/src/static/js/nbs_client.js#L1928-L1940) | `deltaPerTick` / `silentOffset` / `nbsTicksPerGrid` 换算参数 |

### 三个根因

1. **在 NBS 层分析导致延音被切断**
   MIDI 长音符经过 `keep_note_length` 展开成 NBS 的多个 tick 重复音符；NBS 层的"连续同 token"既是延音也可能是节奏型，靠 `_detectSustainRuns` 猜测，必然误判。MIDI 层一个长音符只对应一个 note-on 事件，不存在该问题。

2. **切割点不受节奏约束**
   现有切割点来自"音符索引边界"，直接映射成任意 tick，完全可能落在小节中间，导致视觉上与节奏无关。

3. **颗粒度语义不匹配**
   `grain`（音符数）无法表达"按乐句/小节循环"的直觉；且自动评分只看覆盖率与密度，没有"片段种类最少"这一核心目标。

## 3. 设计决策（已与你确认）

| 决策点 | 结论 |
|---|---|
| 切点范围 | **每轨独立切点** |
| 片段种类定义 | **内容完全相同**（忽略音量）才算同一种 |
| 节奏对齐 | **强制小节对齐**（16 NBS tick = 1 小节） |
| 长片段 | **允许保留**（重复稀少时不强切） |
| 延音/同音连续合并 | 相邻且完全相同（**无条件忽略音量**）视为同一分析单元 |
| 片段数量 | **按歌曲长度定**（见 §5.4） |
| 打击乐 | **也参与分割** |
| 触发时机 | 导入时自动应用（沿用现有） |

## 4. 改动清单

### 4.1 新增文件 `src/static/js/repeat_split.js`

独立 IIFE，挂载 `window.MidiRepeatSplit`，避免 main.js 继续膨胀，且可被 Node 脚本单独测试。

导出：

```js
window.MidiRepeatSplit = {
    splitLanes: splitLanes   // 主入口
};
```

`splitLanes(input)` 输入契约：

```js
{
  events: [ { tick, channel, note, velocity, duration_ticks, track } ],  // MIDI 原始事件
  meta: {
    silent_offset,       // nbs 换算: nbsTickRaw = (tick - silent_offset) / delta_per_tick
    delta_per_tick,
    ticks_per_beat,
    nbs_ticks_per_grid   // 吸附网格 (>=1)
  },
  lanes: [ { lane: 0, channel: 2 }, ... ],   // 需要分割的片段轨道
  excludedTracks: [ 0, 3 ],                   // 被排除的 MIDI 轨道
  options: { auto: true, manualBars: 4 }
}
```

`splitLanes` 返回：

```js
{
  cutsByLane: { 0: [0, 16, 32, 64, ...], 2: [0, 32, 64] },  // 含起点 0 与终点
  stats: { 0: { pieces: 8, kinds: 3, maxBars: 4 }, ... }    // 供调试/提示
}
```

### 4.2 `nbs_client.js`：输出换算元信息

`_convertMidiToNBS` 返回对象新增字段（纯新增，不影响既有调用）：

```js
_midi_meta: {
    silent_offset: silentOffset,
    delta_per_tick: deltaPerTick,
    ticks_per_beat: ticksPerBeat,
    nbs_ticks_per_grid: nbsTicksPerGrid
}
```

位置：`return { ... layer_channel_map: layerChannelMap, channel_names: chBaseNames }` 内追加。

### 4.3 `main.js`：快照 MIDI 事件 + 调用新算法

**① `doImportMidi()` 中，`closeMidiPopup()` 之前**保存快照（因为 `closeMidiPopup` 会清空 `state._midiInfo`）：

```js
var midiEventsSnapshot = null;
var midiChannelPrograms = null;
if (state._midiInfo && state._midiInfo._rawEvents) {
    midiEventsSnapshot = state._midiInfo._rawEvents;
    midiChannelPrograms = state._midiInfo._channelFirstProgram || {};
}
```

**② 导入成功后**，把现有调用替换为：

```js
if (settings.split_repeats) {
    applyMidiRepeatSplit(midiEventsSnapshot, data.song, savedTrackStates, settings);
}
```

**③ 删除** main.js 中 L1242-L1610 的全部旧算法函数：
`_detectSustainRuns`、`_overlapsAnySustain`、`_findRepeatBlocks`、`_segmentRepeatTokens`、`_pickRepeatBlocks`、`_autoGrainForSegment`、`_splitOneSegmentByRepeats`、`_cutInsideSustain`、`midiSplitRepeatedSegments`。

**④ 新增 `applyMidiRepeatSplit()`**（放在原位置附近）：

```js
function applyMidiRepeatSplit(midiEvents, song, trackStates, settings) {
    if (!midiEvents || !midiEvents.length) return 0;
    var meta = song._midi_meta;
    if (!meta) return 0;   // 老数据/异常: 静默跳过

    // 收集需要分割的片段轨道 (lane -> channel)
    var lanes = [];
    var segs = state.segments || [];
    for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var laneIdx = seg.lane;
        // 同一条 lane 只处理一次
        if (lanes.some(function(l) { return l.lane === laneIdx; })) continue;
        var laneCfg = (state.segmentLanes || [])[laneIdx];
        if (!laneCfg) continue;
        lanes.push({
            lane: laneIdx,
            channel: (laneCfg.channel === undefined ? null : laneCfg.channel),
            start: seg.start,
            end: seg.end,
            name: seg.name
        });
    }
    if (!lanes.length) return 0;

    // 排除的 MIDI 轨道
    var excluded = [];
    for (var t in trackStates) {
        if (trackStates[t] && trackStates[t].excluded) excluded.push(parseInt(t, 10));
    }

    var res = window.MidiRepeatSplit.splitLanes({
        events: midiEvents,
        meta: meta,
        lanes: lanes,
        excludedTracks: excluded,
        options: {
            auto: settings.repeat_grain_auto !== false,
            manualBars: settings.repeat_grain || 4
        }
    });
    if (!res || !res.cutsByLane) return 0;

    // 应用: 替换对应 lane 的片段
    var nextSegs = [];
    var seq = 0;
    var replacedLanes = {};
    for (var s = 0; s < segs.length; s++) {
        var cur = segs[s];
        var cuts = res.cutsByLane[cur.lane];
        if (!cuts || cuts.length < 2 || replacedLanes[cur.lane]) {
            nextSegs.push(cur);
            continue;
        }
        replacedLanes[cur.lane] = true;
        var pieces = splitSegmentByCuts(cur, cuts);
        for (var p = 0; p < pieces.length; p++) {
            pieces[p].id = ++seq;
            nextSegs.push(pieces[p]);
        }
    }
    for (var k = 0; k < nextSegs.length; k++) {
        if (!nextSegs[k].id || nextSegs[k].id === 0) nextSegs[k].id = ++seq;
    }
    state.segments = nextSegs;
    state._segmentIdSeq = seq;
    state._segmentsEdited = true;
    return nextSegs.length - segs.length;
}
```

**⑤ 新增 `splitSegmentByCuts(seg, cuts)`**：按 NBS tick 切割点把一条片段切成多条，音符 `rel` 重算为相对各自起点：

```js
function splitSegmentByCuts(seg, cuts) {
    var notes = (seg.notes || []).slice();
    notes.sort(function(a, b) { return (a.rel || 0) - (b.rel || 0); });
    var out = [];
    var ptr = 0;
    for (var i = 0; i + 1 < cuts.length; i++) {
        var pStart = cuts[i], pEnd = cuts[i + 1];
        if (pEnd <= pStart) continue;
        var pn = [];
        while (ptr < notes.length) {
            var abs = seg.start + (notes[ptr].rel || 0);
            if (abs >= pEnd) break;
            if (abs >= pStart) {
                var src = notes[ptr];
                pn.push({
                    rel: abs - pStart,
                    layer: src.layer, instrument: src.instrument, key: src.key,
                    velocity: src.velocity, pan: src.pan, pitch: src.pitch
                });
            }
            ptr++;
        }
        if (!pn.length) continue;
        out.push({
            id: 0, lane: seg.lane,
            start: pStart, end: pEnd,
            name: seg.name,
            notes: pn
        });
    }
    return out.length ? out : [seg];
}
```

> 注意：切割点由算法保证落在音符空隙，因此不会丢失音符。

### 4.4 `index.html`：引入脚本 + 调整后处理面板

**① 脚本引入**（放在 `main.js` 之前）：

```html
<script src="static/js/repeat_split.js?v=20261025d"></script>
```

**② 后处理面板文案调整**（`#midi-tab-post`）：

- 「识别颗粒度」→「目标片段长度」，单位改为**小节**
- 输入框 `#midi-repeat-grain`：`min=1`、`max=64`、`value=4`，title 说明"仅手动模式生效"
- 删除「忽略音量」复选框 `#midi-repeat-ignore-vel`（固定忽略音量）
- 「自动」复选框保留，tooltip 改为"自动分析歌曲重复结构，选择片段种类最少、数量适中的方案"
- 底部提示文案更新为："后处理按小节对齐切割；长音符不会被从中间断开"

### 4.5 `main.js`：设置读写与 UI 联动调整

- `collectMidiSettings()`：删除 `repeat_ignore_velocity`；`repeat_grain` 语义改为"手动模式的目标片段长度（小节）"，范围 1~64，默认 4
- `buildMidiConfigSnapshot()`：删除 `repeat_ignore_velocity`
- `applyMidiBasicConfig()`：删除 `repeat_ignore_velocity` 恢复逻辑
- `resetMidiBasicToDefaults()`：`midi-repeat-grain` 默认值改 `'4'`，删除 ignore-vel 相关
- `updateMidiRepeatSplitUI()`：删除 `velChk` 相关逻辑；其余保留
- 颗粒度 blur 事件：范围改为 `1~64`

### 4.6 `style.css`

无需新增；`#midi-popup .midi-number` 已存在。仅确认小节单位文案在窄屏不换行异常（如需要可加 `white-space: nowrap`）。

## 5. 算法详细设计（`repeat_split.js`）

### 5.1 常量

```js
var NBS_TICKS_PER_BEAT = 4;          // NBS 标准
var NBS_TICKS_PER_BAR = 16;          // 4/4 拍
var CANDIDATE_BARS = [1, 2, 4, 8];   // 候选模式长度（小节）
var MAX_PIECE_BARS = 8;              // 单片段超过此长度视为"过长"
var MIN_KIND_RATIO = 0.0;            // 不设硬阈值，由评分决定
```

### 5.2 事件预处理（每通道）

```
1) 过滤 excludedTracks
2) 按 channel 分组；lane.channel === null 时归入"其他"组（channel 为 undefined/null 的事件）
3) 对每个事件计算:
     raw = (tick - silent_offset) / delta_per_tick
     if (nbs_ticks_per_grid > 1)
         nbsTick = floor(round(raw / grid) * grid)
     else
         nbsTick = floor(raw)
     nbsEnd = floor((tick + max(1, duration_ticks) - silent_offset) / delta_per_tick)
4) 组内排序: (nbsTick asc, note desc)   // 与 NBS 和弦排序一致
```

### 5.3 构建分析单元（unit）

延音合并规则（按你的定义，无条件忽略音量）：

```
相邻两个事件 e1, e2（在排序后的序列中）满足:
  e1.note === e2.note
  → 合并到同一个 unit
否则新开 unit
```

每个 unit 记录：

```js
{
  note: 音高,
  ticks: [nbsTick...],       // 该 unit 内所有事件的时间点
  startTick: 首个 tick,
  endTick: max(nbsEnd)       // 用于"禁切区间"
}
```

序列 `units[]` 构成分析基础；同时保留全局 `blocked[]`：所有音符的 `[startTick, endTick)` 区间，用于切点冲突检测。

### 5.4 片段数量目标（按歌曲长度）

```js
var songEnd = 最大 nbsEnd;
var totalBars = Math.max(1, Math.ceil(songEnd / NBS_TICKS_PER_BAR));
var targetPieces = clamp(Math.round(totalBars / 8), 3, 64);   // 每 8 小节约 1 段
var minPieces = Math.max(2, Math.round(totalBars / 16));      // 最少
var maxPieces = Math.min(128, Math.max(4, Math.round(totalBars / 2)));  // 最多
```

### 5.5 单参数方案生成（给定模式长度 P 小节）

```
barTicks = P * 16
1) 枚举所有小节对齐的窗口起点 barIdx = 0, P, 2P, ...（步长 P）
   对窗口 [barIdx*16, (barIdx+P)*16) 计算内容签名:
     sig = hash( units 在窗口内的 (relTick - windowStart, note) 序列 )
   注意: 只统计"完全落在窗口内"的 unit；跨越窗口边界的 unit 使该窗口不可用（记为 null）
2) 按签名分组，得到 groups: { sig -> [windowStart...] }
3) 选出出现次数 >= 2 的组 = 可复用块
4) 贪心铺设:
   反复选 "出现次数 × 块长度" 最大的组，把其所有出现位置标记为已覆盖
   已被覆盖的窗口不重复计入
5) 剩余未覆盖区间 = 空隙
6) 空隙处理:
   - 若空隙 <= MAX_PIECE_BARS 小节，作为一个独立片段
   - 若空隙 > MAX_PIECE_BARS 小节，尝试在该空隙内以更小 P' (P/2 或 1 小节)
     再次执行本算法；仍不行则按 MAX_PIECE_BARS 均分（切点须避开音符区间，
     若无法避开则向最近的小节线偏移，偏移后仍冲突则扩大该片段）
```

### 5.6 评分与最优 P 选择（贪心最优解）

对每个候选 P ∈ CANDIDATE_BARS，生成方案后计算：

```js
n = 片段总数
u = 不同内容签名的种类数
maxBars = 最长片段的小节数

// 主目标: 种类最少 → 用 u / n 衡量"重用率"
reuse = n > 0 ? (1 - u / n) : 0

// 数量贴合度: 越接近 targetPieces 越好 (对数容忍, 避免惩罚过重)
qtyPenalty = Math.abs(Math.log((n + 1) / (targetPieces + 1)))

// 过长惩罚
longPenalty = maxBars > MAX_PIECE_BARS
    ? (maxBars - MAX_PIECE_BARS) / MAX_PIECE_BARS
    : 0

// 种类过多也惩罚 (相对片段数)
kindPenalty = u > 0 ? Math.max(0, (u / n) - 0.66) : 0

score = reuse * 1.0 - qtyPenalty * 0.55 - longPenalty * 1.2 - kindPenalty * 0.8
```

选 `score` 最大的 P。若所有 P 的 `score < 0.15`（重复太少），**该轨不分割**（保留整曲片段，符合"允许保留长片段"）。

### 5.7 切点合法化（硬约束）

```
1) 所有切点必须是 barIdx * 16
2) 对每个切点 c:
   - 若 c 落在任一音符 [startTick, endTick) 内 → 非法
   - 非法时尝试 c 同小节内的最近合法位置: 先向该音符 endTick 方向取整到下一小节线
   - 若移动后与相邻切点过近 (< 1 小节) → 放弃该切点(两段合并)
3) 去重 + 升序 + 确保首尾为 0 与 songEnd
4) 过滤掉"切完没有任何音符"的段（并入相邻段）
```

### 5.8 手动模式

`options.auto === false` 时：

- 不做评分搜索，固定 `P = clamp(manualBars, 1, 64)`
- 按 `P` 小节等距切分（不依赖重复识别）
- 同样执行 §5.7 切点合法化（不切断音符）

### 5.9 内容签名（种类判定）

```js
function signatureOf(unitsInWindow, windowStart) {
    var parts = [];
    for (var i = 0; i < unitsInWindow.length; i++) {
        parts.push((unitsInWindow[i].startTick - windowStart) + ':' + unitsInWindow[i].note);
    }
    return parts.join(',');
}
```

- 忽略音量（需求）
- 相对 tick + 音高 → 满足"内容完全相同"
- 长度不同 → 签名不同 → 不同种类（符合决策）

## 6. 假设与取舍

| 项 | 说明 |
|---|---|
| 拍号 | NBS 仅支持 4/4，统一按 1 小节 = 16 NBS tick 处理，不读取 MIDI 时间签名 |
| 「间隔为 0」的解释 | 按导入讨论，落实为**排序后序列上相邻且音高相同即合并**；配合"切点不得落在音符持续区间"双保险，彻底避免延音被切断 |
| 忽略音量 | 全程无条件忽略（重复判定 + 延音合并），故删除 UI 上的「忽略音量」开关 |
| 打击乐 | 与旋律同样按小节对齐切分；通道 9 归为一个分析组 |
| 「其他」轨（channel 为 null） | 参与分割，作为独立组 |
| 性能 | MIDI 事件量显著小于 NBS 音符量（无 sustain 展开）；单轨分析预期 < 30ms；候选 P 仅 4 个 |
| 配置记忆 | `repeat_grain` 语义变更为"小节数"，旧配置文件中的音符数值会被 clamp 到 1~64，无破坏性 |
| 回退 | 若 `song._midi_meta` 缺失（异常/旧路径），跳过重复分割，不报错 |

## 7. 验证方案

### 7.1 静态检查

```
node --check src/static/js/repeat_split.js
node --check src/static/js/main.js
node --check src/static/js/nbs_client.js
```

### 7.2 Node 单元验证（临时脚本，验证后删除）

对 `C:\Users\MSI\Desktop\Big制作\Midi` 下的 `Animals.mid`、`BATIDAO_FUNK.mid`、`Contempt.mid`：

1. 断言 **所有切点 `% 16 === 0`**（小节对齐）
2. 断言 **没有任何音符被切开**：对每个切点 c，检查不存在 `note.startTick < c < note.endTick`
3. 输出每轨统计：片段数、种类数（唯一签名数）、最长片段小节数、目标片段数
4. 断言 **无单音符片段**（每段至少 2 个音符）
5. 断言 **片段数与 targetPieces 同量级**（`0.5x ~ 3x`）
6. 性能：单轨 `splitLanes` < 100ms

### 7.3 构建

- `index.html` 版本号 `?v=20261025c` → `?v=20261025d`
- `npm run build`，确认 `blbl-toy/static/js/repeat_split.js` 存在且 `index.html` 已引用

### 7.4 人工自测要点（交给你）

1. 导入 funk/phonk 曲目，确认 Bass 轨片段边界与小节线对齐
2. 确认连续同音（延音/滚奏）内部没有切点
3. 观察片段种类是否明显收敛（大量重复块长度一致）
4. 人声类轨道是否保留为长片段而非被强行切碎
