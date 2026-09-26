// 临时验证脚本: GM 音色映射表 (GM_TIMBRE_MAP 派生的三张表) + MIDI 解析输出
// 用法: node test/_verify_gm_map.js
'use strict';

global.window = globalThis;
if (!global.window.localStorage) global.window.localStorage = { getItem: function () { return null; }, setItem: function () {} };

var fs = require('fs');
var path = require('path');
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8'));

var fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  [FAIL] ' + msg); } }

// ---- 1. 表结构 ----
var T = NBSClient.GM_PROGRAM_TABLE, S = NBSClient.GM_FITTING_SLOTS, U = NBSClient.GM_SUSTAIN_PROGRAMS;
ok(Array.isArray(T) && T.length === 128, 'GM_PROGRAM_TABLE 长度 128');
ok(Array.isArray(S) && S.length === 128, 'GM_FITTING_SLOTS 长度 128');
ok(Array.isArray(U) && U.length === 128, 'GM_SUSTAIN_PROGRAMS 长度 128');

// 主音色 0-19, 替代 -1..19, 八度为整数
var instBad = 0, subBad = 0, octBad = 0;
for (var i = 0; i < 128; i++) {
    if (!T[i] || typeof T[i][0] !== 'string' || T[i][1] < 0 || T[i][1] > 19 || T[i][1] !== Math.floor(T[i][1])) instBad++;
    if (!S[i] || S[i][0] < -1 || S[i][0] > 19 || S[i][1] < -1 || S[i][1] > 19) subBad++;
    if (typeof T[i][2] !== 'number' || T[i][2] !== Math.floor(T[i][2])) octBad++;
}
ok(instBad === 0, '所有主音色 ∈ [0,19] (异常 ' + instBad + ')');
ok(subBad === 0, '所有替代槽 ∈ [-1,19] (异常 ' + subBad + ')');
ok(octBad === 0, '所有八度偏移为整数 (异常 ' + octBad + ')');

// 名称非空
var nameBad = 0;
for (var i2 = 0; i2 < 128; i2++) if (!T[i2][0]) nameBad++;
ok(nameBad === 0, '所有音色名非空 (异常 ' + nameBad + ')');

// ---- 2. 延音标记抽查 ----
var expectSustain = [16, 19, 20, 40, 42, 48, 53, 56, 57, 61, 65, 72, 73, 80, 88, 92, 110];
var expectDecay = [0, 1, 4, 7, 12, 14, 24, 25, 27, 33, 47, 104, 114, 116, 123];
var sBad = 0;
expectSustain.forEach(function (p) { if (!U[p]) { sBad++; console.log('    期望延音但为衰减: ' + p + ' ' + T[p][0]); } });
expectDecay.forEach(function (p) { if (U[p]) { sBad++; console.log('    期望衰减但为延音: ' + p + ' ' + T[p][0]); } });
ok(sBad === 0, '延音/衰减抽查一致 (异常 ' + sBad + ')');

// ---- 3. 构造 2 轨 MIDI (format 1): 轨0 钢琴(prog0/ch0), 轨1 弦乐合奏(prog48/ch1) ----
function buildMidi() {
    var bytes = [];
    function push(d) { for (var i = 0; i < d.length; i++) bytes.push(d[i] & 0xFF); }
    function u16(v) { push([(v >> 8) & 0xFF, v & 0xFF]); }
    function u32(v) { push([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]); }
    function meta(type, data) { var d = [0xFF, type & 0xFF, data.length]; Array.prototype.push.apply(d, data); return d; }
    function track(events) { push([0x4D, 0x54, 0x72, 0x6B]); u32(events.length); push(events); }

    push([0x4D, 0x54, 0x68, 0x64]); u32(6); u16(1); u16(2); u16(480); // format 1, 2 tracks, PPQ 480

    // 轨0: tempo + 钢琴
    var t0 = [];
    Array.prototype.push.apply(t0, [0x00]); Array.prototype.push.apply(t0, meta(0x51, [0x07, 0xA1, 0x20]));
    Array.prototype.push.apply(t0, [0x00, 0xC0, 0x00]);      // program change ch0 -> 0
    Array.prototype.push.apply(t0, [0x00, 0x90, 60, 100]);   // note on C4
    Array.prototype.push.apply(t0, [0x83, 0x60, 0x80, 60, 0]); // note off @480
    Array.prototype.push.apply(t0, [0x00]); Array.prototype.push.apply(t0, meta(0x2F, []));
    track(t0);

    // 轨1: 弦乐合奏 (program 48) on ch1
    var t1 = [];
    Array.prototype.push.apply(t1, [0x00, 0xC1, 0x30]);      // program change ch1 -> 48
    Array.prototype.push.apply(t1, [0x00, 0x91, 64, 100]);   // note on E4
    Array.prototype.push.apply(t1, [0x83, 0x60, 0x81, 64, 0]); // note off @480
    Array.prototype.push.apply(t1, [0x00]); Array.prototype.push.apply(t1, meta(0x2F, []));
    track(t1);

    return new Uint8Array(bytes).buffer;
}

var info = NBSClient._parseMidiInfo(buildMidi());
console.log('=== 解析结果 ===');
console.log('  通道:', JSON.stringify(info.channels.map(function (c) { return { ch: c.channel, prog: c.program, ins: c.default_instrument }; })));
console.log('  轨道:', JSON.stringify(info.tracks.map(function (t) { return { i: t.index, ch: t.channels }; })));

var ch0 = info.channels.filter(function (c) { return c.channel === 0; })[0];
var ch1 = info.channels.filter(function (c) { return c.channel === 1; })[0];
ok(ch0 && ch0.program === 0 && ch0.default_instrument === 0, '通道0 钢琴 → 主音色 0');
ok(ch1 && ch1.program === 48, '通道1 program = 48');
ok(ch1 && ch1.default_instrument === 0, '通道1 弦乐合奏 → 主音色 0 (Harp)');
ok(info.tracks.length === 2, '解析出 2 条轨道');
var tr0 = info.tracks.filter(function (t) { return t.index === 0; })[0];
var tr1 = info.tracks.filter(function (t) { return t.index === 1; })[0];
ok(tr0 && tr0.channels.indexOf(0) !== -1, '轨0 含通道0');
ok(tr1 && tr1.channels.indexOf(1) !== -1, '轨1 含通道1');

// ---- 4. 复刻 detectSustainTrackIndices 逻辑, 验证延音轨道判定 ----
function detect(info) {
    var res = [];
    var chProgram = {};
    (info.channels || []).forEach(function (c) { if (!c.is_percussion) chProgram[c.channel] = c.program || 0; });
    (info.tracks || []).forEach(function (t) {
        var hit = (t.channels || []).some(function (ch) { var p = chProgram[ch]; return p !== undefined && U[p]; });
        if (hit) res.push(t.index);
    });
    return res;
}
var det = detect(info);
console.log('  自动延音轨道:', JSON.stringify(det));
ok(det.length === 1 && det[0] === 1, '仅弦乐轨(1)被判为延音轨道');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
