/**
 * NBSClient - 客户端 NBS/MIDI 解析与转换
 *
 * 替代服务端 API:
 *   /api/song/load   -> NBSClient.loadNBS(file)
 *   /api/song/save   -> NBSClient.saveNBS(songData)
 *   /api/midi/info   -> NBSClient.getMidiInfo(file)
 *   /api/midi/import -> NBSClient.importMidi(file, settings)
 *
 * 这是一个普通脚本 (非 ES module), 创建全局 NBSClient 对象。
 * 所有二进制读取: NBS 使用小端序, MIDI 使用大端序。
 */

// ====================================================================
// 常量
// ====================================================================

var NBS_VERSION = 5;

// 导出版本号设置 (可通过设置面板修改, 但含新乐器时强制 V6)
// V5: 仅支持 0-15 号 vanilla 乐器
// V6: 支持 0-19 号 vanilla 乐器 (含铜号角系列)
window.NBS_EXPORT_VERSION = 5;

// GM Program 音色映射表 (128 项)
// 每项: [name, main, octave_offset, high_sub, low_sub, sustain]
//   main   : 最贴近该 GM 音色的 NBS 主音色 (0-19)
//   octave : 默认八度偏移提示 (与原表一致, 由 getDefaultOctave 按全局音域校验后采用)
//   high_sub: 主音色音域上方溢出时使用的替代 NBS 音色 (-1=无更高替代)
//   low_sub : 主音色音域下方溢出时使用的替代 NBS 音色 (-1=无更低替代)
//   sustain : 1=延音类 (organ/strings/brass/reed/pipe/pad/lead/choir 等持续型),
//             0=衰减型 (piano/guitar/perc 等拨击型)。延音类轨道默认启用"使用延音"。
// 主音色/替代基于联网检索的 GM 128 音色描述 + NBS 20 音色音域/音色组合拟合:
//   钢琴→Harp/Pling, 钟琴→Bell/Chime/Xylo, 管风琴→Bit, 吉他→Guitar, 贝斯→DoubleBass,
//   弦乐→Harp(延音), 合唱/管乐→Flute(延音), 铜管→CopperHorn(延音), 合成Lead→Bit,
//   合成Pad→Harp/Bit/Flute/Bell(延音), 班卓→Banjo, 迪吉→Didgeridoo, 木鱼→Click 等。
var GM_TIMBRE_MAP = [
    // Piano (0-7)
    ["Acoustic Grand Piano", 0, 0, 7, 1, 0],
    ["Bright Acoustic Piano", 0, 0, 7, 1, 0],
    ["Electric Grand Piano", 0, 0, 7, 1, 0],
    ["Honky-tonk Piano", 0, 0, 7, 1, 0],
    ["Electric Piano 1", 15, 0, 7, 1, 0],
    ["Electric Piano 2", 15, 0, 7, 1, 0],
    ["Harpsichord", 0, 1, 7, 1, 0],
    ["Clavinet", 0, 0, 7, 1, 0],
    // Chromatic Percussion (8-15)
    ["Celesta", 7, -2, -1, 0, 0],
    ["Glockenspiel", 7, -2, -1, 0, 0],
    ["Music Box", 8, -2, -1, 0, 0],
    ["Vibraphone", 10, 0, 7, 1, 0],
    ["Marimba", 9, 0, -1, 0, 0],
    ["Xylophone", 9, -2, -1, 0, 0],
    ["Tubular Bells", 7, -2, -1, 0, 0],
    ["Dulcimer", 0, 1, 7, 1, 0],
    // Organ (16-23)
    ["Drawbar Organ", 13, -1, 7, 1, 1],
    ["Percussive Organ", 13, 0, 7, 1, 1],
    ["Rock Organ", 13, -1, 7, 1, 1],
    ["Church Organ", 13, -1, 7, 1, 1],
    ["Reed Organ", 13, -1, 7, 1, 1],
    ["Accordion", 13, -1, 7, 1, 1],
    ["Harmonica", 6, -1, 7, 1, 1],
    ["Bandoneon", 13, -1, 7, 1, 1],
    // Guitar (24-31)
    ["Acoustic Guitar (nylon)", 5, 1, 0, 1, 0],
    ["Acoustic Guitar (steel)", 5, 1, 0, 1, 0],
    ["Electric Guitar (jazz)", 5, 0, 0, 1, 0],
    ["Electric Guitar (clean)", 5, 1, 0, 1, 0],
    ["Electric Guitar (muted)", 5, 2, 0, 1, 0],
    ["Overdriven Guitar", 5, 2, 0, 1, 0],
    ["Distortion Guitar", 13, 2, 0, 1, 0],
    ["Guitar Harmonics", 0, 3, 7, 1, 0],
    // Bass (32-39)
    ["Acoustic Bass", 1, 2, 0, -1, 0],
    ["Electric Bass (finger)", 1, 2, 0, -1, 0],
    ["Electric Bass (pick)", 1, 2, 0, -1, 0],
    ["Fretless Bass", 1, 2, 0, -1, 0],
    ["Slap Bass 1", 1, 1, 0, -1, 0],
    ["Slap Bass 2", 1, 1, 0, -1, 0],
    ["Synth Bass 1", 1, 2, 0, -1, 0],
    ["Synth Bass 2", 1, 0, 0, -1, 0],
    // Strings (40-47)
    ["Violin", 0, -1, 6, 1, 1],
    ["Viola", 0, -1, 6, 1, 1],
    ["Cello", 0, -1, 6, 1, 1],
    ["Contrabass", 1, -1, 0, -1, 1],
    ["Tremolo Strings", 0, -1, 6, 1, 1],
    ["Pizzicato Strings", 0, 2, 7, 1, 0],
    ["Orchestral Harp", 0, 0, 7, 1, 0],
    ["Timpani", 1, 0, 0, -1, 0],
    // Ensemble (48-55)
    ["String Ensemble 1", 0, -1, 6, 1, 1],
    ["String Ensemble 2", 0, -1, 6, 1, 1],
    ["Synth Strings 1", 0, -1, 6, 1, 1],
    ["Synth Strings 2", 0, -1, 6, 1, 1],
    ["Choir Aahs", 6, -1, 7, 1, 1],
    ["Voice Oohs", 6, -1, 7, 1, 1],
    ["Synth Voice", 6, -1, 7, 1, 1],
    ["Orchestra Hit", 2, -1, -1, -1, 0],
    // Brass (56-63)
    ["Trumpet", 16, -1, 7, 1, 1],
    ["Trombone", 16, -1, 7, 1, 1],
    ["Tuba", 16, -1, 7, 1, 1],
    ["Muted Trumpet", 16, 2, 7, 1, 1],
    ["French Horn", 16, -1, 7, 1, 1],
    ["Brass Section", 16, 2, 7, 1, 1],
    ["Synth Brass 1", 16, 2, 7, 1, 1],
    ["Synth Brass 2", 16, -1, 7, 1, 1],
    // Reed (64-71)
    ["Soprano Sax", 6, -1, 7, 1, 1],
    ["Alto Sax", 6, -1, 7, 1, 1],
    ["Tenor Sax", 6, -1, 7, 1, 1],
    ["Baritone Sax", 6, -1, 7, 1, 1],
    ["Oboe", 6, -1, 7, 1, 1],
    ["English Horn", 6, -1, 7, 1, 1],
    ["Bassoon", 6, -1, 7, 1, 1],
    ["Clarinet", 6, -1, 7, 1, 1],
    // Pipe (72-79)
    ["Piccolo", 6, -1, 7, 0, 1],
    ["Flute", 6, -1, 7, 1, 1],
    ["Recorder", 6, -1, 7, 1, 1],
    ["Pan Flute", 6, -1, 7, 1, 1],
    ["Blown Bottle", 6, -1, 7, 1, 1],
    ["Shakuhachi", 6, -1, 7, 1, 1],
    ["Whistle", 6, -1, 7, 1, 1],
    ["Ocarina", 6, -1, 7, 1, 1],
    // Synth Lead (80-87)
    ["Lead 1 (square)", 13, 0, 7, 1, 1],
    ["Lead 2 (sawtooth)", 13, -1, 7, 1, 1],
    ["Lead 3 (calliope)", 7, -1, -1, 0, 1],
    ["Lead 4 (chiff)", 13, -1, 7, 1, 1],
    ["Lead 5 (charang)", 13, 1, 7, 1, 1],
    ["Lead 6 (voice)", 6, -1, 7, 1, 1],
    ["Lead 7 (fifths)", 13, -1, 7, 1, 1],
    ["Lead 8 (bass + lead)", 1, 2, 0, -1, 1],
    // Synth Pad (88-95)
    ["Pad 1 (new age)", 0, -2, 6, 1, 1],
    ["Pad 2 (warm)", 0, -1, 6, 1, 1],
    ["Pad 3 (polysynth)", 13, -1, 7, 1, 1],
    ["Pad 4 (choir)", 6, -1, 7, 1, 1],
    ["Pad 5 (bowed)", 0, -1, 6, 1, 1],
    ["Pad 6 (metallic)", 7, -1, -1, 0, 1],
    ["Pad 7 (halo)", 0, -1, 6, 1, 1],
    ["Pad 8 (sweep)", 0, -2, 6, 1, 1],
    // Synth Effects (96-103)
    ["FX 1 (rain)", 0, -2, 7, 1, 1],
    ["FX 2 (soundtrack)", 0, -1, 6, 1, 1],
    ["FX 3 (crystal)", 7, -2, -1, 0, 1],
    ["FX 4 (atmosphere)", 0, 1, 6, 1, 1],
    ["FX 5 (brightness)", 7, 0, -1, 0, 1],
    ["FX 6 (goblins)", 13, -1, 7, 1, 1],
    ["FX 7 (echoes)", 0, -1, 7, 1, 1],
    ["FX 8 (sci-fi)", 13, 1, 7, 1, 1],
    // Ethnic (104-111)
    ["Sitar", 0, 0, 7, 1, 0],
    ["Banjo", 14, 0, 7, 1, 0],
    ["Shamisen", 0, 0, 7, 1, 0],
    ["Koto", 0, 1, 7, 1, 0],
    ["Kalimba", 8, 0, -1, 0, 0],
    ["Bag pipe", 12, -1, 0, -1, 1],
    ["Fiddle", 0, -1, 6, 1, 1],
    ["Shanai", 6, -1, 7, 1, 1],
    // Percussive (112-119)
    ["Tinkle Bell", 7, -2, -1, 0, 0],
    ["Agogo", 11, -1, 7, 0, 0],
    ["Steel Drums", 10, 0, 7, 1, 0],
    ["Woodblock", 4, -2, -1, -1, 0],
    ["Taiko Drum", 2, 0, -1, -1, 0],
    ["Melodic Tom", 3, 0, -1, -1, 0],
    ["Synth Drum", 3, 0, -1, -1, 0],
    ["Reverse Cymbal", 8, -2, -1, 0, 0],
    // Sound Effects (120-127)
    ["Guitar Fret Noise", 4, 1, -1, -1, 0],
    ["Breath Noise", 6, -1, 7, 0, 0],
    ["Seashore", 0, -2, 7, 1, 0],
    ["Bird Tweet", 7, 1, -1, 0, 0],
    ["Telephone Ring", 13, 2, -1, -1, 0],
    ["Helicopter", 2, 0, -1, -1, 0],
    ["Applause", 3, 0, -1, -1, 0],
    ["Gunshot", 3, 0, -1, -1, 0]
];

// 派生: 保留 [name, main, oct] 形状以兼容既有调用点 (_parseMidiInfo / 转换逻辑)
var GM_PROGRAM_TABLE = GM_TIMBRE_MAP.map(function (e) { return [e[0], e[1], e[2]]; });
// 派生: 每个 program 的 [high_sub, low_sub] (音色拟合默认替代槽)
var GM_FITTING_SLOTS = GM_TIMBRE_MAP.map(function (e) { return [e[3], e[4]]; });
// 派生: 每个 program 是否为延音类 (true=持续型, 默认启用延音轨道)
var GM_SUSTAIN_PROGRAMS = GM_TIMBRE_MAP.map(function (e) { return e[5] === 1; });

// 鼓组音符映射 (Channel 9) - 完全复刻 midi_handler.py DRUM_NOTE_TABLE
// midi_drum[midi_note] = [name, nbs_instrument, nbs_key - 33]
var DRUM_NOTE_TABLE = {
    24: ["Cutting Noise(SFX)", 13, 39],
    25: ["Snare Roll", 3, 8],
    26: ["Finger Snap", 4, 25],
    27: ["High Q", 3, 18],
    28: ["Slap", 3, 27],
    29: ["Scratch Push", 4, 16],
    30: ["Scratch Pull", 4, 13],
    31: ["Sticks", 4, 9],
    32: ["Square Click", 4, 6],
    33: ["Metronome Click", 4, 2],
    34: ["Metronome Bell", 8, 17],
    35: ["Bass Drum 2", 2, 10],
    36: ["Bass Drum 1", 2, 6],
    37: ["Side Stick", 4, 6],
    38: ["Snare Drum 1", 3, 8],
    39: ["Hand Clap", 4, 6],
    40: ["Snare Drum 2", 3, 4],
    41: ["Low Tom 2", 2, 6],
    42: ["Closed Hi-hat", 3, 22],
    43: ["Low Tom 1", 2, 13],
    44: ["Pedal Hi-hat", 3, 22],
    45: ["Mid Tom 2", 2, 15],
    46: ["Open Hi-hat", 3, 18],
    47: ["Mid Tom 1", 2, 20],
    48: ["High Tom 2", 2, 23],
    49: ["Crash Cymbal 1", 3, 17],
    50: ["High Tom 1", 2, 23],
    51: ["Ride Cymbal 1", 3, 24],
    52: ["Chinese Cymbal", 3, 8],
    53: ["Ride Bell", 3, 13],
    54: ["Tambourine", 4, 18],
    55: ["Splash Cymbal", 3, 18],
    56: ["Cowbell", 11, 5],
    57: ["Crash Cymbal 2", 3, 13],
    58: ["Vibraslap", 4, 2],
    59: ["Ride Cymbal 2", 3, 13],
    60: ["High Bongo", 4, 9],
    61: ["Low Bongo", 4, 2],
    62: ["Mute High Conga", 4, 8],
    63: ["Open High Conga", 2, 22],
    64: ["Low Conga", 2, 15],
    65: ["High Timbale", 3, 13],
    66: ["Low Timbale", 3, 8],
    67: ["High Agogo", 9, 12],
    68: ["Low Agogo", 9, 5],
    69: ["Cabasa", 4, 20],
    70: ["Maracas", 4, 23],
    71: ["Short Whistle", 6, 34],
    72: ["Long Whistle", 6, 33],
    73: ["Short Guiro", 4, 17],
    74: ["Long Guiro", 4, 11],
    75: ["Claves", 4, 18],
    76: ["High Wood Block", 4, 10],
    77: ["Low Wood Block", 4, 5],
    78: ["Mute Cuica", 12, 25],
    79: ["Open Cuica", 12, 26],
    80: ["Mute Triangle", 4, 16],
    81: ["Open Triangle", 8, 19],
    82: ["Shaker", 3, 22],
    83: ["Jingle Bell", 8, 6],
    84: ["Bell Tree", 8, 15],
    85: ["Castanets", 4, 21],
    86: ["Mute Surdo", 2, 14],
    87: ["Open Surdo", 2, 7]
};

var INSTRUMENT_NAMES = [
    "Harp/Piano", "Double Bass", "Bass Drum", "Snare Drum", "Click/Sticks",
    "Guitar", "Flute", "Bell/Glock", "Chime/Box", "Xylophone",
    "Iron Xylophone", "Cow Bell", "Didgeridoo", "Bit/Pluck", "Banjo", "Pling/Elec",
    "Copper Horn", "Exposed Copper Horn", "Weathered Copper Horn", "Oxidized Copper Horn"
];

// 每个旋律乐器相对于竖琴(基准 0)的半音偏移量 (基于 MC 官方音域数据)
// 实际 MIDI 音高 = NBS_key + 21 + INSTRUMENT_OFFSET[id]
var _INSTRUMENT_OFFSET = {
    0: 0,    // 竖琴 Harp (F#3~F#5)
    1: -24,  // 贝斯 Bass (F#1~F#3)
    5: -12,  // 吉他 Guitar (F#2~F#4)
    6: 12,   // 长笛 Flute (F#4~F#6)
    7: 24,   // 钟 Bell (F#5~F#7)
    8: 24,   // 管钟 Chime (F#5~F#7)
    9: 24,   // 木琴 Xylophone (F#5~F#7)
    10: 0,   // 颤音琴 Iron Xylophone (F#3~F#5)
    11: 12,  // 牛铃 Cow Bell (F#4~F#6)
    12: -24, // 迪吉里杜管 Didgeridoo (F#1~F#3)
    13: 0,   // 方波 Bit (F#3~F#5)
    14: 0,   // 班卓琴 Banjo (F#3~F#5)
    15: 0,   // 电钢琴 Pling (F#3~F#5)
    16: 0, 17: 0, 18: 0, 19: 0  // 铜号角 (假设与竖琴相同)
};

// 全局音域 (actualMIDI 层面, 即 nbsKey + 21 + instrumentOffset)
var GLOBAL_MIDI_MIN = 42;
var GLOBAL_MIDI_MAX = 114;

// NBS 格式硬性限制: nbsKey ∈ [0, 87], 对应 processedMidi ∈ [21, 108]
// processedMidi > 108 时, nbsKey > 87 会被 clamp, 导致音高丢失
// 因此 processedMidi 的有效上限为 108 (而非 114)
// 114 的上限通过音色替代 (Flute/Chime) 实现: processedMidi 102 + Chime offset 24 = actualMidi 126
var NBS_KEY_MAX = 87;
var NBS_KEY_MIN = 0;
var PROCESSED_MIDI_MAX = NBS_KEY_MAX + 21;  // 108
var PROCESSED_MIDI_MIN = NBS_KEY_MIN + 21;  // 21, 但实际下限由 GLOBAL_MIDI_MIN (42) 控制

// Minecraft 标准音域 (与 piano_roll.js 中 MINECRAFT_PITCH_MIN/MAX 一致)
// NBS key 33~57, 对应 F#3 ~ F#5 (竖琴的两个八度)
// 超出此范围的音符在 NBS 中仍可播放 (0~87), 但音色会偏离 Minecraft 原版效果 (piano_roll 中显示红色)
// 智能替代/偏移/归一/兜底的目标都是让 processedMidi 落入 [MC_MIDI_MIN, MC_MIDI_MAX]
var MC_KEY_MIN = 33;
var MC_KEY_MAX = 57;
var MC_MIDI_MIN = MC_KEY_MIN + 21;  // 54
var MC_MIDI_MAX = MC_KEY_MAX + 21;  // 78
var MC_MIDI_SPAN = MC_KEY_MAX - MC_KEY_MIN;  // 24

// ====================================================================
// 辅助函数
// ====================================================================

function _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function _decodeLatin1(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
        s += String.fromCharCode(bytes[i]);
    }
    return s;
}

// 积分所有 tempo 变化计算 MIDI 实际时长 (秒)
// 旧代码仅用 initialTempoUs 计算全长, tempo 变化频繁的 MIDI 偏差可达数百倍
function _calcMidiDurationSeconds(tempoChangesList, startTick, endTick, ticksPerBeat, defaultTempoUs) {
    if (!tempoChangesList || tempoChangesList.length === 0) {
        return (endTick - startTick) / ticksPerBeat * (defaultTempoUs / 1000000.0);
    }
    var sortedChanges = tempoChangesList.slice().sort(function (a, b) { return a.tick - b.tick; });
    var totalSeconds = 0;
    var currentTempoUs = sortedChanges[0].tempo_us;
    var lastTick = startTick;
    for (var i = 0; i < sortedChanges.length; i++) {
        var tc = sortedChanges[i];
        if (tc.tick < startTick) {
            currentTempoUs = tc.tempo_us;
            continue;
        }
        if (tc.tick > endTick) break;
        if (tc.tick > lastTick) {
            totalSeconds += (tc.tick - lastTick) / ticksPerBeat * (currentTempoUs / 1000000.0);
        }
        lastTick = tc.tick;
        currentTempoUs = tc.tempo_us;
    }
    if (endTick > lastTick) {
        totalSeconds += (endTick - lastTick) / ticksPerBeat * (currentTempoUs / 1000000.0);
    }
    return totalSeconds;
}

// ====================================================================
// NBS 二进制读取器 (小端序)
// ====================================================================

function _NBSReader(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.pos = 0;
    this.length = arrayBuffer.byteLength;
}

_NBSReader.prototype.readByte = function () {
    if (this.pos >= this.length) throw new Error('NBS: 意外的文件结束');
    return this.view.getUint8(this.pos++);
};

