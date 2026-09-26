/**
 * 验证 build 产物：base64 表与源码 OGG 字节一致性 + file:// 解码路径
 * 仅验证用，非项目交付物。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src', 'static', 'sounds');
var B64FILE = path.join(ROOT, 'blbl-toy', 'static', 'sounds', 'sounds_base64.js');

// 1) 加载产物中的 base64 表（模拟浏览器脚本执行）
var code = fs.readFileSync(B64FILE, 'utf8');
var sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
var table = sandbox.window.SOUNDS_BASE64;

var fails = 0;
function eq(name, a, b) {
    if (a !== b) { console.log('FAIL ' + name + ': ' + a + ' != ' + b); fails++; }
}

eq('表键数', Object.keys(table).length, 20);

// 2) 逐音色解码比对（复刻 base64ToUint8Array 逻辑）
var names = fs.readdirSync(SRC).filter(function (f) { return /\.ogg$/i.test(f); }).sort();
for (var i = 0; i < names.length; i++) {
    var name = names[i].replace(/\.ogg$/i, '');
    if (!table[name]) { console.log('FAIL 缺少 ' + name); fails++; continue; }
    var b64 = table[name];
    eq(name + ' 键长度>0', b64.length > 0, true);
    // atob 等价实现 (Buffer.from(x,'base64'))
    var decoded = Buffer.from(b64, 'base64');
    var original = fs.readFileSync(path.join(SRC, name + '.ogg'));
    eq(name + ' 字节数', decoded.length, original.length);
    eq(name + ' 内容一致', decoded.equals(original), true);
    eq(name + ' OggS 魔数', decoded.slice(0, 4).toString('latin1'), 'OggS');
}

// 3) 验证产物 index.html 注入位置正确
var html = fs.readFileSync(path.join(ROOT, 'blbl-toy', 'index.html'), 'utf8');
var idxB64 = html.indexOf('sounds_base64.js');
var idxEngine = html.indexOf('audio_engine.js?v=');
eq('注入存在', idxB64 > -1, true);
eq('base64 在 audio_engine 之前', idxB64 < idxEngine, true);
eq('file:// 双模式保留', html.indexOf("location.protocol === 'file:'") > -1, true);

// 4) 验证源码 index.html 未被污染
var srcHtml = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
eq('源码无 base64 注入', srcHtml.indexOf('sounds_base64.js') === -1, true);

console.log(fails === 0 ? '\n全部通过 (' + names.length + ' 个音色字节级一致)' : '\n' + fails + ' 项失败');
process.exit(fails === 0 ? 0 : 1);
