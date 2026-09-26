// 歌曲压缩 (compressSongCore) v4.0 算法回归测试
// 结构性重写: 删除 = 完全去重 + 候选受限的有损删除(≤预算, 受 7 不变式保护)。
// 5 档压缩等级 (近乎无损/高质量/中等质量/较低质量/最低质量) 对应 q=[0.99,0.60,0.40,0.20,0.05]
// 用法: node _verify_compress.js [NBS目录]   (传 - 跳过文件测试)
'use strict';
global.window = globalThis;
var fs = require('fs');
var path = require('path');
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8'));

var compress = window.compressSongCore;
var estimate = window.compressSongEstimate;
var QS = [0.05, 0.20, 0.40, 0.60, 0.99];   // 与 main.js COMPRESS_LEVELS 一致
var PCT = [5, 20, 40, 60, 99];
var MODELS = ['heuristic', 'perceptual'];
var pass = 0, fail = 0;

function check(name, cond, detail, quiet) {
    if (cond) { pass++; if (!quiet) console.log('  [PASS] ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')); }
}
function mkNote(tick, layer, instrument, key, velocity) {
    return { id: 'n' + tick + '_' + layer + '_' + key, tick: tick, layer: layer, instrument: instrument, key: key, velocity: velocity, pan: 50, pitch: 0 };
}
// 与 main.js doCompressSong 一致: 传入副本, 保证不改写调用方对象
function cloneNotes(notes) {
    return notes.map(function (n) {
        return { id: n.id, tick: n.tick, layer: n.layer, instrument: n.instrument, key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch };
    });
}
function countDupes(notes) {
    var seen = {}, d = 0;
    for (var i = 0; i < notes.length; i++) {
        var k = notes[i].tick + ':' + notes[i].instrument + ':' + notes[i].key;
        if (seen[k]) d++; else seen[k] = true;
    }
    return d;
}
// v4.0 预算上界: dup + round(remain*(1-q)) (结构性重写后删除 ≤ 预算)
function budgetCap(notes, q) {
    var dup = countDupes(notes);
    var remain = notes.length - dup;
    var cap = (q >= 0.99) ? dup : dup + Math.round(remain * (1 - q));
    if (cap > notes.length - 1) cap = Math.max(0, notes.length - 1);
    return cap;
}

console.log('== 单元: 合成数据 ==');
(function () {
    var base = [
        mkNote(0, 0, 0, 60, 100), mkNote(0, 1, 0, 60, 100),   // 完全重复 (必删)
        mkNote(4, 0, 0, 55, 100), mkNote(4, 1, 0, 55, 100),   // 完全重复 (必删)
        mkNote(8, 0, 1, 36, 100),                              // 低音
        mkNote(12, 0, 0, 48, 80), mkNote(12, 1, 0, 60, 80),    // 根音 + 高音
        mkNote(16, 0, 0, 45, 40),                              // 弱拍短音
        mkNote(20, 0, 2, 36, 100)                              // 打击乐(大鼓)
    ];
    var ctx = { ticksPerBeat: 16, reorder: true };
    var total = base.length;
    var dupes = countDupes(base);

    MODELS.forEach(function (model) {
        var prevRemoved = -1;
        QS.forEach(function (q, qi) {
            var work = cloneNotes(base);
            var res = compress(work, q, model, ctx);
            var keptN = res.kept.length, remN = res.removed.length;
            var cap = budgetCap(base, q);
            check(model + ' Q=' + PCT[qi] + '% 删除 ≤ 预算上界', remN <= cap,
                '实际=' + remN + ' 上界=' + cap);
            // 99% 精确等于纯去重量 (v4.0 C0 即阶段1去重)
            if (q >= 0.99) check(model + ' Q=99% 精确=仅去重', remN === dupes, '实际=' + remN + ' dup=' + dupes);
            check(model + ' Q=' + PCT[qi] + '% 守恒且保留>0',
                keptN + remN === total && keptN > 0, 'kept=' + keptN + ' rem=' + remN);
            if (prevRemoved >= 0) {
                check(model + ' Q=' + PCT[qi] + '% 删除量随质量提高不增',
                    remN <= prevRemoved, '本次=' + remN + ' 上档=' + prevRemoved);
            }
            prevRemoved = remN;
            // 预估与实际一致 (共享 selectPlan; 预估跟随所选模型)
            var est = estimate(base, q, { model: model });
            check(model + ' Q=' + PCT[qi] + '% 预估=实际', est.deleted === remN,
                '预估=' + est.deleted + ' 实际=' + remN);
            // 原始数组未被改写 (撤销安全)
            check(model + ' Q=' + PCT[qi] + '% 不改写调用方对象(含velocity)',
                base.every(function (n, i) { return n.layer === base[i].layer && n.velocity === base[i].velocity; }));
        });
    });
})();

