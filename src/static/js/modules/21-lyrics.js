/* 21-lyrics.js — MiauNoteBlock 功能模块
   来源: 原 main.js L10377-L10820; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function exitSegmentsEditMode() { return N.exitSegmentsEditMode.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function importLyricsFile() { return N.importLyricsFile.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function segmentCopy() { return N.segmentCopy.apply(this, arguments); }
    function segmentDelete() { return N.segmentDelete.apply(this, arguments); }
    function segmentPaste() { return N.segmentPaste.apply(this, arguments); }
    function segmentSplit() { return N.segmentSplit.apply(this, arguments); }
    function segmentTrimLeft() { return N.segmentTrimLeft.apply(this, arguments); }
    function segmentTrimRight() { return N.segmentTrimRight.apply(this, arguments); }
    function showSmallTip() { return N.showSmallTip.apply(this, arguments); }
    function syncSegmentToolbarTop() { return N.syncSegmentToolbarTop.apply(this, arguments); }
    function updateRadioTempoSlider() { return N.updateRadioTempoSlider.apply(this, arguments); }


    // 窗口 resize 时重定位 (因为容器宽度变化)
    window.addEventListener('resize', function() {
        updateRadioTempoSlider();
        // 画布重排后片段工具栏的落点可能变化 (时间栏高度/位置相关)
        if (state.segmentsEditMode) {
            syncSegmentToolbarTop();
            requestAnimationFrame(syncSegmentToolbarTop);
        }
    });

    // ============ 歌词标注 ============
    // 数据模型: state.lyrics = [{ id, tick, text, duration, lane }]
    //   - lane: 0..2 三条歌词轨道, 允许不同轨道在同一 tick 重叠 (播放时多行显示)
    //   - duration 单位为 tick, 长度固定, 不随相邻片段变化
    // 歌词轨道常量: 3 条平行轨道; 片段新建时的固定时长 (tick)
    var LYRIC_LANE_COUNT = 3;
    var LYRIC_DEFAULT_DURATION = 4;
    var LYRIC_DEFAULT_TEXT = '请输入文本';

    // 归一化单个歌词片段 (补齐 id / lane / duration); 非法返回 null
    // 逐字对齐生成的片段额外带 lineStart / noteLayer / noteTick / charIndex, 一并保留
    function normalizeLyricClip(c) {
        if (!c || typeof c !== 'object') return null;
        var tick = parseInt(c.tick, 10);
        if (!isFinite(tick) || tick < 0) return null;
        var lane = parseInt(c.lane, 10);
        if (!isFinite(lane) || lane < 0) lane = 0;
        if (lane > LYRIC_LANE_COUNT - 1) lane = LYRIC_LANE_COUNT - 1;
        var dur = parseInt(c.duration, 10);
        if (!isFinite(dur) || dur < 1) dur = LYRIC_DEFAULT_DURATION;
        var out = {
            id: c.id || genLyricId(),
            tick: tick,
            lane: lane,
            text: String(c.text == null ? '' : c.text),
            duration: dur
        };
        if (c.lineStart) out.lineStart = true;
        var noteLayer = parseInt(c.noteLayer, 10);
        if (isFinite(noteLayer) && c.noteLayer !== null && c.noteLayer !== undefined) out.noteLayer = noteLayer;
        var noteTick = parseInt(c.noteTick, 10);
        if (isFinite(noteTick) && c.noteTick !== null && c.noteTick !== undefined) out.noteTick = Math.max(0, noteTick);
        var charIndex = parseInt(c.charIndex, 10);
        if (isFinite(charIndex) && c.charIndex !== null && c.charIndex !== undefined) out.charIndex = Math.max(0, charIndex);
        return out;
    }

    // tick -> [该 tick 上所有生效的歌词] (允许多条轨道同时有歌词)
    function lyricRebuildIndex() {
        state._lyricIndex = {};
        for (var i = 0; i < state.lyrics.length; i++) {
            var ly = state.lyrics[i];
            if (!ly || !ly.text) continue;
            if (!state._lyricIndex[ly.tick]) state._lyricIndex[ly.tick] = [];
            state._lyricIndex[ly.tick].push(ly);
        }
    }

    function getLyricsAt(tick) {
        if (!state._lyricIndex) lyricRebuildIndex();
        return state._lyricIndex[tick] || [];
    }

    function updateLyricsEditBar() {
        var bar = $('lyrics-edit-bar');
        if (bar) bar.style.display = state.lyricsEditMode ? 'flex' : 'none';
        var cnt = $('lyrics-edit-bar-count');
        if (cnt) cnt.textContent = String(state.lyrics.length);
        var copyBtn = $('lyrics-copy');
        var cutBtn = $('lyrics-cut');
        var pasteBtn = $('lyrics-paste');
        var selected = getSelectedLyricClip();
        var hasSel = !!selected;
        if (copyBtn) copyBtn.disabled = !hasSel;
        if (cutBtn) cutBtn.disabled = !hasSel;
        if (pasteBtn) pasteBtn.disabled = !state.lyricClipboard.length;
        // 按音符重新锚定: 仅逐字对齐生成的片段可用
        var anchorBtn = $('lyrics-note-anchor');
        if (anchorBtn) {
            anchorBtn.disabled = !(selected && N.isCharAlignedClip && N.isCharAlignedClip(selected));
        }
    }

    function syncLyricsToRoll() {
        if (!state.pianoRoll) return;
        var out = [];
        for (var i = 0; i < state.lyrics.length; i++) {
            var c = normalizeLyricClip(state.lyrics[i]);
            if (c) out.push(c);
        }
        out.sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return (a.lane || 0) - (b.lane || 0);
        });
        state.lyrics = out;
        if (state.song) state.song.lyrics = JSON.parse(JSON.stringify(out));
        state.pianoRoll.lyricTicks = out;
        state.pianoRoll._fullRedrawNeeded = true;
        state.pianoRoll.render();
        updateLyricsEditBar();
    }

    // 歌词片段 id 生成器
    function genLyricId() {
        state._lyricIdSeq = (state._lyricIdSeq || 0) + 1;
        return 'ly' + state._lyricIdSeq + '_' + Date.now().toString(36);
    }

    // 在指定 tick / 轨道新建歌词片段 (固定时长; 同轨同 tick 已存在则返回既有片段)
    function createLyricClip(tick, lane) {
        if (!isFinite(tick) || tick < 0) return null;
        tick = Math.floor(tick);
        lane = parseInt(lane, 10);
        if (!isFinite(lane) || lane < 0) lane = 0;
        if (lane > LYRIC_LANE_COUNT - 1) lane = LYRIC_LANE_COUNT - 1;
        for (var i = 0; i < state.lyrics.length; i++) {
            var c = state.lyrics[i];
            if (c.tick === tick && (c.lane || 0) === lane) return c;
        }
        var clip = { id: genLyricId(), tick: tick, lane: lane, text: '', duration: LYRIC_DEFAULT_DURATION };
        state.lyrics.push(clip);
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return clip;
    }

    // 删除指定 id 的歌词片段 (skipUndo=true 时由调用方自行处理撤销)
    function deleteLyricClip(id, skipUndo) {
        var removed = false;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { state.lyrics.splice(i, 1); removed = true; break; }
        }
        if (!removed) return;
        if (!skipUndo) pushUndo();
        if (state.activeLyricId === id) state.activeLyricId = null;
        if (state.pianoRoll && state.pianoRoll.lyricSelectedId === id) {
            state.pianoRoll._setLyricSelected(null);
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
    }

    // 当前选中的歌词片段 (优先取轨道选中态)
    function getSelectedLyricClip() {
        var id = (state.pianoRoll && state.pianoRoll.lyricSelectedId != null)
            ? state.pianoRoll.lyricSelectedId : state.activeLyricId;
        if (id == null) return null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) return state.lyrics[i];
        }
        return null;
    }

    // 拖动结束提交: 仅 move 模式做「覆盖交换位置」(端点拉伸已被邻居边界钳制, 无需交换)
    function commitLyricClipDrag(id, origTick, origLane, mode) {
        var clip = null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { clip = state.lyrics[i]; break; }
        }
        if (clip && mode === 'move') {
            var lane = clip.lane || 0;
            var end = clip.tick + (clip.duration || LYRIC_DEFAULT_DURATION);
            var best = null, bestOv = 0;
            for (var j = 0; j < state.lyrics.length; j++) {
                var o = state.lyrics[j];
                if (o === clip || (o.lane || 0) !== lane) continue;
                var oEnd = o.tick + (o.duration || LYRIC_DEFAULT_DURATION);
                var ov = Math.min(end, oEnd) - Math.max(clip.tick, o.tick);
                if (ov > 0 && ov > bestOv) { bestOv = ov; best = o; }
            }
            if (best) {
                var bt = best.tick, bl = best.lane || 0;
                best.tick = origTick;
                best.lane = origLane;
                clip.tick = bt;
                clip.lane = bl;
            }
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
    }

    // ---- 歌词片段剪切 / 复制 / 粘贴 ----
    // clipId 缺省时使用当前选中片段 (键盘快捷键 / 工具栏调用)
    function copyLyricClip(cut, clipId) {
        var clip = null;
        if (clipId != null) {
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === clipId) { clip = state.lyrics[i]; break; }
            }
        } else {
            clip = getSelectedLyricClip();
        }
        if (!clip) return false;
        state.lyricClipboard = [{
            text: clip.text,
            duration: clip.duration || LYRIC_DEFAULT_DURATION,
            lane: clip.lane || 0,
            relTick: 0
        }];
        if (cut) deleteLyricClip(clip.id);   // deleteLyricClip 内部已 pushUndo
        else updateLyricsEditBar();
        return true;
    }

    // 同轨是否已存在与该区间重叠的片段
    function findLyricConflict(lane, tick, dur) {
        for (var i = 0; i < state.lyrics.length; i++) {
            var o = state.lyrics[i];
            if ((o.lane || 0) !== lane) continue;
            var oEnd = o.tick + (o.duration || LYRIC_DEFAULT_DURATION);
            if (Math.min(tick + dur, oEnd) > Math.max(tick, o.tick)) return true;
        }
        return false;
    }

    // 粘贴到播放头位置 (保留原轨道; 同轨冲突时依次后移)
    function pasteLyricClips() {
        if (!state.lyricClipboard.length) return false;
        var base = Math.max(0, Math.floor(state.currentTick || 0));
        pushUndo();
        for (var i = 0; i < state.lyricClipboard.length; i++) {
            var it = state.lyricClipboard[i];
            var lane = Math.max(0, Math.min(LYRIC_LANE_COUNT - 1, it.lane || 0));
            var dur = it.duration || LYRIC_DEFAULT_DURATION;
            var tick = base + (it.relTick || 0);
            var guard = 0;
            while (findLyricConflict(lane, tick, dur) && guard++ < 512) tick++;
            state.lyrics.push({
                id: genLyricId(), tick: tick, lane: lane,
                text: it.text || '', duration: dur
            });
        }
        lyricRebuildIndex();
        syncLyricsToRoll();
        markDirty();
        return true;
    }

    // 歌词编辑小悬浮窗 (剪映风格: 位置跟随鼠标, 挂在 body 上避免祖先 backdrop-filter 破坏 fixed 定位)
    // skipClean=true 时不做「空片段回收」(commit 已处理过数据)
    function closeLyricEditorPop(skipClean) {
        var pop = document.getElementById('lyric-editor-pop');
        if (!pop) return;
        if (!skipClean) {
            var cid = pop.getAttribute('data-clip-id');
            var c = null;
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === cid) { c = state.lyrics[i]; break; }
            }
            // 无文字的片段 (多为刚新建后放弃编辑) 直接回收 (不产生撤销步骤)
            if (c && !String(c.text || '').trim()) deleteLyricClip(cid, true);
        }
        pop.remove();
    }

    function showLyricEditorPop(id, clientX, clientY) {
        var clip = null;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].id === id) { clip = state.lyrics[i]; break; }
        }
        if (!clip) return;
        // 新建片段 (尚无文字) 的撤销点应为「片段不存在」的状态,
        // 因此保存时先摘除该片段再 pushUndo, 写入文字时再放回
        var isNewClip = !String(clip.text || '').trim();
        closeLyricEditorPop();

        var pop = document.createElement('div');
        pop.className = 'lyric-editor-pop';
        pop.id = 'lyric-editor-pop';
        pop.setAttribute('data-clip-id', id);
        pop.innerHTML =
            '<div class="lyric-editor-pop-head">'
            + '<span class="lyric-editor-pop-title">' + i18nText('歌词标注') + '</span>'
            + '<button type="button" class="lyric-editor-pop-close" id="lyric-editor-pop-close">&times;</button>'
            + '</div>'
            + '<input type="text" class="lyric-editor-pop-input" id="lyric-editor-pop-input" maxlength="200">'
            + '<div class="lyric-editor-pop-actions">'
            + '<button type="button" class="lyric-editor-pop-btn is-danger" id="lyric-editor-pop-del">' + i18nText('删除') + '</button>'
            + (isNewClip ? '' :
                '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-cut" title="' + i18nText('剪切') + '"><i class="fa-solid fa-scissors"></i></button>'
                + '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-copy" title="' + i18nText('复制') + '"><i class="fa-regular fa-copy"></i></button>')
            + '<button type="button" class="lyric-editor-pop-btn lyric-editor-pop-icon" id="lyric-editor-pop-paste" title="' + i18nText('粘贴') + '"'
            + (state.lyricClipboard.length ? '' : ' disabled') + '><i class="fa-solid fa-paste"></i></button>'
            + '<span class="lyric-editor-pop-spacer"></span>'
            + '<button type="button" class="lyric-editor-pop-btn" id="lyric-editor-pop-cancel">' + i18nText('取消') + '</button>'
            + '<button type="button" class="lyric-editor-pop-btn is-primary" id="lyric-editor-pop-save">' + i18nText('保存') + '</button>'
            + '</div>';
        document.body.appendChild(pop);

        var input = pop.querySelector('#lyric-editor-pop-input');
        input.value = clip.text || '';
        // 留空保存时将填入默认文本, 以 placeholder 提示用户
        input.placeholder = i18nText('请输入文本');

        // 定位在鼠标旁边 (默认右下, 越界时翻转到左上)
        var px = (typeof clientX === 'number') ? clientX : 0;
        var py = (typeof clientY === 'number') ? clientY : 0;
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var left = px + 14, top = py + 14;
        if (left + pw > window.innerWidth - 8) left = Math.max(8, px - pw - 14);
        if (top + ph > window.innerHeight - 8) top = Math.max(8, py - ph - 14);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        // 放弃尚未保存的新建片段 (不产生撤销步骤)
        var dropPending = function() {
            for (var i = 0; i < state.lyrics.length; i++) {
                if (state.lyrics[i].id === id) { state.lyrics.splice(i, 1); break; }
            }
            if (state.pianoRoll && state.pianoRoll.lyricSelectedId === id) state.pianoRoll._setLyricSelected(null);
            lyricRebuildIndex();
            syncLyricsToRoll();
        };
        var commit = function(remove) {
            var v = String(input.value == null ? '' : input.value).trim();
            if (isNewClip) {
                if (remove) {
                    // 删除按钮: 放弃新建, 不产生撤销步骤
                    dropPending();
                } else {
                    // 保存: 留空则填入默认文本 (避免空文本片段)
                    dropPending();
                    pushUndo();          // 撤销点 = 片段尚不存在
                    clip.text = v || LYRIC_DEFAULT_TEXT;
                    state.lyrics.push(clip);
                    state.activeLyricId = clip.id;
                    lyricRebuildIndex();
                    syncLyricsToRoll();
                    markDirty();
                }
            } else {
                if (remove) {
                    pushUndo();
                    deleteLyricClip(id, true);
                } else {
                    // 保存: 留空则填入默认文本 (不删除, 避免误操作丢失片段)
                    pushUndo();
                    clip.text = v || LYRIC_DEFAULT_TEXT;
                    lyricRebuildIndex();
                    syncLyricsToRoll();
                    markDirty();
                }
            }
            closeLyricEditorPop(true);
        };
        // 取消 / 关闭: 若该片段仍无文字 (多为刚新建), 视为放弃, 一并移除
        var dismiss = function() {
            closeLyricEditorPop(false);
        };

        pop.querySelector('#lyric-editor-pop-close').addEventListener('click', dismiss);
        pop.querySelector('#lyric-editor-pop-cancel').addEventListener('click', dismiss);
        pop.querySelector('#lyric-editor-pop-del').addEventListener('click', function() { commit(true); });
        pop.querySelector('#lyric-editor-pop-save').addEventListener('click', function() { commit(false); });
        // 剪切 / 复制 / 粘贴 (手机端也可在片段编辑窗内直接操作; 新建空片段时不显示剪切/复制)
        var cutBtn2 = pop.querySelector('#lyric-editor-pop-cut');
        if (cutBtn2) cutBtn2.addEventListener('click', function() {
            if (copyLyricClip(true, id)) closeLyricEditorPop(true);
        });
        var copyBtn2 = pop.querySelector('#lyric-editor-pop-copy');
        if (copyBtn2) copyBtn2.addEventListener('click', function() {
            if (copyLyricClip(false, id)) closeLyricEditorPop(true);
        });
        pop.querySelector('#lyric-editor-pop-paste').addEventListener('click', function() {
            if (isNewClip) dropPending();   // 先丢弃尚未保存的空片段, 避免留下无文字片段
            pasteLyricClips();
            closeLyricEditorPop(true);
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(false); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); }
        });
        setTimeout(function() { input.focus(); input.select(); }, 30);
    }

    function enterLyricsEditMode() {
        // 歌词编辑与片段编辑互斥
        exitSegmentsEditMode();
        state.lyricsEditMode = true;
        if (state.pianoRoll) state.pianoRoll.setLyricsEditMode(true);
        updateLyricsEditBar();
    }

    function exitLyricsEditMode() {
        closeLyricEditorPop();
        state.lyricsEditMode = false;
        if (state.pianoRoll) state.pianoRoll.setLyricsEditMode(false);
        updateLyricsEditBar();
    }

    function initLyricsUI() {
        var exitBtn = $('lyrics-edit-bar-exit');
        if (exitBtn) exitBtn.addEventListener('click', function() { exitLyricsEditMode(); });
        // 工具栏: 在播放头位置按轨道新建片段 (桌面/触屏通用, 补充触屏长按新建)
        for (var li = 0; li < LYRIC_LANE_COUNT; li++) {
            (function(lane) {
                var btn = $('lyrics-add-' + lane);
                if (!btn) return;
                btn.addEventListener('click', function() {
                    var tick = Math.max(0, Math.floor(state.currentTick || 0));
                    var clip = createLyricClip(tick, lane);
                    if (!clip) return;
                    if (state.pianoRoll && state.pianoRoll._setLyricSelected) {
                        state.pianoRoll._setLyricSelected(clip.id);
                    }
                    var r = btn.getBoundingClientRect();
                    showLyricEditorPop(clip.id, r.left + r.width / 2, r.bottom);
                });
            })(li);
        }
        var cutBtn = $('lyrics-cut');
        if (cutBtn) cutBtn.addEventListener('click', function() { copyLyricClip(true); });
        var copyBtn = $('lyrics-copy');
        if (copyBtn) copyBtn.addEventListener('click', function() { copyLyricClip(false); });
        var pasteBtn = $('lyrics-paste');
        if (pasteBtn) pasteBtn.addEventListener('click', function() { pasteLyricClips(); });
        // 快速添加 (LRC 导入 / 人声轨道逐字对齐)
        var quickBtn = $('lyrics-quick-add');
        if (quickBtn) quickBtn.addEventListener('click', function() {
            if (N.showLyricsQuickDialog) N.showLyricsQuickDialog('lrc');
        });
        // 按音符重新锚定选中的逐字歌词片段 (后续字自动顺移)
        var anchorBtn = $('lyrics-note-anchor');
        if (anchorBtn) anchorBtn.addEventListener('click', function() {
            if (N.beginLyricAnchorPick) N.beginLyricAnchorPick(getSelectedLyricClip());
        });
        // 捕获阶段拦截: 弹窗打开时 Esc 只应由弹窗自身处理, 避免同时退出编辑模式
        window.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape' || !state.lyricsEditMode) return;
            if (document.querySelector('.app-dialog-overlay')) return;
            if (document.getElementById('lyric-editor-pop')) return;
            exitLyricsEditMode();
        }, true);
        var fileInput = $('lyrics-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                var f = e.target.files && e.target.files[0];
                e.target.value = ''; // 允许重复选择同一文件
                if (f) importLyricsFile(f);
            });
        }
        updateLyricsEditBar();
    }

    // ============ 片段编辑 UI ============
    // 动作 (桌面顶部工具栏 / 手机悬浮条共用)
    function segActionSplit() {
        if (!segmentSplit()) showSmallTip(i18nText('请先把播放头移到选中片段内部'));
    }
    function segActionTrimLeft() {
        if (!segmentTrimLeft()) showSmallTip(i18nText('请选中片段，并把播放头放在片段内部'));
    }
    function segActionTrimRight() {
        if (!segmentTrimRight()) showSmallTip(i18nText('请选中片段，并把播放头放在片段内部'));
    }
    function segActionCopy() {
        if (!segmentCopy()) showSmallTip(i18nText('请先选中一个片段'));
    }
    function segActionPaste() {
        if (!segmentPaste()) showSmallTip(i18nText('请先复制一个片段'));
    }
    function segActionDelete() {
        if (!segmentDelete()) showSmallTip(i18nText('请先选中一个片段'));
    }

    // ---- 导出 ----
    N.normalizeLyricClip = normalizeLyricClip;
    N.lyricRebuildIndex = lyricRebuildIndex;
    N.getLyricsAt = getLyricsAt;
    N.updateLyricsEditBar = updateLyricsEditBar;
    N.syncLyricsToRoll = syncLyricsToRoll;
    N.genLyricId = genLyricId;
    N.createLyricClip = createLyricClip;
    N.deleteLyricClip = deleteLyricClip;
    N.getSelectedLyricClip = getSelectedLyricClip;
    N.commitLyricClipDrag = commitLyricClipDrag;
    N.copyLyricClip = copyLyricClip;
    N.findLyricConflict = findLyricConflict;
    N.pasteLyricClips = pasteLyricClips;
    N.closeLyricEditorPop = closeLyricEditorPop;
    N.showLyricEditorPop = showLyricEditorPop;
    N.enterLyricsEditMode = enterLyricsEditMode;
    N.exitLyricsEditMode = exitLyricsEditMode;
    N.initLyricsUI = initLyricsUI;
    N.segActionSplit = segActionSplit;
    N.segActionTrimLeft = segActionTrimLeft;
    N.segActionTrimRight = segActionTrimRight;
    N.segActionCopy = segActionCopy;
    N.segActionPaste = segActionPaste;
    N.segActionDelete = segActionDelete;
    N.LYRIC_LANE_COUNT = LYRIC_LANE_COUNT;
    N.LYRIC_DEFAULT_DURATION = LYRIC_DEFAULT_DURATION;
    N.LYRIC_DEFAULT_TEXT = LYRIC_DEFAULT_TEXT;
})(window.WebNBS);
