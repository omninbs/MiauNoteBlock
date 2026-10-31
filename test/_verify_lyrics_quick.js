// 临时验证脚本: 歌词「快速添加」的 LRC 解析 / 逐字对齐算法
// 覆盖: LRC 时间标签与元数据、秒 → tick 换算、tick 冲突顺移、duration 衔接、
//       文本拆分、锚点重排、片段生成、重叠过滤、按音符重排已写入的逐字歌词
// 用法: node test/_verify_lyrics_quick.js
'use strict';

// ---- 浏览器全局 shim ----
global.window = globalThis;
window.addEventListener = window.addEventListener || function() {};
var N = window.WebNBS = {};
N.state = { tempo: 20, notes: [], lyrics: [], pianoRoll: null };

// 模块依赖的副作用函数 (算法本身不关心)
var _idSeq = 0;
N.pushUndo = function() {};
N.markDirty = function() {};
N.lyricRebuildIndex = function() {};
N.syncLyricsToRoll = function() {};
N.genLyricId = function() { _idSeq++; return 'ly' + _idSeq; };
N.i18nText = function(t) { return t; };
N.showSmallTip = function() {};
N.showAppAlert = function() {};
N.enterLyricsEditMode = function() {};
N.findTrackByLayer = function() { return null; };
N.getNbsKeyDisplayLabel = function(k) { return 'K' + k; };

var fs = require('fs');
var path = require('path');
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'src/static/js/modules/35-lyrics-quick.js'), 'utf8'));

var LQ = N.LyricQuick;
var failures = 0;
function check(name, actual, expected) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a === e) {
        console.log('[PASS] ' + name);
    } else {
        failures++;
        console.log('[FAIL] ' + name + '\n   actual  : ' + a + '\n   expected: ' + e);
    }
}

// ============ 1. LRC 解析: 元数据 / offset / 多时间标签 / 增强标签 ============
var lrc = [
    '[ti:测试]',
    '[ar:某人]',
    '[offset:100]',
    '[00:12.34]第一句',
    '[00:15.60]第二句',
    '[00:20.00][00:30.00]重复句',
    '[00:40.00]<00:40.00>逐<00:40.20>字',
    '[00:50.00]   '
].join('\n');
var parsed = LQ.parseLrc(lrc);
check('LRC offset 被识别 (100ms)', parsed.offsetMs, 100);
check('LRC 条目数 (含空文本行, 由 convert 阶段过滤)', parsed.entries.length, 6);
check('LRC 空文本行仍保留时间锚点', parsed.entries[5].text, '');
check('LRC 时间应用 offset', parsed.entries[0].sec.toFixed(2), '12.24');
check('LRC 一行多时间标签被拆分', parsed.entries[2].sec.toFixed(2), '19.90');
check('LRC 增强逐字标签被剥离', parsed.entries[4].text, '逐字');

// ============ 2. 秒 → tick 换算 + duration 衔接 ============
var conv = LQ.convertLrcToClips('[00:12.34]第一句\n[00:15.60]第二句', { tempo: 20, lane: 0, tailDuration: 7 });
check('换算后的 tick', conv.clips.map(function(c) { return c.tick; }), [247, 312]);
check('duration 取到下一句的时间差', conv.clips[0].duration, 65);
check('末句使用配置时长', conv.clips[1].duration, 7);
check('LRC 片段标记句首', conv.clips[0].lineStart, true);
check('LRC 冲突计数为 0', conv.conflicts, 0);

// ============ 3. tick 冲突顺移 + 空文本跳过 ============
var conv2 = LQ.convertLrcToClips('[00:01.00]A\n[00:01.00]B\n[00:02.00]   ', { tempo: 20, tailDuration: 4 });
check('同 tick 冲突顺移 1 tick', conv2.clips.map(function(c) { return c.tick; }), [20, 21]);
check('冲突计数', conv2.conflicts, 1);
check('空文本行跳过计数', conv2.empty, 1);

// ============ 4. 文本拆分 ============
var charsChar = LQ.splitLyricChars('你好，世界\nhello world', 'char');
check('按字拆分数量 (忽略空白)', charsChar.length, 15);
check('按字拆分内容', charsChar.slice(0, 5).map(function(c) { return c.ch; }), ['你', '好', '，', '世', '界']);
check('第二行首字带行号', charsChar[5].line, 1);
var charsWord = LQ.splitLyricChars('你好，世界\nhello world', 'word');
check('按词拆分内容', charsWord.map(function(c) { return c.ch; }), ['你', '好', '，', '世', '界', 'hello', 'world']);

// ============ 5. 对齐映射 ============
check('默认对齐 (字多于音符)', LQ.defaultAlign(5, 3), [0, 1, 2, 2, 2]);

var alignA = [0, 1, 2, 3, 4];
LQ.realignFrom(alignA, 2, 0, 5);
check('锚点前移: 后面的字顺移且前面保持单调', alignA, [0, 0, 0, 1, 2]);

var alignB = [0, 1, 2, 3, 4];
LQ.realignFrom(alignB, 1, 2, 10);
check('锚点后移: 后面的字顺移', alignB, [0, 2, 3, 4, 5]);

var alignC = [0, 1, 2];
LQ.realignFrom(alignC, 0, 99, 4);
check('锚点越界被钳制到最后一个音符', alignC, [3, 3, 3]);