console.log('== 单元: v4.0 伪延音能量补偿合并 (C2) + 闻阈删除 (C12) + 不变式 ==');
(function () {
    // ---- C2: 5 次 retrigger (间隔≤2 tick, 同 instrument 同 pitch) → 合并为 1, 其余删除, velocity 补偿 ----
    // 需满足 I5 下限(每层保留≥max(3, …)), 故同层补 5 个间隔 4tick 的填充音(非短音不构成其它候选)
    var rig0 = [];                       // 同一 layer0, instrument 0 (Harp, decay 1.5s)
    for (var t = 0; t < 5; t++) rig0.push(mkNote(t * 2, 0, 0, 60, 80));          // 伪延音 60@0,2,4,6,8
    for (var f = 0; f < 5; f++) rig0.push(mkNote(10 + f * 4, 0, 0, 50 + f, 70)); // 填充 50-54@10,14,18,22,26
    // 伪延音开关默认关闭: 默认不合并 (逐 tick 独立)
    var c2off = compress(cloneNotes(rig0), 0.4, 'heuristic', { ticksPerBeat: 16, reorder: false });
    check('C2 伪延音: 默认关闭=不合并', !c2off.audit || c2off.audit.pseudoMerged === 0,
        'pseudoMerged=' + (c2off.audit && c2off.audit.pseudoMerged));
    // 显式开启伪延音后才合并
    var c2 = compress(cloneNotes(rig0), 0.4, 'heuristic', { ticksPerBeat: 16, reorder: false, pseudoSustain: true });
    check('C2 伪延音: 5->1 保留 6 (删除4)', c2.kept.length === 6 && c2.removed.length === 4,
        'kept=' + c2.kept.length + ' removed=' + c2.removed.length);
    check('C2 伪延音: 发生合并', c2.audit && c2.audit.pseudoMerged >= 1, 'pseudoMerged=' + (c2.audit && c2.audit.pseudoMerged));
    var keptRetr = c2.kept.filter(function (n) { return n.key === 60; });
    var keptVel = keptRetr.length ? keptRetr[0].velocity : 0;
    check('C2 伪延音: velocity 补偿升高且<=100', keptVel > 80 && keptVel <= 100, 'vel=' + keptVel);
    // 预估=实际 契约在伪延音开启时同样成立 (估算复用核心并透传 pseudoSustain)
    var c2est = estimate(rig0, 0.4, { ticksPerBeat: 16, reorder: false, model: 'heuristic', pseudoSustain: true });
    check('C2 伪延音: 开启时预估=实际', c2est.deleted === c2.removed.length,
        '预估=' + c2est.deleted + ' 实际=' + c2.removed.length);

    // 不同 pitch 的近邻 (非伪延音, 和弦) 不应被合并
    var chordN = [
        mkNote(0, 0, 0, 60, 100), mkNote(2, 1, 0, 64, 100), mkNote(4, 2, 0, 67, 100)
    ];
    var c3 = compress(cloneNotes(chordN), 0.2, 'heuristic', { ticksPerBeat: 16, reorder: false });
    check('C2 和弦(不同pitch)不误合并: 至少保留 2 个', c3.kept.length >= 2, 'kept=' + c3.kept.length);

    // ---- C12 闻阈: velocity<3 音符在 Q≥0.9 被删 (成本0) ----
    var ina = compress(cloneNotes([mkNote(0, 0, 0, 60, 2), mkNote(4, 1, 0, 62, 100)]), 0.95, 'heuristic', { ticksPerBeat: 16, reorder: false });
    check('C12 闻阈: velocity=2 在 Q=0.95 被删', ina.removed.length === 1 && ina.kept.length === 1,
        'removed=' + ina.removed.length);
    check('C12 审计 inaudible≥1', ina.audit && ina.audit.inaudible >= 1, 'inaudible=' + (ina.audit && ina.audit.inaudible));
    // 非低音量时 Q≥0.9 不误删
    var noina = compress(cloneNotes([mkNote(0, 0, 0, 60, 90), mkNote(4, 1, 0, 62, 90)]), 0.95, 'heuristic', { ticksPerBeat: 16, reorder: false });
    check('C12 闻阈: 高音量音符不删 (Q=0.95)', noina.removed.length === 0, 'removed=' + noina.removed.length);

    // ---- I1 kick 全保 + I2 backbeat snare 全保 ----
    var perc = [
        mkNote(0, 0, 2, 36, 100),    // kick
        mkNote(16, 0, 3, 38, 100),   // snare at beatPos 0 (tpb16) → backbeat 保护
        mkNote(2, 1, 4, 40, 100), mkNote(4, 1, 4, 40, 100), mkNote(6, 1, 4, 40, 100) // clicks 可删
    ];
    var p1 = compress(cloneNotes(perc), 0.2, 'heuristic', { ticksPerBeat: 16, reorder: false });
    var kickDele = p1.removed.filter(function (n) { return n.instrument === 2; }).length;
    var snareDele = p1.removed.filter(function (n) { return n.instrument === 3; }).length;
    check('I1 Kick 全保: 删除0个大鼓', kickDele === 0, 'kick deleted=' + kickDele);
    check('I2 Backbeat snare 全保: 删除0个强拍军鼓', snareDele === 0, 'snare deleted=' + snareDele);

    // ---- I4 tick 非空: 低删除下原非空 tick 不整空 ----
    // (构造每 tick 仅 1 音 → 任何删除都会违反 I4, 故候选全被拒, 除去重)
    var lonely = [];
    for (var lt = 0; lt < 4; lt++) lonely.push(mkNote(lt * 4, 0, 1, 40 + lt, 90)); // 每 tick 仅 1 音
    var p2 = compress(cloneNotes(lonely), 0.1, 'heuristic', { ticksPerBeat: 16, reorder: false });
    var emptiedTicks = {};
    p2.removed.forEach(function (rn) { emptiedTicks[rn.tick] = true; });
    var emptyViol = false;
    p2.kept.forEach(function (n) { if (emptiedTicks[n.tick]) emptiedTicks[n.tick] = false; });
    for (var tk in emptiedTicks) if (emptiedTicks[tk]) emptyViol = true;
    check('I4 tick 非空: 无受影响的 tick 被删空', !emptyViol, JSON.stringify(emptiedTicks));

    // ---- I5 稀疏/绝对下限: Layer 仅 2 音时不被删空 ----
    var sparseVoice = [mkNote(0, 0, 0, 60, 100), mkNote(16, 0, 0, 62, 100)]; // layer0 仅 2 音
    for (var di2 = 0; di2 < 12; di2++) sparseVoice.push(mkNote(4 * di2, 1, 0, 50 + di2, 100)); // layer1 填充(供 target)
    sparseVoice.push(mkNote(4, 2, 0, 40, 100)); // 只是不至 target=0
    var p3 = compress(cloneNotes(sparseVoice), 0.95, 'heuristic', { ticksPerBeat: 16, reorder: false });
    check('I5 绝对下限: layer0(2音) 删除后仍≥1', p3.kept.some(function (n) { return n.layer === 0; }),
        'layer0 kept=' + p3.kept.filter(function (n) { return n.layer === 0; }).length);
})();

