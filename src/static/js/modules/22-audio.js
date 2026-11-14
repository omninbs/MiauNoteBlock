/* 22-audio.js — MiauNoteBlock 功能模块
   音频轨道 (额外轨道) + 音频块数据层。
   音频轨道不是 NBS 轨道: 不写入 .nbs, 只随工程元数据持久化;
   在钢琴卷帘中按 after 字段插在第 after 条 NBS 轨道下方显示, 行内只能放音频块。
   音频数据 (state.audioBuffers) 仅内存持有, 刷新后块保留但标记缺失音频, 需重新导入。
   依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function closeTransientFloats() { return N.closeTransientFloats.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function showSmallTip() { return N.showSmallTip.apply(this, arguments); }

    // ============ 常量 ============
    // 音频轨道数量上限 (与歌词轨道一致, 防止误点造成无限增长)
    var AUDIO_LANE_LIMIT = 16;
    // 增益档位 (百分比, 100 = 原声)
    var GAIN_STEPS = [50, 100, 150, 200];

    // ============ 音频轨道 (额外轨道) ============
    function audioLaneCount() {
        return Array.isArray(state.audioLanes) ? state.audioLanes.length : 0;
    }

    // 当前 NBS 音轨数量 (音频轨道的插入位置以它为参照)
    // 优先用 song.layers (与钢琴卷帘 trackCount 同源); state.tracks 只包含有音符的轨道, 数量可能更少
    function nbsTrackCount() {
        if (state.song && Array.isArray(state.song.layers) && state.song.layers.length) {
            return state.song.layers.length;
        }
        return Array.isArray(state.tracks) ? state.tracks.length : 0;
    }

    // 插入位置 after: 表示显示在第 after 条 NBS 音轨下方 (-1 = 最上方)
    // 未指定 / 越界时钳制到 [-1, trackCount-1]; 缺省落在最后一条 NBS 轨道下方
    function clampAudioAfter(after, trackCountHint) {
        var tc = (typeof trackCountHint === 'number') ? trackCountHint : nbsTrackCount();
        if (!isFinite(tc) || tc < 0) tc = 0;
        var v = parseInt(after, 10);
        if (!isFinite(v)) v = tc - 1;
        if (v < -1) v = -1;
        if (v > tc - 1) v = tc - 1;
        return v;
    }

    // 音频轨道数组当前 id 顺序 (重排后据此把音频块的 lane 索引重新映射)
    function laneIdList() {
        var ids = [];
        for (var i = 0; i < state.audioLanes.length; i++) ids.push(state.audioLanes[i].id);
        return ids;
    }

    function remapAudioClipLanes(oldIds) {
        var pos = {};
        for (var i = 0; i < state.audioLanes.length; i++) pos[state.audioLanes[i].id] = i;
        for (var j = 0; j < state.audioClips.length; j++) {
            var c = state.audioClips[j];
            if (!c) continue;
            var oldIdx = c.lane || 0;
            var id = oldIds[oldIdx];
            if (id != null && pos[id] !== undefined) c.lane = pos[id];
        }
    }

    function genAudioLaneId() {
        state._audioLaneIdSeq = (state._audioLaneIdSeq || 0) + 1;
        return 'al' + state._audioLaneIdSeq;
    }

    function defaultLaneName(index) {
        return i18nText('音频') + ' ' + (index + 1);
    }

    // 归一化单条音频轨道定义
    function normalizeAudioLane(lane, index) {
        if (!lane || typeof lane !== 'object') return null;
        var name = String(lane.name == null ? '' : lane.name).trim();
        var after = parseInt(lane.after, 10);
        var volume = parseFloat(lane.volume);
        if (!isFinite(volume)) volume = 100;
        if (volume < 0) volume = 0;
        if (volume > 200) volume = 200;
        return {
            id: lane.id || genAudioLaneId(),
            name: name || defaultLaneName(index),
            // null = 未指定, 由 ensureAudioLanes 按当前音轨数补齐
            after: isFinite(after) ? after : null,
            volume: volume,
            muted: !!lane.muted
        };
    }

    // 保证 state.audioLanes / state.audioClips 合法, 并把越界/缺失的音频块归位 (幂等, 可频繁调用)
    //   - 旧数据迁移: 音频块引用到不存在的轨道 → 按最大 lane 自动补齐轨道
    function ensureAudioLanes() {
        if (!Array.isArray(state.audioLanes)) state.audioLanes = [];
        if (!Array.isArray(state.audioClips)) state.audioClips = [];
        var lanes = state.audioLanes;

        // 非法项清理 (仅在发现非法项时重建)
        var dirty = false;
        for (var i = 0; i < lanes.length; i++) {
            if (!lanes[i] || typeof lanes[i] !== 'object' || !lanes[i].id) { dirty = true; break; }
        }
        if (dirty) {
            var clean = [];
            for (var j = 0; j < lanes.length; j++) {
                var ln = normalizeAudioLane(lanes[j], clean.length);
                if (ln) clean.push(ln);
            }
            state.audioLanes = lanes = clean;
        }

        // 旧数据迁移: 音频块引用到不存在的轨道 → 补齐
        var maxLane = -1;
        var clips = state.audioClips;
        for (var k = 0; k < clips.length; k++) {
            var c = clips[k];
            if (!c) continue;
            var l = parseInt(c.lane, 10);
            if (isFinite(l) && l > maxLane) maxLane = l;
        }
        while (state.audioLanes.length <= maxLane && state.audioLanes.length < AUDIO_LANE_LIMIT) {
            state.audioLanes.push({ id: genAudioLaneId(), name: defaultLaneName(state.audioLanes.length), after: null, volume: 100, muted: false });
        }

        // 插入位置归位: 缺失/越界 → 最后一条 NBS 轨道下方 (按当前音轨数钳制)
        var tc = nbsTrackCount();
        for (var q = 0; q < state.audioLanes.length; q++) {
            state.audioLanes[q].after = clampAudioAfter(state.audioLanes[q].after, tc);
            if (!state.audioLanes[q].name) state.audioLanes[q].name = defaultLaneName(q);
        }

        // 音频块非法项清理 + 字段归一化 (仅在发现非法项时重建)
        var clipsDirty = false;
        for (var a = 0; a < clips.length; a++) {
            var cc = clips[a];
            if (!cc || typeof cc !== 'object' || !cc.id || !cc.bufferId) { clipsDirty = true; break; }
        }
        if (clipsDirty) {
            var keep = [];
            for (var b = 0; b < clips.length; b++) {
                var oc = clips[b];
                if (!oc || typeof oc !== 'object' || !oc.id || !oc.bufferId) continue;
                keep.push(oc);
            }
            state.audioClips = clips = keep;
        }

        // lane 越界 → 压到最后一个轨道; tick/dur/gain/offsetSec 钳制到合法区间
        if (state.audioLanes.length) {
            for (var m = 0; m < clips.length; m++) {
                var ac = clips[m];
                if (!ac) continue;
                var v = parseInt(ac.lane, 10);
                if (!isFinite(v) || v < 0) v = 0;
                if (v > state.audioLanes.length - 1) v = state.audioLanes.length - 1;
                ac.lane = v;
                var t = Math.floor(parseInt(ac.tick, 10));
                if (!isFinite(t) || t < 0) t = 0;
                ac.tick = t;
                var d = Math.round(parseInt(ac.dur, 10));
                if (!isFinite(d) || d < 1) d = 1;
                ac.dur = d;
                var g = parseFloat(ac.gain);
                if (!isFinite(g)) g = 1;
                if (g < 0) g = 0;
                if (g > 2) g = 2;
                ac.gain = g;
                var os = parseFloat(ac.offsetSec);
                if (!isFinite(os) || os < 0) os = 0;
                ac.offsetSec = os;
            }
        }
        return state.audioLanes;
    }

    // 追加一条音频轨道 (after = 插入到第几条 NBS 轨道下方, 缺省为最后一条下方)
    // 返回新轨道索引, 失败返回 -1
    function addAudioLane(after) {
        ensureAudioLanes();
        if (state.audioLanes.length >= AUDIO_LANE_LIMIT) {
            showSmallTip(i18nText('音频轨道数量已达上限') + ' (' + AUDIO_LANE_LIMIT + ')');
            return -1;
        }
        pushUndo();
        var tc = nbsTrackCount();
        var a = clampAudioAfter(after, tc);
        var oldIds = laneIdList();
        var lane = { id: genAudioLaneId(), name: defaultLaneName(state.audioLanes.length), after: a, volume: 100, muted: false };
        // 追加到同插值组的末尾, 保持组内顺序稳定
        var insertAt = state.audioLanes.length;
        for (var i = state.audioLanes.length - 1; i >= 0; i--) {
            if (clampAudioAfter(state.audioLanes[i].after, tc) === a) { insertAt = i + 1; break; }
        }
        state.audioLanes.splice(insertAt, 0, lane);
        remapAudioClipLanes(oldIds);
        syncAudioToRoll();
        markDirty();
        return insertAt;
    }

    // 删除一条音频轨道 (其上的音频块一并删除)
    function removeAudioLane(index) {
        ensureAudioLanes();
        var idx = parseInt(index, 10);
        if (!(idx >= 0 && idx < state.audioLanes.length)) return false;
        pushUndo();
        state.audioLanes.splice(idx, 1);
        var kept = [];
        for (var i = 0; i < state.audioClips.length; i++) {
            var c = state.audioClips[i];
            if (!c) continue;
            var l = c.lane || 0;
            if (l === idx) {
                if (state.pianoRoll && state.pianoRoll.audioSelectedId === c.id) state.pianoRoll.audioSelectedId = null;
                continue;
            }
            if (l > idx) c.lane = l - 1;
            kept.push(c);
        }
        state.audioClips = kept;
        if (state.pianoRoll && state.pianoRoll.audioSelectedId != null) {
            var stillThere = false;
            for (var j = 0; j < kept.length; j++) {
                if (kept[j].id === state.pianoRoll.audioSelectedId) { stillThere = true; break; }
            }
            if (!stillThere) {
                if (state.pianoRoll._setAudioSelected) state.pianoRoll._setAudioSelected(null);
                else state.pianoRoll.audioSelectedId = null;
            }
        }
        syncAudioToRoll();
        markDirty();
        return true;
    }

    function renameAudioLane(index, name) {
        ensureAudioLanes();
        var idx = parseInt(index, 10);
        if (!(idx >= 0 && idx < state.audioLanes.length)) return false;
        var next = String(name == null ? '' : name).trim();
        if (!next) next = defaultLaneName(idx);
        if (state.audioLanes[idx].name === next) return false;
        pushUndo();
        state.audioLanes[idx].name = next;
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 拖动音频轨道: 把它移到第 after 条 NBS 轨道下方 (after = -1 表示最上方)
    //   轨道在数组中的顺序只决定同一插值组内的先后, 因此同时把它排到目标组末尾
    function moveAudioLaneTo(index, after) {
        ensureAudioLanes();
        var lanes = state.audioLanes;
        var idx = parseInt(index, 10);
        if (!isFinite(idx) || idx < 0 || idx >= lanes.length) return false;
        var tc = nbsTrackCount();
        var target = clampAudioAfter(after, tc);
        // 已在目标组末尾 → 无需改动
        var alreadyLast = true;
        for (var k = idx + 1; k < lanes.length; k++) {
            if (clampAudioAfter(lanes[k].after, tc) === target) { alreadyLast = false; break; }
        }
        if (clampAudioAfter(lanes[idx].after, tc) === target && alreadyLast) return false;
        pushUndo();
        var oldIds = laneIdList();
        var lane = lanes.splice(idx, 1)[0];
        lane.after = target;
        var insertAt = lanes.length;
        for (var i = lanes.length - 1; i >= 0; i--) {
            if (clampAudioAfter(lanes[i].after, tc) === target) { insertAt = i + 1; break; }
        }
        lanes.splice(insertAt, 0, lane);
        remapAudioClipLanes(oldIds);
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // ============ 音频块 ============
    function genAudioClipId() {
        state._audioClipIdSeq = (state._audioClipIdSeq || 0) + 1;
        return 'ac' + state._audioClipIdSeq + '_' + Date.now().toString(36);
    }

    function genAudioBufferId() {
        state._audioBufferIdSeq = (state._audioBufferIdSeq || 0) + 1;
        return 'ab' + state._audioBufferIdSeq + '_' + Date.now().toString(36);
    }

    function findAudioClip(id) {
        for (var i = 0; i < state.audioClips.length; i++) {
            if (state.audioClips[i].id === id) return state.audioClips[i];
        }
        return null;
    }

    // 速度 (tick/秒); 非法时回退默认 20
    function tempoValue() {
        var t = parseFloat(state.tempo);
        return (isFinite(t) && t > 0) ? t : 20;
    }

    function secondsPerTick() {
        return 1 / tempoValue();
    }

    // 同步轨道/缓冲/块到钢琴卷帘 (供卷帘渲染)
    function syncAudioToRoll() {
        var pr = state.pianoRoll;
        if (!pr) return;
        registerAudioPianoRollCallbacks();
        ensureAudioLanes();
        if (pr.setAudioLanes) {
            pr.setAudioLanes(state.audioLanes.map(function (l) {
                return { id: l.id, name: l.name, after: l.after, volume: l.volume, muted: l.muted };
            }));
        }
        if (pr.setAudioBuffers) pr.setAudioBuffers(state.audioBuffers);
        pr.audioClips = state.audioClips.map(function (c) {
            var buf = state.audioBuffers[c.bufferId];
            return {
                id: c.id,
                lane: c.lane || 0,
                tick: c.tick,
                dur: c.dur,
                offsetSec: c.offsetSec || 0,
                bufferId: c.bufferId,
                gain: (typeof c.gain === 'number') ? c.gain : 1,
                name: (buf && buf.name) || i18nText('音频轨道缺失音频'),
                missing: !buf
            };
        });
        pr._fullRedrawNeeded = true;
        if (pr.render) pr.render();
        // 音频块可能比歌曲更长: 同步刷新总长度/进度条/滚动范围
        if (N.updateProgressUI) N.updateProgressUI();
    }

    // 导入音频文件: 解码 → 注册缓冲 → 新建音频轨道 → 在 tick=0 放置首个音频块
    function importAudioFile(file) {
        try {
            if (!file || !window.AudioEngine || !AudioEngine.decodeAudio) {
                showSmallTip(i18nText('音频导入失败'));
                return false;
            }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    AudioEngine.decodeAudio(reader.result).then(function (buffer) {
                        try {
                            if (!buffer) throw new Error('decode failed');
                            // 先注册缓冲: addAudioLane 内的撤销点会把缓冲一起快照, 撤销一次即可完全回滚
                            var id = genAudioBufferId();
                            state.audioBuffers[id] = { name: file.name, buffer: buffer, duration: buffer.duration };
                            // 长音频: 导入空闲期预热流式播放节点, 避免首次播放时才开始初始化
                            setTimeout(function() {
                                try {
                                    if (window.AudioEngine && AudioEngine.prewarmClipStreaming) {
                                        AudioEngine.prewarmClipStreaming(buffer);
                                    }
                                } catch (e) {}
                            }, 0);
                            // 同时把 WAV 编码 (保存用) 在空闲期做完, 避免播放中同步编码造成卡顿
                            scheduleAudioAssetPrewarm();
                            var laneIdx = addAudioLane(null);
                            if (!(laneIdx >= 0)) {
                                delete state.audioBuffers[id];   // 上限: 回滚缓冲 (提示已由 addAudioLane 给出)
                                return;
                            }
                            var dur = Math.max(1, Math.round((buffer.duration || 0) * tempoValue()));
                            state.audioClips.push({
                                id: genAudioClipId(),
                                lane: laneIdx,
                                tick: 0,
                                dur: dur,
                                offsetSec: 0,
                                bufferId: id,
                                gain: 1
                            });
                            syncAudioToRoll();
                            markDirty();
                            showSmallTip(i18nText('音频导入成功'));
                        } catch (e) {
                            showSmallTip(i18nText('音频导入失败'));
                        }
                    }, function () {
                        showSmallTip(i18nText('音频导入失败'));
                    });
                } catch (e) {
                    showSmallTip(i18nText('音频导入失败'));
                }
            };
            reader.onerror = function () {
                showSmallTip(i18nText('音频导入失败'));
            };
            reader.readAsArrayBuffer(file);
            return true;
        } catch (e) {
            showSmallTip(i18nText('音频导入失败'));
            return false;
        }
    }

    // 在 atTick 处把音频块一分为二 (atTick 须在块区间开区间内)
    function splitAudioClip(id, atTick) {
        ensureAudioLanes();
        var clip = findAudioClip(id);
        if (!clip) return false;
        var t = Math.floor(atTick);
        if (!(t > clip.tick && t < clip.tick + (clip.dur || 1))) return false;
        pushUndo();
        var leftDur = t - clip.tick;
        var right = {
            id: genAudioClipId(),
            lane: clip.lane || 0,
            tick: t,
            dur: (clip.tick + clip.dur) - t,
            offsetSec: (clip.offsetSec || 0) + leftDur * secondsPerTick(),
            bufferId: clip.bufferId,
            gain: (typeof clip.gain === 'number') ? clip.gain : 1
        };
        clip.dur = leftDur;
        state.audioClips.push(right);
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 裁剪音频块: side='left' 保留播放头之后的部分, 'right' 保留播放头之前的部分
    //   裁剪点须严格位于块区间内 (clip.tick < atTick < clip.tick + dur), 结果长度 >= 1
    function trimAudioClip(id, atTick, side) {
        ensureAudioLanes();
        var clip = findAudioClip(id);
        if (!clip) return false;
        var t = Math.floor(atTick);
        if (!(t > clip.tick && t < clip.tick + (clip.dur || 1))) return false;
        var delta = t - clip.tick;
        var nextDur = (side === 'left') ? ((clip.dur || 1) - delta) : delta;
        if (!(nextDur >= 1)) return false;
        pushUndo();
        if (side === 'left') {
            clip.offsetSec = (clip.offsetSec || 0) + delta * secondsPerTick();
            clip.tick = t;
        }
        clip.dur = nextDur;
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 删除指定 id 的音频块
    function removeAudioClip(id) {
        ensureAudioLanes();
        var removed = false;
        for (var i = 0; i < state.audioClips.length; i++) {
            if (state.audioClips[i].id === id) { state.audioClips.splice(i, 1); removed = true; break; }
        }
        if (!removed) return;
        pushUndo();
        if (state.pianoRoll && state.pianoRoll.audioSelectedId === id) {
            if (state.pianoRoll._setAudioSelected) state.pianoRoll._setAudioSelected(null);
            else state.pianoRoll.audioSelectedId = null;
        }
        syncAudioToRoll();
        markDirty();
    }

    // 设置音频块增益 (0~2, 1 = 原声)
    function setAudioClipGain(id, gain) {
        var clip = findAudioClip(id);
        if (!clip) return false;
        var g = parseFloat(gain);
        if (!isFinite(g)) return false;
        if (g < 0) g = 0;
        if (g > 2) g = 2;
        if (g === clip.gain) return false;
        pushUndo();
        clip.gain = g;
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 拖动提交: 写回位置 (撤销点由 onAudioClipDragStart 负责)
    function setAudioClipTick(id, tick, lane) {
        ensureAudioLanes();
        var clip = findAudioClip(id);
        if (!clip) return false;
        var t = Math.floor(parseFloat(tick));
        if (!isFinite(t) || t < 0) t = 0;
        var n = audioLaneCount();
        var l = parseInt(lane, 10);
        if (!isFinite(l) || l < 0) l = 0;
        if (n > 0 && l > n - 1) l = n - 1;
        clip.tick = t;
        clip.lane = l;
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 拖动提交: 写回块长度 (tick, 恒 >= 1; 撤销点由 onAudioClipDragStart 负责)
    function setAudioClipDur(id, dur) {
        ensureAudioLanes();
        var clip = findAudioClip(id);
        if (!clip) return false;
        var d = Math.round(parseFloat(dur));
        if (!isFinite(d) || d < 1) d = 1;
        if (d === clip.dur) return false;
        clip.dur = d;
        syncAudioToRoll();
        markDirty();
        return true;
    }

    // 拖动结束提交 (与歌词 onLyricClipCommit 同参语义):
    // 从卷帘读该块最新的 tick / lane / dur 写回 state (端点拉伸与整体移动统一处理)
    function commitAudioClipDrag(id, origTick, origLane, mode) {
        ensureAudioLanes();
        var clip = findAudioClip(id);
        if (!clip) {
            if (state.pianoRoll) syncAudioToRoll();
            return;
        }
        var cur = null;
        if (state.pianoRoll && Array.isArray(state.pianoRoll.audioClips)) {
            for (var i = 0; i < state.pianoRoll.audioClips.length; i++) {
                if (state.pianoRoll.audioClips[i].id === id) { cur = state.pianoRoll.audioClips[i]; break; }
            }
        }
        if (!cur) {
            syncAudioToRoll();
            markDirty();
            return;
        }
        var changed = false;
        var nt = cur.tick, nl = cur.lane || 0, nd = cur.dur || 1;
        if (nt !== clip.tick || nl !== (clip.lane || 0)) {
            setAudioClipTick(id, nt, nl);
            changed = true;
        }
        if (nd !== clip.dur) {
            setAudioClipDur(id, nd);
            changed = true;
        }
        if (!changed) {
            syncAudioToRoll();
            markDirty();
        }
    }

    // ============ 音频持久化 (WAV 编码 / base64 / 工程包) ============
    // WAV 编码结果缓存 (AudioBuffer → ArrayBuffer)
    //   长音频 (例如 3 分钟 48kHz) 每次编码要遍历上千万个采样, 单次可达上百毫秒;
    //   自动保存 / 播放时保存会反复触发, 若不缓存, 播放中就会出现整秒级的卡顿。
    //   用 WeakMap 以 AudioBuffer 为键, buffer 被替换时缓存自动失效。
    var _wavCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
    var _prewarmTimer = null;
    // 分块编码粒度 (帧): 每块约 100~200KB, 填一块只需几毫秒, 不会卡住播放帧
    var WAV_ENCODE_CHUNK_FRAMES = 1 << 15;

    // 建 WAV 骨架 (44 字节头 + PCM 视图), 与填充逻辑拆开以便分块编码
    function createWavSkeleton(buffer) {
        if (!buffer || typeof buffer.getChannelData !== 'function') return null;
        var numCh = Math.min(2, Math.max(1, buffer.numberOfChannels || 1));
        var sampleRate = buffer.sampleRate || 44100;
        var frames = buffer.length || 0;
        if (!frames) return null;
        var blockAlign = numCh * 2;
        var dataSize = frames * blockAlign;
        var ab = new ArrayBuffer(44 + dataSize);
        var view = new DataView(ab);
        var writeStr = function (off, s) {
            for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
        };
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);            // PCM
        view.setUint16(22, numCh, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);
        var channels = [];
        for (var c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
        return {
            ab: ab,
            channels: channels,
            numCh: numCh,
            frames: frames,
            // 直写 Int16Array 视图 (省掉每样本一次 DataView 调用)
            pcm: new Int16Array(ab, 44, frames * numCh)
        };
    }

    // 填充 [startFrame, endFrame) 区间的 PCM 采样
    function fillWavChunk(skel, startFrame, endFrame) {
        var numCh = skel.numCh, pcm = skel.pcm, channels = skel.channels;
        for (var f = startFrame; f < endFrame; f++) {
            var base = f * numCh;
            for (var ch = 0; ch < numCh; ch++) {
                var smp = channels[ch][f];
                if (!isFinite(smp)) smp = 0;
                if (smp < -1) smp = -1;
                if (smp > 1) smp = 1;
                pcm[base + ch] = smp < 0 ? smp * 0x8000 : smp * 0x7FFF;
            }
        }
    }

    // AudioBuffer → 16-bit PCM WAV (单/双声道, 采样率沿用源 buffer), 同步版
    function audioBufferToWav(buffer) {
        var skel = createWavSkeleton(buffer);
        if (!skel) return null;
        fillWavChunk(skel, 0, skel.frames);
        return skel.ab;
    }

    // 分块异步编码: 每块之间让出事件循环, 单帧开销恒定 -> 播放/滚动期间不卡顿
    function encodeBufferToWavAsync(buffer) {
        return new Promise(function (resolve) {
            if (!buffer) { resolve(null); return; }
            if (_wavCache) {
                var hit = _wavCache.get(buffer);
                if (hit) { resolve(hit); return; }
            }
            var skel = createWavSkeleton(buffer);
            if (!skel) { resolve(null); return; }
            var pos = 0;
            var step = function () {
                var end = Math.min(skel.frames, pos + WAV_ENCODE_CHUNK_FRAMES);
                try {
                    fillWavChunk(skel, pos, end);
                } catch (e) {
                    resolve(null);
                    return;
                }
                pos = end;
                if (pos < skel.frames) {
                    setTimeout(step, 0);
                } else {
                    if (_wavCache) { try { _wavCache.set(buffer, skel.ab); } catch (e) {} }
                    resolve(skel.ab);
                }
            };
            step();
        });
    }

    // 空闲期预热: 导入音频后逐块把 WAV 编码做完, 使首次保存 (含播放中保存) 直接命中缓存
    //   分块编码每步只有几毫秒, 播放中执行也不会影响播放流畅度
    function scheduleAudioAssetPrewarm() {
        if (_prewarmTimer) return;
        _prewarmTimer = setTimeout(prewarmAudioAssetStep, 60);
    }

    function prewarmAudioAssetStep() {
        _prewarmTimer = null;
        var buffers = state.audioBuffers || {};
        var ids = Object.keys(buffers);
        for (var i = 0; i < ids.length; i++) {
            var entry = buffers[ids[i]];
            if (!entry || !entry.buffer) continue;
            if (_wavCache && _wavCache.get(entry.buffer)) continue;
            encodeBufferToWavAsync(entry.buffer).then(function () {
                scheduleAudioAssetPrewarm();
            }).catch(function () {
                scheduleAudioAssetPrewarm();
            });
            return;
        }
    }

    // base64 编码 (仅 localStorage 回退路径使用): 按 4KB 块 String.fromCharCode.apply,
    // 比逐字节拼字符串快一个数量级, 避免长音频生成大字符串时长时间占用主线程
    function arrayBufferToBase64(ab) {
        var bytes = new Uint8Array(ab);
        var chunk = 0x1000;
        var parts = [];
        for (var i = 0; i < bytes.length; i += chunk) {
            var end = Math.min(i + chunk, bytes.length);
            var sub = bytes.subarray(i, end);
            parts.push(String.fromCharCode.apply(null, sub));
        }
        return btoa(parts.join(''));
    }

    function base64ToArrayBuffer(b64) {
        var bin = atob(String(b64 || '').replace(/^data:[^,]*,/, ''));
        var len = bin.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    // MNB 工程包音频: 每个缓冲编码为 audio/<bufferId>.wav, 附 audio.json 元数据; 无音频返回 null
    function buildAudioExportPayload() {
        ensureAudioLanes();
        var buffers = state.audioBuffers || {};
        var ids = Object.keys(buffers);
        if (!ids.length) return Promise.resolve(null);
        var files = [];
        var metaBuffers = [];
        try {
            for (var i = 0; i < ids.length; i++) {
                var bid = ids[i];
                var entry = buffers[bid];
                if (!entry || !entry.buffer) continue;
                var wav = audioBufferToWav(entry.buffer);
                if (!wav) continue;
                var fileName = 'audio/' + bid + '.wav';
                files.push({ fileName: fileName, blob: new Blob([wav], { type: 'audio/wav' }) });
                metaBuffers.push({
                    bufferId: bid,
                    name: entry.name || (bid + '.wav'),
                    fileName: fileName,
                    duration: (typeof entry.duration === 'number' && isFinite(entry.duration))
                        ? entry.duration : (entry.buffer.duration || 0)
                });
            }
        } catch (e) {
            return Promise.resolve(null);
        }
        if (!files.length) return Promise.resolve(null);
        // clips 去掉 name / missing 等渲染期临时字段
        var clips = (state.audioClips || []).map(function (c) {
            return {
                id: c.id,
                lane: c.lane || 0,
                tick: c.tick,
                dur: c.dur,
                offsetSec: c.offsetSec || 0,
                bufferId: c.bufferId,
                gain: (typeof c.gain === 'number') ? c.gain : 1
            };
        });
        return Promise.resolve({
            files: files,
            meta: {
                lanes: JSON.parse(JSON.stringify(state.audioLanes || [])),
                clips: clips,
                buffers: metaBuffers
            }
        });
    }

    // 本地工程保存用: {bufferId: {name, duration, wav: ArrayBuffer}}; 无音频返回 null
    //   直接存 ArrayBuffer: IndexedDB 结构化克隆对二进制是原生支持, 无需 base64。
    //   base64 会把 3 分钟音频膨胀成 20MB+ 字符串 (编码 + GC 上千毫秒), 是播放卡顿的根因。
    //   编码按块异步进行, 保存期间不会出现长任务。
    function audioAssetsForSave() {
        var buffers = state.audioBuffers || {};
        var ids = Object.keys(buffers);
        if (!ids.length) return Promise.resolve(null);
        var out = {};
        var seq = Promise.resolve();
        ids.forEach(function (bid) {
            seq = seq.then(function () {
                var entry = buffers[bid];
                if (!entry || !entry.buffer) return;
                return encodeBufferToWavAsync(entry.buffer).then(function (wav) {
                    if (!wav) return;
                    out[bid] = {
                        name: entry.name || '',
                        duration: (typeof entry.duration === 'number' && isFinite(entry.duration))
                            ? entry.duration : (entry.buffer.duration || 0),
                        wav: wav
                    };
                });
            });
        });
        return seq.then(function () {
            return Object.keys(out).length ? out : null;
        }).catch(function () { return null; });
    }

    // localStorage 回退路径专用 (IndexedDB 不可用时): 把 wav ArrayBuffer 内联为 base64 字符串
    //   异步分片执行, 避免长音频在主线程同步编码
    function audioAssetsInline(assets) {
        if (!assets || typeof assets !== 'object') return Promise.resolve(assets || null);
        var ids = Object.keys(assets);
        if (!ids.length) return Promise.resolve(assets);
        var out = {};
        var seq = Promise.resolve();
        ids.forEach(function (bid) {
            seq = seq.then(function () {
                var a = assets[bid];
                if (!a) return;
                if (a.wavBase64) { out[bid] = a; return; }
                if (!a.wav) return;
                var wav = a.wav;
                return new Promise(function (resolve) {
                    // 让出一次事件循环再编码, 避免与其他同步工作叠加成长任务
                    setTimeout(function () {
                        try {
                            out[bid] = { name: a.name || '', duration: a.duration || 0, wavBase64: arrayBufferToBase64(wav) };
                        } catch (e) {}
                        resolve();
                    }, 0);
                });
            });
        });
        return seq.then(function () { return out; });
    }

    // 资产中的音频数据统一取出: 新格式 wav(ArrayBuffer/Blob) 兼容旧格式 wavBase64
    //   注意 decodeAudioData 会接管 (detach) 传入的 ArrayBuffer, 这里一律交出副本,
    //   避免把存储记录里的 buffer 掏空 (同一条记录后续还要复用)
    function assetToArrayBuffer(a) {
        if (!a) return Promise.resolve(null);
        if (a.wavBase64) {
            try { return Promise.resolve(base64ToArrayBuffer(a.wavBase64)); } catch (e) { return Promise.resolve(null); }
        }
        var wav = a.wav;
        if (!wav) return Promise.resolve(null);
        if (typeof wav.arrayBuffer === 'function') return wav.arrayBuffer();   // Blob: 天然是新 buffer
        if (wav instanceof ArrayBuffer) {
            try { return Promise.resolve(wav.byteLength ? wav.slice(0) : null); } catch (e) { return Promise.resolve(null); }
        }
        if (ArrayBuffer.isView(wav)) {
            try {
                return Promise.resolve(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
            } catch (e) { return Promise.resolve(null); }
        }
        return Promise.resolve(null);
    }

    // 本地工程载入用: 音频资产 → AudioBuffer, 失败项跳过; 返回可直接赋给 state.audioBuffers 的对象
    function restoreAudioAssets(assets) {
        if (!assets || typeof assets !== 'object') return Promise.resolve({});
        var ids = Object.keys(assets);
        if (!ids.length || !window.AudioEngine || !AudioEngine.decodeAudio) return Promise.resolve({});
        var tasks = ids.map(function (bid) {
            var a = assets[bid];
            if (!a || (!a.wav && !a.wavBase64)) return Promise.resolve(null);
            return assetToArrayBuffer(a).then(function (ab) {
                if (!ab) return null;
                return AudioEngine.decodeAudio(ab).then(function (buffer) {
                    if (!buffer) return null;
                    return [bid, {
                        name: a.name || (bid + '.wav'),
                        buffer: buffer,
                        duration: (typeof a.duration === 'number' && isFinite(a.duration)) ? a.duration : buffer.duration
                    }];
                }).catch(function () { return null; });
            }).catch(function () { return null; });
        });
        return Promise.all(tasks).then(function (arr) {
            var map = {};
            arr.forEach(function (e) { if (e) map[e[0]] = e[1]; });
            if (Object.keys(map).length) scheduleAudioAssetPrewarm();
            return map;
        });
    }

    // MNB 工程包音频还原: audio.json + audio/*.wav → state.audioBuffers/Lanes/Clips; 返回成功解码数
    function importAudioPackage(zipFile, meta) {
        if (!zipFile) return Promise.resolve(0);
        var ref = (meta && meta.audio) ? meta.audio : 'audio.json';
        var audioFile = zipFile.file(ref);
        if (!audioFile) return Promise.resolve(0);
        return audioFile.async('string').then(function (text) {
            var pack;
            try { pack = JSON.parse(text); } catch (e) { return 0; }
            if (!pack) return 0;
            var list = Array.isArray(pack.buffers) ? pack.buffers : [];
            if (!window.AudioEngine || !AudioEngine.decodeAudio) return 0;
            var map = {};
            var okCount = 0;
            var seq = Promise.resolve();
            list.forEach(function (entry) {
                seq = seq.then(function () {
                    if (!entry || !entry.fileName) return;
                    var f = zipFile.file(entry.fileName);
                    if (!f) return;
                    return f.async('arraybuffer').then(function (ab) {
                        return AudioEngine.decodeAudio(ab);
                    }).then(function (buffer) {
                        if (!buffer) return;
                        map[entry.bufferId] = {
                            name: entry.name || (entry.bufferId + '.wav'),
                            buffer: buffer,
                            duration: (typeof entry.duration === 'number' && isFinite(entry.duration))
                                ? entry.duration : buffer.duration
                        };
                        okCount++;
                    }).catch(function () {});
                });
            });
            return seq.then(function () {
                state.audioBuffers = map;
                state.audioLanes = Array.isArray(pack.lanes) ? JSON.parse(JSON.stringify(pack.lanes)) : [];
                state.audioClips = Array.isArray(pack.clips) ? JSON.parse(JSON.stringify(pack.clips)) : [];
                refreshAudioLaneUI();
                if (okCount) scheduleAudioAssetPrewarm();
                return okCount;
            });
        }).catch(function () { return 0; });
    }

    // ============ 文件导入辅助 ============
    var _audioFileInput = null;
    function ensureAudioFileInput() {
        if (_audioFileInput) return _audioFileInput;
        _audioFileInput = document.createElement('input');
        _audioFileInput.type = 'file';
        _audioFileInput.accept = 'audio/*';
        _audioFileInput.style.display = 'none';
        _audioFileInput.addEventListener('change', function () {
            var f = _audioFileInput.files && _audioFileInput.files[0];
            if (f) importAudioFile(f);
            _audioFileInput.value = '';
        });
        document.body.appendChild(_audioFileInput);
        return _audioFileInput;
    }

    function openAudioFilePicker() {
        ensureAudioFileInput().click();
    }

    // ============ 音频右键菜单 ============
    var _audioCtxEl = null;
    function hideAudioClipMenu() {
        if (_audioCtxEl && _audioCtxEl.parentNode) _audioCtxEl.parentNode.removeChild(_audioCtxEl);
        _audioCtxEl = null;
    }

    // 复用应用统一的 .context-menu 外观 (毛玻璃背景/圆角/阴影), 避免自建菜单没有底色
    function _ctxMenu() {
        var menu = document.createElement('div');
        menu.className = 'context-menu visible';
        menu.style.position = 'fixed';
        menu.style.zIndex = '100420';
        return menu;
    }

    function _ctxItem(icon, label, opts) {
        opts = opts || {};
        var el = document.createElement('div');
        el.className = 'context-menu-item' + (opts.danger ? ' danger' : '');
        if (opts.disabled) {
            el.style.opacity = '0.45';
            el.style.pointerEvents = 'none';
        }
        el.innerHTML = '<i class="' + (opts.checked ? 'fa-solid fa-check' : (icon || '')) + '"></i><span>' + label + '</span>';
        return el;
    }

    function _showCtxMenu(menu, clientX, clientY) {
        document.body.appendChild(menu);
        // 贴鼠标右下显示, 越界翻转
        var r = menu.getBoundingClientRect();
        var left = clientX + 6, top = clientY + 6;
        if (left + r.width > window.innerWidth - 6) left = Math.max(6, clientX - r.width - 6);
        if (top + r.height > window.innerHeight - 6) top = Math.max(6, clientY - r.height - 6);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        _audioCtxEl = menu;
        setTimeout(function () {
            document.addEventListener('click', function onDoc(ev) {
                if (_audioCtxEl && !_audioCtxEl.contains(ev.target)) {
                    hideAudioClipMenu();
                    document.removeEventListener('click', onDoc);
                }
            });
        }, 0);
    }

    // 右键音频块: 分割 / 裁剪 / 删除 / 增益 (分割点取播放头, 不在块内时禁用)
    function showAudioClipMenu(clientX, clientY, clipId) {
        hideAudioClipMenu();
        closeTransientFloats();
        ensureAudioLanes();
        var clip = findAudioClip(clipId);
        if (!clip) return;
        if (state.pianoRoll) {
            if (state.pianoRoll._setAudioSelected) state.pianoRoll._setAudioSelected(clip.id);
            else state.pianoRoll.audioSelectedId = clip.id;
        }

        var menu = _ctxMenu();
        var atTick = Math.max(0, Math.floor(state.currentTick || 0));
        var canSplit = atTick > clip.tick && atTick < clip.tick + (clip.dur || 1);
        var splitEl = _ctxItem('fa-solid fa-scissors', i18nText('分割音频'), { disabled: !canSplit });
        splitEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            splitAudioClip(clip.id, atTick);
        });
        var trimLeftEl = _ctxItem('fa-solid fa-arrow-left-long', i18nText('裁剪左侧到播放头'), { disabled: !canSplit });
        trimLeftEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            trimAudioClip(clip.id, atTick, 'left');
        });
        var trimRightEl = _ctxItem('fa-solid fa-arrow-right-long', i18nText('裁剪右侧到播放头'), { disabled: !canSplit });
        trimRightEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            trimAudioClip(clip.id, atTick, 'right');
        });
        var delEl = _ctxItem('fa-solid fa-trash-can', i18nText('删除音频块'), { danger: true });
        delEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            removeAudioClip(clip.id);
        });
        menu.appendChild(splitEl);
        menu.appendChild(trimLeftEl);
        menu.appendChild(trimRightEl);
        menu.appendChild(delEl);
        // 增益档位 (当前档打勾)
        var gainPct = Math.round((typeof clip.gain === 'number' ? clip.gain : 1) * 100);
        for (var g = 0; g < GAIN_STEPS.length; g++) {
            (function (pct) {
                var el = _ctxItem('', i18nText('音频增益') + ' ' + pct + '%', { checked: gainPct === pct });
                el.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    hideAudioClipMenu();
                    setAudioClipGain(clip.id, pct / 100);
                });
                menu.appendChild(el);
            })(GAIN_STEPS[g]);
        }
        _showCtxMenu(menu, clientX, clientY);
    }

    // 右键音频轨道空白区: 重命名 / 删除轨道
    function showAudioLaneMenu(clientX, clientY, laneIndex) {
        hideAudioClipMenu();
        closeTransientFloats();
        ensureAudioLanes();
        var idx = parseInt(laneIndex, 10);
        if (!(idx >= 0 && idx < state.audioLanes.length)) return;
        var menu = _ctxMenu();
        var renameEl = _ctxItem('fa-solid fa-pen-to-square', i18nText('重命名音频轨道'));
        renameEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            showAudioLaneRenamePop(idx, clientX, clientY);
        });
        var delEl = _ctxItem('fa-solid fa-trash-can', i18nText('删除音频轨道'), { danger: true });
        delEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            hideAudioClipMenu();
            removeAudioLane(idx);
        });
        menu.appendChild(renameEl);
        menu.appendChild(delEl);
        _showCtxMenu(menu, clientX, clientY);
    }

    // ---- 音频轨道重命名浮窗 (复用歌词编辑浮窗样式) ----
    function closeAudioLaneRenamePop() {
        var pop = document.getElementById('audio-lane-rename-pop');
        if (pop) pop.remove();
    }

    function showAudioLaneRenamePop(laneIndex, clientX, clientY) {
        closeAudioLaneRenamePop();
        closeTransientFloats();
        ensureAudioLanes();
        var idx = parseInt(laneIndex, 10);
        if (!(idx >= 0 && idx < state.audioLanes.length)) return;
        var lane = state.audioLanes[idx];

        var pop = document.createElement('div');
        pop.className = 'lyric-editor-pop';
        pop.id = 'audio-lane-rename-pop';
        pop.setAttribute('data-lane-index', String(idx));
        pop.innerHTML =
            '<div class="lyric-editor-pop-head">'
            + '<span class="lyric-editor-pop-title">' + i18nText('重命名音频轨道') + '</span>'
            + '<button type="button" class="lyric-editor-pop-close" id="audio-lane-rename-pop-close">&times;</button>'
            + '</div>'
            + '<input type="text" class="lyric-editor-pop-input" id="audio-lane-rename-pop-input" maxlength="60">'
            + '<div class="lyric-editor-pop-actions">'
            + '<button type="button" class="lyric-editor-pop-btn" id="audio-lane-rename-pop-cancel">' + i18nText('取消') + '</button>'
            + '<button type="button" class="lyric-editor-pop-btn is-primary" id="audio-lane-rename-pop-save">' + i18nText('保存') + '</button>'
            + '</div>';
        document.body.appendChild(pop);

        var input = pop.querySelector('#audio-lane-rename-pop-input');
        input.value = lane.name || '';

        // 定位在鼠标旁边 (默认右下, 越界时翻转到左上)
        var px = (typeof clientX === 'number') ? clientX : 0;
        var py = (typeof clientY === 'number') ? clientY : 0;
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var left = px + 14, top = py + 14;
        if (left + pw > window.innerWidth - 8) left = Math.max(8, px - pw - 14);
        if (top + ph > window.innerHeight - 8) top = Math.max(8, py - ph - 14);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        var commit = function () {
            renameAudioLane(idx, input.value);
            closeAudioLaneRenamePop();
        };
        pop.querySelector('#audio-lane-rename-pop-close').addEventListener('click', closeAudioLaneRenamePop);
        pop.querySelector('#audio-lane-rename-pop-cancel').addEventListener('click', closeAudioLaneRenamePop);
        pop.querySelector('#audio-lane-rename-pop-save').addEventListener('click', commit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAudioLaneRenamePop(); }
        });
        setTimeout(function () { input.focus(); input.select(); }, 30);
    }

    // ============ piano_roll 回调注册 ============
    var _audioCallbacksBound = false;
    function registerAudioPianoRollCallbacks() {
        var pr = state.pianoRoll;
        if (!pr) return false;
        if (_audioCallbacksBound && pr.onAudioClipCommit) return true;
        _audioCallbacksBound = true;
        // 音频块右键/长按菜单
        pr.onAudioClipContextMenu = function (id, clientX, clientY) {
            showAudioClipMenu(clientX, clientY, id);
        };
        // 音频轨道空白区右键菜单
        pr.onAudioLaneContextMenu = function (lane, tick, clientX, clientY) {
            showAudioLaneMenu(clientX, clientY, lane);
        };
        // 拖动结束提交 (端点拉伸与整体移动统一从卷帘读最新值写回)
        pr.onAudioClipCommit = function (id, origTick, origLane, mode) {
            commitAudioClipDrag(id, origTick, origLane, mode);
        };
        // 首次发生移动时回调, 用于 pushUndo
        pr.onAudioClipDragStart = function () { pushUndo(); };
        // 音频轨道 (额外轨道) 的增删改与排序
        pr.onDeleteAudioLane = function (laneIndex) { removeAudioLane(laneIndex); };
        pr.onRenameAudioLane = function (laneIndex, newName) { renameAudioLane(laneIndex, newName); };
        // after: 目标插入位置 (第几条 NBS 音轨下方, -1 = 最上方)
        pr.onReorderAudioLane = function (fromLane, after) { moveAudioLaneTo(fromLane, after); };
        return true;
    }

    // ============ 打开工程后刷新 (轨道/块归一化 + 同步卷帘) ============
    function refreshAudioLaneUI() {
        ensureAudioLanes();
        syncAudioToRoll();
    }

    // ---- 导出 ----
    N.audioLaneCount = audioLaneCount;
    N.ensureAudioLanes = ensureAudioLanes;
    N.addAudioLane = addAudioLane;
    N.removeAudioLane = removeAudioLane;
    N.renameAudioLane = renameAudioLane;
    N.moveAudioLaneTo = moveAudioLaneTo;
    N.syncAudioToRoll = syncAudioToRoll;
    N.importAudioFile = importAudioFile;
    N.openAudioFilePicker = openAudioFilePicker;
    N.splitAudioClip = splitAudioClip;
    N.trimAudioClip = trimAudioClip;
    N.audioBufferToWav = audioBufferToWav;
    N.buildAudioExportPayload = buildAudioExportPayload;
    N.audioAssetsForSave = audioAssetsForSave;
    N.audioAssetsInline = audioAssetsInline;
    N.restoreAudioAssets = restoreAudioAssets;
    N.importAudioPackage = importAudioPackage;
    N.removeAudioClip = removeAudioClip;
    N.setAudioClipGain = setAudioClipGain;
    N.setAudioClipTick = setAudioClipTick;
    N.setAudioClipDur = setAudioClipDur;
    N.refreshAudioLaneUI = refreshAudioLaneUI;
    N.showAudioClipMenu = showAudioClipMenu;
    N.showAudioLaneMenu = showAudioLaneMenu;
    N.hideAudioClipMenu = hideAudioClipMenu;
    N.closeAudioLaneRenamePop = closeAudioLaneRenamePop;
    N.registerAudioPianoRollCallbacks = registerAudioPianoRollCallbacks;
    N.AUDIO_LANE_LIMIT = AUDIO_LANE_LIMIT;
    N.GAIN_STEPS = GAIN_STEPS;

    // ---- 模块初始化 ----
    // 窗口 resize / 滚轮时收起音频菜单; 卷帘已就绪时立即注册回调 (未就绪则由 initPianoRoll 补注册)
    window.addEventListener('resize', function () {
        closeAudioLaneRenamePop();
        hideAudioClipMenu();
    });
    window.addEventListener('wheel', hideAudioClipMenu, { passive: true });
    registerAudioPianoRollCallbacks();
})(window.WebNBS);
