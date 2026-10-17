// test/_test_slot_volume.js - 临时验证: MIDI 导入时按拟合槽位音量换算音符音量
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'static', 'js', 'nbs_client.js'), 'utf8');
const ctx = {
    window: {},
    console: console,
    TextDecoder: TextDecoder,
    TextEncoder: TextEncoder,
    Blob: Blob,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int8Array: Int8Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    Math: Math,
    JSON: JSON,
    Date: Date
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const NBS = ctx.NBSClient || ctx.window.NBSClient;
if (!NBS) { console.log('NBSClient 未加载'); process.exit(1); }

// ---- 构造最小 MIDI (format 0, 1 track, division 96) ----
function buildMidi(events) {
    // events: [{delta, bytes:[...]}]
    const track = [];
    events.forEach(e => {
        track.push(e.delta & 0x7f);  // 简化: delta < 128
        e.bytes.forEach(b => track.push(b));
    });
    const trackLen = track.length;
    const head = [
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x60
    ];
    const trk = [0x4d, 0x54, 0x72, 0x6b,
        (trackLen >> 24) & 0xff, (trackLen >> 16) & 0xff, (trackLen >> 8) & 0xff, trackLen & 0xff];
    return new Uint8Array(head.concat(trk, track)).buffer;
}

function baseSettings(fitting) {
    return {
        channel_instruments: {},
        channel_octaves: {},
        channel_keys: {},
        percussion_instruments: {},
        percussion_pitches: {},
        remove_silent: true,
        name_layers: false,
        name_after_patches: true,
        same_tempo: true,
        tempo_changes: false,
        read_velocity: true,
        precision: 1,
        keep_note_length: 'none',
        dedupe_notes: false,
        dedupe_reorder: false,
        sustain_tracks: [],
        snap_enabled: false,
        snap_beat: 4,
        octave_mode: 0,
        smart_substitute_enabled: false,
        excluded_tracks: [],
        timbre_fitting: fitting
    };
}

const results = [];

// 1) 旋律 ch0: 主音符 + slot2 + slot3, 音量 [50, 25, 0]
let midi = buildMidi([
    { delta: 0, bytes: [0xc0, 0x00] },
    { delta: 0, bytes: [0x90, 0x3c, 0x7f] },   // C4 vel 127 -> 100
    { delta: 96, bytes: [0x80, 0x3c, 0x00] },
    { delta: 0, bytes: [0xff, 0x2f, 0x00] }
]);
let song = NBS._convertMidiToNBS(midi, baseSettings({
    channels: { 0: [0, 1, 2] },
    drums: {},
    channel_volumes: { 0: [50, 25, 0] },
    drum_volumes: {}
}));
let notes = song.notes || [];
let byInst = {};
notes.forEach(n => { byInst[n.instrument] = n.velocity; });
results.push({
    case: '旋律槽音量 [50,25,0], MIDI 音量 100',
    notes: notes.map(n => ({ inst: n.instrument, vel: n.velocity, key: n.key, layer: n.layer })),
    expect: { 0: 50, 1: 25, 2: 0 },
    pass: byInst[0] === 50 && byInst[1] === 25 && byInst[2] === 0
});

// 2) MIDI 音量 64 (0x40) -> 50% -> 主槽 50% => 25
midi = buildMidi([
    { delta: 0, bytes: [0xc0, 0x00] },
    { delta: 0, bytes: [0x90, 0x3c, 0x40] },
    { delta: 96, bytes: [0x80, 0x3c, 0x00] },
    { delta: 0, bytes: [0xff, 0x2f, 0x00] }
]);
song = NBS._convertMidiToNBS(midi, baseSettings({
    channels: { 0: [0, 1, 2] },
    drums: {},
    channel_volumes: { 0: [50, 25, 0] },
    drum_volumes: {}
}));
notes = song.notes || [];
byInst = {};
notes.forEach(n => { byInst[n.instrument] = n.velocity; });
results.push({
    case: '乘法链: MIDI 64 -> 50% x 槽 [50,25,0]',
    notes: notes.map(n => ({ inst: n.instrument, vel: n.velocity })),
    expect: { 0: 25, 1: 13, 2: 0 },
    pass: byInst[0] === 25 && byInst[1] === 13 && byInst[2] === 0
});

// 3) 无音量表 (旧设置) -> 全部 100%
song = NBS._convertMidiToNBS(buildMidi([
    { delta: 0, bytes: [0xc0, 0x00] },
    { delta: 0, bytes: [0x90, 0x3c, 0x7f] },
    { delta: 96, bytes: [0x80, 0x3c, 0x00] },
    { delta: 0, bytes: [0xff, 0x2f, 0x00] }
]), baseSettings({ channels: { 0: [0, 1, 2] }, drums: {} }));
notes = song.notes || [];
results.push({
    case: '旧数据无音量表 -> 默认 100',
    notes: notes.map(n => ({ inst: n.instrument, vel: n.velocity })),
    pass: notes.length === 3 && notes.every(n => n.velocity === 100)
});

// 4) 打击乐 ch9: note 38, 槽 [4, 5], 音量 [70, 40]
song = NBS._convertMidiToNBS(buildMidi([
    { delta: 0, bytes: [0x99, 0x26, 0x7f] },   // ch9 note38 vel127
    { delta: 96, bytes: [0x89, 0x26, 0x00] },
    { delta: 0, bytes: [0xff, 0x2f, 0x00] }
]), baseSettings({
    channels: {},
    drums: { 38: [4, 5, -1] },
    channel_volumes: {},
    drum_volumes: { 38: [70, 40, 100] }
}));
notes = song.notes || [];
byInst = {};
notes.forEach(n => { byInst[n.instrument] = n.velocity; });
results.push({
    case: '打击乐槽音量 [70,40]',
    notes: notes.map(n => ({ inst: n.instrument, vel: n.velocity, key: n.key })),
    pass: byInst[4] === 70 && byInst[5] === 40
});

// 5) 保持音符长度 all: 延音音符也带各自槽音量
song = NBS._convertMidiToNBS(buildMidi([
    { delta: 0, bytes: [0xc0, 0x00] },
    { delta: 0, bytes: [0x90, 0x3c, 0x7f] },
    { delta: 96, bytes: [0x80, 0x3c, 0x00] },
    { delta: 0, bytes: [0xff, 0x2f, 0x00] }
]), Object.assign(baseSettings({
    channels: { 0: [0, 1, -1] },
    drums: {},
    channel_volumes: { 0: [60, 30, 100] },
    drum_volumes: {}
}), { keep_note_length: 'all' }));
notes = song.notes || [];
const velByInst = {};
notes.forEach(n => { (velByInst[n.instrument] = velByInst[n.instrument] || []).push(n.velocity); });
results.push({
    case: '延音音符沿用各槽音量',
    counts: Object.keys(velByInst).map(k => ({ inst: k, count: velByInst[k].length, vels: Array.from(new Set(velByInst[k])) })),
    pass: velByInst[0] && velByInst[0].every(v => v === 60) &&
          velByInst[1] && velByInst[1].every(v => v === 30)
});

console.log(JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.pass).length;
console.log('=== 失败: ' + failed + ' / ' + results.length + ' ===');
process.exit(failed ? 1 : 0);