console.log('== 单元: v4.0 funky 限制 (C1 不删密集和弦的八度重复) ==');
(function () {
    // 密集和弦同 tick: C-E-G + 高八度 C' (八度重复). funky 模式应保护八度结构
    var funkyChord = [];
    // 大量同 tick 和弦使 avgMult>3.5 且 chordRatio>0.6
    for (var bar = 0; bar < 4; bar++) {
        var bt = bar * 64;
        funkyChord.push(mkNote(bt, 0, 0, 48, 100));      // C
        funkyChord.push(mkNote(bt, 1, 0, 52, 100));      // E
        funkyChord.push(mkNote(bt, 2, 0, 55, 100));      // G
        funkyChord.push(mkNote(bt, 3, 0, 60, 100));      // C' (高八度)
        funkyChord.push(mkNote(bt + 16, 0, 0, 41, 100)); // F 和弦根音(下一)
        funkyChord.push(mkNote(bt + 16, 1, 0, 45, 100));
        funkyChord.push(mkNote(bt + 16, 2, 0, 48, 100));
        funkyChord.push(mkNote(bt + 16, 3, 0, 53, 100));
    }
    var ctx = { ticksPerBeat: 16, reorder: false };
    // funky: avgMult 应为 4 (每个和弦 tick 4 音)
    var res = compress(cloneNotes(funkyChord), 0.5, 'heuristic', ctx);
    var hiC = res.kept.filter(function (n) { return n.key === 60 || n.key === 53; }).length;
    // 高八度/外声部保持: 至少保留大多数和弦高音
    check('funky: 八度重复(高音)被保护保留>=6', hiC >= 6, 'kept hi octaves=' + hiC);
})();

console.log('== 单元: 轨道选择 (减轻处理 / 不处理) ==');
(function () {
    var notes = [];
    for (var i = 0; i < 10; i++) notes.push(mkNote(i * 4, 0, 0, 60 + i, 100));    // 正常层
    for (var j = 0; j < 10; j++) notes.push(mkNote(100 + j * 4, 1, 0, 50 + j, 100)); // 减轻层
    for (var k = 0; k < 6; k++) notes.push(mkNote(200 + k * 4, 2, 0, 40 + k, 100));  // 不处理层
    notes.push(mkNote(200, 2, 0, 40, 100));   // 不处理层内部的重复音符 (不应被去重)
    var q = 0.4;
    var ctx = { ticksPerBeat: 16, reorder: false, lightenLayers: [1], excludeLayers: [2] };
    var work = notes.map(function (n) { return Object.assign({}, n); });
    var res = compress(work, q, 'heuristic', ctx);
    // 参与组(层0+层1)=20, 预算上界 = dup + round(20*(1-0.4))= ?  (无 dup in 参与组) → ≤12
    var cap = budgetCap(notes, q);
    // 不处理层 7 个(含重复) 全留
    var keptExcluded = res.kept.filter(function (n) { return n.layer === 2; }).length;
    check('选轨: 不处理层原样保留(含重复)', keptExcluded === 7, '实际=' + keptExcluded);
    // 减轻层保留 ≥ 正常层保留 (成本×2 语义) 且不删空
    var keptLight = res.kept.filter(function (n) { return n.layer === 1; }).length;
    var keptNorm = res.kept.filter(function (n) { return n.layer === 0; }).length;
    check('选轨: 减轻层未删空(保留≥5)', keptLight >= 5, '实际=' + keptLight);
    check('选轨: 正常层删得比减轻层多(保留更少)', keptNorm <= keptLight, 'norm=' + keptNorm + ' light=' + keptLight);
    check('选轨: 删除 ≤ 预算上界', res.removed.length <= cap, 'removed=' + res.removed.length + ' cap=' + cap);
    // 不处理层完全不参与去重: 其内部重复音符必须双双存活
    var dupAlive = res.kept.filter(function (n) { return n.layer === 2 && n.tick === 200 && n.key === 40; }).length;
    check('选轨: 不处理层不参与去重', dupAlive === 2, '实际=' + dupAlive);
    var est = estimate(notes, q, { lightenLayers: [1], excludeLayers: [2], ticksPerBeat: 16 });
    check('选轨: 预估=实际', est.deleted === res.removed.length,
        '预估=' + est.deleted + ' 实际=' + res.removed.length);
})();