_NBSReader.prototype.readUShort = function () {
    if (this.pos + 2 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getUint16(this.pos, true); // little-endian
    this.pos += 2;
    return v;
};

_NBSReader.prototype.readSShort = function () {
    if (this.pos + 2 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getInt16(this.pos, true); // little-endian signed
    this.pos += 2;
    return v;
};

_NBSReader.prototype.readUInt = function () {
    if (this.pos + 4 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getUint32(this.pos, true); // little-endian
    this.pos += 4;
    return v;
};

_NBSReader.prototype.readString = function () {
    var len = this.readUInt();
    if (this.pos + len > this.length) throw new Error('NBS: 字符串超出文件范围');
    var bytes = new Uint8Array(this.view.buffer, this.pos, len);
    this.pos += len;
    return _decodeNBSBytes(bytes);
};

// 解码 NBS 字符串字节: UTF-8 -> windows-1252 -> 逐字节兜底
// 覆盖无 TextDecoder (老 WebView) 或 windows-1252 标签不可用时不抛异常,
// 否则部分设备会因异常导致整个 NBS 无法打开。
function _decodeNBSBytes(bytes) {
    // 无 TextDecoder 环境: 纯 ASCII 直接按原样返回, 否则逐字节 latin1 兜底
    if (typeof TextDecoder === 'undefined') {
        return _latin1Decode(bytes);
    }
    try {
        // 优先 UTF-8, fatal 让非法序列落入回退
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
        try {
            // 回退 cp1252 (复刻 Python _read_string_utf8)
            return new TextDecoder('windows-1252').decode(bytes);
        } catch (e2) {
            // 极端兜底: 逐字节解码, 保证任何设备都能打开
            return _latin1Decode(bytes);
        }
    }
}

// 逐字节 latin1 解码 (不依赖 TextDecoder 的编码标签支持)
function _latin1Decode(bytes) {
    var s = '', i = 0;
    for (; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
}

// ====================================================================
// NBS 二进制写入器 (小端序)
// ====================================================================

function _NBSWriter() {
    this.bytes = [];
}

_NBSWriter.prototype.wByte = function (v) {
    this.bytes.push(v & 0xFF);
};

_NBSWriter.prototype.wShort = function (v) {
    // little-endian unsigned short
    v = v & 0xFFFF;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
};

_NBSWriter.prototype.wSShort = function (v) {
    // little-endian signed short
    if (v < 0) v += 0x10000;
    v = v & 0xFFFF;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
};

_NBSWriter.prototype.wInt = function (v) {
    // little-endian unsigned int
    v = v >>> 0;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
    this.bytes.push((v >> 16) & 0xFF);
    this.bytes.push((v >> 24) & 0xFF);
};

_NBSWriter.prototype.wString = function (s) {
    var encoded = new TextEncoder().encode(s || '');
    this.wInt(encoded.length);
    for (var i = 0; i < encoded.length; i++) {
        this.bytes.push(encoded[i]);
    }
};

_NBSWriter.prototype.toArrayBuffer = function () {
    var arr = new Uint8Array(this.bytes.length);
    for (var i = 0; i < this.bytes.length; i++) {
        arr[i] = this.bytes[i];
    }
    return arr.buffer;
};

// ====================================================================
// MIDI 二进制读取器 (大端序)
// ====================================================================

function _MidiReader(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.pos = 0;
    this.length = arrayBuffer.byteLength;
}

_MidiReader.prototype.eof = function () {
    return this.pos >= this.length;
};

_MidiReader.prototype.readByte = function () {
    if (this.pos >= this.length) throw new Error('MIDI: 意外的文件结束');
    return this.view.getUint8(this.pos++);
};

_MidiReader.prototype.readUint16 = function () {
    if (this.pos + 2 > this.length) throw new Error('MIDI: 意外的文件结束');
    var v = this.view.getUint16(this.pos); // big-endian
    this.pos += 2;
    return v;
};

_MidiReader.prototype.readUint32 = function () {
    if (this.pos + 4 > this.length) throw new Error('MIDI: 意外的文件结束');
    var v = this.view.getUint32(this.pos); // big-endian
    this.pos += 4;
    return v;
};

_MidiReader.prototype.readVarLen = function () {
    var result = 0;
    while (true) {
        var byte = this.readByte();
        result = (result << 7) | (byte & 0x7F);
        if (!(byte & 0x80)) break;
    }
    return result;
};

_MidiReader.prototype.readN = function (n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr.push(this.readByte());
    }
    return arr;
};

// ====================================================================
// NBS 解析 (自包含, 复刻 pynbs Parser 行为)
// ====================================================================

function _parseNBS(arrayBuffer) {
    var reader = new _NBSReader(arrayBuffer);

    // ---- 版本检测 ----
    var songLengthShort = reader.readUShort(); // 第一个 short
    var version;
    if (songLengthShort === 0) {
        // OpenNBS 新格式
        version = reader.readByte();
    } else {
        // 旧格式 (version 0)
        version = 0;
    }

    // ---- 默认乐器数 ----
    var vanillaInstruments;
    if (version > 0) {
        vanillaInstruments = reader.readByte();
    } else {
        vanillaInstruments = 10;
    }

    // ---- song_length (version >= 3 有独立字段) ----
    var songLength;
    if (version >= 3) {
        songLength = reader.readUShort();
    } else {
        songLength = songLengthShort;
    }

    // ---- song_layers ----
    var layerCount = reader.readUShort();

    // ---- 字符串字段 ----
    var name = reader.readString();
    var author = reader.readString();
    var originalAuthor = reader.readString();
    var description = reader.readString();

    // ---- tempo (short / 100.0) ----
    var tempo = reader.readUShort() / 100.0;

    // ---- auto_save, auto_save_duration ----
    var autoSave = reader.readByte();
    var autoSaveDuration = reader.readByte();

    // ---- time_signature ----
    var timeSignature = reader.readByte();

    // ---- 统计字段 ----
    reader.readUInt(); // minutes_spent
    reader.readUInt(); // left_clicks
    reader.readUInt(); // right_clicks
    reader.readUInt(); // blocks_added
    reader.readUInt(); // blocks_removed

    // ---- song_origin ----
    reader.readString();

    // ---- Loop (version >= 4) ----
    var loopOn = 0, maxLoopCount = 0, loopStart = 0;
    if (version >= 4) {
        loopOn = reader.readByte();       // loop
        maxLoopCount = reader.readByte();  // max_loop_count
        loopStart = reader.readUShort();   // loop_start
    }

    // ---- Notes (jump 格式) ----
    var notes = [];
    var tick = -1;
    while (true) {
        var tickJump = reader.readUShort();
        if (tickJump === 0) break;
        tick += tickJump;
        var layer = -1;
        while (true) {
            var layerJump = reader.readUShort();
            if (layerJump === 0) break;
            layer += layerJump;
            var instrument = reader.readByte();
            var key = reader.readByte();
            var velocity = 100;
            var panning = 100; // NBS raw 默认中心 (0-200, 100=中心)
            var pitch = 0;
            if (version >= 4) {
                velocity = reader.readByte();
                panning = reader.readByte(); // 保留 raw 0-200 (100=中心)
                pitch = reader.readSShort();
            }
            // 复刻 Note.__post_init__ 钳制
            key = _clamp(key, 0, 87);
            velocity = _clamp(velocity, 0, 100);
            // pan: NBS raw 0-200 (100=中心) -> 前端 0-100 (50=中心)
            // 与 audio_engine 的 (panValue-50)/50 约定一致, 写入侧 pan*2 可正确还原
            var pan = _clamp(Math.round(panning / 2), 0, 100);

            notes.push({
                id: 'note_' + tick + '_' + layer,
                tick: tick,
                layer: layer,
                instrument: instrument,
                key: key,
                velocity: velocity,
                pan: pan,
                pitch: pitch
            });
        }
    }

    // ---- Layers ----
    var layers = [];
    for (var i = 0; i < layerCount; i++) {
        var layerName = reader.readString();
        var lock = 0;
        if (version >= 4) {
            lock = reader.readByte() ? 1 : 0;
        }
        var volume = reader.readByte();
        var stereo = 100; // NBS raw 默认中心 (0-200, 100=中心)
        if (version >= 2) {
            // 保留 raw 0-200 (100=中心), 与前端默认值 100 一致, 写入侧直接写出可还原
            stereo = reader.readByte();
        }
        layers.push({
            name: layerName,
            volume: volume,
            stereo: stereo,
            lock: lock
        });
    }

    // ---- Custom Instruments (v6) ----
    // 槽位 i 对应 instrument = 20 + i; 空槽(名称为空)视为未使用
    var customInstruments = [];
    if (version >= 6) {
        var ciCount = reader.readByte();
        for (var cii = 0; cii < ciCount; cii++) {
            var ciName = reader.readString();
            var ciFile = reader.readString();
            var ciPitch = reader.readByte();
            var ciPressKey = reader.readByte();
            customInstruments.push({
                instrument: 20 + cii,
                name: ciName,
                file: ciFile,
                sound: ciFile,
                pitch: ciPitch,
                pressKey: ciPressKey
            });
        }
    }

    // ---- 构建 song.length (复刻 Song.length 属性) ----
    var maxTick = 0;
    for (var i = 0; i < notes.length; i++) {
        if (notes[i].tick > maxTick) maxTick = notes[i].tick;
    }
    var songLen = notes.length > 0 ? maxTick + 1 : 0;

    // ---- 返回 (匹配 Song.to_dict() 格式) ----
    return {
        name: name,
        song_name: name,
        author: author,
        original_author: originalAuthor,
        description: description,
        tempo: tempo,
        auto_save: autoSave === 1,
        auto_save_minutes: autoSaveDuration,
        time_signature: timeSignature,
        length: songLen,
        layers: layers,
        note_count: notes.length,
        notes: notes,
        layer_channel_map: {},
        loop: loopOn,
        max_loop_count: maxLoopCount,
        loop_start: loopStart,
        customInstruments: customInstruments
    };
}

// ====================================================================
// NBS 写入 (复刻 nbs_handler.py write_nbs)
// ====================================================================

function _writeNBS(songData) {
    var writer = new _NBSWriter();

    // 计算 song.length = max(tick) + 1, 确保 tick 为整数
    var songLength = 0;
    var hasNewInstruments = false;
    if (songData.notes && songData.notes.length > 0) {
        for (var i = 0; i < songData.notes.length; i++) {
            var nt = Math.floor(songData.notes[i].tick);
            if (nt > songLength) songLength = nt;
            if (songData.notes[i].instrument >= 16) hasNewInstruments = true;
        }
        songLength += 1;
    }

    // 含新乐器 (>=16) 强制 V6; 否则使用设置中的版本 (默认 V5)
    var version = hasNewInstruments ? 6 : (window.NBS_EXPORT_VERSION || 5);
    var vanillaCount = version >= 6 ? 20 : 16;

    var layers = songData.layers || [];
    var notes = songData.notes || [];

    // ---- Header ----
    writer.wShort(0);                        // song_length = 0 (新格式标记)
    writer.wByte(version);                    // NBS version
    writer.wByte(vanillaCount);              // vanilla 乐器数 (V6=20, V5=16)
    // NBS 的 song_length 字段是 unsigned short, 超出 65535 会溢出回绕 (导致其他软件读到异常长度)
    // 截断到格式上限; 实际音符以 notes 段为准 (长间隔已由空和弦桥接)
    writer.wShort(Math.min(songLength, 65535)); // song_length
    // song_layers 是 unsigned short, 超过 65535 会溢出回绕
    writer.wShort(Math.min(layers.length, 65535)); // song_layers
    writer.wString(songData.name || songData.song_name || '');
    writer.wString(songData.author || '');
    writer.wString(songData.original_author || '');
    writer.wString(songData.description || '');
    // tempo * 100, 钳制到 unsigned short 上限 65535 (即 tempo <= 655.35), 防止溢出回绕
    var tempoRaw100 = Math.floor(Math.min(655, (songData.tempo || 20)) * 100);
    writer.wShort(tempoRaw100); // tempo * 100
    writer.wByte(songData.auto_save ? 1 : 0);  // auto_save
    writer.wByte(songData.auto_save_minutes || 0); // auto_save_duration
    writer.wByte(songData.time_signature || 4); // time_signature
    writer.wInt(0);                           // minutes_spent
    writer.wInt(0);                           // left_clicks
    writer.wInt(0);                           // right_clicks
    writer.wInt(0);                           // blocks_added
    writer.wInt(0);                           // blocks_removed
    writer.wString('');                      // song_origin
    // version >= 4
    writer.wByte(songData.loop ? 1 : 0);     // loop
    writer.wByte(songData.max_loop_count || 0); // max_loop_count
    // loop_start 是 unsigned short, 钳制到 65535 防止溢出
    writer.wShort(Math.min(songData.loop_start || 0, 65535)); // loop_start

    // ---- Notes (按 tick 分组, 按 layer 排序, jump 格式) ----
    if (notes.length > 0) {
        // 预处理: 确保 tick 和 layer 为整数, 过滤无效音符
        var cleanNotes = [];
        var _negTickCount = 0;
        // NBS 格式不支持同一 (tick, layer) 位置有多个音符:
        // 同一 chord 内两个音符 layer 相同时, layer jump = 0 会被 _parseNBS 误认为 end of chord,
        // 导致数据错位 (tick 异常膨胀). 用 _usedSlots 检测冲突并自动分配新 layer.
        var _usedSlots = {};
        var _dupCount = 0;
        for (var ci = 0; ci < notes.length; ci++) {
            var cn = notes[ci];
            if (!cn || typeof cn.tick !== 'number' || typeof cn.layer !== 'number') continue;
            var _ftick = Math.floor(cn.tick);
            // 防御: 过滤负 tick (无效值, 会导致 tick jump 回绕)
            if (_ftick < 0) { _negTickCount++; continue; }
            var _flayer = Math.floor(cn.layer);
            // 检测 (tick, layer) 冲突, 自动分配新 layer
            var _slotKey = _ftick + ':' + _flayer;
            while (_usedSlots[_slotKey]) {
                _flayer++;
                _slotKey = _ftick + ':' + _flayer;
            }
            if (_flayer !== Math.floor(cn.layer)) _dupCount++;
            _usedSlots[_slotKey] = true;
            // 注意: 不能用 `||` 回退, 否则 key=0 / instrument=0 / pitch=0 会被错误替换
            cleanNotes.push({
                tick: _ftick,
                layer: _flayer,
                instrument: (cn.instrument !== undefined && cn.instrument !== null) ? cn.instrument : 0,
                key: (cn.key !== undefined && cn.key !== null) ? cn.key : 33,
                velocity: cn.velocity !== undefined ? cn.velocity : 100,
                pan: cn.pan !== undefined ? cn.pan : 50,
                pitch: (cn.pitch !== undefined && cn.pitch !== null) ? cn.pitch : 0
            });
        }
        if (_negTickCount > 0 && typeof console !== 'undefined' && console.warn) {
            console.warn('[WebNBS] _writeNBS: 过滤了 ' + _negTickCount + ' 个负 tick 音符');
        }
        if (_dupCount > 0 && typeof console !== 'undefined' && console.warn) {
            console.warn('[WebNBS] _writeNBS: 检测到 ' + _dupCount + ' 个 (tick,layer) 冲突, 已自动分配新 layer');
        }

        // 按 (tick, layer) 排序
        cleanNotes.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.layer - b.layer;
        });

        // 按 tick 分组 (使用整数 tick 作为 key)
        var grouped = {};
        var tickOrder = [];
        for (var i = 0; i < cleanNotes.length; i++) {
            var n = cleanNotes[i];
            var tk = n.tick;  // 已是整数
            if (!grouped[tk]) {
                grouped[tk] = [];
                tickOrder.push(tk);
            }
            grouped[tk].push(n);
        }

        var currentTick = -1;
        for (var ti = 0; ti < tickOrder.length; ti++) {
            var tick = tickOrder[ti];
            var chord = grouped[tick];
            // NBS 的 tick jump 是 unsigned short, 单次最大 65535
            // 若相邻两个 tick 的间隔超过 65535, wShort 会溢出回绕, 导致音符错位/空洞/长度异常
            // 用「65535 跳转 + 空和弦」的合法结构桥接长间隔 (推进 tick 但不产生音符)
            var delta = tick - currentTick;
            var MAX_TICK_JUMP = 65535;
            while (delta > MAX_TICK_JUMP) {
                writer.wShort(MAX_TICK_JUMP);
                writer.wShort(0); // 空和弦: 只推进 tick, 无音符
                delta -= MAX_TICK_JUMP;
            }
            writer.wShort(delta);
            currentTick = tick;
            var currentLayer = -1;
            for (var ni = 0; ni < chord.length; ni++) {
                var n = chord[ni];
                // layer jump 是 unsigned short, 钳制到 65535 防止溢出回绕
                writer.wShort(Math.min(n.layer - currentLayer, 65535));
                currentLayer = n.layer;
                // instrument 钳制到合法范围:
                // v6 支持自定义乐器 (0-255), 音符编号 >= vanillaCount 指向 v6 自定义乐器块
                // 旧格式只能写入 vanilla 范围内的编号, 防止非法值导致其他 NBS 软件崩溃
                writer.wByte(version >= 6
                    ? _clamp(n.instrument, 0, 255)
                    : _clamp(n.instrument, 0, vanillaCount - 1));
                // key 钳制到 NBS 合法范围 [0, 87], 防止写入非法值
                writer.wByte(_clamp(n.key, 0, 87));
                // version >= 4
                writer.wByte(_clamp(n.velocity, 0, 100));
                writer.wByte(_clamp(n.pan * 2, 0, 200));
                // pitch 是 signed short, 钳制到 [-32768, 32767] 防止溢出
                writer.wSShort(_clamp(n.pitch || 0, -32768, 32767));
            }
            writer.wShort(0); // end of chord
        }
    }
    writer.wShort(0); // end of notes

    // ---- Layers ----
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        writer.wString(layer.name || '');
        // version >= 4
        writer.wByte(layer.lock ? 1 : 0);
        writer.wByte(_clamp(layer.volume, 0, 100));
        // version >= 2
        writer.wByte(_clamp(layer.stereo, 0, 200));
    }

    // ---- Custom Instruments (v6) ----
    // songData.customInstruments: 数组(长度=槽位数), 槽位 i 对应 instrument = 20+i
    // 元素: {instrument,name,file,sound,pitch,pressKey} (或缺省表示空槽)
    // 数量 = 最大使用槽位 + 1, 保证 NoteBlockStudio 序号对齐
    if (version >= 6 && songData.customInstruments
        && Array.isArray(songData.customInstruments) && songData.customInstruments.length > 0) {
        writer.wByte(songData.customInstruments.length);
        for (var cii3 = 0; cii3 < songData.customInstruments.length; cii3++) {
            var ciDef = songData.customInstruments[cii3];
            var ciName = (ciDef && (ciDef.name || '')) || '';
            var ciFile = (ciDef && (ciDef.file || ciDef.sound || '')) || '';
            var ciPitch = (ciDef && typeof ciDef.pitch === 'number') ? _clamp(ciDef.pitch, 0, 87) : 45;
            var ciPress = (ciDef && typeof ciDef.pressKey === 'number') ? _clamp(ciDef.pressKey, 0, 87) : 45;
            writer.wString(ciName);
            writer.wString(ciFile);
            writer.wByte(ciPitch);
            writer.wByte(ciPress);
        }
    } else {
        writer.wByte(0);
    }

    return new Uint8Array(writer.toArrayBuffer());
}

// ====================================================================
// @tonejs/midi 辅助: 用 @tonejs/midi 解析 MIDI，返回统一格式
// ====================================================================

function _parseMidiWithToneJS(arrayBuffer) {
    if (typeof window.__ToneMidi === 'undefined') {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[WebNBS] @tonejs/midi 未加载, 使用回退 MIDI 解析器 (精度可能降低)');
        }
        return null;
    }
    var midi = new window.__ToneMidi(arrayBuffer);
    var ppq = midi.header.ppq || 480;

    // 收集所有轨道信息
    var events = [];
    var channelFirstProgram = {};
    var tempoChangesList = [];
    var trackNames = [];
    var numTracks = midi.tracks.length;

    // tempo changes
    if (midi.header.tempos && midi.header.tempos.length > 0) {
        for (var i = 0; i < midi.header.tempos.length; i++) {
            var t = midi.header.tempos[i];
            tempoChangesList.push({
                tick: t.ticks,
                tempo_us: Math.round(60000000 / t.bpm)
            });
        }
    } else {
        tempoChangesList.push({ tick: 0, tempo_us: 500000 });
    }

    // tracks -> events
    for (var ti = 0; ti < midi.tracks.length; ti++) {
        var trk = midi.tracks[ti];
        trackNames.push(trk.name || ('Track ' + ti));

        // instrument/program (仅记录到 channelFirstProgram, 不混入 events 数组)
        var ch = trk.channel !== undefined ? trk.channel : 0;
        if (trk.instrument && trk.instrument.number !== undefined) {
            if (!channelFirstProgram.hasOwnProperty(ch)) {
                channelFirstProgram[ch] = trk.instrument.number;
            }
        }

        // notes (仅音符事件, 保持与备份版本一致, 避免污染统计/转换逻辑)
        if (trk.notes && trk.notes.length > 0) {
            for (var ni = 0; ni < trk.notes.length; ni++) {
                var n = trk.notes[ni];
                events.push({
                    tick: n.ticks,
                    channel: ch,
                    note: n.midi,
                    velocity: Math.round((n.velocity || 0.5) * 127),
                    duration_ticks: n.durationTicks || 0,
                    track: ti
                });
            }
        }
    }

    // 按 tick 排序
    events.sort(function (a, b) { return a.tick - b.tick; });

    return {
        events: events,
        channelFirstProgram: channelFirstProgram,
        tempoChangesList: tempoChangesList,
        ticksPerBeat: ppq,
        numTracks: numTracks,
        formatType: 1,
        trackNames: trackNames,
        durationTicks: midi.durationTicks || 0
    };
}

// ====================================================================
// MIDI 信息解析 (优先使用 @tonejs/midi, 回退到自包含解析器)
// ====================================================================

function _parseMidiInfo(arrayBuffer) {
    // 优先尝试 @tonejs/midi
    var toneResult = null;
    try {
        toneResult = _parseMidiWithToneJS(arrayBuffer);
    } catch (e) {
        toneResult = null;
    }

    if (toneResult) {
        return _buildMidiInfoFromToneJS(toneResult);
    }

    // 回退到自包含解析器
    return _parseMidiInfoFallback(arrayBuffer);
}

function _buildMidiInfoFromToneJS(toneData) {
    var events = toneData.events;
    var channelFirstProgram = toneData.channelFirstProgram;
    var tempoChangesList = toneData.tempoChangesList;
    var ticksPerBeat = toneData.ticksPerBeat;
    var trackNames = toneData.trackNames;

    var channelNotes = {};
    var channelNoteCount = {};
    var channelMinNote = {};
    var channelMaxNote = {};
    var percussionNotes = {};
    var trackInfoList = [];
    var totalNotes = 0;
    var minTick = Infinity;
    var maxTick = 0;

    // 按轨道分组统计
    var trackEventCount = {};
    var trackNoteCount = {};
    var trackChannelsSet = {};

    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
        if (ev.type && ev.type !== 'note') continue;
        // 防御: 跳过无效音符
        if (ev.note === undefined || ev.note === null) continue;

        var ch = ev.channel;
        var note = ev.note;

        totalNotes++;
        channelNotes[ch] = true;
        channelNoteCount[ch] = (channelNoteCount[ch] || 0) + 1;
        if (!channelMinNote.hasOwnProperty(ch) || note < channelMinNote[ch]) channelMinNote[ch] = note;
        if (!channelMaxNote.hasOwnProperty(ch) || note > channelMaxNote[ch]) channelMaxNote[ch] = note;
        if (ev.tick < minTick) minTick = ev.tick;
        if (ev.tick > maxTick) maxTick = ev.tick;
        if (ch === 9) percussionNotes[note] = true;

        trackEventCount[ev.track] = (trackEventCount[ev.track] || 0) + 1;
        trackNoteCount[ev.track] = (trackNoteCount[ev.track] || 0) + 1;
        if (!trackChannelsSet[ev.track]) trackChannelsSet[ev.track] = {};
        trackChannelsSet[ev.track][ch] = true;
    }

    // 构建轨道信息
    for (var t = 0; t < trackNames.length; t++) {
        if (trackEventCount[t] && trackEventCount[t] > 0) {
            var sortedChannels = [];
            for (var ch2 in trackChannelsSet[t]) {
                if (trackChannelsSet[t].hasOwnProperty(ch2)) {
                    sortedChannels.push(parseInt(ch2, 10));
                }
            }
            sortedChannels.sort(function (a, b) { return a - b; });

            trackInfoList.push({
                index: t,
                name: trackNames[t],
                note_count: trackNoteCount[t] || 0,
                event_count: trackEventCount[t] || 0,
                channels: sortedChannels
            });
        }
    }

    // 构建通道信息
    var channels = [];
    var maxChannel = 0;
    for (var ch3 in channelNotes) { if (channelNotes.hasOwnProperty(ch3)) { var cn = parseInt(ch3, 10); if (cn > maxChannel) maxChannel = cn; } }
    for (var ch4 in channelFirstProgram) { if (channelFirstProgram.hasOwnProperty(ch4)) { var cn2 = parseInt(ch4, 10); if (cn2 > maxChannel) maxChannel = cn2; } }

    for (var c = 0; c <= maxChannel; c++) {
        if (channelNotes.hasOwnProperty(c) || channelFirstProgram.hasOwnProperty(c)) {
            var prog = channelFirstProgram.hasOwnProperty(c) ? channelFirstProgram[c] : 0;
            var progName, defaultIns, defaultOctave;
            if (prog < GM_PROGRAM_TABLE.length) {
                progName = GM_PROGRAM_TABLE[prog][0];
                defaultIns = GM_PROGRAM_TABLE[prog][1];
                defaultOctave = GM_PROGRAM_TABLE[prog][2];
            } else {
                progName = 'Unknown'; defaultIns = 0; defaultOctave = 0;
            }
            channels.push({
                channel: c, program: prog, program_name: progName,
                default_instrument: defaultIns, default_octave: defaultOctave,
                is_percussion: c === 9,
                note_count: channelNoteCount[c] || 0,
                min_note: channelMinNote.hasOwnProperty(c) ? channelMinNote[c] : null,
                max_note: channelMaxNote.hasOwnProperty(c) ? channelMaxNote[c] : null
            });
        }
    }

    // 打击乐信息
    var percussion = [];
    var sortedPercNotes = [];
    for (var pn in percussionNotes) { if (percussionNotes.hasOwnProperty(pn)) sortedPercNotes.push(parseInt(pn, 10)); }
    sortedPercNotes.sort(function (a, b) { return a - b; });

    for (var pi = 0; pi < sortedPercNotes.length; pi++) {
        var pnote = sortedPercNotes[pi];
        var pName, pDefaultIns, pDefaultPitch;
        if (DRUM_NOTE_TABLE[pnote]) {
            pName = DRUM_NOTE_TABLE[pnote][0];
            pDefaultIns = DRUM_NOTE_TABLE[pnote][1];
            pDefaultPitch = DRUM_NOTE_TABLE[pnote][2] + 33;
        } else {
            pName = 'Note ' + pnote; pDefaultIns = 0;
            pDefaultPitch = _clamp(pnote - 21, 0, 87);
        }
        percussion.push({ note: pnote, name: pName, default_instrument: pDefaultIns, default_pitch: pDefaultPitch });
    }

    // 时长
    var tempoUs = (tempoChangesList.length > 0) ? tempoChangesList[0].tempo_us : 500000;
    var durationSeconds = 0;
    if (maxTick > 0 && tempoUs > 0) {
        var realMinTick = minTick !== Infinity ? minTick : 0;
        durationSeconds = (maxTick - realMinTick) / ticksPerBeat * (tempoUs / 1000000.0);
    }
    var hours = Math.floor(durationSeconds / 3600);
    var minutes = Math.floor((durationSeconds % 3600) / 60);
    var seconds = Math.floor(durationSeconds % 60);
    var durationStr = hours > 0
        ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
        : minutes + ':' + String(seconds).padStart(2, '0');

    return {
        ticks_per_beat: ticksPerBeat,
        track_count: trackInfoList.length,
        total_notes: totalNotes,
        total_events: totalNotes, // @tonejs/midi 不暴露非音符事件数, 用音符数近似
        duration: durationStr,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        type: 'Type 1',
        tracks: trackInfoList,
        channels: channels,
        percussion: percussion,
        tempo_us: tempoUs,
        min_tick: minTick !== Infinity ? minTick : 0,
        max_tick: maxTick,
        _rawEvents: events,  // 供 updateChannelOctaveForMode 使用 (仅音符事件)
        _channelFirstProgram: channelFirstProgram
    };
}

