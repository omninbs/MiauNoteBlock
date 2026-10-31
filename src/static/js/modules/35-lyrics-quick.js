/* 35-lyrics-quick.js — MiauNoteBlock 功能模块
   歌词「快速添加」: LRC 导入 (秒 → tick) / 人声轨道逐字对齐
   依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }
    function enterLyricsEditMode() { return N.enterLyricsEditMode.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function genLyricId() { return N.genLyricId.apply(this, arguments); }
    function getNbsKeyDisplayLabel() { return N.getNbsKeyDisplayLabel.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showSmallTip() { return N.showSmallTip.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }

    // 末句 / 尾部片段使用的兜底时长 (tick)
    var DEFAULT_TAIL_DURATION = 4;

    function lyricLaneCount() {
        var n = parseInt(N.LYRIC_LANE_COUNT, 10);
        return (isFinite(n) && n > 0) ? n : 3;
    }

    function defaultLyricDuration() {
        var d = parseInt(N.LYRIC_DEFAULT_DURATION, 10);
        return (isFinite(d) && d > 0) ? d : DEFAULT_TAIL_DURATION;
    }

    function clampLane(lane) {
        var v = parseInt(lane, 10);
        if (!isFinite(v) || v < 0) v = 0;
        var max = lyricLaneCount() - 1;
        return v > max ? max : v;
    }

    function currentTempo() {
        var t = Number(state.tempo);
        return (isFinite(t) && t > 0) ? t : 20;
    }

    // ============ 文本拆分 ============
    // 逐码点拆分, 避免 emoji / 生僻字 (代理对) 被截断
    function splitCodePoints(str) {
        var s = String(str == null ? '' : str);
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var code = s.charCodeAt(i);
            if (code >= 0xD800 && code <= 0xDBFF && i + 1 < s.length) {
                out.push(s.substr(i, 2));
                i++;
            } else {
                out.push(s.charAt(i));
            }
        }
        return out;
    }

    // 东亚文字 (中日韩) 判定: 「按词」模式下这些语言仍需逐字拆分
    function isCjkChar(ch) {
        if (!ch) return false;
        var code = ch.charCodeAt(0);
        return (code >= 0x3040 && code <= 0x30FF)
            || (code >= 0x3400 && code <= 0x4DBF)
            || (code >= 0x4E00 && code <= 0x9FFF)
            || (code >= 0xA960 && code <= 0xA97F)
            || (code >= 0xAC00 && code <= 0xD7AF)
            || (code >= 0xF900 && code <= 0xFAFF)
            || (code >= 0x20000 && code <= 0x2FA1F);
    }

    // 把歌词文本拆成对齐单元: mode='char' 逐字 / mode='word' 按词 (中文等仍逐字)
    // 返回 [{ ch, line }]: line 为原始行号, 用于判断句首 (流式歌词换行)
    function splitLyricChars(text, mode) {
        var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
        var lines = src.split('\n');
        var out = [];
        for (var li = 0; li < lines.length; li++) {
            var line = lines[li];
            if (mode === 'word') {
                var words = line.split(/\s+/);
                for (var wi = 0; wi < words.length; wi++) {
                    var word = words[wi];
                    if (!word) continue;
                    var hasCjk = false;
                    for (var ci = 0; ci < word.length; ci++) {
                        if (isCjkChar(word.charAt(ci))) { hasCjk = true; break; }
                    }
                    if (hasCjk) {
                        var cps = splitCodePoints(word);
                        for (var pi = 0; pi < cps.length; pi++) {
                            out.push({ ch: cps[pi], line: li });
                        }
                    } else {
                        out.push({ ch: word, line: li });
                    }
                }
            } else {
                var units = splitCodePoints(line);
                for (var ui = 0; ui < units.length; ui++) {
                    if (/^\s$/.test(units[ui])) continue;
                    out.push({ ch: units[ui], line: li });
                }
            }
        }
        return out;
    }

    // ============ LRC 解析 ============
    // 标准 LRC: [mm:ss.xx]歌词; 同时兼容 [mm:ss.xxx]、[mm:ss] 与一行多个时间标签
    var LRC_TIME_RE = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
    var LRC_META_RE = /^\s*\[([a-zA-Z#]+):([^\]]*)\]/;
    // 增强 LRC 的行内逐字时间戳 <mm:ss.xx>, 解析时剥离 (逐字对齐由独立功能处理)
    var LRC_ENHANCED_RE = /<\s*\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\s*>/g;

    function lrcTagToSeconds(minStr, secStr, fracStr) {
        var min = parseInt(minStr, 10) || 0;
        var sec = parseInt(secStr, 10) || 0;
        var frac = 0;
        if (fracStr) frac = (parseInt(fracStr, 10) || 0) / Math.pow(10, fracStr.length);
        return min * 60 + sec + frac;
    }

    // 解析 LRC 文本 -> { entries: [{sec, text}], offsetMs }
    //   - 无时间标签的行 (含元数据行) 直接忽略
    //   - [offset:] 为正数表示歌词整体提前, 解析时从时间中扣除
    function parseLrc(raw) {
        var src = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');
        var lines = src.split('\n');
        var entries = [];
        var offsetMs = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var times = [];
            // 行首允许多个 [..] 标签, 交替出现时间标签与元数据标签
            for (var guard = 0; guard < 32; guard++) {
                var tm = LRC_TIME_RE.exec(line);
                if (tm) {
                    times.push(lrcTagToSeconds(tm[1], tm[2], tm[3]));
                    line = line.slice(tm[0].length);
                    continue;
                }
                var mm = LRC_META_RE.exec(line);
                if (mm) {
                    if (String(mm[1]).toLowerCase() === 'offset') {
                        var off = parseInt(String(mm[2]).trim(), 10);
                        if (isFinite(off)) offsetMs = off;
                    }
                    line = line.slice(mm[0].length);
                    continue;
                }
                break;
            }
            if (!times.length) continue;
            var text = line.replace(LRC_ENHANCED_RE, '').trim();
            for (var t = 0; t < times.length; t++) entries.push({ sec: times[t], text: text });
        }
        if (offsetMs) {
            for (var e = 0; e < entries.length; e++) entries[e].sec -= offsetMs / 1000;
        }
        entries.sort(function(a, b) { return a.sec - b.sec; });
        return { entries: entries, offsetMs: offsetMs };
    }

    // LRC -> 歌词片段
    //   opts: { tempo, lane, offsetSec, tailDuration }
    //   秒 → tick: tick = round((sec + offsetSec) * tempo)
    //   同一 tick 已被占用时向后顺移; duration 取到下一句的时间差 (末句用 tailDuration)
    function convertLrcToClips(raw, opts) {
        opts = opts || {};
        var parsed = parseLrc(raw);
        var tempo = Number(opts.tempo);
        if (!isFinite(tempo) || tempo <= 0) tempo = currentTempo();
        var offsetSec = Number(opts.offsetSec);
        if (!isFinite(offsetSec)) offsetSec = 0;
        var lane = clampLane(opts.lane);
        var tailDur = parseInt(opts.tailDuration, 10);
        if (!isFinite(tailDur) || tailDur < 1) tailDur = defaultLyricDuration();

        var used = {};
        var taken = [];
        var conflicts = 0;
        var empty = 0;
        for (var i = 0; i < parsed.entries.length; i++) {
            var ent = parsed.entries[i];
            var text = String(ent.text || '').trim();
            if (!text) { empty++; continue; }
            var tick = Math.round((ent.sec + offsetSec) * tempo);
            if (!isFinite(tick) || tick < 0) tick = 0;
            var shifted = 0;
            while (used[tick] && shifted < 8192) { tick++; shifted++; }
            if (used[tick]) continue;
            if (shifted > 0) conflicts++;
            used[tick] = true;
            taken.push({ tick: tick, text: text });
        }

        var clips = [];
        for (var j = 0; j < taken.length; j++) {
            var dur = (j + 1 < taken.length)
                ? Math.max(1, taken[j + 1].tick - taken[j].tick)
                : Math.max(1, tailDur);
            clips.push({
                tick: taken[j].tick,
                lane: lane,
                text: taken[j].text,
                duration: dur,
                lineStart: true
            });
        }
        return {
            clips: clips,
            count: clips.length,
            conflicts: conflicts,
            empty: empty,
            minTick: clips.length ? clips[0].tick : 0,
            maxTick: clips.length ? clips[clips.length - 1].tick : 0
        };
    }

    // ============ 人声轨道逐字对齐 ============
    // 收集指定轨道 (layer) 的音符, 以 tick 去重后按时间升序; 同 tick 多音符取最高音
    function collectLayerNotes(layer) {
        var list = [];
        var byTick = {};
        var notes = state.notes || [];
        var want = Number(layer);
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (!n || Number(n.layer) !== want) continue;
            var tick = Math.floor(Number(n.tick));
            if (!isFinite(tick) || tick < 0) continue;
            var key = Number(n.key) || 0;
            var prev = byTick[tick];
            if (!prev) {
                prev = byTick[tick] = { tick: tick, key: key, layer: want };
                list.push(prev);
            } else if (key > prev.key) {
                prev.key = key;
            }
        }
        list.sort(function(a, b) { return a.tick - b.tick; });
        return list;
    }

    // 该 tick 对应的音符下标; 无精确匹配时取最近的音符, 空列表返回 -1
    function findNearestNoteIndex(notes, tick) {
        if (!notes || !notes.length) return -1;
        var target = Number(tick);
        if (!isFinite(target)) return -1;
        var best = 0;
        var bestDist = Infinity;
        for (var i = 0; i < notes.length; i++) {
            var d = Math.abs(notes[i].tick - target);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    // 默认对齐: 第 i 字 → 第 i 个音符; 字数超出音符数时全部压到最后一个音符
    function defaultAlign(charCount, noteCount) {
        var align = [];
        var last = Math.max(0, noteCount - 1);
        for (var i = 0; i < charCount; i++) align.push(Math.min(i, last));
        return align;
    }

    // 把第 fromIdx 个字锚定到第 noteIdx 个音符, 其后各字按顺序顺移;
    // 前面的字不得越过后面 (保证 tick 单调, 多出的字合并到同一音符)
    function realignFrom(align, fromIdx, noteIdx, noteCount) {
        if (!align || !align.length || noteCount <= 0) return align || [];
        var last = noteCount - 1;
        var start = Math.max(0, Math.min(last, parseInt(noteIdx, 10) || 0));
        var from = Math.max(0, Math.min(align.length - 1, parseInt(fromIdx, 10) || 0));
        for (var i = from; i < align.length; i++) {
            var v = start + (i - from);
            align[i] = v > last ? last : v;
        }
        for (var j = from - 1; j >= 0; j--) {
            if (align[j] > align[j + 1]) align[j] = align[j + 1];
        }
        return align;
    }

    // 按「字 → 音符」映射生成歌词片段: 同一音符上的多个字合并为一条, 行与行之间断句
    //   opts: { lane, layer, tailDuration }
    function buildCharClips(chars, notes, align, opts) {
        opts = opts || {};
        if (!chars || !chars.length || !notes || !notes.length) return [];
        var lane = clampLane(opts.lane);
        var layer = Number(opts.layer);
        var tailDur = parseInt(opts.tailDuration, 10);
        if (!isFinite(tailDur) || tailDur < 1) tailDur = defaultLyricDuration();

        var groups = [];
        for (var i = 0; i < chars.length; i++) {
            var ni = align[i];
            if (!(ni >= 0 && ni < notes.length)) continue;
            var last = groups.length ? groups[groups.length - 1] : null;
            if (last && last.noteIndex === ni) {
                last.text += chars[i].ch;
            } else {
                groups.push({
                    noteIndex: ni,
                    text: chars[i].ch,
                    charIndex: i,
                    line: chars[i].line
                });
            }
        }

        var clips = [];
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var tick = notes[grp.noteIndex].tick;
            var nextTick = (g + 1 < groups.length) ? notes[groups[g + 1].noteIndex].tick : null;
            var lineStart = (g === 0) || (groups[g - 1].line !== grp.line);
            clips.push({
                tick: tick,
                lane: lane,
                text: grp.text,
                duration: nextTick != null ? Math.max(1, nextTick - tick) : Math.max(1, tailDur),
                lineStart: lineStart,
                noteLayer: layer,
                noteTick: tick,
                charIndex: grp.charIndex
            });
        }
        return clips;
    }

    // 从已写入的逐字歌词片段还原「文本 + 对齐」, 没有逐字数据时返回 null
    function readExistingAlign(layer, lane, notes) {
        var list = [];
        var lyrics = state.lyrics || [];
        var wantLayer = Number(layer);
        var wantLane = clampLane(lane);
        for (var i = 0; i < lyrics.length; i++) {
            var c = lyrics[i];
            if (!c || (c.lane || 0) !== wantLane) continue;
            if (Number(c.noteLayer) !== wantLayer) continue;
            if (!isFinite(Number(c.noteTick))) continue;
            list.push(c);
        }
        if (!list.length) return null;
        list.sort(function(a, b) {
            var ca = Number(a.charIndex), cb = Number(b.charIndex);
            var va = isFinite(ca) ? ca : 0, vb = isFinite(cb) ? cb : 0;
            if (va !== vb) return va - vb;
            return a.tick - b.tick;
        });
        var chars = [];
        var align = [];
        var lineNo = 0;
        for (var j = 0; j < list.length; j++) {
            var clip = list[j];
            if (clip.lineStart) lineNo++;
            var idx = findNearestNoteIndex(notes, Number(clip.noteTick));
            if (idx < 0) continue;
            var units = splitCodePoints(String(clip.text || ''));
            for (var k = 0; k < units.length; k++) {
                if (/^\s$/.test(units[k])) continue;
                chars.push({ ch: units[k], line: lineNo });
                align.push(idx);
            }
        }
        if (!chars.length) return null;
        return { chars: chars, align: align, lineCount: lineNo || 1 };
    }

    // 逐字对齐片段判定: 记录了绑定音符 (轨道 + tick) 与字序号
    function isCharAlignedClip(clip) {
        return !!(clip
            && isFinite(Number(clip.noteLayer))
            && isFinite(Number(clip.noteTick))
            && isFinite(Number(clip.charIndex)));
    }

    // 选中一个字后重新锚定音符: 该字及其后的字按音符顺序顺移, 并重新衔接 duration
    function realignLyricClipsByNote(clipId, targetTick) {
        var target = null;
        var lyrics = state.lyrics || [];
        for (var i = 0; i < lyrics.length; i++) {
            if (lyrics[i] && lyrics[i].id === clipId) { target = lyrics[i]; break; }
        }
        if (!target || !isCharAlignedClip(target)) return false;
        var layer = Number(target.noteLayer);
        var lane = target.lane || 0;
        var notes = collectLayerNotes(layer);
        if (!notes.length) return false;

        // 同一段逐字歌词: 同歌词轨道 + 同人声轨道 + 带 charIndex
        var seq = [];
        for (var j = 0; j < lyrics.length; j++) {
            var c = lyrics[j];
            if (!c || (c.lane || 0) !== lane) continue;
            if (Number(c.noteLayer) !== layer) continue;
            if (!isFinite(Number(c.charIndex))) continue;
            seq.push(c);
        }
        seq.sort(function(a, b) {
            var va = Number(a.charIndex), vb = Number(b.charIndex);
            if (va !== vb) return va - vb;
            return a.tick - b.tick;
        });
        var ti = -1;
        for (var s = 0; s < seq.length; s++) { if (seq[s] === target) { ti = s; break; } }
        if (ti < 0) return false;

        var noteIdx = findNearestNoteIndex(notes, targetTick);
        if (noteIdx < 0) return false;
        var lastNote = notes.length - 1;
        var assign = [];
        for (var k = 0; k < seq.length; k++) {
            var ni = findNearestNoteIndex(notes, Number(seq[k].noteTick));
            assign.push(ni < 0 ? 0 : ni);
        }
        for (var a = ti; a < seq.length; a++) {
            var v = noteIdx + (a - ti);
            assign[a] = v > lastNote ? lastNote : v;
        }
        for (var b = ti - 1; b >= 0; b--) {
            if (assign[b] > assign[b + 1]) assign[b] = assign[b + 1];
        }

        pushUndo();
        // 落到同一音符的相邻片段需要合并文本
        var removed = {};
        var lastKept = null;
        for (var m = 0; m < seq.length; m++) {
            var clip = seq[m];
            var note = notes[assign[m]];
            clip.tick = note.tick;
            clip.noteTick = note.tick;
            if (lastKept && lastKept.tick === clip.tick) {
                lastKept.text = String(lastKept.text || '') + String(clip.text || '');
                removed[clip.id] = true;
                if (state.pianoRoll && state.pianoRoll.lyricSelectedId === clip.id
                    && state.pianoRoll._setLyricSelected) {
                    state.pianoRoll._setLyricSelected(lastKept.id);
                }
                continue;
            }
            lastKept = clip;
        }
        var removedIds = Object.keys(removed);
        if (removedIds.length) {
            var kept = [];
            for (var r = 0; r < state.lyrics.length; r++) {
                if (!removed[state.lyrics[r].id]) kept.push(state.lyrics[r]);
            }
            state.lyrics = kept;
        }
        // 重新衔接 duration: 到下一片段 tick, 最后一个保留原时长
        var tail = [];
        for (var q = 0; q < state.lyrics.length; q++) {
            var cc = state.lyrics[q];
            if (!cc || (cc.lane || 0) !== lane) continue;
            if (Number(cc.noteLayer) !== layer) continue;
            if (!isFinite(Number(cc.charIndex))) continue;
            tail.push(cc);
        }
        tail.sort(function(x, y) {
            if (x.tick !== y.tick) return x.tick - y.tick;
            return Number(x.charIndex) - Number(y.charIndex);
        });
        for (var t = 0; t + 1 < tail.length; t++) {
            var gap = tail[t + 1].tick - tail[t].tick;
            if (gap >= 1) tail[t].duration = gap;
        }

        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // ============ 音符拾取 ============
    // 隐藏弹窗 (保留状态), 下一次在钢琴卷帘上按下即取该 tick; Esc / 点别处取消
    function beginNotePick(onPick, onCancel) {
        var pr = state.pianoRoll;
        if (!pr || !pr.canvas) { if (onCancel) onCancel(); return; }
        var canvas = pr.canvas;
        var finished = false;
        var cleanup = function() {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('touchstart', onDown, true);
            document.removeEventListener('keydown', onKey, true);
            canvas.style.cursor = '';
        };
        var finish = function(tick) {
            if (finished) return;
            finished = true;
            cleanup();
            if (tick == null) { if (onCancel) onCancel(); }
            else if (onPick) onPick(tick);
        };
        var onDown = function(e) {
            var touch = e.touches && e.touches[0];
            var point = touch || e;
            if (e.type === 'mousedown' && e.button !== undefined && e.button !== 0) return;
            if (point.target !== canvas && e.target !== canvas) { finish(null); return; }
            e.preventDefault();
            e.stopPropagation();
            var rect = canvas.getBoundingClientRect();
            var x = (point.clientX || 0) - rect.left;
            var tick = pr._screenToTickNearest(x);
            finish(Math.max(0, Math.floor(tick)));
        };
        var onKey = function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish(null);
            }
        };
        canvas.style.cursor = 'crosshair';
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('touchstart', onDown, { capture: true, passive: false });
        document.addEventListener('keydown', onKey, true);
    }

    // 歌词编辑条: 给选中的逐字片段重新指定对齐音符 (后续字自动顺移)
    function beginLyricAnchorPick(clip) {
        if (!clip) clip = N.getSelectedLyricClip ? N.getSelectedLyricClip() : null;
        if (!clip) { showSmallTip(i18nText('请先选中一个歌词片段')); return; }
        if (!isCharAlignedClip(clip)) {
            showSmallTip(i18nText('该片段不是逐字对齐生成的，无法按音符重排'));
            return;
        }
        showSmallTip(i18nText('点击钢琴卷帘中的音符，为该字重新指定对齐位置'));
        beginNotePick(function(tick) {
            if (realignLyricClipsByNote(clip.id, tick)) showSmallTip(i18nText('已重新对齐后续歌词'));
            else showSmallTip(i18nText('该位置没有可用音符'));
        }, function() {});
    }

    // ============ 写入歌词 ============
    function clampText(text) {
        return String(text == null ? '' : text);
    }

    function normalizeIncomingClip(c) {
        var tick = Math.floor(Number(c && c.tick));
        if (!isFinite(tick) || tick < 0) return null;
        var text = clampText(c.text);
        if (!text) return null;
        var dur = Math.floor(Number(c.duration));
        if (!isFinite(dur) || dur < 1) dur = defaultLyricDuration();
        var item = {
            id: genLyricId(),
            tick: tick,
            lane: clampLane(c.lane),
            text: text,
            duration: dur
        };
        if (c.lineStart) item.lineStart = true;
        if (isFinite(Number(c.noteLayer)) && c.noteLayer !== null && c.noteLayer !== undefined) {
            item.noteLayer = Number(c.noteLayer);
        }
        if (isFinite(Number(c.noteTick)) && c.noteTick !== null && c.noteTick !== undefined) {
            item.noteTick = Math.max(0, Math.floor(Number(c.noteTick)));
        }
        if (isFinite(Number(c.charIndex)) && c.charIndex !== null && c.charIndex !== undefined) {
            item.charIndex = Math.max(0, Math.floor(Number(c.charIndex)));
        }
        return item;
    }

    // 追加模式: 丢弃与待写入片段在同轨重叠的旧歌词
    function dropOverlappingLyrics(existing, incoming) {
        var keep = [];
        for (var i = 0; i < existing.length; i++) {
            var o = existing[i];
            if (!o) continue;
            var oLane = o.lane || 0;
            var oDur = parseInt(o.duration, 10);
            if (!isFinite(oDur) || oDur < 1) oDur = defaultLyricDuration();
            var oStart = o.tick, oEnd = o.tick + oDur;
            var drop = false;
            for (var j = 0; j < incoming.length; j++) {
                var n = incoming[j];
                if ((n.lane || 0) !== oLane) continue;
                var nEnd = n.tick + n.duration;
                if (Math.min(nEnd, oEnd) > Math.max(n.tick, oStart)) { drop = true; break; }
            }
            if (!drop) keep.push(o);
        }
        return keep;
    }

    // 已有歌词时让用户选择 覆盖 / 追加; 返回 Promise<'replace'|'append'|null>
    function askWriteMode() {
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(
                i18nText('写入歌词'),
                i18nText('当前已有歌词标注') + ': ' + ((state.lyrics || []).length) + '\n'
                + i18nText('覆盖会清空已有歌词；追加只会替换同轨重叠的部分。'),
                'fa-solid fa-circle-question',
                { maxWidth: 430 }
            );
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            if (N._appDialogStack) N._appDialogStack.push(overlay);
            var close = function(v) { _closeAppDialog(overlay, resolve, v); };
            box.querySelector('#app-dialog-x').addEventListener('click', function() { close(null); });
            var actions = box.querySelector('.popup-actions');
            var cancelBtn = _appDialogBtn(i18nText('取消'), false);
            cancelBtn.addEventListener('click', function() { close(null); });
            var appendBtn = _appDialogBtn(i18nText('追加'), false);
            appendBtn.addEventListener('click', function() { close('append'); });
            var replaceBtn = _appDialogBtn(i18nText('覆盖'), true);
            replaceBtn.addEventListener('click', function() { close('replace'); });
            actions.appendChild(cancelBtn);
            actions.appendChild(appendBtn);
            actions.appendChild(replaceBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(null); });
            setTimeout(function() { replaceBtn.focus(); }, 50);
        });
    }

    // 把生成的片段写入 state.lyrics (已有歌词时先询问覆盖 / 追加)
    function writeQuickLyrics(clips, onDone) {
        var incoming = [];
        for (var i = 0; i < (clips || []).length; i++) {
            var item = normalizeIncomingClip(clips[i]);
            if (item) incoming.push(item);
        }
        if (!incoming.length) {
            showAppAlert(i18nText('没有可写入的歌词'), { title: i18nText('快速添加歌词'), icon: 'fa-solid fa-circle-info' });
            return;
        }
        var doWrite = function(mode) {
            pushUndo();
            if (mode === 'append') state.lyrics = dropOverlappingLyrics(state.lyrics || [], incoming);
            else state.lyrics = [];
            Array.prototype.push.apply(state.lyrics, incoming);
            lyricRebuildIndex();
            syncLyricsToRoll();
            markDirty();
            enterLyricsEditMode();
            if (state.pianoRoll && state.pianoRoll._setLyricSelected) {
                state.pianoRoll._setLyricSelected(incoming[0].id);
            }
            showSmallTip(i18nText('已写入歌词') + ': ' + incoming.length);
            if (onDone) onDone(incoming);
        };
        if (state.lyrics && state.lyrics.length) {
            askWriteMode().then(function(mode) { if (mode) doWrite(mode); });
        } else {
            doWrite('replace');
        }
    }

    // ============ 快速添加对话框 ============
    function collectLayerOptions() {
        var notes = state.notes || [];
        var counts = {};
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (!n) continue;
            var l = Number(n.layer);
            if (!isFinite(l)) continue;
            counts[l] = (counts[l] || 0) + 1;
        }
        var layers = Object.keys(counts).map(Number).sort(function(a, b) { return a - b; });
        var opts = [];
        for (var j = 0; j < layers.length; j++) {
            var layer = layers[j];
            var tr = findTrackByLayer(layer);
            var name = (tr && tr.name) ? tr.name : ('Layer ' + (layer + 1));
            opts.push({ layer: layer, name: name, count: counts[layer] });
        }
        return opts;
    }

    function laneSelectHtml(selected) {
        var count = lyricLaneCount();
        var html = '';
        for (var i = 0; i < count; i++) {
            html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>'
                + (i + 1) + '</option>';
        }
        return html;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function readTextFile(onLoad) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.lrc,.txt,text/plain';
        input.style.display = 'none';
        document.body.appendChild(input);
        var cleanup = function() { if (input.parentNode) input.parentNode.removeChild(input); };
        input.addEventListener('change', function() {
            var f = input.files && input.files[0];
            if (!f) { cleanup(); return; }
            var reader = new FileReader();
            reader.onload = function() { cleanup(); onLoad(String(reader.result || '')); };
            reader.onerror = function() {
                cleanup();
                showAppAlert(i18nText('无法读取文件'), { title: i18nText('快速添加歌词'), icon: 'fa-solid fa-triangle-exclamation' });
            };
            reader.readAsText(f);
        });
        input.click();
    }

    // 打开「快速添加歌词」弹窗; initialTab: 'lrc' (默认) | 'char'
    function showLyricsQuickDialog(initialTab) {
        var overlay = _appDialogOverlay();
        var box = _appDialogBox(i18nText('快速添加歌词'), '', 'fa-solid fa-wand-magic-sparkles', { maxWidth: 780 });
        box.style.maxHeight = '90vh';
        var body = box.querySelector('.settings-body');
        body.style.whiteSpace = 'normal';
        body.style.gap = '10px';
        body.textContent = '';

        var dlg = {
            tab: initialTab === 'char' ? 'char' : 'lrc',
            lrc: { lane: 0, offsetSec: 0, tailDuration: defaultLyricDuration() },
            align: { layer: null, lane: 0, mode: 'char', chars: [], align: [], notes: [], selected: 0 }
        };

        // ---- 标签页 ----
        var tabs = document.createElement('div');
        tabs.className = 'lq-tabs';
        tabs.innerHTML =
            '<button type="button" class="lq-tab" data-tab="lrc">' + escapeHtml(i18nText('LRC 导入')) + '</button>'
            + '<button type="button" class="lq-tab" data-tab="char">' + escapeHtml(i18nText('逐字对齐')) + '</button>';
        body.appendChild(tabs);

        // ---- LRC 面板 ----
        var lrcPanel = document.createElement('div');
        lrcPanel.className = 'lq-panel';
        lrcPanel.setAttribute('data-panel', 'lrc');
        lrcPanel.innerHTML =
            '<div class="lq-hint">' + escapeHtml(i18nText('按当前速度把 LRC 时间换算为 tick')) + ': '
            + '<b id="lq-lrc-tempo">' + currentTempo() + '</b> tick/s (1 tick = <span id="lq-lrc-tick-ms">'
            + Math.round(1000 / currentTempo()) + '</span> ms)</div>'
            + '<textarea class="lq-textarea" id="lq-lrc-input" spellcheck="false" placeholder="'
            + escapeHtml('[00:12.34]' + i18nText('第一句')) + '&#10;' + escapeHtml('[00:15.60]' + i18nText('第二句')) + '"></textarea>'
            + '<div class="lq-row">'
            + '<button type="button" class="lq-btn" id="lq-lrc-file"><i class="fa-solid fa-file-import"></i> '
            + escapeHtml(i18nText('选择 LRC 文件')) + '</button>'
            + '<button type="button" class="lq-btn" id="lq-lrc-clear">' + escapeHtml(i18nText('清空')) + '</button>'
            + '<span class="lq-spacer"></span>'
            + '<label class="lq-field">' + escapeHtml(i18nText('歌词轨道'))
            + ' <select id="lq-lrc-lane">' + laneSelectHtml(dlg.lrc.lane) + '</select></label>'
            + '<label class="lq-field">' + escapeHtml(i18nText('时间偏移 (秒)'))
            + ' <input type="number" id="lq-lrc-offset" step="0.01" value="0" style="width:82px;"></label>'
            + '<label class="lq-field">' + escapeHtml(i18nText('末句时长 (tick)'))
            + ' <input type="number" id="lq-lrc-tail" min="1" step="1" value="' + dlg.lrc.tailDuration + '" style="width:74px;"></label>'
            + '</div>'
            + '<div class="lq-stat" id="lq-lrc-preview"></div>';
        body.appendChild(lrcPanel);

        // ---- 逐字对齐面板 ----
        var charPanel = document.createElement('div');
        charPanel.className = 'lq-panel';
        charPanel.setAttribute('data-panel', 'char');
        charPanel.style.display = 'none';
        charPanel.innerHTML =
            '<div class="lq-row">'
            + '<label class="lq-field">' + escapeHtml(i18nText('人声轨道'))
            + ' <select id="lq-char-layer"></select></label>'
            + '<label class="lq-field">' + escapeHtml(i18nText('歌词轨道'))
            + ' <select id="lq-char-lane">' + laneSelectHtml(dlg.align.lane) + '</select></label>'
            + '<label class="lq-field">' + escapeHtml(i18nText('拆分方式'))
            + ' <select id="lq-char-mode">'
            + '<option value="char">' + escapeHtml(i18nText('按字')) + '</option>'
            + '<option value="word">' + escapeHtml(i18nText('按词')) + '</option>'
            + '</select></label>'
            + '</div>'
            + '<textarea class="lq-textarea" id="lq-char-input" spellcheck="false" placeholder="'
            + escapeHtml(i18nText('粘贴歌词文本，每个字会对齐到所选轨道的一个音符')) + '"></textarea>'
            + '<div class="lq-row">'
            + '<button type="button" class="lq-btn" id="lq-char-realign">' + escapeHtml(i18nText('重新对齐')) + '</button>'
            + '<button type="button" class="lq-btn" id="lq-char-restore">' + escapeHtml(i18nText('载入已有对齐')) + '</button>'
            + '<button type="button" class="lq-btn" id="lq-char-pick"><i class="fa-solid fa-crosshairs"></i> '
            + escapeHtml(i18nText('为选中字点选音符')) + '</button>'
            + '<span class="lq-spacer"></span>'
            + '<span class="lq-stat-inline" id="lq-char-stat"></span>'
            + '</div>'
            + '<div class="lq-list" id="lq-char-list"></div>'
            + '<div class="lq-hint">' + escapeHtml(i18nText('修改某个字对应的音符后，后面的字会按顺序重新对齐；同一音符上的多个字会合并为一条歌词。')) + '</div>';
        body.appendChild(charPanel);

        var lrcInput = lrcPanel.querySelector('#lq-lrc-input');
        var lrcPreview = lrcPanel.querySelector('#lq-lrc-preview');
        var lrcLaneSel = lrcPanel.querySelector('#lq-lrc-lane');
        var lrcOffsetInput = lrcPanel.querySelector('#lq-lrc-offset');
        var lrcTailInput = lrcPanel.querySelector('#lq-lrc-tail');

        var charLayerSel = charPanel.querySelector('#lq-char-layer');
        var charLaneSel = charPanel.querySelector('#lq-char-lane');
        var charModeSel = charPanel.querySelector('#lq-char-mode');
        var charInput = charPanel.querySelector('#lq-char-input');
        var charStat = charPanel.querySelector('#lq-char-stat');
        var charList = charPanel.querySelector('#lq-char-list');

        // ---- 标签页切换 ----
        function setTab(tab) {
            dlg.tab = tab === 'char' ? 'char' : 'lrc';
            var btns = tabs.querySelectorAll('.lq-tab');
            for (var i = 0; i < btns.length; i++) {
                var on = btns[i].getAttribute('data-tab') === dlg.tab;
                btns[i].classList[on ? 'add' : 'remove']('is-active');
            }
            lrcPanel.style.display = dlg.tab === 'lrc' ? '' : 'none';
            charPanel.style.display = dlg.tab === 'char' ? '' : 'none';
            if (dlg.tab === 'char') refreshCharTab();
        }
        tabs.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('.lq-tab') : null;
            if (btn) setTab(btn.getAttribute('data-tab'));
        });

        // ---- LRC 预览 ----
        function updateLrcPreview() {
            var result = convertLrcToClips(lrcInput.value, {
                tempo: currentTempo(),
                lane: dlg.lrc.lane,
                offsetSec: dlg.lrc.offsetSec,
                tailDuration: dlg.lrc.tailDuration
            });
            if (!lrcInput.value.trim()) { lrcPreview.textContent = ''; return; }
            if (!result.count) {
                lrcPreview.textContent = i18nText('没有解析到带时间标签的歌词行');
                return;
            }
            var txt = i18nText('解析到') + ' ' + result.count + ' ' + i18nText('句')
                + ' · tick ' + result.minTick + ' – ' + result.maxTick;
            if (result.conflicts) {
                txt += ' · ' + result.conflicts + ' ' + i18nText('句因 tick 冲突已顺移');
            }
            if (result.empty) {
                txt += ' · ' + result.empty + ' ' + i18nText('行没有文字已跳过');
            }
            lrcPreview.textContent = txt;
        }

        lrcInput.addEventListener('input', updateLrcPreview);
        lrcLaneSel.addEventListener('change', function() {
            dlg.lrc.lane = clampLane(lrcLaneSel.value);
            updateLrcPreview();
        });
        lrcOffsetInput.addEventListener('input', function() {
            var v = parseFloat(lrcOffsetInput.value);
            dlg.lrc.offsetSec = isFinite(v) ? v : 0;
            updateLrcPreview();
        });
        lrcTailInput.addEventListener('input', function() {
            var v = parseInt(lrcTailInput.value, 10);
            if (!isFinite(v) || v < 1) v = defaultLyricDuration();
            dlg.lrc.tailDuration = v;
            updateLrcPreview();
        });
        lrcPanel.querySelector('#lq-lrc-file').addEventListener('click', function() {
            readTextFile(function(txt) {
                lrcInput.value = txt;
                updateLrcPreview();
            });
        });
        lrcPanel.querySelector('#lq-lrc-clear').addEventListener('click', function() {
            lrcInput.value = '';
            updateLrcPreview();
            lrcInput.focus();
        });

        // ---- 逐字对齐: 轨道下拉 ----
        function rebuildLayerSelect() {
            var opts = collectLayerOptions();
            charLayerSel.textContent = '';
            if (!opts.length) {
                var empty = document.createElement('option');
                empty.value = '';
                empty.textContent = i18nText('没有可用轨道');
                charLayerSel.appendChild(empty);
                charLayerSel.disabled = true;
                dlg.align.layer = null;
                return;
            }
            charLayerSel.disabled = false;
            for (var i = 0; i < opts.length; i++) {
                var o = document.createElement('option');
                o.value = String(opts[i].layer);
                o.textContent = opts[i].name + ' (' + opts[i].count + ' ' + i18nText('音符') + ')';
                charLayerSel.appendChild(o);
            }
            var wanted = (dlg.align.layer != null) ? String(dlg.align.layer) : null;
            var found = false;
            if (wanted != null) {
                for (var j = 0; j < charLayerSel.options.length; j++) {
                    if (charLayerSel.options[j].value === wanted) { charLayerSel.selectedIndex = j; found = true; break; }
                }
            }
            if (!found) {
                // 默认选择音符最多的轨道 (旋律 / 人声轨通常音符最多)
                var bestIdx = 0;
                for (var k = 0; k < opts.length; k++) {
                    if (opts[k].count > (opts[bestIdx] ? opts[bestIdx].count : -1)) bestIdx = k;
                }
                charLayerSel.selectedIndex = bestIdx;
            }
            dlg.align.layer = Number(charLayerSel.value);
            dlg.align.notes = collectLayerNotes(dlg.align.layer);
        }

        // ---- 逐字对齐: 列表渲染 ----
        function renderAlignList() {
            var scrollTop = charList.scrollTop;
            charList.textContent = '';
            var chars = dlg.align.chars;
            var align = dlg.align.align;
            var notes = dlg.align.notes;
            if (!chars.length) {
                var emptyTip = document.createElement('div');
                emptyTip.className = 'lq-list-empty';
                emptyTip.textContent = i18nText('粘贴歌词文本后会自动生成对齐列表');
                charList.appendChild(emptyTip);
                return;
            }
            var frag = document.createDocumentFragment();
            for (var i = 0; i < chars.length; i++) {
                var ni = align[i];
                var note = notes[ni];
                var row = document.createElement('div');
                row.className = 'lq-item' + (i === dlg.align.selected ? ' is-active' : '');
                row.setAttribute('data-idx', String(i));

                var idxSpan = document.createElement('span');
                idxSpan.className = 'lq-item-idx';
                idxSpan.textContent = String(i + 1);

                var chSpan = document.createElement('span');
                chSpan.className = 'lq-item-ch';
                chSpan.textContent = chars[i].ch;

                var noteSpan = document.createElement('span');
                noteSpan.className = 'lq-item-note';
                noteSpan.textContent = note
                    ? ('#' + (ni + 1) + ' · tick ' + note.tick + ' · ' + getNbsKeyDisplayLabel(note.key))
                    : i18nText('无对应音符');

                var minus = document.createElement('button');
                minus.type = 'button';
                minus.className = 'lq-step';
                minus.setAttribute('data-dir', '-1');
                minus.textContent = '−';
                minus.title = i18nText('对齐到前一个音符');

                var plus = document.createElement('button');
                plus.type = 'button';
                plus.className = 'lq-step';
                plus.setAttribute('data-dir', '1');
                plus.textContent = '+';
                plus.title = i18nText('对齐到后一个音符');

                row.appendChild(idxSpan);
                row.appendChild(chSpan);
                row.appendChild(noteSpan);
                row.appendChild(minus);
                row.appendChild(plus);
                frag.appendChild(row);
            }
            charList.appendChild(frag);
            charList.scrollTop = scrollTop;
        }

        function updateCharStat() {
            var noteCount = dlg.align.notes.length;
            var charCount = dlg.align.chars.length;
            if (!charCount) { charStat.textContent = ''; return; }
            var used = 0;
            if (noteCount) {
                for (var i = 0; i < charCount; i++) {
                    if ((i === 0 || dlg.align.align[i] !== dlg.align.align[i - 1])) used++;
                }
            }
            var txt = i18nText('字数') + ' ' + charCount + ' · ' + i18nText('音符') + ' ' + noteCount
                + ' · ' + i18nText('生成') + ' ' + used + ' ' + i18nText('条');
            charStat.textContent = txt;
        }

        function renderCharTab() {
            renderAlignList();
            updateCharStat();
        }

        // 文本变化后重建字序列; keepAlign=true 时尽量保留已有锚点
        function rebuildChars(keepAlign) {
            var prevAlign = dlg.align.align;
            var prevChars = dlg.align.chars;
            dlg.align.chars = splitLyricChars(charInput.value, dlg.align.mode);
            var noteCount = dlg.align.notes.length;
            if (keepAlign && prevChars.length === dlg.align.chars.length && prevAlign.length === dlg.align.chars.length) {
                dlg.align.align = prevAlign.slice();
            } else {
                dlg.align.align = defaultAlign(dlg.align.chars.length, noteCount);
            }
            if (dlg.align.selected >= dlg.align.chars.length) {
                dlg.align.selected = Math.max(0, dlg.align.chars.length - 1);
            }
            renderCharTab();
        }

        function refreshCharTab() {
            rebuildLayerSelect();
            rebuildChars(true);
        }

        charLayerSel.addEventListener('change', function() {
            dlg.align.layer = Number(charLayerSel.value);
            dlg.align.notes = collectLayerNotes(dlg.align.layer);
            rebuildChars(false);
        });
        charLaneSel.addEventListener('change', function() {
            dlg.align.lane = clampLane(charLaneSel.value);
        });
        charModeSel.addEventListener('change', function() {
            dlg.align.mode = charModeSel.value === 'word' ? 'word' : 'char';
            rebuildChars(false);
        });
        charInput.addEventListener('input', function() { rebuildChars(true); });

        charList.addEventListener('click', function(e) {
            var target = e.target;
            if (!target) return;
            var row = target.closest ? target.closest('.lq-item') : null;
            if (!row) return;
            var idx = parseInt(row.getAttribute('data-idx'), 10);
            if (!isFinite(idx)) return;
            var dirAttr = target.getAttribute ? target.getAttribute('data-dir') : null;
            if (dirAttr) {
                var dir = dirAttr === '1' ? 1 : -1;
                var cur = dlg.align.align[idx];
                var next = cur + dir;
                var lastNote = dlg.align.notes.length - 1;
                if (next < 0) next = 0;
                if (next > lastNote) next = lastNote;
                realignFrom(dlg.align.align, idx, next, dlg.align.notes.length);
                dlg.align.selected = idx;
                renderCharTab();
                return;
            }
            dlg.align.selected = idx;
            renderCharTab();
            var active = charList.querySelector('.lq-item.is-active');
            if (active && active.scrollIntoView) {
                active.scrollIntoView({ block: 'nearest' });
            }
        });

        charPanel.querySelector('#lq-char-realign').addEventListener('click', function() {
            dlg.align.align = defaultAlign(dlg.align.chars.length, dlg.align.notes.length);
            dlg.align.selected = 0;
            renderCharTab();
        });

        charPanel.querySelector('#lq-char-restore').addEventListener('click', function() {
            if (dlg.align.layer == null) return;
            var notes = dlg.align.notes.length ? dlg.align.notes : collectLayerNotes(dlg.align.layer);
            var restored = readExistingAlign(dlg.align.layer, dlg.align.lane, notes);
            if (!restored) {
                showAppAlert(i18nText('该轨道上还没有逐字对齐的歌词'), {
                    title: i18nText('快速添加歌词'), icon: 'fa-solid fa-circle-info'
                });
                return;
            }
            dlg.align.notes = notes;
            dlg.align.chars = restored.chars;
            dlg.align.align = restored.align;
            dlg.align.selected = 0;
            var txt = '';
            for (var i = 0; i < restored.chars.length; i++) txt += restored.chars[i].ch;
            charInput.value = txt;
            renderCharTab();
            showSmallTip(i18nText('已载入上一次的逐字对齐'));
        });

        charPanel.querySelector('#lq-char-pick').addEventListener('click', function() {
            if (!dlg.align.chars.length) {
                showSmallTip(i18nText('请先粘贴歌词文本'));
                return;
            }
            if (dlg.align.layer == null || !dlg.align.notes.length) {
                showSmallTip(i18nText('所选轨道没有音符'));
                return;
            }
            var idx = dlg.align.selected;
            overlay.style.display = 'none';
            showSmallTip(i18nText('点击钢琴卷帘中的音符，为该字指定对齐位置'));
            beginNotePick(function(tick) {
                overlay.style.display = 'flex';
                var noteIdx = findNearestNoteIndex(dlg.align.notes, tick);
                if (noteIdx < 0) return;
                realignFrom(dlg.align.align, idx, noteIdx, dlg.align.notes.length);
                dlg.align.selected = Math.min(idx + 1, dlg.align.chars.length - 1);
                renderCharTab();
                var active = charList.querySelector('.lq-item.is-active');
                if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
            }, function() {
                overlay.style.display = 'flex';
            });
        });

        // ---- 底部按钮 ----
        var actions = box.querySelector('.popup-actions');
        var cancelBtn = _appDialogBtn(i18nText('取消'), false);
        var writeBtn = _appDialogBtn(i18nText('写入歌词'), true);
        actions.appendChild(cancelBtn);
        actions.appendChild(writeBtn);

        var closeDialog = function() {
            document.removeEventListener('keydown', onKeydown, true);
            _closeAppDialog(overlay, null);
        };
        var onKeydown = function(e) {
            if (e.key !== 'Escape') return;
            if (overlay.style.display === 'none') return;   // 拾取音符期间由拾取逻辑处理
            e.preventDefault();
            e.stopPropagation();
            closeDialog();
        };

        cancelBtn.addEventListener('click', closeDialog);
        box.querySelector('#app-dialog-x').addEventListener('click', closeDialog);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeDialog(); });
        document.addEventListener('keydown', onKeydown, true);
        if (N._appDialogStack) N._appDialogStack.push(overlay);

        writeBtn.addEventListener('click', function() {
            var clips;
            if (dlg.tab === 'lrc') {
                var r = convertLrcToClips(lrcInput.value, {
                    tempo: currentTempo(),
                    lane: dlg.lrc.lane,
                    offsetSec: dlg.lrc.offsetSec,
                    tailDuration: dlg.lrc.tailDuration
                });
                clips = r.clips;
            } else {
                if (!dlg.align.notes.length || !dlg.align.chars.length) {
                    showSmallTip(i18nText('请先选择有音符的轨道并粘贴歌词文本'));
                    return;
                }
                clips = buildCharClips(dlg.align.chars, dlg.align.notes, dlg.align.align, {
                    lane: dlg.align.lane,
                    layer: dlg.align.layer,
                    tailDuration: defaultLyricDuration()
                });
            }
            if (!clips || !clips.length) {
                showAppAlert(i18nText('没有可写入的歌词'), {
                    title: i18nText('快速添加歌词'), icon: 'fa-solid fa-circle-info'
                });
                return;
            }
            writeQuickLyrics(clips, function() { closeDialog(); });
        });

        document.body.appendChild(overlay);
        overlay.appendChild(box);
        setTab(dlg.tab);
        updateLrcPreview();
        setTimeout(function() {
            if (dlg.tab === 'lrc') lrcInput.focus();
            else charInput.focus();
        }, 50);
        return overlay;
    }

    // ---- 导出 ----
    N.showLyricsQuickDialog = showLyricsQuickDialog;
    N.beginLyricAnchorPick = beginLyricAnchorPick;
    N.isCharAlignedClip = isCharAlignedClip;
    N.realignLyricClipsByNote = realignLyricClipsByNote;
    N.writeQuickLyrics = writeQuickLyrics;
    N.LyricQuick = {
        parseLrc: parseLrc,
        convertLrcToClips: convertLrcToClips,
        splitLyricChars: splitLyricChars,
        splitCodePoints: splitCodePoints,
        collectLayerNotes: collectLayerNotes,
        findNearestNoteIndex: findNearestNoteIndex,
        defaultAlign: defaultAlign,
        realignFrom: realignFrom,
        buildCharClips: buildCharClips,
        readExistingAlign: readExistingAlign,
        isCharAlignedClip: isCharAlignedClip,
        realignLyricClipsByNote: realignLyricClipsByNote,
        dropOverlappingLyrics: dropOverlappingLyrics,
        DEFAULT_TAIL_DURATION: DEFAULT_TAIL_DURATION
    };
})(window.WebNBS);