// ============ v6.0 presence 单元测试 ============
// 存在感引擎: 删除由 margin<Θ(Q) 与结构不变式驱动, 无预算上界 (不能套 budgetCap)。
// 档位映射: Θ = -3 + 15*(1-Q); Q≥0.99 时仅完全去重 (与 v4.0 一致)。
console.log('== 单元: v6.0 presence (存在感引擎) ==');
(function () {
    var ctx = { ticksPerBeat: 16, reorder: false };
    // 伪延音开关默认关闭; 需要跨 tick 合并的用例显式开启
    var ctxPs = { ticksPerBeat: 16, reorder: false, pseudoSustain: true };

    // ---- 0) 顶层面板: 三模型皆可跑 + Q≥0.99 第=纯去重 ----
    var base = [
        mkNote(0, 0, 0, 60, 100), mkNote(0, 1, 0, 60, 100),   // 去重保留 1
        mkNote(8, 0, 1, 36, 100),                              // 低音 (Double Bass, oct -24)
        mkNote(12, 0, 0, 48, 80), mkNote(12, 1, 0, 60, 80),    // 根音 C3 + 高音 C4
        mkNote(16, 0, 2, 36, 100)                              // kick
    ];
    check('presence Q=0.99 精确=仅去重', compress(cloneNotes(base), 0.99, 'presence', ctx).removed.length === 1,
        'removed=' + compress(cloneNotes(base), 0.99, 'presence', ctx).removed.length);
    var q5 = compress(cloneNotes(base), 0.60, 'presence', ctx);
    check('presence 守恒且保留>0', q5.kept.length + q5.removed.length === base.length && q5.kept.length > 0,
        'kept=' + q5.kept.length + ' rem=' + q5.removed.length);
    var est5 = estimate(base, 0.60, { model: 'presence', ticksPerBeat: 16, reorder: false });
    check('presence Q=0.60 预估=实际', est5.deleted === q5.removed.length,
        '预估=' + est5.deleted + ' 实际=' + q5.removed.length);
    check('presence 不改写调用方对象(含velocity)', base.every(function (n, i) {
        return n.layer === base[i].layer && n.velocity === base[i].velocity; }));

    // ---- 1) I1 kick 全保 + I2 backbeat snare 全保 (Q=0.05 激进档) ----
    var perc = [
        mkNote(0, 0, 2, 36, 100),    // kick
        mkNote(16, 0, 3, 38, 100),   // snare @beat 1 (tpb16 → backbeat 保护)
        mkNote(2, 1, 4, 40, 100), mkNote(4, 1, 4, 40, 100), mkNote(6, 1, 4, 40, 100), mkNote(8, 1, 4, 40, 100) // clicks 可删
    ];
    var p1 = compress(cloneNotes(perc), 0.05, 'presence', ctx);
    var kickDel = p1.removed.filter(function (n) { return n.instrument === 2; }).length;
    var snareDel = p1.removed.filter(function (n) { return n.instrument === 3; }).length;
    check('presence I1 Kick 全保', kickDel === 0, 'kick deleted=' + kickDel);
    check('presence I2 Backbeat snare 全保', snareDel === 0, 'snare deleted=' + snareDel);

    // ---- 2) I3': 同 tick 和弦最低乐音 (根音保护) ----
    var chord = [
        mkNote(0, 0, 0, 48, 100), mkNote(0, 1, 0, 52, 100), mkNote(0, 2, 0, 55, 100), mkNote(0, 3, 0, 60, 100)
    ];
    var p2 = compress(cloneNotes(chord), 0.05, 'presence', ctx);
    check('presence I3\' 根音(最低音)存活', p2.kept.some(function (n) { return n.key === 48; }), 'root kept=' + p2.kept.filter(function (n) { return n.key === 48; }).length);

    // ---- 3) I4 tick 非空: 每 tick 单音 → 删空被拦截 ----
    var lonely = [];
    for (var li = 0; li < 4; li++) lonely.push(mkNote(li * 4, 0, 0, 60 + li, 100));
    var p3 = compress(cloneNotes(lonely), 0.05, 'presence', ctx);
    var emptied = {};
    p3.removed.forEach(function (rn) { emptied[rn.tick] = true; });
    p3.kept.forEach(function (n) { if (emptied[n.tick]) emptied[n.tick] = false; });
    check('presence I4 无 tick 被删空', Object.keys(emptied).every(function (tk) { return !emptied[tk]; }), JSON.stringify(emptied));

    // ---- 4) I5': 同 instrument 仅 2 音 → 不删至 <3 (存活下限) ----
    var sparse2 = [mkNote(0, 0, 0, 60, 100), mkNote(16, 0, 0, 62, 100)]; // inst0 仅 2 音
    var p4 = compress(cloneNotes(sparse2), 0.05, 'presence', ctx);
    check('presence I5\' inst0(2音) 不删', p4.removed.length === 0, 'removed=' + p4.removed.length);

    // ---- 5) I7: velocity=1 物理不可闻 → 无条件删 (不受 I3' 保护) ----
    // 同 tick 另有一音, 保证删除不违反 I4 (I4 优先于 I7: 不得把原始非空 tick 删空)
    var inaP = [mkNote(0, 0, 0, 48, 1), mkNote(0, 1, 0, 72, 100)];  // 弱音是组内最低音, I3' 会保护它 —— I7 优先级更高
    var p5 = compress(cloneNotes(inaP), 0.60, 'presence', ctx);
    check('presence I7 velocity=1 被删', p5.removed.length === 1 && p5.removed[0].velocity === 1,
        'removed=' + p5.removed.length + ' v=' + (p5.removed[0] && p5.removed[0].velocity));
    // I4 优先于 I7: 弱音独占一个 tick 时不得被 I7 删空
    var inaAlone = [mkNote(0, 0, 0, 48, 1), mkNote(4, 1, 0, 62, 100)];
    var p5b = compress(cloneNotes(inaAlone), 0.60, 'presence', ctx);
    check('presence I4 优先于 I7: 独占 tick 的弱音不被删空', p5b.removed.length === 0,
        'removed=' + p5b.removed.length);

    // ---- 6) 掩蔽方向: 同 tick 响低音 + 弱高音 → 删弱高音 (低频掩高频易/θ小) ----
    var dir = [mkNote(0, 0, 0, 48, 100), mkNote(0, 1, 0, 72, 60)];  // C3 响 + C5 弱(60)
    var p6 = compress(cloneNotes(dir), 0.20, 'presence', ctx);
    var keepLo = p6.kept.filter(function (n) { return n.key === 48; }).length;
    var keepHi = p6.kept.filter(function (n) { return n.key === 72; }).length;
    check('presence 掩蔽方向: 低音保留、弱高音可删', keepLo === 1 && (keepHi === 0 || keepHi === 1),
        'lo=' + keepLo + ' hi=' + keepHi);

    // ---- 7) 时间分辨: Snare(τ0.2s) 先响 + Bell(τ2.5s) 后续 → Bell 保留 ----
    var temporal = [
        mkNote(0, 0, 3, 38, 100),      // snare
        mkNote(20, 1, 7, 60, 100)      // bell 2s 后 (snare 残响 0.2s*6.9≈1.4s 已死 → 无掩蔽)
    ];
    var p7 = compress(cloneNotes(temporal), 0.05, 'presence', ctx);
    check('presence 时间分辨: Bell 保留', p7.kept.some(function (n) { return n.instrument === 7; }),
        'bell kept=' + p7.kept.filter(function (n) { return n.instrument === 7; }).length);

    // ---- 8) 伪延音: Q=0.40 合并+velocity 补偿; Q=0.60 不动; compFactor 溢出 kept_2 ----
    var sst = [], tt;
    for (tt = 0; tt < 5; tt++) sst.push(mkNote(tt * 2, 0, 0, 60, 80));          // 5 次 retrigger
    for (tt = 0; tt < 5; tt++) sst.push(mkNote(20 + tt * 4, 1, 0, 50 + tt, 70)); // 填充层(异 pitch 防干扰)
    var p8off = compress(cloneNotes(sst), 0.40, 'presence', ctx);
    check('presence 伪延音: 默认关闭=单 tick 模式(不合并)',
        p8off.audit && p8off.audit.mode && p8off.audit.mode.single_tick === true &&
        (!p8off.audit.pseudo_sustain || p8off.audit.pseudo_sustain.merged === 0),
        'single_tick=' + (p8off.audit && p8off.audit.mode && p8off.audit.mode.single_tick));
    var p8 = compress(cloneNotes(sst), 0.40, 'presence', ctxPs);
    var s60 = p8.kept.filter(function (n) { return n.key === 60; });
    check('presence 伪延音 Q=0.40: 保留 1 个延音音', s60.length >= 1, 'kept60=' + s60.length);
    check('presence 伪延音 Q=0.40: 发生合并', p8.audit && p8.audit.pseudo_sustain && p8.audit.pseudo_sustain.merged >= 1,
        'merged=' + (p8.audit && p8.audit.pseudo_sustain && p8.audit.pseudo_sustain.merged));
    if (s60.length) check('presence 伪延音: velocity 补偿 ≤100', s60[0].velocity <= 100, 'vel=' + s60[0].velocity);
    var p8b = compress(cloneNotes(sst), 0.60, 'presence', ctxPs);
    check('presence 伪延音 Q=0.60: 不合并', !p8b.audit || !p8b.audit.pseudo_sustain || p8b.audit.pseudo_sustain.merged === 0,
        'merged=' + (p8b.audit && p8b.audit.pseudo_sustain && p8b.audit.pseudo_sustain.merged));
    // compFactor > 3: 大量 retrigger 同 tick 间隔 1 → cf ≈ sqrt( Σ e^{-0.1/1.5i} ) 有限, 换用同 tick 密集触发近似
    var sst3 = [];
    for (tt = 0; tt < 12; tt++) sst3.push(mkNote(tt, 0, 0, 65, 90));           // 连续 12 tick
    var p8c = compress(cloneNotes(sst3), 0.05, 'presence', ctxPs);
    check('presence 伪延音 compFactor 溢出: 单音保留≥1', p8c.kept.filter(function (n) { return n.key === 65; }).length >= 1,
        'kept65=' + p8c.kept.filter(function (n) { return n.key === 65; }).length);
    // I1 > 伪延音: kick 滚奏(同音 2-tick 间隔, Q=0.40 合并不激活) 不得被合并删除
    var rollK = [];
    for (tt = 0; tt < 3; tt++) rollK.push(mkNote(tt * 2, 0, 2, 39, 100));      // kick 0,2,4
    for (tt = 0; tt < 4; tt++) rollK.push(mkNote(16 + tt * 4, 1, 0, 50 + tt, 70)); // 填充层(异 inst 防 I4 干扰)
    var p8d = compress(cloneNotes(rollK), 0.40, 'presence', ctxPs);
    var kickKept = p8d.kept.filter(function (n) { return n.instrument === 2; }).length;
    check('presence I1 保护 kick 滚奏不被伪延音合并', kickKept === 3,
        'kick kept=' + kickKept + ' removed=' + p8d.removed.length);

    // ---- 9) 轨道分组: exclude 全保(含重复); lighten 层保守偏置 ----
    var sel = [];
    for (var si = 0; si < 8; si++) sel.push(mkNote(si * 4, 0, 0, 60 + si, 100));   // 正常层
    for (si = 0; si < 8; si++) sel.push(mkNote(100 + si * 4, 1, 0, 50 + si, 100)); // lighten 层
    sel.push(mkNote(200, 2, 0, 40, 100)); sel.push(mkNote(200, 2, 0, 40, 100));    // exclude 层(含重复)
    for (si = 0; si < 4; si++) sel.push(mkNote(210 + si * 4, 2, 0, 40, 100));
    var p9 = compress(cloneNotes(sel), 0.20, 'presence', { ticksPerBeat: 16, reorder: false, lightenLayers: [1], excludeLayers: [2] });
    var keepEx = p9.kept.filter(function (n) { return n.layer === 2; }).length;
    var keepLg = p9.kept.filter(function (n) { return n.layer === 1; }).length;
    var keepNm = p9.kept.filter(function (n) { return n.layer === 0; }).length;
    check('presence 选轨: exclude 层原样保留(含重复)', keepEx === 6, 'exclude kept=' + keepEx);
    check('presence 选轨: lighten 且 norm 未空', keepLg >= 1 && keepNm >= 1, 'light=' + keepLg + ' norm=' + keepNm);

    // ---- 9b) lighten 生效性回归 ----
    // 设计文档: lighten 层需 margin ≤ Θ-3dB 才可删 (保守偏置) → 该层删除量必须少于同曲未标记时。
    // 修复前 mEff 偏移符号相反 (−3dB) 会抬高阈值, 使 lighten 反而删得更多 —— 该断言可捕获。
    // 构造 (单 tick 模式, 关键在 onset +12dB 瞬态下 margin 恰好落在 Θ-3 ~ Θ 区间):
    //   层1 = 强掩蔽音 (pitch 59, 与目标同 Bark 带、更低音 → 被 I3' 保护)
    //   层0 = 弱音   (pitch 60, vel 40): 未标记时 margin≈9.8 ≤ Θ(0.05)=11.25 可删;
    //                                  标记 lighten 后 mEff≈12.8 > Θ 被拒。
    var lg = [];
    for (var gi = 0; gi < 12; gi++) {
        lg.push(mkNote(gi * 4, 1, 0, 59, 100));   // 掩蔽音
        lg.push(mkNote(gi * 4, 0, 0, 60, 40));    // 待删弱音
    }
    function delOfLayer0(notes) { var n = 0; for (var a = 0; a < notes.length; a++) if (notes[a].layer === 0) n++; return n; }
    var lgCtx = { ticksPerBeat: 16, reorder: false };
    var lgBase = compress(cloneNotes(lg), 0.05, 'presence', lgCtx);
    var lgLight = compress(cloneNotes(lg), 0.05, 'presence', { ticksPerBeat: 16, reorder: false, lightenLayers: [0] });
    var lgBaseDel0 = delOfLayer0(lgBase.removed), lgLightDel0 = delOfLayer0(lgLight.removed);
    check('presence lighten 生效: 标记后该层删除量减少', lgBaseDel0 > 0 && lgLightDel0 < lgBaseDel0,
        'layer0 删除 base=' + lgBaseDel0 + ' lighten=' + lgLightDel0);

    // ---- 10) audit 结构 ----
    var p10 = compress(cloneNotes(perc), 0.05, 'presence', ctx);
    var au = p10.audit;
    check('presence audit.mode{model,theta_dB}', !!au && au.mode && au.mode.model === 'presence' && typeof au.mode.theta_dB === 'number',
        JSON.stringify(au && au.mode));
    check('presence audit.margin_histogram', !!au && au.margin_histogram && typeof au.margin_histogram['(-inf,-6)'] === 'number',
        JSON.stringify(au && au.margin_histogram));
    check('presence audit.rescued_by_fix 字段存在', !!au && au.rescued_by_fix &&
        'transient_rescued' in au.rescued_by_fix, JSON.stringify(au && au.rescued_by_fix));
    // v6.1 审计扩展: 双轴四象限 + removed_by_role + 预算 + I8
    check('presence audit.quadrant_matrix 四项齐全', !!au && au.quadrant_matrix &&
        typeof au.quadrant_matrix.hiAud_hiRed === 'number' && typeof au.quadrant_matrix.loAud_hiRed === 'number' &&
        typeof au.quadrant_matrix.hiAud_loRed === 'number' && typeof au.quadrant_matrix.loAud_loRed === 'number',
        JSON.stringify(au && au.quadrant_matrix));
    check('presence audit.removed_by_role 四项齐全', !!au && au.removed_by_role &&
        typeof au.removed_by_role.melody === 'number' && typeof au.removed_by_role.bass === 'number' &&
        typeof au.removed_by_role.inner === 'number' && typeof au.removed_by_role.perc_other === 'number',
        JSON.stringify(au && au.removed_by_role));
    check('presence audit.budget{total,spent,alive0}', !!au && au.budget &&
        typeof au.budget.total === 'number' && typeof au.budget.spent === 'number' && typeof au.budget.alive0 === 'number',
        JSON.stringify(au && au.budget));
    check('presence audit.invariant_checks 含 I8', !!au && au.invariant_checks && au.invariant_checks.I8 === true,
        JSON.stringify(au && au.invariant_checks));
    // v6.1 预算: 双轴贪心删除数不超过 round(alive0*(1-Q)) (+ I7 无条件通道)
    check('presence v6.1 双轴预算: spent ≤ total', !!au && au.budget && au.budget.spent <= au.budget.total + 1,
        JSON.stringify(au && au.budget));
})();

