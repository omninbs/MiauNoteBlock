/* 23-json-io.js — MiauNoteBlock 功能模块
   来源: 原 main.js L11204-L11876; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    var LYRIC_DEFAULT_DURATION = N.LYRIC_DEFAULT_DURATION;
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    function applyTransposeToOctaveRange() { return N.applyTransposeToOctaveRange.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function doCompressSong() { return N.doCompressSong.apply(this, arguments); }
    function ensureLyricLanes() { return N.ensureLyricLanes.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function genLyricId() { return N.genLyricId.apply(this, arguments); }
    function hideTaskProgress() { return N.hideTaskProgress.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function lyricRebuildIndex() { return N.lyricRebuildIndex.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function normalizeLyricLane() { return N.normalizeLyricLane.apply(this, arguments); }
    function normalizeLyricClip() { return N.normalizeLyricClip.apply(this, arguments); }
    function openFindPanel() { return N.openFindPanel.apply(this, arguments); }
    function openSegSplitPopup() { return N.openSegSplitPopup.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function removeEmptyTracks() { return N.removeEmptyTracks.apply(this, arguments); }
    function segmentEnsure() { return N.segmentEnsure.apply(this, arguments); }
    function segmentSorted() { return N.segmentSorted.apply(this, arguments); }
    function setLyricLanes() { return N.setLyricLanes.apply(this, arguments); }
    function segmentSync() { return N.segmentSync.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function showArpeggioTracksDialog() { return N.showArpeggioTracksDialog.apply(this, arguments); }
    function showClearSustainDialog() { return N.showClearSustainDialog.apply(this, arguments); }
    function showCompressSongDialog() { return N.showCompressSongDialog.apply(this, arguments); }
    function showLyricsQuickDialog() { return N.showLyricsQuickDialog.apply(this, arguments); }
    function showRangeProcessDialog() { return N.showRangeProcessDialog.apply(this, arguments); }
    function showSustainFillAlert() { return N.showSustainFillAlert.apply(this, arguments); }
    function showSustainFillDialog() { return N.showSustainFillDialog.apply(this, arguments); }
    function showTaskProgress() { return N.showTaskProgress.apply(this, arguments); }
    function syncLyricsToRoll() { return N.syncLyricsToRoll.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }


    // 导出片段分组信息 (segments.json): 记录每条轨道与每个片段的 lane / 时间范围 / 名称
    // lanes[].layers 记录该轨对应的「真实全局 NBS 层号」: 包内 song.nbs 的音符 layer 即真实层号,
    // 导入时按层号精确切回片段。(旧版本导出的是 base 起的连续重编号, 与 song.nbs 对不上,
    // 会导致导入后所有片段为空 —— 已修复, 导入侧对旧格式保留宽松兜底)
    function buildSegmentsJson() {
        var sorted = segmentSorted();
        var lanes = [];
        for (var li = 0; li < (state.segmentLanes || []).length; li++) {
            var ln = state.segmentLanes[li];
            var used = {};
            for (var si = 0; si < sorted.length; si++) {
                if (sorted[si].lane !== li) continue;
                var sn = sorted[si].notes || [];
                for (var ni = 0; ni < sn.length; ni++) used[sn[ni].layer || 0] = true;
            }
            // 优先用 lane 上的真实层映射 (缝合重排后由 segmentCompose 同步维护);
            // 否则从片段音符收集 (capture 路径的片段音符 layer 即真实全局层)
            var layers;
            if (Array.isArray(ln.layerKeys) && ln.layerKeys.length) {
                layers = ln.layerKeys.slice().sort(function(a, b) { return a - b; });
            } else if (ln.layerKey !== undefined && ln.layerKey !== null) {
                layers = [ln.layerKey];
            } else {
                layers = Object.keys(used).map(Number).sort(function(a, b) { return a - b; });
            }
            lanes.push({
                name: (typeof ln.name === 'string' ? ln.name : undefined),
                muted: !!ln.muted, solo: !!ln.solo,
                volume: isFinite(ln.volume) ? ln.volume : 100,
                height: isFinite(ln.height) ? ln.height : SEG_DEFAULT_LANE_H,
                color: (typeof ln.color === 'string' ? ln.color : undefined),
                // 片段轨道归属信息: 再次导入时按通道 / 单层 / 多层精确还原
                channel: (isFinite(ln.channel) ? ln.channel : undefined),
                voice: (ln.voice === undefined ? undefined : ln.voice),
                isDrum: (ln.isDrum === undefined ? undefined : !!ln.isDrum),
                layerKey: (isFinite(ln.layerKey) ? ln.layerKey : undefined),
                layerKeys: (Array.isArray(ln.layerKeys) && ln.layerKeys.length ? ln.layerKeys.slice() : undefined),
                layers: layers
            });
        }
        var segs = [];
        var total = 0;
        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            segs.push({ lane: s.lane, start: s.start, end: s.end, name: s.name });
            total += Math.max(1, s.end - s.start);
        }
        return {
            type: 'noteblock-web-segments',
            formatVersion: 2,
            lanes: lanes,
            segments: segs,
            totalLength: total
        };
    }

    // 从作品包还原片段分组; 包内没有该文件时静默跳过 (-1)
    // notesOverride: 优先使用调用方传入的原始解析音符 (避免被片段缝合流程改写)
    function importSegmentsFromZip(zipFile, meta, notesOverride) {
        var name = (meta && meta.segments) ? meta.segments : 'segments.json';
        var srcNotes = (Array.isArray(notesOverride) && notesOverride.length) ? notesOverride : state.notes;
        var f = zipFile.file(name);
        if (!f) return Promise.resolve(-1);
        return f.async('string').then(function(text) {
            var data;
            try { data = JSON.parse(text); } catch (e) { return -1; }
            var arr = (data && Array.isArray(data.segments)) ? data.segments
                : (Array.isArray(data) ? data : null);
            if (!arr) return -1;
            // 恢复 lane 定义 (含真实全局层映射 layerKeys, 供再次 capture / 再导出使用)
            state.segmentLanes = [];
            var laneLayers = [];
            if (data && Array.isArray(data.lanes)) {
                for (var li = 0; li < data.lanes.length; li++) {
                    var ld = data.lanes[li] || {};
                    var laneKeys = Array.isArray(ld.layerKeys) && ld.layerKeys.length
                        ? ld.layerKeys.filter(isFinite).map(Number)
                        : (Array.isArray(ld.layers) ? ld.layers.filter(isFinite).map(Number) : []);
                    state.segmentLanes.push({
                        id: li + 1,
                        name: (typeof ld.name === 'string' ? ld.name : undefined),
                        muted: !!ld.muted, solo: !!ld.solo,
                        // 导出时音量已烘焙进音符, 导入后重置为 100 避免二次衰减
                        volume: 100,
                        height: isFinite(ld.height) ? ld.height : SEG_DEFAULT_LANE_H,
                        color: (typeof ld.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(ld.color)) ? ld.color : undefined,
                        channel: (isFinite(ld.channel) ? ld.channel : undefined),
                        voice: (ld.voice === undefined ? undefined : ld.voice),
                        isDrum: (ld.isDrum === undefined ? undefined : !!ld.isDrum),
                        layerKey: (isFinite(ld.layerKey) ? ld.layerKey : undefined),
                        layerKeys: laneKeys.length ? laneKeys : undefined
                    });
                    laneLayers.push(laneKeys);
                }
            }
            if (!state.segmentLanes.length) {
                state.segmentLanes.push({
                    id: 1, muted: false, solo: false, volume: 100, height: SEG_DEFAULT_LANE_H
                });
                laneLayers.push([]);
            }
            state.segments = [];
            state._segmentIdSeq = 0;
            var maxLane = laneLayers.length - 1;

            // 按层号把音符切进片段; allStrict=false 时忽略层过滤只按时间窗归位 (旧格式兜底)
            function buildSegments(strict) {
                var segs = [];
                var placed = 0;
                for (var i = 0; i < arr.length; i++) {
                    var s = arr[i];
                    if (!s || !isFinite(s.start) || !isFinite(s.end)) continue;
                    var st = Math.max(0, Math.floor(s.start));
                    var en = Math.max(st + 1, Math.floor(s.end));
                    var lane = isFinite(s.lane) ? Math.max(0, Math.min(maxLane, s.lane)) : 0;
                    var gl = laneLayers[lane] || [];
                    var notes = [];
                    for (var k = 0; k < srcNotes.length; k++) {
                        var nt = srcNotes[k];
                        if (nt.tick < st || nt.tick >= en) continue;
                        var ntLayer = isFinite(nt.layer) ? nt.layer : 0;
                        // 片段音符 layer 统一存「真实全局层」(与 segmentCaptureFromSong 语义一致,
                        // 缝合 segmentCompose 会自动重排); 不在本轨层集合内则跳过
                        if (strict && gl.length && gl.indexOf(ntLayer) < 0) continue;
                        notes.push({
                            rel: nt.tick - st, layer: ntLayer,
                            instrument: nt.instrument, key: nt.key,
                            velocity: isFinite(nt.velocity) ? nt.velocity : 100,
                            pan: isFinite(nt.pan) ? nt.pan : 100, pitch: nt.pitch || 0
                        });
                    }
                    placed += notes.length;
                    segs.push({
                        id: ++state._segmentIdSeq, lane: lane, start: st, end: en,
                        name: s.name || ('片段 ' + (i + 1)), notes: notes
                    });
                }
                return { segs: segs, placed: placed };
            }

            var built = buildSegments(true);
            // 严格按层归位一个音符都没进片段 (旧格式 layers 是连续重编号, 与真实层对不上):
            // 退化为只按时间窗归位, 宁可粗略也不能让所有片段全空
            if (!built.placed && srcNotes.length) built = buildSegments(false);
            state.segments = built.segs;
            segmentEnsure();
            segmentSync();
            return state.segments.length;
        }).catch(function() { return -1; });
    }

    // ---- 歌词数据导入还原 ----
    // 解析歌词数据 (兼容三种形状):
    //   { lyrics: [ {tick, lane, text, duration} ] }            (formatVersion 2, 支持多轨)
    //   { lyrics: [ {tick, text, duration} ] }                  (旧数组形式, lane 默认 0)
    //   { lyrics: { "tick": {text, duration} | "文字" } }        (最旧对象形式, lane 0, 定时长)
    // 返回 [{id, tick, lane, text, duration}] 已排序; 仅「同轨同 tick」去重; 格式非法时 throw
    function normalizeLyricsList(data) {
        if (!data || typeof data !== 'object') throw new Error('歌词数据结构无效');
        var raw = data.lyrics !== undefined ? data.lyrics : data;
        var list = [];
        if (Array.isArray(raw)) {
            for (var i = 0; i < raw.length; i++) {
                var it = raw[i];
                if (!it || typeof it !== 'object') continue;
                list.push({
                    tick: parseInt(it.tick, 10),
                    lane: parseInt(it.lane, 10),
                    text: String(it.text == null ? '' : it.text),
                    duration: parseInt(it.duration, 10),
                    // 逐字对齐附加信息 (可选): 断句 / 绑定音符 / 字序号
                    lineStart: it.lineStart,
                    noteLayer: it.noteLayer,
                    noteTick: it.noteTick,
                    charIndex: it.charIndex
                });
            }
        } else if (raw && typeof raw === 'object') {
            for (var k in raw) {
                if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
                var v = raw[k];
                var text = (typeof v === 'string') ? v : String(v && v.text != null ? v.text : '');
                var dur = (v && typeof v === 'object') ? v.duration : 0;
                list.push({ tick: parseInt(k, 10), lane: 0, text: text, duration: parseInt(dur, 10) });
            }
        } else {
            throw new Error('歌词数据缺少 lyrics 字段');
        }
        // 过滤非法项 + 仅「同轨同 tick」去重 (后出现的覆盖先出现的)
        var byKey = {};
        var order = [];
        for (var j = 0; j < list.length; j++) {
            var n = list[j];
            if (!isFinite(n.tick) || n.tick < 0) continue;
            if (!n.text || !n.text.trim()) continue;
            // 轨道索引不在这里 clamp: 由 applyLyricsData 先按 lyricLanes 归一化
            var lane = (isFinite(n.lane) && n.lane >= 0) ? n.lane : 0;
            var dur = (isFinite(n.duration) && n.duration >= 1) ? n.duration : LYRIC_DEFAULT_DURATION;
            var key = lane + ':' + n.tick;
            if (byKey[key] === undefined) order.push(key);
            byKey[key] = normalizeLyricClip({
                id: genLyricId(),
                tick: n.tick,
                lane: lane,
                text: n.text,
                duration: dur,
                lineStart: n.lineStart,
                noteLayer: n.noteLayer,
                noteTick: n.noteTick,
                charIndex: n.charIndex
            }, -1);
        }
        var out = [];
        for (var t = 0; t < order.length; t++) out.push(byKey[order[t]]);
        out.sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.lane - b.lane;
        });
        return out;
    }

    // 从 lyrics.json 数据里取出歌词轨道定义 (缺失时返回 null, 由 applyLyricsData 自动补轨)
    function normalizeLyricLaneList(data) {
        if (!data || typeof data !== 'object') return null;
        var raw = data.lyricLanes;
        if (!Array.isArray(raw) || !raw.length) return null;
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var ln = normalizeLyricLane(raw[i], out.length);
            if (ln) out.push(ln);
        }
        return out.length ? out : null;
    }

    // 将解析好的歌词列表写入编辑器 (替换当前全部歌词与歌词轨道)
    //   lanes: 可选, lyrics.json 里的 lyricLanes 定义 (旧文件为空 → 按 lane 索引自动补轨)
    function applyLyricsData(list, lanes) {
        pushUndo();
        // 先归一化轨道定义, 再落歌词: 否则 normalizLyricClip 会按旧轨道数 clamp
        setLyricLanes(lanes || []);
        state.lyrics = Array.isArray(list) ? list.slice() : [];
        ensureLyricLanes();
        if (state.song) {
            state.song.lyrics = JSON.parse(JSON.stringify(state.lyrics));
            state.song.lyricLanes = JSON.parse(JSON.stringify(state.lyricLanes));
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
    }

    // 单独导入 lyrics.json 文件
    function importLyricsFile(file) {
        if (!file) return;
        showTaskProgress(file.name, '读取歌词数据…');
        var reader = new FileReader();
        reader.onload = function() {
            hideTaskProgress();
            var list, lanes = null;
            try {
                var parsedLyrics = JSON.parse(String(reader.result || ''));
                list = normalizeLyricsList(parsedLyrics);
                lanes = normalizeLyricLaneList(parsedLyrics);
            } catch (err) {
                showAppAlert(i18nText('歌词导入失败') + ': ' + (err && err.message ? err.message : '格式错误'),
                    { title: i18nText('导入歌词'), icon: 'fa-solid fa-triangle-exclamation' });
                return;
            }
            if (!list.length) {
                showAppAlert(i18nText('歌词文件中没有有效的歌词数据。'),
                    { title: i18nText('导入歌词'), icon: 'fa-solid fa-circle-info' });
                return;
            }
            var apply = function() {
                applyLyricsData(list, lanes);
                showAppAlert(i18nText('已导入歌词') + ': ' + list.length,
                    { title: i18nText('导入歌词'), icon: 'fa-solid fa-circle-check' });
            };
            if (state.lyrics && state.lyrics.length) {
                showAppConfirm(i18nText('当前已有歌词标注') + ': ' + state.lyrics.length + '\n' + i18nText('导入将覆盖当前歌词标注，是否继续？'),
                    { title: i18nText('导入歌词'), icon: 'fa-solid fa-circle-question' }).then(function(ok) {
                    if (ok) apply();
                });
            } else {
                apply();
            }
        };
        reader.onerror = function() {
            hideTaskProgress();
            showAppAlert(i18nText('歌词导入失败') + ': 无法读取文件',
                { title: i18nText('导入歌词'), icon: 'fa-solid fa-triangle-exclamation' });
        };
        reader.readAsText(file);
    }

    // 从作品包内读取歌词数据 (zip 导入时自动还原); 返回 Promise<还原条数, 解析失败为 -1>
    function importLyricsFromZip(zipFile, meta) {
        var name = (meta && meta.lyrics) ? meta.lyrics : 'lyrics.json';
        var lyrFile = zipFile.file(name);
        if (!lyrFile) return Promise.resolve(0);
        return lyrFile.async('string').then(function(txt) {
            try {
                var data = JSON.parse(txt);
                var list = normalizeLyricsList(data);
                applyLyricsData(list, normalizeLyricLaneList(data));
                return list.length;
            } catch (e) {
                return -1;
            }
        });
    }

    // ============ 功能菜单 (缩放精度 / 清除空轨) ============
    function createFunctionsMenu() {
        var btn = $('btn-functions');
        var menu = $('functions-menu');
        if (!btn || !menu) return;
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var isVisible = menu.style.display === 'block';
            // 关闭其他弹出菜单
            document.querySelectorAll('.toolbar-more-menu, .functions-menu').forEach(function(m) {
                if (m !== menu) m.style.display = 'none';
            });
            menu.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                var rect = btn.getBoundingClientRect();
                window.WebNBSPositionFlyout(menu, rect, { placement: 'bottom-end' });
            }
        });

        // 点击菜单项
        var items = menu.querySelectorAll('.functions-menu-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var action = item.getAttribute('data-action');
                    menu.style.display = 'none';
                    if (action === 'compress-song') {
                        showCompressSongDialog().then(function (r) {
                            if (r) doCompressSong(r.quality, r.model, r.reorder, r.lighten, r.exclude, r.pseudoSustain);
                        });
                    } else if (action === 'scale-precision') {
                        showScalePrecisionDialog();
                    } else if (action === 'split-segments') {
                        openSegSplitPopup();
                    } else if (action === 'remove-empty-tracks') {
                        removeEmptyTracks();
                    } else if (action === 'sustain-fill') {
                        showSustainFillDialog();
                    } else if (action === 'clear-sustain') {
                        showClearSustainDialog();
                    } else if (action === 'arpeggio-tracks') {
                        showArpeggioTracksDialog();
                    } else if (action === 'transpose-octave') {
                        applyTransposeToOctaveRange();
                    } else if (action === 'range-process') {
                        showRangeProcessDialog();
                    } else if (action === 'snap-notes') {
                        showSnapDialog();
                    } else if (action === 'pitch-shift') {
                        showPitchShiftDialog();
                    } else if (action === 'find-notes') {
                        if (findPanelVisible()) closeFindPanel();
                        else openFindPanel();
                    } else if (action === 'lyrics-quick-add') {
                        showLyricsQuickDialog('lrc');
                    }
                });
            })(items[i]);
        }

        // 点击外部关闭
        document.addEventListener('click', function(e) {
            if (menu.style.display === 'block' && !menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
            }
        });
    }

    function applyPitchShift(mode, value) {
        var selectedNotes = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
        if (selectedNotes.length === 0) return false;
        var delta = mode === 'octaves' ? value * 12 : value;

        pushUndo();
        for (var i = 0; i < selectedNotes.length; i++) {
            var note = selectedNotes[i];
            var newKey = Math.max(0, Math.min(87, note.key + delta));
            note.key = newKey;
            for (var j = 0; j < state.notes.length; j++) {
                if (state.notes[j].id === note.id) {
                    state.notes[j].key = newKey;
                    break;
                }
            }
        }
        if (state.pianoRoll) {
            state.pianoRoll._fullRedrawNeeded = true;
            state.pianoRoll.render();
        }
        buildNoteIndex(state.notes);
        markDirty();
        return true;
    }

    function showPitchShiftDialog() {
        var selectedNotes = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
        if (selectedNotes.length === 0) {
            showSustainFillAlert('请先选择要偏移的音符', '音调偏移');
            return;
        }

        var existing = $('pitch-shift-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="pitch-shift-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-music"></i>'
            + '<h4>音调偏移</h4>'
            + '<button class="settings-close-btn" id="pitch-shift-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<div class="dlg-hint" title="只改变选中音符的音高，不改变时间位置；正数升高，负数降低。">'
            + '<i class="fa-solid fa-circle-info"></i><span>已选择 ' + selectedNotes.length + ' 个音符</span></div>'
            + '<div class="settings-row" style="flex-direction:column;gap:8px;">'
            + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<label style="font-size:12px;min-width:60px;">偏移方式:</label>'
            + '<select id="pitch-shift-mode" style="padding:4px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:4px;background:var(--ctrl-fill-default);color:var(--text-primary);">'
            + '<option value="semitones">按音调</option>'
            + '<option value="octaves">按八度</option>'
            + '</select>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<label style="font-size:12px;min-width:60px;">偏移量:</label>'
            + '<input type="number" id="pitch-shift-value" value="1" style="width:60px;padding:4px 6px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:4px;background:var(--ctrl-fill-default);color:var(--text-primary);text-align:center;">'
            + '<span style="font-size:11px;color:var(--text-tertiary);">正=向上, 负=向下</span>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="pitch-shift-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="pitch-shift-ok-btn">应用</button>'
            + '</div>'
            + '</div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var p = $('pitch-shift-popup'); if (p) p.remove();
        }
        wrapper.querySelector('#pitch-shift-close-x').addEventListener('click', close);
        wrapper.querySelector('#pitch-shift-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#pitch-shift-ok-btn').addEventListener('click', function() {
            var mode = wrapper.querySelector('#pitch-shift-mode').value;
            var value = parseInt(wrapper.querySelector('#pitch-shift-value').value) || 0;
            applyPitchShift(mode, value);
            close();
        });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === wrapper.firstElementChild) close();
        });
    }

    function showScalePrecisionDialog() {
        var existing = $('scale-precision-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="scale-precision-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>'
            + '<h4>缩放精度</h4>'
            + '<button class="settings-close-btn" id="scale-precision-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<div class="dlg-hint" title="把所有音符的时间位置按比例缩放：x2 让歌曲变长一倍，1/2x 让歌曲变短一半；只改时间，不改音高。">'
            + '<i class="fa-solid fa-circle-info"></i><span>按比例缩放所有音符的时间位置</span></div>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:4px;border:none;">'
            + '<label class="settings-label" style="font-size:12px;">选择缩放倍数：</label>'
            + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
            + '<button class="scale-btn" data-factor="0.125">1/8x</button>'
            + '<button class="scale-btn" data-factor="0.25">1/4x</button>'
            + '<button class="scale-btn" data-factor="0.5">1/2x</button>'
            + '<button class="scale-btn selected" data-factor="2">x2</button>'
            + '<button class="scale-btn" data-factor="3">x3</button>'
            + '<button class="scale-btn" data-factor="4">x4</button>'
            + '<button class="scale-btn" data-factor="6">x6</button>'
            + '<button class="scale-btn" data-factor="8">x8</button>'
            + '</div></div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="scale-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="scale-ok-btn">应用</button>'
            + '</div></div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        var selectedFactor = 2;

        var style = document.createElement('style');
        style.textContent = ''
            + '.scale-btn { flex:1;min-width:48px;padding:8px 6px;'
            + 'background:var(--ctrl-fill-default);border:1px solid var(--ctrl-stroke-default);'
            + 'border-radius:6px;color:var(--text-primary);cursor:pointer;text-align:center;'
            + 'font-size:13px;transition:all 0.15s; }'
            + '.scale-btn:hover { border-color:var(--accent); }'
            + '.scale-btn.selected { background:var(--accent);border-color:var(--accent);color:#fff; }';
        wrapper.appendChild(style);

        var btns = wrapper.querySelectorAll('.scale-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function() {
                for (var j = 0; j < btns.length; j++) {
                    btns[j].classList.remove('selected');
                }
                this.classList.add('selected');
                selectedFactor = parseFloat(this.getAttribute('data-factor'));
            });
        }

        var closeX = wrapper.querySelector('#scale-precision-close-x');
        if (closeX) closeX.addEventListener('click', function() { wrapper.remove(); });
        var cancelBtn = wrapper.querySelector('#scale-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { wrapper.remove(); });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === wrapper.firstElementChild) wrapper.remove();
        });

        var okBtn = wrapper.querySelector('#scale-ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', function() {
                wrapper.remove();
                applyScalePrecision(selectedFactor);
            });
        }
    }

    function applyScalePrecision(factor) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (notes.length === 0) {
            showAppAlert('当前没有音符，无法缩放', {title: '缩放精度'});
            return;
        }
        pushUndo();
        for (var i = 0; i < notes.length; i++) {
            notes[i].tick = Math.round(notes[i].tick * factor);
        }
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();
    }

    function showSnapDialog() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (!notes || notes.length === 0) {
            showAppAlert('当前没有音符', {title: '音符吸附'});
            return;
        }

        var existing = $('snap-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="snap-popup">'
            + '<div class="popup-content" style="max-width:360px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-magnet"></i>'
            + '<h4>音符吸附</h4>'
            + '<button class="settings-close-btn" id="snap-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<div class="dlg-hint" title="网格间隔由拍子决定：1/4 表示对齐到每个四分音符，数值越大对齐越密。">'
            + '<i class="fa-solid fa-circle-info"></i><span>把音符吸附到最近的网格线</span></div>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;border:none;">'
            + '<label class="settings-label" style="font-size:12px;">选择范围：</label>'
            + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
            + '<button class="snap-scope-btn selected" data-scope="all">全部音符</button>'
            + '<button class="snap-scope-btn" data-scope="current-track">当前轨道</button>'
            + '<button class="snap-scope-btn" data-scope="selected">选中音符</button>'
            + '</div>'
            + '</div>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;border:none;margin-top:4px;">'
            + '<label class="settings-label" style="font-size:12px;">选择拍子：</label>'
            + '<select id="snap-beat-select" style="padding:6px 8px;font-size:13px;border:1px solid var(--ctrl-stroke-default);border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-primary);">'
            + '<option value="2">1/2</option>'
            + '<option value="4" selected>1/4</option>'
            + '<option value="8">1/8</option>'
            + '<option value="16">1/16</option>'
            + '<option value="32">1/32</option>'
            + '</select>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="snap-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="snap-ok-btn">应用</button>'
            + '</div></div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        var selectedScope = 'all';

        var style = document.createElement('style');
        style.textContent = ''
            + '.snap-scope-btn { flex:1;min-width:70px;padding:8px 6px;'
            + 'background:var(--ctrl-fill-default);border:1px solid var(--ctrl-stroke-default);'
            + 'border-radius:6px;color:var(--text-primary);cursor:pointer;text-align:center;'
            + 'font-size:12px;transition:all 0.15s; }'
            + '.snap-scope-btn:hover { border-color:var(--accent); }'
            + '.snap-scope-btn.selected { background:var(--accent);border-color:var(--accent);color:#fff; }';
        wrapper.appendChild(style);

        var scopeBtns = wrapper.querySelectorAll('.snap-scope-btn');
        for (var i = 0; i < scopeBtns.length; i++) {
            scopeBtns[i].addEventListener('click', function() {
                for (var j = 0; j < scopeBtns.length; j++) {
                    scopeBtns[j].classList.remove('selected');
                }
                this.classList.add('selected');
                selectedScope = this.getAttribute('data-scope');
            });
        }

        var closeX = wrapper.querySelector('#snap-close-x');
        if (closeX) closeX.addEventListener('click', function() { wrapper.remove(); });
        var cancelBtn = wrapper.querySelector('#snap-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { wrapper.remove(); });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === wrapper.firstElementChild) wrapper.remove();
        });

        var okBtn = wrapper.querySelector('#snap-ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', function() {
                var beat = parseInt(wrapper.querySelector('#snap-beat-select').value);
                wrapper.remove();
                applySnap(selectedScope, beat);
            });
        }
    }

    function applySnap(scope, beat) {
        if (!state.pianoRoll) return;
        var allNotes = state.pianoRoll.getNotes();
        if (!allNotes || allNotes.length === 0) return;

        var notesToSnap = [];
        if (scope === 'selected') {
            var selected = state.pianoRoll.getSelectedNotes();
            if (!selected || selected.length === 0) {
                showAppAlert('没有选中任何音符', {title: '音符吸附'});
                return;
            }
            for (var s = 0; s < selected.length; s++) {
                notesToSnap.push(Object.assign({}, selected[s]));
            }
        } else if (scope === 'current-track') {
            var sel = state.pianoRoll.getSelectedNotes();
            var targetLayer = null;
            if (sel && sel.length > 0) {
                targetLayer = sel[0].layer;
            } else {
                targetLayer = 0;
            }
            for (var t = 0; t < allNotes.length; t++) {
                if (allNotes[t].layer === targetLayer) {
                    notesToSnap.push(Object.assign({}, allNotes[t]));
                }
            }
        } else {
            for (var a = 0; a < allNotes.length; a++) {
                notesToSnap.push(Object.assign({}, allNotes[a]));
            }
        }

        if (notesToSnap.length === 0) {
            showAppAlert('没有需要吸附的音符', {title: '音符吸附'});
            return;
        }

        pushUndo();

        // beat: 2=1/2 note, 4=1/4 note, 8=1/8 note, 16=1/16 note, 32=1/32 note
        // NBS standard: 4 ticks per beat (quarter note)
        // gridStep 必须是整数 tick, 不能依赖 zoom
        var ticksPerBeat = 4; // NBS standard
        var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / beat));
        // For beat=2: gridStep = 8 (half note = 8 ticks)
        // For beat=4: gridStep = 4 (quarter note = 4 ticks)
        // For beat=8: gridStep = 2 (eighth note = 2 ticks)
        // For beat=16: gridStep = 1 (sixteenth note = 1 tick)
        // For beat=32: gridStep = 1 (minimum 1 tick)

        var snapMap = {};
        for (var n = 0; n < notesToSnap.length; n++) {
            var nt = notesToSnap[n];
            var oldTick = nt.tick;
            var snappedTick = Math.round(oldTick / gridStep) * gridStep;
            if (snappedTick < 0) snappedTick = 0;
            snapMap[nt.id] = snappedTick;
        }

        for (var u = 0; u < allNotes.length; u++) {
            if (snapMap.hasOwnProperty(allNotes[u].id)) {
                allNotes[u].tick = snapMap[allNotes[u].id];
            }
        }

        state.pianoRoll.setNotes(allNotes);
        state.notes = allNotes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();
    }

    // 清除空轨: 删除所有没有任何音符的 layer
    // ============ 歌曲压缩 (有损压缩) ============
    // 压缩方式二选一 (分段按钮组切换):
    //   'dedupe'   = 仅删除重复音符 (q=0.99 纯去重, 几乎不影响质量)
    //   'compress' = 使用压缩算法 («压缩等级» 滑块 × 算法模型 × 伪延音开关)
    // «压缩等级» 滑块按压缩强度命名 (轻度→最强); 不含 0.99 档 —— 该档等价于「仅删除重复音符」。
    // 每删除一批音符后都填补空洞; 整次压缩为单个可撤销步骤。
    var COMPRESS_DEDUPE_Q = 0.99;
    var COMPRESS_LEVELS = [
        { label: '轻度压缩', q: 0.60 },
        { label: '中度压缩', q: 0.40 },
        { label: '较强压缩', q: 0.20 },
        { label: '最强压缩', q: 0.05 }
    ];
    var COMPRESS_WARN_BELOW_IDX = 3; // 「最强压缩」档显示黄色警示
    // 旧版存档档名 → q (迁移用: 旧存档按质量命名倒数变换)
    var LEGACY_COMPRESS_Q = {
        '近乎无损': 0.99, '高质量': 0.60, '中等质量': 0.40, '较低质量': 0.20, '最低质量': 0.05
    };

    function compressResolveTicksPerBeat() {
        var spb = state.song && state.song.ticks_per_beat;
        if (spb && spb > 1) return spb;
        if (state.tempo && state.tempo > 0) return Math.max(4, Math.round(state.tempo * 1.5));
        return 30;
    }

    // ---- 导出 ----
    N.buildSegmentsJson = buildSegmentsJson;
    N.importSegmentsFromZip = importSegmentsFromZip;
    N.normalizeLyricsList = normalizeLyricsList;
    N.applyLyricsData = applyLyricsData;
    N.importLyricsFile = importLyricsFile;
    N.importLyricsFromZip = importLyricsFromZip;
    N.createFunctionsMenu = createFunctionsMenu;
    N.applyPitchShift = applyPitchShift;
    N.showPitchShiftDialog = showPitchShiftDialog;
    N.showScalePrecisionDialog = showScalePrecisionDialog;
    N.applyScalePrecision = applyScalePrecision;
    N.showSnapDialog = showSnapDialog;
    N.applySnap = applySnap;
    N.compressResolveTicksPerBeat = compressResolveTicksPerBeat;
    N.COMPRESS_DEDUPE_Q = COMPRESS_DEDUPE_Q;
    N.COMPRESS_LEVELS = COMPRESS_LEVELS;
    N.COMPRESS_WARN_BELOW_IDX = COMPRESS_WARN_BELOW_IDX;
    N.LEGACY_COMPRESS_Q = LEGACY_COMPRESS_Q;
})(window.WebNBS);
