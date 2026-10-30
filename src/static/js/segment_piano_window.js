/**
 * 片段浮动钢琴卷帘窗口 (Segment Piano Window)
 * FL Studio 风格的浮动窗口, 每条片段轨道一个窗口:
 *   - 可拖动 / 缩放 / 最小化 / 最大化, 位置按轨道持久化
 *   - Y 轴音高, X 轴时间; 自动识别 NBS 延音为长音符
 *   - 重叠音符叠层显示, 默认只操作最上层, Alt+滚轮临时切换
 *   - 绘制 / 删除 / 移动 / 拖边改长度 / 框选 / 复制粘贴 / 网格吸附 / 力度
 *   - 播放同步主播放头, 可切换为仅播放本窗口内容
 *   - 可显示同轨其他片段为半透明参考
 * 依赖 main.js 暴露的 window.WebNBS.host
 */
(function() {
    'use strict';

    var STORE_KEY = 'segment_windows_v1';
    var BASE_Z = 900;            // 高于片段工具栏(30), 低于系统弹窗(9996+)
    var MIN_W = 440, MIN_H = 280;
    var MINI_W = 232, MINI_H = 30;
    var TITLE_H = 34;
    var RULER_H = 22;
    var KEYBAR_W = 46;
    var VEL_H = 58;
    var ROW_H = 15;
    var GRID_LEVELS = [1, 8, 16];
    var GRID_LABELS = { 1: '1 tick', 8: '1/2 小节', 16: '1 小节' };

    // 与 piano_roll.js 的 INSTRUMENT_COLORS 保持一致的音色色板
    var INSTRUMENT_COLORS = [
        '#F5E6B8', '#8B4513', '#808080', '#D2B48C', '#DFDFDF', '#8B4513',
        '#87CEEB', '#FFD700', '#B0E0E6', '#C19A6B', '#D3D3D3', '#DAA520',
        '#9370DB', '#00FF00', '#DEB887', '#FFFF99', '#C46B3D', '#8B6F47',
        '#5C8B5C', '#3D7A6B'
    ];
    var PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    function host() { return (window.WebNBS && window.WebNBS.host) || null; }
    function t(text) {
        return window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate(text) : text;
    }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function pitchName(key) {
        var midi = key + 21;
        var name = PITCH_NAMES[midi % 12];
        var oct = Math.floor(midi / 12) - 1;
        return name + oct;
    }
    function colorFor(instrument) {
        var idx = isFinite(instrument) ? Math.floor(instrument) : 0;
        if (idx < 0) idx = 0;
        return INSTRUMENT_COLORS[idx % INSTRUMENT_COLORS.length];
    }
    function isBlackKey(key) {
        var n = PITCH_NAMES[(key + 21) % 12];
        return n.charAt(1) === '#';
    }

    // ============================================================
    // 窗口管理器
    // ============================================================
    var wins = [];        // SegmentWindow[]
    var zSeq = 0;
    var lastFocused = null;
    var layoutCache = null;

    function loadLayout() {
        if (layoutCache) return layoutCache;
        layoutCache = {};
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (raw) layoutCache = JSON.parse(raw) || {};
        } catch (e) { layoutCache = {}; }
        return layoutCache;
    }
    function saveLayout() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(loadLayout())); } catch (e) {}
    }
    function laneKey(lane) {
        if (!lane) return '0';
        return String(lane.id !== undefined ? lane.id : 0);
    }

    function open(seg) {
        var h = host();
        if (!h || !seg) return;
        var lanes = h.state.segmentLanes || [];
        var lane = lanes[seg.lane];
        if (!lane) return;
        var found = null;
        for (var i = 0; i < wins.length; i++) {
            if (wins[i].lane === lane) { found = wins[i]; break; }
        }
        if (found) {
            found.setSegment(seg);
            found.restoreFromMinimized();
            found.focus();
            return found;
        }
        var win = new SegmentWindow(lane, seg);
        wins.push(win);
        win.build();
        win.focus();
        return win;
    }

    function closeAll() {
        while (wins.length) {
            var w = wins.pop();
            if (w) w.destroy();
        }
    }

    function refreshAll() {
        for (var i = wins.length - 1; i >= 0; i--) {
            if (!wins[i]) continue;
            wins[i].resync();
            wins[i].refresh();
        }
    }

    function findLaneWin(laneId) {
        for (var i = 0; i < wins.length; i++) {
            if (String(wins[i].lane.id) === String(laneId)) return wins[i];
        }
        return null;
    }

    function removeWin(win) {
        for (var i = 0; i < wins.length; i++) {
            if (wins[i] === win) { wins.splice(i, 1); break; }
        }
        if (lastFocused === win) lastFocused = null;
    }

    function onLanguageChange() {
        for (var i = 0; i < wins.length; i++) wins[i].syncTexts();
        refreshAll();
    }
    document.addEventListener('webnbs:languagechange', onLanguageChange);

    // ============================================================
    // 单个窗口
    // ============================================================
    function SegmentWindow(lane, seg) {
        this.lane = lane;
        this.seg = seg;
        this.refSegId = null;
        this.pxPerTick = 8;
        this.viewStart = 0;
        this.rowH = ROW_H;
        this.maximized = false;
        this.minimized = false;
        this.prevRect = null;
        this.manualMiniPos = null;
        this.tool = 'draw';
        this.grid = 1;
        this.playMode = 'sync';
        this.dragging = null;
        this.selection = [];
        this.clipboard = null;
        this.tempTop = null;       // { key, startTick, idx }
        this.tempTopTimer = null;
        this.currentInstrument = 0;
        this.defaultVelocity = 100;
        this.z = 0;
        this.rafId = 0;
        this.localPlaying = false;
        this.localStart = 0;
        this.localBase = 0;
        this.localTick = 0;
        this.needLayout = true;
        this._hover = null;
        // 重叠图标叠层动画: 记录每组上次的重叠数量与过渡起点
        this._iconCount = {};
        this._iconFrom = {};
        this._iconUsed = {};
    }

    SegmentWindow.prototype.build = function() {
        var self = this;
        var rest = loadLayout()[laneKey(this.lane)] || {};
        var vw = window.innerWidth, vh = window.innerHeight;
        var w = clamp(rest.w || 860, MIN_W, vw);
        var hgt = clamp(rest.h || 480, MIN_H, vh);
        var x = isFinite(rest.x) ? rest.x : Math.round((vw - w) / 2);
        var y = isFinite(rest.y) ? rest.y : Math.round((vh - hgt) / 2) - 40;
        x = clamp(x, 0, Math.max(0, vw - 120));
        y = clamp(y, 0, Math.max(0, vh - TITLE_H));
        this.rect = { x: x, y: y, w: w, h: hgt };
        this.maximized = !!rest.max;
        this.minimized = !!rest.min;

        var root = document.createElement('div');
        root.className = 'spw';
        root.setAttribute('data-role', 'segment-piano-window');
        root.setAttribute('tabindex', '-1');
        root.innerHTML =
            '<div class="spw-titlebar" data-role="titlebar">' +
                '<span class="spw-glyph"><i class="fa-solid fa-piano-keyboard"></i></span>' +
                '<span class="spw-title" data-role="title"></span>' +
                '<span class="spw-sub" data-role="subtitle"></span>' +
                '<span class="spw-actions">' +
                    '<button class="spw-btn" data-act="minimize" title="最小化"><i class="fa-solid fa-minus"></i></button>' +
                    '<button class="spw-btn" data-act="maximize" title="最大化"><i class="fa-solid fa-square"></i></button>' +
                    '<button class="spw-btn spw-close" data-act="close" title="关闭"><i class="fa-solid fa-xmark"></i></button>' +
                '</span>' +
            '</div>' +
            '<div class="spw-body" data-role="body">' +
                '<div class="spw-toolbar">' +
                    '<button class="spw-switch" data-act="playmode" title="播放模式">' +
                        '<span class="spw-switch-dot"></span><span data-role="playmode-label"></span>' +
                    '</button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn" data-act="tool-draw" data-tool="draw" title="画笔 (B)"><i class="fa-solid fa-pencil"></i></button>' +
                    '<button class="spw-btn" data-act="tool-erase" data-tool="erase" title="橡皮擦 (E)"><i class="fa-solid fa-eraser"></i></button>' +
                    '<button class="spw-btn" data-act="tool-select" data-tool="select" title="选择 (S)"><i class="fa-solid fa-arrow-pointer"></i></button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn spw-grid" data-act="grid" title="网格吸附"><span data-role="grid-label"></span></button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn spw-ref" data-act="reference" title="参考片段"><i class="fa-solid fa-layer-group"></i><span data-role="ref-label"></span></button>' +
                    '<span class="spw-spacer"></span>' +
                    '<span class="spw-hint" data-role="hint"></span>' +
                '</div>' +
                '<div class="spw-stage" data-role="stage"><canvas data-role="canvas"></canvas></div>' +
                '<div class="spw-vel" data-role="vel"><canvas data-role="velcanvas"></canvas></div>' +
            '</div>' +
            '<div class="spw-resize spw-rz-n" data-rz="n"></div>' +
            '<div class="spw-resize spw-rz-s" data-rz="s"></div>' +
            '<div class="spw-resize spw-rz-e" data-rz="e"></div>' +
            '<div class="spw-resize spw-rz-w" data-rz="w"></div>' +
            '<div class="spw-resize spw-rz-ne" data-rz="ne"></div>' +
            '<div class="spw-resize spw-rz-nw" data-rz="nw"></div>' +
            '<div class="spw-resize spw-rz-se" data-rz="se"></div>' +
            '<div class="spw-resize spw-rz-sw" data-rz="sw"></div>';
        document.body.appendChild(root);
        this.root = root;
        this.titleEl = root.querySelector('[data-role="title"]');
        this.subtitleEl = root.querySelector('[data-role="subtitle"]');
        this.bodyEl = root.querySelector('[data-role="body"]');
        this.stageEl = root.querySelector('[data-role="stage"]');
        this.canvas = root.querySelector('[data-role="canvas"]');
        this.ctx = this.canvas.getContext('2d');
        this.velCanvas = root.querySelector('[data-role="velcanvas"]');
        this.velCtx = this.velCanvas.getContext('2d');
        this.playModeLabel = root.querySelector('[data-role="playmode-label"]');
        this.gridLabel = root.querySelector('[data-role="grid-label"]');
        this.refLabel = root.querySelector('[data-role="ref-label"]');

        this.bind();
        this.syncTexts();
        this.applyRect();
        this.applyMinimized();
        this.autoFit();
        this.startLoop();
        if (this.minimized) this.restoreMiniStackPos();
        // 插入 DOM 后才有实际尺寸, 下一帧再做自适应
        requestAnimationFrame(function() { if (self.root) self.autoFit(); });
    };

    SegmentWindow.prototype.syncTexts = function() {
        if (!this.root) return;
        var lane = this.lane;
        var laneName = (lane && lane.name) ? lane.name : t('片段轨道') + ' ' + (lane && lane.id ? lane.id : '');
        this.titleEl.textContent = laneName;
        this.subtitleEl.textContent = (this.seg && this.seg.name) ? this.seg.name : '';
        this.playModeLabel.textContent = this.playMode === 'sync' ? t('同步主窗口') : t('仅本窗口');
        this.gridLabel.textContent = t(GRID_LABELS[this.grid]);
        this.refLabel.textContent = this.refSegId ? t('参考中') : t('参考片段');
        var hintEl = this.root.querySelector('[data-role="hint"]');
        if (hintEl) hintEl.textContent = t('Alt + 滚轮切换重叠音符');
        // 标题栏按钮的提示由全局 tooltip/i18n 系统处理 (title -> data-tip),
        // 这里不再写入 title, 避免出现原生提示与自定义提示重复
        this.updateToolButtons();
    };

    SegmentWindow.prototype.updateToolButtons = function() {
        if (!this.root) return;
        var btns = this.root.querySelectorAll('[data-tool]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === this.tool);
        }
        var pm = this.root.querySelector('[data-act="playmode"]');
        if (pm) pm.classList.toggle('on', this.playMode === 'sync');
    };

    SegmentWindow.prototype.bind = function() {
        var self = this;
        var tbar = this.root.querySelector('[data-role="titlebar"]');

        tbar.addEventListener('mousedown', function(e) {
            if (e.target.closest('button')) return;
            self.focus();
            self.beginWindowDrag(e);
        });
        tbar.addEventListener('dblclick', function(e) {
            if (e.target.closest('button')) return;
            self.toggleMaximize();
        });

        this.root.addEventListener('mousedown', function() { self.focus(); }, true);

        this.root.addEventListener('click', function(e) {
            var btn = e.target.closest ? e.target.closest('button') : null;
            if (!btn) return;
            var act = btn.getAttribute('data-act');
            if (act === 'close') self.close();
            else if (act === 'minimize') self.toggleMinimize();
            else if (act === 'maximize') self.toggleMaximize();
            else if (act === 'playmode') self.togglePlayMode();
            else if (act === 'grid') self.cycleGrid();
            else if (act === 'reference') self.pickReference();
            else if (act === 'tool-draw') self.setTool('draw');
            else if (act === 'tool-erase') self.setTool('erase');
            else if (act === 'tool-select') self.setTool('select');
        });

        var handles = this.root.querySelectorAll('[data-rz]');
        for (var i = 0; i < handles.length; i++) {
            handles[i].addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.focus();
                self.beginResize(e, this.getAttribute('data-rz'));
            });
        }

        this.canvas.addEventListener('mousedown', function(e) { self.onCanvasDown(e); });
        this.canvas.addEventListener('mousemove', function(e) { self.onCanvasMove(e); });
        this.canvas.addEventListener('dblclick', function(e) { self.onCanvasDblClick(e); });
        this.canvas.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            self.onCanvasRightClick(e);
        });
        this.canvas.addEventListener('wheel', function(e) { self.onWheel(e); }, { passive: false });
        this.canvas.addEventListener('mouseleave', function() {
            self._hover = null;
            self.scheduleTempTopReset(0);
        });
        this.velCanvas.addEventListener('mousedown', function(e) { self.onVelDown(e); });

        this.root.addEventListener('keydown', function(e) { self.onKey(e); });
    };

    // ---------- 窗口位置 / 尺寸 ----------
    SegmentWindow.prototype.applyRect = function() {
        if (!this.root) return;
        var r = this.rect;
        this.root.style.left = r.x + 'px';
        this.root.style.top = r.y + 'px';
        this.root.style.width = r.w + 'px';
        this.root.style.height = r.h + 'px';
        this.needLayout = true;
    };

    SegmentWindow.prototype.persist = function() {
        var store = loadLayout();
        store[laneKey(this.lane)] = {
            x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h,
            max: this.maximized, min: this.minimized
        };
        saveLayout();
    };

    SegmentWindow.prototype.focus = function() {
        this.z = BASE_Z + (++zSeq);
        if (this.z > 9990) { zSeq = 0; this.z = BASE_Z + (++zSeq); }
        this.root.style.zIndex = String(this.z);
        // 让窗口可接收键盘快捷键 (Ctrl+Z / Delete 等)
        try { this.root.focus({ preventScroll: true }); } catch (e) {}
        lastFocused = this;
    };

    SegmentWindow.prototype.beginWindowDrag = function(ev) {
        var self = this;
        var startX = ev.clientX, startY = ev.clientY;
        var base = { x: this.rect.x, y: this.rect.y };
        if (this.minimized) {
            this.manualMiniPos = true;
        }
        function move(e) {
            var nx = base.x + (e.clientX - startX);
            var ny = base.y + (e.clientY - startY);
            var maxX = window.innerWidth - 100;
            var maxY = window.innerHeight - (self.minimized ? MINI_H : TITLE_H);
            self.rect.x = clamp(nx, -self.rect.w + 120, maxX);
            self.rect.y = clamp(ny, 0, Math.max(0, maxY));
            self.applyRect();
        }
        function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            self.persist();
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    };

    SegmentWindow.prototype.beginResize = function(ev, dir) {
        if (this.maximized || this.minimized) return;
        var self = this;
        var startX = ev.clientX, startY = ev.clientY;
        var base = { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h };
        function move(e) {
            var dx = e.clientX - startX, dy = e.clientY - startY;
            var r = { x: base.x, y: base.y, w: base.w, h: base.h };
            if (dir.indexOf('e') >= 0) r.w = Math.max(MIN_W, base.w + dx);
            if (dir.indexOf('s') >= 0) r.h = Math.max(MIN_H, base.h + dy);
            if (dir.indexOf('w') >= 0) {
                var nw = Math.max(MIN_W, base.w - dx);
                r.x = base.x + (base.w - nw);
                r.w = nw;
            }
            if (dir.indexOf('n') >= 0) {
                var nh = Math.max(MIN_H, base.h - dy);
                r.y = base.y + (base.h - nh);
                r.h = nh;
            }
            self.rect = r;
            self.applyRect();
        }
        function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            self.persist();
            self.autoFit();
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    };

    SegmentWindow.prototype.toggleMaximize = function() {
        if (this.minimized) this.restoreFromMinimized();
        if (!this.maximized) {
            this.prevRect = { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h };
            this.rect = {
                x: 8, y: 36,
                w: Math.max(MIN_W, window.innerWidth - 16),
                h: Math.max(MIN_H, window.innerHeight - 76)
            };
            this.maximized = true;
        } else {
            if (this.prevRect) this.rect = this.prevRect;
            this.maximized = false;
        }
        this.root.classList.toggle('spw-max', this.maximized);
        this.applyRect();
        this.autoFit();
        this.persist();
    };

    SegmentWindow.prototype.toggleMinimize = function() {
        if (this.minimized) { this.restoreFromMinimized(); return; }
        this.prevRect = { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h };
        this.minimized = true;
        this.manualMiniPos = false;
        this.root.classList.add('spw-min');
        this.rect = { x: 0, y: 0, w: MINI_W, h: MINI_H };
        this.restoreMiniStackPos();
        this.applyRect();
        this.persist();
    };

    SegmentWindow.prototype.restoreMiniStackPos = function() {
        var vw = window.innerWidth;
        var slot = 0;
        for (var i = 0; i < wins.length; i++) {
            var o = wins[i];
            if (o !== this && o.minimized && !o.manualMiniPos) slot++;
        }
        this.rect.x = Math.max(0, vw - MINI_W - 16);
        this.rect.y = 48 + slot * (MINI_H + 8);
    };

    SegmentWindow.prototype.defaultRect = function() {
        var vw = window.innerWidth, vh = window.innerHeight;
        var w = clamp(860, MIN_W, vw);
        var h = clamp(480, MIN_H, vh);
        return {
            x: Math.max(0, Math.round((vw - w) / 2)),
            y: Math.max(0, Math.round((vh - h) / 2) - 40),
            w: w, h: h
        };
    };

    SegmentWindow.prototype.restoreFromMinimized = function() {
        if (!this.minimized) return;
        this.minimized = false;
        this.root.classList.remove('spw-min');
        // 页面刷新后 prevRect 丢失, 回退到默认居中尺寸
        this.rect = this.prevRect || this.defaultRect();
        this.prevRect = null;
        this.applyRect();
        this.autoFit();
        this.persist();
    };

    SegmentWindow.prototype.applyMinimized = function() {
        this.root.classList.toggle('spw-min', this.minimized);
        if (this.minimized) {
            if (this.rect.w !== MINI_W) {
                this.rect = { x: this.rect.x, y: this.rect.y, w: MINI_W, h: MINI_H };
            }
            if (!isFinite(this.rect.x) || this.rect.x === 0) this.restoreMiniStackPos();
        }
    };

    SegmentWindow.prototype.close = function() {
        this.stopLoop();
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        removeWin(this);
    };

    SegmentWindow.prototype.destroy = function() { this.close(); };

    // ---------- 片段切换 ----------
    SegmentWindow.prototype.setSegment = function(seg) {
        if (!seg) return;
        this.seg = seg;
        this.segId = seg.id;
        this.selection = [];
        this.tempTop = null;
        // 沿用片段内已有音色作为画笔默认音色
        if (seg.notes && seg.notes.length && isFinite(seg.notes[0].instrument)) {
            this.currentInstrument = seg.notes[0].instrument;
        }
        if (this.minimized) this.restoreFromMinimized();
        this.syncTexts();
        this.autoFit();
        this.refresh();
    };

    // 撤销/重做会替换 state.segments / segmentLanes 对象, 窗口需重新绑定引用
    SegmentWindow.prototype.resync = function() {
        var h = host();
        if (!h || !this.root || !this.seg) return;
        var lanes = h.state.segmentLanes || [];
        var lane = null;
        for (var i = 0; i < lanes.length; i++) {
            if (String(lanes[i].id) === String(this.lane.id)) { lane = lanes[i]; break; }
        }
        if (!lane) { this.close(); return; }
        this.lane = lane;
        var laneIdx = lanes.indexOf(lane);
        var segs = h.state.segments || [];
        var target = null;
        for (var j = 0; j < segs.length; j++) {
            if (String(segs[j].id) === String(this.segId)) { target = segs[j]; break; }
        }
        if (!target) {
            for (var k = 0; k < segs.length; k++) {
                if (segs[k].lane === laneIdx) { target = segs[k]; break; }
            }
        }
        if (!target) { this.close(); return; }
        this.seg = target;
        this.segId = target.id;
        this.selection = [];
        this._zMap = null;
        this.syncTexts();
    };

    // keepView: 保留当前缩放与水平滚动位置 (撤销/重做后不应重置视图)
    SegmentWindow.prototype.autoFit = function(keepView) {
        if (!this.canvas) return;
        if (!keepView) {
            var r = this.seg ? (this.seg.end - this.seg.start) : 0;
            if (r <= 0) r = 64;
            var avail = Math.max(120, this.stageEl.clientWidth - KEYBAR_W);
            var pad = 8;
            this.pxPerTick = clamp(avail / (r + pad), 0.8, 40);
            // 时间轴使用绝对 tick: 视口从片段起点略微提前开始
            this.viewStart = (this.seg ? (this.seg.start || 0) : 0) - 4;
        }
        this.fitKeyRange();
        this.resizeCanvas();
        this.refresh();
    };

    SegmentWindow.prototype.fitKeyRange = function() {
        var notes = (this.seg && this.seg.notes) || [];
        var lo = 999, hi = -999;
        for (var i = 0; i < notes.length; i++) {
            var k = notes[i].key || 0;
            if (k < lo) lo = k;
            if (k > hi) hi = k;
        }
        var ref = this.getRefSeg();
        if (ref && ref.notes) {
            for (var j = 0; j < ref.notes.length; j++) {
                var rk = ref.notes[j].key || 0;
                if (rk < lo) lo = rk;
                if (rk > hi) hi = rk;
            }
        }
        if (hi < lo) { lo = 33; hi = 57; }
        this.minKey = Math.max(0, lo - 2);
        this.maxKey = Math.min(87, hi + 2);
        this.scrollY = 0;
    };

    SegmentWindow.prototype.resizeCanvas = function() {
        if (!this.canvas || !this.stageEl) return;
        var dpr = window.devicePixelRatio || 1;
        var w = Math.max(80, this.stageEl.clientWidth);
        var h = Math.max(80, this.stageEl.clientHeight);
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cw = w;
        this.ch = h;

        var vh = Math.max(40, this.velCanvas.parentNode.clientHeight);
        var vw = Math.max(80, this.velCanvas.parentNode.clientWidth);
        this.velCanvas.width = Math.round(vw * dpr);
        this.velCanvas.height = Math.round(vh * dpr);
        this.velCanvas.style.width = vw + 'px';
        this.velCanvas.style.height = vh + 'px';
        this.velCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.vw = vw;
        this.vh = vh;
        this.needLayout = true;
    };

    // ---------- 播放 ----------
    SegmentWindow.prototype.startLoop = function() {
        var self = this;
        this.rafId = requestAnimationFrame(function tick() {
            if (!self.root) return;
            if (self.needLayout) {
                self.needLayout = false;
                self.resizeCanvas();
            }
            self.stepLocal();
            self.draw();
            self.rafId = requestAnimationFrame(tick);
        });
    };
    SegmentWindow.prototype.stopLoop = function() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        this.stopLocal();
    };

    SegmentWindow.prototype.togglePlayMode = function() {
        this.playMode = this.playMode === 'sync' ? 'local' : 'sync';
        this.stopLocal();
        this.updateToolButtons();
        this.syncTexts();
    };

    SegmentWindow.prototype.segDuration = function() {
        return this.seg ? Math.max(1, this.seg.end - this.seg.start) : 1;
    };

    SegmentWindow.prototype.startLocal = function() {
        var h = host();
        if (!h) return;
        this.localPlaying = true;
        this.localStart = performance.now();
        this.localBase = 0;
        var tempo = (h.state.tempo || 20);
        this.tickMs = 1000 / Math.max(0.01, tempo);
        var notes = (this.seg.notes || []).slice();
        notes.sort(function(a, b) { return (a.rel || 0) - (b.rel || 0); });
        this.localNotes = notes;
        this.localIndex = 0;
    };

    SegmentWindow.prototype.stopLocal = function() {
        this.localPlaying = false;
        this.localNotes = null;
        this.localIndex = 0;
    };

    SegmentWindow.prototype.stepLocal = function() {
        if (!this.localPlaying) return;
        var h = host();
        if (!h || !window.AudioEngine || !AudioEngine.playNote) return;
        var dur = this.segDuration();
        var elapsed = performance.now() - this.localStart;
        var tick = elapsed / this.tickMs;
        this.localTick = (tick % dur);
        var notes = this.localNotes || [];
        while (this.localIndex < notes.length && notes[this.localIndex].rel <= this.localTick) {
            var n = notes[this.localIndex++];
            try {
                AudioEngine.playNote(n.instrument, n.key, n.velocity, n.pan);
            } catch (e) {}
        }
        if (tick >= dur) {
            this.localStart = performance.now();
            this.localIndex = 0;
            this.localTick = 0;
        }
    };

    SegmentWindow.prototype.playheadTick = function() {
        // 时间轴统一使用绝对 tick, 局部播放需叠加片段起点
        if (this.playMode === 'local') {
            return (this.seg ? (this.seg.start || 0) : 0) + this.localTick;
        }
        var h = host();
        return h ? (h.state.currentTick || 0) : 0;
    };

    // ---------- 坐标换算 ----------
    SegmentWindow.prototype.stageRect = function() {
        return { x: KEYBAR_W, y: RULER_H, w: this.cw - KEYBAR_W, h: Math.max(40, this.ch - RULER_H) };
    };
    SegmentWindow.prototype.tickToX = function(tick) {
        return KEYBAR_W + (tick - this.viewStart) * this.pxPerTick;
    };
    SegmentWindow.prototype.xToTick = function(x) {
        return this.viewStart + (x - KEYBAR_W) / this.pxPerTick;
    };
    SegmentWindow.prototype.keyToY = function(key) {
        return RULER_H + (this.maxKey - key) * this.rowH - this.scrollY;
    };
    SegmentWindow.prototype.yToKey = function(y) {
        return Math.round(this.maxKey - (y - RULER_H + this.scrollY) / this.rowH);
    };

    // ---------- 分组 (延音合并 + 叠层) ----------
    SegmentWindow.prototype.buildGroups = function(seg, isRef) {
        var groups = [];
        if (!seg || !seg.notes) return groups;
        var notes = seg.notes;
        var byKey = {};
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var lk = (isFinite(n.layer) ? n.layer : 0) + '|' + (n.key || 0);
            if (!byKey[lk]) byKey[lk] = [];
            byKey[lk].push({ note: n, idx: i, z: this.noteZ(n) });
        }
        for (var k in byKey) {
            if (!byKey.hasOwnProperty(k)) continue;
            var list = byKey[k];
            list.sort(function(a, b) {
                var ra = a.note.rel || 0, rb = b.note.rel || 0;
                if (ra !== rb) return ra - rb;
                return a.z - b.z;
            });
            var cur = null;
            for (var j = 0; j < list.length; j++) {
                var item = list[j];
                var rel = item.note.rel || 0;
                if (cur && rel >= cur.start && rel <= cur.end + 1) {
                    // rel === end: 同一 tick 的重叠音符 (叠层)
                    // rel === end + 1: 延音连续音符
                    cur.notes.push(item);
                    if (rel > cur.end) cur.end = rel;
                    continue;
                }
                cur = {
                    layer: isFinite(item.note.layer) ? item.note.layer : 0,
                    key: item.note.key || 0,
                    start: rel,
                    end: rel,
                    notes: [item],
                    ref: isRef
                };
                groups.push(cur);
            }
        }
        return groups;
    };

    // 显示层级 (点击聚焦只改变显示顺序, 不改动数据数组顺序)
    SegmentWindow.prototype.noteZ = function(note) {
        if (!this._zMap) this._zMap = new WeakMap();
        var z = this._zMap.get(note);
        return z === undefined ? 0 : z;
    };
    SegmentWindow.prototype.raiseNote = function(note) {
        if (!this._zMap) this._zMap = new WeakMap();
        this._zMap.set(note, (this._zSeq = (this._zSeq || 0) + 1));
    };

    SegmentWindow.prototype.groupTop = function(group) {
        var top = group.notes[0];
        for (var i = 1; i < group.notes.length; i++) {
            if (this.noteZ(group.notes[i].note) >= this.noteZ(top.note)) top = group.notes[i];
        }
        // Alt+滚轮临时顶层
        if (this.tempTop && this.tempTop.key === group.key && this.tempTop.start === group.start) {
            var idx = this.tempTop.idx % group.notes.length;
            var pick = null;
            for (var j = 0; j < group.notes.length; j++) {
                if (j === idx) { pick = group.notes[j]; break; }
            }
            if (pick) return pick;
        }
        return top;
    };

    SegmentWindow.prototype.scheduleTempTopReset = function(delay) {
        var self = this;
        if (this.tempTopTimer) clearTimeout(this.tempTopTimer);
        this.tempTopTimer = setTimeout(function() {
            self.tempTop = null;
            self.tempTopTimer = null;
        }, delay === undefined ? 1000 : delay);
    };

    SegmentWindow.prototype.cycleTempTop = function(group, dir) {
        var idx = this.tempTop && this.tempTop.key === group.key && this.tempTop.start === group.start
            ? this.tempTop.idx : (group.notes.length - 1);
        idx = (idx + dir + group.notes.length) % group.notes.length;
        this.tempTop = { key: group.key, start: group.start, idx: idx };
        this.scheduleTempTopReset(1000);
        this.refresh();
    };

    // ---------- 绘制 ----------
    SegmentWindow.prototype.refresh = function() {
        this.needLayout = true;
    };

    SegmentWindow.prototype.draw = function() {
        if (!this.root || !this.ctx || !this.cw) return;
        var ctx = this.ctx;
        var W = this.cw, H = this.ch;
        var st = this.stageRect();
        var h = host();
        var mainTick = h ? (h.state.currentTick || 0) : 0;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#1b1b1f';
        ctx.fillRect(0, 0, W, H);

        // 音高区背景
        for (var key = this.minKey; key <= this.maxKey; key++) {
            var y = this.keyToY(key);
            if (y > H || y + this.rowH < RULER_H) continue;
            ctx.fillStyle = isBlackKey(key) ? '#232329' : '#26262c';
            ctx.fillRect(KEYBAR_W, y, W - KEYBAR_W, this.rowH);
        }

        // 时间网格
        var segStart = this.seg ? this.seg.start : 0;
        var dur = this.segDuration();
        var t0 = Math.floor(this.xToTick(KEYBAR_W));
        var t1 = Math.ceil(this.xToTick(W));
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (var tk = t0; tk <= t1; tk++) {
            if (tk % 4 !== 0) continue;
            var gx = Math.round(this.tickToX(tk)) + 0.5;
            if (gx < KEYBAR_W) continue;
            ctx.beginPath();
            ctx.moveTo(gx, RULER_H);
            ctx.lineTo(gx, H);
            ctx.stroke();
        }
        // 小节线
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        for (var bt = t0; bt <= t1; bt++) {
            if (bt % 16 !== 0) continue;
            var bx = Math.round(this.tickToX(bt)) + 0.5;
            if (bx < KEYBAR_W) continue;
            ctx.beginPath();
            ctx.moveTo(bx, RULER_H);
            ctx.lineTo(bx, H);
            ctx.stroke();
        }

        // 片段范围阴影 (范围外压暗)
        var sx = this.tickToX(segStart);
        var ex = this.tickToX(segStart + dur);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (sx > KEYBAR_W) ctx.fillRect(KEYBAR_W, RULER_H, Math.min(sx - KEYBAR_W, W - KEYBAR_W), H - RULER_H);
        if (ex < W) ctx.fillRect(Math.max(KEYBAR_W, ex), RULER_H, W - Math.max(KEYBAR_W, ex), H - RULER_H);

        // 参考片段
        var ref = this.getRefSeg();
        this._iconUsed = {};
        if (ref) this.drawSegmentNotes(ref, true);

        // 当前片段
        if (this.seg) {
            this.drawSegmentNotes(this.seg, false);
        }
        // 清理已不存在的组的图标动画状态, 避免长时间编辑后状态无限增长
        for (var ik in this._iconCount) {
            if (!this._iconUsed[ik]) {
                delete this._iconCount[ik];
                delete this._iconFrom[ik];
            }
        }

        // 选择框
        if (this.dragging && this.dragging.mode === 'marquee') {
            var d = this.dragging.marq;
            var rx = Math.min(d.x0, d.x1), ry = Math.min(d.y0, d.y1);
            var rw = Math.abs(d.x1 - d.x0), rh = Math.abs(d.y1 - d.y0);
            ctx.fillStyle = 'rgba(76,194,255,0.14)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = 'rgba(76,194,255,0.7)';
            ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
        }

        // 时间标尺
        ctx.fillStyle = '#202026';
        ctx.fillRect(0, 0, W, RULER_H);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px Consolas, monospace';
        ctx.textBaseline = 'middle';
        for (var rt = t0; rt <= t1; rt++) {
            if (rt % 16 !== 0) continue;
            var lx = this.tickToX(rt);
            if (lx < KEYBAR_W) continue;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.moveTo(Math.round(lx) + 0.5, 0);
            ctx.lineTo(Math.round(lx) + 0.5, RULER_H);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillText(String(Math.floor(rt / 16) + 1), lx + 3, RULER_H / 2);
        }

        // 音名栏
        ctx.fillStyle = '#1e1e23';
        ctx.fillRect(0, RULER_H, KEYBAR_W, H - RULER_H);
        for (var k2 = this.minKey; k2 <= this.maxKey; k2++) {
            var ky = this.keyToY(k2);
            if (ky > H || ky + this.rowH < RULER_H) continue;
            ctx.fillStyle = isBlackKey(k2) ? '#26262c' : '#2e2e36';
            ctx.fillRect(0, ky, KEYBAR_W, this.rowH);
            ctx.fillStyle = isBlackKey(k2) ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)';
            ctx.font = '10px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(pitchName(k2), KEYBAR_W - 6, ky + this.rowH / 2);
            ctx.textAlign = 'left';
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(KEYBAR_W + 0.5, RULER_H);
        ctx.lineTo(KEYBAR_W + 0.5, H);
        ctx.stroke();

        // 播放头
        var pt = this.playheadTick();
        var px = this.tickToX(pt);
        if (px >= KEYBAR_W && px <= W) {
            ctx.strokeStyle = 'rgba(255,90,90,0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px, RULER_H);
            ctx.lineTo(px, H);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,90,90,0.95)';
            ctx.beginPath();
            ctx.moveTo(px - 4, 0);
            ctx.lineTo(px + 4, 0);
            ctx.lineTo(px, 6);
            ctx.closePath();
            ctx.fill();
            ctx.lineWidth = 1;
        }

        this.drawVelocity();
    };

    SegmentWindow.prototype.drawSegmentNotes = function(seg, isRef) {
        var ctx = this.ctx;
        var groups = this.buildGroups(seg, isRef);
        var base = seg.start || 0;
        var H = this.ch;
        var self = this;
        if (!isRef) {
            // 按显示层级绘制: 层级高的后画, 覆盖在上方
            groups.sort(function(a, b) {
                return self.noteZ(self.groupTop(a).note) - self.noteZ(self.groupTop(b).note);
            });
        }
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var y = this.keyToY(g.key);
            if (y > H || y + this.rowH < RULER_H) continue;
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            if (x + w < KEYBAR_W || x > this.cw) continue;

            var top = isRef ? g.notes[0] : this.groupTop(g);
            var color = colorFor(top.note.instrument);
            var selected = !isRef && this.isSelected(top.note);

            var bh = Math.max(6, this.rowH - 3);
            var by = y + 1;

            ctx.globalAlpha = isRef ? 0.3 : 1;
            // 底色 (最上层音符颜色)
            ctx.fillStyle = color;
            this.roundRect(ctx, x, by, w, bh, 3);
            ctx.fill();
            if (selected) {
                ctx.strokeStyle = '#4cc2ff';
                ctx.lineWidth = 2;
                this.roundRect(ctx, x - 1, by - 1, w + 2, bh + 2, 4);
                ctx.stroke();
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                this.roundRect(ctx, x + 0.5, by + 0.5, Math.max(0.5, w - 1), Math.max(0.5, bh - 1), 3);
                ctx.stroke();
            }

            // 起始端图标: 每个音符一个, 叠放且至少露出 1/2
            var iconSize = Math.min(bh - 2, 9);
            var step = Math.min(iconSize / 2, 5);
            var maxCount = 4;
            var targetCount = Math.min(g.notes.length, maxCount);
            // 重叠数量变化时用平滑动画过渡图标 (新图标渐入/移除渐出, 文字随之平滑移动)
            var now = performance.now();
            var gkey = (isRef ? 'r' : 'e') + g.key + ':' + g.start + ':' + g.layer;
            this._iconUsed[gkey] = 1;
            if (this._iconCount[gkey] === undefined) this._iconCount[gkey] = targetCount;
            if (this._iconCount[gkey] !== targetCount) {
                this._iconFrom[gkey] = { v: this._iconCount[gkey], t: now };
                this._iconCount[gkey] = targetCount;
            }
            var curCount = targetCount;
            var from = this._iconFrom[gkey];
            if (from) {
                var p = Math.min(1, (now - from.t) / 180);
                if (p >= 1) {
                    delete this._iconFrom[gkey];
                } else {
                    var e2 = 1 - Math.pow(1 - p, 3);
                    curCount = from.v + (targetCount - from.v) * e2;
                }
            }
            var drawN = Math.ceil(curCount);
            var iy = by + (bh - iconSize) / 2;
            for (var n = 0; n < drawN && n < maxCount; n++) {
                var ix = x + 2 + n * step;
                var a = isRef ? 1 : clamp(curCount - n, 0, 1);
                var ay = iy + (1 - a) * 2;
                ctx.globalAlpha = (isRef ? 0.3 : 1) * a;
                ctx.fillStyle = isRef ? 'rgba(255,255,255,0.5)' : (n === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.6)');
                this.roundRect(ctx, ix, ay, iconSize, iconSize, 2);
                ctx.fill();
                ctx.fillStyle = colorFor(g.notes[n].note.instrument);
                ctx.fillRect(ix + 1, ay + 1, iconSize - 2, iconSize - 2);
            }
            ctx.globalAlpha = isRef ? 0.3 : 1;

            // 文字只在起始端 (不留右侧副本)
            var textX = x + 4 + Math.min(curCount, maxCount) * step;
            var textY = by + bh / 2;
            var args = [pitchName(g.key)];
            if (g.notes.length > targetCount) args.push('+' + (g.notes.length - targetCount));
            if (w > 52) args.push(String(Math.round(top.note.velocity === undefined ? 100 : top.note.velocity)));
            var label = args.join(' ');
            ctx.font = '9px "Segoe UI", system-ui, sans-serif';
            var tw = ctx.measureText(label).width;
            if (textX + tw + 2 <= x + w) {
                ctx.fillStyle = 'rgba(0,0,0,0.68)';
                ctx.fillText(label, textX, textY);
            } else if (w > 14) {
                ctx.fillStyle = 'rgba(0,0,0,0.68)';
                ctx.fillText(pitchName(g.key), Math.min(textX, x + w - 10), textY);
            }
            ctx.globalAlpha = 1;
        }
    };

    SegmentWindow.prototype.roundRect = function(ctx, x, y, w, h, r) {
        // 缩放很小时音符宽度可能不足 1px, 此处统一收敛为正尺寸与非负圆角,
        // 否则 arcTo 会因负半径抛 IndexSizeError 并中断整帧绘制
        var ww = Math.max(0.5, w), hh = Math.max(0.5, h);
        var rr = Math.min(Math.abs(r), ww / 2, hh / 2);
        if (!(rr > 0)) rr = 0;
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
        ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
        ctx.arcTo(x, y + hh, x, y, rr);
        ctx.arcTo(x, y, x + ww, y, rr);
        ctx.closePath();
    };

    SegmentWindow.prototype.isSelected = function(note) {
        for (var i = 0; i < this.selection.length; i++) {
            if (this.selection[i] === note) return true;
        }
        return false;
    };

    // 框选结束后按矩形范围收集音符 (只取每组最上层音符)
    SegmentWindow.prototype.applyMarquee = function(keepSel, mq) {
        if (!mq || !this.seg) return;
        var rx0 = Math.min(mq.x0, mq.x1), rx1 = Math.max(mq.x0, mq.x1);
        var ry0 = Math.min(mq.y0, mq.y1), ry1 = Math.max(mq.y0, mq.y1);
        if (rx1 - rx0 < 2 && ry1 - ry0 < 2) return;
        var groups = this.buildGroups(this.seg, false);
        var base = this.seg.start || 0;
        var sel = keepSel ? keepSel.slice() : [];
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var y = this.keyToY(g.key);
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            if (x > rx1 || x + w < rx0) continue;
            if (y > ry1 || y + this.rowH < ry0) continue;
            var note = this.groupTop(g).note;
            if (!keepSel || keepSel.indexOf(note) < 0) {
                if (this.selection.indexOf(note) < 0) sel.push(note);
            }
        }
        this.selection = sel;
        this.refresh();
    };

    SegmentWindow.prototype.drawVelocity = function() {
        var ctx = this.velCtx;
        if (!ctx || !this.vw) return;
        var W = this.vw, H = this.vh;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#17171b';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(t('力度'), 6, 12);

        if (!this.seg) return;
        var groups = this.buildGroups(this.seg, false);
        var base = this.seg.start;
        var top = 16, bottom = H - 6;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var n = this.groupTop(g).note;
            var x = this.tickToX(base + g.start);
            if (x < KEYBAR_W || x > W) continue;
            var v = isFinite(n.velocity) ? n.velocity : 100;
            var barH = (bottom - top) * clamp(v, 0, 200) / 200;
            var sel = this.isSelected(n);
            ctx.fillStyle = sel ? 'rgba(76,194,255,0.9)' : 'rgba(255,255,255,0.34)';
            var bw = Math.max(2, Math.min(10, this.pxPerTick * 2));
            ctx.fillRect(x, bottom - barH, bw, barH);
            if (sel) ctx.fillRect(x - 1, bottom - barH - 2, bw + 2, 1);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(KEYBAR_W + 0.5, 0);
        ctx.lineTo(KEYBAR_W + 0.5, H);
        ctx.stroke();
    };

    SegmentWindow.prototype.getRefSeg = function() {
        if (!this.refSegId) return null;
        var h = host();
        var segs = (h && h.state.segments) || [];
        for (var i = 0; i < segs.length; i++) {
            if (String(segs[i].id) === String(this.refSegId)) return segs[i];
        }
        return null;
    };

    // ---------- 命中测试 ----------
    SegmentWindow.prototype.hitTest = function(mx, my) {
        if (!this.seg) return null;
        var groups = this.buildGroups(this.seg, false);
        var base = this.seg.start;
        var best = null;
        var bestZ = -1;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var y = this.keyToY(g.key);
            if (my < y || my > y + this.rowH) continue;
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            if (mx < x || mx > x + w) continue;
            var top = this.groupTop(g);
            // 重叠时只命中显示层级最高的一组 (最后移动/点击的音符)
            var z = this.noteZ(top.note);
            if (best && z < bestZ) continue;
            var edge = null;
            if (mx >= x + w - 5) edge = 'right';
            else if (mx <= x + 3) edge = 'left';
            best = { group: g, note: top.note, item: top, edge: edge, x: x, w: w };
            bestZ = z;
        }
        return best;
    };

    SegmentWindow.prototype.hitGroupAt = function(mx) {
        if (!this.seg) return null;
        var groups = this.buildGroups(this.seg, false);
        var base = this.seg.start;
        // 力度条按「距竖条最近的组」命中, 避免浮点边界 (mx 与 x 恰好相等却因精度差漏选)
        var tol = Math.max(6, this.pxPerTick * 2);
        var best = null, bestD = Infinity;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            var d = 0;
            if (mx < x) d = x - mx;
            else if (mx > x + w) d = mx - (x + w);
            if (d < bestD) { bestD = d; best = g; }
        }
        return bestD <= tol ? best : null;
    };

    // ---------- 鼠标交互 ----------
    SegmentWindow.prototype.onCanvasDown = function(ev) {
        this.focus();
        if (this.minimized) return;
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;
        var hit = this.hitTest(mx, my);

        if (this.tool === 'select') {
            if (hit) {
                var additive = ev.shiftKey;
                if (!additive) this.selection = [];
                if (!this.isSelected(hit.note)) this.selection.push(hit.note);
                this.raiseNote(hit.note);   // 点击即聚焦置顶
                this.beginMove(ev, mx, my, hit);
            } else {
                var self = this;
                if (!ev.shiftKey) this.selection = [];
                var keepSel = this.selection.slice();
                var mq = { x0: mx, y0: my, x1: mx, y1: my };
                this.dragging = { mode: 'marquee', marq: mq };
                this.hookMove(function(e) {
                    var rr = self.canvas.getBoundingClientRect();
                    mq.x1 = e.clientX - rr.left;
                    mq.y1 = e.clientY - rr.top;
                    self.refresh();
                }, function() {
                    self.applyMarquee(keepSel, mq);
                });
            }
            this.refresh();
            return;
        }

        if (this.tool === 'erase') {
            // 一次拖动只入栈一条撤销记录
            host().pushUndo();
            if (hit) this.deleteNote(hit.note, true);
            this.dragging = { mode: 'erase', x0: mx, y0: my, x1: mx, y1: my };
            return;
        }

        // 画笔
        if (hit) {
            this.selection = [hit.note];
            this.raiseNote(hit.note);
            if (hit.edge === 'right') this.beginResizeNote(ev, mx, my, hit);
            else this.beginMove(ev, mx, my, hit);
        } else {
            this.beginDraw(ev, mx, my);
        }
    };

    SegmentWindow.prototype.beginDraw = function(ev, mx, my) {
        var h = host();
        if (!h) return;
        var self = this;
        h.pushUndo();
        var layer = this.seg.notes.length ? (isFinite(this.seg.notes[0].layer) ? this.seg.notes[0].layer : 0) : 0;
        this.dragging = { mode: 'draw', layer: layer, lastKey: -1, lastTick: -1 };
        this.drawAt(mx, my);
        this.hookMove(function(e) {
            var r = self.canvas.getBoundingClientRect();
            self.drawAt(e.clientX - r.left, e.clientY - r.top);
        }, function() {
            self.commitEdit();
        });
    };

    SegmentWindow.prototype.drawAt = function(mx, my) {
        if (my < RULER_H) return;
        var key = this.yToKey(my);
        if (key < 0 || key > 87) return;
        var tick = Math.floor(this.xToTick(mx));
        tick = this.snapTick(tick);
        var rel = tick - (this.seg.start || 0);
        if (rel < 0 || rel >= this.segDuration()) return;
        var d = this.dragging;
        if (d && d.lastKey === key && d.lastTick === rel) return;
        var exists = false;
        for (var i = 0; i < this.seg.notes.length; i++) {
            var n = this.seg.notes[i];
            if ((n.key || 0) === key && (n.rel || 0) === rel) { exists = true; break; }
        }
        if (!exists) {
            this.seg.notes.push({
                rel: rel,
                layer: d ? d.layer : 0,
                instrument: this.currentInstrument,
                key: key,
                velocity: this.defaultVelocity,
                pan: 100,
                pitch: 0
            });
            this.commitEdit();
        }
        if (d) { d.lastKey = key; d.lastTick = rel; }
    };

    SegmentWindow.prototype.snapTick = function(tick) {
        var g = this.grid || 1;
        return Math.round(tick / g) * g;
    };

    SegmentWindow.prototype.beginMove = function(ev, mx, my, hit) {
        var h = host();
        if (!h) return;
        var self = this;
        var notes = this.selection.length ? this.selection.slice() : [hit.note];
        if (!this.isSelected(hit.note)) {
            this.selection = [hit.note];
            notes = [hit.note];
        }
        h.pushUndo();
        var startTick = this.xToTick(mx);
        var startKey = this.yToKey(my);
        var orig = notes.map(function(n) {
            return { note: n, rel: n.rel || 0, key: n.key || 0 };
        });
        this.dragging = { mode: 'move', notes: notes };
        this.hookMove(function(e) {
            var r = self.canvas.getBoundingClientRect();
            var dt = Math.round((self.xToTick(e.clientX - r.left) - startTick) / self.grid) * self.grid;
            var dk = self.yToKey(e.clientY - r.top) - startKey;
            for (var i = 0; i < orig.length; i++) {
                var o = orig[i];
                o.note.rel = Math.max(0, o.rel + dt);
                o.note.key = clamp(o.key + dk, 0, 87);
            }
            self.commitEdit(true);
        }, function() {
            self.finishEdit();
        });
    };

    SegmentWindow.prototype.beginResizeNote = function(ev, mx, my, hit) {
        var h = host();
        if (!h) return;
        var self = this;
        h.pushUndo();
        var group = hit.group;
        var originals = group.notes.map(function(it) { return it.note; });
        var proto = originals[0];
        var base = group.start;
        var length = group.end - group.start + 1;
        var added = [];
        var removedOrigin = false;

        function dropOriginals() {
            if (removedOrigin) return;
            for (var i = 0; i < originals.length; i++) {
                var oi = self.seg.notes.indexOf(originals[i]);
                if (oi >= 0) self.seg.notes.splice(oi, 1);
            }
            removedOrigin = true;
        }

        function rebuild(len) {
            // 先移除上一次生成音符, 再按新长度重建连续音符 (延音写回 NBS 数据)
            for (var i = 0; i < added.length; i++) {
                var ai = self.seg.notes.indexOf(added[i]);
                if (ai >= 0) self.seg.notes.splice(ai, 1);
            }
            added = [];
            dropOriginals();
            for (var k = 0; k < len; k++) {
                var note = {
                    rel: base + k,
                    layer: isFinite(proto.layer) ? proto.layer : 0,
                    instrument: proto.instrument,
                    key: proto.key,
                    velocity: isFinite(proto.velocity) ? proto.velocity : 100,
                    pan: isFinite(proto.pan) ? proto.pan : 100,
                    pitch: proto.pitch || 0
                };
                self.seg.notes.push(note);
                added.push(note);
            }
            self.selection = added.slice();
            self.commitEdit(true);
        }

        this.dragging = { mode: 'resize' };
        this.hookMove(function(e) {
            var r = self.canvas.getBoundingClientRect();
            var tick = self.snapTick(Math.floor(self.xToTick(e.clientX - r.left))) - (self.seg.start || 0);
            length = Math.max(1, tick - base + 1);
            rebuild(length);
        }, function() {
            self.finishEdit();
        });
    };

    SegmentWindow.prototype.hookMove = function(moveFn, upFn) {
        var self = this;
        function onMove(e) { moveFn(e); }
        function onUp(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            self.dragging = null;
            if (upFn) upFn(e);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    SegmentWindow.prototype.commitEdit = function(noRefresh) {
        var h = host();
        if (!h) return;
        if (this.selection.length) {
            var live = [];
            for (var i = 0; i < this.selection.length; i++) {
                if (this.seg.notes.indexOf(this.selection[i]) >= 0) live.push(this.selection[i]);
            }
            this.selection = live;
        }
        if (h.segmentSync) h.segmentSync();
        if (h.markDirty) h.markDirty();
        this.refresh();
    };

    SegmentWindow.prototype.finishEdit = function() {
        this.commitEdit();
        this.persist();
    };

    SegmentWindow.prototype.deleteNote = function(note, noUndo) {
        var h = host();
        if (!h || !note) return;
        var idx = this.seg.notes.indexOf(note);
        if (idx < 0) return;
        if (!noUndo) h.pushUndo();
        this.seg.notes.splice(idx, 1);
        var sel = this.selection.indexOf(note);
        if (sel >= 0) this.selection.splice(sel, 1);
        this.commitEdit();
    };

    SegmentWindow.prototype.onCanvasMove = function(ev) {
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;

        if (this.dragging && this.dragging.mode === 'marquee') {
            this.dragging.marq.x1 = mx;
            this.dragging.marq.y1 = my;
            this.refresh();
            return;
        }
        if (this.dragging && this.dragging.mode === 'erase') {
            var hitE = this.hitTest(mx, my);
            if (hitE) this.deleteNote(hitE.note, true);
            return;
        }

        var hit = this.hitTest(mx, my);
        this._hover = hit;
        var cur = 'default';
        if (hit) cur = hit.edge === 'right' ? 'ew-resize' : 'pointer';
        else if (this.tool === 'draw') cur = 'crosshair';
        this.canvas.style.cursor = cur;
    };

    SegmentWindow.prototype.onCanvasDblClick = function(ev) {
        var r = this.canvas.getBoundingClientRect();
        var hit = this.hitTest(ev.clientX - r.left, ev.clientY - r.top);
        if (hit) {
            this.raiseNote(hit.note);
            this.refresh();
        }
    };

    SegmentWindow.prototype.onCanvasRightClick = function(ev) {
        var r = this.canvas.getBoundingClientRect();
        var hit = this.hitTest(ev.clientX - r.left, ev.clientY - r.top);
        if (hit) this.deleteNote(hit.note);
    };

    SegmentWindow.prototype.onWheel = function(ev) {
        ev.preventDefault();
        if (!this.seg) return;
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;

        // Alt + 滚轮: 临时切换重叠音符的顶层
        if (ev.altKey) {
            var g = null;
            var groups = this.buildGroups(this.seg, false);
            for (var i = 0; i < groups.length; i++) {
                var gg = groups[i];
                var gy = this.keyToY(gg.key);
                var gx = this.tickToX((this.seg.start || 0) + gg.start);
                var gw = Math.max(this.pxPerTick, (gg.end - gg.start + 1) * this.pxPerTick);
                if (my >= gy && my <= gy + this.rowH && mx >= gx && mx <= gx + gw) { g = gg; break; }
            }
            if (g && g.notes.length > 1) {
                this.cycleTempTop(g, ev.deltaY > 0 ? 1 : -1);
                return;
            }
        }

        if (ev.ctrlKey || ev.metaKey) {
            var anchor = this.xToTick(mx);
            var next = clamp(this.pxPerTick * (ev.deltaY > 0 ? 0.88 : 1.14), 0.5, 48);
            this.viewStart = anchor - (mx - KEYBAR_W) / next;
            this.pxPerTick = next;
            this.refresh();
            return;
        }
        if (ev.shiftKey) {
            this.viewStart -= (ev.deltaY > 0 ? 1 : -1) * (8 / this.pxPerTick) * 12;
            this.refresh();
        } else {
            this.scrollY = clamp(this.scrollY + (ev.deltaY > 0 ? this.rowH * 2 : -this.rowH * 2),
                0, Math.max(0, (this.maxKey - this.minKey + 1) * this.rowH - this.ch));
            this.refresh();
        }
    };

    SegmentWindow.prototype.onVelDown = function(ev) {
        if (!this.seg) return;
        var h = host();
        if (!h) return;
        var r = this.velCanvas.getBoundingClientRect();
        var mx = ev.clientX - r.left;
        var g = this.hitGroupAt(mx);
        // 有选中音符时优先改选中项; 否则改命中的竖条对应的音符组
        var notes = this.selection.length
            ? this.selection.slice()
            : (g ? g.notes.map(function(it) { return it.note; }) : []);
        if (!notes.length) return;
        var self = this;
        h.pushUndo();
        var top = 16, bottom = Math.max(top + 1, this.vh - 6);
        function apply(e) {
            var v = Math.round(clamp((bottom - (e.clientY - r.top)) / (bottom - top) * 200, 0, 200));
            for (var i = 0; i < notes.length; i++) notes[i].velocity = v;
            if (!self.selection.length) self.defaultVelocity = v;
            self.commitEdit(true);
        }
        apply(ev);
        this.hookMove(apply, function() { self.finishEdit(); });
    };

    SegmentWindow.prototype.onKey = function(ev) {
        var h = host();
        if (!h) return;
        var k = ev.key;
        if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) {
            ev.preventDefault();
            if (ev.shiftKey) { if (h.performRedo) h.performRedo(); }
            else if (h.performUndo) h.performUndo();
            this.clampSelection();
            this.autoFit(true);
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) {
            ev.preventDefault();
            if (h.performRedo) h.performRedo();
            this.clampSelection();
            this.autoFit(true);
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'c' || k === 'C')) {
            this.copySelection();
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'v' || k === 'V')) {
            this.pasteClipboard();
        } else if (k === 'Delete' || k === 'Backspace') {
            if (this.selection.length) {
                ev.preventDefault();
                h.pushUndo();
                for (var i = this.selection.length - 1; i >= 0; i--) {
                    var idx = this.seg.notes.indexOf(this.selection[i]);
                    if (idx >= 0) this.seg.notes.splice(idx, 1);
                }
                this.selection = [];
                this.commitEdit();
            }
        } else if (k === 'b' || k === 'B') this.setTool('draw');
        else if (k === 'e' || k === 'E') this.setTool('erase');
        else if (k === 's' || k === 'S') this.setTool('select');
    };

    SegmentWindow.prototype.clampSelection = function() {
        var live = [];
        for (var i = 0; i < this.selection.length; i++) {
            if (this.seg.notes.indexOf(this.selection[i]) >= 0) live.push(this.selection[i]);
        }
        this.selection = live;
        if (this._zMap) this._zMap = new WeakMap();
    };

    SegmentWindow.prototype.copySelection = function() {
        if (!this.selection.length) return;
        var minTick = Infinity, minKey = Infinity;
        for (var i = 0; i < this.selection.length; i++) {
            var n = this.selection[i];
            minTick = Math.min(minTick, n.rel || 0);
            minKey = Math.min(minKey, n.key || 0);
        }
        this.clipboard = this.selection.map(function(n) {
            return {
                dr: (n.rel || 0) - minTick,
                dk: (n.key || 0) - minKey,
                instrument: n.instrument, velocity: n.velocity, pan: n.pan,
                pitch: n.pitch, layer: n.layer
            };
        });
    };

    SegmentWindow.prototype.pasteClipboard = function() {
        if (!this.clipboard || !this.clipboard.length) return;
        var h = host();
        var mx = this._hover ? this._hover.x : this.tickToX(this.seg.start);
        h.pushUndo();
        var targetTick = Math.round(this.snapTick(this.xToTick(mx)) - (this.seg.start || 0));
        var targetKey = this._hover ? this._hover.group.key : (this.minKey + 5);
        var self = this;
        var added = [];
        this.clipboard.forEach(function(c) {
            var note = {
                rel: Math.max(0, targetTick + c.dr),
                layer: isFinite(c.layer) ? c.layer : 0,
                instrument: c.instrument,
                key: clamp(targetKey + c.dk, 0, 87),
                velocity: c.velocity, pan: c.pan, pitch: c.pitch
            };
            self.seg.notes.push(note);
            added.push(note);
        });
        this.selection = added;
        this.commitEdit();
    };

    SegmentWindow.prototype.setTool = function(tool) {
        this.tool = tool;
        this.updateToolButtons();
        this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : (tool === 'erase' ? 'cell' : 'default');
    };

    SegmentWindow.prototype.cycleGrid = function() {
        var idx = GRID_LEVELS.indexOf(this.grid);
        this.grid = GRID_LEVELS[(idx + 1) % GRID_LEVELS.length];
        this.syncTexts();
    };

    SegmentWindow.prototype.pickReference = function() {
        var self = this;
        var h = host();
        var segs = (h.state.segments || []).filter(function(s) {
            return String(s.lane) === String(self.seg.lane) && String(s.id) !== String(self.seg.id);
        });
        var menu = document.createElement('div');
        menu.className = 'spw-menu';
        var html = '<div class="spw-menu-item" data-id="">' + t('不显示参考') + '</div>';
        for (var i = 0; i < segs.length; i++) {
            var name = segs[i].name || ('#' + (i + 1));
            html += '<div class="spw-menu-item" data-id="' + segs[i].id + '">' + name + '</div>';
        }
        menu.innerHTML = html;
        this.root.appendChild(menu);
        var btn = this.root.querySelector('[data-act="reference"]');
        var br = btn.getBoundingClientRect();
        menu.style.left = Math.max(4, br.left - this.root.getBoundingClientRect().left) + 'px';
        menu.style.top = (br.bottom - this.root.getBoundingClientRect().top + 4) + 'px';
        function closeMenu() {
            if (menu.parentNode) menu.parentNode.removeChild(menu);
            document.removeEventListener('mousedown', outside, true);
        }
        function outside(e) { if (!menu.contains(e.target)) closeMenu(); }
        menu.addEventListener('click', function(e) {
            var item = e.target.closest('.spw-menu-item');
            if (!item) return;
            self.refSegId = item.getAttribute('data-id') || null;
            closeMenu();
            self.fitKeyRange();
            self.syncTexts();
            self.refresh();
        });
        setTimeout(function() { document.addEventListener('mousedown', outside, true); }, 0);
    };

    // ============================================================
    // 导出
    // ============================================================
    window.SegmentPianoWindow = {
        open: open,
        closeAll: closeAll,
        refresh: refreshAll,
        refreshLane: function(laneId) {
            var w = findLaneWin(laneId);
            if (w) w.refresh();
        },
        closeLane: function(laneId) {
            var w = findLaneWin(laneId);
            if (w) w.close();
        },
        isOpen: function() {
            return wins.length > 0;
        },
        hasFocus: function() {
            return !!(lastFocused && lastFocused.root);
        }
    };
})();