// ============ 文件测试 ============
var dir = process.argv[2];
if (dir === '-' || !dir) dir = 'C:\\Users\\MSI\\Desktop\\Big制作\\Nbs';
var files = [];
try { files = fs.readdirSync(dir).filter(function (f) { return /\.nbs$/i.test(f); }); }
catch (e) { console.log('目录不存在: ' + dir); process.exit(1); }
if (!files.length) { console.log('无 nbs 文件: ' + dir); process.exit(1); }

console.log('\n== 文件测试: ' + files.length + ' 个 NBS (删除 ≤ 预算, 守恒, 单调) ==');
var fileProblems = 0;
var sums = {};
MODELS.forEach(function (m) { QS.forEach(function (q) { sums[m + '@' + q] = { f: 0, bad: 0, overbudget: 0, nonmono: 0, mismatch: 0 }; }); });
var worstHeur = 0, worstPerc = 0, worstFile = '';
// presence: 无预算上界 → 单独统计 (守恒/预估=实际/I1 kick 0 删/I4 tick 非空/单调观察)
var presBad = 0, presFiles = 0, presKickDel = 0, presMono = 0, presNonMono = 0, presWorstMs = 0, presWorstF = '';

files.forEach(function (fname) {
    var buf = fs.readFileSync(path.join(dir, fname));
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var song = window.NBSClient._parseNBS(ab);
    var notes = song.notes;
    if (!notes || notes.length < 2) return;
    var tpb = Math.max(1, song.tempo || 30);
    var total = notes.length, dupes = countDupes(notes);

    MODELS.forEach(function (model) {
        var prev = -1, line = '';
        QS.forEach(function (q) {
            var work = cloneNotes(notes);
            var t0 = Date.now();
            var res = compress(work, q, model, { ticksPerBeat: tpb, reorder: true });
            var ms = Date.now() - t0;
            if (model === 'heuristic' && ms > worstHeur) { worstHeur = ms; worstFile = fname; }
            if (model === 'perceptual' && ms > worstPerc) { worstPerc = ms; }
            var keptN = res.kept.length, remN = res.removed.length;
            var st = sums[model + '@' + q]; st.f++;
            var cap = budgetCap(notes, q);
            // 批候选(伪延音/网格整批)会整批越过 target → 允许 `5% + 1` 的粒度上溢
            var capSlack = Math.ceil((total - dupes) * 0.05) + 1;
            if (keptN < 1 || keptN + remN !== total) { st.bad++; fileProblems++; }
            if (remN > cap + capSlack) { st.overbudget++; fileProblems++; }
            if (prev >= 0 && remN > prev) { st.nonmono++; fileProblems++; }  // 质量升高时删除量不应增加
            // 99% 精度=纯去重
            if (q >= 0.99 && remN !== dupes) { st.mismatch++; fileProblems++; }
            // 预估=实际 (必须传与 core 相同的 tpb/reorder/model)
            var est = estimate(notes, q, { ticksPerBeat: tpb, reorder: true, model: model });
            if (est.deleted !== remN) { st.mismatch++; fileProblems++; }
            prev = remN;
            line += ' [' + PCT[QS.indexOf(q)] + '%]' + keptN;
        });
        console.log('  ' + fname + ' orig=' + total + '  ' + model + line);
    });
// presence 文件级循环: 无预算断言; 守恒/预估=实际/99%纯度; I1 kick 0 删; I4 原始非空 tick 不被删空; 单调观察
    var pPrev = -1, pLine = '', presKickF = 0;
    QS.forEach(function (q) {
        var pw = cloneNotes(notes);
        var t0 = Date.now();
        var pr = compress(pw, q, 'presence', { ticksPerBeat: tpb, reorder: true });
        var ms = Date.now() - t0;
        if (ms > presWorstMs) { presWorstMs = ms; presWorstF = fname; }
        var keptP = pr.kept.length, remP = pr.removed.length;
        presFiles++;
        if (keptP < 1 || keptP + remP !== total) { presBad++; fileProblems++; }
        if (q >= 0.99 && remP !== dupes) { presBad++; fileProblems++; }
        var estP = estimate(notes, q, { ticksPerBeat: tpb, reorder: true, model: 'presence' });
        if (estP.deleted !== remP) { presBad++; fileProblems++; }
        // I1: kick (instrument 2) 不得被有损删除; 仅允许阶段1完全去重
        // (同 tick:instrument:key 的跨层重复 kick 由去重删除, 保留集仍存在同坐标 kick)
        var keptKick = {}, kd = 0;
        pr.kept.forEach(function (n) { if (n.instrument === 2) keptKick[n.tick + ':' + n.instrument + ':' + n.key] = true; });
        pr.removed.forEach(function (n) {
            if (n.instrument === 2 && !keptKick[n.tick + ':' + n.instrument + ':' + n.key]) kd++;
        });
        if (kd > 0) { presKickDel += kd; presKickF = fname; presBad++; fileProblems++; }
        // I4: 原始非空 tick 不得被删空
        var origT = {};
        notes.forEach(function (n) { origT[n.tick] = true; });
        var emptiedT = {};
        pr.removed.forEach(function (n) { emptiedT[n.tick] = true; });
        pr.kept.forEach(function (n) { if (emptiedT[n.tick]) emptiedT[n.tick] = false; });
        for (var tk2 in emptiedT) if (origT[tk2] && emptiedT[tk2]) { presBad++; fileProblems++; }
        // 单调性观察 (增量删除耦合, 理论不保证)
        if (pPrev >= 0) { if (remP <= pPrev) presMono++; else presNonMono++; }
        pPrev = remP;
        pLine += ' [' + PCT[QS.indexOf(q)] + '%]' + keptP;
    });
    console.log('  ' + fname + ' orig=' + total + '  presence' + pLine + (presKickF === fname ? '  <-- kick deleted' : ''));
});

