/* 11-find.js — MiauNoteBlock 功能模块
   来源: 原 main.js L5367-L6042; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function getNbsKeyPitchLabel() { return N.getNbsKeyPitchLabel.apply(this, arguments); }
    function getNbsKeyOctave() { return N.getNbsKeyOctave.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function getInstrumentNames() { return N.getInstrumentNames.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function clampNum() { return N.clampNum.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }


    // ============ 音符查找/替换浮层 ============
    var findState = {
        mode: 'find',
        inst: [],
        keyMode: 'single',
        keySingle: null,
        keyRange: [null, null],
        velMode: 'single',
        velSingle: null,
        velMin: 0, velMax: 100,
        repInst: null,          // 替换目标音色 (null = 不变)
        repKey: null,           // 替换目标音调 (null = 不变)
        results: [],
        index: -1
    };
    var FIND_MAX_KEYS = 88;

    function findKeyLabel(key) {
        return getNbsKeyPitchLabel(key) + getNbsKeyOctave(key);
    }

    function findPanelVisible() {
        var panel = $('find-panel');
        return panel && panel.style.display !== 'none';
    }

    // ============ 通用悬浮选择器 (音色 / 音调统一入口) ============
    // 交互: 「选择X」按钮 → 弹出悬浮窗 → 点击条目即选中 (选中高亮, 单选选完自动关闭);
    //       已选内容实时显示在按钮右侧, 内容过长时右侧淡出省略 (CSS mask)。
    function findInstLabel(i) {
        var names = getInstrumentNames();
        return names[i] || ('音色' + i);
    }
    function findInstCustomColor(i) {
        var list = (window.CustomInstruments && CustomInstruments.list) ? CustomInstruments.list() : [];
        for (var a = 0; a < list.length; a++) if (list[a].instrument === i) return list[a].color || null;
        return null;
    }
    // 悬浮窗列表: 全部内置音色 + 自定义音色 (选中不存在的音色自然匹配 0 个结果)
    function findInstrumentValues() {
        var out = [];
        var names = getInstrumentNames();
        for (var i = 0; i < names.length; i++) out.push(i);
        var list = (window.CustomInstruments && CustomInstruments.list) ? CustomInstruments.list() : [];
        for (var c = 0; c < list.length; c++) if (out.indexOf(list[c].instrument) < 0) out.push(list[c].instrument);
        return out.sort(function (a, b) { return a - b; });
    }
    function findKeyValues() {
        var out = [];
        for (var k = 0; k < FIND_MAX_KEYS; k++) out.push(k);
        return out;
    }
    function findInstCellHTML(i) {
        var color = findInstCustomColor(i);
        var ic = color
            ? '<span class="find-pick-ic" style="background:' + color + ';"></span>'
            : '<span class="find-pick-ic"><img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" alt="" onerror="this.style.display=\'none\'"></span>';
        return ic + '<span class="find-pick-name">' + findInstLabel(i) + '</span>';
    }
    function findKeyCellHTML(k) {
        return '<span class="find-pick-name">' + findKeyLabel(k) + '</span><span class="find-pick-sub">' + k + '</span>';
    }

    var pickCfg = null;        // 当前打开的 picker 配置
    var pickAnchor = null;

    function findPickPop() { return $('find-pick-pop'); }

    function pickPopEnsure() {
        var pop = findPickPop();
        if (pop) return pop;
        pop = document.createElement('div');
        pop.className = 'find-pick-pop';
        pop.id = 'find-pick-pop';
        pop.style.display = 'none';
        pop.innerHTML =
            '<div class="find-pick-pop-head">'
            + '<span class="find-pick-pop-title" id="find-pick-pop-title"></span>'
            + '<button type="button" class="find-pick-pop-tool" id="find-pick-pop-all">' + i18nText('全选') + '</button>'
            + '<button type="button" class="find-pick-pop-tool" id="find-pick-pop-clear">' + i18nText('清除') + '</button>'
            + '<button type="button" class="find-pick-pop-close" id="find-pick-pop-close">&times;</button>'
            + '</div>'
            + '<div class="find-pick-pop-grid" id="find-pick-pop-grid"></div>';
        document.body.appendChild(pop);
        pop.querySelector('#find-pick-pop-close').addEventListener('click', function (e) {
            e.stopPropagation();
            closeFindPickPop();
        });
        pop.querySelector('#find-pick-pop-all').addEventListener('click', function (e) {
            e.stopPropagation();
            if (pickCfg && pickCfg.multi) { pickCfg.onSetValues(pickCfg.allValues()); refreshFindPickPop(); }
        });
        pop.querySelector('#find-pick-pop-clear').addEventListener('click', function (e) {
            e.stopPropagation();
            if (pickCfg && pickCfg.multi) { pickCfg.onSetValues([]); refreshFindPickPop(); }
        });
        return pop;
    }

    function closeFindPickPop() {
        var pop = findPickPop();
        if (pop) pop.style.display = 'none';
        pickCfg = null;
        pickAnchor = null;
    }

    // 依据当前选中集刷新条目高亮 + 外部摘要 (单选的「不限/不变」空项以 data-v="none" 标记)
    function refreshFindPickPop() {
        if (!pickCfg) return;
        var pop = findPickPop();
        var cells = pop ? pop.querySelectorAll('.find-pick-cell') : [];
        var cur = pickCfg.curValues();
        for (var i = 0; i < cells.length; i++) {
            var raw = cells[i].getAttribute('data-v');
            var on = raw === 'none' ? cur.length === 0 : cur.indexOf(parseInt(raw, 10)) >= 0;
            cells[i].classList.toggle('active', on);
        }
        if (pickCfg.onChanged) pickCfg.onChanged();
    }

    function positionFindPickPop(anchor, pop) {
        var r = anchor.getBoundingClientRect();
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
        var top = r.bottom + 6;
        if (top + ph > window.innerHeight - 8) {
            var up = r.top - ph - 6;
            top = up >= 8 ? up : Math.max(8, window.innerHeight - ph - 8);
        }
        pop.style.left = Math.round(left) + 'px';
        pop.style.top = Math.round(top) + 'px';
    }

    function openFindPickPop(anchor, cfg) {
        if (!anchor) return;
        var pop = pickPopEnsure();
        // 同一按钮再次点击 = 收起
        if (pickAnchor === anchor && pop.style.display !== 'none') { closeFindPickPop(); return; }
        pickCfg = cfg;
        pickAnchor = anchor;
        var isMulti = !!cfg.multi;
        pop.querySelector('#find-pick-pop-title').textContent = cfg.title;
        pop.querySelector('#find-pick-pop-all').style.display = isMulti ? '' : 'none';
        pop.querySelector('#find-pick-pop-clear').style.display = isMulti ? '' : 'none';
        var grid = pop.querySelector('#find-pick-pop-grid');
        grid.className = 'find-pick-pop-grid' + (cfg.kind === 'key' ? ' is-key' : '');
        grid.innerHTML = '';
        if (cfg.emptyLabel) {
            var emptyCell = document.createElement('button');
            emptyCell.type = 'button';
            emptyCell.className = 'find-pick-cell find-pick-cell-empty';
            emptyCell.setAttribute('data-v', 'none');
            emptyCell.textContent = cfg.emptyLabel;
            emptyCell.addEventListener('click', function (e) {
                e.stopPropagation();
                cfg.onPick(null);
                refreshFindPickPop();
                setTimeout(closeFindPickPop, 0);
            });
            grid.appendChild(emptyCell);
        }
        var vals = cfg.allValues();
        for (var i = 0; i < vals.length; i++) {
            (function (v) {
                var cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'find-pick-cell';
                cell.setAttribute('data-v', String(v));
                cell.innerHTML = cfg.cellHTML(v);
                cell.title = cfg.cellTitle ? cfg.cellTitle(v) : '';
                cell.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (isMulti) cfg.onToggle(v); else cfg.onPick(v);
                    refreshFindPickPop();
                    if (!isMulti) setTimeout(closeFindPickPop, 0);
                });
                grid.appendChild(cell);
            })(vals[i]);
        }
        refreshFindPickPop();
        pop.style.display = 'flex';
        pop.style.visibility = 'hidden';
        positionFindPickPop(anchor, pop);
        pop.style.visibility = '';
    }

    // 音色筛选 (多选): 不选 = 全部
    function openFindInstPick() {
        openFindPickPop($('find-inst-btn'), {
            title: i18nText('选择音色'), kind: 'inst', multi: true,
            allValues: findInstrumentValues,
            curValues: function () { return findState.inst.slice(); },
            onSetValues: function (arr) {
                findState.inst = arr.slice().sort(function (a, b) { return a - b; });
                runFind();
            },
            onToggle: function (v) {
                var i = findState.inst.indexOf(v);
                if (i >= 0) findState.inst.splice(i, 1);
                else findState.inst.push(v);
                findState.inst.sort(function (a, b) { return a - b; });
                runFind();
            },
            onChanged: renderFindFieldSummaries,
            cellHTML: findInstCellHTML,
            cellTitle: findInstLabel
        });
    }
    // 单值音调选择 (查找条件的单个/范围端点, 以及替换为音调)
    function openFindKeyPick(kind) {
        var getVal, setVal, emptyLabel = i18nText('不限');
        if (kind === 'single') {
            getVal = function () { return findState.keySingle; };
            setVal = function (v) { findState.keySingle = v; };
        } else if (kind === 'rangeStart') {
            getVal = function () { return findState.keyRange[0]; };
            setVal = function (v) { findState.keyRange[0] = v; };
        } else if (kind === 'rangeEnd') {
            getVal = function () { return findState.keyRange[1]; };
            setVal = function (v) { findState.keyRange[1] = v; };
        } else {
            emptyLabel = i18nText('不变');
            getVal = function () { return findState.repKey; };
            setVal = function (v) { findState.repKey = v; };
        }
        openFindPickPop($(kind === 'replace' ? 'find-replace-key-btn'
            : (kind === 'single' ? 'find-key-single-btn'
                : (kind === 'rangeStart' ? 'find-key-range-start-btn' : 'find-key-range-end-btn'))), {
            title: i18nText('选择音调'), kind: 'key', multi: false, emptyLabel: emptyLabel,
            allValues: findKeyValues,
            curValues: function () { var v = getVal(); return (v === null || v === undefined) ? [] : [v]; },
            onPick: function (v) { setVal(v); renderFindFieldSummaries(); runFind(); },
            cellHTML: findKeyCellHTML,
            cellTitle: function (k) { return findKeyLabel(k) + ' (' + k + ')'; }
        });
    }
    // 替换为音色 (单选): 不选 = 不变
    function openFindReplaceInstPick() {
        openFindPickPop($('find-replace-inst-btn'), {
            title: i18nText('选择音色'), kind: 'inst', multi: false, emptyLabel: i18nText('不变'),
            allValues: findInstrumentValues,
            curValues: function () { return findState.repInst === null ? [] : [findState.repInst]; },
            onPick: function (v) { findState.repInst = v; renderFindFieldSummaries(); },
            cellHTML: findInstCellHTML,
            cellTitle: findInstLabel
        });
    }

    // 字段摘要 (按钮右侧): 过长由 CSS mask 淡出省略
    function setFindSum(id, text, isDefault) {
        var el = $(id);
        if (!el) return;
        el.textContent = text;
        el.title = text;
        el.classList.toggle('is-default', !!isDefault);
    }
    function renderFindFieldSummaries() {
        var names = findState.inst.slice().sort(function (a, b) { return a - b; }).map(findInstLabel);
        setFindSum('find-inst-sum', names.length ? names.join('、') : i18nText('全部'), !names.length);
        setFindSum('find-key-single-sum',
            findState.keySingle === null ? i18nText('不限') : findKeyLabel(findState.keySingle),
            findState.keySingle === null);
        setFindSum('find-key-range-start-sum',
            findState.keyRange[0] === null ? i18nText('不限') : findKeyLabel(findState.keyRange[0]),
            findState.keyRange[0] === null);
        setFindSum('find-key-range-end-sum',
            findState.keyRange[1] === null ? i18nText('不限') : findKeyLabel(findState.keyRange[1]),
            findState.keyRange[1] === null);
        setFindSum('find-replace-inst-sum',
            findState.repInst === null ? i18nText('不变') : findInstLabel(findState.repInst),
            findState.repInst === null);
        setFindSum('find-replace-key-sum',
            findState.repKey === null ? i18nText('不变') : findKeyLabel(findState.repKey),
            findState.repKey === null);
    }

    function buildFindPanels() {
        renderFindFieldSummaries();
    }

    function syncFindPanelUI() {
        // 键模式分段
        var keyBtns = document.querySelectorAll('.find-key-mode-seg .find-seg-btn');
        for (var i = 0; i < keyBtns.length; i++) {
            keyBtns[i].classList.toggle('active', keyBtns[i].getAttribute('data-key-mode') === findState.keyMode);
        }
        var singleWrap = $('find-key-single'), rangeWrap = $('find-key-range');
        if (singleWrap) singleWrap.style.display = findState.keyMode === 'single' ? '' : 'none';
        if (rangeWrap) rangeWrap.style.display = findState.keyMode === 'range' ? '' : 'none';
        // 音量模式分段
        var velBtns = document.querySelectorAll('.find-vel-mode-seg .find-seg-btn');
        for (var j = 0; j < velBtns.length; j++) {
            velBtns[j].classList.toggle('active', velBtns[j].getAttribute('data-vel-mode') === findState.velMode);
        }
        var velSingle = $('find-vel-single'), velRange = $('find-vel-range');
        if (velSingle) velSingle.style.display = findState.velMode === 'single' ? '' : 'none';
        if (velRange) velRange.style.display = findState.velMode === 'range' ? '' : 'none';
        var velMinEl = $('find-vel-min'), velMaxEl = $('find-vel-max'), velEqEl = $('find-vel-eq');
        if (velMinEl) velMinEl.value = findState.velMin;
        if (velMaxEl) velMaxEl.value = findState.velMax;
        if (velEqEl) velEqEl.value = (findState.velSingle === null || findState.velSingle === undefined) ? '' : findState.velSingle;
        // 音色/音调字段摘要 (选择按钮右侧)
        renderFindFieldSummaries();
        // 查找/替换模式
        var modeBtns = document.querySelectorAll('.find-modes .find-mode');
        for (var m = 0; m < modeBtns.length; m++) {
            modeBtns[m].classList.toggle('active', modeBtns[m].getAttribute('data-find-mode') === findState.mode);
        }
        var repArea = $('find-replace-area');
        if (repArea) repArea.style.display = findState.mode === 'replace' ? '' : 'none';
        // 当前高亮展示
        var countEl = $('find-result-count');
        if (countEl) {
            countEl.textContent = findState.results.length > 0 ? ((findState.index + 1) + '/' + findState.results.length) : '0/0';
        }
        var prevBtn = $('find-prev'), nextBtn = $('find-next');
        var hasNav = findState.results.length > 1;
        if (prevBtn) prevBtn.disabled = !hasNav;
        if (nextBtn) nextBtn.disabled = !hasNav;
    }

    function openFindPanel() {
        var panel = $('find-panel');
        if (!panel) return;
        buildFindPanels();
        syncFindPanelUI();
        runFind();
        panel.style.display = 'flex';
        panel.setAttribute('aria-hidden', 'false');
    }

    function closeFindPanel() {
        var panel = $('find-panel');
        closeFindPickPop();
        if (!panel) return;
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
        if (state.pianoRoll) state.pianoRoll.setFindHighlight(null);
    }

    function runFind() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var results = [];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (findState.inst.length > 0 && findState.inst.indexOf(n.instrument) < 0) continue;
            if (findState.keyMode === 'single') {
                if (findState.keySingle !== null && n.key !== findState.keySingle) continue;
            } else if (findState.keyMode === 'range') {
                var ks = findState.keyRange[0], ke = findState.keyRange[1];
                if (ks !== null && n.key < ks) continue;
                if (ke !== null && n.key > ke) continue;
            }
            if (findState.velMode === 'single') {
                if (findState.velSingle !== null && n.velocity !== findState.velSingle) continue;
            } else if (findState.velMode === 'range') {
                if (n.velocity < findState.velMin || n.velocity > findState.velMax) continue;
            }
            results.push(n.id);
        }
        findState.results = results;
        findState.index = results.length > 0 ? 0 : -1;
        highlightFindResult();
        syncFindPanelUI();
    }

    function highlightFindResult() {
        if (!state.pianoRoll) return;
        var id = null;
        if (findState.index >= 0 && findState.results.length > 0) {
            id = findState.results[findState.index];
        }
        state.pianoRoll.setFindHighlight(id);
        // 查找命中时, 把选择替换为仅当前命中音符 (而非叠加在原有全选之上),
        // 让用户能直观看到"单独选中了查找到的那个音符"
        if (id !== null) {
            state.pianoRoll.selectNotes([id]);
        }
        if (id !== null) scrollToNote(id);
    }

    function scrollToNote(noteId) {
        var pr = state.pianoRoll;
        if (!pr) return;
        var notes = pr.getNotes();
        var note = null;
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === noteId) { note = notes[i]; break; }
        }
        if (!note || !pr._tickToScreen || !pr._layerToScreen) return;
        var pw = pr._currentPanelWidth, th = pr._cfg.timelineHeight;
        var cellW = pr._cfg.cellW * pr._zoomX(), cellH = pr._cfg.cellH * pr._zoomY();
        var cw = pr.displayWidth, ch = pr.displayHeight;
        var sx = pr._tickToScreen(note.tick);
        var sy = pr._layerToScreen(note.layer);
        var need = false;
        if (sx + cellW > cw) {
            pr.scrollX = Math.max(0, note.tick * cellW - (cw - pw) + cellW);
            need = true;
        } else if (sx < pw) {
            pr.scrollX = Math.max(0, note.tick * cellW);
            need = true;
        }
        if (sy + cellH > ch) {
            pr.scrollY = Math.max(0, note.layer * cellH - (ch - th) + cellH);
            need = true;
        } else if (sy < th) {
            pr.scrollY = Math.max(0, note.layer * cellH);
            need = true;
        }
        if (need) {
            pr._fullRedrawNeeded = true;
            pr.requestRender();
        }
    }

    function findGo(delta) {
        if (findState.results.length === 0) return;
        findState.index = (findState.index + delta + findState.results.length) % findState.results.length;
        highlightFindResult();
        syncFindPanelUI();
    }

    function findSelectAll() {
        if (!state.pianoRoll || findState.results.length === 0) return;
        state.pianoRoll.selectNotes(findState.results.slice());
    }

    function getReplaceValues() {
        var vals = {};
        if (findState.repInst !== null) vals.instrument = findState.repInst;
        if (findState.repKey !== null) vals.key = findState.repKey;
        var velInput = $('find-replace-velocity');
        if (velInput && velInput.value !== '') {
            var v = parseInt(velInput.value, 10);
            if (!isNaN(v)) vals.velocity = clampNum(v, 1, 100, 100);
        }
        return vals;
    }

    function applyReplaceToNote(note) {
        if (!note) return false;
        var vals = getReplaceValues();
        if (Object.keys(vals).length === 0) return false;
        var changed = false;
        for (var k in vals) {
            if (note[k] !== vals[k]) { note[k] = vals[k]; changed = true; }
        }
        return changed;
    }

    function syncAfterReplace() {
        state.pianoRoll._fullRedrawNeeded = true;
        state.pianoRoll.render();
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        updateProgressUI();
        markDirty();
    }

    function findReplaceCurrent() {
        if (!state.pianoRoll || findState.index < 0 || findState.results.length === 0) return;
        pushUndo();
        var id = findState.results[findState.index];
        var notes = state.pianoRoll.getNotes();
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === id) { applyReplaceToNote(notes[i]); break; }
        }
        syncAfterReplace();
        runFind();
    }

    function findReplaceAll() {
        if (!state.pianoRoll || findState.results.length === 0) return;
        if (Object.keys(getReplaceValues()).length === 0) return;
        pushUndo();
        var ids = {};
        for (var i = 0; i < findState.results.length; i++) ids[findState.results[i]] = true;
        var notes = state.pianoRoll.getNotes();
        var applied = 0;
        for (var j = 0; j < notes.length; j++) {
            if (ids[notes[j].id]) {
                if (applyReplaceToNote(notes[j])) applied++;
            }
        }
        if (applied > 0) syncAfterReplace();
        runFind();
    }

    function initFindPanel() {
        var closeBtn = $('find-panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeFindPanel();
            });
        }
        // 查找/替换模式
        var modeBtns = document.querySelectorAll('.find-modes .find-mode');
        for (var i = 0; i < modeBtns.length; i++) {
            modeBtns[i].addEventListener('click', function(e) {
                e.stopPropagation();
                findState.mode = this.getAttribute('data-find-mode') === 'replace' ? 'replace' : 'find';
                syncFindPanelUI();
            });
        }
        // 键模式
        var keyBtns = document.querySelectorAll('.find-key-mode-seg .find-seg-btn');
        for (var j = 0; j < keyBtns.length; j++) {
            keyBtns[j].addEventListener('click', function(e) {
                e.stopPropagation();
                findState.keyMode = this.getAttribute('data-key-mode') || 'single';
                syncFindPanelUI();
                runFind();
            });
        }
        // 音量模式
        var velBtns = document.querySelectorAll('.find-vel-mode-seg .find-seg-btn');
        for (var v = 0; v < velBtns.length; v++) {
            velBtns[v].addEventListener('click', function(e) {
                e.stopPropagation();
                findState.velMode = this.getAttribute('data-vel-mode') || 'single';
                syncFindPanelUI();
                runFind();
            });
        }
        // 音色 / 音调 悬浮选择器入口
        var instBtn = $('find-inst-btn');
        if (instBtn) instBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindInstPick(); });
        var keySingleBtn = $('find-key-single-btn');
        if (keySingleBtn) keySingleBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindKeyPick('single'); });
        var keyRangeStartBtn = $('find-key-range-start-btn');
        if (keyRangeStartBtn) keyRangeStartBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindKeyPick('rangeStart'); });
        var keyRangeEndBtn = $('find-key-range-end-btn');
        if (keyRangeEndBtn) keyRangeEndBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindKeyPick('rangeEnd'); });
        var repInstBtn = $('find-replace-inst-btn');
        if (repInstBtn) repInstBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindReplaceInstPick(); });
        var repKeyBtn = $('find-replace-key-btn');
        if (repKeyBtn) repKeyBtn.addEventListener('click', function(e) { e.stopPropagation(); openFindKeyPick('replace'); });
        // 点击悬浮窗与触发按钮以外的区域 / ESC → 收起悬浮窗
        document.addEventListener('mousedown', function(e) {
            var pop = findPickPop();
            if (!pop || pop.style.display === 'none') return;
            if (pop.contains(e.target)) return;
            if (pickAnchor && pickAnchor.contains(e.target)) return;
            closeFindPickPop();
        }, true);
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            var pop = findPickPop();
            if (pop && pop.style.display !== 'none') { e.stopPropagation(); closeFindPickPop(); }
        }, true);
        // 音量单个数值
        var velEq = $('find-vel-eq');
        if (velEq) velEq.addEventListener('change', function() {
            var v = parseInt(this.value, 10);
            if (isNaN(v)) { findState.velSingle = null; }
            else { findState.velSingle = Math.max(0, Math.min(100, v)); this.value = findState.velSingle; }
            runFind();
        });
        // 音量范围
        ['find-vel-min', 'find-vel-max'].forEach(function(id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener('change', function() {
                var v = parseInt(el.value, 10);
                if (isNaN(v)) v = 0;
                v = Math.max(0, Math.min(100, v));
                el.value = v;
                if (id === 'find-vel-min') {
                    findState.velMin = v;
                    if (findState.velMax < v) { findState.velMax = v; var mx = $('find-vel-max'); if (mx) mx.value = v; }
                } else {
                    findState.velMax = v;
                    if (findState.velMin > v) { findState.velMin = v; var mn = $('find-vel-min'); if (mn) mn.value = v; }
                }
                runFind();
            });
        });
        // 全选/清除音色已移入悬浮窗内 (多选模式)
        // 重置 / 清空条件
        var resetBtn = $('find-reset');
        if (resetBtn) resetBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            findState.inst.length = 0;
            findState.keyMode = 'single';
            findState.keySingle = null;
            findState.keyRange = [null, null];
            findState.velMode = 'single';
            findState.velSingle = null;
            findState.velMin = 0; findState.velMax = 100;
            buildFindPanels();
            syncFindPanelUI();
            runFind();
        });
        var clearBtn = $('find-clear-all');
        if (clearBtn) clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            findState.inst.length = 0;
            findState.keySingle = null;
            findState.keyRange = [null, null];
            findState.velSingle = null;
            findState.velMin = 0; findState.velMax = 100;
            buildFindPanels();
            syncFindPanelUI();
            runFind();
        });
        // 导航
        var prevBtn = $('find-prev');
        if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); findGo(-1); });
        var nextBtn = $('find-next');
        if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); findGo(1); });
        var selAll = $('find-select-all');
        if (selAll) selAll.addEventListener('click', function(e) { e.stopPropagation(); findSelectAll(); });
        // 替换
        var repCurrent = $('find-replace-current');
        if (repCurrent) repCurrent.addEventListener('click', function(e) { e.stopPropagation(); findReplaceCurrent(); });
        var repAll = $('find-replace-all');
        if (repAll) repAll.addEventListener('click', function(e) { e.stopPropagation(); findReplaceAll(); });
        initFindDrag();
    }

    // 面板拖拽 (标题栏已有 cursor:move 提示, 此处补齐实际拖动行为; 拖动时收起悬浮窗)
    function initFindDrag() {
        var header = $('find-panel-header');
        var panel = $('find-panel');
        if (!header || !panel) return;
        function isCloseTarget(t) {
            return t && (t.id === 'find-panel-close' || (t.closest && t.closest('.find-panel-close')));
        }
        function begin(clientX, clientY) {
            closeFindPickPop();
            var r = panel.getBoundingClientRect();
            // 从 right 定位切换到 left 定位, 避免拖动时跳变
            panel.style.left = Math.round(r.left) + 'px';
            panel.style.top = Math.round(r.top) + 'px';
            panel.style.right = 'auto';
            var startX = clientX, startY = clientY;
            var origX = r.left, origY = r.top;
            return function(mx, my) {
                var maxX = window.innerWidth - panel.offsetWidth - 4;
                var maxY = window.innerHeight - 40;
                panel.style.left = Math.max(4, Math.min(maxX, origX + mx - startX)) + 'px';
                panel.style.top = Math.max(4, Math.min(maxY, origY + my - startY)) + 'px';
            };
        }
        header.addEventListener('mousedown', function(e) {
            if (isCloseTarget(e.target)) return;
            e.preventDefault();
            var move = begin(e.clientX, e.clientY);
            function onMove(ev) { move(ev.clientX, ev.clientY); }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        header.addEventListener('touchstart', function(e) {
            if (isCloseTarget(e.target)) return;
            var t = e.touches[0];
            if (!t) return;
            e.preventDefault();
            var move = begin(t.clientX, t.clientY);
            function onMove(ev) { var mt = ev.touches[0]; if (mt) move(mt.clientX, mt.clientY); }
            function onUp() {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
            }
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onUp);
        });
    }

    // ---- 导出 ----
    N.findState = findState;
    N.FIND_MAX_KEYS = FIND_MAX_KEYS;
    N.findKeyLabel = findKeyLabel;
    N.findPanelVisible = findPanelVisible;
    N.findInstLabel = findInstLabel;
    N.findInstCustomColor = findInstCustomColor;
    N.findInstrumentValues = findInstrumentValues;
    N.findKeyValues = findKeyValues;
    N.findInstCellHTML = findInstCellHTML;
    N.findKeyCellHTML = findKeyCellHTML;
    N.pickCfg = pickCfg;
    N.findPickPop = findPickPop;
    N.pickPopEnsure = pickPopEnsure;
    N.closeFindPickPop = closeFindPickPop;
    N.refreshFindPickPop = refreshFindPickPop;
    N.positionFindPickPop = positionFindPickPop;
    N.openFindPickPop = openFindPickPop;
    N.openFindInstPick = openFindInstPick;
    N.openFindKeyPick = openFindKeyPick;
    N.openFindReplaceInstPick = openFindReplaceInstPick;
    N.setFindSum = setFindSum;
    N.renderFindFieldSummaries = renderFindFieldSummaries;
    N.buildFindPanels = buildFindPanels;
    N.syncFindPanelUI = syncFindPanelUI;
    N.openFindPanel = openFindPanel;
    N.closeFindPanel = closeFindPanel;
    N.runFind = runFind;
    N.highlightFindResult = highlightFindResult;
    N.scrollToNote = scrollToNote;
    N.findGo = findGo;
    N.findSelectAll = findSelectAll;
    N.getReplaceValues = getReplaceValues;
    N.applyReplaceToNote = applyReplaceToNote;
    N.syncAfterReplace = syncAfterReplace;
    N.findReplaceCurrent = findReplaceCurrent;
    N.findReplaceAll = findReplaceAll;
    N.initFindPanel = initFindPanel;
    N.initFindDrag = initFindDrag;
})(window.WebNBS);
