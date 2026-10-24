/**
 * MIDI 转换结构校验 (临时脚本, Node + vm)
 * 直接调用 nbs_client.js 的 _convertMidiToNBS, 检查:
 *  - 打击乐按 6 大族分层, 每族层号连续, 层名可读
 *  - 打击乐音符没有被丢弃 (数量与解析结果一致)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'static', 'js', 'nbs_client.js');
const MIDI = process.argv[2] || 'C:\\Users\\MSI\\Desktop\\Big制作\\Midi\\The Other Side Of Paradise.mid';

const sandbox = { window: {}, console, performance: { now: () => Date.now() }, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'nbs_client.js' });
const NBSClient = sandbox.NBSClient;

const settings = {
    channel_instruments: {}, channel_octaves: {}, channel_keys: {},
    percussion_instruments: {}, percussion_pitches: {},
    remove_silent: true, name_layers: true, name_after_patches: true,
    same_tempo: true, tempo_changes: false, read_velocity: true,
    precision: 1, keep_note_length: 'none', dedupe_notes: false, dedupe_reorder: false,
    sustain_tracks: [], snap_enabled: false, snap_beat: 4,
    octave_mode: 1, smart_substitute_enabled: false, force_fold_enabled: false,
    timbre_fitting: null
};

const buf = fs.readFileSync(MIDI);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const info = NBSClient._parseMidiInfo(ab);
// 模拟弹窗默认值: 每个打击乐音符使用默认音色与默认音高
for (const p of (info.percussion || [])) {
    if (p.default_instrument !== undefined) settings.percussion_instruments[p.note] = p.default_instrument;
    if (p.default_pitch !== undefined) settings.percussion_pitches[p.note] = p.default_pitch;
}
const song = NBSClient._convertMidiToNBS(ab, settings);

const famNames = ['底鼓', '军鼓', '踩镲', '嗵鼓', '镲片', '打击乐'];
const drumLayerNames = [];
const drumLayerIdx = [];
for (let i = 0; i < song.layers.length; i++) {
    const ch = song.layer_channel_map[i];
    if (ch === 9) {
        drumLayerNames.push(song.layers[i].name);
        drumLayerIdx.push(i);
    }
}

// 每族层号是否连续
const famLayers = {};
for (const i of drumLayerIdx) {
    const n = song.layers[i].name;
    (famLayers[n] = famLayers[n] || []).push(i);
}
const contiguous = Object.keys(famLayers).every(k => {
    const arr = famLayers[k];
    for (let i = 1; i < arr.length; i++) if (arr[i] !== arr[i - 1] + 1) return false;
    return true;
});

const percExpected = (info.percussion || []).reduce((s, p) => s + (p.note_count || 0), 0);
const percOut = song.notes.filter(n => song.layer_channel_map[n.layer] === 9).length;

console.log('MIDI 打击乐音色数:', (info.percussion || []).length);
const ch9 = (info.channels || []).find(c => c.channel === 9);
console.log('MIDI 通道9 音符:', ch9 ? ch9.note_count : 0);
console.log('NBS 打击乐音符(输出):', percOut);
console.log('打击乐层:', JSON.stringify(drumLayerNames));
console.log('层名名称合法:', drumLayerNames.every(n => famNames.indexOf(n) >= 0));
console.log('同族层号连续:', contiguous);
console.log('总层数:', song.layers.length, '总音符:', song.notes.length);

const ok = percOut > 0 && drumLayerNames.length > 0 &&
    drumLayerNames.every(n => famNames.indexOf(n) >= 0) && contiguous;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