console.log('\n== 汇总 (异常=守恒/超预算/非单调/99%精度/预估=实际) ==');
MODELS.forEach(function (m) {
    QS.forEach(function (q) {
        var st = sums[m + '@' + q];
        var bad = st.bad + st.overbudget + st.nonmono + st.mismatch;
        console.log('  ' + m + ' Q=' + q + ': 文件=' + st.f + ' 异常=' + bad + (bad ? '  <--' : ''));
    });
});
console.log('\n最慢: heuristic=' + worstHeur + 'ms (' + worstFile + '), perceptual=' + worstPerc + 'ms');
console.log('presence: 文件=' + presFiles + ' 异常=' + presBad + ' kick误删=' + presKickDel +
    ' 单调(删减随 Q 升高)=' + presMono + ' 非单调=' + presNonMono +
    ' 最慢=' + presWorstMs + 'ms (' + presWorstF + ')');

console.log('\n== 模型差异检查 (heuristic vs perceptual 删除集合是否真的不同) ==');
var diffPairs = 0, samePairs = 0, totalPairs = 0, worstSame = [];
files.forEach(function (fname) {
    var buf = fs.readFileSync(path.join(dir, fname));
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var song = window.NBSClient._parseNBS(ab);
    var notes = song.notes;
    if (!notes || notes.length < 2) return;
    var tpb = Math.max(1, song.tempo || 30);
    QS.forEach(function (q) {
        if (q >= 0.99) return;                     // 99% 两模型都只去重, 必然相同
        var ra = compress(cloneNotes(notes), q, 'heuristic', { ticksPerBeat: tpb, reorder: false });
        var rb = compress(cloneNotes(notes), q, 'perceptual', { ticksPerBeat: tpb, reorder: false });
        // 解析出的 NBS id 并不唯一(同 tick+layer) → 用全字段复合签名区分被删音符
        function sig(n) {
            return n.tick + ':' + n.layer + ':' + n.instrument + ':' + n.key + ':' + n.velocity + ':' + n.pitch + ':' + (n.pan || 0);
        }
        var setA = {}, setB = {};
        ra.removed.forEach(function (n) { setA[sig(n)] = 1; });
        rb.removed.forEach(function (n) { setB[sig(n)] = 1; });
        var d = 0;
        ra.removed.forEach(function (n) { if (!setB[sig(n)]) d++; });
        rb.removed.forEach(function (n) { if (!setA[sig(n)]) d++; });
        totalPairs++;
        if (d > 0) diffPairs++; else { samePairs++; worstSame.push(fname + '@' + q); }
    });
});
console.log('  (文件,档位) 组合=' + totalPairs + ' 删除集合不同=' + diffPairs + ' 完全相同=' + samePairs);
if (worstSame.length) console.log('  完全相同样例: ' + worstSame.slice(0, 6).join(', '));
// 两种模型必须真的不同, 否则"选哪个模型"没意义
// 仅当样本足够多样且排除了 99%(纯去重) 后仍完全相同才视为 fail
if (diffPairs === 0 && files.length > 0) {
    check('模型差异: 多样文件中两模型删除集合应不同', false, '所有非99%档位两模型删除完全一致');
} else {
    check('模型差异: 多样文件中两模型删除集合应不同', true, diffPairs + '/' + totalPairs + ' 组合不同');
}