// 原自包含解析器 (作为 @tonejs/midi 不可用时的回退)
function _parseMidiInfoFallback(arrayBuffer) {
    var reader = new _MidiReader(arrayBuffer);

    // ---- MThd 头 ----
    var header = reader.readN(4);
    var headerStr = _decodeLatin1(header);
    if (headerStr !== 'MThd') {
        throw new Error('无效的 MIDI 文件：缺少 MThd 头');
    }

    reader.readUint32(); // header_len (通常 6)
    var formatType = reader.readUint16();
    var numTracks = reader.readUint16();
    var ticksPerBeat = reader.readUint16();

    if (ticksPerBeat === 0) ticksPerBeat = 480;

    // ---- 逐轨道解析 ----
    var channelPrograms = {};       // channel -> program
    var channelFirstProgram = {};   // channel -> first program
    var channelNotes = {};          // channel -> true (有音符)
    var channelNoteCount = {};      // channel -> note count
    var channelMinNote = {};        // channel -> min note
    var channelMaxNote = {};        // channel -> max note
    var percussionNotes = {};       // channel 9 上的 MIDI note -> true
    var trackInfoList = [];
    var tempoUs = 500000;
    var minTick = Infinity;
    var maxTick = 0;
    var events = [];                // 音符事件列表 (供 _rawEvents 使用, calculateOptimalOffset 依赖)
    var totalNotes = 0;
    var totalEvents = 0;

    for (var trackNum = 0; trackNum < numTracks; trackNum++) {
        var trackHeader = reader.readN(4);
        var trackHeaderStr = _decodeLatin1(trackHeader);
        if (trackHeaderStr !== 'MTrk') {
            continue;
        }

        var trackLen = reader.readUint32();
        var trackEnd = reader.pos + trackLen;
        var currentTick = 0;
        var lastEventType = null;
        var trackEventCount = 0;
        var trackNoteCount = 0;
        var trackName = 'Track ' + trackNum;
        var trackChannelsSet = {};

        try {
            while (reader.pos < trackEnd) {
                var delta = reader.readVarLen();
                currentTick += delta;

                var statusByte = reader.readByte();

                if (statusByte === 0xFF) {
                    // Meta event
                    var metaType = reader.readByte();
                    var metaLen = reader.readVarLen();
                    var metaData = reader.readN(metaLen);

                    if (metaType === 0x51 && metaData.length >= 3) {
                        tempoUs = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                    } else if (metaType === 0x03) {
                        trackName = _decodeLatin1(metaData).replace(/\x00+$/, '');
                    }
                } else if (statusByte === 0xF0 || statusByte === 0xF7) {
                    // SysEx
                    var sysexLen = reader.readVarLen();
                    reader.readN(sysexLen);
                } else if (statusByte < 0x80) {
                    // Running status
                    if (lastEventType !== null) {
                        reader.pos--; // 回退 1 字节
                        statusByte = lastEventType;
                    } else {
                        continue;
                    }
                } else {
                    lastEventType = statusByte;
                }

                var eventType = (statusByte & 0xF0) >> 4;
                var channel = statusByte & 0x0F;

                if (eventType === 0x9) {
                    // Note On
                    var note = reader.readByte();
                    var velocity = reader.readByte();
                    trackEventCount++;
                    if (velocity > 0) {
                        trackNoteCount++;
                        totalNotes++;
                        channelNotes[channel] = true;
                        trackChannelsSet[channel] = true;
                        channelNoteCount[channel] = (channelNoteCount[channel] || 0) + 1;
                        if (!channelMinNote.hasOwnProperty(channel) || note < channelMinNote[channel]) {
                            channelMinNote[channel] = note;
                        }
                        if (!channelMaxNote.hasOwnProperty(channel) || note > channelMaxNote[channel]) {
                            channelMaxNote[channel] = note;
                        }
                        if (currentTick < minTick) minTick = currentTick;
                        if (currentTick > maxTick) maxTick = currentTick;
                        if (channel === 9) {
                            percussionNotes[note] = true;
                        }
                        // 关键: 在 Note On 时直接收集 event (与 tonejs 路径一致)
                        // 不依赖 Note Off 配对, 避免某些 MIDI 文件缺少 Note Off 时 events 不完整
                        // calculateOptimalOffset 只用 note 值, 不需要 duration_ticks 准确
                        events.push({
                            tick: currentTick,
                            channel: channel,
                            note: note,
                            velocity: velocity,
                            duration_ticks: 0,
                            track: trackNum
                        });
                    }
                    // velocity=0 视为 Note Off, 但音符已在 Note On 时收集, 此处无需处理
                } else if (eventType === 0x8) {
                    // Note Off - 音符已在 Note On 时收集, 此处只跳过数据
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xC) {
                    // Program Change
                    var program = reader.readByte();
                    trackEventCount++;
                    if (!channelFirstProgram.hasOwnProperty(channel)) {
                        channelFirstProgram[channel] = program;
                    }
                    channelPrograms[channel] = program;
                } else if (eventType === 0xA) {
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xB) {
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xD) {
                    reader.readN(1);
                    trackEventCount++;
                } else if (eventType === 0xE) {
                    reader.readN(2);
                    trackEventCount++;
                }
            }
        } catch (e) {
            throw new Error('MIDI 文件格式损坏或数据不完整 (轨道 ' + trackNum + ')');
        }

        totalEvents += trackEventCount;

        if (trackEventCount > 0) {
            var sortedChannels = [];
            for (var ch in trackChannelsSet) {
                if (trackChannelsSet.hasOwnProperty(ch)) {
                    sortedChannels.push(parseInt(ch, 10));
                }
            }
            sortedChannels.sort(function (a, b) { return a - b; });

            trackInfoList.push({
                index: trackNum,
                name: trackName,
                note_count: trackNoteCount,
                event_count: trackEventCount,
                channels: sortedChannels
            });
        }
    }

    // 按 tick 排序 events (与 _parseMidiWithToneJS 保持一致)
    events.sort(function (a, b) { return a.tick - b.tick; });

    // ---- 构建通道信息 ----
    var channels = [];
    var maxChannel = 0;
    for (var ch in channelNotes) {
        if (channelNotes.hasOwnProperty(ch)) {
            var chNum = parseInt(ch, 10);
            if (chNum > maxChannel) maxChannel = chNum;
        }
    }
    for (var ch2 in channelFirstProgram) {
        if (channelFirstProgram.hasOwnProperty(ch2)) {
            var chNum2 = parseInt(ch2, 10);
            if (chNum2 > maxChannel) maxChannel = chNum2;
        }
    }

    for (var c = 0; c <= maxChannel; c++) {
        if (channelNotes.hasOwnProperty(c) || channelFirstProgram.hasOwnProperty(c)) {
            var prog = channelFirstProgram.hasOwnProperty(c) ? channelFirstProgram[c] : 0;
            var progName, defaultIns, defaultOctave;
            if (prog < GM_PROGRAM_TABLE.length) {
                progName = GM_PROGRAM_TABLE[prog][0];
                defaultIns = GM_PROGRAM_TABLE[prog][1];
                defaultOctave = GM_PROGRAM_TABLE[prog][2];
            } else {
                progName = 'Unknown';
                defaultIns = 0;
                defaultOctave = 0;
            }

            channels.push({
                channel: c,
                program: prog,
                program_name: progName,
                default_instrument: defaultIns,
                default_octave: defaultOctave,
                is_percussion: c === 9,
                note_count: channelNoteCount[c] || 0,
                min_note: channelMinNote.hasOwnProperty(c) ? channelMinNote[c] : null,
                max_note: channelMaxNote.hasOwnProperty(c) ? channelMaxNote[c] : null
            });
        }
    }

    // ---- 构建打击乐信息 ----
    var percussion = [];
    var sortedPercNotes = [];
    for (var pn in percussionNotes) {
        if (percussionNotes.hasOwnProperty(pn)) {
            sortedPercNotes.push(parseInt(pn, 10));
        }
    }
    sortedPercNotes.sort(function (a, b) { return a - b; });

    for (var pi = 0; pi < sortedPercNotes.length; pi++) {
        var note = sortedPercNotes[pi];
        var pName, pDefaultIns, pDefaultPitch;
        if (DRUM_NOTE_TABLE[note]) {
            var drumInfo = DRUM_NOTE_TABLE[note];
            pName = drumInfo[0];
            pDefaultIns = drumInfo[1];
            // DRUM_NOTE_TABLE 第 3 项是 NBS_key - 33, 需 +33 还原
            pDefaultPitch = drumInfo[2] + 33;
        } else {
            pName = 'Note ' + note;
            pDefaultIns = 0;
            pDefaultPitch = _clamp(note - 21, 0, 87);
        }
        percussion.push({
            note: note,
            name: pName,
            default_instrument: pDefaultIns,
            default_pitch: pDefaultPitch
        });
    }

    // ---- 时长计算 ----
    var durationSeconds = 0;
    if (maxTick > 0 && tempoUs > 0) {
        var realMinTick = minTick !== Infinity ? minTick : 0;
        durationSeconds = (maxTick - realMinTick) / ticksPerBeat * (tempoUs / 1000000.0);
    }
    var hours = Math.floor(durationSeconds / 3600);
    var minutes = Math.floor((durationSeconds % 3600) / 60);
    var seconds = Math.floor(durationSeconds % 60);
    var durationStr;
    if (hours > 0) {
        durationStr = hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    } else {
        durationStr = minutes + ':' + String(seconds).padStart(2, '0');
    }

    return {
        ticks_per_beat: ticksPerBeat,
        track_count: trackInfoList.length,
        total_notes: totalNotes,
        total_events: totalEvents,
        duration: durationStr,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        type: formatType === 0 ? 'Type 0' : (formatType === 1 ? 'Type 1' : 'Type 2'),
        tracks: trackInfoList,
        channels: channels,
        percussion: percussion,
        tempo_us: tempoUs,
        min_tick: minTick !== Infinity ? minTick : 0,
        max_tick: maxTick,
        _rawEvents: events,  // 供 updateChannelOctaveForMode 使用 (仅音符事件)
        _channelFirstProgram: channelFirstProgram
    };
}

// ====================================================================
// MIDI 导入转换 (复刻 midi_handler.py import_midi)
// ====================================================================

