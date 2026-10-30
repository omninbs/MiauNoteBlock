/* 33-export.js — MiauNoteBlock 功能模块
   来源: 原 main.js L20205-L21263; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    var INSTRUMENT_NAMES = N.INSTRUMENT_NAMES;
    var SEG_DEFAULT_LANE_H = N.SEG_DEFAULT_LANE_H;
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    var _appDialogStack = N._appDialogStack;
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }
    function applyLoadedSongData() { return N.applyLoadedSongData.apply(this, arguments); }
    function buildLyricsJson() { return N.buildLyricsJson.apply(this, arguments); }
    function buildSegmentsJson() { return N.buildSegmentsJson.apply(this, arguments); }
    function clearAutoSaveLocal() { return N.clearAutoSaveLocal.apply(this, arguments); }
    function deepCloneNotes() { return N.deepCloneNotes.apply(this, arguments); }
    function escapeHtml() { return N.escapeHtml.apply(this, arguments); }
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function formatError() { return N.formatError.apply(this, arguments); }
    function getInstName() { return N.getInstName.apply(this, arguments); }
    function hideTaskProgress() { return N.hideTaskProgress.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function importLyricsFromZip() { return N.importLyricsFromZip.apply(this, arguments); }
    function importSegmentsFromZip() { return N.importSegmentsFromZip.apply(this, arguments); }
    function renderCustomInstList() { return N.renderCustomInstList.apply(this, arguments); }
    function renderTabs() { return N.renderTabs.apply(this, arguments); }
    function segmentSorted() { return N.segmentSorted.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function showAppPrompt() { return N.showAppPrompt.apply(this, arguments); }
    function showExportDialog() { return N.showExportDialog.apply(this, arguments); }
    function showTaskProgress() { return N.showTaskProgress.apply(this, arguments); }
    function tabStash() { return N.tabStash.apply(this, arguments); }
    function updateSongInfo() { return N.updateSongInfo.apply(this, arguments); }
    function updateTaskProgress() { return N.updateTaskProgress.apply(this, arguments); }


    function exportNBS() {
        // 导出锁: 防止重复导出
        if (N.shared._isExporting) return;
        if (!state.song || !state.notes) { showAppAlert('没有可导出的歌曲', {title: '导出', icon: 'fa-solid fa-triangle-exclamation'}); return; }

        // 收集作品使用到的自定义音色 (instrument >= 20)
        var usedNos = [];
        var seenNo = {};
        for (var ci = 0; ci < state.notes.length; ci++) {
            var no = state.notes[ci].instrument;
            if (no >= 20 && !seenNo[no]) { seenNo[no] = true; usedNos.push(no); }
        }
        usedNos.sort(function(a, b) { return a - b; });

        // 弹窗获取文件名 / 作者 / 介绍
        // 使用自定义音色时, 弹窗内会警告并提供「作品包(zip)」选项统一下发处理
        var defaultName = state.importedFileName || (state.song.name || state.song.song_name || 'Untitled');
        var defaultAuthor = state.song.author || state.song.original_author || '';
        var defaultDesc = state.song.description || '';
        var dialogOpts = {};
        if (usedNos.length) dialogOpts.customInstruments = usedNos;
        if (state.lyrics && state.lyrics.length) dialogOpts.hasLyrics = true;
        if (state.segments && state.segments.length
                && (state.segments.length > 1
                    || (state.segmentLanes && state.segmentLanes.length > 1))) {
            dialogOpts.segmentCount = state.segments.length;
        }
        // 铜号角 (16~19) 与自定义音色 (>=20) 只有 V6 能完整保存 → 弹窗内锁定版本
        var hasCopper = false;
        for (var pi = 0; pi < state.notes.length; pi++) {
            var insNo = state.notes[pi].instrument;
            if (insNo >= 16 && insNo <= 19) { hasCopper = true; break; }
        }
        if (hasCopper || usedNos.length) dialogOpts.lockV6 = true;
        showExportDialog(defaultName, defaultAuthor, defaultDesc, dialogOpts).then(function(input) {
            if (!input) return; // 用户取消
            // 应用本次选择导出的 NBS 版本 (设置项已移入弹窗)
            if (input.nbsVersion) {
                window.NBS_EXPORT_VERSION = input.nbsVersion;
                try { localStorage.setItem('nbs_export_version', String(input.nbsVersion)); } catch (e) {}
            }
            // 勾选「歌词导出」/「保留片段」时也走 zip 打包 (歌曲 + lyrics.json / segments.json [+ 音色音频])
            if (input.packageZip || input.lyricsZip || input.segmentsZip) {
                _performZipExport(input, usedNos);
            } else {
                _performExport(input);
            }
        });
    }

    // ============ 批量导出 (多标签页) ============
    // 从标签页快照构建可导出的歌曲数据 (不切换当前编辑状态)
    function buildExportSongDataFromSnapshot(snap, saveName) {
        var meta = snap.meta || {};
        var notes = deepCloneNotes(snap.notes || []);
        var maxTick = 0;
        var maxCustomNo = -1;
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].tick > maxTick) maxTick = notes[i].tick;
            if (notes[i].instrument >= 20 && notes[i].instrument > maxCustomNo) maxCustomNo = notes[i].instrument;
        }
        var layers = JSON.parse(JSON.stringify(snap.layers || []));
        if (!layers.length) {
            var maxLayer = 0;
            for (var li = 0; li < notes.length; li++) {
                if (notes[li].layer > maxLayer) maxLayer = notes[li].layer;
            }
            layers = [];
            for (var l = 0; l <= maxLayer; l++) {
                layers.push({ name: 'Layer ' + (l + 1), volume: 100, stereo: 100, lock: 0 });
            }
        }
        var customInstruments = [];
        if (maxCustomNo >= 20) {
            var slotCount = maxCustomNo - 20 + 1;
            var lib = (window.CustomInstruments) ? CustomInstruments.list() : [];
            var byNo = {};
            for (var ci = 0; ci < lib.length; ci++) byNo[lib[ci].instrument] = lib[ci];
            for (var s = 0; s < slotCount; s++) {
                var instNumber = 20 + s;
                var def = byNo[instNumber] || null;
                customInstruments.push(def ? {
                    instrument: instNumber, name: def.name, file: def.file, sound: def.file,
                    pitch: def.pitch, pressKey: 45
                } : null);
            }
        }
        var soloLayers = Array.isArray(meta.solo_layers) ? meta.solo_layers.slice() : [];
        var desc = String(meta.description || '').replace(/\s*\[NoteBlockWeb:solo=v1:[^\]]*\]/g, '');
        if (soloLayers.length) desc += (desc ? '\n' : '') + '[NoteBlockWeb:solo=v1:' + soloLayers.join(',') + ']';
        return {
            name: saveName,
            song_name: saveName,
            author: meta.author || '',
            original_author: meta.original_author || '',
            description: desc,
            solo_layers: soloLayers,
            tempo: snap.tempo || 20,
            length: maxTick + 4,
            time_signature: meta.time_signature || 4,
            auto_save: meta.auto_save || false,
            auto_save_minutes: meta.auto_save_minutes || 0,
            loop: meta.loop || 0,
            max_loop_count: meta.max_loop_count || 0,
            loop_start: meta.loop_start || 0,
            notes: notes,
            layers: layers,
            customInstruments: customInstruments
        };
    }

    function safeFileName(title) {
        var n = String(title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim();
        return n || 'Untitled';
    }

    // 基于标签页快照生成 segments.json (v2: 轨道 + 全局轨道映射)
    function buildSegmentsJsonFromSnapshot(snap) {
        var segs = (snap.segments || []).slice().sort(function(a, b) {
            if (a.start !== b.start) return a.start - b.start;
            return (a.lane || 0) - (b.lane || 0);
        });
        var lanesSrc = snap.segmentLanes || [];
        var lanes = [];
        var base = 0;
        for (var li = 0; li < lanesSrc.length; li++) {
            var ln = lanesSrc[li] || {};
            var used = {};
            for (var si = 0; si < segs.length; si++) {
                if ((segs[si].lane || 0) !== li) continue;
                var sn = segs[si].notes || [];
                for (var ni = 0; ni < sn.length; ni++) used[sn[ni].layer || 0] = true;
            }
            var rels = Object.keys(used).map(Number).sort(function(a, b) { return a - b; });
            var layers = [];
            for (var r = 0; r < rels.length; r++) layers.push(base + r);
            lanes.push({
                muted: !!ln.muted, solo: !!ln.solo,
                volume: isFinite(ln.volume) ? ln.volume : 100,
                height: isFinite(ln.height) ? ln.height : SEG_DEFAULT_LANE_H,
                layers: layers
            });
            base += rels.length;
        }
        return {
            type: 'noteblock-web-segments',
            formatVersion: 2,
            lanes: lanes,
            segments: segs.map(function(s) {
                return { lane: s.lane || 0, start: s.start, end: s.end, name: s.name };
            }),
            totalLength: segs.reduce(function(a, s) { return a + Math.max(1, s.end - s.start); }, 0)
        };
    }

    function showBatchExportDialog() {
        tabStash();
        var tabs = state.tabs || [];
        if (!tabs.length) { showAppAlert('没有可导出的文件', { title: '批量导出' }); return; }
        var overlay = _appDialogOverlay();
        var box = _appDialogBox(i18nText('批量导出'), '', 'fa-solid fa-box-archive', { maxWidth: 440 });
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        var tip = document.createElement('div');
        tip.style.cssText = 'font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;';
        tip.textContent = i18nText('将导出全部标签页（共') + ' ' + tabs.length + ' ' + i18nText('个文件') + '）';
        body.appendChild(tip);

        var mkRadio = function(value, label, checked) {
            var lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:flex-start;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;line-height:1.7;margin-top:6px;';
            var r = document.createElement('input');
            r.type = 'radio';
            r.name = 'batch-export-mode';
            r.value = value;
            r.checked = !!checked;
            r.style.cssText = 'accent-color:var(--accent,#4ecdc4);width:14px;height:14px;margin-top:3px;flex-shrink:0;';
            lbl.appendChild(r);
            lbl.appendChild(document.createTextNode(label));
            body.appendChild(lbl);
            return r;
        };
        var zipRadio = mkRadio('zip', i18nText('打包为一个 ZIP 下载（推荐，避免同时下载多个文件）'), true);
        var oneRadio = mkRadio('files', i18nText('逐个下载（每个文件单独下载）'), false);
        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:var(--text-tertiary);line-height:1.6;margin-top:8px;';
        hint.textContent = i18nText('ZIP 内每个文件为 <歌曲名>.nbs；含歌词或片段分割时会附带对应的 json 文件。');
        body.appendChild(hint);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);

        var close = function() { _closeAppDialog(overlay, function() {}, null); };
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var cancelBtn = _appDialogBtn(i18nText('取消'), false);
        cancelBtn.addEventListener('click', close);
        var okBtn = _appDialogBtn(i18nText('导出'), true);
        okBtn.addEventListener('click', function() {
            var mode = zipRadio.checked ? 'zip' : 'files';
            close();
            runBatchExport(tabs.slice(), mode);
        });
        var actions = box.querySelector('.popup-actions');
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    }

    function runBatchExport(tabs, mode) {
        var tasks = [];
        for (var i = 0; i < tabs.length; i++) {
            (function(tab, idx) {
                var snap = tab.snapshot || {};
                var title = safeFileName(tab.title || ('Track ' + (idx + 1)));
                var song = buildExportSongDataFromSnapshot(snap, title);
                tasks.push(NBSClient.saveNBS(song).then(function(blob) {
                    return {
                        title: title,
                        nbs: blob,
                        lyrics: (snap.lyrics || []).length ? JSON.stringify({
                            type: 'noteblock-web-lyrics', formatVersion: 2,
                            laneCount: 3, tempo: snap.tempo || 20, lyrics: snap.lyrics
                        }, null, 2) : null,
                        segments: (function() {
                            var sgs = snap.segments || [];
                            var lns = snap.segmentLanes || [];
                            if (sgs.length > 1 || lns.length > 1) {
                                return JSON.stringify(buildSegmentsJsonFromSnapshot(snap), null, 2);
                            }
                            return null;
                        })()
                    };
                }));
            })(tabs[i], i);
        }
        showTaskProgress('批量导出', '正在生成…');
        Promise.all(tasks).then(function(items) {
            hideTaskProgress();
            if (mode === 'files') {
                // 逐个下载: 每个文件单独触发下载
                for (var k = 0; k < items.length; k++) {
                    (function(it, delay) {
                        setTimeout(function() { dlBlob(it.nbs, it.title + '.nbs'); }, delay);
                    })(items[k], k * 350);
                }
                showAppAlert('已开始下载 ' + items.length + ' 个文件', { title: '批量导出', icon: 'fa-solid fa-circle-check' });
                return;
            }
            if (!_ciIsZipAvailable()) {
                showAppAlert('ZIP 打包库未加载，已改为逐个下载。', { title: '批量导出', icon: 'fa-solid fa-triangle-exclamation' });
                for (var d = 0; d < items.length; d++) {
                    (function(it, delay) { setTimeout(function() { dlBlob(it.nbs, it.title + '.nbs'); }, delay); })(items[d], d * 350);
                }
                return;
            }
            var zip = new JSZip();
            for (var j = 0; j < items.length; j++) {
                var it = items[j];
                zip.file(it.title + '.nbs', it.nbs);
                if (it.lyrics) zip.file(it.title + '.lyrics.json', it.lyrics);
                if (it.segments) zip.file(it.title + '.segments.json', it.segments);
            }
            // 批量清单: 记录每个 NBS 的 SHA-256, 供完整性校验
            var hashPs = [];
            for (var h = 0; h < items.length; h++) {
                (function(itm) {
                    var hp = (window.CustomInstruments && typeof CustomInstruments.hashBlob === 'function')
                        ? CustomInstruments.hashBlob(itm.nbs).catch(function() { return ''; })
                        : Promise.resolve('');
                    hashPs.push(hp.then(function(hv) { itm.hash = hv || ''; }));
                })(items[h]);
            }
            Promise.all(hashPs).then(function() {
                var manifest = {
                    type: 'noteblock-web-batch',
                    formatVersion: 1,
                    files: items.map(function(itm) {
                        return {
                            name: itm.title + '.nbs',
                            hash: itm.hash ? ('sha256:' + itm.hash) : ''
                        };
                    })
                };
                zip.file('manifest.json', JSON.stringify(manifest, null, 2));
                return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
            }).then(function(blob) {
                dlBlob(blob, 'MiauNoteBlock_batch.zip');
                showAppAlert('已打包导出 ' + items.length + ' 个文件', { title: '批量导出', icon: 'fa-solid fa-circle-check' });
            }).catch(function(err) {
                showAppAlert('批量导出失败: ' + (err && err.message ? err.message : '未知错误'), { title: '批量导出', icon: 'fa-solid fa-triangle-exclamation' });
            });
        }).catch(function(err) {
            hideTaskProgress();
            showAppAlert('批量导出失败: ' + (err && err.message ? err.message : '未知错误'), { title: '批量导出', icon: 'fa-solid fa-triangle-exclamation' });
        });
    }


    // ============ 作品包 zip (M5) / 音色备份 ============
    function _ciIsZipAvailable() {
        return typeof window.JSZip !== 'undefined';
    }

    function dlBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000);
    }

    // 从 Blob type / 源文件名推断音频扩展名 (zip 内文件名)
    function guessAudioExt(blob, originalName) {
        var mime = (blob && blob.type) ? blob.type.toLowerCase() : '';
        var ext = '';
        if (mime.indexOf('mpeg') >= 0 || mime.indexOf('/mp3') >= 0) ext = '.mp3';
        else if (mime.indexOf('wav') >= 0 || mime.indexOf('wave') >= 0) ext = '.wav';
        else if (mime.indexOf('ogg') >= 0) ext = '.ogg';
        else if (mime.indexOf('flac') >= 0) ext = '.flac';
        if (!ext && originalName) {
            var m = /\.([a-z0-9]{2,4})$/i.exec(originalName || '');
            if (m) ext = '.' + m[1].toLowerCase();
        }
        return ext || '.bin';
    }

    // 导出用: 把多片段首尾相接紧凑化后的音符副本 (不修改工程)
    // 空隙内的音符会被丢弃 (与「合并全部片段」语义一致)
    function buildMergedNotesForExport() {
        var sorted = segmentSorted();
        if (sorted.length <= 1) return deepCloneNotes(state.notes);
        var used = {};
        var out = [];
        var pos = 0;
        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            var span = Math.max(1, s.end - s.start);
            var delta = pos - s.start;
            for (var j = 0; j < state.notes.length; j++) {
                if (used[j]) continue;
                var n = state.notes[j];
                if (n.tick < s.start || n.tick >= s.end) continue;
                used[j] = true;
                var c = deepCloneNotes([n])[0];
                c.tick = Math.max(0, n.tick + delta);
                out.push(c);
            }
            pos += span;
        }
        return out;
    }

    // 组装导出用的歌曲数据 (NBS 与作品包共用): 含 v6 自定义乐器槽位表
    function buildExportSongData(input) {
        // 收集作品使用的自定义音色 (instrument >= 20), 构建 v6 槽位表
        // 槽位 i 对应 instrument = 20+i, 保证 NoteBlockStudio 序号对齐
        var maxCustomNo = -1;
        for (var nc = 0; nc < state.notes.length; nc++) {
            var instNo = state.notes[nc].instrument;
            if (instNo >= 20 && instNo > maxCustomNo) maxCustomNo = instNo;
        }
        var customInstruments = [];
        if (maxCustomNo >= 20) {
            var slotCount = maxCustomNo - 20 + 1;
            var lib = (window.CustomInstruments) ? CustomInstruments.list() : [];
            var byNo = {};
            for (var li = 0; li < lib.length; li++) byNo[lib[li].instrument] = lib[li];
            for (var s = 0; s < slotCount; s++) {
                var instNumber = 20 + s;
                var def = byNo[instNumber] || null;
                customInstruments.push(def ? {
                    instrument: instNumber,
                    name: def.name,
                    file: def.file,
                    sound: def.file,
                    pitch: def.pitch,
                    pressKey: 45
                } : null);
            }
        }

        var soloLayers = [];
        for (var si = 0; si < state.tracks.length; si++) {
            if (state.tracks[si].solo) soloLayers.push(state.tracks[si].layer);
        }
        var baseDescription = String(input.description || '').replace(/\s*\[NoteBlockWeb:solo=v1:[^\]]*\]/g, '');
        if (soloLayers.length) baseDescription += (baseDescription ? '\n' : '') + '[NoteBlockWeb:solo=v1:' + soloLayers.join(',') + ']';

        // 多片段导出: 「合并后导出」使用紧凑化的音符副本, 工程本身不变
        var exportNotes = input.mergeSegments ? buildMergedNotesForExport() : deepCloneNotes(state.notes);
        var exportMaxTick = 0;
        for (var ei = 0; ei < exportNotes.length; ei++) {
            if (exportNotes[ei].tick > exportMaxTick) exportMaxTick = exportNotes[ei].tick;
        }
        var exportLength = input.mergeSegments ? (exportMaxTick + 4) : (state.maxTick + 4);

        var song = {
            name: input.name,
            song_name: input.name,
            author: input.author,
            original_author: input.author,
            description: baseDescription,
            solo_layers: soloLayers,
            tempo: state.tempo,
            length: exportLength,
            time_signature: (state.song && state.song.time_signature) || 4,
            auto_save: (state.song && state.song.auto_save) || false,
            auto_save_minutes: (state.song && state.song.auto_save_minutes) || 0,
            loop: (state.song && state.song.loop) || 0,
            max_loop_count: (state.song && state.song.max_loop_count) || 0,
            loop_start: (state.song && state.song.loop_start) || 0,
            notes: exportNotes,
            layers: JSON.parse(JSON.stringify((state.song && state.song.layers) || [])),
            customInstruments: customInstruments
        };

        // 补全 layers
        if (!song.layers || song.layers.length === 0) {
            var maxLayer = 0;
            for (var i = 0; i < state.notes.length; i++) {
                if (state.notes[i].layer > maxLayer) maxLayer = state.notes[i].layer;
            }
            song.layers = [];
            for (var l = 0; l <= maxLayer; l++) {
                song.layers.push({ name: 'Layer ' + (l + 1), volume: 100, stereo: 100, lock: 0 });
            }
        }

        // 保存时根据当前轨道状态写入 lock 字段
        // pynbs 1.0.0-beta.0 仅支持 bool 类型的 lock, 因此只持久化静音(1), 不持久化独奏
        for (var li2 = 0; li2 < song.layers.length; li2++) {
            if (song.layers[li2].lock === undefined) song.layers[li2].lock = 0;
            var t2 = findTrackByLayer(li2);
            if (t2) {
                song.layers[li2].lock = t2.muted ? 1 : 0;
            }
        }
        return song;
    }

    // 收集歌曲用到的自定义音色解码缓冲: {instrumentNo: {buffer, baseKey, gain}}
    function collectCustomBuffers(notes) {
        var need = {};
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].instrument >= 20) need[notes[i].instrument] = true;
        }
        var libByNo = {};
        (window.CustomInstruments ? CustomInstruments.list() : []).forEach(function(it) {
            libByNo[it.instrument] = it;
        });
        var tasks = Object.keys(need).map(Number).map(function(no) {
            var it = libByNo[no];
            if (!it) return Promise.resolve(null);
            return CustomInstruments.getBlob(it.id).then(function(blob) {
                if (!blob) return null;
                var dctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
                if (!dctx) { try { dctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { dctx = null; } }
                if (!dctx) return null;
                return blob.arrayBuffer().then(function(ab) { return dctx.decodeAudioData(ab); }).then(function(buf) {
                    return [no, {
                        buffer: buf,
                        baseKey: (typeof it.pitch === 'number') ? it.pitch : 33,
                        gain: (typeof it.gain === 'number') ? it.gain : 100
                    }];
                });
            }).catch(function() { return null; });
        });
        return Promise.all(tasks).then(function(arr) {
            var map = {};
            arr.forEach(function(e) { if (e) map[e[0]] = e[1]; });
            return map;
        });
    }

    // 离线渲染整首歌并编码为 MP3/WAV; 返回 Promise<{blob, filename}>
    // opts: { name, format: 'mp3'|'wav', kbps, styleId, onProgress(label, percent) }
    function renderSongToBlob(opts) {
        var filename = (opts.name || 'song').trim().replace(/\.(nbs|mp3|wav)$/i, '') || 'song';
        var song = buildExportSongData({
            name: filename,
            author: (state.song && (state.song.author || state.song.original_author)) || '',
            description: (state.song && state.song.description) || ''
        });
        var styleId = (window.AudioRender && AudioRender.STYLES[opts.styleId]) ? opts.styleId : 'dry';
        // 导出音频沿用当前轨道可听性: 独奏时仅渲染独奏轨道, 静音轨道由 layers.lock 排除
        var renderSoloLayers = [];
        for (var rsi = 0; rsi < state.tracks.length; rsi++) {
            if (state.tracks[rsi].solo) renderSoloLayers.push(state.tracks[rsi].layer);
        }
        return collectCustomBuffers(song.notes || []).then(function(customMap) {
            if (opts.onProgress) opts.onProgress('渲染中…', 10);
            return AudioRender.renderSong({
                notes: song.notes || [],
                tempo: state.tempo,
                layers: song.layers || [],
                style: styleId,
                solo: { active: renderSoloLayers.length > 0, layer: renderSoloLayers },
                customInstruments: customMap,
                useJsMix: true, // 高速 JS 预混路径 (音符密集时提升 5~10 倍, 效果链等价)
                onProgress: function(p, label) {
                    if (opts.onProgress) opts.onProgress(label || '', Math.max(10, p));
                }
            });
        }).then(function(buffer) {
            if (opts.format === 'wav') {
                var wavBlob = AudioRender.encodeWav(buffer);
                return { blob: wavBlob, filename: filename + '.wav' };
            }
            if (!window.lamejs) return Promise.reject(new Error('MP3 编码库未加载'));
            if (opts.onProgress) opts.onProgress('编码 MP3…', 0);
            return AudioRender.encodeMp3(buffer, opts.kbps || 192).then(function(blob) {
                return { blob: blob, filename: filename + '.mp3' };
            });
        });
    }

    function _performExport(input) {
        if (N.shared._isExporting) return;
        N.shared._isExporting = true;
        try {
            var song = buildExportSongData(input);
            var exportName = input.name + '.nbs';
            showTaskProgress(exportName, '导出 NBS');
            API.saveSong(song, function(loaded, total, speed, percent, eta, phase) {
                updateTaskProgress(loaded, total, speed, percent, eta, phase);
            }).then(function(result) {
                hideTaskProgress();
                var filename = result.filename || exportName;
                // 使用 <a download> 触发下载，保留文件名
                var a = document.createElement('a');
                a.href = result.downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(function() {
                    if (a.parentNode) a.parentNode.removeChild(a);
                    URL.revokeObjectURL(result.downloadUrl);
                }, 5000);
                clearAutoSaveLocal();
            }).catch(function(err) {
                hideTaskProgress();
                showAppAlert('导出失败: ' + formatError(err, '无法导出文件'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
            });
        } catch (e) {
            hideTaskProgress();
            showAppAlert('导出失败: ' + (e && e.message ? e.message : '未知错误'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
        } finally {
            // 无论成功或失败, 都释放导出锁
            N.shared._isExporting = false;
        }
    }

    // ---- 作品包导出: zip = song.nbs + 使用到的自定义音色音频 + metadata.json (由导出弹窗的「作品包(zip)」选项触发) ----
    function _performZipExport(input, usedNos) {
        if (N.shared._isExporting) return;
        if (!_ciIsZipAvailable()) {
            showAppAlert('ZIP 打包库未加载，暂时无法导出作品包。请刷新页面重试。', {title: '作品包', icon: 'fa-solid fa-triangle-exclamation'});
            return;
        }
        N.shared._isExporting = true;
        showTaskProgress(input.name + '.zip', '打包作品包…');
        try {
            var song = buildExportSongData(input);
            NBSClient.saveNBS(song).then(function(nbsBlob) {
                var zip = new JSZip();
                zip.file('song.nbs', nbsBlob);
                // 歌词数据: 勾选导出歌词时写入 lyrics.json
                var hasLyrics = !!(input.lyricsZip && state.lyrics && state.lyrics.length);
                if (hasLyrics) zip.file('lyrics.json', JSON.stringify(buildLyricsJson(), null, 2));
                // 片段分割信息: 勾选「保留片段」时写入 segments.json
                var hasSegments = !!(input.segmentsZip && state.segments && state.segments.length
                    && (state.segments.length > 1
                        || (state.segmentLanes && state.segmentLanes.length > 1)));
                if (hasSegments) zip.file('segments.json', JSON.stringify(buildSegmentsJson(), null, 2));
                var metaInstruments = [];
                var tasks = [];
                for (var k = 0; k < usedNos.length; k++) {
                    var no = usedNos[k];
                    var item = CustomInstruments.getByInstrument(no);
                    if (!item) continue;
                    (function(item, no) {
                        tasks.push(CustomInstruments.getBlob(item.id).then(function(blob) {
                            if (!blob) return;
                            var ext = guessAudioExt(blob, item.originalName);
                            var fileName = (item.name || ('instrument_' + no)) + ext;
                            if (zip.file(fileName)) fileName = no + '_' + fileName; // 防御同名
                            zip.file(fileName, blob);
                            metaInstruments.push({
                                name: item.name,
                                file: fileName,
                                hash: item.hash ? ('sha256:' + item.hash) : '',
                                pitch: item.pitch,
                                color: item.color || '#4aa3ff',
                                slot: no - 20
                            });
                        }));
                    })(item, no);
                }
                Promise.all(tasks).then(function() {
                    // 计算 NBS 文件哈希, 供导入时校验分组数据是否与歌曲匹配
                    var hashP = (window.CustomInstruments && typeof CustomInstruments.hashBlob === 'function')
                        ? CustomInstruments.hashBlob(nbsBlob).catch(function() { return ''; })
                        : Promise.resolve('');
                    return hashP.then(function(nbsHash) {
                        var meta = {
                            type: 'noteblock-web-song-pack', formatVersion: 2,
                            song: 'song.nbs', instruments: metaInstruments
                        };
                        if (nbsHash) meta.nbsHash = 'sha256:' + nbsHash;
                        if (hasLyrics) meta.lyrics = 'lyrics.json';
                        if (hasSegments) meta.segments = 'segments.json';
                        zip.file('metadata.json', JSON.stringify(meta, null, 2));
                        return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
                    });
                }).then(function(blob) {
                    hideTaskProgress();
                    dlBlob(blob, input.name + '.zip');
                    var segMsg = hasSegments ? '\n已同时打包片段分割信息 (segments.json)。' : '';
                    if (metaInstruments.length) {
                        showAppAlert('作品包已导出，包含 ' + metaInstruments.length + ' 个自定义音色音频。'
                            + (hasLyrics ? '\n已同时打包歌词数据 (lyrics.json)。' : '')
                            + segMsg
                            + '\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。', { title: '导出完成', icon: 'fa-solid fa-circle-check' });
                    } else {
                        showAppAlert('作品包已导出，包含歌曲'
                            + (hasLyrics ? '与歌词数据 (lyrics.json)' : '')
                            + (hasSegments ? '与片段分割信息 (segments.json)' : '')
                            + '。', { title: '导出完成', icon: 'fa-solid fa-circle-check' });
                    }
                }).catch(function(err) {
                    hideTaskProgress();
                    showAppAlert('作品包导出失败: ' + (err && err.message ? err.message : '未知错误'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
                });
            }).catch(function(err) {
                hideTaskProgress();
                showAppAlert('NBS 打包失败: ' + (err && err.message ? err.message : '未知错误'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
            });
        } finally {
            N.shared._isExporting = false;
        }
    }

    // ---- 音色备份导出 (全部自定义音色 + 元数据) ----
    function exportInstrumentBackup() {
        var list = (window.CustomInstruments) ? CustomInstruments.list() : [];
        if (list.length === 0) {
            showAppAlert('当前没有自定义音色可备份。', {title: '音色备份', icon: 'fa-solid fa-circle-info'});
            return;
        }
        if (!_ciIsZipAvailable()) {
            showAppAlert('ZIP 打包库未加载，暂时无法导出备份。请刷新页面重试。', {title: '音色备份', icon: 'fa-solid fa-triangle-exclamation'});
            return;
        }
        var zip = new JSZip();
        var metaInstruments = [];
        var tasks = [];
        list.forEach(function(item) {
            tasks.push(CustomInstruments.getBlob(item.id).then(function(blob) {
                if (!blob) return;
                var ext = guessAudioExt(blob, item.originalName);
                var fileName = (item.name || ('instrument_' + item.instrument)) + ext;
                if (zip.file(fileName)) fileName = item.instrument + '_' + fileName;
                zip.file(fileName, blob);
                metaInstruments.push({
                    name: item.name,
                    file: fileName,
                    hash: item.hash ? ('sha256:' + item.hash) : '',
                    pitch: item.pitch,
                    color: item.color || '#4aa3ff',
                    instrument: item.instrument
                });
            }));
        });
        Promise.all(tasks).then(function() {
            zip.file('metadata.json', JSON.stringify({ type: 'noteblock-web-instrument-backup', formatVersion: 1, instruments: metaInstruments }, null, 2));
            return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
        }).then(function(blob) {
            dlBlob(blob, 'custom-instruments-backup.zip');
            showAppAlert('已导出 ' + metaInstruments.length + ' 个音色的备份。浏览器数据丢失后可随时导入恢复。', {title: '备份完成', icon: 'fa-solid fa-circle-check'});
        }).catch(function(err) {
            showAppAlert('备份导出失败: ' + (err && err.message ? err.message : '未知错误'), {title: '备份失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }

    // ---- 单个音色导入 (处理 同名同hash跳过 / 同名异hash询问) ----
    function ciAskRenameOrReplace(name) {
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox('同名音色冲突', '已存在同名音色「' + name + '」，但音频内容不同。\n\n请选择处理方式：', 'fa-solid fa-circle-question', { maxWidth: 430 });
            var body = box.querySelector('.settings-body');
            var tip = document.createElement('div');
            tip.style.cssText = 'font-size:12px;color:var(--text-tertiary,#888);margin-bottom:4px;';
            tip.textContent = '「替换」会用新音频覆盖本地同名音色；「重命名」则作为新音色导入。';
            body.appendChild(tip);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);
            var done = function(res) { _closeAppDialog(overlay, resolve, res); };
            box.querySelector('#app-dialog-x').addEventListener('click', function() { done(null); });
            var btnRename = _appDialogBtn('重命名导入', false);
            btnRename.addEventListener('click', function() { done('rename'); });
            var btnReplace = _appDialogBtn('替换现有音色', true);
            btnReplace.addEventListener('click', function() { done('replace'); });
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(btnRename);
            actions.appendChild(btnReplace);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) done(null); });
            setTimeout(function() { btnRename.focus(); }, 50);
        });
    }

    function ciAddImportItem(inst, blob, nameOverride) {
        var finalName = CustomInstruments.sanitizeName(nameOverride || inst.name);
        if (!finalName) {
            var cnt = CustomInstruments.list().length;
            finalName = '导入音色 ' + (cnt + 1);
        }
        if (CustomInstruments.getByName(finalName)) {
            finalName = finalName + ' (2)';
        }
        return CustomInstruments.add(blob, {
            name: finalName,
            color: /^#[0-9a-fA-F]{6}$/.test(inst.color || '') ? inst.color : '#4aa3ff',
            pitch: typeof inst.pitch === 'number' ? inst.pitch : 33,
            originalName: inst.file || ''
        }).then(function(item) {
            return item.instrument;
        });
    }

    // 导入 zip 中的单个音色; 返回库内 instrument 编号或 null(跳过/取消)
    function ciImportOneInstrument(inst, zipFile) {
        var fileObj = zipFile.file(inst.file);
        if (!fileObj) return Promise.resolve(null);
        return fileObj.async('blob').then(function(blob) {
            var metaHash = (inst.hash || '').replace(/^sha256:/i, '').toLowerCase();
            return CustomInstruments.hashBlob(blob).then(function(myHash) {
                myHash = (myHash || '').toLowerCase();
                var hasHashes = !!(metaHash && myHash);
                var sameName = CustomInstruments.getByName(inst.name);
                if (hasHashes && metaHash === myHash) {
                    // 同名且 hash 相同 -> 视为已存在, 不重复导入
                    return sameName ? sameName.instrument : ciAddImportItem(inst, blob);
                }
                if (sameName && hasHashes && metaHash !== myHash) {
                    // 同名但 hash 不同 -> 询问 重命名/替换
                    return ciAskRenameOrReplace(inst.name).then(function(choice) {
                        if (choice === 'replace') {
                            return CustomInstruments.remove(sameName.id).then(function() {
                                return ciAddImportItem(inst, blob);
                            });
                        }
                        if (choice === 'rename') {
                            return showAppPrompt('请输入一个新的名称：', inst.name + ' (导入)', {
                                title: '重命名导入',
                                placeholder: '新名称',
                                okText: '导入',
                                cancelText: '取消'
                            }).then(function(newName) {
                                if (!newName || !newName.trim()) return null;
                                return ciAddImportItem(inst, blob, newName.trim());
                            });
                        }
                        return null; // 用户取消该音色
                    });
                }
                if (sameName) {
                    // 无 hash 可比(旧包), 但仍同名 -> 询问避免误覆盖
                    return ciAskRenameOrReplace(inst.name).then(function(choice) {
                        if (choice === 'replace') {
                            return CustomInstruments.remove(sameName.id).then(function() {
                                return ciAddImportItem(inst, blob);
                            });
                        }
                        if (choice === 'rename') {
                            return showAppPrompt('请输入一个新的名称：', inst.name + ' (导入)', {
                                title: '重命名导入',
                                placeholder: '新名称',
                                okText: '导入',
                                cancelText: '取消'
                            }).then(function(newName) {
                                if (!newName || !newName.trim()) return null;
                                return ciAddImportItem(inst, blob, newName.trim());
                            });
                        }
                        return null;
                    });
                }
                // 新名称直接导入
                return ciAddImportItem(inst, blob);
            });
        });
    }

    // 逐个导入 zip 内音色列表; 返回 [{slot, libInstrument}]
    function ciImportPackInstruments(meta, zipFile) {
        var entries = meta.instruments || [];
        var seq = Promise.resolve();
        var results = [];
        entries.forEach(function(inst) {
            seq = seq.then(function() {
                return ciImportOneInstrument(inst, zipFile).then(function(libInstrument) {
                    if (libInstrument !== null && libInstrument !== undefined) {
                        var slot = (typeof inst.slot === 'number') ? inst.slot
                            : (typeof inst.instrument === 'number' ? inst.instrument - 20 : 0);
                        results.push({ slot: slot, libInstrument: libInstrument });
                    }
                });
            });
        });
        return seq.then(function() { return results; });
    }

    // ---- zip 导入入口 (作品包 / 音色备份) ----
    function handleZipFile(file) {
        if (!_ciIsZipAvailable()) {
            showAppAlert('ZIP 解析库未加载，无法导入 zip 文件。请刷新页面重试。', {title: '导入', icon: 'fa-solid fa-triangle-exclamation'});
            return;
        }
        showTaskProgress(file.name, '解析压缩包…');
        JSZip.loadAsync(file).then(function(zipFile) {
            var metaFile = zipFile.file('metadata.json');
            if (!metaFile) throw new Error('缺少 metadata.json，不是有效的作品包/备份文件');
            return metaFile.async('string').then(function(text) {
                var meta;
                try { meta = JSON.parse(text); } catch (e) { throw new Error('metadata.json 解析失败'); }
                if (!meta || !meta.type) throw new Error('无法识别的压缩包类型');
                return { kind: meta.type, zipFile: zipFile, meta: meta };
            });
        }).then(function(ctx) {
            hideTaskProgress();
            if (ctx.kind === 'noteblock-web-instrument-backup') {
                return ciImportPackInstruments(ctx.meta, ctx.zipFile).then(function(mapped) {
                    renderCustomInstList();
                    showAppAlert('音色备份导入完成（' + mapped.length + ' 项）。', {title: '导入备份', icon: 'fa-solid fa-circle-check'});
                    return mapped;
                });
            }
            if (ctx.kind === 'noteblock-web-song-pack') {
                var nbsName = ctx.meta.song || 'song.nbs';
                var nbsFile = ctx.zipFile.file(nbsName);
                if (!nbsFile) throw new Error('压缩包缺少 ' + nbsName);
                return ciImportPackInstruments(ctx.meta, ctx.zipFile).then(function(mapped) {
                    return nbsFile.async('arraybuffer').then(function(ab) {
                        // NBS 哈希校验: 仅当包内提供了 nbsHash 时校验; 旧包无哈希则静默兼容
                        var expected = (ctx.meta && ctx.meta.nbsHash)
                            ? String(ctx.meta.nbsHash).replace(/^sha256:/i, '').toLowerCase() : '';
                        var hashP = (expected && window.CustomInstruments
                                && typeof CustomInstruments.hashBlob === 'function')
                            ? CustomInstruments.hashBlob(new Blob([ab])).then(function(h) {
                                return String(h || '').toLowerCase() === expected;
                            }).catch(function() { return true; })
                            : Promise.resolve(true);
                        return hashP.then(function(hashOk) {
                            if (!hashOk) {
                                showAppAlert('压缩包内的 NBS 文件与片段分组数据校验不一致，'
                                    + 'NBS 可能被修改或损坏，导入后片段分组/轨道可能出现错乱。\n'
                                    + '将按现有数据继续导入。',
                                    { title: 'NBS 校验警告', icon: 'fa-solid fa-triangle-exclamation' });
                            }
                            var song = NBSClient._parseNBS(ab);
                            var remap = {};
                            for (var m = 0; m < mapped.length; m++) {
                                remap[20 + mapped[m].slot] = mapped[m].libInstrument;
                            }
                            var changed = false;
                            song.notes = (song.notes || []).map(function(n) {
                                if (n.instrument >= 20 && remap[n.instrument] !== undefined) {
                                    changed = true;
                                    var c = Object.assign({}, n);
                                    c.instrument = remap[n.instrument];
                                    return c;
                                }
                                return n;
                            });
                            song.customInstruments = [];
                            applyParsedSong(song, nbsName);
                            renderCustomInstList();
                            // 歌词还原: 作品包内含 lyrics.json 时自动载入
                            // 注意必须在 applyParsedSong 之后 (载入歌曲会清空歌词)
                            return importLyricsFromZip(ctx.zipFile, ctx.meta).then(function(lyrCount) {
                                return importSegmentsFromZip(ctx.zipFile, ctx.meta).then(function(segCount) {
                                    var msg = changed
                                        ? '作品包导入完成，自定义音色已装载并重映射。'
                                        : '作品包导入完成，歌曲已载入。';
                                    if (lyrCount >= 0) msg += '\n' + i18nText('已还原歌词标注') + ': ' + lyrCount;
                                    else msg += '\n' + i18nText('歌词数据解析失败，已跳过。');
                                    if (segCount > 0) msg += '\n' + i18nText('已还原片段分割') + ': ' + segCount;
                                    if (!hashOk) msg += '\n' + i18nText('NBS 文件校验不一致，分组数据可能不可靠。');
                                    showAppAlert(msg, {title: '导入作品包', icon: 'fa-solid fa-circle-check'});
                                });
                            });
                        });
                    });
                });
            }
            showAppAlert('无法识别的压缩包类型: ' + ctx.kind, {title: '导入失败', icon: 'fa-solid fa-triangle-exclamation'});
            return Promise.resolve();
        }).catch(function(err) {
            hideTaskProgress();
            showAppAlert('导入失败: ' + (err && err.message ? err.message : '未知错误'), {title: '导入失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }
    // ============ M5b: NBS 加载时缺失自定义音色处理 ============
    // 检查歌曲引用的自定义音色(slot >= 20)在本地音色库是否存在;
    // 缺失时弹出弹窗让用户选择: 替换为现有音色 / 跳过(静音) / 稍后导入(取消本次加载)。
    // 返回 Promise<boolean>: true=继续加载(音色可能已被重映射), false=取消加载
    function resolveMissingCustomInstruments(song) {
        if (!song) return Promise.resolve(true);
        if (!window.CustomInstruments) return Promise.resolve(true);

        // 收集歌曲实际使用到的自定义音色槽位
        var used = {};
        var notes = song.notes || [];
        for (var i = 0; i < notes.length; i++) {
            var no = notes[i].instrument;
            if (no >= 20) used[no] = true;
        }
        var missingNos = Object.keys(used).map(Number).sort(function(a, b) { return a - b; })
            .filter(function(no) { return !CustomInstruments.getByInstrument(no); });
        if (missingNos.length === 0) return Promise.resolve(true);

        // v6 自定义乐器表: instrument 编号 -> 定义 (用于显示名称)
        var defByName = {};
        var defs = song.customInstruments || [];
        for (var di = 0; di < defs.length; di++) {
            var d = defs[di];
            if (d && (d.instrument || d.slot) !== undefined) {
                var dIdx = (defs[di].instrument === undefined) ? (20 + di) : defs[di].instrument;
                if (dIdx >= 20) defByName[dIdx] = defs[di];
            }
        }
        // 本地音色库 (按名称排序, 作为可选项)
        var lib = CustomInstruments.list();
        lib.sort(function(a, b) { return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)); });
        // 默认 NBS 音色列表 (值 = nbs:编号)
        var nbsNames = INSTRUMENT_NAMES.map(function(_, idx) { return getInstName(idx); });

        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox('缺少自定义音色', '', 'fa-solid fa-triangle-exclamation', { maxWidth: 540 });
            var body = box.querySelector('.settings-body');
            body.textContent = '';

            var intro = document.createElement('div');
            intro.style.cssText = 'font-size:13px;color:var(--text-secondary,#aaa);line-height:1.7;margin-bottom:4px;';
            intro.innerHTML = '这首歌使用了 <b>' + missingNos.length + '</b> 个自定义音色，但本地音色库中找不到对应的音频。'
                + '<br>请为每个缺失音色选择替代方案后继续加载；或点「稍后导入」取消加载，先完成音色导入。';
            body.appendChild(intro);

            var rows = [];
            missingNos.forEach(function(no) {
                var def = defByName[no] || null;
                var defName = def ? (def.name || '') : '';
                var title = document.createElement('div');
                title.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0 4px;font-size:12px;color:var(--text-secondary,#aaa);';
                title.innerHTML = '<span style="font-weight:500;">' + escapeHtml(defName || ('自定义音色 #' + (no - 19))) + '</span>'
                    + '<span style="color:var(--text-tertiary,#888);font-size:11px;">(槽位 ' + (no - 20) + ')</span>';
                body.appendChild(title);

                var sel = document.createElement('select');
                sel.style.cssText = 'width:100%;padding:7px 8px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';

                var ph = document.createElement('option');
                ph.value = '';
                ph.textContent = '— 请选择替换音色 —';
                sel.appendChild(ph);

                // 可自动匹配: 同名音色的库内音色放在最前面
                var matched = defName ? lib.filter(function(it) { return it.name === defName; }) : [];
                matched.concat(lib.filter(function(it) { return it.name !== defName; })).forEach(function(item) {
                    var o = document.createElement('option');
                    o.value = 'custom:' + item.instrument;
                    o.textContent = item.name + ' (自定义音色)';
                    sel.appendChild(o);
                });

                for (var ni = 0; ni < nbsNames.length; ni++) {
                    var o2 = document.createElement('option');
                    o2.value = 'nbs:' + ni;
                    o2.textContent = nbsNames[ni];
                    sel.appendChild(o2);
                }

                var oSkip = document.createElement('option');
                oSkip.value = 'skip';
                oSkip.textContent = '跳过（该音色静音）';
                sel.appendChild(oSkip);

                sel.addEventListener('change', function() { updateOkState(); });
                body.appendChild(sel);
                rows.push({ no: no, sel: sel });
            });

            // 底部提示: 替换后的映射关系说明
            var tip = document.createElement('div');
            tip.style.cssText = 'font-size:12px;color:var(--text-tertiary,#888);margin-top:10px;line-height:1.6;';
            tip.textContent = '「替换」会把歌曲中该音色的音符改用到所选音色；「跳过」则让这些音符静音（仍保留在歌曲中）。';
            body.appendChild(tip);

            var okBtn = _appDialogBtn('替换并加载', true);
            okBtn.disabled = true;
            var cancelBtn = _appDialogBtn('稍后导入', false);
            var updateOkState = function() {
                var allChosen = rows.every(function(r) { return r.sel.value !== ''; });
                okBtn.disabled = !allChosen;
            };

            var done = function(res) { _closeAppDialog(overlay, resolve, res); };
            box.querySelector('#app-dialog-x').addEventListener('click', function() { done(false); });
            cancelBtn.addEventListener('click', function() { done(false); });
            okBtn.addEventListener('click', function() {
                // 应用替换映射
                var remap = {};
                rows.forEach(function(r) {
                    var v = r.sel.value;
                    if (v === 'skip') { remap[r.no] = null; }
                    else if (v.indexOf('custom:') === 0) { remap[r.no] = parseInt(v.slice(7), 10); }
                    else if (v.indexOf('nbs:') === 0) { remap[r.no] = parseInt(v.slice(4), 10); }
                });
                var changed = false;
                song.notes = (song.notes || []).map(function(n) {
                    if (n.instrument >= 20 && remap[n.instrument] !== undefined) {
                        changed = true;
                        var c = Object.assign({}, n);
                        c.instrument = remap[n.instrument];
                        return c;
                    }
                    return n;
                });
                // 槽位已重映射, v6 自定义乐器表不再适用
                if (changed) song.customInstruments = [];
                done(true);
            });
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) done(false); });
        });
    }

    // 把解析出的歌曲(如 zip 作品包内的 song.nbs)直接载入编辑器
    function applyParsedSong(song, fileName) {
        applyLoadedSongData({ song: song }, { name: fileName || 'song.nbs' }, { value: '' });
        // 载入的文件写入当前标签页快照, 并刷新标题
        tabStash();
        renderTabs();
        updateSongInfo();
    }

    var STORAGE_KEY = 'noteblockweb_data';
    N.shared._dirty = false;

    // ---- 导出 ----
    N.exportNBS = exportNBS;
    N.buildExportSongDataFromSnapshot = buildExportSongDataFromSnapshot;
    N.safeFileName = safeFileName;
    N.buildSegmentsJsonFromSnapshot = buildSegmentsJsonFromSnapshot;
    N.showBatchExportDialog = showBatchExportDialog;
    N.runBatchExport = runBatchExport;
    N._ciIsZipAvailable = _ciIsZipAvailable;
    N.dlBlob = dlBlob;
    N.guessAudioExt = guessAudioExt;
    N.buildMergedNotesForExport = buildMergedNotesForExport;
    N.buildExportSongData = buildExportSongData;
    N.collectCustomBuffers = collectCustomBuffers;
    N.renderSongToBlob = renderSongToBlob;
    N._performExport = _performExport;
    N._performZipExport = _performZipExport;
    N.exportInstrumentBackup = exportInstrumentBackup;
    N.ciAskRenameOrReplace = ciAskRenameOrReplace;
    N.ciAddImportItem = ciAddImportItem;
    N.ciImportOneInstrument = ciImportOneInstrument;
    N.ciImportPackInstruments = ciImportPackInstruments;
    N.handleZipFile = handleZipFile;
    N.resolveMissingCustomInstruments = resolveMissingCustomInstruments;
    N.applyParsedSong = applyParsedSong;
    N.STORAGE_KEY = STORAGE_KEY;
})(window.WebNBS);