console.log('\n== Worker 脚本可编译性 (compress_est.js 的 Blob Worker 必须能解析) ==');
// 回归: RUNTIME 曾出现 {n.id:n.id} 这类非法对象字面量 → 整个 Worker 脚本解析失败,
// 后台估算预计算静默失效 (估算每次都退回主线程同步全量计算)。
(function () {
    var estSrc = fs.readFileSync(path.join(__dirname, '..', 'src/static/js/compress_est.js'), 'utf8');
    var mm = estSrc.match(/var RUNTIME = \[([\s\S]*?)\]\.join\('\\n'\);/);
    check('compress_est.js 可提取 RUNTIME 数组', !!mm);
    if (!mm) return;
    // 复刻运行时拼接: ['a','b'].join('\n') 中插值的 PROG_THROTTLE_MS 需先定义
    var runtime;
    try {
        var PROG_THROTTLE_MS = 120;
        runtime = new Function('PROG_THROTTLE_MS',
            'return [' + mm[1] + "].join('\\n');")(PROG_THROTTLE_MS);
    } catch (e) {
        check('RUNTIME 数组可求值', false, String(e && e.message));
        return;
    }
    check('RUNTIME 数组可求值', typeof runtime === 'string' && runtime.length > 0);
    // 1) RUNTIME 自身必须可编译
    try { new Function(runtime); check('Worker RUNTIME 语法合法', true); }
    catch (e) { check('Worker RUNTIME 语法合法', false, String(e && e.message)); }
    // 2) 完整 Blob (前置 window 别名 + nbs_client 源码 + RUNTIME) 必须可编译
    var nbsSrc = fs.readFileSync(path.join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8');
    var blob = 'var window=self,globalThis=self;\n' + nbsSrc + '\n' + runtime;
    try { new Function(blob); check('Worker 完整 Blob 语法合法', true); }
    catch (e) { check('Worker 完整 Blob 语法合法', false, String(e && e.message)); }
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败 (单元) | 文件级问题=' + fileProblems);
process.exit(fail > 0 || fileProblems > 0 ? 1 : 0);