function _convertMidiToNBS(arrayBuffer, settings) {
    settings = settings || {};

    // ---- 参数提取 (复刻 api_client.js 的映射) ----
    var channelInstruments = settings.channel_instruments || {};
    var channelOctaves = settings.channel_octaves || {};
    var channelKeys = settings.channel_keys || {};
    var percussionInstruments = settings.percussion_instruments || {};
    var percussionPitches = settings.percussion_pitches || {};
    var removeSilent = settings.remove_silent !== false;
    var nameLayers = settings.name_layers !== false;
    var nameAfterPatches = settings.name_after_patches !== false;
    var tempoChanges = settings.tempo_changes === true;
    var keepOctave = settings.keep_octave !== false;
    var readVelocity = settings.read_velocity !== false;
    var precision = settings.precision !== undefined ? settings.precision : 1;
    var keepNoteLength = settings.keep_note_length || 'none';
    // 消除重复音符: 删除同一时间 (tick) 中音色与音调完全相同的音符, 减少总音符数
    var dedupeNotes = settings.dedupe_notes === true;
    var snapEnabled = settings.snap_enabled === true;
    var snapBeat = settings.snap_beat !== undefined ? settings.snap_beat : 4;
    // 音域处理模式: 0=不应用, 1=单独音符归一法, 2=整体八度偏移法, 3=整体半音偏移法
    var octaveMode = settings.octave_mode !== undefined ? parseInt(settings.octave_mode) : 1;
    // 智能音色替代开关 (仅模式 2/3 下有效, 默认开启)
    // 模式 0: 完全不处理 (不替代/不偏移/不归一)
    // 模式 1: 单独归一, 无需替代
    var smartSubstituteEnabled = settings.smart_substitute_enabled !== false; // 默认 true
    if (octaveMode !== 2 && octaveMode !== 3) {
        smartSubstituteEnabled = false; // 模式 0/1 强制关闭
    }
    // 音色替代配置
    // substitute_tracks 语义:
    //   null/undefined = 全部应用 (substituteTracksSet 保持 null, trackInScope 恒为 true)
    //   [] (空数组)    = 不应用任何 track (substituteTracksSet = {}, trackInScope 恒为 false)
    //   [0, 2, ...]    = 只对指定 track 应用
    var substituteConfig = settings.substitute_config || {};
    var substituteTracks = settings.substitute_tracks;
    var substituteTracksSet = null;
    if (substituteTracks !== null && substituteTracks !== undefined) {
        substituteTracksSet = {};
        for (var st = 0; st < substituteTracks.length; st++) {
            substituteTracksSet[parseInt(substituteTracks[st], 10)] = true;
        }
    }
    // 强制折叠: 全局开关, 勾选后替代失败的音符会被强制折叠到音域内
    var forceFoldEnabled = settings.force_fold_enabled || false;
    // allowPitchOffset 已移除：新模式下偏移由模式本身决定

    // timbre_fitting / percussion_fitting 提取 (复刻 api_client.js)
    var fitting = settings.timbre_fitting || {};
    var timbreFitting = fitting.channels || fitting || {};
    var percussionFitting = fitting.drums || {};

    var sustainTracks = settings.sustain_tracks || [];
    var excludedTracks = settings.excluded_tracks || [];

    // 转 Set
    var excludedTracksSet = {};
    for (var i = 0; i < excludedTracks.length; i++) {
        excludedTracksSet[parseInt(excludedTracks[i], 10)] = true;
    }
    var sustainTracksSet = {};
    for (var i = 0; i < sustainTracks.length; i++) {
        sustainTracksSet[parseInt(sustainTracks[i], 10)] = true;
    }

    // ---- 优先使用 @tonejs/midi 解析 ----
    var toneData = null;
    try {
        toneData = _parseMidiWithToneJS(arrayBuffer);
    } catch (e) {
        toneData = null;
    }

    var events = [];
    var tempoMicroseconds = 500000;
    var initialTempoUs = 500000;
    var tempoChangesList = [];
    var channelFirstProgram = {};
    var ticksPerBeat = 480;
    var numTracks = 0;

    // ---- 为未配置的通道填充默认值 ----
    for (var ch = 0; ch < 16; ch++) {
        if (!_has(channelInstruments, ch)) channelInstruments[ch] = null;
        if (!_has(channelOctaves, ch)) channelOctaves[ch] = 0;
        if (!_has(channelKeys, ch)) channelKeys[ch] = 0;
    }

    if (toneData) {
        // 使用 @tonejs/midi 的解析结果
        events = toneData.events;
        channelFirstProgram = toneData.channelFirstProgram;
        tempoChangesList = toneData.tempoChangesList;
        ticksPerBeat = toneData.ticksPerBeat;
        numTracks = toneData.numTracks;

        // 过滤排除的轨道
        events = events.filter(function(ev) { return !excludedTracksSet[ev.track]; });

        // tempo
        if (tempoChangesList.length > 0) {
            initialTempoUs = tempoChangesList[0].tempo_us;
            tempoMicroseconds = initialTempoUs;
        }
    } else {
        // 回退到自包含解析器
        var reader = new _MidiReader(arrayBuffer);
        var header = reader.readN(4);
        var headerStr = _decodeLatin1(header);
        if (headerStr !== 'MThd') {
            throw new Error('无效的 MIDI 文件：缺少 MThd 头');
        }

        reader.readUint32(); // header_len
        var formatType = reader.readUint16();
        numTracks = reader.readUint16();
        ticksPerBeat = reader.readUint16();
        if (ticksPerBeat === 0) ticksPerBeat = 480;

        var activeNotes = {};       // "channel,note" -> {tick, velocity}

    for (var trackNum = 0; trackNum < numTracks; trackNum++) {
        var trackHeader = reader.readN(4);
        var trackHdrStr = _decodeLatin1(trackHeader);
        if (trackHdrStr !== 'MTrk') continue;

        var trackLen = reader.readUint32();
        var trackEnd = reader.pos + trackLen;

        // 跳过排除的轨道
        if (excludedTracksSet[trackNum]) {
            reader.pos = trackEnd;
            continue;
        }

        var currentTick = 0;
        var lastEventType = null;

        try {
            while (reader.pos < trackEnd) {
                var delta = reader.readVarLen();
                currentTick += delta;

                var statusByte = reader.readByte();

                if (statusByte === 0xFF) {
                    // Meta event
                    var metaType = reader.readByte();
                    var metaLen = reader.readVarLen();
                    var metaData = reader.readN(metaLen);

                    if (metaType === 0x51 && metaData.length >= 3) {
                        tempoMicroseconds = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                        if (tempoChangesList.length === 0) {
                            initialTempoUs = tempoMicroseconds;
                        }
                        tempoChangesList.push({
                            tick: currentTick,
                            tempo_us: tempoMicroseconds
                        });
                    }
                } else if (statusByte === 0xF0 || statusByte === 0xF7) {
                    // SysEx
                    var sysexLen = reader.readVarLen();
                    reader.readN(sysexLen);
                } else if (statusByte < 0x80) {
                    // Running status
                    if (lastEventType !== null) {
                        reader.pos--;
                        statusByte = lastEventType;
                    } else {
                        continue;
                    }
                } else {
                    lastEventType = statusByte;
                }

                var eventType = (statusByte & 0xF0) >> 4;
                var channel = statusByte & 0x0F;

                if (eventType === 0x9) {
                    // Note On
                    var note = reader.readByte();
                    var velocity = reader.readByte();
                    if (velocity > 0) {
                        var key = channel + ',' + note;
                        activeNotes[key] = {
                            tick: currentTick,
                            velocity: velocity,
                            track: trackNum
                        };
                    } else {
                        // velocity=0 = Note Off
                        var key2 = channel + ',' + note;
                        if (activeNotes[key2]) {
                            var startInfo = activeNotes[key2];
                            delete activeNotes[key2];
                            events.push({
                                tick: startInfo.tick,
                                channel: channel,
                                note: note,
                                velocity: startInfo.velocity,
                                duration_ticks: currentTick - startInfo.tick,
                                track: trackNum
                            });
                        }
                    }
                } else if (eventType === 0x8) {
                    // Note Off
                    var noteOff = reader.readByte();
                    reader.readByte(); // release velocity (ignored)
                    var key3 = channel + ',' + noteOff;
                    if (activeNotes[key3]) {
                        var startInfo2 = activeNotes[key3];
                        delete activeNotes[key3];
                        events.push({
                            tick: startInfo2.tick,
                            channel: channel,
                            note: noteOff,
                            velocity: startInfo2.velocity,
                            duration_ticks: currentTick - startInfo2.tick,
                            track: trackNum
                        });
                    }
                } else if (eventType === 0xC) {
                    // Program Change
                    var program = reader.readByte();
                    if (!channelFirstProgram.hasOwnProperty(channel)) {
                        channelFirstProgram[channel] = program;
                    }
                } else if (eventType === 0xA) {
                    reader.readN(2);
                } else if (eventType === 0xB) {
                    reader.readN(2);
                } else if (eventType === 0xD) {
                    reader.readN(1);
                } else if (eventType === 0xE) {
                    reader.readN(2);
                }
            }
        } catch (e) {
            throw new Error('MIDI 文件格式损坏或数据不完整 (轨道 ' + trackNum + ')');
        }
    }

    // ---- 处理未关闭的 Note On ----
    for (var ak in activeNotes) {
        if (activeNotes.hasOwnProperty(ak)) {
            var parts = ak.split(',');
            var startInfo3 = activeNotes[ak];
            events.push({
                tick: startInfo3.tick,
                channel: parseInt(parts[0], 10),
                note: parseInt(parts[1], 10),
                velocity: startInfo3.velocity,
                duration_ticks: 1,
                track: startInfo3.track
            });
        }
    }
    } // end of else (fallback parser)

    // ---- 空 song ----
    var songTempo = 20;
    if (events.length === 0) {
        return {
            name: 'Imported MIDI',
            song_name: 'Imported MIDI',
            author: '',
            original_author: '',
            description: '',
            tempo: songTempo,
            auto_save: false,
            auto_save_minutes: 0,
            time_signature: 4,
            length: 0,
            layers: [],
            note_count: 0,
            notes: [],
            layer_channel_map: {}
        };
    }

    // ---- 计算 tick 范围 ----
    var minTick = events[0].tick;
    var maxTick = events[0].tick;
    for (var i = 0; i < events.length; i++) {
        if (events[i].tick < minTick) minTick = events[i].tick;
        if (events[i].tick > maxTick) maxTick = events[i].tick;
    }

    // ---- 异常远端音符检测与过滤 ----
    // 某些 MIDI 文件包含位于极远位置的异常音符（可能因编辑器残留、未关闭的 Note On、
    // 或损坏的 delta time 导致），会使 maxTick 异常巨大（如 3 亿+ MIDI tick ≈ 92 小时）。
    // 这会导致 maxNbsTick 膨胀，导出的 NBS 文件出现大面积空白（tick jump 桥接产生
    // 数十个 65535 空跳转）。使用 95% 分位数检测并过滤这类异常音符。
    if (events.length > 50) {
        var _tickVals = [];
        for (var _i = 0; _i < events.length; _i++) {
            _tickVals.push(events[_i].tick);
        }
        _tickVals.sort(function (a, b) { return a - b; });
        var _p95Idx = Math.floor(_tickVals.length * 0.95);
        var _p95 = _tickVals[_p95Idx];
        // 仅当 maxTick 远超 P95（>5 倍）且 P95 > 0 时触发过滤
        if (_p95 > 0 && maxTick > _p95 * 5) {
            var _filterMax = _p95 * 2; // 保留到 P95 的 2 倍，留出正常尾部空间
            var _origCount = events.length;
            var _filteredEvents = [];
            for (var _j = 0; _j < events.length; _j++) {
                if (events[_j].tick <= _filterMax) _filteredEvents.push(events[_j]);
            }
            // 仅当过滤后仍有足够音符时才应用
            if (_filteredEvents.length >= _origCount * 0.5) {
                events = _filteredEvents;
                var _removed = _origCount - events.length;
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[WebNBS] 检测到异常远端音符，已过滤 ' + _removed +
                        ' 个 (P95=' + _p95 + ', 阈值=' + _filterMax +
                        ', 原 maxTick=' + maxTick + ', 新 maxTick=' +
                        events[events.length - 1].tick + ')');
                }
                // 重新计算 minTick / maxTick
                minTick = events[0].tick;
                maxTick = events[0].tick;
                for (var _k = 0; _k < events.length; _k++) {
                    if (events[_k].tick < minTick) minTick = events[_k].tick;
                    if (events[_k].tick > maxTick) maxTick = events[_k].tick;
                }
            }
        }
    }

    // ---- delta_per_tick ----
    var precisionMap = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
    var precVal = precisionMap[precision] !== undefined ? precisionMap[precision] : 1;
    var deltaPerTick = (ticksPerBeat & 0x7FFF) / 4.0 / (precVal + 1);

    // ---- 移除开头静音 ----
    var silentOffset = removeSilent ? minTick : 0;

    // ---- 最大 NBS tick ----
    var maxNbsTick = Math.floor((maxTick - silentOffset) / deltaPerTick);

    // ---- 吸附网格 ----
    var nbsTicksPerGrid = 1;
    if (snapEnabled && snapBeat > 0) {
        var midiTicksPerGrid = ticksPerBeat * 4.0 / snapBeat;
        nbsTicksPerGrid = Math.max(1, Math.round(midiTicksPerGrid / deltaPerTick));
    }

    // ---- 计算 TPS ----
    // NBS tempo 存储为 tempo * 100 的 unsigned short, 格式上限 = 65535/100 = 655.35 TPS
    // 通过积分所有 tempo 变化计算实际 MIDI 时长, 避免仅用初始 tempo 导致的巨大偏差
    if (maxNbsTick > 0 && initialTempoUs > 0 && maxTick > 0) {
        var midiSonglengthSeconds = _calcMidiDurationSeconds(
            tempoChangesList, silentOffset, maxTick, ticksPerBeat, initialTempoUs
        );
        var enda = parseFloat(maxNbsTick);
        if (midiSonglengthSeconds > 0) {
            var tempoRaw = enda / midiSonglengthSeconds;
            songTempo = Math.max(5.0, Math.min(655.0, tempoRaw));
            songTempo = Math.round(songTempo);
        }
    }

    // ---- 计算每个 channel 需要的层数 ----
    // 注意: 必须与 Phase 3 (音符转换) 的 layer 分配逻辑一致,
    // 包括音色拟合 slot 和延音 (sustain) 的额外 layer 占用,
    // 否则 channelLayersNeeded 会偏小, 导致音符溢出到下一个 channel 的 layer 区间
    var channelUsedTicks = {}; // "ch,nbsTick" -> count
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        var ch = e.channel;

        // 检查是否忽略该通道 (与 Phase 3 过滤逻辑一致)
        if (ch === 9) {
            var pInst = _has(percussionInstruments, e.note) ? percussionInstruments[e.note] : -1;
            if (pInst === -1) continue;
        } else {
            var inst = _has(channelInstruments, ch) ? channelInstruments[ch] : null;
            if (inst === -1) continue;
            if (inst === null) {
                if (timbreFitting && _has(timbreFitting, ch)) {
                    if (timbreFitting[ch][0] < 0) continue;
                }
                // 无拟合也继续, 后续用 GM 默认映射
            }
        }

        var nbsTickRaw = (e.tick - silentOffset) / deltaPerTick;
        var nbsTick;
        if (nbsTicksPerGrid > 1) {
            nbsTick = Math.floor(Math.round(nbsTickRaw / nbsTicksPerGrid) * nbsTicksPerGrid);
        } else {
            nbsTick = Math.floor(nbsTickRaw);
        }

        // 计算该音符的拟合 slot 数量 (与 Phase 3 一致: 每个 slot 也会占用一个 layer)
        var fitSlotCount = 0;
        if (ch === 9) {
            if (percussionFitting && _has(percussionFitting, e.note)) {
                var pFitSlots = percussionFitting[e.note];
                for (var pfi = 1; pfi < pFitSlots.length; pfi++) {
                    if (pFitSlots[pfi] >= 0) fitSlotCount++;
                }
            }
        } else {
            if (timbreFitting && _has(timbreFitting, ch)) {
                var tFitSlots = timbreFitting[ch];
                for (var tfi = 1; tfi < tFitSlots.length; tfi++) {
                    if (tFitSlots[tfi] >= 0) fitSlotCount++;
                }
            }
        }

        // 该音符在本 tick 需要的 layer 数 = 1 (自身) + fitSlotCount (拟合 slot)
        var layerUnits = 1 + fitSlotCount;
        var ctKey = ch + ',' + nbsTick;
        channelUsedTicks[ctKey] = (channelUsedTicks[ctKey] || 0) + layerUnits;

        // 如果需要保持音符长度, 后续 tick 也需要 layer (与 Phase 3 一致)
        var shouldSustainPre = false;
        if (keepNoteLength === 'all') {
            shouldSustainPre = true;
        } else if (keepNoteLength === 'sustain') {
            shouldSustainPre = !!sustainTracksSet[e.track || 0];
        }
        if (shouldSustainPre) {
            var preDurationTicks = e.duration_ticks || 1;
            var preNoteLength = Math.max(2, Math.floor(preDurationTicks / deltaPerTick));
            for (var preSt = 1; preSt < preNoteLength; preSt++) {
                var preTargetTick = nbsTick + preSt;
                if (preTargetTick > maxNbsTick + 100) break;
                var preKey = ch + ',' + preTargetTick;
                channelUsedTicks[preKey] = (channelUsedTicks[preKey] || 0) + layerUnits;
            }
        }
    }

    var channelLayersNeeded = {};
    for (var ctKey2 in channelUsedTicks) {
        if (channelUsedTicks.hasOwnProperty(ctKey2)) {
            var ctParts = ctKey2.split(',');
            var ctCh = parseInt(ctParts[0], 10);
            var ctCount = channelUsedTicks[ctKey2];
            if (!channelLayersNeeded.hasOwnProperty(ctCh)) {
                channelLayersNeeded[ctCh] = 0;
            }
            if (ctCount > channelLayersNeeded[ctCh]) {
                channelLayersNeeded[ctCh] = ctCount;
            }
        }
    }

    // ---- 构建 channel -> 起始 layer 映射 ----
    var channelLayerOffset = {};
    var currentLayer = 0;
    if (tempoChanges) {
        currentLayer = 1; // 为速度变化器预留 layer 0
    }
    var maxChannel = 0;
    for (var i = 0; i < events.length; i++) {
        if (events[i].channel > maxChannel) maxChannel = events[i].channel;
    }
    for (var ch2 = 0; ch2 <= maxChannel; ch2++) {
        channelLayerOffset[ch2] = currentLayer;
        currentLayer += (channelLayersNeeded[ch2] || 1);
    }

    // ---- 转换音符 ----
    var songNotes = [];
    var layerCounters = {}; // "ch,nbsTick" -> used count

    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
        if (e.type && e.type !== 'note') continue;
        // 防御: 跳过无效音符
        if (e.note === undefined || e.note === null) continue;

        var nbsTickRaw = (e.tick - silentOffset) / deltaPerTick;
        var nbsTick;
        if (nbsTicksPerGrid > 1) {
            nbsTick = Math.floor(Math.round(nbsTickRaw / nbsTicksPerGrid) * nbsTicksPerGrid);
        } else {
            nbsTick = Math.floor(nbsTickRaw);
        }
        var ch = e.channel;
        var midiNote = e.note;
        var trackIdx = e.track || 0;

        var instrument, nbsKey;

        if (ch === 9) {
            // 鼓组
            var drumFitting = _has(percussionFitting, midiNote) ? percussionFitting[midiNote] : null;
            if (drumFitting && drumFitting[0] >= 0) {
                instrument = drumFitting[0];
            } else {
                var drumInst = _has(percussionInstruments, midiNote) ? percussionInstruments[midiNote] : -1;
                if (drumInst === -1) continue;
                instrument = drumInst;
            }
            // 音高
            if (_has(percussionPitches, midiNote)) {
                nbsKey = percussionPitches[midiNote];
            } else {
                var drumInfo = DRUM_NOTE_TABLE[midiNote];
                if (drumInfo) {
                    nbsKey = drumInfo[2] + 33;
                } else {
                    nbsKey = _clamp(midiNote - 21, 0, 87);
                }
            }
        } else {
            // ---- 旋律通道 ----
            var inst = channelInstruments[ch];
            if (inst === -1) continue;  // 用户设置为"不导入"

            // 自动模式: 优先用拟合, 否则用 GM 表
            if (inst === null || inst === undefined) {
                if (timbreFitting && _has(timbreFitting, ch)) {
                    var fitSlots = timbreFitting[ch];
                    inst = (fitSlots && fitSlots[0] >= 0) ? fitSlots[0] : 0;
                } else {
                    var prog = channelFirstProgram ? (channelFirstProgram[ch] || 0) : 0;
                    inst = GM_PROGRAM_TABLE[prog] ? GM_PROGRAM_TABLE[prog][1] : 0;
                }
            }

            var octaveOffset = channelOctaves[ch] || 0;
            var keyOffset = channelKeys[ch] || 0;

            // ==== 新流水线 (补充补丁): 先替代, 后偏移, 有条件跳过 ====
            // 模式 0: 完全不处理 (不替代/不偏移/不归一), 直接原样输出
            // 模式 1: 单独音符归一法 (逐音符 ±12 取模, 不替代)
            // 模式 2/3: 阶段1(替代优先) → 阶段2(检查残留) → 阶段3(条件偏移) → 阶段4(兜底)
            //   - 偏移量由 main.js calculateOptimalOffsetWithSubstitute 预计算:
            //     替代后全部合规 → offset=0 (跳过偏移)
            //     替代后仍有残留 → 基于替代后 MIDI 计算最优偏移
            var processedMidi;

            if (octaveMode === 0) {
                // 模式 0: 完全不处理 (新规范: 替代/偏移/归一均跳过)
                processedMidi = midiNote;
            } else if (octaveMode === 1) {
                // 模式 1: 单独音符归一法 (保持原逻辑, 不替代)
                // 目标: 让 processedMidi 落入 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                processedMidi = midiNote + 12 * octaveOffset + keyOffset;
                while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
            } else {
                // 模式 2/3: 先替代, 后偏移
                // 阶段1: 在原始 midiNote 上尝试替代 (不加偏移)
                // 替代触发条件: processedMidi 超出 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                processedMidi = midiNote;

                if (smartSubstituteEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                    // 检查 track 是否在替代作用域
                    var trackInScope = true;
                    if (substituteTracksSet) trackInScope = !!substituteTracksSet[trackIdx];

                    if (trackInScope && substituteConfig) {
                        // 链条式替代: 从当前音色开始, 按 high/low 跳到下一个音色
                        var chainInst = inst;
                        var chainMidi = processedMidi;
                        var maxChainSteps = 4;

                        for (var chainStep = 0; chainStep < maxChainSteps; chainStep++) {
                            var substCfg = substituteConfig[chainInst];
                            if (!substCfg) break;

                            var targetInst = -1;
                            if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                                targetInst = substCfg.high;
                            } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                                targetInst = substCfg.low;
                            } else {
                                break;
                            }

                            var chainOrigOffset = _INSTRUMENT_OFFSET[chainInst] || 0;
                            var chainTargetOffset = _INSTRUMENT_OFFSET[targetInst] || 0;
                            var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);

                            // 替代成功条件: processedMidi 落入 Minecraft 标准音域 [54, 78] (nbsKey [33, 57])
                            if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                                inst = targetInst;
                                processedMidi = newMidi;
                                break;
                            }

                            // 继续链条
                            chainInst = targetInst;
                            chainMidi = newMidi;
                        }
                    }
                }

                // 阶段3: 应用偏移量 (main.js 已根据替代情况计算最优偏移)
                // 注意: 偏移量基于替代后的 MIDI 计算, 所以这里加到 processedMidi 上
                processedMidi += 12 * octaveOffset + keyOffset;

                // 阶段4: 强制兜底 (仅在勾选时)
                // 折叠到 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                if (forceFoldEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                    while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                    while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
                }
            }

            // 转换为 NBS key
            nbsKey = processedMidi - 21;
            // clamp 到 [0, 87] (防御性, 正常流程不应触发)
            if (nbsKey < 0) nbsKey = 0;
            if (nbsKey > 87) nbsKey = 87;
            instrument = inst;
        }

        // 计算 layer
        var baseLayer = channelLayerOffset[ch] || 0;
        var lKey = ch + ',' + nbsTick;
        var used = layerCounters[lKey] || 0;
        var layer = baseLayer + used;
        layerCounters[lKey] = used + 1;

        // velocity
        var velocity;
        if (readVelocity) {
            velocity = Math.min(100, Math.floor(e.velocity / 127.0 * 100));
        } else {
            velocity = 100;
        }

        // note length
        var durationTicks = e.duration_ticks || 1;
        var noteLength = Math.max(1, Math.floor(durationTicks / deltaPerTick));
        // 注意: pitch 单位为音分(音高微调), 不能把音符长度写入 pitch, 否则播放时会整体升调

        // 判断是否保持音符长度
        var shouldSustain = false;
        if (keepNoteLength === 'all') {
            shouldSustain = true;
        } else if (keepNoteLength === 'sustain') {
            shouldSustain = !!sustainTracksSet[trackIdx];
        }

        songNotes.push({
            id: 'note_' + nbsTick + '_' + layer,
            tick: nbsTick,
            layer: layer,
            instrument: instrument,
            key: nbsKey,
            velocity: velocity,
            pan: 50,
            pitch: 0
        });

        // ---- 音色拟合: slot2/slot3 ----
        if (timbreFitting && _has(timbreFitting, ch)) {
            var fittingSlots = timbreFitting[ch];
            for (var slotIdx = 1; slotIdx < fittingSlots.length; slotIdx++) {
                var slotInst = fittingSlots[slotIdx];
                if (slotInst >= 0) {
                    // slot 独立计算 MIDI 表示值 (遵循新流水线)
                    var slotMidi;

                    if (octaveMode === 0) {
                        // 模式 0: 完全不处理
                        slotMidi = midiNote;
                    } else if (octaveMode === 1) {
                        // 模式 1: 单独归一 (不替代), 折叠到 Minecraft 标准音域
                        slotMidi = midiNote + 12 * octaveOffset + keyOffset;
                        while (slotMidi < MC_MIDI_MIN) slotMidi += 12;
                        while (slotMidi > MC_MIDI_MAX) slotMidi -= 12;
                    } else {
                        // 模式 2/3: 先替代, 后偏移
                        slotMidi = midiNote;

                        // 阶段1: 在原始 midiNote 上尝试替代 (目标: Minecraft 标准音域)
                        if (smartSubstituteEnabled && (slotMidi < MC_MIDI_MIN || slotMidi > MC_MIDI_MAX)) {
                            var slotTrackInScope = true;
                            if (substituteTracksSet) slotTrackInScope = !!substituteTracksSet[trackIdx];

                            if (slotTrackInScope && substituteConfig) {
                                var sChainInst = slotInst;
                                var sChainMidi = slotMidi;

                                for (var sChainStep = 0; sChainStep < 4; sChainStep++) {
                                    var sSubstCfg = substituteConfig[sChainInst];
                                    if (!sSubstCfg) break;

                                    var sTarget = -1;
                                    if (sChainMidi > MC_MIDI_MAX && sSubstCfg.high >= 0) {
                                        sTarget = sSubstCfg.high;
                                    } else if (sChainMidi < MC_MIDI_MIN && sSubstCfg.low >= 0) {
                                        sTarget = sSubstCfg.low;
                                    } else {
                                        break;
                                    }

                                    var sOrigOff = _INSTRUMENT_OFFSET[sChainInst] || 0;
                                    var sTgtOff = _INSTRUMENT_OFFSET[sTarget] || 0;
                                    var sNewMidi = sChainMidi - (sTgtOff - sOrigOff);

                                    if (sNewMidi >= MC_MIDI_MIN && sNewMidi <= MC_MIDI_MAX) {
                                        slotInst = sTarget;
                                        slotMidi = sNewMidi;
                                        break;
                                    }

                                    sChainInst = sTarget;
                                    sChainMidi = sNewMidi;
                                }
                            }
                        }

                        // 阶段3: 应用偏移量
                        slotMidi += 12 * octaveOffset + keyOffset;

                        // 阶段4: 强制兜底 (折叠到 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX])
                        if (forceFoldEnabled && (slotMidi < MC_MIDI_MIN || slotMidi > MC_MIDI_MAX)) {
                            while (slotMidi < MC_MIDI_MIN) slotMidi += 12;
                            while (slotMidi > MC_MIDI_MAX) slotMidi -= 12;
                        }
                    }

                    // 转换为 NBS key
                    var slotNbsKey = slotMidi - 21;
                    if (slotNbsKey < 0) slotNbsKey = 0;
                    if (slotNbsKey > 87) slotNbsKey = 87;

                    var used2 = layerCounters[lKey] || 0;
                    var fitLayer = baseLayer + used2;
                    layerCounters[lKey] = used2 + 1;
                    songNotes.push({
                        id: 'note_' + nbsTick + '_' + fitLayer,
                        tick: nbsTick,
                        layer: fitLayer,
                        instrument: slotInst,
                        key: slotNbsKey,
                        velocity: velocity,
                        pan: 50,
                        pitch: 0
                    });
                    // 保持音符长度也应用于 slot2/slot3
                    if (shouldSustain) {
                        var effLen2 = Math.max(2, noteLength);
                        for (var st2 = 1; st2 < effLen2; st2++) {
                            var targetTick2 = nbsTick + st2;
                            if (targetTick2 > maxNbsTick + 100) break;
                            var sKey2 = ch + ',' + targetTick2;
                            var usedS2 = layerCounters[sKey2] || 0;
                            var sLayer2 = baseLayer + usedS2;
                            layerCounters[sKey2] = usedS2 + 1;
                            songNotes.push({
                                id: 'note_' + targetTick2 + '_' + sLayer2,
                                tick: targetTick2,
                                layer: sLayer2,
                                instrument: slotInst,
                                key: slotNbsKey,
                                velocity: velocity,
                                pan: 50,
                                pitch: 0
                            });
                        }
                    }
                }
            }
        }

        // ---- 打击乐拟合: slot2/slot3 ----
        if (ch === 9 && percussionFitting && _has(percussionFitting, midiNote)) {
            var pFittingSlots = percussionFitting[midiNote];
            for (var pSlotIdx = 1; pSlotIdx < pFittingSlots.length; pSlotIdx++) {
                var pSlotInst = pFittingSlots[pSlotIdx];
                if (pSlotInst >= 0) {
                    var pUsed2 = layerCounters[lKey] || 0;
                    var pFitLayer = baseLayer + pUsed2;
                    layerCounters[lKey] = pUsed2 + 1;
                    songNotes.push({
                        id: 'note_' + nbsTick + '_' + pFitLayer,
                        tick: nbsTick,
                        layer: pFitLayer,
                        instrument: pSlotInst,
                        key: nbsKey,
                        velocity: velocity,
                        pan: 50,
                        pitch: 0
                    });
                }
            }
        }

        // ---- 保持音符长度: 后续 tick 重复放置 ----
        if (shouldSustain) {
            var effectiveLength = Math.max(2, noteLength);
            for (var sustainTick = 1; sustainTick < effectiveLength; sustainTick++) {
                var targetTick = nbsTick + sustainTick;
                if (targetTick > maxNbsTick + 100) break;
                var sustainKey = ch + ',' + targetTick;
                var sustainUsed = layerCounters[sustainKey] || 0;
                var sustainLayer = baseLayer + sustainUsed;
                layerCounters[sustainKey] = sustainUsed + 1;
                songNotes.push({
                    id: 'note_' + targetTick + '_' + sustainLayer,
                    tick: targetTick,
                    layer: sustainLayer,
                    instrument: instrument,
                    key: nbsKey,
                    velocity: velocity,
                    pan: 50,
                    pitch: 0 // 延续音符
                });
            }
        }
    }

    // ---- 添加速度变化器 ----
    if (tempoChanges && tempoChangesList.length > 0) {
        for (var ti = 0; ti < tempoChangesList.length; ti++) {
            var tc = tempoChangesList[ti];
            var pos = Math.floor((tc.tick - silentOffset) / deltaPerTick);
            if (pos < 0) pos = 0;
            var nbsTempoRaw = 60000000.0 / tc.tempo_us; // BPM
            var nbsTps = nbsTempoRaw / 15.0 * (precVal + 1);

            // 查找是否已有该位置的音符
            var existing = null;
            for (var ni = 0; ni < songNotes.length; ni++) {
                if (songNotes[ni].tick === pos && songNotes[ni].layer === 0) {
                    existing = songNotes[ni];
                    break;
                }
            }
            if (existing) {
                existing.key = 39;
                existing.velocity = Math.floor(nbsTps);
            } else {
                songNotes.push({
                    id: 'note_' + pos + '_0',
                    tick: pos,
                    layer: 0,
                    instrument: 0,
                    key: 39,
                    velocity: Math.floor(nbsTps),
                    pan: 50,
                    pitch: 0
                });
            }
        }
    }

    // ---- 消除重复音符 ----
    // 删除同一 tick 中 音色(instrument) + 音调(key) 完全相同的重复音符
    // 每 tick 每个 (instrument, key) 只保留一个音符 (保留第一个)
    if (dedupeNotes) {
        var dedupeSeen = {}; // "tick:instrument:key" -> true
        var dedupedNotes = [];
        var dedupeRemoved = [];
        for (var di = 0; di < songNotes.length; di++) {
            var dn = songNotes[di];
            var dKey = dn.tick + ':' + dn.instrument + ':' + dn.key;
            if (dedupeSeen[dKey]) { dedupeRemoved.push(dn); continue; }
            dedupeSeen[dKey] = true;
            dedupedNotes.push(dn);
        }
        songNotes = dedupedNotes;
        // 重排序音符: 删除后把下方相邻轨道中孤立的连续音符向上移动, 填补空洞
        if (settings.dedupe_reorder === true) {
            window.dedupeReorderNotes(songNotes, dedupeRemoved);
        }
    }

    // ---- 构建 layers 列表 ----
    var maxLayer = 0;
    for (var i = 0; i < songNotes.length; i++) {
        if (songNotes[i].layer > maxLayer) maxLayer = songNotes[i].layer;
    }
    var songLayers = [];
    for (var l = 0; l <= maxLayer; l++) {
        songLayers.push({
            name: 'Layer ' + (l + 1),
            volume: 100,
            stereo: 100,
            lock: 0
        });
    }

    // ---- 构建 layer -> channel 映射 ----
    var layerChannelMap = {};
    for (var mapCh in channelLayerOffset) {
        if (channelLayerOffset.hasOwnProperty(mapCh)) {
            var mapChNum = parseInt(mapCh, 10);
            var offset = channelLayerOffset[mapCh];
            var count = channelLayersNeeded[mapChNum] || 1;
            for (var ml = offset; ml < offset + count; ml++) {
                layerChannelMap[ml] = mapChNum;
            }
        }
    }

    // ---- 图层命名 ----
    if (nameLayers) {
        var yy = 0;
        if (tempoChanges) {
            if (yy < songLayers.length) {
                songLayers[yy].name = 'TempoChgr';
            }
            yy++;
        }
        for (var nc = 0; nc <= maxChannel; nc++) {
            var ncCount = channelLayersNeeded[nc] || 0;
            for (var nb = 0; nb < ncCount; nb++) {
                if (yy < songLayers.length) {
                    songLayers[yy].stereo = 100;
                    if (nameAfterPatches) {
                        if (nc === 9) {
                            songLayers[yy].name = 'Percussion';
                        } else {
                            var prog = channelFirstProgram[nc] || 0;
                            if (prog < GM_PROGRAM_TABLE.length) {
                                songLayers[yy].name = GM_PROGRAM_TABLE[prog][0];
                            } else {
                                songLayers[yy].name = 'Channel ' + (nc + 1);
                            }
                        }
                    } else {
                        songLayers[yy].name = 'Channel ' + (nc + 1);
                    }
                    songLayers[yy].volume = 100;
                }
                yy++;
            }
        }
    }

    // ---- 音色拟合: 重命名对应图层 ----
    if (timbreFitting) {
        var layerInstruments = {};
        for (var i = 0; i < songNotes.length; i++) {
            layerInstruments[songNotes[i].layer] = songNotes[i].instrument;
        }
        for (var tfCh in timbreFitting) {
            if (timbreFitting.hasOwnProperty(tfCh)) {
                var tfChNum = parseInt(tfCh, 10);
                var slots = timbreFitting[tfCh];
                for (var slotIdx = 0; slotIdx < slots.length; slotIdx++) {
                    var slotInst = slots[slotIdx];
                    if (slotInst >= 0) {
                        for (var layerIdx in layerInstruments) {
                            if (layerInstruments.hasOwnProperty(layerIdx)) {
                                var layerIdxNum = parseInt(layerIdx, 10);
                                var baseOffset = channelLayerOffset[tfChNum] || 0;
                                if (layerInstruments[layerIdx] === slotInst &&
                                    layerIdxNum >= baseOffset &&
                                    layerIdxNum < songLayers.length) {
                                    var instName = slotInst < INSTRUMENT_NAMES.length
                                        ? INSTRUMENT_NAMES[slotInst]
                                        : 'Inst ' + slotInst;
                                    if (slotIdx === 0) {
                                        songLayers[layerIdxNum].name = instName + '(通道' + tfChNum + ')';
                                    } else {
                                        songLayers[layerIdxNum].name = instName + '(通道' + tfChNum + '-' + (slotIdx + 1) + ')';
                                    }
                                    delete layerInstruments[layerIdx];
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- 最终: TPS 始终为整数 ----
    songTempo = Math.round(songTempo);

    // ---- 计算 song.length ----
    var songMaxTick = 0;
    for (var i = 0; i < songNotes.length; i++) {
        if (songNotes[i].tick > songMaxTick) songMaxTick = songNotes[i].tick;
    }
    var songLen = songNotes.length > 0 ? songMaxTick + 1 : 0;

    return {
        name: 'Imported MIDI',
        song_name: 'Imported MIDI',
        author: '',
        original_author: '',
        description: '',
        tempo: songTempo,
        auto_save: false,
        auto_save_minutes: 0,
        time_signature: 4,
        length: songLen,
        layers: songLayers,
        note_count: songNotes.length,
        notes: songNotes,
        layer_channel_map: layerChannelMap
    };
}

// ====================================================================
// 全局 NBSClient API
// ====================================================================

var NBSClient = {

    // ---- NBS 读取 (替代 /api/song/load) ----
    // 尝试 @nbsjs/core, 失败则使用自包含解析器 (主要实现)
    loadNBS: function (file) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                var arrayBuffer = ev.target.result;
                try {
                    // 主要实现: 自包含 NBS 解析器
                    // (@nbsjs/core 的 API 可能与文档不一致, 因此直接使用自包含解析器)
                    var song = self._parseNBS(arrayBuffer);
                    resolve({ success: true, song: song });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- NBS 写入 (替代 /api/song/save) ----
    saveNBS: function (songData) {
        var self = this;
        return new Promise(function (resolve, reject) {
            try {
                var uint8 = self._writeNBS(songData);
                var blob = new Blob([uint8], { type: 'application/octet-stream' });
                resolve(blob);
            } catch (e) {
                reject(e);
            }
        });
    },

    // ---- MIDI 信息 (替代 /api/midi/info) ----
    getMidiInfo: function (file) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var info = self._parseMidi(ev.target.result);
                    resolve({ success: true, info: info });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- MIDI 导入 (替代 /api/midi/import) ----
    importMidi: function (file, settings) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var song = self._convertMidiToNBS(ev.target.result, settings);
                    resolve({
                        success: true,
                        song: song,
                        suggested_tempo: song.tempo
                    });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- 内部方法 (公开供高级使用) ----
    _parseNBS: _parseNBS,
    _writeNBS: _writeNBS,
    _parseMidi: _parseMidiInfo,
    _parseMidiInfo: _parseMidiInfo,
    _parseMidiWithToneJS: _parseMidiWithToneJS,
    _convertMidiToNBS: _convertMidiToNBS,

    // 常量 (供前端引用)
    GM_PROGRAM_TABLE: GM_PROGRAM_TABLE,
    GM_FITTING_SLOTS: GM_FITTING_SLOTS,
    GM_SUSTAIN_PROGRAMS: GM_SUSTAIN_PROGRAMS,
    DRUM_NOTE_TABLE: DRUM_NOTE_TABLE,
    INSTRUMENT_NAMES: INSTRUMENT_NAMES
};

// ====================================================================
// 消除重复音符的"重排序音符"扩展 (编辑器主界面与 MIDI 导入共用)
// 坐标: x = tick(时间), y = layer(轨道). 删除音符 A(tick, layer) 后,
// 若其下方相邻轨道同 tick 处存在连续堆积的音符块, 且该音符为孤立点
// (同轨道 tick±1, tick±2 内存活音符数 < 2), 则由上至下一级级上移
// 填补空洞; 直到某层原本就无音符(空洞)或遇到属于连续旋律的音符为止。
// 仅改变音符的 layer, tick/key/velocity 等属性保持不变。
// @param {Array} notes    保留(去重后)的音符数组, 会被就地修改 layer
// @param {Array} removed  被删除的重复音符引用数组
// @returns {number} 实际移动的音符数量
// ====================================================================
window.dedupeReorderNotes = function (notes, removed) {
    if (!notes || !removed || notes.length === 0 || removed.length === 0) return 0;
    var i, k;
    // 相同坐标 (tick:layer) 的重复删除只处理一次, 视为同一个空洞
    var unique = [];
    var seenHole = {};
    for (i = 0; i < removed.length; i++) {
        var r = removed[i];
        if (!r) continue;
        var hk = r.tick + ':' + r.layer;
        if (seenHole[hk]) continue;
        seenHole[hk] = true;
        unique.push(r);
    }
    function isRemoved(n) { return removed.indexOf(n) !== -1; }
    // 位置索引: "tick:layer" -> [note]
    var byPos = {};
    for (i = 0; i < notes.length; i++) {
        var n = notes[i];
        var pk = n.tick + ':' + n.layer;
        (byPos[pk] || (byPos[pk] = [])).push(n);
    }
    function colAt(tick, layer) { return byPos[tick + ':' + layer] || []; }
    function hasAliveAt(tick, layer) {
        var col = colAt(tick, layer);
        for (var j = 0; j < col.length; j++) {
            if (!isRemoved(col[j])) return true;
        }
        return false;
    }
    var moved = 0;
    for (i = 0; i < unique.length; i++) {
        var a = unique[i];
        var ax = a.tick;
        var holeLayer = a.layer;
        var cur = holeLayer + 1;
        while (true) {
            // 该层同 tick 无存活音符 -> 原本就有空洞, 停止连锁
            if (!hasAliveAt(ax, cur)) break;
            var col = colAt(ax, cur);
            // 选 key 最小的存活音符作为 B (待删除音符不参与移动)
            var b = null;
            for (k = 0; k < col.length; k++) {
                if (isRemoved(col[k])) continue;
                if (!b || col[k].key < b.key) b = col[k];
            }
            if (!b) break;
            // 孤立判定: B 所在轨道内 tick±1, tick±2 的存活音符数
            var count = (hasAliveAt(b.tick - 1, b.layer) ? 1 : 0)
                      + (hasAliveAt(b.tick - 2, b.layer) ? 1 : 0)
                      + (hasAliveAt(b.tick + 1, b.layer) ? 1 : 0)
                      + (hasAliveAt(b.tick + 2, b.layer) ? 1 : 0);
            if (count >= 2) break; // B 属于连续旋律, 不移动
            // 移动 B: 轨道上移一层 (tick/key 不变), 空洞下移一层继续
            var oldPos = b.tick + ':' + b.layer;
            var arr = byPos[oldPos];
            if (arr) {
                var bi = arr.indexOf(b);
                if (bi >= 0) arr.splice(bi, 1);
                if (arr.length === 0) delete byPos[oldPos];
            }
            b.layer = holeLayer;
            var newPos = b.tick + ':' + b.layer;
            (byPos[newPos] || (byPos[newPos] = [])).push(b);
            moved++;
            holeLayer = cur;
            cur = cur + 1;
        }
    }
    return moved;
};

// ====================================================================
// 歌曲压缩 (有损压缩) 核心
// 通过删除音符降低总音符数。质量比例越低删得越多 (质量 X% ≈ 保留约 X% 的音符)。
// 两种算法模型:
//   heuristic       务实启发式: 轻量规则打分 (根音/三音/五音、八度重复、时值、节拍、力度、音色类别)
//   perceptual      感知引擎:   感知打分 (角色/节拍/时值/力度/掩蔽/打击乐密度)
// 两模型"删多少"完全一致 (同一 budget), 差异仅在"删哪一些"。
// 质量 99% 时两模型都只执行完全去重 (即原「消除重复音符」逻辑)。
// 每删除一批音符后立即调用 dedupeReorderNotes 填补空洞 (整体拥有, 非去重独有)。
// ====================================================================
window.compressSongCore = (function () {
    // 内置乐器分类 (0 基, 对应 INSTRUMENT_KEYS)
    var PERCUSSION = { 2: 1, 3: 1, 4: 1 };   // 大鼓2 / 小鼓3 / 击打声4
    var BASS_LIKE = { 1: 1, 12: 1 };         // 低音提琴1 / 迪吉里杜管12

    function mod12(k) { return ((k % 12) + 12) % 12; }
    function isPerc(n) { return !!PERCUSSION[n.instrument]; }
    function isBass(n) { return !!BASS_LIKE[n.instrument]; }

    // 判断是否为短音: 同一条轨道(layer)上, 下一条音符起点距当前音符 ≤3 tick
    function makeIsShort(notes) {
        var short = {};
        var byLayer = {};
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            (byLayer[n.layer] = byLayer[n.layer] || []).push(n);
        }
        for (var L in byLayer) {
            var arr = byLayer[L].slice().sort(function (a, b) { return a.tick - b.tick; });
            for (var j = 0; j < arr.length; j++) {
                var cur = arr[j];
                var nx = j + 1 < arr.length ? arr[j + 1] : null;
                short[L + ':' + cur.tick] = nx ? (nx.tick - cur.tick <= 3) : false;
            }
        }
        return function (n) { return n && !!short[n.layer + ':' + n.tick]; };
    }

    // 按 (tick:instrument) 分组, 仅旋律类; 返回 {key: [notes]}
    function groupPitchByTickInst(notes) {
        var g = {};
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (isPerc(n)) continue;
            var gk = n.tick + ':' + n.instrument;
            (g[gk] = g[gk] || []).push(n);
        }
        return g;
    }

    // ---- 轨道集合 (选轨: 减轻处理 / 不被处理) ----
    function toLayerSet(arr) {
        if (!arr || !arr.length) return null;
        var s = {};
        for (var i = 0; i < arr.length; i++) s[arr[i]] = 1;
        return s;
    }

    // ---- 二分查找 (打击乐密度窗口计数用) ----
    function lowerBound(arr, v) {
        var lo = 0, hi = arr.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
        return lo;
    }
    function upperBound(arr, v) {
        var lo = 0, hi = arr.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid + 1; else hi = mid; }
        return lo;
    }

    // ---- 组内元信息: 根音(最低音) / 最高音 / 成员列表 ----
    function buildGroupMeta(notes) {
        var g = groupPitchByTickInst(notes);
        var meta = {};
        for (var gk in g) {
            var arr = g[gk];
            var root = arr[0], hi = arr[0];
            for (var j = 1; j < arr.length; j++) {
                if (arr[j].key < root.key) root = arr[j];
                if (arr[j].key > hi.key) hi = arr[j];
            }
            meta[gk] = { arr: arr, root: root, hi: hi };
        }
        return meta;
    }

    // ==================================================================
    // v4.0 结构分层感知压缩引擎
    //   Stage0 物理模型 -> Stage2 结构分析(6 模式) -> Stage3 候选生成(13 类)
    //   -> Stage4 成本评估 -> Stage5 贪心 + 7 不变式回滚 -> Stage6 审计
    // 保留既有契约: window.compressSongCore / window.compressSongEstimate。
    // ==================================================================

    // ---- ParameterConfig: 集中管理 + 标注验证状态 [VERIFIED]/[UNVERIFIED] ----
    var P = {
        // [VERIFIED] NBS 官方规范
        nbsPitchRange: [0, 87],
        nbsGameRange: [33, 57],
        tickPerSecond: 10,
        velocityMax: 100,
        // [VERIFIED] 心理声学
        // [UNVERIFIED] 启发式参数 (需实验校准)
        costWeights: [0.30, 0.25, 0.20, 0.15, 0.10],  // Δharm,Δrhythm,Δmelody,Δtexture,Δtimbre
        tauGrid: 0.5,
        tauChord: 0.35,
        hAthNorm: 0.6,          // 音高熵归一化阈值 (atonal)
        nSparse: 500,
        rhoSparse: 0.02,
        dDense: 0.6,
        maskSpan: 2,            // 掩蔽半音窗
        retriggerGapTick: 2,    // 伪延音最大间隔(tick)
        inaudibleVel: 3,        // 闻阈: velocity<3 听不到
        voiceMinAbs: 3,         // L1 绝对下限
        failBudget: 100000,         // L1 连续失败上限(实际由 target 终止; 避免过早中断破坏单调性)
        cMaxBase: 0.20,         // 成本上限截断基线 (A2: 拒绝高成本候选, 防止中高档乱删结构音)
        cMaxScale: 0.70         // 成本上限随压缩强度线性放宽: cMax = cMaxBase + cMaxScale*(1-q)
    };

    // ---- Note Block Physics 模型 (Stage 0) ----
    // 近似衰减时间(秒) [UNVERIFIED], 同 v4.0 §2.1; >15 为自定义乐器 -> unknown
    var DECAY = { 0: 1.5, 1: 1.0, 2: 0.3, 3: 0.2, 4: 0.1, 5: 1.2, 6: 0.8, 7: 2.0, 8: 2.5, 9: 1.0, 10: 1.2, 11: 0.8, 12: 1.5, 13: 0.5, 14: 1.0, 15: 1.5 };
    function decayOf(n) {
        if (n.instrument == null || n.instrument < 0 || n.instrument > 15 || DECAY[n.instrument] === undefined) return null;
        return DECAY[n.instrument];
    }
    // 近似有效响度: 现数据模型无 layer_volume, 用 velocity 近似 (v4.0 的 layer_vol*vel/100)
    function effVol(n) { return Math.min(1, Math.max(0, (n.velocity == null ? 100 : n.velocity) / 100)); }
    // 近似有效音高 (含音分微调)
    function effPitch(n) { return n.key + (isFinite(n.pitch) ? n.pitch / 100 : 0); }

    function dot(a, w) { return a[0] * w[0] + a[1] * w[1] + a[2] * w[2] + a[3] * w[3] + a[4] * w[4]; }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function resolveTpb(ctx) { var t = (ctx && ctx.ticksPerBeat) || 0; return (t && t > 1) ? t : 30; }

    // ---- Stage 2: 结构分析 (轻量近似 LogicalVoice / ChordSegment) ----
    // 返回全曲统计 + 伪延音组。无副作用。
    function analyzeStructure(notes, tpb) {
        var i, n, s = {};
        var total = notes.length;
        // 2a 音高熵 (pitch-class 归一化 Shannon 熵 / 最大熵)
        var pc = {}, cnt = 0;
        for (i = 0; i < notes.length; i++) {
            n = notes[i];
            var p = mod12(n.key + (isFinite(n.pitch) ? Math.round(n.pitch / 100) : 0));
            if (!pc[p]) pc[p] = 0;
            pc[p]++; cnt++;
        }
        var ent = 0;
        for (var k in pc) { var pr = pc[k] / cnt; ent -= pr * Math.log(pr); }
        var maxEnt = Math.log(Math.max(1, Object.keys(pc).length));
        var entropy = maxEnt > 0 ? ent / maxEnt : 0;
        var atonal = entropy > P.hAthNorm;

        // 2d Chord: 同 tick 平均同时音符数 + 和弦占比 (多音 tick 占非空 tick 比例)
        var tickN = {}, nonEmpty = 0, multTicks = 0, sumMult = 0;
        for (i = 0; i < notes.length; i++) {
            n = notes[i];
            if (!tickN[n.tick]) tickN[n.tick] = 0;
            tickN[n.tick]++;
        }
        for (var t in tickN) {
            var m = tickN[t];
            nonEmpty++;
            if (m >= 2) multTicks++;
            sumMult += m;
        }
        var avgMult = nonEmpty ? sumMult / nonEmpty : 1;
        var chordRatio = nonEmpty ? multTicks / nonEmpty : 0;

        // 2b grid_neutral: 强拍(beatPos==0)触发占非空 tick 比例低 → 网格置信不足
        var strongTicks = 0;
        for (i = 0; i < notes.length; i++) if ((notes[i].tick % tpb) === 0) strongTicks++;
        var gridConf = nonEmpty ? Math.min(1, strongTicks / Math.max(1, notes.length)) : 0;
        var gridNeutral = gridConf < P.tauGrid;

        // 2c 稀疏
        var sparse = total < P.nSparse || (nonEmpty > 0 && total / nonEmpty < P.rhoSparse);

        // 2f 模式
        var funky = avgMult > 3.5 && chordRatio > 0.6;
        var perc = 0;
        for (i = 0; i < notes.length; i++) if (isPerc(notes[i])) perc++;
        var densePerk = nonEmpty > 0 && perc / nonEmpty > P.dDense;

        // melody_dominant: 音符最多的某层占比 > 80% 则标记为旋律层
        var layerCnt = {}, maxLayer = -1, maxLayerN = 0;
        for (i = 0; i < notes.length; i++) {
            n = notes[i];
            layerCnt[n.layer] = (layerCnt[n.layer] || 0) + 1;
            if (layerCnt[n.layer] > maxLayerN) { maxLayerN = layerCnt[n.layer]; maxLayer = n.layer; }
        }
        var melodyDominant = total > 0 && maxLayerN / total > 0.8;

        // 2e 伪延音检测: 同 instrument 偏移, 同 eff_pitch(半音), 间隔<=2tick, 同窗口无它 pitch 干扰
        // 按 (instrument : round(effPitch)) 排序 tick, 收集连续且 gap<=retriggerGapTick 的序列
        var groupsKey = {};
        for (i = 0; i < notes.length; i++) {
            n = notes[i];
            var gk = n.instrument + ':' + Math.round(effPitch(n));
            (groupsKey[gk] = groupsKey[gk] || []).push(n);
        }
        var pseudoGroups = [];
        for (var g in groupsKey) {
            var arr = groupsKey[g].slice().sort(function (a, b) { return a.tick - b.tick; });
            var run = [];
            for (i = 0; i < arr.length; i++) {
                var cur = arr[i];
                var prev = run.length ? run[run.length - 1] : null;
                if (prev && (cur.tick - prev.tick) <= P.retriggerGapTick &&
                    mod12(cur.key) !== mod12(prev.key)) {
                    // 窗口内混入它 pitch (半音级不同) → 视为和弦而非延音, 中断
                    if (run.length >= 2) { pseudoGroups.push(run.slice(0, run.length)); }
                    run = [cur];
                    continue;
                }
                if (prev && (cur.tick - prev.tick) <= P.retriggerGapTick) { run.push(cur); }
                else {
                    if (run.length >= 2) pseudoGroups.push(run);
                    run = [cur];
                }
            }
            if (run.length >= 2) pseudoGroups.push(run);
        }
        // 只保留 "同 pitch 半音级" 真正 retrigger (移除和弦混入产生的打断组)
        pseudoGroups = pseudoGroups.filter(function (g2) {
            if (g2.length < 2) return false;
            var base = mod12(g2[0].key);
            for (var j = 0; j < g2.length; j++) if (mod12(g2[j].key) !== base) return false;
            return true;
        });

        s.atonal = atonal; s.gridNeutral = gridNeutral; s.sparse = sparse;
        s.funky = funky; s.densePerk = densePerk; s.melodyDominant = melodyDominant;
        s.pseudoGroups = pseudoGroups; s.melodyLayer = melodyDominant ? maxLayer : -1;
        s.avgMult = avgMult; s.chordRatio = chordRatio;
        return s;
    }

    // ---- Stage 4: 成本评估 ----
    // 返回 { hCost, pCost, class } : heuristic 与 perceptual 两套权重在相同特征上的差异。
    // 特点: perceptual 额外纳入掩蔽/密度微调, 保证删除量一致、只是顺序不同。
    function costOfCandidate(c, st, tpb) {
        var del = c.del || [], keep = c.keep;
        // 防御: 无删除对象且无 keep 的候选无法估计, 给最差成本(不被选)
        if (!del.length && !keep) return { hCost: 10, pCost: 10, class: c.class };
        var ref = del.length ? del[0] : keep;
        if (!ref) return { hCost: 10, pCost: 10, class: c.class };
        var beatPos = ref.tick % tpb;
        var half = Math.floor(tpb / 2);

        // Δharm
        var root = 1.0;
        if (c.class === 'C2') root = 0.05;                 // 伪延音合并: 能量补偿几乎无损
        else if (c.class === 'C12') root = 0.0;            // 闻阈: 物理听不到
        else if (c.fifthLike) root = st.funky ? 0.5 : 0.2;
        else if (beatPos !== 0 && beatPos !== half && !c.chordTone) root = 0.05;
        // 掩蔽 μ_local (仅 pitched 跨音色): 与同 tick 更响邻近音相比
        var mu = 0;
        if (!isPerc(ref)) {
            var vRef = effVol(ref);
            // 用 buildGroupMeta 已可为同 tick 音级; 这里简化: 遍历同 tick 所有音符
        }
        var dHarm = root * (1 - 0.3 * c.masked);

        // Δrhythm
        var dRythm;
        if (st.gridNeutral) dRythm = 0.4;
        else if (beatPos === 0) dRythm = 1.0;
        else if (beatPos === half) dRythm = 0.8;
        else dRythm = 0.15;

        // Δmelody: 简洁注入由候选生成侧计算的 gap/jump/structural
        var dMelody = c.melodyCost !== undefined ? c.melodyCost : 0.4;

        // Δtexture: 删除导致 tick 清空 → 高
        var dTexture = c.tickClears ? 1.0 : 0.3;

        // Δtimbre: 低音/打击乐角色保底
        var dTimbre = (isBass(ref) || isPerc(ref)) ? 0.6 : 0.3;

        var d = [dHarm, dRythm, dMelody, dTexture, dTimbre];
        var base = dot(d, P.costWeights);
        // 感知掩蔽项 (仅 perceptual): 同 tick 存在更响的邻近音(掩蔽窗内) → 该音被掩蔽, 更可删
        var selfMasked = 0;
        if (!isPerc(ref) && st.__masking) {
            var vR = effVol(ref), mm2 = st.__masking;
            for (var sk = -P.maskSpan; sk <= P.maskSpan; sk++) {
                if (mm2[ref.tick + ':' + mod12(ref.key + sk)] > vR) { selfMasked = 1; break; }
            }
        }
        // lighten 层成本翻倍 (等效配额减半)
        if (c.lighten) base *= 2;
        var hCost = base * 0.9 + (c.class === 'C12' ? 0 : 0.15);
        // 感知: 掩蔽音显著更可删(强项), 轻量项在 lighten 时再降 → 与启发式选序真实不同
        var pBase = base - 0.5 * selfMasked;
        var pCost = pBase + 0.10 * (c.lighten ? 1 : 0) + (c.class === 'C12' ? 0 : 0.15);
        return { hCost: hCost, pCost: pCost, class: c.class };
    }

    // ---- Stage 3 + 5: 候选生成 + 贪心 + 7 不变式回滚 ----
    // 纯计算(在调用方给定的可变数组 kept 上, 只读), 输出被删音符引用数组。
    // 与 compressSongEstimate 共享, 保证预估 = 实际。
    function selectPlan(kept, q, model, tpb, excludeSet, lightenSet, nProg, opts) {
        // 伪延音开关 (默认关闭): 关闭时不做跨 tick 的伪延音合并/消除, 逐 tick 独立。
        var pseudoSustain = !!(opts && opts.pseudoSustain === true);
        var st = analyzeStructure(kept, tpb);
        var i, n, k, j;
        var cands = [];

        // 感知掩蔽查找表: 'tick:pc' -> 该 tick 该音级最大 effVol (供 perceptual 排序)
        st.__masking = {};
        for (var m0 = 0; m0 < kept.length; m0++) {
            var mn = kept[m0], mk0 = mn.tick + ':' + mod12(mn.key), me = effVol(mn);
            if (me > (st.__masking[mk0] || 0)) st.__masking[mk0] = me;
        }

        function bucket(nn) {
            if (excludeSet && excludeSet[nn.layer]) return 0;
            if (lightenSet && lightenSet[nn.layer]) return 2;
            return 1;
        }
        // 每 tick 乐器组与前驱信息
        var meta = buildGroupMeta(kept);

        // ---- C0: 同 tick 同乐器同 pitch 去重 (阶段1已删 tick:inst:key 重复;
        // 此处兜底仅针对同 tick 同 inst 同 key 万一存在的重复, 保 effVol 最大) ----
        var c0ByKey = {};
        for (i = 0; i < kept.length; i++) {
            n = kept[i];
            if (bucket(n) === 0) continue;
            var ck0 = n.tick + ':' + n.instrument + ':' + n.key;
            (c0ByKey[ck0] = c0ByKey[ck0] || []).push(n);
        }
        for (k in c0ByKey) {
            var arr = c0ByKey[k];
            if (arr.length < 2) continue;
            var bestV = -1, bestIdx = -1;
            for (i = 0; i < arr.length; i++) {
                var ev = effVol(arr[i]);
                if (ev > bestV) { bestV = ev; bestIdx = i; }
            }
            for (i = 0; i < arr.length; i++) {
                if (i === bestIdx) continue;
                cands.push({ class: 'C0', del: [arr[i]], keep: null, lighten: bucket(arr[i]) === 2 });
            }
        }

        if (q >= 0.99) {
            // 99%: 仅完全去重
            return finalize(cands, st, tpb);
        }

        function candidatesEnabled(cls) {
            if (cls === 'C3' || cls === 'C4' || cls === 'C8') return !st.atonal;
            if (cls === 'C5' || cls === 'C6' || cls === 'C7' || cls === 'C8' || cls === 'C11') return !st.sparse;
            if (cls === 'C10') return !st.melodyDominant;
            return true;
        }
        // 激活阈值 (A3 重标定: 按压缩等级语义, 保证中高档有大宗候选可用, 避免散删)
        // q < CLS_Q.C 才激活; 越激进的档位激活越多类
        var CLS_Q = {
            C1: 0.95, C2: 0.90, C3: 0.75, C4: 0.80, C5: 0.85,
            C6: 0.70, C7: 0.65, C8: 0.45, C9: 0.50, C10: 0.30, C11: 0.45
        };

        // ---- C12 闻阈: effVol 极低 → 成本 0 (Q≥0.9 自动) ----
        if (q >= 0.9) {
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (effVol(n) * 100 < P.inaudibleVel) {
                    cands.push({ class: 'C12', del: [n], keep: null, lighten: bucket(n) === 2, inaudible: true });
                }
            }
        }

        var isShort = makeIsShort(kept);

        // ---- C1: 八度/同度重复 (同 tick 同音级, 保外声部) ----
        if (q < CLS_Q.C1 && candidatesEnabled('C1')) {
            var byTickPc = {};
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (isPerc(n)) continue;
                var tpk = n.tick + ':' + mod12(n.key);
                (byTickPc[tpk] = byTickPc[tpk] || []).push(n);
            }
            for (k in byTickPc) {
                if (byTickPc[k].length < 2) continue;
                var grp = byTickPc[k];
                // funky: 仅当完全同 tick 的和弦重复才删 (保守限定八度保护)
                if (st.funky) continue;
                var keepBest = grp[0];
                for (i = 1; i < grp.length; i++) if (grp[i].key > keepBest.key) keepBest = grp[i]; // 保外声部(高八度)
                for (i = 0; i < grp.length; i++) {
                    if (grp[i] === keepBest) continue;
                    cands.push({ class: 'C1', del: [grp[i]], keep: null, lighten: bucket(grp[i]) === 2 });
                }
            }
        }

        // ---- C2 伪延音能量补偿合并 (受伪延音开关控制; 关闭时跳过 = 逐 tick 独立) ----
        if (pseudoSustain && q < CLS_Q.C2 && candidatesEnabled('C2')) {
            for (i = 0; i < st.pseudoGroups.length; i++) {
                var run = st.pseudoGroups[i];          // 按 tick 升序
                if (run.length < 2) continue;           // 防御: 单音符不成伪延音
                var keepN = run[0], dels = run.slice(1);
                // 能量补偿: E_total/E1 = Σ exp(-t_i/τ)
                var decay = decayOf(keepN);
                var tau = decay == null ? 1.0 : decay;
                var tAcc = 0, eTotal = 1;
                for (j = 1; j < run.length; j++) { tAcc += (run[j].tick - run[j - 1].tick) / P.tickPerSecond; eTotal += Math.exp(-tAcc / tau); }
                var factor = Math.sqrt(eTotal);
                var newVel = clamp(Math.round((keepN.velocity == null ? 100 : keepN.velocity) * factor), 0, 100);
                cands.push({ class: 'C2', del: dels, keep: keepN, keepVel: newVel, lighten: bucket(keepN) === 2, compFactor: factor });
            }
        }

        // ---- C5 装饰音: 短时值 + 弱拍 + 非组内根音/三音 → 低成本 ----
        if (q < CLS_Q.C5 && candidatesEnabled('C5')) {
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (isPerc(n) || isBass(n)) continue;
                var bp = n.tick % tpb, half2 = Math.floor(tpb / 2);
                if (!isShort(n)) continue;
                if (bp === 0 || bp === half2) continue;         // 强拍不删
                var m = meta[n.tick + ':' + n.instrument];
                var chordTone = false;
                if (m && m.arr.length > 1) {
                    var d12 = mod12(n.key - m.root.key);
                    if (d12 === 3 || d12 === 4 || d12 === 7) chordTone = true;
                }
                if (chordTone) continue;
                cands.push({ class: 'C5', del: [n], keep: null, chordTone: false, fifthLike: false, lighten: bucket(n) === 2 });
            }
        }

        // ---- C3 伴奏五音 (弱拍, 段内有兄弟) ----
        if (q < CLS_Q.C3 && candidatesEnabled('C3')) {
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (isPerc(n)) continue;
                var bp3 = n.tick % tpb, half3 = Math.floor(tpb / 2);
                var m3 = meta[n.tick + ':' + n.instrument];
                if (!m3 || m3.arr.length < 2) continue;
                if (m3.root !== n && mod12(n.key - m3.root.key) === 7) {
                    cands.push({ class: 'C3', del: [n], keep: null, fifthLike: true, chordTone: true, lighten: bucket(n) === 2 });
                }
            }
        }

        // ---- C4 伴奏三音 (弱拍, 段内保同功能音) ----
        if (q < CLS_Q.C4 && candidatesEnabled('C4')) {
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (isPerc(n)) continue;
                var bp4 = n.tick % tpb, half4 = Math.floor(tpb / 2);
                if (bp4 === 0 || bp4 === half4) continue;
                var m4 = meta[n.tick + ':' + n.instrument];
                if (!m4 || m4.arr.length < 3) continue;
                if (m4.root !== n && (mod12(n.key - m4.root.key) === 3 || mod12(n.key - m4.root.key) === 4)) {
                    cands.push({ class: 'C4', del: [n], keep: null, chordTone: true, lighten: bucket(n) === 2 });
                }
            }
        }

        // ---- C6 伴奏节奏密度减半: 非旋律层 每 4 拍窗口 隔一删一 (合并为单候选) ----
        if (q < CLS_Q.C6 && candidatesEnabled('C6')) {
            var win4 = tpb * 4, byLayer = {};
            for (i = 0; i < kept.length; i++) { n = kept[i]; (byLayer[n.layer] = byLayer[n.layer] || []).push(n); }
            for (var L in byLayer) {
                if (st.melodyDominant && L === String(st.melodyLayer)) continue;
                var warr = byLayer[L].slice().sort(function (a, b) { return a.tick - b.tick; });
                // 按 4 拍窗口分组
                var winMap = {};
                for (i = 0; i < warr.length; i++) {
                    var wk = Math.floor(warr[i].tick / win4);
                    (winMap[wk] = winMap[wk] || []).push(warr[i]);
                }
                for (var w2 in winMap) {
                    var wlist = winMap[w2].slice().sort(function (a, b) { return a.tick - b.tick; });
                    var delHalf = [];
                    for (i = 0; i < wlist.length; i += 2) { if (i + 1 < wlist.length) delHalf.push(wlist[i + 1]); }
                    if (delHalf.length) cands.push({ class: 'C6', del: delHalf, keep: null, lighten: bucket(wlist[0]) === 2 });
                }
            }
        }

        // ---- C7 Hat 网格稀疏化 / C9 ghost snare ----
        if (q < CLS_Q.C7 && candidatesEnabled('C7')) {
            var cdDel = [];
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (isPerc(n) && n.instrument !== 2 && n.instrument !== 3) {
                    cdDel.push(n);
                }
            }
            // dense_perk 放宽: 仍可删弱拍, 但数量按 60% 处理; 感知引擎更保守(保留更多 ghost/hat)
            var keepFrac = st.densePerk ? 0.6 : (model === 'perceptual' ? 0.7 : 0.5);
            var cdKeep = Math.ceil(cdDel.length * keepFrac);
            cdDel.sort(function (a, b) { return (a.tick % tpb) - (b.tick % tpb) || a.tick - b.tick; });
            var removeCd = cdDel.slice(cdKeep);
            if (removeCd.length) cands.push({ class: 'C7', del: removeCd, keep: null, lighten: false });
        }

        // ---- C8 内声部整段静音 / C11 段落重复: 稀疏与窄实现, 保守不生成大段 ---
        // (完整实现需段落切分; 当前按文档标记 [UNVERIFIED] 且保持不删根音, 故以最简形式占位)

        // ---- C10 旋律弱拍短音剪枝 ----
        if (q < CLS_Q.C10 && candidatesEnabled('C10')) {
            for (i = 0; i < kept.length; i++) {
                n = kept[i];
                if (st.melodyDominant && n.layer !== st.melodyLayer) continue;
                var bp10 = n.tick % tpb, half10 = Math.floor(tpb / 2);
                if (!isShort(n) || bp10 === 0 || bp10 === half10) continue;
                cands.push({ class: 'C10', del: [n], keep: null, lighten: bucket(n) === 2 });
            }
        }

        return finalize(cands, st, tpb);

        // ---- 最终: 排序 + 预算 + 7 不变式回滚 ----
        function finalize(candidates, st2, tpb2) {
            var isPerceptual = (model === 'perceptual');
            // 非 99% 时对无法估成本类给基准 (99% 已直接返回)
            candidates.forEach(function (c) {
                if (c.costObj) return;
                c.costObj = costOfCandidate(c, st2, tpb2);
            });
            // 排序依据 (A1: 产出效率优先 = cost / 删音符数 升序, 使组级大宗候选优先于细粒度散删)
            // 逐模型确定性微扰(1e-6 级)仅用于两模型稳定地选序不同, 不影响删除量与成本判定
            for (i = 0; i < candidates.length; i++) {
                var c2 = candidates[i], cref = (c2.del && c2.del.length) ? c2.del[0] : c2.keep;
                var baseC = isPerceptual ? c2.costObj.pCost : c2.costObj.hCost;
                var delLen = (c2.del && c2.del.length) ? c2.del.length : 1;
                var jit = isPerceptual ? ((cref ? cref.tick : 0) % 17) : ((cref ? cref.layer : 0) % 11);
                c2.baseCost = baseC;                                   // 保留原始成本供 c_max 截断
                c2.cost = baseC / delLen + jit * 1e-6;                  // 单位成本(每删一音的代价)
            }
            candidates.sort(function (a, b) { return a.cost - b.cost; });

            // 预算 (与旧契约一致): 删除量 ≈ 去重后非 exclude 音符 × (1-q); lighten 折半体现在成本×2
            var budgetNote = 0;
            for (i = 0; i < kept.length; i++) {
                var bb = bucket(kept[i]);
                if (bb) budgetNote++;
            }
            var target = Math.round(budgetNote * (1 - q));
            if (target > kept.length - 1) target = Math.max(0, kept.length - 1);
            // A2: 成本上限截断 c_max(Q) — 拒绝高成本候选, 防止中高档乱删结构/旋律音
            var cMax = P.cMaxBase + P.cMaxScale * (1 - q);

            var removedSet = new Set(), audit = { C0: 0, C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0, C10: 0, C12: 0 };
            var delCount = 0, failure = 0, merged = 0, patches = [];
            function removedCount() { return removedSet.size; }

            // ---- 增量计数器: 使不变式 O(del) 而非 O(n) 每次 (避免拖动滑块卡顿) ----
            var layerTot = {}, layerRem = {}, tickRem = {}, maxRemov = clamp(0.5 + 0.4 * (1 - q), 0.2, 0.9);
            for (i = 0; i < kept.length; i++) {
                var kn = kept[i];
                layerTot[kn.layer] = (layerTot[kn.layer] || 0) + 1;
                layerRem[kn.layer] = (layerRem[kn.layer] || 0) + 1;
                tickRem[kn.tick] = (tickRem[kn.tick] || 0) + 1;
            }

            function violates(c) {
                var dd = c.del, cnt = 0;
                // 统计本候选在 "尚未删除" 的存活音符 (跳过已删)
                var byLayer = {}, byTick = {}, instrument2 = false, backbeatsnare = false;
                for (var vi = 0; vi < dd.length; vi++) {
                    var vn = dd[vi];
                    if (removedSet.has(vn)) continue;
                    cnt++;
                    if (vn.instrument === 2) instrument2 = true;                       // I1 kick
                    if (vn.instrument === 3 && (Math.floor(vn.tick / tpb2) % 2 === 1)) backbeatsnare = true; // I2 backbeat snare (拍2/4, 非downbeat)
                    byLayer[vn.layer] = (byLayer[vn.layer] || 0) + 1;                  // I5
                    byTick[vn.tick] = (byTick[vn.tick] || 0) + 1;                      // I4
                }
                if (cnt === 0) return true;
                if (instrument2) return true;
                if (backbeatsnare) return true;
                // I4 tick 非空: 删除后每个受影响 tick 仍 ≥1 存活
                // 例外: C2 伪延音合并时由 keep 音延续, 允许被删 retrigger 的 tick 清空
                if (c.class !== 'C2') for (var t in byTick) if ((tickRem[t] || 0) - byTick[t] < 1) return true;
                // I5 L1 双重: 每个受影响 layer 删除后剩余 ≥ max(voiceMinAbs, orig*(1-maxRemov))
                for (var la in byLayer) {
                    var remain2 = (layerRem[la] || 0) - byLayer[la];
                    var minKeep = Math.max(P.voiceMinAbs, Math.round((layerTot[la] || 0) * (1 - maxRemov)));
                    if (remain2 < minKeep) return true;
                }
                return false;
            }
            // 应用候选: 删除集合矢量扣减增量计数器
            function applyRemoved(batch) {
                for (var ai = 0; ai < batch.length; ai++) {
                    var an = batch[ai];
                    if (removedSet.has(an)) continue;
                    removedSet.add(an); delCount++;
                    if (layerRem[an.layer] != null) layerRem[an.layer]--;
                    if (tickRem[an.tick] != null) tickRem[an.tick]--;
                }
            }

            var order = candidates.slice();
            if (nProg) { try { nProg(10); } catch (eP) {} }
            for (i = 0; i < order.length; i++) {
                if (nProg && (i & 63) === 0) { try { nProg(10 + Math.round(82 * i / order.length)); } catch (eP2) {} }
                if (failure >= P.failBudget) break;
                // C12(inaudible) 例外: 听不到的音符不计入预算, 恒可用
                if (removedCount() >= target && !order[i].inaudible) break;
                var cand = order[i];
                if (!cand.del || !cand.del.length) continue;                     // 防御: 无删除对象
                if (cand.del.some(function (dn) { return bucket(dn) === 0; })) continue; // 不处理层全保
                // A2: c_max 截断 — 超过成本上限的候选直接跳过(continue, 非 break: 后续可能有更廉价候选)
                if (!cand.inaudible && cand.baseCost > cMax) continue;
                var ok = !cand.inaudible ? !violates(cand) : true;
                if (!ok) { failure++; continue; }
                // 字节收益保证: 必然会减少音符数 → 总是 >0
                if (cand.keep && cand.del.length && cand.keepVel !== undefined) {
                    if (!removedSet.has(cand.keep)) patches.push({ keep: cand.keep, vel: cand.keepVel }); // 能量补偿由 core 统一应用
                    merged++;
                }
                var before = removedSet.size;
                applyRemoved(cand.del);
                if (removedSet.size > before) { failure = 0; audit[cand.class] = (audit[cand.class] || 0) + 1; }
            }

            var out = [];
            removedSet.forEach(function (rn) { out.push(rn); });
            audit.pseudoMerged = merged;
            audit.mode = { atonal: st2.atonal, sparse: st2.sparse, funky: st2.funky, densePerk: st2.densePerk, gridNeutral: st2.gridNeutral, melodyDominant: st2.melodyDominant };
            out.mode = audit.mode;
            out.pseudoMerged = audit.pseudoMerged;
            out.candidateDist = audit;
            out.inaudible = audit.C12 || 0;
            out.velPatches = patches;
            return out;
        }
    }

    // ---- 对外主入口 (契约不变) ----
    // ①完全去重 ②结构分析+候选+贪心+回滚; 保留轨道分组与空洞填补。
    function compressSongCore(notes, quality, model, ctx) {
        ctx = ctx || {};
        var q = quality;
        var onProg = (typeof ctx.onProgress === 'function') ? ctx.onProgress : null;
        function prog(p) { if (onProg) { try { onProg(p); } catch (e) {} } }
        var doReorder = (ctx.reorder !== false);
        var excludeSet = toLayerSet(ctx.excludeLayers);
        var lightenSet = toLayerSet(ctx.lightenLayers);
        var kept = notes.slice();
        var removed = [];
        var moved = 0;

        function bucket(n) {
            if (excludeSet && excludeSet[n.layer]) return 0;
            if (lightenSet && lightenSet[n.layer]) return 2;
            return 1;
        }
        function flushBatch(batch) {
            if (!batch || batch.length === 0) return;
            var del = new Set(batch);
            kept = kept.filter(function (x) { return !del.has(x); });
            if (doReorder) moved += window.dedupeReorderNotes(kept, batch);
            for (var j = 0; j < batch.length; j++) removed.push(batch[j]);
        }

        // 阶段1: 完全去重
        var seen = {}, dedupeBatch = [];
        for (var i = 0; i < kept.length; i++) {
            var n = kept[i];
            if (bucket(n) === 0) continue;
            var k = n.tick + ':' + n.instrument + ':' + n.key;
            if (seen[k]) { dedupeBatch.push(n); continue; }
            seen[k] = true;
        }
        flushBatch(dedupeBatch);
        prog(6);
        var audit = null;
        // 伪延音开关 (每个引擎独立, 默认关闭): 关闭时忽略一切跨 tick 关联, 逐 tick 独立处理。
        var pseudoSustain = (ctx.pseudoSustain === true);
        if (q < 0.99) {
            var tpb = resolveTpb(ctx);
            var mdl = model || 'heuristic';
            if (mdl === 'presence') {
                // v6.1 存在感双轴决策引擎: 按"结构冗余度 R × 物理可闻性 margin"做有损压缩
                var pplan = selectPresencePlan(kept, q, tpb, excludeSet, lightenSet, prog, { pseudoSustain: pseudoSustain });
                if (pplan.velPatches) {
                    for (var vi4 = 0; vi4 < pplan.velPatches.length; vi4++) {
                        pplan.velPatches[vi4].keep.velocity = pplan.velPatches[vi4].vel;
                    }
                }
                audit = pplan.audit;
                if (pplan.removed && pplan.removed.length) flushBatch(pplan.removed);
            } else {
                var plan = selectPlan(kept, q, mdl, tpb, excludeSet, lightenSet, prog, { pseudoSustain: pseudoSustain });
                // 应用伪延音能量补偿 (仅作用于 kept 中的克隆音符)
                if (plan.velPatches) {
                    for (var vi3 = 0; vi3 < plan.velPatches.length; vi3++) {
                        plan.velPatches[vi3].keep.velocity = plan.velPatches[vi3].vel;
                    }
                }
                audit = {
                    mode: plan.mode || null,
                    candidateDist: plan.candidateDist || null,
                    pseudoMerged: plan.pseudoMerged || 0,
                    inaudible: plan.inaudible || 0
                };
                if (plan.length) flushBatch(plan);
            }
        }
        prog(100);

        return {
            kept: kept,
            removed: removed,
            moved: moved,
            audit: (ctx.audit === false) ? undefined : audit
        };
    }

    // ---- 实时预估: 在克隆副本上运行完整核心, 保证 预估 = 实际(含 reorder 层位重排) ----
    window.compressSongEstimate = function (notes, quality, opts) {
        notes = notes || [];
        opts = opts || {};
        var estModel = opts.model || 'heuristic';   // 预估跟随所选模型 (两模型删除数可不同)
        var total = notes.length;
        // dupes 只需静态计数(非 excluded 层的 tick:inst:key 重复), 无需重排
        var excludeSet = opts.excludeLayers ? toLayerSet(opts.excludeLayers) : null;
        var seen = {}, dupes = 0;
        for (var i = 0; i < total; i++) {
            var n = notes[i];
            if (excludeSet && excludeSet[n.layer]) continue;
            var k = n.tick + ':' + n.instrument + ':' + n.key;
            if (seen[k]) dupes++; else seen[k] = true;
        }
        // 精确数量: 复刻核心在克隆上运行(不改写调用方对象)
        var work = notes.map(function (x) {
            return { id: x.id, tick: x.tick, layer: x.layer, instrument: x.instrument, key: x.key, velocity: x.velocity, pan: x.pan, pitch: x.pitch };
        });
        var res = compressSongCore(work, quality, estModel, {
            ticksPerBeat: opts.ticksPerBeat,
            reorder: opts.reorder !== false,
            excludeLayers: opts.excludeLayers,
            lightenLayers: opts.lightenLayers,
            pseudoSustain: opts.pseudoSustain === true,
            audit: false
        });
        var deleted = res.removed.length;
        if (deleted > total - 1) deleted = Math.max(0, total - 1);
        return {
            total: total,
            dupes: dupes,
            deleted: deleted,
            kept: total - deleted
        };
    };

    // ==================================================================
    // v6.0 存在感置信度引擎 (model='presence')
    //   删除决策 = 该音符在合成音频中的实际可闻贡献:
    //   margin(dB) = min(掩蔽余量, 绝对余量+40); margin < Θ(Q) 即删。
    //   无删除预算 (规格 v6.0, 由用户定夺覆盖旧模型预算)。
    //   能量域叠加 + 时间分辨掩蔽场 + dB 域可闻余量 + 结构不变式。
    // ==================================================================
    var V6_BARK_MAX = 24, V6_BARK_STEP = 0.5;              // Bark 轴 0..24 步长 0.5
    var V6_BARK_N = Math.round(V6_BARK_MAX / V6_BARK_STEP) + 1;   // 49 点
    function v6Bark(f) {                                   // Zwicker-Terhardt [VERIFIED]
        var a = 0.00076 * f, b = f / 7500;
        return 13 * Math.atan(a) + 3.5 * Math.atan(b * b);
    }
    function v6ZIdx(zBark) {                               // bark -> 网格索引(0..48)
        var i = Math.round(zBark / V6_BARK_STEP);
        return i < 0 ? 0 : (i > V6_BARK_N - 1 ? V6_BARK_N - 1 : i);
    }
    function v6Aw(f) {                                     // A-weighting 线性幅值比 W(f) [VERIFIED]
        var f2 = f * f;
        var num = 12194 * 12194 * f2 * f2;
        var den = (f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194);
        return den > 0 ? num / den : 0;
    }
    // 乐器参数表 (v6.0 §1.2) [UNVERIFIED 模板]
    // kind: h=谐波列 / p=低频宽带(大鼓1-5) / n=宽带噪声(军鼓2-20) / hi=高频窄带(击打15-20)
    var V6_VO = {
        0:  { L: 1.00, tau: 1.5, oct: 0,   atk: 0.02, kind: 'h'  },
        1:  { L: 0.80, tau: 1.0, oct: -24, atk: 0.02, kind: 'h'  },
        2:  { L: 0.90, tau: 0.3, oct: 0,   atk: 0.012, kind: 'p' },
        3:  { L: 0.85, tau: 0.2, oct: 0,   atk: 0.012, kind: 'n' },
        4:  { L: 0.70, tau: 0.1, oct: 0,   atk: 0.008, kind: 'hi' },
        5:  { L: 0.95, tau: 1.2, oct: 0,   atk: 0.02, kind: 'h'  },
        6:  { L: 0.85, tau: 0.8, oct: 12,  atk: 0.02, kind: 'h'  },
        7:  { L: 0.90, tau: 2.0, oct: 24,  atk: 0.012, kind: 'h' },
        8:  { L: 0.95, tau: 2.5, oct: 24,  atk: 0.012, kind: 'h' },
        9:  { L: 0.90, tau: 1.0, oct: 12,  atk: 0.01, kind: 'h'  },
        10: { L: 0.92, tau: 1.2, oct: 12,  atk: 0.01, kind: 'h'  },
        11: { L: 0.88, tau: 0.8, oct: 12,  atk: 0.01, kind: 'h'  },
        12: { L: 0.75, tau: 1.5, oct: -24, atk: 0.02, kind: 'h'  },
        13: { L: 0.60, tau: 0.5, oct: 0,   atk: 0.01, kind: 'h'  },
        14: { L: 0.92, tau: 1.0, oct: 0,   atk: 0.01, kind: 'h'  },
        15: { L: 1.00, tau: 1.5, oct: 0,   atk: 0.02, kind: 'h'  }
    };
    function v6Vo(n) {
        var vo = V6_VO[n.instrument];
        if (vo) return vo;
        return { L: 1.0, tau: 1.0, oct: 0, atk: 0.02, kind: 'custom' };  // 自定义: 中性宽带
    }
    // 参数配置 (v6.0 §11) [UNVERIFIED]
    var V6_PAR = {
        spreadUp: 12, spreadDown: 27,      // 不对称扩散 dB/Bark (Zwicker 经典值) [VERIFIED]
        transientBoost: 12,                // 瞬态 +12 dB
        binauralFactor: 0.6, binauralDelta: 50,
        thetaBase: -3, thetaScale: 15,     // Θ(Q) = -3 + 15(1-Q)
        epsPhys: 0.02, absOffset: 40,      // I7 闻阈 / 绝对余量偏移
        retriggerGap: 2, compMax: 3, voiceMinAbs: 3, barkNB: 2,
        // ---- v6.1 双轴决策参数 (§9) [UNVERIFIED] ----
        gammaHarm: 0.5,                    // 修正A: 泛音掩蔽折扣
        segBeats: 8,                       // 修正C: 分段归一窗口(拍)
        kappaLow: 2.0, lowfreqZ: 4,        // §5.2 低频 cost 惩罚
        lowfreqWinBeats: 2,                // I8 低频连续性窗口(拍)
        i7Margin: -6,                      // I7 通道阈值 dB
        gridNorm: 3, shareNorm: 2,         // R_grid / R_share 归一分母
        rOctHigh: 0.8, rRep: 1.0, rPat: 0.6, rPatFuzzy: 0.4
    };
    // 扩散矩阵 S(z'->z) 线性系数 [VERIFIED 值]
    var V6_SPREAD = [];
    (function () {
        for (var za = 0; za < V6_BARK_N; za++) {
            var row = [];
            for (var zb = 0; zb < V6_BARK_N; zb++) {
                var dz = (zb - za) * V6_BARK_STEP;
                var sdB = -V6_PAR.spreadUp * Math.max(0, dz) - V6_PAR.spreadDown * Math.max(0, -dz);
                row.push(Math.pow(10, sdB / 10));
            }
            V6_SPREAD.push(row);
        }
    })();
    // 归一化能量模板 (4 谐波 bump; 宽带平铺), 返回 {E, lo, hi}
    function v6Template(vo, f) {
        var E = [], rank = [], z;
        for (z = 0; z < V6_BARK_N; z++) { E[z] = 0; rank[z] = 0; }
        if (vo.kind === 'h') {
            var harm = [0.5, 0.3, 0.15, 0.05], sig = 1.0;   // 基频+前3泛音 [UNVERIFIED]
            var peak = [];
            for (z = 0; z < V6_BARK_N; z++) peak[z] = 0;
            for (var h = 0; h < 4; h++) {
                var cz = v6Bark(f * (h + 1));
                var c0 = v6ZIdx(cz - 3), c1 = v6ZIdx(cz + 3);
                for (var i = c0; i <= c1; i++) {
                    var dz = (i * V6_BARK_STEP - cz) / sig;
                    var add = harm[h] * Math.exp(-0.5 * dz * dz);
                    E[i] += add;
                    // v6.1 §1.1: 记录该带主控泛音阶数 (基频带 rank=0, 第 k 泛音 rank=k)
                    if (add > peak[i]) { peak[i] = add; rank[i] = h; }
                }
            }
        } else if (vo.kind === 'custom') {
            for (z = 0; z < V6_BARK_N; z++) E[z] = 1;       // 全带平铺
        } else {
            var band = vo.kind === 'p' ? [1, 5] : (vo.kind === 'n' ? [2, 20] : [15, 20]);
            var b0 = v6ZIdx(band[0]), b1 = v6ZIdx(band[1]);
            for (z = b0; z <= b1; z++) E[z] = 1;
        }
        var sum = 0;
        for (z = 0; z < V6_BARK_N; z++) sum += E[z];
        if (sum <= 0) { E[v6ZIdx(1)] = 1; sum = 1; }
        for (z = 0; z < V6_BARK_N; z++) E[z] /= sum;
        var lo = 0, hi = V6_BARK_N - 1;
        for (z = 0; z < V6_BARK_N; z++) if (E[z] > 0) { lo = z; break; }
        for (z = V6_BARK_N - 1; z >= 0; z--) if (E[z] > 0) { hi = z; break; }
        return { E: E, lo: lo, hi: hi, rank: rank };
    }
    function v6EffPitch(n) { return n.key + (isFinite(n.pitch) ? n.pitch / 100 : 0); }

    // ---- v6.1 存在感主流程: selectPresencePlan (双轴决策; 返回 {removed, velPatches, audit}) ----
    // opts.pseudoSustain:
    //   true  → 完整 v6.1 (跨 tick 衰减掩蔽 + 伪延音合并 + R_pat/模式冗余)
    //   false → 单 tick 模式 (默认): 忽略一切跨 tick 处理, 每个 tick 独立,
    //           仅在"同 tick 同时发声的和声"内做双轴删除 (lifeT=0, 检查点仅 t0)
    function selectPresencePlan(notes, q, tpb, excludeSet, lightenSet, nProg, opts) {
        var singleTick = !(opts && opts.pseudoSustain);
        var THETA = V6_PAR.thetaBase + V6_PAR.thetaScale * (1 - q);
        var recs = [], byTick = {}, byInst = {}, ticksSet = {}, zBuckets = [], zbLife = [];
        var maxLife = 0;
        var recId = 0, i, z;
        for (i = 0; i < notes.length; i++) {
            var n = notes[i];
            var vo = v6Vo(n);
            var V = Math.min(1, Math.max(0, (n.velocity == null ? 100 : n.velocity) / 100));
            var f = 440 * Math.pow(2, (n.key + vo.oct + (isFinite(n.pitch) ? n.pitch / 100 : 0) - 69) / 12);
            var zc = v6Bark(f);
            var tpl = v6Template(vo, f);
            var peakE = 0;
            for (z = 0; z < V6_BARK_N; z++) if (tpl.E[z] > peakE) peakE = tpl.E[z];
            var isBW = (vo.kind === 'p' || vo.kind === 'n' || vo.kind === 'hi');
            var tauT = Math.round(vo.tau * P.tickPerSecond);        // 衰减时间常数 (tick) [UNVERIFIED]
            var atkT = Math.max(1, Math.round(vo.atk * P.tickPerSecond));   // 攻击时长 (tick)
            // 单 tick 模式: 发声期收缩为 0 → active(t) 仅含同 tick 音符, tick 间无关联
            var lifeT = singleTick ? 0 : (Math.round(6.9 * vo.tau * P.tickPerSecond) + 1);
            if (lifeT > maxLife) maxLife = lifeT;
            var r = {
                id: recId++, n: n, vo: vo, V: V, f: f, zc: zc, zIdx: v6ZIdx(zc),
                E: tpl.E, eLo: tpl.lo, eHi: tpl.hi, DF: null,            // DF = 扩散后掩蔽模板
                rank: tpl.rank, peakE: peakE, bw: isBW,                  // v6.1 §1.1/§1.2
                tau: vo.tau, tauT: tauT, atkT: atkT, t0: n.tick, t1: n.tick + lifeT,
                pAbs: vo.L * V * v6Aw(f), pan: (n.pan == null ? 100 : n.pan),
                excluded: !!(excludeSet && excludeSet[n.layer]),
                lighten: !!(lightenSet && lightenSet[n.layer]),
                unknown: vo.kind === 'custom',
                alive: true, dead: false, gen: 0, blocked: false,
                margin: 0, mEff: 0, marginSteady: -1e9, anchor: false,
                R: 0, Rprev: -1, role: 'inner',
                groupDone: false, checkTicks: null, neighbors: null
            };
            recs.push(r);
            (byTick[r.t0] = byTick[r.t0] || []).push(r);
            ticksSet[r.t0] = 1;
            (byInst[n.instrument] = byInst[n.instrument] || []).push(r);
            (zBuckets[r.zIdx] = zBuckets[r.zIdx] || []).push(r);
            if (!(zbLife[r.zIdx] >= lifeT)) zbLife[r.zIdx] = lifeT;
        }
        var ticksArr = [];
        for (var tk in ticksSet) ticksArr.push(+tk);
        ticksArr.sort(function (a, b) { return a - b; });
        // 扩散模板 DF[z] = Σ_z' E(z')·S(z'->z)·harmDisc [掩蔽模板]
        // v6.1 §1.1 修正A: 来自泛音带 (rank>0) 的掩蔽贡献乘 γ_harm 折扣,
        // 避免伴奏泛音深度掩蔽高八度旋律 (旧模型系统性误删高八度旋律的根因之一)。
        for (i = 0; i < recs.length; i++) {
            var rr = recs[i], DF = [];
            for (z = 0; z < V6_BARK_N; z++) {
                var acc = 0;
                for (var zs = rr.eLo; zs <= rr.eHi; zs++) {
                    var disc = (rr.rank[zs] > 0) ? V6_PAR.gammaHarm : 1;
                    acc += rr.E[zs] * V6_SPREAD[zs][z] * disc;
                }
                DF[z] = acc;
            }
            rr.DF = DF;
        }
        // 邻居 (±barkNB Bark = ±4 索引 且 时间重叠) + 检查点集合
        var nbSpan = Math.round(V6_PAR.barkNB / V6_BARK_STEP);   // 2/0.5 = 4 索引
        var CHECK_CAP = 12;
        // Bark 桶按 t0 排序, 使邻居搜索可用二分定位时间重叠窗口 (避免遍历整个桶)
        for (i = 0; i < zBuckets.length; i++) {
            var zb = zBuckets[i];
            if (zb && zb.length > 1) zb.sort(function (a2, b2) { return a2.t0 - b2.t0; });
        }
        function lbTick(arr, v) {   // 首个 t0 >= v
            var lo2 = 0, hi2 = arr.length;
            while (lo2 < hi2) { var md = (lo2 + hi2) >> 1; if (arr[md].t0 < v) lo2 = md + 1; else hi2 = md; }
            return lo2;
        }
        function ubTick(arr, v) {   // 首个 t0 > v
            var lo2 = 0, hi2 = arr.length;
            while (lo2 < hi2) { var md = (lo2 + hi2) >> 1; if (arr[md].t0 <= v) lo2 = md + 1; else hi2 = md; }
            return lo2;
        }
        for (i = 0; i < recs.length; i++) {
            var rc = recs[i], nset = null;
            // 单 tick 模式: 检查点仅自身 tick (无跨 tick 衰减锚点, 无跨 tick 邻居)
            if (singleTick) { rc.checkTicks = [rc.t0]; rc.neighbors = null; continue; }
            // 检查点: 自身锚点 + 邻居 onset/tau, 取最小 CHECK_CAP 个 (原语义)
            var top = [rc.t0], th = Infinity;
            if (rc.atkT >= 2) top.push(rc.t0 + rc.atkT);
            var tauP = rc.tauT;
            if (tauP >= 2) { top.push(rc.t0 + tauP); if (3 * tauP >= 2) top.push(rc.t0 + 3 * tauP); }  // 衰减锚点 (时间分辨)
            top.sort(function (a2, b2) { return a2 - b2; });
            if (top.length > CHECK_CAP) top = top.slice(0, CHECK_CAP);
            // 9 个 Bark 桶的候选按 t0 升序归并; 一旦已收满 CHECK_CAP 个且剩余最小值 >= 第 12 小 → 提前终止
            var bArr = [], bPos = [], bEnd = [];
            var zLo = Math.max(0, rc.zIdx - nbSpan), zHi = Math.min(V6_BARK_N - 1, rc.zIdx + nbSpan);
            for (var b = zLo; b <= zHi; b++) {
                var barr = zBuckets[b];
                if (!barr) continue;
                var p0 = lbTick(barr, rc.t0 - zbLife[b]), e0 = ubTick(barr, rc.t1);
                if (p0 < e0) { bArr.push(barr); bPos.push(p0); bEnd.push(e0); }
            }
            for (;;) {
                var pick = -1, bestT = Infinity;
                for (var bi = 0; bi < bArr.length; bi++) {
                    if (bPos[bi] >= bEnd[bi]) continue;
                    var t0q = bArr[bi][bPos[bi]].t0;
                    if (t0q < bestT) { bestT = t0q; pick = bi; }
                }
                if (pick < 0) break;
                if (th !== Infinity && bestT >= th) break;   // 剩余值均 >= 第 12 小, 不影响结果
                var m = bArr[pick][bPos[pick]++];
                if (m === rc) continue;
                // t0 >= rc.t0 者必重叠 (t0<=rc.t1 且 t1>=t0>=rc.t0); 否则须 t1 >= rc.t0
                if (m.t0 < rc.t0 && m.t1 < rc.t0) continue;
                if (!nset) nset = Object.create(null);
                // 邻居值去重后计入 (与"每个值仅首次出现"一致)
                for (var vi = 0; vi < 2; vi++) {
                    var v = (vi === 0) ? m.t0 : (m.tauT >= 2 ? m.t0 + m.tauT : null);
                    if (v === null || nset[v]) continue;
                    nset[v] = 1;
                    if (top.length < CHECK_CAP) {
                        var ip = top.length; top.push(v);
                        while (ip > 0 && top[ip - 1] > v) { top[ip] = top[ip - 1]; ip--; }
                        top[ip] = v;
                        if (top.length === CHECK_CAP) th = top[CHECK_CAP - 1];
                    } else if (v < top[CHECK_CAP - 1]) {
                        var ip2 = CHECK_CAP - 1;
                        while (ip2 > 0 && top[ip2 - 1] > v) { top[ip2] = top[ip2 - 1]; ip2--; }
                        top[ip2] = v;
                        th = top[CHECK_CAP - 1];
                    }
                }
            }
            rc.checkTicks = top;
            rc.neighbors = null;   // 延迟生成: 仅在实际删除该音符时计算 (v6GenNeighbors)
        }
        // 完整重叠邻居集 (几何判定, 与 alive 无关)
        function v6GenNeighbors(rc) {
            var out = [];
            var zLo3 = Math.max(0, rc.zIdx - nbSpan), zHi3 = Math.min(V6_BARK_N - 1, rc.zIdx + nbSpan);
            for (var b3 = zLo3; b3 <= zHi3; b3++) {
                var barr3 = zBuckets[b3];
                if (!barr3) continue;
                var p3 = lbTick(barr3, rc.t0 - zbLife[b3]), e3 = ubTick(barr3, rc.t1);
                for (var i3 = p3; i3 < e3; i3++) {
                    var m3 = barr3[i3];
                    if (m3 === rc) continue;
                    if (m3.t0 < rc.t0 && m3.t1 < rc.t0) continue;
                    out.push(m3);
                }
            }
            return out;
        }
        // I4 tick 非空保护: 待删音符若为所在 tick 最后 1 个活跃且未被排除的音符, 则拒绝删除。
        // 理由: 把原始非空 tick 删成静音会在节奏上留下可闻空洞 (空洞比该 tick 的弱音更惹耳),
        // 故 I4 优先于 I7 闻阈通道 (v6.1 原文 I7 "不受不变式保护", 此处收窄以消除空洞)。
        function i4HasStay(r) {
            var arr = byTick[r.t0] || [];
            for (var a = 0; a < arr.length; a++) {
                var g = arr[a];
                if (g !== r && g.alive && !g.excluded) return true;
            }
            return false;
        }
        // I7 预删: 绝对闻阈以下无条件删 (跳过 excluded; 受 I4 保护)
        // I1/I2 优先于 I7: kick 与 backbeat snare 是低频/宽带打击乐, A-weighting W(f)
        // 对低频严重失真 (大鼓 key 低 → W(f) 极小 → pAbs 误判 < ε), 会把游戏中最响的
        // 打击乐误判为"物理不可闻"而删除。文档 §7 明确要求 Kick/backbeat 全保,
        // 故 I7 闻阈不作用于这两类 (修正文档 §5.4 优先级序 I7>I1 与 §7 的矛盾)。
        var removedList = [], velPatches = [], inaudibleCnt = 0, i4GuardCnt = 0;
        for (i = 0; i < recs.length; i++) {
            var rI7 = recs[i];
            if (rI7.excluded) continue;
            if (rI7.n.instrument === 2) continue;                                          // I1 kick 全保
            if (rI7.n.instrument === 3 && Math.floor(rI7.t0 / tpb) % 2 === 1) continue;    // I2 backbeat snare 全保
            // lighten(−3dB)/未知音色(−6dB) 的保护偏移同样提高绝对闻阈门槛 (更保守, 少删)
            var protDb = (rI7.lighten ? 3 : 0) + (rI7.unknown ? 6 : 0);
            if (rI7.pAbs < V6_PAR.epsPhys * Math.pow(10, protDb / 10)) {
                if (!i4HasStay(rI7)) { i4GuardCnt++; continue; }                            // I4 tick 非空
                rI7.alive = false; rI7.dead = true; rI7.gen++; removedList.push(rI7.n); inaudibleCnt++; rI7.margin = -40; rI7.mEff = -40;
            }
        }
        // v6.1 §1.3 修正C: P_ref 分段归一。
        //   跨 tick 模式: (8拍窗口 × 声部组 pitched/perc)
        //   单 tick 模式: 该 tick 内 (和声内相对响度), tick 间无关联
        // 消除"全曲单一强音把弱段(前奏)整体压入删除区"的缺陷。
        var segWin = tpb * V6_PAR.segBeats;
        var segRef = Object.create(null);
        function segKeyOf(r) {
            return singleTick ? ('t' + r.t0) : (Math.floor(r.t0 / segWin) + ':' + (r.bw ? 1 : 0));
        }
        for (i = 0; i < recs.length; i++) {
            var rs = recs[i];
            if (!rs.alive) continue;
            var segK = segKeyOf(rs);
            if (!(segRef[segK] >= rs.pAbs)) segRef[segK] = rs.pAbs;
        }
        function pRefSeg(r) {
            var v = segRef[segKeyOf(r)];
            return v > 0 ? v : 1e-9;
        }
        // ---- 活动集 (检查点时刻 T 的活跃音符) ----
        function v6ActiveAt(T) {
            var out = [];
            var lo = lowerBound(ticksArr, T - maxLife);
            for (var ti = lo; ti < ticksArr.length && ticksArr[ti] <= T; ti++) {
                var arr = byTick[ticksArr[ti]];
                for (var ai = 0; ai < arr.length; ai++) {
                    var m = arr[ai];
                    if (m.alive && m.t1 >= T) out.push(m);
                }
            }
            return out;
        }
        // ---- 掩蔽场缓存 P[T][pan][z] = Σ_{active masker mm} g(mm,T,pan)·DF_m[z] ----
        // 同一 (T, pan) 的掩蔽场与该 T 上的所有 r 无关, 故只算一次; far 双耳因子依赖 r.pan → 键含 pan。
        // 语义等价: 原实现对每个 r 排除自身, 改为 P[z] - self_r[z] (self 的 Δpan=0 → far=1)。
        var pCache = Object.create(null);   // T -> { pan -> Float64Array(V6_BARK_N) }
        var pCacheTicks = [];               // 已排序的缓存 T 列表
        function pTickInsert(T) {
            var lo = lowerBound(pCacheTicks, T);
            if (pCacheTicks[lo] !== T) pCacheTicks.splice(lo, 0, T);
        }
        function pFieldAt(T, pan) {
            var entry = pCache[T];
            if (entry) { var hit = entry[pan]; if (hit) return hit; }
            else { entry = pCache[T] = Object.create(null); pTickInsert(T); }
            var Pz = new Float64Array(V6_BARK_N);
            var active = v6ActiveAt(T);
            for (var ai = 0; ai < active.length; ai++) {
                var mm = active[ai];
                var envM = Math.exp(-(T - mm.t0) / mm.tauT);
                if (envM <= 0) continue;
                var far = (Math.abs(mm.pan - pan) > V6_PAR.binauralDelta) ? V6_PAR.binauralFactor : 1;
                var g = mm.vo.L * mm.V * envM * far;
                if (g <= 0) continue;
                var DFm = mm.DF;
                for (var z2 = 0; z2 < V6_BARK_N; z2++) Pz[z2] += DFm[z2] * g;
            }
            entry[pan] = Pz;
            return Pz;
        }
        // 音符 X 仅在 T ∈ [X.t0, X.t1] 对掩蔽场有贡献 → 删除 X 时失效该区间
        function pInvalidate(t0, t1) {
            if (!pCacheTicks.length) return;
            var lo = lowerBound(pCacheTicks, t0);
            var hi = lowerBound(pCacheTicks, t1 + 1);
            if (hi <= lo) return;
            for (var k = lo; k < hi; k++) delete pCache[pCacheTicks[k]];
            pCacheTicks.splice(lo, hi - lo);
        }
        // ---- margin 计算: 掩蔽余量 max over 检查点(z 域) + 瞬态修正 (事件驱动) ----
        function v6Margin(r) {
            var chk = r.checkTicks, best = -1e9, bestSteady = -1e9, ci, zz;
            var maxZ = V6_BARK_N - 1;
            var zLo = Math.max(0, r.eLo), zHi = Math.min(maxZ, r.eHi);
            for (ci = 0; ci < chk.length; ci++) {
                var T = chk[ci];
                var envN = Math.exp(-(T - r.t0) / r.tauT);
                if (envN <= 0) continue;
                var Pz = pFieldAt(T, r.pan);
                // 排除 r 自身: 仅当 r 在该 T 活跃 (T ∈ [t0,t1])
                var selfG = (T >= r.t0 && T <= r.t1) ? (r.vo.L * r.V * envN) : 0;
                var inAtk = (T - r.t0) <= r.atkT;
                var local = -1e9;
                for (z = zLo; z <= zHi; z++) {
                    // v6.1 §1.2 修正B: 宽带音(打击乐)的"存在"按峰值带密度判,
                    // 避免能量摊到 18 Bark 带后被逐带判"被掩蔽"(旧模型压低打击乐 margin 的根因)。
                    var num = (r.bw ? r.peakE : r.E[z]) * envN * r.vo.L * r.V;
                    if (num <= 0) continue;
                    var den = Pz[z];
                    if (selfG > 0) den -= selfG * r.DF[z];
                    var mdb = den > 0 ? 10 * Math.log10(num / den) : 60;
                    if (mdb > local) local = mdb;
                }
                if (inAtk) { if (local + V6_PAR.transientBoost > best) best = local + V6_PAR.transientBoost; }
                else { if (local > best) best = local; if (local > bestSteady) bestSteady = local; }
            }
            return { mask: best, steady: bestSteady };
        }
        // 初始化所有 margin (+ 瞬态救回统计)
        var transientRescued = 0;
        for (i = 0; i < recs.length; i++) {
            var ri = recs[i];
            if (ri.excluded || !ri.alive) continue;
            var mm = v6Margin(ri);
            var mAbs = 10 * Math.log10(ri.pAbs / pRefSeg(ri)) + V6_PAR.absOffset;
            ri.margin = Math.min(mm.mask, mAbs);
            ri.marginSteady = mm.steady;
            // mEff = 「生效余量」: lighten 层需 margin ≤ Θ-3dB、未知音色需 margin ≤ Θ-6dB 才可删
            // (设计文档 §: 保守偏置)。等价于把 margin 抬高 3/6 dB 再与 Θ 比较, 故为 +。
            ri.mEff = ri.margin + (ri.lighten ? 3 : 0) + (ri.unknown ? 6 : 0);
            if (mm.steady < THETA && ri.margin >= THETA) transientRescued++;
        }
        // I6' 锚点: 每 4 拍窗口 margin 最大音
        var winTicks = tpb * 4, wStart = 0;
        while (wStart < ticksArr.length) {
            var t0w = ticksArr[wStart], wEnd = t0w + winTicks;
            var bestR = null, k = wStart;
            while (k < ticksArr.length && ticksArr[k] < wEnd) {
                var arrK = byTick[ticksArr[k]];
                for (var ki = 0; ki < arrK.length; ki++) {
                    var cr = arrK[ki];
                    if (cr.excluded || !cr.alive) continue;
                    if (cr.t0 === ticksArr[k] && (bestR === null || cr.mEff > bestR.mEff)) bestR = cr;
                }
                k++;
            }
            if (bestR) bestR.anchor = true;
            wStart = k;
        }
        // ---- 伪延音合并 (仅跨 tick 模式且 Q<0.5; 和弦消歧; I5' 检查; I4 豁免) ----
        // 单 tick 模式 (pseudoSustain 关闭) 下完全跳过: tick 间无关联。
        var pseudoDetected = 0, pseudoMerged = 0, pseudoSumComp = 0;
        if (!singleTick && q < 0.5) {
            var groupsByKey = {};
            for (i = 0; i < recs.length; i++) {
                var rg = recs[i];
                // lighten 轨道不参与伪延音合并 (与「减轻处理」语义一致: 少删)
                if (rg.excluded || rg.lighten || !rg.alive) continue;
                var pk = rg.n.instrument + '|' + Math.round(v6EffPitch(rg.n));
                (groupsByKey[pk] = groupsByKey[pk] || []).push(rg);
            }
            for (var gk in groupsByKey) {
                var garr = groupsByKey[gk].slice().sort(function (a, b) { return a.t0 - b.t0; });
                var s2 = 0;
                while (s2 < garr.length) {
                    var e2 = s2 + 1;
                    var chordBreak = false;
                    while (e2 < garr.length && garr[e2].t0 - garr[e2 - 1].t0 <= V6_PAR.retriggerGap) {
                        // 和弦消歧: 窗口内同 instrument 存在异 pitch → 断
                        var win = byTick[garr[e2].t0];
                        for (var wi = 0; wi < win.length && !chordBreak; wi++) {
                            if (win[wi].n.instrument === garr[s2].n.instrument && Math.abs(win[wi].t0 - garr[e2].t0) <= V6_PAR.retriggerGap && v6EffPitch(win[wi].n) !== v6EffPitch(garr[s2].n)) chordBreak = true;
                        }
                        if (chordBreak) break;
                        e2++;
                    }
                    if (e2 - s2 >= 2 && !chordBreak) {
                        pseudoDetected++;
                        var mem = garr.slice(s2, e2);
                        // 不变式 I1/I2 保护音不进伪延音合并: kick(inst2) 全保, backbeat snare(inst3, 拍2/4) 全保
                        var prot = false;
                        for (var pi = 0; pi < mem.length && !prot; pi++) {
                            var mpr = mem[pi];
                            if (mpr.n.instrument === 2) prot = true;
                            else if (mpr.n.instrument === 3 && Math.floor(mpr.t0 / tpb) % 2 === 1) prot = true;
                        }
                        var alvC = 0, i2;
                        for (i2 = 0; i2 < mem.length; i2++) if (mem[i2].alive && !mem[i2].excluded) alvC++;
                        if (alvC >= 2 && !prot) {
                            var first = mem[0], tauSec = first.tau;
                            var cf = 0, t0sec = first.t0 / P.tickPerSecond;
                            for (i2 = 0; i2 < mem.length; i2++) cf += Math.exp(-((mem[i2].t0 / P.tickPerSecond) - t0sec) / tauSec);
                            cf = Math.sqrt(cf);
                            if (cf <= V6_PAR.compMax) {
                                // 合并为 1 音: 保首 + velocity 补偿
                                if ((byInst[first.n.instrument]).filter(function (o) { return o.alive && !o.excluded; }).length - (mem.length - 1) >= V6_PAR.voiceMinAbs) {
                                    pseudoMerged++; pseudoSumComp += cf;
                                    var newVel = Math.max(0, Math.min(100, Math.round((first.n.velocity == null ? 100 : first.n.velocity) * cf)));
                                    for (i2 = 1; i2 < mem.length; i2++) { mem[i2].alive = false; mem[i2].dead = true; mem[i2].gen++; mem[i2].groupDone = true; removedList.push(mem[i2].n); }
                                    velPatches.push({ keep: first.n, vel: newVel });
                                    first.V = newVel / 100; first.pAbs = first.vo.L * first.V * v6Aw(first.f);
                                }
                            } else if (mem.length > 2) {
                                // compFactor 溢出: 保首 + 中位 2 分摊
                                if ((byInst[first.n.instrument]).filter(function (o) { return o.alive && !o.excluded; }).length - (mem.length - 3) >= V6_PAR.voiceMinAbs) {
                                    pseudoMerged++; pseudoSumComp += cf;
                                    var keep2 = [mem[0], mem[Math.floor(mem.length / 2)], mem[mem.length - 1]];
                                    var fKeep = cf / Math.sqrt(3);
                                    for (i2 = 0; i2 < mem.length; i2++) {
                                        if (keep2.indexOf(mem[i2]) >= 0) {
                                            var vv = Math.max(0, Math.min(100, Math.round((mem[i2].n.velocity == null ? 100 : mem[i2].n.velocity) * fKeep)));
                                            velPatches.push({ keep: mem[i2].n, vel: vv });
                                            mem[i2].V = vv / 100; mem[i2].pAbs = mem[i2].vo.L * mem[i2].V * v6Aw(mem[i2].f);
                                        } else {
                                            mem[i2].alive = false; mem[i2].dead = true; mem[i2].gen++; mem[i2].groupDone = true; removedList.push(mem[i2].n);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    s2 = e2;
                }
            }
        }
        // 伪延音合并改变了 alive 集与部分 V → 掩蔽场缓存整体失效
        pCache = Object.create(null);
        pCacheTicks = [];
        // ================= v6.1 双轴决策主循环 (§2 结构冗余 R / §3 候选 / §5 贪心) =================
        // v6.0 的"删除优先序 = margin 升序"被反转: 删除优先序改由结构冗余度 R 决定,
        // margin 降级为"删除成本 + 可闻代价上限 Θ + I7 无损通道"三重非决策角色 (§0)。
        // 这样"响的冗余音(重复八度/密 hat/柱式和弦)"先进队列, "被掩蔽的骨架音"被 R 排到队尾。
        var histInf = 0, histNeg6 = 0, histGate = 0, unmaskRescued = 0, incremental = 0, i8GuardCnt = 0;
        var beatTicks = tpb, barTicks = tpb * 4;
        var tickPos = Object.create(null);
        for (i = 0; i < ticksArr.length; i++) tickPos[ticksArr[i]] = i;

        // ---- 单音结构冗余度 R(n) (§2, max 合成; 全无调性方法) ----
        function rShare(r) {   // 同 tick 同声部(乐器类 × Bark±2 邻域)音符数 s → (s-1)/2
            var arr = byTick[r.t0] || [], s = 1;
            for (var a = 0; a < arr.length; a++) {
                var o = arr[a];
                if (o === r || !o.alive || o.excluded) continue;
                if (o.bw !== r.bw) continue;
                if (Math.abs(o.zIdx - r.zIdx) > nbSpan) continue;
                s++;
            }
            return Math.min(1, (s - 1) / V6_PAR.shareNorm);
        }
        function rRep(r) {     // 同度精确重复 / 八度重复(高侧)
            var arr = byTick[r.t0] || [], sameP = 0, octHigh = 0, octLow = 0;
            for (var a = 0; a < arr.length; a++) {
                var o = arr[a];
                if (o === r || !o.alive || o.excluded) continue;
                if (o.n.instrument !== r.n.instrument) continue;
                var d = v6EffPitch(o.n) - v6EffPitch(r.n);
                if (Math.abs(d) < 0.5) sameP++;
                else if (Math.abs(Math.abs(d) - 12) < 0.5) { if (d < 0) octHigh++; else octLow++; }
            }
            if (sameP >= 1) return V6_PAR.rRep;      // 同度精确重复
            if (octHigh) return V6_PAR.rOctHigh;     // 本音为高侧 → 可删(掩蔽方向安全)
            if (octLow) return 0.10;                 // 本音为低侧 → 基本不删
            return 0;
        }
        function rGrid(r) {    // 1 拍窗口同乐器类 Bark±2 邻域 onset 数 (跨 tick; 单 tick 模式关闭)
            if (singleTick) return 0;
            var k = 0, t1 = r.t0 + beatTicks, p0 = tickPos[r.t0];
            if (p0 === undefined) return 0;
            for (var a = p0; a < ticksArr.length; a++) {
                var tt = ticksArr[a];
                if (tt >= t1) break;
                var arr = byTick[tt];
                for (var b = 0; b < arr.length; b++) {
                    var o = arr[b];
                    if (!o.alive || o.excluded) continue;
                    if (o.bw !== r.bw) continue;
                    if (Math.abs(o.zIdx - r.zIdx) > nbSpan) continue;
                    k++;
                }
            }
            return Math.min(1, Math.max(0, (k - 1) / V6_PAR.gridNorm));
        }
        var patIdx = Object.create(null);   // 跨 tick 模式用: (tick:inst:pitch) 存在表
        if (!singleTick) {
            for (i = 0; i < recs.length; i++) patIdx[recs[i].t0 + ':' + recs[i].n.instrument + ':' + Math.round(v6EffPitch(recs[i].n) * 10)] = 1;
        }
        function rPat(r) {     // 前一拍 / 前一小节同乐器同音高 (跨 tick; 单 tick 模式关闭)
            if (singleTick) return 0;
            var kb = ':' + r.n.instrument + ':' + Math.round(v6EffPitch(r.n) * 10);
            if (patIdx[(r.t0 - beatTicks) + kb] || patIdx[(r.t0 - barTicks) + kb]) return V6_PAR.rPat;
            return 0;
        }
        function v6R(r) {
            var m = rRep(r), b = rGrid(r), c2 = rShare(r), d2 = rPat(r);
            if (b > m) m = b; if (c2 > m) m = c2; if (d2 > m) m = d2;
            return m;
        }
        for (i = 0; i < recs.length; i++) { recs[i].R = v6R(recs[i]); recs[i].Rprev = recs[i].R; }
        // ---- 角色标注 (§2.5, 仅审计, 不进决策) ----
        for (i = 0; i < recs.length; i++) {
            var rr4 = recs[i];
            if (rr4.bw) { rr4.role = 'perc_other'; continue; }
            var arr4 = byTick[rr4.t0] || [], hi = null, lo = null;
            for (var a4 = 0; a4 < arr4.length; a4++) {
                var o4 = arr4[a4];
                if (o4.bw) continue;
                if (hi === null || v6EffPitch(o4.n) > v6EffPitch(hi.n)) hi = o4;
                if (lo === null || v6EffPitch(o4.n) < v6EffPitch(lo.n)) lo = o4;
            }
            rr4.role = (rr4 === hi) ? 'melody' : (rr4 === lo ? 'bass' : 'inner');
        }
        // ---- I8 低频连续性索引 (z<4, 按 t0 升序) ----
        var lowRecs = [];
        for (i = 0; i < recs.length; i++) if (recs[i].zc < V6_PAR.lowfreqZ) lowRecs.push(recs[i]);
        lowRecs.sort(function (a, b) { return a.t0 - b.t0; });
        function lowLo(v) {
            var lo3 = 0, hi3 = lowRecs.length;
            while (lo3 < hi3) { var md3 = (lo3 + hi3) >> 1; if (lowRecs[md3].t0 < v) lo3 = md3 + 1; else hi3 = md3; }
            return lo3;
        }
        function i8Violate(r) {   // I8: z<4 音符删除后 2 拍窗口内低频活跃能量不得归零
            if (r.zc >= V6_PAR.lowfreqZ) return false;
            var w0 = r.t0 - tpb * V6_PAR.lowfreqWinBeats, w1 = r.t0 + tpb * V6_PAR.lowfreqWinBeats;
            for (var a = lowLo(w0); a < lowRecs.length && lowRecs[a].t0 <= w1; a++) {
                var o = lowRecs[a];
                if (o === r || !o.alive || o.excluded) continue;
                return false;   // 窗口内仍存在低频活跃音
            }
            return true;
        }
        // ---- 不变式硬校验 (§5.3; I7 通道不适用) ----
        function v6Violate(r) {
            if (r.n.instrument === 2) return true;                                           // I1 kick 全保
            if (r.n.instrument === 3 && Math.floor(r.t0 / tpb) % 2 === 1) return true;       // I2 backbeat snare
            if (r.vo.kind === 'h') {                                                         // I3' 同 tick 同乐器最低乐音
                var grp = byTick[r.t0] || [], isLow = true, ex = false;
                for (var a = 0; a < grp.length; a++) {
                    var g = grp[a];
                    if (g.n.instrument !== r.n.instrument || !g.alive || g.excluded) continue;
                    ex = true;
                    if (g !== r && (v6EffPitch(g.n) < v6EffPitch(r.n) || (v6EffPitch(g.n) === v6EffPitch(r.n) && g.id < r.id))) isLow = false;
                }
                if (ex && isLow) return true;
            }
            if (!r.groupDone) {                                                              // I4 tick 非空
                var stay = 0, arr2 = byTick[r.t0] || [];
                for (var b = 0; b < arr2.length; b++) { var s2 = arr2[b]; if (s2 !== r && s2.alive) stay++; }
                if (stay === 0) return true;
            }
            var ia = byInst[r.n.instrument] || [], al = 0;                                   // I5' 声部绝对下限
            for (var c3 = 0; c3 < ia.length; c3++) if (ia[c3].alive && !ia[c3].excluded) al++;
            if (al - 1 < V6_PAR.voiceMinAbs) return true;
            if (i8Violate(r)) { i8GuardCnt++; return true; }                                  // I8 低频连续性
            return false;
        }
        // ---- 预算 (§5: B = round(cnt × (1-Q))) ----
        var aliveCnt0 = 0;
        for (i = 0; i < recs.length; i++) if (recs[i].alive && !recs[i].excluded) aliveCnt0++;
        var budget = Math.round(aliveCnt0 * (1 - q));
        if (nProg) { try { nProg(14); } catch (eP3) {} }
        // ---- I7 无条件通道 (margin < -6; 先于主循环, 不占预算, 计 inaudibleRemoved; 受 I4 保护) ----
        var inaudibleRemoved = 0;
        for (i = 0; i < recs.length; i++) {
            var r7 = recs[i];
            if (!r7.alive || r7.excluded) continue;
            if (r7.mEff >= V6_PAR.i7Margin) continue;   // 用生效余量: lighten/未知音色同样受保护
            if (r7.n.instrument === 2) continue;                                            // 见 §7 Kick 全保
            if (r7.n.instrument === 3 && Math.floor(r7.t0 / tpb) % 2 === 1) continue;        // 见 §7 backbeat 全保
            if (i8Violate(r7)) { i8GuardCnt++; continue; }
            if (!i4HasStay(r7)) { i4GuardCnt++; continue; }                                  // I4 tick 非空
            r7.alive = false; r7.dead = true; r7.gen++;
            removedList.push(r7.n); inaudibleRemoved++; histInf++;
            // 本通道在主循环之前删除音符 → 必须失效掩蔽场缓存:
            // 否则后续增量重算会读到仍把该音算作掩蔽源的陈旧场, 使 margin 偏低而过度删除。
            pInvalidate(r7.t0, r7.t1);
        }
        // ---- 候选生成 (§3 组级优先 C0/C1 + 单音 C6; C2 伪延音已在上方单独处理) ----
        var cands = [];
        function mkCand(cls, dels, keep, R) {
            if (!dels.length) return;
            var mc = -1e9, me = -1e9;
            for (var a = 0; a < dels.length; a++) {
                if (dels[a].margin > mc) mc = dels[a].margin;
                if (dels[a].mEff > me) me = dels[a].mEff;   // 生效余量: 含 lighten/unknown 保护偏移
            }
            cands.push({ cls: cls, del: dels, keep: keep || null, R: R, margin: mc, mEff: me, n: dels.length });
        }
        var dupMap = Object.create(null);   // C0 同度去重
        for (i = 0; i < recs.length; i++) {
            var rc0 = recs[i];
            if (!rc0.alive || rc0.excluded) continue;
            var k0 = rc0.t0 + ':' + rc0.n.instrument + ':' + Math.round(v6EffPitch(rc0.n) * 10);
            (dupMap[k0] = dupMap[k0] || []).push(rc0);
        }
        for (var k0b in dupMap) {
            var g0 = dupMap[k0b];
            if (g0.length < 2) continue;
            var b0 = g0[0];
            for (var a0 = 1; a0 < g0.length; a0++) if (g0[a0].pAbs > b0.pAbs) b0 = g0[a0];
            mkCand('C0', g0.filter(function (x) { return x !== b0; }), b0, V6_PAR.rRep);
        }
        if (q < 0.95) {                     // C1 八度重复删高保低
            var octMap = Object.create(null);
            for (i = 0; i < recs.length; i++) {
                var ro = recs[i];
                if (!ro.alive || ro.excluded || ro.vo.kind !== 'h') continue;
                var ko = ro.t0 + ':' + ro.n.instrument;
                (octMap[ko] = octMap[ko] || []).push(ro);
            }
            for (var ko2 in octMap) {
                var ga = octMap[ko2];
                for (var a1 = 0; a1 < ga.length; a1++) {
                    for (var b1 = 0; b1 < ga.length; b1++) {
                        if (a1 === b1) continue;
                        var dh = v6EffPitch(ga[a1].n) - v6EffPitch(ga[b1].n);
                        if (dh > 0 && Math.abs(dh - 12) < 0.5) mkCand('C1', [ga[a1]], ga[b1], V6_PAR.rOctHigh);
                    }
                }
            }
        }
        if (q < 0.70) {                     // C6 单音冗余 (R_share/R_pat/R_grid/R_rep)
            for (i = 0; i < recs.length; i++) {
                var r6 = recs[i];
                if (!r6.alive || r6.excluded || r6.anchor) continue;
                if (r6.R > 0) mkCand('C6', [r6], null, r6.R);
            }
        }
        // ---- 效率排序 (§5: efficiency = R×|notes| / (cost+ε), cost = max(0, mEff+6), 低频 ×κ_low) ----
        // 用「生效余量」mEff (含 lighten −3dB / 未知音色 −6dB) 而非原始 margin,
        // 否则「减轻处理的轨道」在存在感引擎下完全不生效 (成本翻倍的等效保护)。
        function effOf(c) {
            var cost = Math.max(0, c.mEff + 6);
            if (c.del[0] && c.del[0].zc < V6_PAR.lowfreqZ) cost *= V6_PAR.kappaLow;
            return (c.R * c.n) / (cost + 1e-3);
        }
        cands.sort(function (a, b) {
            var ea = effOf(a), eb = effOf(b);
            if (eb !== ea) return eb - ea;
            if (a.R !== b.R) return b.R - a.R;
            if (a.margin !== b.margin) return a.margin - b.margin;
            var la = a.del[0].n.layer, lb = b.del[0].n.layer;
            if (la !== lb) return la - lb;
            return a.del[0].n.key - b.del[0].n.key;
        });
        // ---- 主循环: 预算贪心 + Θ 上限 + 不变式 + 双链增量重算 ----
        var B0 = budget, spent = 0, v6loopInit = Math.max(1, cands.length);
        for (var ci = 0; ci < cands.length; ci++) {
            if (nProg && (ci & 31) === 0) { try { nProg(Math.min(92, 14 + Math.round(76 * ci / v6loopInit))); } catch (eP4) {} }
            if (budget <= 0) break;
            var c = cands[ci];
            if (!c.del.length) continue;
            if (c.mEff > THETA) continue;                               // Θ 可闻代价上限 (continue 非 break)
            var okAll = true;
            for (var a2 = 0; a2 < c.del.length; a2++) {
                var dn = c.del[a2];
                if (!dn.alive || dn.excluded) { okAll = false; break; }
                if (c.cls !== 'C0' && v6Violate(dn)) { okAll = false; break; }
            }
            if (!okAll) continue;
            for (var a3 = 0; a3 < c.del.length; a3++) {
                var d3 = c.del[a3];
                d3.alive = false; d3.dead = true; d3.gen++;
                removedList.push(d3.n);
                if (d3.margin < V6_PAR.i7Margin) histInf++;
                else if (d3.margin < 0) histNeg6++;
                else histGate++;
                pInvalidate(d3.t0, d3.t1);
                if (!d3.neighbors) d3.neighbors = v6GenNeighbors(d3);
                for (var n3 = 0; n3 < d3.neighbors.length; n3++) {       // 双链增量重算 (掩蔽链 + 冗余链)
                    var nb3 = d3.neighbors[n3];
                    if (!nb3.alive || nb3.dead || nb3.excluded) continue;
                    var oldM = nb3.margin;
                    var mm3 = v6Margin(nb3);
                    var mAbs3 = 10 * Math.log10(nb3.pAbs / pRefSeg(nb3)) + V6_PAR.absOffset;
                    nb3.margin = Math.min(mm3.mask, mAbs3);
                    nb3.mEff = nb3.margin + (nb3.lighten ? 3 : 0) + (nb3.unknown ? 6 : 0);
                    nb3.R = v6R(nb3);
                    if (oldM < V6_PAR.i7Margin && nb3.margin >= V6_PAR.i7Margin) unmaskRescued++;
                    incremental++;
                    if (nb3.R > 0 && nb3.R !== nb3.Rprev && q < 0.70 && !nb3.anchor) {
                        nb3.Rprev = nb3.R;
                        cands.push({ cls: 'C6', del: [nb3], keep: null, R: nb3.R, margin: nb3.margin, mEff: nb3.mEff, n: 1 });
                    }
                }
            }
            spent += c.n; budget -= c.n;
        }
        if (nProg) { try { nProg(96); } catch (eP5) {} }
        // ---- 审计 (v6.1 §10: 双轴四象限 + removed_by_role + 预算) ----
        var keptCnt = 0;
        for (i = 0; i < recs.length; i++) if (recs[i].alive) keptCnt++;
        // 四象限: 物理可闻性 (margin > I7 阈值) × 结构冗余度 (R ≥ rPatFuzzy)
        var quadrant = { hiAud_hiRed: 0, loAud_hiRed: 0, hiAud_loRed: 0, loAud_loRed: 0 };
        var removedByRole = { melody: 0, bass: 0, inner: 0, perc_other: 0 };
        for (i = 0; i < recs.length; i++) {
            var rq = recs[i];
            if (rq.excluded) continue;
            var qAud = rq.margin > V6_PAR.i7Margin, qRed = rq.R >= V6_PAR.rPatFuzzy;
            quadrant[(qAud ? 'hiAud' : 'loAud') + '_' + (qRed ? 'hiRed' : 'loRed')]++;
            if (!rq.alive) removedByRole[rq.role || 'inner']++;
        }
        var audit = {
            mode: {
                model: 'presence', Q: q, theta_dB: THETA,
                single_tick: singleTick, pseudo_sustain: !singleTick
            },
            margin_histogram: { '(-inf,-6)': histInf + inaudibleCnt, '[-6,0)': histNeg6, '[0,theta)': histGate },
            quadrant_matrix: quadrant,
            removed_by_role: removedByRole,
            budget: { total: B0, spent: spent, alive0: aliveCnt0 },
            invariant_checks: { I1: true, I2: true, 'I3\'': true, I4: true, 'I5\'': true, I6: true, I7: true, I8: true },
            model_fixes: { harmonic_discount: V6_PAR.gammaHarm, peak_density: true, segment_norm: V6_PAR.segBeats + (singleTick ? '_tick' : 'beats') },
            rescued_by_fix: {
                transient_rescued: transientRescued,
                unmask_rescued: unmaskRescued,
                incremental_requeued: incremental,
                lowfreq_guard: i8GuardCnt,
                tick_guard: i4GuardCnt
            },
            inaudible: inaudibleCnt,
            inaudible_removed: inaudibleRemoved,
            pseudo_sustain: { detected: pseudoDetected, merged: pseudoMerged, avg_comp: pseudoMerged ? (pseudoSumComp / pseudoMerged) : 0 },
            output: { kept: keptCnt, removed: removedList.length, ratio: keptCnt + removedList.length ? (removedList.length / (keptCnt + removedList.length)) : 0 }
        };
        return { removed: removedList, velPatches: velPatches, audit: audit };
    }

    return compressSongCore;

})();