// ============ 6. 音符收集 (同 tick 取最高音) ============
N.state.notes = [
    { tick: 8, layer: 1, key: 40 },
    { tick: 0, layer: 1, key: 45 },
    { tick: 0, layer: 1, key: 33 },
    { tick: 4, layer: 0, key: 50 },
    { tick: 4, layer: 1, key: 38 }
];
var notesL1 = LQ.collectLayerNotes(1);
check('轨道音符按 tick 升序去重', notesL1.map(function(n) { return n.tick; }), [0, 4, 8]);
check('同 tick 取最高音', notesL1[0].key, 45);
check('最近音符索引', LQ.findNearestNoteIndex(notesL1, 5), 1);

// ============ 7. 逐字片段生成 (含跨行断句 / 多字合并) ============
var chars7 = LQ.splitLyricChars('你好世界', 'char');
var notes7 = [{ tick: 0, key: 40 }, { tick: 4, key: 42 }, { tick: 8, key: 44 }];
var align7 = LQ.defaultAlign(chars7.length, notes7.length);
var clips7 = LQ.buildCharClips(chars7, notes7, align7, { lane: 1, layer: 2, tailDuration: 6 });
check('同音符多字合并为一条', clips7.map(function(c) { return c.text; }), ['你', '好', '世界']);
check('逐字片段 tick', clips7.map(function(c) { return c.tick; }), [0, 4, 8]);
check('逐字片段 duration 衔接', clips7.map(function(c) { return c.duration; }), [4, 4, 6]);
check('逐字片段记录绑定音符', [clips7[0].noteLayer, clips7[0].noteTick, clips7[2].charIndex], [2, 0, 2]);
check('跨行时标记句首', LQ.buildCharClips(
    LQ.splitLyricChars('ab\ncd', 'char'),
    [{ tick: 0, key: 1 }, { tick: 2, key: 1 }, { tick: 4, key: 1 }, { tick: 6, key: 1 }],
    [0, 1, 2, 3],
    { lane: 0, layer: 0, tailDuration: 4 }
).map(function(c) { return !!c.lineStart; }), [true, false, true, false]);

// ============ 8. 追加模式: 只丢弃同轨重叠 ============
var existing = [
    { id: 'a', tick: 0, lane: 0, text: 'x', duration: 10 },
    { id: 'b', tick: 0, lane: 1, text: 'y', duration: 10 },
    { id: 'c', tick: 20, lane: 0, text: 'z', duration: 4 }
];
var kept = LQ.dropOverlappingLyrics(existing, [{ tick: 5, lane: 0, text: 'new', duration: 4 }]);
check('追加时丢弃同轨重叠片段', kept.map(function(c) { return c.id; }), ['b', 'c']);

// ============ 9. 已写入逐字歌词的「按音符重排」 ============
N.state.notes = [
    { tick: 0, layer: 1, key: 40 },
    { tick: 10, layer: 1, key: 42 },
    { tick: 20, layer: 1, key: 44 },
    { tick: 30, layer: 1, key: 45 },
    { tick: 40, layer: 1, key: 47 }
];
function mkLyrics() {
    N.state.lyrics = [
        { id: 'c0', tick: 0, lane: 0, text: 'a', duration: 10, noteLayer: 1, noteTick: 0, charIndex: 0, lineStart: true },
        { id: 'c1', tick: 10, lane: 0, text: 'b', duration: 10, noteLayer: 1, noteTick: 10, charIndex: 1 },
        { id: 'c2', tick: 20, lane: 0, text: 'c', duration: 14, noteLayer: 1, noteTick: 20, charIndex: 2 }
    ];
    return N.state.lyrics;
}
mkLyrics();
check('按音符重排成功', N.realignLyricClipsByNote('c0', 20), true);
check('重排后 tick', N.state.lyrics.map(function(c) { return c.tick; }), [20, 30, 40]);
check('重排后 duration 重新衔接', N.state.lyrics.map(function(c) { return c.duration; }), [10, 10, 14]);
check('重排后绑定音符同步', N.state.lyrics.map(function(c) { return c.noteTick; }), [20, 30, 40]);

// 越界锚定: 所有字压到最后一个音符 -> 合并为一条
mkLyrics();
N.realignLyricClipsByNote('c0', 40);
check('越界锚定后合并为一条', N.state.lyrics.length, 1);
check('合并后文本拼接', N.state.lyrics[0].text, 'abc');
check('合并后保留句首标记', N.state.lyrics[0].lineStart, true);

// 非逐字片段不参与重排
N.state.lyrics = [{ id: 'plain', tick: 0, lane: 0, text: 'p', duration: 4 }];
check('普通歌词片段不可按音符重排', N.realignLyricClipsByNote('plain', 10), false);
check('逐字片段判定', [N.isCharAlignedClip({ noteLayer: 0, noteTick: 0, charIndex: 0 }),
    N.isCharAlignedClip({ tick: 0, lane: 0, text: 'p', duration: 4 })], [true, false]);

// ============ 结果 ============
console.log('');
if (failures) {
    console.log('[FAIL] ' + failures + ' 项断言失败');
    process.exit(1);
}
console.log('[PASS] 全部断言通过');
process.exit(0);
