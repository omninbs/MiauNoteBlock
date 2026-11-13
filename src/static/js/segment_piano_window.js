/**
 * 片段浮动钢琴卷帘窗口 (Segment Piano Window) v2
 *
 * 每条片段轨道一个浮动窗口:
 *   - 拖动 / 缩放 / 最小化(右上堆叠) / 最大化, 位置按轨道持久化
 *   - 左侧完整钢琴键盘 (白键/黑键), 横向点击位置决定力度 (左轻右重)
 *   - 顶部时间标尺 + 视口地图, 点击/拖动可直接跳转播放位置
 *   - 底部力度控制器 (FL 风格细竖线 + 方柄), 按住拖动可连续刷多个音符
 *   - 中键拖动平移视图 (左键保持编辑操作)
 *   - 音符绘制与 NBS 模式一致 (音色纯色 + 放置/删除补间动画)
 *   - 重叠音符叠层显示, 默认只操作最上层, Alt+滚轮临时切换
 *   - 播放头跟随主窗口并做线性插值; 切到「仅本窗口」时暂停主播放并独立试听本片段
 * 依赖 window.WebNBS.host
 */
(function () {
    'use strict';

    var STORE_KEY = 'segment_windows_v1';
    var SETTINGS_KEY = 'spw_settings_v1';
    var BASE_Z = 900;              // 高于片段工具栏, 低于系统弹窗
    var MIN_W = 460, MIN_H = 300;
    var MINI_W = 240, MINI_H = 26;
    var TITLE_H = 26;
    var RULER_H = 26;
    var KEYBAR_W = 54;
    var VEL_H = 54;
    var ROW_H = 16;
    var ROW_H_MIN = 8, ROW_H_MAX = 40;
    var GRID_LEVELS = [1, 8, 16];
    var GRID_LABELS = { 1: '1 tick', 8: '1/2 小节', 16: '1 小节' };
    var MINECRAFT_PITCH_MIN = 33, MINECRAFT_PITCH_MAX = 57;

    // 与 piano_roll.js 的音色色板保持一致 (音符颜色必须与 NBS 模式相同)
    var FALLBACK_COLORS = [
        '#e8a840', '#6b3a1f', '#d43030', '#e8d44d', '#c0c0c0', '#4a8c2a',
        '#40b8e8', '#f0e060', '#e8a0c0', '#f070a0', '#90a8c8', '#d09020',
        '#b07030', '#ffe040', '#e05050', '#b080e0', '#c46b3d', '#8b6f47',
        '#5c8b5c', '#3d7a6b'
    ];
    var PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var PITCH_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // 画布配色: 参考用户截图 (偏青的深灰), 同时保证与全局暗色主题对比充足
    var C = {
        bg: '#1e292e',
        rowLight: '#26343a',
        rowDark: '#223036',
        gridMinor: 'rgba(255,255,255,0.045)',
        gridMajor: 'rgba(255,255,255,0.14)',
        outOfRange: 'rgba(0,0,0,0.30)',
        rulerBg: '#22313a',
        rulerText: 'rgba(235,245,250,0.62)',
        rulerTick: 'rgba(255,255,255,0.22)',
        mapTrack: 'rgba(255,255,255,0.12)',
        mapView: 'rgba(76,194,255,0.85)',
        keyWhite: '#dde5ea',
        keyWhiteAlt: '#cfd9df',
        keyBlack: '#1b262b',
        keyBlackHover: '#2d4550',
        keyWhiteHover: '#c3e6f7',
        keyTextDark: '#28343a',
        keyTextLight: 'rgba(238,247,252,0.85)',
        keyLine: 'rgba(20,30,36,0.35)',
        keyCFrame: 'rgba(20,30,36,0.55)',
        playhead: '#e94560',
        accent: '#4cc2ff',
        selection: '#4cc2ff',
        velBg: '#1a2429',
        velGrid: 'rgba(255,255,255,0.055)',
        velLine: 'rgba(226,238,244,0.85)',
        velHandle: '#e2eef4',
        velLineSel: '#4cc2ff',
        velHandleSel: '#9adcff',
        tooltipBg: 'rgba(18,26,30,0.96)'
    };

    function host() { return (window.WebNBS && window.WebNBS.host) || null; }
    function t(text) {
        return window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate(text) : text;
    }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function isCoarsePointer() {
        try {
            return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        } catch (e) { return false; }
    }

    // 全屏布局判定: 按可用屏幕尺寸, 触屏设备更倾向全屏; 桌面常规尺寸保持浮窗
    // w/h/coarse 可显式传入, 便于单测; 缺省读取当前视口与指针类型
    function shouldUseFullscreen(w, h, coarse) {
        if (!isFinite(w) || !isFinite(h)) {
            w = window.innerWidth;
            h = window.innerHeight;
        }
        if (coarse === undefined) coarse = isCoarsePointer();
        var shortSide = Math.min(w, h);
        if (coarse) return w < 1100 || shortSide < 800;
        return shortSide < 720 || w < 900;
    }

    // 颜色明度调整: amt 为负则变暗, 为正则向白色提亮
    function shadeColor(hex, amt) {
        var h = String(hex || '#000').replace('#', '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        var r = parseInt(h.substring(0, 2), 16) || 0;
        var g = parseInt(h.substring(2, 4), 16) || 0;
        var b = parseInt(h.substring(4, 6), 16) || 0;
        if (amt < 0) {
            r = Math.round(r * (1 + amt));
            g = Math.round(g * (1 + amt));
            b = Math.round(b * (1 + amt));
        } else {
            r = Math.round(r + (255 - r) * amt);
            g = Math.round(g + (255 - g) * amt);
            b = Math.round(b + (255 - b) * amt);
        }
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    // 统一文档级拖动监听: 支持 Pointer Events, 不支持时回退鼠标。
    // 必须同时监听 pointercancel: 长按/系统手势 (如触屏长按、浏览器接管滚动)
    // 会以 pointercancel 结束指针序列, 若不处理会导致按下状态永远卡住。
    function docDrag(moveFn, upFn) {
        var usePointer = !!window.PointerEvent;
        var mv = usePointer ? 'pointermove' : 'mousemove';
        var ue = usePointer ? 'pointerup' : 'mouseup';
        var ce = usePointer ? 'pointercancel' : null;
        function onMove(e) { moveFn(e); }
        function onUp(e) {
            document.removeEventListener(mv, onMove);
            document.removeEventListener(ue, onUp);
            if (ce) document.removeEventListener(ce, onUp);
            if (upFn) upFn(e);
        }
        document.addEventListener(mv, onMove);
        document.addEventListener(ue, onUp);
        if (ce) document.addEventListener(ce, onUp);
    }

    function octaveLabelsEnabled() {
        try { return localStorage.getItem('show_octave_labels') !== '0'; } catch (e) { return true; }
    }
    function pitchClass(key) {
        var idx = ((key + 9) % 12 + 12) % 12;
        var flat = !!(window.WebNBS && window.WebNBS.shared && window.WebNBS.shared.flatNotationEnabled);
        return (flat ? PITCH_NAMES_FLAT : PITCH_NAMES)[idx];
    }
    function pitchName(key) {
        var oct = Math.floor((key + 21) / 12) - 1;
        return pitchClass(key) + (octaveLabelsEnabled() ? oct : '');
    }
    function isBlackKey(key) { return pitchClass(key).charAt(1) === '#'; }
    function colorFor(instrument) {
        var pal = window.NOTE_COLORS || FALLBACK_COLORS;
        var idx = isFinite(instrument) ? Math.floor(instrument) : 0;
        if (idx < 0) idx = 0;
        return pal[idx % pal.length];
    }

    // ============================================================
    // 全局设置 (标尺 / 地图 / 力度控制器显隐, 由设置窗口控制)
    // ============================================================
    var DEFAULT_SETTINGS = { ruler: true, minimap: true, velocity: true };
    var settingsCache = null;

    function loadSettings() {
        if (settingsCache) return settingsCache;
        settingsCache = { ruler: true, minimap: true, velocity: true };
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var obj = JSON.parse(raw) || {};
                for (var k in DEFAULT_SETTINGS) {
                    if (obj[k] !== undefined) settingsCache[k] = !!obj[k];
                }
            }
        } catch (e) {}
        return settingsCache;
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(loadSettings())); } catch (e) {}
    }
    function applySettingsToAll() {
        for (var i = 0; i < wins.length; i++) {
            if (wins[i]) wins[i].applySettings();
        }
    }

    // ============================================================
    // 窗口管理器
    // ============================================================
    var wins = [];
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
        var wantFullscreen = shouldUseFullscreen();
        var found = null;
        for (var i = 0; i < wins.length; i++) {
            if (wins[i].lane === lane) { found = wins[i]; break; }
        }
        if (found) {
            found.setSegment(seg);
            found.restoreFromMinimized();
            // 手机/小平板再次打开: 浮窗切换为全屏页面, 复用同一实例
            if (wantFullscreen) found.setLayoutMode('fullscreen');
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
        syncBodyScrollLock();
    }

    // 全屏窗口存在时锁定 body 滚动
    function syncBodyScrollLock() {
        var any = false;
        for (var i = 0; i < wins.length; i++) {
            if (wins[i] && wins[i].layoutMode === 'fullscreen' && wins[i].root) { any = true; break; }
        }
        if (document.body) document.body.classList.toggle('spw-fullscreen-open', any);
    }

    // 浏览器 back: 退出全屏并回到片段模式 (只处理最近打开的全屏窗口)
    window.addEventListener('popstate', function () {
        for (var i = wins.length - 1; i >= 0; i--) {
            var w = wins[i];
            if (!w || !w.root) continue;
            if (w.layoutMode === 'fullscreen' && w._fsHistoryPushed) {
                w._fsHistoryPushed = false;
                w.backToSegments();
                break;
            }
        }
    });

    // 全屏窗口跟随视口尺寸 (旋转/软键盘/窗口缩放)
    window.addEventListener('resize', function () {
        for (var i = 0; i < wins.length; i++) {
            var w = wins[i];
            if (w && w.root && w.layoutMode === 'fullscreen') {
                w.applyRect();
                w.needLayout = true;
            }
        }
    });

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
        this.segId = seg ? seg.id : null;
        this.pxPerTick = 8;
        this.viewStart = 0;
        this.rowH = ROW_H;
        this.layoutMode = shouldUseFullscreen() ? 'fullscreen' : 'float';
        this.maximized = false;
        this.minimized = false;
        this.prevRect = null;
        this._floatRect = null;
        this._fsHistoryPushed = false;
        this.manualMiniPos = null;
        this.tool = 'draw';
        this.grid = 1;
        this.playMode = 'sync';
        this.dragging = null;
        this.selection = [];
        this.clipboard = null;
        this.tempTop = null;
        this.tempTopTimer = null;
        this.currentInstrument = 0;
        this.defaultVelocity = 100;
        this.z = 0;
        this.rafId = 0;
        this.localTick = 0;
        this.needLayout = true;
        this._hover = null;
        this._hoverKey = -1;
        // 触屏双指缩放: pointerId -> 位置; _pinch 保存手势起点
        this._touchPts = {};
        this._pinch = null;
        this._rowHSaveTimer = 0;
        this._layerWarnAt = 0;
        // 钢琴键按下反馈 (performance.now 做 120ms 明度过渡)
        this._pressKey = -1;
        this._pressAt = 0;
        this._pressReleaseAt = 0;
        this._pressHold = false;
        this._keyAnimUntil = 0;
        // 数据版本 (用于缓存音符分组, 避免每帧重建)
        this._ver = 0;
        this._gcache = null;
        // 放置/删除动画
        this._anims = [];
        // 「仅本窗口」播放状态
        this._localPaused = false;
        this._mainWasPlaying = false;
        this._localOn = false;
        this._localPrev = 0;
        this._localBaseTick = 0;
        // 场景离屏画布 (静态内容只重绘一次, 播放时只叠加播放头)
        this._scene = document.createElement('canvas');
        this._sctx = this._scene.getContext('2d');
        this._sceneDirty = true;
    }

    SegmentWindow.prototype.build = function () {
        var self = this;
        var rest = loadLayout()[laneKey(this.lane)] || {};
        var vw = window.innerWidth, vh = window.innerHeight;
        var w = clamp(rest.w || 880, MIN_W, vw);
        var hgt = clamp(rest.h || 500, MIN_H, vh);
        var x = isFinite(rest.x) ? rest.x : Math.round((vw - w) / 2);
        var y = isFinite(rest.y) ? rest.y : Math.round((vh - hgt) / 2) - 30;
        x = clamp(x, 0, Math.max(0, vw - 120));
        y = clamp(y, 0, Math.max(0, vh - TITLE_H));
        this.rect = { x: x, y: y, w: w, h: hgt };
        this.maximized = !!rest.max;
        this.minimized = !!rest.min;
        // 行高随窗口布局持久化 (限幅 8..40, 默认 16)
        var savedRowH = parseFloat(rest.rowH);
        this.rowH = isFinite(savedRowH) ? clamp(savedRowH, ROW_H_MIN, ROW_H_MAX) : ROW_H;
        if (this.layoutMode === 'fullscreen') {
            // 全屏页面: 记下浮窗尺寸以便返回时还原; 页面本身铺满视口
            this._floatRect = { x: x, y: y, w: w, h: hgt };
            this.rect = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
            this.maximized = false;
            this.minimized = false;
        }

        var root = document.createElement('div');
        root.className = 'spw' + (this.layoutMode === 'fullscreen' ? ' spw-fs' : '');
        root.setAttribute('data-role', 'segment-piano-window');
        root.setAttribute('tabindex', '0');
        root.innerHTML =
            '<div class="spw-titlebar" data-role="titlebar">' +
                '<button class="spw-btn spw-back" data-act="back" tabindex="-1" aria-label="返回"><i class="fa-solid fa-arrow-left"></i></button>' +
                '<span class="spw-glyph"><i class="fa-solid fa-piano-keyboard"></i></span>' +
                '<span class="spw-title" data-role="title"></span>' +
                '<span class="spw-beta" data-role="beta"></span>' +
                '<span class="spw-sub" data-role="subtitle"></span>' +
                '<span class="spw-actions">' +
                    '<button class="spw-btn" data-act="minimize" tabindex="-1" aria-label="最小化"><i class="fa-solid fa-minus"></i></button>' +
                    '<button class="spw-btn" data-act="maximize" tabindex="-1" aria-label="最大化"><i class="fa-solid fa-expand"></i></button>' +
                    '<button class="spw-btn spw-close" data-act="close" tabindex="-1" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
                '</span>' +
            '</div>' +
            '<div class="spw-body" data-role="body">' +
                '<div class="spw-toolbar">' +
                    '<button class="spw-switch" data-act="playmode" role="switch" aria-checked="true" tabindex="-1">' +
                        '<span class="spw-switch-track"><span class="spw-switch-thumb"></span></span>' +
                        '<span class="spw-switch-label" data-role="playmode-label"></span>' +
                    '</button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn" data-act="tool-draw" data-tool="draw" tabindex="-1" aria-label="画笔"><i class="fa-solid fa-pencil"></i></button>' +
                    '<button class="spw-btn" data-act="tool-erase" data-tool="erase" tabindex="-1" aria-label="橡皮擦"><i class="fa-solid fa-eraser"></i></button>' +
                    '<button class="spw-btn" data-act="tool-select" data-tool="select" tabindex="-1" aria-label="选择"><i class="fa-solid fa-arrow-pointer"></i></button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn spw-grid" data-act="grid" tabindex="-1" aria-label="网格吸附"><span data-role="grid-label"></span></button>' +
                    '<span class="spw-sep"></span>' +
                    '<button class="spw-btn" data-act="rowh-out" tabindex="-1" aria-label="减小行高" title="减小行高"><i class="fa-solid fa-minus"></i></button>' +
                    '<button class="spw-btn" data-act="rowh-in" tabindex="-1" aria-label="增大行高" title="增大行高"><i class="fa-solid fa-plus"></i></button>' +
                    '<span class="spw-spacer"></span>' +
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
        // 入场动画只在首次创建时播放一次, 之后 resize/max 不再重播
        root.classList.add('spw-in');
        setTimeout(function () {
            if (self.root === root) root.classList.remove('spw-in');
        }, 200);
        this.root = root;
        this.titleEl = root.querySelector('[data-role="title"]');
        this.subtitleEl = root.querySelector('[data-role="subtitle"]');
        this.betaEl = root.querySelector('[data-role="beta"]');
        this.bodyEl = root.querySelector('[data-role="body"]');
        this.stageEl = root.querySelector('[data-role="stage"]');
        this.canvas = root.querySelector('[data-role="canvas"]');
        this.ctx = this.canvas.getContext('2d');
        this.velCanvas = root.querySelector('[data-role="velcanvas"]');
        this.velCtx = this.velCanvas.getContext('2d');
        this.playModeLabel = root.querySelector('[data-role="playmode-label"]');
        this.gridLabel = root.querySelector('[data-role="grid-label"]');

        this.bind();
        this.applySettings();
        this.syncTexts();
        this.applyRect();
        this.applyMinimized();
        if (this.layoutMode === 'fullscreen') {
            syncBodyScrollLock();
            this._pushFullscreenHistory();
        }
        this.autoFit();
        this.startLoop();
        if (this.minimized) this.restoreMiniStackPos();
        requestAnimationFrame(function () { if (self.root) self.autoFit(); });
    };

    SegmentWindow.prototype.applySettings = function () {
        var s = loadSettings();
        this.showRuler = s.ruler !== false;
        this.showMinimap = s.minimap !== false;
        this.showVelocity = s.velocity !== false;
        if (!this.root) return;
        var vel = this.root.querySelector('[data-role="vel"]');
        if (vel) vel.style.display = this.showVelocity ? '' : 'none';
        this.rulerH = this.showRuler ? RULER_H : 0;
        this.invalidate(true);
        this.autoFit(true);
    };

    SegmentWindow.prototype.syncTexts = function () {
        if (!this.root) return;
        var lane = this.lane;
        var laneName = (lane && lane.name) ? lane.name : t('片段轨道') + ' ' + (lane && lane.id ? lane.id : '');
        this.titleEl.textContent = laneName;
        this.subtitleEl.textContent = (this.seg && this.seg.name) ? this.seg.name : '';
        this.playModeLabel.textContent = this.playMode === 'sync' ? t('同步播放') : t('仅本窗口');
        this.gridLabel.textContent = t(GRID_LABELS[this.grid]);
        if (this.betaEl) this.betaEl.textContent = t('测试版');
        var pm = this.root.querySelector('[data-act="playmode"]');
        if (pm) pm.setAttribute('aria-checked', this.playMode === 'sync' ? 'true' : 'false');
        this.updateToolButtons();
    };

    SegmentWindow.prototype.updateToolButtons = function () {
        if (!this.root) return;
        var btns = this.root.querySelectorAll('[data-tool]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === this.tool);
        }
        var pm = this.root.querySelector('[data-act="playmode"]');
        if (pm) pm.classList.toggle('on', this.playMode === 'sync');
        var mx = this.root.querySelector('[data-act="maximize"]');
        if (mx) {
            var ic = mx.querySelector('i');
            if (ic) ic.className = 'fa-solid ' + (this.maximized ? 'fa-compress' : 'fa-expand');
        }
    };

    SegmentWindow.prototype.bind = function () {
        var self = this;
        var tbar = this.root.querySelector('[data-role="titlebar"]');

        // 按钮不获得焦点, 避免浏览器用空格/回车触发已聚焦按钮
        this.root.addEventListener('mousedown', function (e) {
            self.focus();
            if (e.target.closest && e.target.closest('button')) e.preventDefault();
        }, true);

        tbar.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            if (e.button !== 0) return;
            if (self.layoutMode === 'fullscreen') return;
            self.beginWindowDrag(e);
        });
        tbar.addEventListener('dblclick', function (e) {
            if (e.target.closest('button')) return;
            if (self.layoutMode === 'fullscreen') return;
            self.toggleMaximize();
        });

        this.root.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('button') : null;
            if (!btn) return;
            var act = btn.getAttribute('data-act');
            if (act === 'close') self.close();
            else if (act === 'back') self.backToSegments();
            else if (act === 'minimize') self.toggleMinimize();
            else if (act === 'maximize') self.toggleMaximize();
            else if (act === 'playmode') self.togglePlayMode();
            else if (act === 'grid') self.cycleGrid();
            else if (act === 'rowh-out') self.changeRowH(-1);
            else if (act === 'rowh-in') self.changeRowH(1);
            else if (act === 'tool-draw') self.setTool('draw');
            else if (act === 'tool-erase') self.setTool('erase');
            else if (act === 'tool-select') self.setTool('select');
        });

        var handles = this.root.querySelectorAll('[data-rz]');
        for (var i = 0; i < handles.length; i++) {
            handles[i].addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                self.focus();
                self.beginResize(e, this.getAttribute('data-rz'));
            });
        }

        // Pointer Events 优先 (触屏/触控笔), 不支持时回退到 mouse, 两者不重复注册
        var usePointer = !!window.PointerEvent;
        if (usePointer) {
            this.canvas.addEventListener('pointerdown', function (e) { self.onCanvasDown(e); });
            this.canvas.addEventListener('pointermove', function (e) { self.onCanvasMove(e); });
            this.canvas.addEventListener('pointerleave', function () {
                self._hover = null;
                self._hoverKey = -1;
                self.scheduleTempTopReset(0);
            });
            // 触屏抬起在任意位置都要清理双指状态 (手指可能移出画布)
            this._docPointerUp = function (e) { self.onDocPointerEnd(e); };
            document.addEventListener('pointerup', this._docPointerUp);
            document.addEventListener('pointercancel', this._docPointerUp);
        } else {
            this.canvas.addEventListener('mousedown', function (e) { self.onCanvasDown(e); });
            this.canvas.addEventListener('mousemove', function (e) { self.onCanvasMove(e); });
            this.canvas.addEventListener('mouseleave', function () {
                self._hover = null;
                self._hoverKey = -1;
                self.scheduleTempTopReset(0);
            });
        }
        this.canvas.addEventListener('dblclick', function (e) { self.onCanvasDblClick(e); });
        this.canvas.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            self.onCanvasRightClick(e);
        });
        this.canvas.addEventListener('wheel', function (e) { self.onWheel(e); }, { passive: false });
        this.velCanvas.addEventListener('mousedown', function (e) { self.onVelDown(e); });

        // 键盘快捷键: 捕获阶段拦截, 避免穿透到主界面 (也避免按钮被浏览器空格选中)
        this.root.addEventListener('keydown', function (e) { self.onKey(e); }, true);
    };

    // ---------- 窗口位置 / 尺寸 ----------
    SegmentWindow.prototype.applyRect = function () {
        if (!this.root) return;
        if (this.layoutMode === 'fullscreen') {
            // 全屏页面固定铺满视口 (position: fixed), 不写具体像素, 旋转时自动跟随
            this.root.style.left = '0px';
            this.root.style.top = '0px';
            this.root.style.width = '100%';
            this.root.style.height = '100%';
            this.needLayout = true;
            return;
        }
        var r = this.rect;
        this.root.style.left = r.x + 'px';
        this.root.style.top = r.y + 'px';
        this.root.style.width = r.w + 'px';
        this.root.style.height = r.h + 'px';
        this.needLayout = true;
    };

    SegmentWindow.prototype.persist = function () {
        var rect = (this.layoutMode === 'fullscreen' && this._floatRect) ? this._floatRect : this.rect;
        var store = loadLayout();
        store[laneKey(this.lane)] = {
            x: rect.x, y: rect.y, w: rect.w, h: rect.h,
            max: this.layoutMode === 'fullscreen' ? false : this.maximized,
            min: this.layoutMode === 'fullscreen' ? false : this.minimized,
            rowH: this.rowH
        };
        saveLayout();
    };

    // 行高变更较频繁 (滚轮/双指), 节流写 localStorage, 避免同步写入卡顿
    SegmentWindow.prototype.schedulePersist = function () {
        var self = this;
        if (this._rowHSaveTimer) clearTimeout(this._rowHSaveTimer);
        this._rowHSaveTimer = setTimeout(function () {
            self._rowHSaveTimer = 0;
            if (self.root) self.persist();
        }, 250);
    };

    SegmentWindow.prototype.focus = function () {
        this.z = BASE_Z + (++zSeq);
        if (this.z > 8990) { zSeq = 0; this.z = BASE_Z + (++zSeq); }
        this.root.style.zIndex = String(this.z);
        try { this.root.focus({ preventScroll: true }); } catch (e) {}
        lastFocused = this;
    };

    SegmentWindow.prototype.beginWindowDrag = function (ev) {
        var self = this;
        var startX = ev.clientX, startY = ev.clientY;
        var base = { x: this.rect.x, y: this.rect.y };
        if (this.minimized) this.manualMiniPos = true;
        if (this.root) this.root.classList.add('spw-dragging');
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
            if (self.root) self.root.classList.remove('spw-dragging');
            self.persist();
        }
        docDrag(move, up);
    };

    SegmentWindow.prototype.beginResize = function (ev, dir) {
        if (this.maximized || this.minimized) return;
        var self = this;
        var startX = ev.clientX, startY = ev.clientY;
        var base = { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h };
        if (this.root) this.root.classList.add('spw-dragging');
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
            if (self.root) self.root.classList.remove('spw-dragging');
            self.persist();
            self.autoFit(true);
        }
        docDrag(move, up);
    };

    // ---------- 全屏 / 浮窗布局 ----------
    SegmentWindow.prototype.setLayoutMode = function (mode) {
        if (!this.root) return;
        if (mode === 'fullscreen') this.enterFullscreen();
        else this.exitFullscreen();
    };

    SegmentWindow.prototype.enterFullscreen = function () {
        if (!this.root || this.layoutMode === 'fullscreen') return;
        if (this.minimized) this.restoreFromMinimized();
        this._floatRect = { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h };
        this.layoutMode = 'fullscreen';
        this.maximized = false;
        this.minimized = false;
        this.root.classList.remove('spw-max', 'spw-min');
        this.root.classList.add('spw-fs');
        this.applyRect();
        syncBodyScrollLock();
        this._pushFullscreenHistory();
        this.updateToolButtons();
        this.autoFit(true);
    };

    SegmentWindow.prototype.exitFullscreen = function (keepHistory) {
        if (this.layoutMode !== 'fullscreen') return;
        this.layoutMode = 'float';
        if (this.root) {
            this.root.classList.remove('spw-fs');
            this.applyMinimized();
        }
        this.rect = this._floatRect || this.defaultRect();
        this._floatRect = null;
        this.applyRect();
        syncBodyScrollLock();
        if (!keepHistory && this._fsHistoryPushed) {
            // 主动返回: 弹出本窗口压入的历史项, 同时避免 popstate 再次关闭窗口
            this._fsHistoryPushed = false;
            try { window.history.back(); } catch (e) {}
        }
        this.persist();
        this.autoFit(true);
    };

    // 左上角返回 / 浏览器 back: 退出全屏并关闭窗口, 回到片段模式
    SegmentWindow.prototype.backToSegments = function () {
        this.exitFullscreen(true);
        this.close();
    };

    SegmentWindow.prototype._pushFullscreenHistory = function () {
        if (this._fsHistoryPushed || !window.history || !history.pushState) return;
        try {
            history.pushState({ segmentPianoFullscreen: 1 }, '', window.location.href);
            this._fsHistoryPushed = true;
        } catch (e) {}
    };

    SegmentWindow.prototype.toggleMaximize = function () {
        if (this.layoutMode === 'fullscreen') return;
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
        this.updateToolButtons();
        this.autoFit(true);
        this.persist();
    };

    SegmentWindow.prototype.toggleMinimize = function () {
        if (this.layoutMode === 'fullscreen') return;
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

    SegmentWindow.prototype.restoreMiniStackPos = function () {
        var vw = window.innerWidth;
        var slot = 0;
        for (var i = 0; i < wins.length; i++) {
            var o = wins[i];
            if (o !== this && o.minimized && !o.manualMiniPos) slot++;
        }
        this.rect.x = Math.max(0, vw - MINI_W - 16);
        this.rect.y = 48 + slot * (MINI_H + 6);
    };

    SegmentWindow.prototype.defaultRect = function () {
        var vw = window.innerWidth, vh = window.innerHeight;
        var w = clamp(880, MIN_W, vw);
        var h = clamp(500, MIN_H, vh);
        return {
            x: Math.max(0, Math.round((vw - w) / 2)),
            y: Math.max(0, Math.round((vh - h) / 2) - 30),
            w: w, h: h
        };
    };

    SegmentWindow.prototype.restoreFromMinimized = function () {
        if (!this.minimized) return;
        this.minimized = false;
        this.root.classList.remove('spw-min');
        this.rect = this.prevRect || this.defaultRect();
        this.prevRect = null;
        this.applyRect();
        this.autoFit();
        this.persist();
    };

    SegmentWindow.prototype.applyMinimized = function () {
        this.root.classList.toggle('spw-min', this.minimized);
        if (this.minimized) {
            if (this.rect.w !== MINI_W) {
                this.rect = { x: this.rect.x, y: this.rect.y, w: MINI_W, h: MINI_H };
            }
            if (!isFinite(this.rect.x) || this.rect.x === 0) this.restoreMiniStackPos();
        }
    };

    SegmentWindow.prototype.close = function () {
        this.stopLoop();
        if (this.root) this.persist();
        if (this._rowHSaveTimer) { clearTimeout(this._rowHSaveTimer); this._rowHSaveTimer = 0; }
        if (this._docPointerUp) {
            document.removeEventListener('pointerup', this._docPointerUp);
            document.removeEventListener('pointercancel', this._docPointerUp);
            this._docPointerUp = null;
        }
        this._touchPts = {};
        this._pinch = null;
        // 关闭时若本窗口暂停了主播放, 恢复主编辑器播放状态
        if (this.playMode === 'local') {
            try { if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll(); } catch (e) {}
            var h = host();
            if (this._mainWasPlaying && h && !h.state.isPlaying && window.WebNBS && WebNBS.handlePlayToggle) {
                WebNBS.handlePlayToggle();
            }
            this._mainWasPlaying = false;
        }
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
        removeWin(this);
        syncBodyScrollLock();
        if (this._fsHistoryPushed) {
            // 移除本窗口压入的全屏历史项, 避免下次 back 关闭别的窗口
            this._fsHistoryPushed = false;
            try { window.history.back(); } catch (e) {}
        }
    };

    SegmentWindow.prototype.destroy = function () { this.close(); };

    // ---------- 片段切换 ----------
    SegmentWindow.prototype.setSegment = function (seg) {
        if (!seg) return;
        this.seg = seg;
        this.segId = seg.id;
        this.selection = [];
        this.tempTop = null;
        if (seg.notes && seg.notes.length && isFinite(seg.notes[0].instrument)) {
            this.currentInstrument = seg.notes[0].instrument;
        }
        if (this.minimized) this.restoreFromMinimized();
        this.invalidate(true);
        this.syncTexts();
        this.autoFit();
    };

    SegmentWindow.prototype.resync = function () {
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
        this.invalidate(true);
        this.syncTexts();
    };

    SegmentWindow.prototype.autoFit = function (keepView) {
        if (!this.canvas || !this.seg) return;
        if (!keepView) {
            var r = (this.seg.end - this.seg.start) || 64;
            var avail = Math.max(120, this.stageEl.clientWidth - KEYBAR_W);
            var pad = 8;
            this.pxPerTick = clamp(avail / (r + pad), 0.8, 40);
            this.viewStart = (this.seg.start || 0) - 4;
            this.fitKeyRange();
        }
        this.resizeCanvas();
        this.invalidate(true);
    };

    SegmentWindow.prototype.fitKeyRange = function () {
        var notes = (this.seg && this.seg.notes) || [];
        var lo = 999, hi = -999;
        for (var i = 0; i < notes.length; i++) {
            var k = notes[i].key || 0;
            if (k < lo) lo = k;
            if (k > hi) hi = k;
        }
        if (hi < lo) { lo = 33; hi = 57; }
        this.minKey = Math.max(0, lo - 2);
        this.maxKey = Math.min(87, hi + 2);
        this.scrollY = 0;
    };

    SegmentWindow.prototype.clampScrollY = function () {
        var maxScroll = Math.max(0, (this.maxKey - this.minKey + 1) * this.rowH
            - (this.ch - this.stageTop()));
        this.scrollY = clamp(this.scrollY, 0, maxScroll);
    };

    // 行高缩放 (范围 8..40px): anchorY 为画布内 Y, 保持该处音高位置不跳
    SegmentWindow.prototype.setRowH = function (next, anchorY) {
        next = clamp(next, ROW_H_MIN, ROW_H_MAX);
        if (!isFinite(next) || Math.abs(next - this.rowH) < 0.0001) return;
        var top = this.stageTop();
        var ay = (anchorY === undefined || anchorY === null) ? (top + (this.ch - top) / 2) : anchorY;
        var keyFloat = this.maxKey - (ay - top + this.scrollY) / this.rowH;
        this.rowH = next;
        this.scrollY = (this.maxKey - keyFloat) * next - (ay - top);
        this.clampScrollY();
        this._sceneDirty = true;
        this._velDirty = true;
        this.schedulePersist();
    };

    // 工具栏 +/- 按钮: 每步 2px, 以画布中心为锚点
    SegmentWindow.prototype.changeRowH = function (dir) {
        this.setRowH(this.rowH + (dir < 0 ? -2 : 2), null);
    };

    SegmentWindow.prototype.resizeCanvas = function () {
        if (!this.canvas || !this.stageEl) return;
        var dpr = window.devicePixelRatio || 1;
        var w = Math.max(80, this.stageEl.clientWidth);
        var h = Math.max(60, this.stageEl.clientHeight);
        var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
        var sizeChanged = (this.canvas.width !== pw || this.canvas.height !== ph);
        if (sizeChanged) {
            this.canvas.width = pw;
            this.canvas.height = ph;
            this._scene.width = pw;
            this._scene.height = ph;
        }
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.cw = w;
        this.ch = h;
        this.needLayout = false;
        // 仅在画布实际尺寸变化时重绘静态场景, 避免拖动/布局时反复清屏
        if (sizeChanged) this.invalidate(true);

        if (!this.showVelocity) { this.vw = 0; this.vh = 0; return; }
        var vh = Math.max(40, this.velCanvas.parentNode.clientHeight);
        var vw = Math.max(80, this.velCanvas.parentNode.clientWidth);
        if (this.velCanvas.width !== Math.round(vw * dpr) || this.velCanvas.height !== Math.round(vh * dpr)) {
            this.velCanvas.width = Math.round(vw * dpr);
            this.velCanvas.height = Math.round(vh * dpr);
        }
        this.velCanvas.style.width = vw + 'px';
        this.velCanvas.style.height = vh + 'px';
        this.vw = vw;
        this.vh = vh;
    };

    // ---------- 播放 ----------
    SegmentWindow.prototype.startLoop = function () {
        var self = this;
        this.rafId = requestAnimationFrame(function tick() {
            if (!self.root) return;
            if (self.needLayout) self.resizeCanvas();
            self.stepLocal();
            self.draw();
            self.rafId = requestAnimationFrame(tick);
        });
    };
    SegmentWindow.prototype.stopLoop = function () {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        this.freezeLocal();
    };

    SegmentWindow.prototype.togglePlayMode = function () {
        var h = host();
        if (this.playMode === 'sync') {
            this.playMode = 'local';
            // 仅本窗口播放: 暂停主编辑器播放, 避免整首歌同时发声
            this._mainWasPlaying = !!(h && h.state.isPlaying);
            if (this._mainWasPlaying && window.WebNBS && WebNBS.handlePlayToggle) WebNBS.handlePlayToggle();
            this._localPaused = false;
            this.freezeLocal();
            this.localTick = 0;
            this._localBaseTick = 0;
            this._localPrev = performance.now();
            try { if (window.AudioEngine && AudioEngine.init) AudioEngine.init(); } catch (e) {}
        } else {
            this.playMode = 'sync';
            this.freezeLocal();
            this._localPaused = false;
            try { if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll(); } catch (e) {}
            // 切回同步: 若原本主窗口正在播放, 则恢复主窗口驱动的播放
            if (this._mainWasPlaying && h && !h.state.isPlaying && window.WebNBS && WebNBS.handlePlayToggle) {
                WebNBS.handlePlayToggle();
            }
            this._mainWasPlaying = false;
        }
        this.updateToolButtons();
        this.syncTexts();
    };

    SegmentWindow.prototype.toggleLocalPause = function () {
        if (this.playMode !== 'local') return;
        this._localPaused = !this._localPaused;
        if (this._localPaused) {
            this.freezeLocal();
            try { if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll(); } catch (e) {}
        } else {
            this._localPrev = performance.now();
        }
    };

    SegmentWindow.prototype.segDuration = function () {
        return this.seg ? Math.max(1, this.seg.end - this.seg.start) : 1;
    };

    // 「仅本窗口」播放: 不依赖主窗口播放状态, 独立推进并循环发声, 不推进主播放头
    SegmentWindow.prototype.stepLocal = function () {
        var h = host();
        if (!h || !this.seg) return;
        if (this.playMode !== 'local' || this._localPaused) {
            if (this._localOn) {
                this._localBaseTick = this.localTick;
                this._localOn = false;
            }
            return;
        }
        var now = performance.now();
        if (!this._localOn) {
            this._localOn = true;
            this._localPrev = now;
            if (!isFinite(this._localBaseTick)) this._localBaseTick = this.localTick || 0;
            this.localTick = this._localBaseTick;
            this._prevLocalTick = this.localTick;
        }
        var dt = Math.min(120, now - this._localPrev);
        this._localPrev = now;
        var tempo = Math.max(0.01, h.state.tempo || 20);
        var dur = this.segDuration();
        var prev = this.localTick;
        this.localTick += dt * tempo / 1000;
        if (this.localTick >= dur) {
            // 循环: 先播放尾部区间, 再从起点开始
            this.triggerLocalRange(prev, dur);
            this.localTick = this.localTick % dur;
            this.triggerLocalRange(0, this.localTick);
        } else {
            this.triggerLocalRange(prev, this.localTick);
        }
    };

    SegmentWindow.prototype.triggerLocalRange = function (a, b) {
        if (!window.AudioEngine || !window.AudioEngine.playNote || !this.seg) return;
        var notes = this.seg.notes || [];
        if (!this._localSorted || this._localSortedSeg !== this.seg || this._localSortedLen !== notes.length) {
            this._localSorted = notes.slice().sort(function (x, y) { return (x.rel || 0) - (y.rel || 0); });
            this._localSortedSeg = this.seg;
            this._localSortedLen = notes.length;
        }
        var list = this._localSorted;
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            var rel = n.rel || 0;
            if (rel < a) continue;
            if (rel >= b) break;
            try { AudioEngine.playNote(n.instrument, n.key, n.velocity, n.pan); } catch (e) {}
        }
    };

    SegmentWindow.prototype.freezeLocal = function () {
        if (!this._localOn) return;
        this._localBaseTick = this.localTick;
        this._localOn = false;
    };

    SegmentWindow.prototype.playheadTick = function () {
        var h = host();
        if (this.playMode === 'local') {
            return (this.seg ? (this.seg.start || 0) : 0) + this.localTick;
        }
        if (!h) return 0;
        if (h.state.isPlaying) {
            var pr = h.state.pianoRoll;
            var base = (pr && pr.playheadTick != null) ? pr.playheadTick : (h.state.currentTick || 0);
            if (pr && pr._lastTickTime && pr._tickDuration > 0) {
                var frac = clamp((performance.now() - pr._lastTickTime) / pr._tickDuration, 0, 1);
                base += frac;
            }
            return base;
        }
        return h.state.currentTick || 0;
    };

    SegmentWindow.prototype.seekToTick = function (tick) {
        var h = host();
        if (!h) return;
        var segStart = this.seg ? (this.seg.start || 0) : 0;
        if (this.playMode === 'local') {
            var dur = this.segDuration();
            this.localTick = clamp(tick - segStart, 0, dur);
            this._localBaseTick = this.localTick;
            this._localPrev = performance.now();
        } else if (h.seekToTick) {
            h.seekToTick(Math.max(0, Math.round(tick)), true);
        }
    };

    // ---------- 坐标换算 ----------
    SegmentWindow.prototype.stageTop = function () { return this.showRuler ? RULER_H : 0; };

    SegmentWindow.prototype.stageRect = function () {
        var top = this.stageTop();
        return { x: KEYBAR_W, y: top, w: this.cw - KEYBAR_W, h: Math.max(30, this.ch - top) };
    };
    SegmentWindow.prototype.tickToX = function (tick) {
        return KEYBAR_W + (tick - this.viewStart) * this.pxPerTick;
    };
    SegmentWindow.prototype.xToTick = function (x) {
        return this.viewStart + (x - KEYBAR_W) / this.pxPerTick;
    };
    SegmentWindow.prototype.keyToY = function (key) {
        return this.stageTop() + (this.maxKey - key) * this.rowH - this.scrollY;
    };
    SegmentWindow.prototype.yToKey = function (y) {
        return Math.round(this.maxKey - (y - this.stageTop() + this.scrollY) / this.rowH);
    };

    // ---------- 分组 (延音合并 + 叠层) ----------
    SegmentWindow.prototype._buildGroups = function (seg) {
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
            list.sort(function (a, b) {
                var ra = a.note.rel || 0, rb = b.note.rel || 0;
                if (ra !== rb) return ra - rb;
                return a.z - b.z;
            });
            var cur = null;
            for (var j = 0; j < list.length; j++) {
                var item = list[j];
                var rel = item.note.rel || 0;
                if (cur && rel >= cur.start && rel <= cur.end + 1) {
                    cur.notes.push(item);
                    if (rel > cur.end) cur.end = rel;
                    continue;
                }
                cur = {
                    layer: isFinite(item.note.layer) ? item.note.layer : 0,
                    key: item.note.key || 0,
                    start: rel,
                    end: rel,
                    notes: [item]
                };
                groups.push(cur);
            }
        }
        return groups;
    };

    // 缓存分组: 播放期间每帧都要用, 不能每次重建
    SegmentWindow.prototype.groups = function (seg) {
        if (!seg) return [];
        if (this._gcache && this._gcache.ver === this._ver && this._gcache.seg === seg) {
            return this._gcache.list;
        }
        var list = this._buildGroups(seg);
        this._gcache = { ver: this._ver, seg: seg, list: list };
        return list;
    };

    SegmentWindow.prototype.invalidate = function (full) {
        this._ver++;
        this._gcache = null;
        this._sceneDirty = true;
        if (full) this._localSorted = null;
    };

    SegmentWindow.prototype.noteZ = function (note) {
        if (!this._zMap) this._zMap = new WeakMap();
        var z = this._zMap.get(note);
        return z === undefined ? 0 : z;
    };
    SegmentWindow.prototype.raiseNote = function (note) {
        if (!this._zMap) this._zMap = new WeakMap();
        this._zMap.set(note, (this._zSeq = (this._zSeq || 0) + 1));
        this.invalidate();
    };

    SegmentWindow.prototype.groupTop = function (group) {
        var top = group.notes[0];
        for (var i = 1; i < group.notes.length; i++) {
            if (this.noteZ(group.notes[i].note) >= this.noteZ(top.note)) top = group.notes[i];
        }
        if (this.tempTop && this.tempTop.key === group.key && this.tempTop.start === group.start) {
            var idx = this.tempTop.idx % group.notes.length;
            for (var j = 0; j < group.notes.length; j++) {
                if (j === idx) return group.notes[j];
            }
        }
        return top;
    };

    SegmentWindow.prototype.scheduleTempTopReset = function (delay) {
        var self = this;
        if (this.tempTopTimer) clearTimeout(this.tempTopTimer);
        this.tempTopTimer = setTimeout(function () {
            self.tempTop = null;
            self.tempTopTimer = null;
            self.invalidate();
        }, delay === undefined ? 1200 : delay);
    };

    SegmentWindow.prototype.cycleTempTop = function (group, dir) {
        var idx = this.tempTop && this.tempTop.key === group.key && this.tempTop.start === group.start
            ? this.tempTop.idx : (group.notes.length - 1);
        idx = (idx + dir + group.notes.length) % group.notes.length;
        this.tempTop = { key: group.key, start: group.start, idx: idx };
        this.scheduleTempTopReset(1200);
        this.invalidate();
    };

    // ---------- 绘制 ----------
    SegmentWindow.prototype.refresh = function () {
        this.invalidate();
    };

    SegmentWindow.prototype.draw = function () {
        if (!this.root || !this.ctx || !this.cw) return;
        var dpr = window.devicePixelRatio || 1;
        var sceneRedrawn = false;
        // 钢琴键按下明度过渡期间持续重绘静态场景
        if (this._keyAnimUntil && performance.now() < this._keyAnimUntil) this._sceneDirty = true;
        if (this._sceneDirty) {
            this.renderScene();
            this._sceneDirty = false;
            sceneRedrawn = true;
        }
        var ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this._scene, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.drawAnims(ctx);
        this.drawPlayhead(ctx);
        this.drawMarquee(ctx);
        if (this.showVelocity && (this._velDirty || sceneRedrawn)) {
            this._velDirty = false;
            this.drawVelocity();
        }
    };

    SegmentWindow.prototype.renderScene = function () {
        if (!this._sctx || !this.cw) return;
        var ctx = this._sctx;
        var dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var W = this.cw, H = this.ch;
        var top = this.stageTop();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);

        // 音高行背景
        for (var key = this.minKey; key <= this.maxKey; key++) {
            var y = this.keyToY(key);
            if (y > H || y + this.rowH < top) continue;
            ctx.fillStyle = isBlackKey(key) ? C.rowDark : C.rowLight;
            ctx.fillRect(KEYBAR_W, y, W - KEYBAR_W, this.rowH);
        }

        // 时间网格 (三级): 小节线 16 tick = 3px / 节拍线 4 tick = 2px / tick 分割线 1px
        var t0 = Math.floor(this.xToTick(KEYBAR_W));
        var t1 = Math.ceil(this.xToTick(W));
        ctx.strokeStyle = C.gridMinor;
        ctx.lineWidth = 1;
        for (var st = t0; st <= t1; st++) {
            if (st % 4 === 0) continue;
            var sgx = Math.round(this.tickToX(st)) + 0.5;
            if (sgx < KEYBAR_W) continue;
            ctx.beginPath(); ctx.moveTo(sgx, top); ctx.lineTo(sgx, H); ctx.stroke();
        }
        ctx.lineWidth = 2;
        for (var tk = t0; tk <= t1; tk++) {
            if (tk % 4 !== 0 || tk % 16 === 0) continue;
            var gx = Math.round(this.tickToX(tk)) + 0.5;
            if (gx < KEYBAR_W) continue;
            ctx.beginPath(); ctx.moveTo(gx, top); ctx.lineTo(gx, H); ctx.stroke();
        }
        ctx.strokeStyle = C.gridMajor;
        ctx.lineWidth = 3;
        for (var bt = t0; bt <= t1; bt++) {
            if (bt % 16 !== 0) continue;
            var bx = Math.round(this.tickToX(bt)) + 0.5;
            if (bx < KEYBAR_W) continue;
            ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, H); ctx.stroke();
        }
        ctx.lineWidth = 1;

        // 片段范围外压暗
        var segStart = this.seg ? this.seg.start : 0;
        var dur = this.segDuration();
        var sx = this.tickToX(segStart);
        var ex = this.tickToX(segStart + dur);
        ctx.fillStyle = C.outOfRange;
        if (sx > KEYBAR_W) ctx.fillRect(KEYBAR_W, top, Math.min(sx - KEYBAR_W, W - KEYBAR_W), H - top);
        if (ex < W) ctx.fillRect(Math.max(KEYBAR_W, ex), top, W - Math.max(KEYBAR_W, ex), H - top);

        if (this.seg) this.drawSegmentNotes(ctx, this.seg);

        // 键盘
        this.drawKeybar(ctx);

        // 标尺 / 地图
        if (this.showRuler) this.drawRuler(ctx);

        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(KEYBAR_W + 0.5, top);
        ctx.lineTo(KEYBAR_W + 0.5, H);
        ctx.stroke();
    };

    SegmentWindow.prototype.drawRuler = function (ctx) {
        var W = this.cw;
        ctx.fillStyle = C.rulerBg;
        ctx.fillRect(0, 0, W, RULER_H);
        var t0 = Math.floor(this.xToTick(KEYBAR_W));
        var t1 = Math.ceil(this.xToTick(W));
        ctx.font = '10px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        var mapH = 4;
        var mapY = RULER_H - mapH - 4;
        for (var rt = t0; rt <= t1; rt++) {
            if (rt % 16 !== 0) continue;
            var lx = this.tickToX(rt);
            if (lx < KEYBAR_W) continue;
            ctx.strokeStyle = C.rulerTick;
            ctx.beginPath();
            ctx.moveTo(Math.round(lx) + 0.5, 0);
            ctx.lineTo(Math.round(lx) + 0.5, this.showMinimap ? mapY : RULER_H);
            ctx.stroke();
            ctx.fillStyle = C.rulerText;
            ctx.fillText(String(Math.floor(rt / 16) + 1), lx + 3, 10);
        }
        // 视口地图: 整段范围映射到标尺宽度, 框出可见区间
        if (this.showMinimap && this.seg) {
            var segStart = this.seg.start || 0;
            var dur = this.segDuration();
            var mapX0 = KEYBAR_W, mapW = Math.max(1, W - KEYBAR_W);
            ctx.fillStyle = C.mapTrack;
            ctx.fillRect(mapX0, mapY, mapW, mapH);
            var vx0 = this.xToTick(KEYBAR_W);
            var vx1 = this.xToTick(W);
            var f0 = clamp((vx0 - segStart) / dur, 0, 1);
            var f1 = clamp((vx1 - segStart) / dur, 0, 1);
            ctx.fillStyle = C.mapView;
            ctx.fillRect(mapX0 + f0 * mapW, mapY, Math.max(2, (f1 - f0) * mapW), mapH);
            // 片段首尾
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(mapX0, mapY, 1, mapH);
            ctx.fillRect(mapX0 + mapW - 1, mapY, 1, mapH);
        }
        ctx.fillStyle = C.rulerBg;
        ctx.fillRect(0, 0, KEYBAR_W, RULER_H);
        ctx.fillStyle = C.rulerText;
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('小节'), KEYBAR_W / 2, 10);
        ctx.textAlign = 'left';
    };

    SegmentWindow.prototype.drawKeybar = function (ctx) {
        var H = this.ch;
        var top = this.stageTop();
        var rowH = this.rowH;
        var now = performance.now();
        // 按下反馈: 120ms ease-out 明度过渡, 松开后淡回
        var pressAmt = 0;
        if (this._pressKey >= 0) {
            var pt = this._pressHold
                ? clamp((now - this._pressAt) / 120, 0, 1)
                : 1 - clamp((now - this._pressReleaseAt) / 120, 0, 1);
            pressAmt = -0.2 * easeOutCubic(pt);
        }

        // 1) 先完整绘制所有白键 (整宽), 黑键行保留白色底, 便于窄黑键覆盖
        for (var k = this.minKey; k <= this.maxKey; k++) {
            var y = this.keyToY(k);
            if (y > H || y + rowH < top) continue;
            var blackRow = isBlackKey(k);
            var amt = 0;
            if (!blackRow) {
                if (this._hoverKey === k) amt -= 0.10;
                if (this._pressKey === k) amt += pressAmt;
            }
            var base = blackRow ? C.keyWhiteAlt : (pitchClass(k) === 'C' ? C.keyWhite : C.keyWhiteAlt);
            ctx.fillStyle = amt < 0 ? shadeColor(base, amt) : base;
            ctx.fillRect(0, y, KEYBAR_W, rowH);
            // 行分隔
            ctx.fillStyle = C.keyLine;
            ctx.fillRect(0, y + rowH - 1, KEYBAR_W, 1);
            // C 音的分隔更明显
            if (pitchClass(k) === 'C') {
                ctx.fillStyle = C.keyCFrame;
                ctx.fillRect(0, y, KEYBAR_W, 1);
            }
            // 白键音名 (黑键文字由窄条覆盖层绘制)
            if (!blackRow) {
                ctx.font = (pitchClass(k) === 'C' ? 'bold ' : '') + '9px "Segoe UI", system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = C.keyTextDark;
                ctx.fillText(pitchName(k), KEYBAR_W - 5, y + rowH / 2);
            }
        }

        // 2) 黑键: 锚定键盘背面 (左侧), 正面前端留白露出白键
        //    与主编辑器键盘 (piano_roll.js) 一致: 黑键从背面起, 不到达标签/正面侧
        var blackW = Math.round(KEYBAR_W * 0.62);
        var blackX = 0;
        for (var b = this.minKey; b <= this.maxKey; b++) {
            if (!isBlackKey(b)) continue;
            var by = this.keyToY(b);
            if (by > H || by + rowH < top) continue;
            var bamt = 0;
            if (this._hoverKey === b) bamt += 0.12;
            if (this._pressKey === b) bamt += pressAmt;
            ctx.fillStyle = shadeColor(C.keyBlack, bamt);
            ctx.fillRect(blackX, by, blackW, rowH - 1);
            // 前端(右)边缘与顶部细高光, 增强键位边界
            ctx.fillStyle = C.keyLine;
            ctx.fillRect(blackX + blackW - 1, by, 1, rowH - 1);
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(blackX, by, Math.max(0, blackW - 1), 1);
            // 音名 (置于黑键窄条内, 与白键一样右对齐到键面)
            ctx.font = '9px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = C.keyTextLight;
            ctx.fillText(pitchName(b), blackX + blackW - 4, by + rowH / 2);
        }

        // 右侧分隔线
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(KEYBAR_W - 1, top, 1, H - top);
    };

    SegmentWindow.prototype.drawSegmentNotes = function (ctx, seg) {
        var groups = this.groups(seg);
        var base = seg.start || 0;
        var H = this.ch, top = this.stageTop();
        var self = this;
        groups.sort(function (a, b) {
            return self.noteZ(self.groupTop(a).note) - self.noteZ(self.groupTop(b).note);
        });
        var rowH = this.rowH;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var y = this.keyToY(g.key);
            if (y > H || y + rowH < top) continue;
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            if (x + w < KEYBAR_W || x > this.cw) continue;

            var topItem = this.groupTop(g);
            var color = colorFor(topItem.note.instrument);
            var selected = this.isSelected(topItem.note);

            var bh = Math.max(6, rowH - 1);
            var by = y;

            // 纯色音符主体 (无方块纹理/乐器贴图)
            this.drawNoteBody(ctx, x, by, w, bh, color);

            if (selected) {
                ctx.strokeStyle = C.selection;
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 1, by - 1, w + 2, bh + 2);
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, by + 0.5, Math.max(0.5, w - 1), Math.max(0.5, bh - 1));
            }

            // 文字: 只在起始端
            var textX = x + 4;
            var label = pitchName(g.key);
            ctx.font = 'bold 9px "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            var tw = ctx.measureText(label).width;
            if (textX + tw + 2 <= x + w) {
                var oo = g.key < MINECRAFT_PITCH_MIN || g.key > MINECRAFT_PITCH_MAX;
                ctx.fillStyle = oo ? '#ff6b6b' : 'rgba(255,255,255,0.95)';
                ctx.fillText(label, textX, by + bh / 2);
            }
            ctx.globalAlpha = 1;
        }
    };

    // 绘制音符主体: 纯色 + 顶部高光/底部阴影
    SegmentWindow.prototype.drawNoteBody = function (ctx, x, y, w, h, color) {
        var rw = Math.max(1, w), rh = Math.max(1, h);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, rw, rh);
        var edge = Math.min(2, rh * 0.28);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x, y, rw, edge);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, y + rh - edge, rw, edge);
    };

    SegmentWindow.prototype.isSelected = function (note) {
        for (var i = 0; i < this.selection.length; i++) {
            if (this.selection[i] === note) return true;
        }
        return false;
    };

    SegmentWindow.prototype.applyMarquee = function (keepSel, mq) {
        if (!mq || !this.seg) return;
        var rx0 = Math.min(mq.x0, mq.x1), rx1 = Math.max(mq.x0, mq.x1);
        var ry0 = Math.min(mq.y0, mq.y1), ry1 = Math.max(mq.y0, mq.y1);
        if (rx1 - rx0 < 2 && ry1 - ry0 < 2) return;
        var groups = this.groups(this.seg);
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
        this.invalidate();
    };

    // 力度控制器: FL 风格细竖线 + 顶端方柄
    SegmentWindow.prototype.drawVelocity = function () {
        var ctx = this.velCtx;
        if (!ctx || !this.vw) return;
        var dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var W = this.vw, H = this.vh;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.velBg;
        ctx.fillRect(0, 0, W, H);

        // 左侧标签列
        ctx.fillStyle = 'rgba(235,245,250,0.5)';
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('力度'), 6, 12);

        if (!this.seg) return;
        var groups = this.groups(this.seg);
        var base = this.seg.start;
        var top = 18, bottom = Math.max(top + 4, H - 6);

        // 100 参考线
        ctx.strokeStyle = C.velGrid;
        ctx.beginPath();
        ctx.moveTo(KEYBAR_W, bottom - (bottom - top) * 0.5 + 0.5);
        ctx.lineTo(W, bottom - (bottom - top) * 0.5 + 0.5);
        ctx.stroke();

        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var n = this.groupTop(g).note;
            var x = Math.round(this.tickToX(base + g.start)) + 0.5;
            if (x < KEYBAR_W || x > W) continue;
            var v = isFinite(n.velocity) ? n.velocity : 100;
            var y = bottom - (bottom - top) * clamp(v, 0, 200) / 200;
            var sel = this.isSelected(n);
            ctx.strokeStyle = sel ? C.velLineSel : C.velLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, bottom);
            ctx.lineTo(x, y);
            ctx.stroke();
            // 顶端方柄
            ctx.fillStyle = sel ? C.velHandleSel : C.velHandle;
            ctx.fillRect(x - 2.5, y - 3, 5, 6);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(KEYBAR_W + 0.5, 0);
        ctx.lineTo(KEYBAR_W + 0.5, H);
        ctx.stroke();
    };

    SegmentWindow.prototype.drawPlayhead = function (ctx) {
        if (!this.seg) return;
        var pt = this.playheadTick();
        var px = this.tickToX(pt);
        var top = this.stageTop();
        if (px < KEYBAR_W || px > this.cw) return;
        ctx.strokeStyle = C.playhead;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.round(px) + 0.5, top);
        ctx.lineTo(Math.round(px) + 0.5, this.ch);
        ctx.stroke();
        ctx.lineWidth = 1;
        if (top > 0) {
            ctx.fillStyle = C.playhead;
            ctx.beginPath();
            ctx.moveTo(px - 4, 0);
            ctx.lineTo(px + 4, 0);
            ctx.lineTo(px, 7);
            ctx.closePath();
            ctx.fill();
        }
    };

    SegmentWindow.prototype.drawMarquee = function (ctx) {
        if (!this.dragging || this.dragging.mode !== 'marquee') return;
        var d = this.dragging.marq;
        var rx = Math.min(d.x0, d.x1), ry = Math.min(d.y0, d.y1);
        var rw = Math.abs(d.x1 - d.x0), rh = Math.abs(d.y1 - d.y0);
        ctx.fillStyle = 'rgba(76,194,255,0.14)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = 'rgba(76,194,255,0.7)';
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    };

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutBack(t) {
        var c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    SegmentWindow.prototype.addAnim = function (type, key, rel, end, instrument) {
        this._anims.push({
            type: type, key: key, rel: rel, end: end,
            instrument: instrument,
            t0: performance.now(),
            dur: type === 'delete' ? 200 : 300
        });
    };

    SegmentWindow.prototype.drawAnims = function (ctx) {
        if (!this._anims.length) return;
        var now = performance.now();
        var alive = [];
        var base = this.seg ? (this.seg.start || 0) : 0;
        var top = this.stageTop();
        for (var i = 0; i < this._anims.length; i++) {
            var a = this._anims[i];
            var raw = clamp((now - a.t0) / a.dur, 0, 1);
            if (raw >= 1) continue;
            alive.push(a);
            var x = this.tickToX(base + a.rel);
            var w = Math.max(this.pxPerTick, (a.end - a.rel + 1) * this.pxPerTick);
            var y = this.keyToY(a.key);
            if (y > this.ch || y + this.rowH < top) continue;
            var bh = Math.max(6, this.rowH - 1);
            var color = colorFor(a.instrument);
            var t = easeOutCubic(raw);
            var scale, alpha, fill;
            if (a.type === 'delete') {
                // 删除: 200ms 淡出 + 缩小
                scale = 1 - 0.15 * t;
                alpha = 1 - t;
                fill = color;
            } else {
                // 放置: 300ms 从亮色/1.15 缩放到目标纯色/1.0
                scale = 1.15 - 0.15 * t;
                alpha = 1;
                fill = shadeColor(color, 0.45 * (1 - t));
            }
            ctx.save();
            ctx.globalAlpha = alpha;
            var cx = x + w / 2, cy = y + bh / 2;
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, w, bh);
            var edge = Math.min(2, bh * 0.28);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(x, y, w, edge);
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.fillRect(x, y + bh - edge, w, edge);
            ctx.strokeStyle = a.type === 'delete' ? 'rgba(233,69,96,' + alpha + ')' : 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0.5, w - 1), Math.max(0.5, bh - 1));
            ctx.restore();
        }
        this._anims = alive;
    };

    // ---------- 命中测试 ----------
    // 命中测试: 按绘制顺序反向遍历, 最上层音符优先
    SegmentWindow.prototype.hitTest = function (mx, my) {
        if (!this.seg || my < this.stageTop()) return null;
        var groups = this.groups(this.seg);
        var base = this.seg.start;
        var self = this;
        var ordered = groups.slice().sort(function (a, b) {
            return self.noteZ(self.groupTop(a).note) - self.noteZ(self.groupTop(b).note);
        });
        for (var i = ordered.length - 1; i >= 0; i--) {
            var g = ordered[i];
            var y = this.keyToY(g.key);
            if (my < y || my > y + this.rowH) continue;
            var x = this.tickToX(base + g.start);
            var w = Math.max(this.pxPerTick, (g.end - g.start + 1) * this.pxPerTick);
            if (mx < x || mx > x + w) continue;
            var top = this.groupTop(g);
            var edge = null;
            if (mx >= x + w - 5 && w > 8) edge = 'right';
            return { group: g, note: top.note, item: top, edge: edge, x: x, w: w };
        }
        return null;
    };

    SegmentWindow.prototype.groupNotes = function (g) {
        var out = [];
        if (!g) return out;
        for (var i = 0; i < g.notes.length; i++) out.push(g.notes[i].note);
        return out;
    };

    SegmentWindow.prototype.hitGroupAt = function (mx) {
        if (!this.seg) return null;
        var groups = this.groups(this.seg);
        var base = this.seg.start;
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

    // ---------- 触屏双指缩放 (Pointer Events) ----------
    SegmentWindow.prototype.beginPinch = function () {
        var ids = Object.keys(this._touchPts);
        if (ids.length < 2) return;
        var a = this._touchPts[ids[0]], b = this._touchPts[ids[1]];
        var r = this.canvas.getBoundingClientRect();
        this._pinch = {
            ids: [ids[0], ids[1]],
            dx0: Math.max(1, Math.abs(a.x - b.x)),
            dy0: Math.max(1, Math.abs(a.y - b.y)),
            dx: Math.abs(a.x - b.x),
            dy: Math.abs(a.y - b.y),
            axis: null,
            cx: (a.x + b.x) / 2 - r.left,
            cy: (a.y + b.y) / 2 - r.top
        };
        // 取消单指正在进行的编辑, 避免双指落下时误放置/误拖动
        if (this.dragging && this.dragging.mode === 'draw' && this.dragging.placedNote) {
            var idx = this.seg.notes.indexOf(this.dragging.placedNote);
            if (idx >= 0) {
                this.seg.notes.splice(idx, 1);
                this.dragging.placedNote = null;
                this.commitEdit();
            }
        }
        this.dragging = null;
        this.canvas.style.cursor = '';
        this._stopPinchDrag();
        this._sceneDirty = true;
    };

    // 双指移动只记录比例, 不实时改动视图; 松手时按最终比例一次性应用
    SegmentWindow.prototype.onPinchMove = function (ev) {
        var p = this._pinch;
        if (!p) return;
        if (this._touchPts[ev.pointerId]) {
            this._touchPts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        }
        var a = this._touchPts[p.ids[0]], b = this._touchPts[p.ids[1]];
        if (!a || !b) return;
        ev.preventDefault();
        var dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        // 按位移变化量判定主导轴, 一次手势只缩放一个方向, 互不串扰
        if (!p.axis) {
            var chX = Math.abs(dx - p.dx0), chY = Math.abs(dy - p.dy0);
            if (Math.max(chX, chY) > 8) p.axis = chX >= chY ? 'x' : 'y';
        }
        p.dx = dx;
        p.dy = dy;
        var r = this.canvas.getBoundingClientRect();
        p.cx = (a.x + b.x) / 2 - r.left;
        p.cy = (a.y + b.y) / 2 - r.top;
    };

    SegmentWindow.prototype.applyPinch = function () {
        var p = this._pinch;
        if (!p || !p.axis) return;
        if (p.axis === 'x') {
            var fx = p.dx / p.dx0;
            if (fx > 0.05 && Math.abs(fx - 1) > 0.01) this.zoomTicks(fx, p.cx);
        } else {
            var fy = p.dy / p.dy0;
            if (fy > 0.05 && Math.abs(fy - 1) > 0.01) this.setRowH(this.rowH * fy, p.cy);
        }
    };

    // 横向 tick 密度缩放, 以鼠标/手指 X 为锚点
    SegmentWindow.prototype.zoomTicks = function (factor, anchorX) {
        var ax = (anchorX === undefined) ? KEYBAR_W : anchorX;
        var anchorTick = this.xToTick(ax);
        var next = clamp(this.pxPerTick * factor, 0.5, 48);
        if (Math.abs(next - this.pxPerTick) < 0.001) return;
        this.pxPerTick = next;
        this.viewStart = anchorTick - (ax - KEYBAR_W) / next;
        this._sceneDirty = true;
    };

    SegmentWindow.prototype.onDocPointerEnd = function (ev) {
        if (!ev || !ev.pointerId) return;
        if (this._touchPts[ev.pointerId]) delete this._touchPts[ev.pointerId];
        if (!this._pinch) return;
        if (Object.keys(this._touchPts).length >= 2) return;
        // 最后一根手指抬起: 一次性应用双指缩放结果
        this.applyPinch();
        this._pinch = null;
        this._touchPts = {};
    };

    // 双指期间清理单指拖拽的残留状态 (用于触摸开始时打断编辑)
    SegmentWindow.prototype._stopPinchDrag = function () {
        if (this.canvas) this.canvas.style.cursor = '';
    };

    // ---------- 鼠标交互 ----------
    SegmentWindow.prototype.onCanvasDown = function (ev) {
        this.focus();
        if (this.minimized) return;
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;

        // 触屏: 维护 pointerId 集合, 第二指落下即进入双指缩放 (不与 touch 事件混用)
        if (ev.pointerType && ev.pointerType !== 'mouse') {
            this._touchPts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
            var ids = Object.keys(this._touchPts);
            if (ids.length >= 2) {
                ev.preventDefault();
                this.beginPinch();
                return;
            }
        }

        if (ev.button === 1) {
            // 中键: 平移视图 (X/Y)
            ev.preventDefault();
            this.beginPan(ev, mx, my);
            return;
        }
        if (ev.button !== 0) return;

        // 标尺: 点击/拖动跳转播放位置
        if (my < this.stageTop()) {
            this.beginSeek(ev, mx);
            return;
        }
        // 左侧钢琴键盘: 点击试听, 横向位置决定力度
        if (mx < KEYBAR_W) {
            this.previewKey(ev, mx, my);
            return;
        }

        var hit = this.hitTest(mx, my);

        if (this.tool === 'select') {
            if (hit) {
                var additive = ev.shiftKey;
                if (!additive) this.selection = [];
                if (!this.isSelected(hit.note)) {
                    var gn = this.groupNotes(hit.group);
                    for (var gi = 0; gi < gn.length; gi++) {
                        if (!this.isSelected(gn[gi])) this.selection.push(gn[gi]);
                    }
                }
                this.raiseNote(hit.note);
                this.beginMove(ev, mx, my, hit);
            } else {
                var self = this;
                if (!ev.shiftKey) this.selection = [];
                var keepSel = this.selection.slice();
                var mq = { x0: mx, y0: my, x1: mx, y1: my };
                this.dragging = { mode: 'marquee', marq: mq };
                this.hookMove(function (e) {
                    var rr = self.canvas.getBoundingClientRect();
                    mq.x1 = e.clientX - rr.left;
                    mq.y1 = e.clientY - rr.top;
                    self._sceneDirty = true;
                }, function () {
                    self.applyMarquee(keepSel, mq);
                });
                this._sceneDirty = true;
            }
            return;
        }

        if (this.tool === 'erase') {
            host().pushUndo();
            if (hit) this.deleteNote(hit.note, true);
            this.dragging = { mode: 'erase' };
            this._sceneDirty = true;
            return;
        }

        if (hit) {
            this.selection = this.groupNotes(hit.group);
            this.raiseNote(hit.note);
            if (hit.edge === 'right') this.beginResizeNote(ev, mx, my, hit);
            else this.beginMove(ev, mx, my, hit);
        } else {
            this.beginDraw(ev, mx, my);
        }
    };

    SegmentWindow.prototype.beginPan = function (ev, mx, my) {
        var self = this;
        var startX = ev.clientX, startY = ev.clientY;
        var vs = this.viewStart, sy = this.scrollY;
        var cRect = this.canvas.getBoundingClientRect();
        this.canvas.style.cursor = 'grabbing';
        function move(e) {
            self.viewStart = vs - (e.clientX - startX) / self.pxPerTick;
            self.scrollY = clamp(sy - (e.clientY - startY),
                0, Math.max(0, (self.maxKey - self.minKey + 1) * self.rowH - self.ch + self.rulerH));
            self._sceneDirty = true;
        }
        function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            self.canvas.style.cursor = '';
            void cRect;
        }
        docDrag(move, up);
    };

    SegmentWindow.prototype.beginSeek = function (ev, mx) {
        var self = this;
        function apply(e) {
            var rr = self.canvas.getBoundingClientRect();
            var x = e.clientX - rr.left;
            if (x < KEYBAR_W) x = KEYBAR_W;
            self.seekToTick(self.xToTick(x));
        }
        apply(ev);
        this.hookMove(apply, null);
    };

    SegmentWindow.prototype.previewKey = function (ev, mx, my) {
        var key = this.yToKey(my);
        if (key < 0 || key > 87) return;
        this._hoverKey = key;
        this._pressKey = key;
        this._pressAt = performance.now();
        this._pressHold = true;
        this._keyAnimUntil = this._pressAt + 120;
        // 横向位置 -> 力度: 左轻右重
        var ratio = clamp((mx - 2) / (KEYBAR_W - 4), 0, 1);
        var vel = Math.round(20 + ratio * 180);
        this.defaultVelocity = vel;
        this._previewVel = vel;
        if (window.AudioEngine && AudioEngine.playNote) {
            try { AudioEngine.playNote(this.currentInstrument, key, vel, 100); } catch (e) {}
        }
        this._sceneDirty = true;
        var self = this;
        function move(e) {
            var rr = self.canvas.getBoundingClientRect();
            var k = self.yToKey(e.clientY - rr.top);
            var x = clamp(e.clientX - rr.left, 2, KEYBAR_W - 2);
            if (k !== self._hoverKey && k >= 0 && k <= 87) {
                self._hoverKey = k;
                self._pressKey = k;
                self._pressAt = performance.now();
                self._pressHold = true;
                self._keyAnimUntil = self._pressAt + 120;
                var vv = Math.round(20 + clamp(x / KEYBAR_W, 0, 1) * 180);
                self.defaultVelocity = vv;
                if (window.AudioEngine && AudioEngine.playNote) {
                    try { AudioEngine.playNote(self.currentInstrument, k, vv, 100); } catch (er) {}
                }
            }
            self._sceneDirty = true;
        }
        function up() {
            // 监听移除由 docDrag 统一处理 (pointer/pointerup 或 mouse/mouseup)
            if (self._pressKey >= 0) {
                self._pressHold = false;
                self._pressReleaseAt = performance.now();
                self._keyAnimUntil = self._pressReleaseAt + 120;
                self._sceneDirty = true;
            }
        }
        docDrag(move, up);
        void ev;
    };

    SegmentWindow.prototype.beginDraw = function (ev, mx, my) {
        var h = host();
        if (!h) return;
        var self = this;
        var layer = this.seg.notes.length ? (isFinite(this.seg.notes[0].layer) ? this.seg.notes[0].layer : 0) : 0;
        // 放置前预检轨道层容量, 超限时阻止本次放置并提示
        if (!this.ensureLaneLayers(this._distinctLayerCount(layer))) return;
        h.pushUndo();
        this.dragging = { mode: 'draw', layer: layer, lastKey: -1, lastTick: -1, placedNote: null };
        this.drawAt(mx, my);
        this.hookMove(function (e) {
            var r = self.canvas.getBoundingClientRect();
            self.drawAt(e.clientX - r.left, e.clientY - r.top);
        }, function () {
            self.finishEdit();
        });
    };

    SegmentWindow.prototype.drawAt = function (mx, my) {
        if (my < this.stageTop()) return;
        var key = this.yToKey(my);
        if (key < 0 || key > 87) return;
        var tick = Math.floor(this.xToTick(mx));
        tick = this.snapTick(tick);
        var rel = tick - (this.seg.start || 0);
        if (rel < 0 || rel >= this.segDuration()) return;
        var d = this.dragging;
        if (d && d.lastKey === key && d.lastTick === rel) return;
        var exists = false;
        var notes = this.seg.notes;
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if ((n.key || 0) === key && (n.rel || 0) === rel) { exists = true; break; }
        }
        if (!exists) {
            var note = {
                rel: rel,
                layer: d ? d.layer : 0,
                instrument: this.currentInstrument,
                key: key,
                velocity: this.defaultVelocity,
                pan: 100,
                pitch: 0
            };
            notes.push(note);
            if (d) d.placedNote = note;
            this.addAnim('place', key, rel, rel, this.currentInstrument);
            this.commitEdit();
        }
        if (d) { d.lastKey = key; d.lastTick = rel; }
    };

    SegmentWindow.prototype.snapTick = function (tick) {
        var g = this.grid || 1;
        return Math.round(tick / g) * g;
    };

    SegmentWindow.prototype.beginMove = function (ev, mx, my, hit) {
        var h = host();
        if (!h) return;
        var self = this;
        var notes = this.selection.length ? this.selection.slice() : this.groupNotes(hit.group);
        if (!this.isSelected(hit.note)) {
            this.selection = this.groupNotes(hit.group);
            notes = this.selection.slice();
        }
        if (!notes.length) return;
        h.pushUndo();
        var startTick = this.xToTick(mx);
        var startKey = this.yToKey(my);
        var dur = this.segDuration();
        var orig = notes.map(function (n) {
            return { note: n, rel: n.rel || 0, key: n.key || 0, layer: n.layer || 0 };
        });
        var minRel = Infinity, maxRel = -Infinity, minKey = 87, maxKey = 0;
        for (var i = 0; i < orig.length; i++) {
            if (orig[i].rel < minRel) minRel = orig[i].rel;
            if (orig[i].rel > maxRel) maxRel = orig[i].rel;
            if (orig[i].key < minKey) minKey = orig[i].key;
            if (orig[i].key > maxKey) maxKey = orig[i].key;
        }
        var anchorRel = (hit.group && isFinite(hit.group.start)) ? hit.group.start : minRel;
        var grabTick = startTick - anchorRel;
        this.dragging = { mode: 'move', notes: notes, orig: orig, grabTick: grabTick };
        this.hookMove(function (e) {
            var r = self.canvas.getBoundingClientRect();
            var rawDelta = self.xToTick(e.clientX - r.left) - startTick;
            // 以组起点吸附到 tick 网格, 组内音符保持相对偏移; 微小移动不吸附, 避免起拖跳变
            var dt = Math.abs(rawDelta) < 0.5 ? 0 : (self.snapTick(anchorRel + rawDelta) - anchorRel);
            if (dt < -minRel) dt = -minRel;
            if (dur > 0 && dt > (dur - 1) - maxRel) dt = (dur - 1) - maxRel;
            var dk = self.yToKey(e.clientY - r.top) - startKey;
            if (dk < -minKey) dk = -minKey;
            if (dk > 87 - maxKey) dk = 87 - maxKey;
            for (var j = 0; j < orig.length; j++) {
                var o = orig[j];
                o.note.rel = Math.max(0, o.rel + dt);
                o.note.key = clamp(o.key + dk, 0, 87);
            }
            self.commitEdit(true);
        }, function () {
            self.finishEdit();
        });
    };

    SegmentWindow.prototype.beginResizeNote = function (ev, mx, my, hit) {
        var h = host();
        if (!h) return;
        var self = this;
        h.pushUndo();
        var group = hit.group;
        var originals = group.notes.map(function (it) { return it.note; });
        var proto = originals[0];
        var base = group.start;
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
        this.hookMove(function (e) {
            var r = self.canvas.getBoundingClientRect();
            var tick = self.snapTick(Math.floor(self.xToTick(e.clientX - r.left))) - (self.seg.start || 0);
            var len = Math.max(1, tick - base + 1);
            rebuild(len);
        }, function () {
            self.finishEdit();
        });
    };

    SegmentWindow.prototype.hookMove = function (moveFn, upFn) {
        var self = this;
        function onMove(e) { moveFn(e); }
        function onUp(e) {
            // 监听移除由 docDrag 统一处理
            self.dragging = null;
            if (upFn) upFn(e);
        }
        docDrag(onMove, onUp);
    };

    SegmentWindow.prototype.commitEdit = function (noRefresh) {
        var h = host();
        if (!h) return;
        this._localSorted = null;
        if (this.selection.length) {
            var live = [];
            for (var i = 0; i < this.selection.length; i++) {
                if (this.seg.notes.indexOf(this.selection[i]) >= 0) live.push(this.selection[i]);
            }
            this.selection = live;
        }
        // 片段可能新增了音高层: 补齐 NBS 轨道层后再交给主编辑器缝合
        this.ensureLaneLayers(undefined, true);
        this.invalidate(true);
        this._velDirty = true;
        if (h.segmentSync) h.segmentSync();
        if (h.markDirty) h.markDirty();
        void noRefresh;
    };

    // ---------- 轨道层自动扩展 ----------
    SegmentWindow.prototype._laneIndex = function () {
        var h = host();
        var lanes = (h && h.state && h.state.segmentLanes) || [];
        var idx = lanes.indexOf(this.lane);
        if (idx >= 0) return idx;
        var id = this.lane ? this.lane.id : null;
        if (id === null || id === undefined) return -1;
        for (var i = 0; i < lanes.length; i++) {
            if (lanes[i] && lanes[i].id === id) return i;
        }
        return -1;
    };

    SegmentWindow.prototype._distinctLayerCount = function (extraLayer) {
        var seen = {};
        var notes = this.seg.notes || [];
        for (var i = 0; i < notes.length; i++) {
            var L = isFinite(notes[i].layer) ? notes[i].layer : 0;
            seen[L] = true;
        }
        if (extraLayer !== undefined && extraLayer !== null) seen[extraLayer] = true;
        return Object.keys(seen).length;
    };

    // 返回 false 表示层数已达 NBS 上限, 调用方应阻止本次放置
    SegmentWindow.prototype.ensureLaneLayers = function (neededHint, silent) {
        var idx = this._laneIndex();
        if (idx < 0) return true;
        var fn = window.WebNBS && window.WebNBS.segmentEnsureLaneLayers;
        if (fn) {
            var res = fn(idx, neededHint);
            if (res && res.ok === false) {
                if (!silent) this.warnLayerLimit();
                return false;
            }
        } else {
            // 兜底: 没有扩展函数时至少在层数组不足时补默认层
            var h = host();
            var layers = h && h.state && h.state.song && h.state.song.layers;
            var need = neededHint;
            if (need === undefined || need === null) need = this._distinctLayerCount();
            if (Array.isArray(layers) && layers.length < need) {
                while (layers.length < need) {
                    layers.push({
                        name: this.lane.name || ('Layer ' + (layers.length + 1)),
                        volume: isFinite(this.lane.volume) ? this.lane.volume : 100,
                        stereo: 100, lock: 0
                    });
                }
            }
        }
        return true;
    };

    SegmentWindow.prototype.warnLayerLimit = function () {
        var now = Date.now();
        if (now - (this._layerWarnAt || 0) < 3000) return;
        this._layerWarnAt = now;
        var h = host();
        if (h && h.showToast) {
            h.showToast('无法新增轨道层：已达到 NBS 最大层数，本次操作已取消',
                { type: 'warning', duration: 4000, icon: 'fa-solid fa-triangle-exclamation' });
        } else if (h && h.showAppAlert) {
            h.showAppAlert('无法新增轨道层：已达到 NBS 最大层数，本次操作已取消');
        }
    };

    SegmentWindow.prototype.finishEdit = function () {
        this.commitEdit();
        this.persist();
    };

    SegmentWindow.prototype.deleteNote = function (note, noUndo) {
        var h = host();
        if (!h || !note) return;
        var idx = this.seg.notes.indexOf(note);
        if (idx < 0) return;
        if (!noUndo) h.pushUndo();
        this.seg.notes.splice(idx, 1);
        var sel = this.selection.indexOf(note);
        if (sel >= 0) this.selection.splice(sel, 1);
        var group = this.groups(this.seg).find(function (g) {
            return g.notes.some(function (it) { return it.note === note; });
        });
        var endRel = group ? group.end : (note.rel || 0);
        this.addAnim('delete', note.key || 0, note.rel || 0, endRel, note.instrument);
        this.commitEdit();
    };

    SegmentWindow.prototype.onCanvasMove = function (ev) {
        if (this._pinch) {
            this.onPinchMove(ev);
            return;
        }
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;

        if (my < this.stageTop()) {
            this._hover = null;
            this._hoverKey = -1;
            this.canvas.style.cursor = 'ew-resize';
            return;
        }
        if (mx < KEYBAR_W) {
            var k = this.yToKey(my);
            if (k >= 0 && k <= 87 && this._hoverKey !== k) {
                this._hoverKey = k;
                this._sceneDirty = true;
            }
            this._hover = null;
            this.canvas.style.cursor = 'pointer';
            return;
        }
        if (this._hoverKey !== -1) { this._hoverKey = -1; this._sceneDirty = true; }

        if (this.dragging && this.dragging.mode === 'marquee') {
            this.dragging.marq.x1 = mx;
            this.dragging.marq.y1 = my;
            this._sceneDirty = true;
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

    SegmentWindow.prototype.onCanvasDblClick = function (ev) {
        var r = this.canvas.getBoundingClientRect();
        if (ev.clientX - r.left < KEYBAR_W) return;
        var hit = this.hitTest(ev.clientX - r.left, ev.clientY - r.top);
        if (hit) {
            this.raiseNote(hit.note);
            this.refresh();
        }
    };

    SegmentWindow.prototype.onCanvasRightClick = function (ev) {
        var r = this.canvas.getBoundingClientRect();
        var hit = this.hitTest(ev.clientX - r.left, ev.clientY - r.top);
        if (hit) this.deleteNote(hit.note);
    };

    SegmentWindow.prototype.onWheel = function (ev) {
        ev.preventDefault();
        if (!this.seg) return;
        var r = this.canvas.getBoundingClientRect();
        var mx = ev.clientX - r.left, my = ev.clientY - r.top;

        if (ev.altKey) {
            var g = null;
            var groups = this.groups(this.seg);
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
            // Ctrl + 滚轮: 纵向行高缩放, 以鼠标 Y 为锚点 (同时阻止浏览器页面缩放)
            this.setRowH(this.rowH * (ev.deltaY > 0 ? 0.88 : 1.14), my);
            return;
        }
        if (ev.shiftKey) {
            // Shift + 滚轮: 横向 tick 密度缩放, 以鼠标 X 为锚点
            this.zoomTicks(ev.deltaY > 0 ? 0.88 : 1.14, mx);
        } else {
            this.scrollY = clamp(this.scrollY + (ev.deltaY > 0 ? this.rowH * 2 : -this.rowH * 2),
                0, Math.max(0, (this.maxKey - this.minKey + 1) * this.rowH - this.ch + this.rulerH));
        }
        this._sceneDirty = true;
    };

    // 力度控制器: 按住拖动时按鼠标位置实时命中并调整
    SegmentWindow.prototype.onVelDown = function (ev) {
        if (!this.seg || ev.button !== 0) return;
        var h = host();
        if (!h) return;
        h.pushUndo();
        this._velDirty = true;
        var self = this;
        function apply(e) {
            var rr = self.velCanvas.getBoundingClientRect();
            var mx = e.clientX - rr.left;
            var g = self.hitGroupAt(mx);
            if (!g) return;
            var top = 18, bottom = Math.max(top + 4, self.vh - 6);
            var v = Math.round(clamp((bottom - (e.clientY - rr.top)) / (bottom - top) * 200, 0, 200));
            for (var i = 0; i < g.notes.length; i++) g.notes[i].note.velocity = v;
            self.commitEdit(true);
        }
        apply(ev);
        this.hookMove(apply, function () { self.finishEdit(); });
    };

    // 快捷键: 处理 own 的键并阻止继续冒泡, 未处理的键交给主界面
    SegmentWindow.prototype.onKey = function (ev) {
        var h = host();
        if (!h) return;
        var k = ev.key;
        var handled = false;
        if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) {
            if (ev.shiftKey) { if (h.performRedo) h.performRedo(); }
            else if (h.performUndo) h.performUndo();
            this.resync();
            this.refresh();
            handled = true;
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) {
            if (h.performRedo) h.performRedo();
            this.resync();
            this.refresh();
            handled = true;
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'c' || k === 'C')) {
            this.copySelection();
            handled = true;
        } else if ((ev.ctrlKey || ev.metaKey) && (k === 'v' || k === 'V')) {
            this.pasteClipboard();
            handled = true;
        } else if (k === 'Delete' || k === 'Backspace') {
            if (this.selection.length) {
                h.pushUndo();
                for (var i = this.selection.length - 1; i >= 0; i--) {
                    var idx = this.seg.notes.indexOf(this.selection[i]);
                    if (idx >= 0) this.seg.notes.splice(idx, 1);
                }
                this.selection = [];
                this.commitEdit();
            }
            handled = true;
        } else if (k === ' ' || ev.code === 'Space') {
            // 空格: 本窗口聚焦时切换播放, 不再穿透到主编辑器
            if (this.playMode === 'local') this.toggleLocalPause();
            else if (window.WebNBS && WebNBS.handlePlayToggle) WebNBS.handlePlayToggle();
            handled = true;
        } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
            if (this.selection.length) {
                var dt = (k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' ? 1 : 0));
                var dk = (k === 'ArrowUp' ? 1 : (k === 'ArrowDown' ? -1 : 0));
                this.nudgeSelection(dt, dk);
            } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
                this.viewStart += (k === 'ArrowLeft' ? -4 : 4) / this.pxPerTick;
                this._sceneDirty = true;
            } else {
                var maxScroll = Math.max(0, (this.maxKey - this.minKey + 1) * this.rowH - this.ch + this.rulerH);
                this.scrollY = clamp(this.scrollY + (k === 'ArrowUp' ? -this.rowH : this.rowH), 0, maxScroll);
                this._sceneDirty = true;
            }
            handled = true;
        } else if (!ev.ctrlKey && !ev.metaKey && (k === 'b' || k === 'B' || k === 'd' || k === 'D')) {
            this.setTool('draw'); handled = true;
        } else if (!ev.ctrlKey && !ev.metaKey && (k === 'e' || k === 'E')) {
            this.setTool('erase'); handled = true;
        } else if (!ev.ctrlKey && !ev.metaKey && (k === 's' || k === 'S')) {
            this.setTool('select'); handled = true;
        }
        if (handled) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    };

    SegmentWindow.prototype.nudgeSelection = function (dt, dk) {
        if (!this.selection.length || !this.seg) return;
        var h = host();
        if (!h) return;
        h.pushUndo();
        var dur = this.segDuration();
        for (var i = 0; i < this.selection.length; i++) {
            var n = this.selection[i];
            n.rel = clamp((n.rel || 0) + dt, 0, dur - 1);
            n.key = clamp((n.key || 0) + dk, 0, 87);
        }
        this.commitEdit();
    };

    SegmentWindow.prototype.clampSelection = function () {
        var live = [];
        for (var i = 0; i < this.selection.length; i++) {
            if (this.seg.notes.indexOf(this.selection[i]) >= 0) live.push(this.selection[i]);
        }
        this.selection = live;
        if (this._zMap) this._zMap = new WeakMap();
    };

    SegmentWindow.prototype.copySelection = function () {
        if (!this.selection.length) return;
        var minTick = Infinity, minKey = Infinity;
        for (var i = 0; i < this.selection.length; i++) {
            var n = this.selection[i];
            minTick = Math.min(minTick, n.rel || 0);
            minKey = Math.min(minKey, n.key || 0);
        }
        this.clipboard = this.selection.map(function (n) {
            return {
                dr: (n.rel || 0) - minTick,
                dk: (n.key || 0) - minKey,
                instrument: n.instrument, velocity: n.velocity, pan: n.pan,
                pitch: n.pitch, layer: n.layer
            };
        });
    };

    SegmentWindow.prototype.pasteClipboard = function () {
        if (!this.clipboard || !this.clipboard.length) return;
        var h = host();
        if (!h) return;
        var mx = this._hover ? (this._hover.x + 4) : this.tickToX(this.seg.start);
        // 粘贴可能引入新的音高层: 先预检层容量, 失败则不落音符
        var layerSeen = {};
        for (var ni = 0; ni < this.seg.notes.length; ni++) {
            layerSeen[isFinite(this.seg.notes[ni].layer) ? this.seg.notes[ni].layer : 0] = true;
        }
        for (var pk = 0; pk < this.clipboard.length; pk++) {
            layerSeen[isFinite(this.clipboard[pk].layer) ? this.clipboard[pk].layer : 0] = true;
        }
        var maxLayerCount = Object.keys(layerSeen).length;
        if (!this.ensureLaneLayers(maxLayerCount)) return;
        h.pushUndo();
        var targetTick = Math.round(this.snapTick(this.xToTick(mx)) - (this.seg.start || 0));
        var targetKey = this._hover ? this._hover.group.key : (this.minKey + 5);
        var self = this;
        var added = [];
        this.clipboard.forEach(function (c) {
            var note = {
                rel: Math.max(0, targetTick + c.dr),
                layer: isFinite(c.layer) ? c.layer : 0,
                instrument: c.instrument,
                key: clamp(targetKey + c.dk, 0, 87),
                velocity: c.velocity, pan: c.pan, pitch: c.pitch
            };
            self.seg.notes.push(note);
            added.push(note);
            self.addAnim('place', note.key, note.rel, note.rel, note.instrument);
        });
        this.selection = added;
        this.commitEdit();
    };

    SegmentWindow.prototype.setTool = function (tool) {
        this.tool = tool;
        this.updateToolButtons();
        this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : (tool === 'erase' ? 'cell' : 'default');
    };

    SegmentWindow.prototype.cycleGrid = function () {
        var idx = GRID_LEVELS.indexOf(this.grid);
        this.grid = GRID_LEVELS[(idx + 1) % GRID_LEVELS.length];
        this.syncTexts();
    };

    // ============================================================
    // 导出
    // ============================================================
    window.SegmentPianoWindow = {
        open: open,
        closeAll: closeAll,
        shouldUseFullscreen: shouldUseFullscreen,
        ROW_H_MIN: ROW_H_MIN,
        ROW_H_MAX: ROW_H_MAX,
        refresh: refreshAll,
        refreshLane: function (laneId) {
            var w = findLaneWin(laneId);
            if (w) w.refresh();
        },
        closeLane: function (laneId) {
            var w = findLaneWin(laneId);
            if (w) w.close();
        },
        isOpen: function () {
            return wins.length > 0;
        },
        hasFocus: function () {
            return !!(lastFocused && lastFocused.root);
        },
        getSettings: function () { return loadSettings(); },
        setSettings: function (patch) {
            var s = loadSettings();
            for (var k in patch) {
                if (patch.hasOwnProperty(k)) s[k] = !!patch[k];
            }
            saveSettings();
            applySettingsToAll();
            return s;
        }
    };
})();
