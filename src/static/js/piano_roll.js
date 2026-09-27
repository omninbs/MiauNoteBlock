/**
 * WebNBS 钢琴卷帘组件 - 完全重写
 * 方块网格对齐、时间轴、长按优化、颜色对比增强
 */
(function() {
    'use strict';

    // ============ 配置 ============
    function getConfig() {
        var isMobile = window.innerWidth < 768 || ('ontouchstart' in window);
        return {
            cellW: isMobile ? 24 : 32,       // 每个网格单元宽度 (tick方向): 桌面32px, 移动端24px
            cellH: isMobile ? 24 : 32,       // 每个网格单元高度 (layer方向): 桌面32px, 移动端24px
            sidePanelWidth: 134,             // 左侧音轨信息区宽度（显示 Layer / M / S / ☒）
            timelineHeight: 56,              // 顶部总高度 (进度条 28px + 时间轴 28px)
            progressBarHeight: 28,           // 顶部进度条高度 (把柄加高, 便于拖拽)
            longPressDelay: 600,             // 长按触发延迟 0.6s
            doubleTapDelay: 300,
            defaultZoom: isMobile ? 1.2 : 1.0,
            gridLineColor: 'rgba(255,255,255,0.06)',
            gridBeatColor: 'rgba(255,255,255,0.12)',
            selectionColor: 'rgba(233,69,96,0.25)',
            selectionBorder: '#e94560'
        };
    }

    // ============ NBS 乐器颜色 (增强对比度) ============
    var INSTRUMENT_COLORS = [
        '#e8a840', // 0 Harp - 亮金
        '#6b3a1f', // 1 Double Bass - 深棕
        '#d43030', // 2 Bass Drum - 鲜红
        '#e8d44d', // 3 Snare Drum - 亮黄
        '#c0c0c0', // 4 Click - 银灰
        '#4a8c2a', // 5 Guitar - 深绿
        '#40b8e8', // 6 Flute - 亮蓝
        '#f0e060', // 7 Bell - 金黄
        '#e8a0c0', // 8 Chime - 粉红
        '#f070a0', // 9 Xylophone - 玫红
        '#90a8c8', // 10 Iron Xylophone - 钢蓝
        '#d09020', // 11 Cow Bell - 橙棕
        '#b07030', // 12 Didgeridoo - 棕橙
        '#ffe040', // 13 Bit - 亮黄
        '#e05050', // 14 Banjo - 红
        '#b080e0', // 15 Pling - 紫
        '#c46b3d', // 16 Copper Horn - 铜橙
        '#8b6f47', // 17 Exposed Copper Horn - 斑驳棕
        '#5c8b5c', // 18 Weathered Copper Horn - 锈蚀绿
        '#3d7a6b'  // 19 Oxidized Copper Horn - 氧化青
    ];

    // NBS key 0 is MIDI A0; labels must use the MIDI pitch class, not key % 12.
    var PITCH_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 音调标签是否显示八度数字 (如 A4/C5), 与主界面设置 show_octave_labels 同步, 默认开启
    var octaveLabelEnabled = true;
    try { octaveLabelEnabled = localStorage.getItem('show_octave_labels') !== '0'; } catch (e) {}
    function pitchClassLabel(pitchKey) {
        return PITCH_LABELS[(pitchKey + 9) % 12] + (octaveLabelEnabled ? (Math.floor((pitchKey + 21) / 12) - 1) : '');
    }

    // 音符上额外显示: 点击次数 / 方块名 是两个独立开关 (主界面设置, 默认关闭)
    var noteClicksEnabled = false;
    var noteBlockEnabled = false;
    try {
        noteClicksEnabled = localStorage.getItem('noteblock.show_note_clicks') === '1';
        noteBlockEnabled = localStorage.getItem('noteblock.show_note_block') === '1';
    } catch (e) {}

    // Minecraft 音符盒标准方块 (对应 NBS instrument 0~19, 中文方块名)
    var NOTE_BLOCK_NAMES = [
        '羊毛', '橡木', '石头', '沙石', '玻璃', '沙子', '黏土', '金块', '冰块', '青金石',
        '石英块', '灵魂沙', '南瓜', '绿宝石', '干草块', '萤石', '铜管', '铜管', '铜管', '铜管'
    ];

    // 音符盒点击次数: 从最低音 F#3 (NBS key 33) 基准, 每次右键升半音, 共 24 档 (0~24)
    var NOTE_BLOCK_BASE_KEY = 33;
    function noteBlockClicks(pitchKey) {
        if (typeof pitchKey !== 'number' || !isFinite(pitchKey)) return 0;
        return ((pitchKey - NOTE_BLOCK_BASE_KEY) % 24 + 24) % 24;
    }

    // 键盘钢琴映射: NBS key → 键盘按键名 (反向映射)
    var KEY_LABELS = {
        36:'Z',37:'S',38:'X',39:'D',40:'C',41:'V',42:'G',43:'B',44:'H',45:'N',46:'J',47:'M',
        48:'Q',49:'2',50:'W',51:'3',52:'E',53:'R',54:'5',55:'T',56:'6',57:'Y',58:'7',59:'U',
        60:'I',61:'9',62:'O',63:'0',64:'P',65:'[',66:'=',67:']'
    };

    // Minecraft 音符盒标准音域 (NBS key 33~57, 对应 F#3 ~ F#5)
    // 超出此范围的音符在 NBS 中仍可播放 (0~87)，但音色会偏离 Minecraft 原版效果
    var MINECRAFT_PITCH_MIN = 33;
    var MINECRAFT_PITCH_MAX = 57;

    // ============ 颜色工具 ============
    function hexToRgb(hex) {
        var h = hex.replace('#', '');
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        var num = parseInt(h, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    function rgbToStr(r, g, b) {
        return 'rgb(' + Math.round(Math.max(0,Math.min(255,r))) + ',' + Math.round(Math.max(0,Math.min(255,g))) + ',' + Math.round(Math.max(0,Math.min(255,b))) + ')';
    }
    function multiplyColor(hex, factor) {
        var c = hexToRgb(hex);
        return rgbToStr(c.r * factor, c.g * factor, c.b * factor);
    }
    // 数值夹取 (min <= v <= max, 越界回退 fallback)
    function clampInt(v, min, max, fallback) {
        if (typeof v !== 'number' || isNaN(v)) v = fallback;
        return Math.max(min, Math.min(max, Math.round(v)));
    }

    // ============ 构造函数 ============
    function PianoRoll(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) { console.warn('PianoRoll: canvas not found'); return; }
        this.ctx = this.canvas.getContext('2d');
        this._cfg = getConfig();

        // 数据
        this.notes = [];
        this.selectedNotes = {};
        this.clipboard = [];
        this._noteIdCounter = 1;

        // 视图
        this.scrollX = 0;
        this.scrollY = 0;
        this.zoom = this._cfg.defaultZoom;
        this.displayWidth = 0;
        this.displayHeight = 0;
        // 音符间隔 (左右内边距, 单位 px; 0-16; 不持久, 仅当前工程)
        this.notePadding = 0;

        // 性能优化: RAF 节流 + 音符空间索引
        this._renderRAF = null;        // render 的 RAF 句柄
        this._notesByTick = {};        // tick -> [noteIndex...] 空间索引
        this._noteIndexDirty = true;   // 索引是否需要重建

        // 离屏 Canvas: 静态层缓存 (背景/网格/标尺/面板/蒙版/钢琴键盘)
        this._staticLayerCanvas = null;
        this._staticLayerCtx = null;
        this._staticLayerDirty = true;
        this._staticLayerScrollX = -1;
        this._staticLayerScrollY = -1;
        this._staticLayerZoom = -1;
        this._staticLayerTrackCount = -1;
        this._staticLayerTotalTicks = -1;
        this._staticLayerWidth = -1;
        this._staticLayerHeight = -1;

        // 选择框: 锚点网格坐标 (避免滚动时选择框偏移)
        this._selectStartTick = 0;
        this._selectStartLayer = 0;

        // 鼠标状态
        this._mouseDown = false;
        this._mouseButton = -1;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dragNoteStart = {};
        // 音符拖动预览: 拖动中音符跟随鼠标实时预览 + 目标格描边
        this._dragPreview = null;
        this._hasMoved = false;
        this._isSelecting = false;
        this._selectionRect = null;
        this._dragThreshold = 6;       // 桌面端点击/拖动判定阈值 (px)
        this._pendingPlace = false;    // 左键点击空白准备放置
        this._isPanning = false;       // 中键/右键/Space+左键平移画布
        this._panButton = -1;          // 当前平移使用的鼠标按键 (0=左键+Space, 1=中键, 2=右键)
        this._rightDragMoved = false;  // 本次右键是否发生过平移拖动 (决定 contextmenu 是否弹菜单)
        this._spaceHeld = false;       // Space 键是否按住 (用于 Space+左键平移)

        // 触摸状态
        this._touchMode = 'none';
        this._touchStartTime = 0;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._lastTouchX = 0;
        this._lastTouchY = 0;
        this._pinchDist = 0;
        this._pinchMidX = 0;
        this._pinchMidY = 0;
        this._touchMoved = false;
        this._longPressTimer = null;
        this._longPressFired = false;
        this._pendingContextMenu = false;
        this._touchedNote = null;
        this._lastTapTime = 0;
        this._lastTapX = 0;
        this._lastTapY = 0;

        // 长按动画状态
        this._isAnimating = false;
        this._animStartTime = 0;
        this._animNoteIds = null;
        this._animDuration = 1000;    // 播放高亮动画 1 秒
        this._animHoldAtEnd = false;  // 动画完成后保持在最后一帧
        // 长按手指位置灰白扩散环 (希沃白板风格)
        this._lpActive = false;       // 是否正在显示脉冲环
        this._lpAnimStart = 0;        // 脉冲环动画起始时间
        this._lpAnimDuration = 360;   // 脉冲环/长按放大动画时长 (ms), 比播放高亮快
        this._lpMaxScale = 1.22;      // 长按音符放大倍率

        // 当前乐器
        this.currentInstrument = 0;

        // 当前工具模式
        this.currentTool = 'default';

        // 演奏模式: 选中的音轨列表
        this.performanceSelectedLayers = [];
        this._highlightLayer = -1;

        // 通用选轨模式 (歌曲压缩等复用): 为真时点击音轨行切换选中; 选中列表独立于演奏模式
        this._trackSelectMode = null;          // null | 'compression'
        this.compressionSelectedLayers = [];
        this.onTrackSelectChanged = null;      // 选中变化回调 (layers)

        // 键盘钢琴键标签显示
        this._showKeyLabels = false;

        // 音轨信息 (layer -> track info)
        this.trackInfo = {};  // { layer: { name, muted, solo } }

        // 2D 音符盒 sprite
        this._noteBlockImg = new Image();
        this._noteBlockImg.src = 'static/sprites/spr_block/note_block.png';
        this._noteBlockLoaded = false;
        var selfImg = this;
        this._noteBlockImg.onload = function() { selfImg._noteBlockLoaded = true; selfImg.render(); };

        // 乐器图标
        this._instrumentImages = [];
        for (var ii = 0; ii < 20; ii++) {
            (function(idx) {
                var img = new Image();
                img.src = 'static/sprites/spr_instrumenticons/inst_' + idx + '.png';
                selfImg._instrumentImages[idx] = img;
                img.onload = function() { selfImg.render(); };
            })(ii);
        }

        // 回调
        this.onNoteAdded = null;
        this.onNotesChanged = null;
        this.onNoteDragStart = null;  // function() - 音符拖拽开始, 用于 pushUndo
        this.onContextMenu = null;
        this.onNotePreview = null;
        this.onSelectionChanged = null;
        this.onPianoKeyClick = null;
        this.onNoteGroupAdded = null;  // function(group, isStart) - 整组放置(延音), 用于一次撤销
        this.onEraseStart = null;      // function() - 清除手势开始, 用于 pushUndo

        // 创作辅助配置 (由 main.js 通过 setAssistConfig 注入)
        this.assistConfig = null;
        // 延音放置预览: 悬停单元格列表 [{tick, layer, velocity}] 或 null
        this._hoverSustainCells = null;
        // 查找浮层当前命中音符 id (独立高亮)
        this._findHighlightId = null;

        // 放置/删除动画队列
        this._noteAnims = [];
        // 音符播放高亮 { noteId: { startTime, duration } }
        this._playHighlights = {};
        this.onTimelineSeek = null;  // function(tick) - 时间轴点击/拖拽
        this.playheadTick = 0;       // 播放头位置(tick)

        // 进度条
        this.currentTick = 0;
        this.totalTicks = 0;
        this.onSeek = null;          // function(tick) - 进度条 seek

        // 轨道操作回调
        this.onMoveTrack = null;       // function(layer, direction)
        this.onReorderTrack = null;    // function(fromLayer, toLayer) - 拖拽排序
        this.onDeleteTrack = null;     // function(layer)
        this.onSetTrackVolume = null;  // function(layer, volume)
        this.onVolumeChangeStart = null; // function(layer) - 音量滑块开始拖动, 用于 pushUndo
        this.onTrackRename = null;     // function(layer, newName)
        this.onSelectAllInLayer = null; // function(layer)
        this.onAddTrack = null;        // function()

        // 平滑翻页 / 播放状态
        this.smoothScrollEnabled = false;
        this.isPlaying = false;

        // 进度条/播放头拖拽
        this._isDraggingPlayhead = false;
        this._isDraggingProgressBar = false;  // 顶部进度条拖拽 (按住拖动连续 seek)

        // 全量重绘标记
        this._fullRedrawNeeded = true;

        // 动态音轨数量
        this.trackCount = 1;

        // 可折叠面板动画
        // Input capability decides the editor chrome. A touch phone in landscape must
        // keep the mobile controls even when its viewport becomes wider than 768px.
        var isDesktop = !(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) && window.innerWidth >= 769;
        var defaultPanelW = isDesktop ? 220 : 134;
        this._isDesktop = isDesktop;
        this._panelAnimating = false;
        this._panelTargetWidth = defaultPanelW;
        this._panelAnimStart = 0;
        this._panelAnimStartWidth = defaultPanelW;
        this._currentPanelWidth = defaultPanelW;

        // 轨道拖拽排序
        this._isDraggingTrack = false;
        this._draggedTrackLayer = -1;
        this._dragTargetLayer = -1;
        this._trackDragStartY = 0;

        // 音轨信息栏按钮悬浮/按下状态 (用于 hover/点击动画)
        this._trackPanelHover = null;
        this._trackPanelPressed = null;

        // 拖动缓动动画状态
        this._dragAnimRAF = null;
        this._dragAnimTargets = {};  // id -> {tick, layer}
        this._dragAnimCurrent = {};  // id -> {tick, layer}
        this._dragAnimDuration = 90; // 缓动时长 ms (快, 不拖拉)

        // 音量透明度映射 (0-100 → 不透明-80%)
        this.volumeOpacityEnabled = false;
        // 面板透明度 (0-1, 1=不透明; 设置网页背景图后用于透出背景)
        this.panelAlpha = 1.0;
        // 左侧音轨信息栏透明度 (独立于面板透明度, 可单独调整)
        this.trackPanelAlpha = 1.0;
        this.gridOpacity = 0; // 网格透明度 (0=不透明, 1=完全透明)

        this._init();
    }

    PianoRoll.prototype.setTool = function(tool) {
        this.currentTool = tool;
        this._hoverSustainCells = null;
        if (tool !== 'performance') {
            this.performanceSelectedLayers = [];
            this._highlightLayer = -1;
        }
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.getPerformanceLayers = function() {
        return this.performanceSelectedLayers.slice();
    };

    // ---- 通用选轨模式 (歌曲压缩: 减轻处理 / 不被处理的轨道) ----
    PianoRoll.prototype.getCompressionLayers = function() {
        return this.compressionSelectedLayers.slice();
    };

    PianoRoll.prototype.setCompressionLayers = function(layers) {
        this.compressionSelectedLayers = (layers || []).slice();
        this.render();
    };

    PianoRoll.prototype.setPerformanceLayers = function(layers) {
        this.performanceSelectedLayers = layers.slice();
        this._highlightLayer = layers.length > 0 ? layers[layers.length - 1] : -1;
        this.render();
    };

    PianoRoll.prototype._removeNoteAtPos = function(tick, layer) {
        for (var i = this.notes.length - 1; i >= 0; i--) {
            if (this.notes[i].tick === tick && this.notes[i].layer === layer) {
                this.notes.splice(i, 1);
                return;
            }
        }
    };

    PianoRoll.prototype._addDeleteAnim = function(tick, layer) {
        this._noteAnims.push({
            tick: tick, layer: layer,
            startTime: performance.now(),
            duration: 300,
            type: 'delete-flash'
        });
        this._startAnimLoop();
    };

    PianoRoll.prototype._init = function() {
        this._setupCanvas();
        this._bindEvents();
        this.render();
    };

    // ============ Canvas 设置 ============
    PianoRoll.prototype._setupCanvas = function() {
        var container = this.canvas.parentElement;
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var cs = window.getComputedStyle(container);
        var padLeft = parseFloat(cs.paddingLeft) || 0;
        var padRight = parseFloat(cs.paddingRight) || 0;
        var padTop = parseFloat(cs.paddingTop) || 0;
        var padBottom = parseFloat(cs.paddingBottom) || 0;
        this.displayWidth = Math.max(1, (rect.width || 800) - padLeft - padRight);
        this.displayHeight = Math.max(1, (rect.height || 400) - padTop - padBottom);

        // 性能优化: 限制 DPR 上限到 2, 平衡清晰度与性能
        // (DPR=1 手机模糊; DPR=3+ 在 4K 屏上像素量×9 太卡; 上限 2 保证清晰且开销可控)
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = this.displayWidth * dpr;
        this.canvas.height = this.displayHeight * dpr;
        this.canvas.style.width = this.displayWidth + 'px';
        this.canvas.style.height = this.displayHeight + 'px';

        // 浏览器底层渲染优化: alpha:true 透明画布, 透出容器 CSS 背景/网页背景图
        // (不能使用 alpha:false, 否则 clearRect 会填为不透明黑色, 背景图被遮挡)
        try {
            var newCtx = this.canvas.getContext('2d', { alpha: true });
            if (newCtx) { this.ctx = newCtx; }
        } catch(e) { /* 降级到默认上下文 */ }
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        if (!this._overlayCanvas) {
            this._overlayCanvas = document.createElement('canvas');
            this._overlayCanvas.setAttribute('aria-hidden', 'true');
            this._overlayCanvas.style.position = 'absolute';
            this._overlayCanvas.style.left = '0';
            this._overlayCanvas.style.top = '0';
            this._overlayCanvas.style.width = '100%';
            this._overlayCanvas.style.height = '100%';
            this._overlayCanvas.style.pointerEvents = 'none';
            this._overlayCanvas.style.zIndex = '2';
            container.appendChild(this._overlayCanvas);
        }
        this._overlayCanvas.width = this.displayWidth * dpr;
        this._overlayCanvas.height = this.displayHeight * dpr;
        this._overlayCanvas.style.width = this.displayWidth + 'px';
        this._overlayCanvas.style.height = this.displayHeight + 'px';
        this._overlayCtx = this._overlayCanvas.getContext('2d', { alpha: true });
        this._overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._overlayCtx.scale(dpr, dpr);

        this._cfg = getConfig();
        if (this.zoom < 0.5) this.zoom = this._cfg.defaultZoom;

        var newIsDesktop = !(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) && window.innerWidth >= 769;
        if (newIsDesktop !== this._isDesktop) {
            this._isDesktop = newIsDesktop;
            var newPanelW = newIsDesktop ? 220 : 134;
            this._panelTargetWidth = newPanelW;
            this._panelAnimStartWidth = newPanelW;
            this._currentPanelWidth = newPanelW;
        }

        this._fullRedrawNeeded = true;
    };

    PianoRoll.prototype._getMaxScrollX = function() {
        var cellW = this._cfg ? this._cfg.cellW * this.zoom : 16;
        var contentWidth = Math.max(0, this.totalTicks * cellW);
        var editWidth = Math.max(0, this.displayWidth - this._currentPanelWidth);
        return Math.max(0, contentWidth - editWidth);
    };

    // 顶部滑动条: 根据 x 比例滚动视图 (左右翻页)
    PianoRoll.prototype._scrollFromSliderX = function(x) {
        var ratio = Math.max(0, Math.min(1, x / Math.max(1, this.displayWidth)));
        var maxScroll = this._getMaxScrollX();
        this.scrollX = ratio * maxScroll;
        this._fullRedrawNeeded = true;
        this.requestRender();
    };

    // 获取当前用于渲染的 tick, 播放时根据 tick 间隔做线性插值, 使播放头/进度条更平滑
    PianoRoll.prototype._getDisplayTick = function() {
        var tick = (this.playheadTick != null) ? this.playheadTick : this.currentTick;
        if (tick === undefined || tick === null) tick = 0;
        if (this.isPlaying && this._lastTickTime && this._tickDuration > 0) {
            var elapsed = performance.now() - this._lastTickTime;
            var frac = Math.max(0, Math.min(1, elapsed / this._tickDuration));
            tick += frac;
        }
        return tick;
    };

    PianoRoll.prototype.redrawPlaybackOverlay = function() {
        if (!this._overlayCtx) return;
        var ctx = this._overlayCtx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        ctx.clearRect(0, 0, w, h);
        if (!this.isPlaying || this.playheadTick === null || this.playheadTick === undefined) return;

        var displayTick = this._getDisplayTick();
        var x = this.smoothScrollEnabled ? pw + (w - pw) / 3 : this._tickToScreen(displayTick);
        if (x >= pw && x <= w) {
            ctx.save();
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, cfg.timelineHeight);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 100, 130, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - 1, cfg.timelineHeight);
            ctx.lineTo(x - 1, h);
            ctx.stroke();
            ctx.fillStyle = '#e94560';
            ctx.beginPath();
            ctx.moveTo(x, cfg.timelineHeight);
            ctx.lineTo(x - 6, cfg.timelineHeight - 8);
            ctx.lineTo(x + 6, cfg.timelineHeight - 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        if (this.totalTicks > 0) {
            var px = (displayTick / this.totalTicks) * w;
            ctx.fillStyle = 'rgba(233, 69, 96, 0.85)';
            ctx.fillRect(px - 1, 2, 2, cfg.progressBarHeight - 4);
        }
    };

    // ============ 事件绑定 ============
    PianoRoll.prototype._bindEvents = function() {
        var self = this;
        this.canvas.addEventListener('mousedown', function(e) { self._onMouseDown(e); });
        this.canvas.addEventListener('mousemove', function(e) { self._onMouseMove(e); });
        this.canvas.addEventListener('mouseup', function(e) { self._onMouseUp(e); });
        // A drag can end outside the canvas. Finalize it globally to avoid a stale
        // selection or note-drag state affecting the next gesture.
        window.addEventListener('mouseup', function(e) { self._onMouseUp(e); });
        this.canvas.addEventListener('mouseleave', function() {
            self._clearTrackPanelTooltip();
            // 清除延音放置预览
            if (self._hoverSustainCells) {
                self._hoverSustainCells = null;
                self._fullRedrawNeeded = true;
                self.requestRender();
            }
            if (self._trackPanelHover || self._trackPanelPressed) {
                self._trackPanelHover = null;
                self._trackPanelPressed = null;
                self._fullRedrawNeeded = true;
                self.requestRender();
            }
        });
        this.canvas.addEventListener('wheel', function(e) { self._onWheel(e); }, { passive: false });
        this.canvas.addEventListener('contextmenu', function(e) { self._onContextMenu(e); });

        this.canvas.addEventListener('touchstart', function(e) { self._onTouchStart(e); }, { passive: false });
        this.canvas.addEventListener('touchmove', function(e) { self._onTouchMove(e); }, { passive: false });
        this.canvas.addEventListener('touchend', function(e) { self._onTouchEnd(e); });
        this.canvas.addEventListener('touchcancel', function(e) { self._onTouchEnd(e); });

        window.addEventListener('resize', function() {
            self._setupCanvas();
            self.render();
        });

        // Space+左键拖动平移 (右键平移的可靠替代, 不受浏览器手势干扰)
        window.addEventListener('keydown', function(e) {
            if (e.code === 'Space' && !e.repeat) {
                self._spaceHeld = true;
            }
        });
        window.addEventListener('keyup', function(e) {
            if (e.code === 'Space') {
                self._spaceHeld = false;
                if (self._panButton === 0) {
                    self._isPanning = false;
                    self._panButton = -1;
                    self.canvas.style.cursor = 'crosshair';
                }
            }
        });
    };

    // ============ 坐标转换 ============
    // 编辑区起点: x = currentPanelWidth, y = timelineHeight
    PianoRoll.prototype._editOriginX = function() { return this._currentPanelWidth; };
    PianoRoll.prototype._editOriginY = function() { return this._cfg.timelineHeight; };

    PianoRoll.prototype._screenToTick = function(screenX) {
        return Math.floor((screenX - this._editOriginX() + this.scrollX) / (this._cfg.cellW * this.zoom));
    };

    PianoRoll.prototype._screenToTickNearest = function(screenX) {
        return Math.round((screenX - this._editOriginX() + this.scrollX) / (this._cfg.cellW * this.zoom));
    };

    PianoRoll.prototype._screenToLayer = function(screenY) {
        return Math.floor((screenY - this._editOriginY() + this.scrollY) / (this._cfg.cellH * this.zoom));
    };

    PianoRoll.prototype._tickToScreen = function(tick) {
        return tick * this._cfg.cellW * this.zoom - this.scrollX + this._editOriginX();
    };

    PianoRoll.prototype._layerToScreen = function(layer) {
        return layer * this._cfg.cellH * this.zoom - this.scrollY + this._editOriginY();
    };

    PianoRoll.prototype._getTrackPanelTooltipText = function(hit) {
        if (!hit) return '';
        var translate = window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate : function(text) { return text; };
        var info = hit.layer >= 0 ? this.getTrackInfo(hit.layer) : null;
        switch (hit.type) {
            case 'name': return translate('点击重命名音轨');
            case 'selectall': return translate('选择这一轨的全部音符');
            case 'drag': return translate('拖动调整音轨顺序');
            case 'delete': return translate('删除这一条音轨');
            case 'volume': return info ? (translate('设置音量') + ' (' + (info.volume !== undefined ? info.volume : 100) + '%)') : translate('设置音量');
            case 'mute': return translate(info && info.muted ? '取消静音' : '静音这一条音轨');
            case 'solo': return translate(info && info.solo ? '取消独奏' : '只试听这一条音轨');
            case 'addtrack': return translate('添加新音轨');
            case 'more': return translate('更多音轨操作');
            default: return '';
        }
    };

    PianoRoll.prototype._updateTrackPanelTooltip = function(x, y) {
        if (!this.canvas) return;
        var title = '';
        if (x < this._currentPanelWidth && y >= this._cfg.timelineHeight) {
            title = this._getTrackPanelTooltipText(this._hitTestTrackPanel(x, y));
        }
        if (this.canvas.title !== title) this.canvas.title = title;
    };

    PianoRoll.prototype._clearTrackPanelTooltip = function() {
        if (this.canvas && this.canvas.title) this.canvas.title = '';
    };

    // ============ 音符查找 ============
    PianoRoll.prototype._getNoteAt = function(x, y) {
        for (var i = this.notes.length - 1; i >= 0; i--) {
            var note = this.notes[i];
            var nx = this._tickToScreen(note.tick);
            var ny = this._layerToScreen(note.layer);
            var nw = this._cfg.cellW * this.zoom;
            var nh = this._cfg.cellH * this.zoom;
            if (x >= nx && x < nx + nw && y >= ny && y < ny + nh) {
                return note;
            }
        }
        return null;
    };

    PianoRoll.prototype._getNotesInRect = function(x1, y1, x2, y2) {
        var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        var result = [];
        for (var i = 0; i < this.notes.length; i++) {
            var note = this.notes[i];
            var nx = this._tickToScreen(note.tick);
            var ny = this._layerToScreen(note.layer);
            var nw = this._cfg.cellW * this.zoom;
            var nh = this._cfg.cellH * this.zoom;
            if (nx + nw >= minX && nx <= maxX && ny + nh >= minY && ny <= maxY) {
                result.push(note);
            }
        }
        return result;
    };

    PianoRoll.prototype._findNoteById = function(id) {
        for (var i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === id) return i;
        }
        return -1;
    };

    PianoRoll.prototype._noteIdExists = function(id) {
        for (var i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === id) return true;
        }
        return false;
    };

    // 生成全局唯一音符 id
    // 防御: 若 _noteIdCounter 因 setNotes 重置/空洞而撞上已存在 id, 则继续递增直到唯一
    // (id 是选中/移动/播放高亮等所有状态按 id 索引的键, 一旦重复会导致音符"共享状态"错乱)
    PianoRoll.prototype._nextId = function() {
        var id;
        do {
            id = 'note_' + (this._noteIdCounter++);
        } while (this._noteIdExists(id));
        return id;
    };

    // 扫描现有音符 id 的最大序号, 将计数器重置为其 + 1, 避免后续分配撞上旧 id
    PianoRoll.prototype._recalcNoteIdCounter = function() {
        var maxNum = 0;
        for (var i = 0; i < this.notes.length; i++) {
            var id = this.notes[i].id;
            if (!id) continue;
            var m = /^note_(\d+)$/.exec(id);
            if (m) {
                var num = parseInt(m[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
        this._noteIdCounter = maxNum + 1;
    };

    // ============ 选定操作 ============
    PianoRoll.prototype._selectNote = function(note, additive) {
        if (!additive) this.selectedNotes = {};
        if (note) { this.selectedNotes[note.id] = true; this._touchedNote = note; }
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    PianoRoll.prototype._toggleSelection = function(note) {
        if (this.selectedNotes[note.id]) delete this.selectedNotes[note.id];
        else this.selectedNotes[note.id] = true;
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    PianoRoll.prototype._clearSelection = function() {
        this.selectedNotes = {};
        this._touchedNote = null;
        if (this.onSelectionChanged) this.onSelectionChanged([]);
    };

    PianoRoll.prototype.clearSelection = function() {
        this._clearSelection();
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.highlightPianoKey = function(nbsKey, active) {
        if (active) {
            this._pianoHighlightKeys = this._pianoHighlightKeys || {};
            this._pianoHighlightKeys[nbsKey] = true;
        } else {
            if (this._pianoHighlightKeys) {
                delete this._pianoHighlightKeys[nbsKey];
            }
        }
        this._staticLayerDirty = true;
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.setShowKeyLabels = function(show) {
        this._showKeyLabels = show;
        this.render();
    };

    // 绘制钢琴键盘 (底部水平条, 显示键标签和高亮)
    PianoRoll.prototype._drawPianoKeyboard = function() {
        return;
        if (!this._showKeyLabels && !this._pianoHighlightKeys) return;
        var hasHighlight = this._pianoHighlightKeys && Object.keys(this._pianoHighlightKeys).length > 0;
        if (!this._showKeyLabels && !hasHighlight) return;

        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var pw = this._currentPanelWidth;

        // 钢琴键盘条参数
        var kbH = 70;
        var kbY = h - kbH;
        var kbX = pw;
        var kbW = w - pw;
        if (kbW <= 0) return;

        // 键盘范围 (NBS key 36~67, 对应键盘映射范围)
        var keyMin = 36;
        var keyMax = 67;

        var whiteKeyIndices = {0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6};
        var blackBoundaries = {1:1, 3:2, 6:4, 8:5, 10:6};

        // 计算白键总数
        var totalWhiteKeys = 0;
        for (var k = keyMin; k <= keyMax; k++) {
            if (whiteKeyIndices[k % 12] !== undefined) totalWhiteKeys++;
        }
        if (totalWhiteKeys === 0) return;

        var whiteW = kbW / totalWhiteKeys;
        var whiteH = kbH;
        var blackW = whiteW * 0.6;
        var blackH = kbH * 0.6;

        // 背景
        ctx.fillStyle = '#0e0e22';
        ctx.fillRect(kbX, kbY, kbW, kbH);

        var highlights = this._pianoHighlightKeys || {};
        var accentColor = '#4ecdc4';

        // 先画白键
        var whiteIdx = 0;
        for (var wk = keyMin; wk <= keyMax; wk++) {
            if (whiteKeyIndices[wk % 12] === undefined) continue;
            var wx = kbX + whiteIdx * whiteW;
            var isHL = highlights[wk];

            // 白键底色
            if (isHL) {
                ctx.fillStyle = accentColor;
            } else {
                ctx.fillStyle = '#fcfcfc';
            }
            ctx.fillRect(wx, kbY, whiteW, whiteH);

            // 边框
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.strokeRect(wx + 0.5, kbY + 0.5, whiteW - 1, whiteH - 1);

            // 键标签
            if (this._showKeyLabels && KEY_LABELS[wk]) {
                ctx.fillStyle = isHL ? '#ffffff' : 'rgba(0,0,0,0.5)';
                ctx.font = '10px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(KEY_LABELS[wk], wx + whiteW / 2, kbY + whiteH - 10);
            }

            whiteIdx++;
        }

        // 再画黑键 (在上层)
        for (var bk = keyMin; bk <= keyMax; bk++) {
            var boundary = blackBoundaries[bk % 12];
            if (boundary === undefined) continue;
            // 计算该黑键之前的白键数, 以确定水平位置
            var prevWhiteCount = 0;
            for (var pk = keyMin; pk < bk; pk++) {
                if (whiteKeyIndices[pk % 12] !== undefined) prevWhiteCount++;
            }
            var bx = kbX + prevWhiteCount * whiteW - blackW / 2;
            var isHLB = highlights[bk];

            // 黑键底色
            if (isHLB) {
                ctx.fillStyle = accentColor;
            } else {
                ctx.fillStyle = '#1a1a1a';
            }
            ctx.fillRect(bx, kbY, blackW, blackH);

            // 边框
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, kbY + 0.5, blackW - 1, blackH - 1);

            // 键标签
            if (this._showKeyLabels && KEY_LABELS[bk]) {
                ctx.fillStyle = isHLB ? '#ffffff' : 'rgba(255,255,255,0.5)';
                ctx.font = '10px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(KEY_LABELS[bk], bx + blackW / 2, kbY + blackH - 7);
            }
        }
    };

    // 选择矩形: 直接接收网格坐标 (tick/layer), 滚动时不会偏移
    PianoRoll.prototype._selectByRect = function(tick1, layer1, tick2, layer2, additive) {
        var tickStart = Math.min(tick1, tick2);
        var tickEnd = Math.max(tick1, tick2);
        var layerStart = Math.min(layer1, layer2);
        var layerEnd = Math.max(layer1, layer2);
        if (!additive) this.selectedNotes = {};
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            if (n.tick >= tickStart && n.tick <= tickEnd && n.layer >= layerStart && n.layer <= layerEnd) {
                this.selectedNotes[n.id] = true;
            }
        }
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    // 从屏幕坐标创建选择矩形: 网格坐标用于"实际选中哪些音符",
    // 同时保存屏幕坐标 (sx1,sy1 按下点 / sx2,sy2 当前点) 用于"跟手"的选框绘制 (不吸附网格)
    PianoRoll.prototype._makeSelectionRect = function(x1, y1, x2, y2) {
        return {
            tick1: this._screenToTick(x1),
            layer1: this._screenToLayer(y1),
            tick2: this._screenToTick(x2),
            layer2: this._screenToLayer(y2),
            sx1: x1, sy1: y1,
            sx2: x2, sy2: y2
        };
    };

    // ============ 音符拖拽 ============
    PianoRoll.prototype._snapDragPositions = function() {
        this._dragNoteStart = {};
        var ids = Object.keys(this.selectedNotes);
        for (var i = 0; i < ids.length; i++) {
            var idx = this._findNoteById(ids[i]);
            if (idx >= 0) {
                var n = this.notes[idx];
                this._dragNoteStart[ids[i]] = { tick: n.tick, layer: n.layer, key: n.key };
            }
        }
        if (this.onNoteDragStart) this.onNoteDragStart();
    };

    // 开始拖动预览: 记录鼠标相对锚点音符的浮点偏移, 使音符始终跟随鼠标而不跳格
    // anchorId: 被按住的音符 (默认取第一个选中音符), 保证拖动的音符精确跟随鼠标
    // 设计要点:
    //   1) previewTick/previewLayer: 浮点预览位置, 抓取点始终贴着鼠标 (平滑 1:1 跟随)
    //   2) targetTick/targetLayer: 吸附目标格 = 鼠标当前所在格 (floor), 保证"鼠标放在哪格, 松手就落在哪格"
    PianoRoll.prototype._beginDragPreview = function(x, y, anchorId) {
        if (Object.keys(this.selectedNotes).length === 0) { this._dragPreview = null; return; }
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom, cellH = cfg.cellH * this.zoom;
        if (cellW <= 0 || cellH <= 0) { this._dragPreview = null; return; }
        var ids = Object.keys(this.selectedNotes);
        var aid = (anchorId && this.selectedNotes[anchorId]) ? anchorId : ids[0];
        var idx = this._findNoteById(aid);
        if (idx < 0) { this._dragPreview = null; return; }
        var base = this.notes[idx];
        // 鼠标在格坐标中的浮点位置 (相对锚点音符的偏移被固定, 移动时音符不跳格)
        var floatTick = (x - pw + this.scrollX) / cellW;
        var floatLayer = (y - cfg.timelineHeight + this.scrollY) / cellH;
        this._dragPreview = {
            anchorId: aid,
            anchorOffTick: floatTick - base.tick,
            anchorOffLayer: floatLayer - base.layer,
            baseTick: base.tick,
            baseLayer: base.layer,
            previewTick: base.tick,
            previewLayer: base.layer,
            targetTick: base.tick,
            targetLayer: base.layer,
            moved: false
        };
    };

    // 更新拖动预览: 音符视觉跟随鼠标 (浮点), 吸附目标格 = 鼠标所在格
    PianoRoll.prototype._updateDragPreview = function(currentX, currentY) {
        var pv = this._dragPreview;
        if (!pv) return;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom, cellH = cfg.cellH * this.zoom;
        if (cellW <= 0 || cellH <= 0) return;
        var floatTick = (currentX - pw + this.scrollX) / cellW;
        var floatLayer = (currentY - cfg.timelineHeight + this.scrollY) / cellH;
        // 预览渲染位置: 抓取点贴着鼠标 (浮点, 平滑跟随, 无跳格)
        pv.previewTick = floatTick - pv.anchorOffTick;
        pv.previewLayer = floatLayer - pv.anchorOffLayer;
        // 吸附目标: 鼠标所在格 (floor). 相比 round 锚点偏移, floor 保证无论从音符哪个位置抓取,
        // 松手后音符都落在鼠标当前所在的格子, 避免"永远差一格/有偏差"的感觉
        var tTick = Math.floor(floatTick);
        var tLayer = Math.floor(floatLayer);
        pv.targetTick = Math.max(0, tTick);
        pv.targetLayer = Math.max(0, Math.min(this.trackCount - 1, tLayer));
        if (pv.targetTick !== pv.baseTick || pv.targetLayer !== pv.baseLayer) pv.moved = true;
    };

    PianoRoll.prototype._moveSelectedNotes = function(tickDelta, layerDelta) {
        if (tickDelta === 0 && layerDelta === 0) return;
        var ids = Object.keys(this.selectedNotes);
        for (var i = 0; i < ids.length; i++) {
            var idx = this._findNoteById(ids[i]);
            if (idx < 0) continue;
            var note = this.notes[idx];
            var start = this._dragNoteStart[ids[i]];
            if (!start) continue;
            var newTick = Math.max(0, start.tick + tickDelta);
            var newLayer = Math.max(0, Math.min(this.trackCount - 1, start.layer + layerDelta));
            // 仅当目标格子变化时才更新 (避免精度问题导致卡住)
            if (note.tick !== newTick || note.layer !== newLayer) {
                note.tick = newTick;
                note.layer = newLayer;
            }
        }
        // tick 变化需要重建索引
        if (tickDelta !== 0) this._markNoteIndexDirty();
    };

    // 松手: 把预览目标格提交到音符 (音符在 _updateDragPreview 中已跟随鼠标预览)
    PianoRoll.prototype._finalizeDragMove = function() {
        var pv = this._dragPreview;
        if (pv && pv.moved) {
            this._moveSelectedNotes(pv.targetTick - pv.baseTick, pv.targetLayer - pv.baseLayer);
        }
        this._removeOverlappedNotes();
        this._dragNoteStart = {};
        this._dragPreview = null;
        if (this.onNotesChanged) this.onNotesChanged(this.getSelectedNotes());
    };

    // 移除被移动音符覆盖的其他音符（同一 tick+layer 位置）
    // 注意：完全不允许同一个格子出现多个音符
    PianoRoll.prototype._removeOverlappedNotes = function() {
        var selectedIds = this.selectedNotes;
        var toRemove = [];
        // 建立所有选中音符的位置集合
        var movedPositions = {};
        var selKeys = Object.keys(selectedIds);
        for (var i = 0; i < selKeys.length; i++) {
            var idx = this._findNoteById(selKeys[i]);
            if (idx >= 0) {
                var n = this.notes[idx];
                var posKey = n.tick + '_' + n.layer;
                if (movedPositions[posKey]) {
                    // 多个选中音符移动到了同一位置，后面的删掉
                    toRemove.push(n.id);
                } else {
                    movedPositions[posKey] = true;
                }
            }
        }
        // 找出被覆盖的非选中音符
        for (var j = this.notes.length - 1; j >= 0; j--) {
            var note = this.notes[j];
            if (selectedIds[note.id]) continue;  // 跳过选中的音符
            var posKey = note.tick + '_' + note.layer;
            if (movedPositions[posKey]) {
                toRemove.push(note.id);
            }
        }
        if (toRemove.length > 0) {
            this.removeNotesByIds(toRemove);
        }
    };

    // ============ 长按动画 ============
    var LONG_PRESS_DELAY = 600;

    PianoRoll.prototype._startLongPressTimer = function(note) {
        var self = this;
        this._cancelLongPress();
        this._longPressFired = false;
        this._longPressIsOnNote = !!note;

        this._longPressTimer = setTimeout(function() {
            self._longPressFired = true;
            // 标准触控逻辑: 长按达到延时后, 统一播放长按动画 (按住期间持续 hold)
            // 松开时: 如果没有移动过 → 弹出菜单; 如果移动过 → 已切换到选择框/拖拽模式
            var selectedIds = Object.keys(self.selectedNotes);
            // 无论长按音符还是空白, 手指位置始终播放"大灰白扩散环" (希沃白板风格),
            // 保证触控反馈在任何情况下都稳定可见 (不再受已选音符集合影响)
            self._startLongPressAnimation(selectedIds);
            self._touchMode = 'longpress-anim';
        }, LONG_PRESS_DELAY);
    };

    PianoRoll.prototype._cancelLongPress = function() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        this._longPressFired = false;
    };

    // 开始长按反馈动画: 音符放大 + 手指位置的灰白扩散环, 完成后保持最后一帧
    PianoRoll.prototype._startLongPressAnimation = function(noteIds) {
        this._isAnimating = true;
        this._animHoldAtEnd = false;
        this._animShrinking = false;
        // 长按反馈使用更快的独立时长 (360ms), 避免沿用播放高亮的 1000ms 而显得迟钝
        this._lpAnimDuration = 360;
        this._animStartTime = performance.now();
        this._animNoteIds = noteIds;
        // 手指位置 (按下点) 的灰白扩散环
        this._lpActive = true;
        this._lpAnimStart = performance.now();
        var self = this;
        var animate = function(timestamp) {
            if (!self._isAnimating || self._animShrinking) return;
            var elapsed = timestamp - self._animStartTime;
            if (elapsed >= self._lpAnimDuration) {
                self._animHoldAtEnd = true;
                self.render();
                return;
            }
            self.render();
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    };

    // 淡出动画 (从当前 scale 平滑回到 1.0) - 用 _animShrinking 标记
    PianoRoll.prototype._fadeOutAnimation = function() {
        // 手指位置的脉冲环随动画一起消失
        this._lpActive = false;
        // 仅在放大 hold 状态下做缩小动画；否则直接停止
        if (this._isAnimating || this._animHoldAtEnd) {
            this._animShrinking = true;
            this._shrinkStartTime = performance.now();
            this._shrinkFromScale = this._getAnimationScale();
            this._isAnimating = false;
            this._animHoldAtEnd = false;
            var self = this;
            var shrinkStep = function() {
                if (!self._animShrinking) return;
                var elapsed = performance.now() - self._shrinkStartTime;
                var dur = 160;
                if (elapsed >= dur) {
                    self._animShrinking = false;
                    self._animNoteIds = null;
                    self._shrinkFromScale = 1;
                    self.render();
                    return;
                }
                self.render();
                requestAnimationFrame(shrinkStep);
            };
            requestAnimationFrame(shrinkStep);
        } else {
            this._animNoteIds = null;
            this._animShrinking = false;
            this.render();
        }
    };

    // 松开时：显示菜单
    PianoRoll.prototype._showContextMenu = function() {
        // 与 _fadeOutAnimation 行为一致：先做缩小动画再显示菜单
        var self = this;
        this._fadeOutAnimation();
        if (this.onContextMenu && Object.keys(this.selectedNotes).length > 0) {
            // 缩短到 60ms 内弹出菜单，但仍先启动缩小
            setTimeout(function() {
                if (self.onContextMenu) {
                    self.onContextMenu(self._touchStartX, self._touchStartY, Object.keys(self.selectedNotes), true);
                }
            }, 80);
        }
        this._pendingContextMenu = false;
    };

    PianoRoll.prototype._getAnimationScale = function() {
        // shrink 阶段: 从 _shrinkFromScale 缓出到 1.0
        if (this._animShrinking) {
            var elapsed = performance.now() - this._shrinkStartTime;
            var dur = 160;
            var t = Math.min(1, elapsed / dur);
            // ease-out cubic
            var eased = 1 - Math.pow(1 - t, 3);
            var from = this._shrinkFromScale || 1.22;
            return from + (1.0 - from) * eased;
        }
        if (!this._isAnimating && !this._animHoldAtEnd) return 1;
        if (this._animHoldAtEnd) return 1.22;
        var elapsed = performance.now() - this._animStartTime;
        // 长按反馈用独立的快速时长 (360ms), 其余场景回退到 _animDuration
        var dur = this._lpAnimDuration || this._animDuration || 360;
        if (elapsed >= dur) return 1.22;
        var t = elapsed / dur;
        // 放大阶段也用 ease-out，避免刚开始突然蹦大
        var easedT = 1 - Math.pow(1 - t, 2.5);
        return 1 + 0.22 * easedT;
    };

    // ============ 放置/删除 动画 ============

    PianoRoll.prototype._addPlaceAnimation = function(note, skipPreview) {
        this._noteAnims.push({
            id: note.id,
            tick: note.tick,
            layer: note.layer,
            instrument: note.instrument,
            key: note.key,
            startTime: performance.now(),
            type: 'place',
            duration: 280
        });
        // 启动连续动画循环（如果还没启动）
        this._startAnimLoop();
        // 播放音色（skipPreview=true 时跳过，避免录制模式下双重播放）
        if (!skipPreview && this.onNotePreview && note.key !== undefined) {
            this.onNotePreview(note.instrument, note.key);
        }
    };

    PianoRoll.prototype._addDeleteAnimation = function(note) {
        // 关键：动画期间要保证 note 仍在 notes 列表中，否则 _drawNotes 会直接消失。
        // 注意：删除时调用者必须先用 removeNote 把 note 从主列表删除；
        // 动画使用 _noteAnims 中的快照坐标来维持视觉。
        var noteId = note.id;
        this._noteAnims.push({
            id: noteId,
            tick: note.tick,
            layer: note.layer,
            instrument: note.instrument,
            key: note.key,
            startTime: performance.now(),
            type: 'delete',
            duration: 260
        });
        this._startAnimLoop();
    };

    // 启动动画循环：使用 rAF 让所有 _noteAnims / 播放高亮 期间持续 render (节流到 30fps)
    PianoRoll.prototype._startAnimLoop = function() {
        if (this._animLoopRunning) return;
        this._animLoopRunning = true;
        var self = this;
        var _lastAnimFrame = 0;
        var step = function(timestamp) {
            if (!self._animLoopRunning) return;
            // 节流: 最多 30fps (每 33ms 渲染一次)
            if (timestamp - _lastAnimFrame < 33) {
                self._animLoopRAF = requestAnimationFrame(step);
                return;
            }
            _lastAnimFrame = timestamp;
            self._processNoteAnims();
            self._processPlayHighlights();
            if (!self.isPlaying) self.render();
            if (self._noteAnims.length > 0 || self._hasActiveHighlights()) {
                self._animLoopRAF = requestAnimationFrame(step);
            } else {
                self._animLoopRunning = false;
                self._animLoopRAF = null;
            }
        };
        self._animLoopRAF = requestAnimationFrame(step);
    };

    PianoRoll.prototype._processNoteAnims = function() {
        var now = performance.now();
        var alive = [];
        for (var i = 0; i < this._noteAnims.length; i++) {
            if (now - this._noteAnims[i].startTime < this._noteAnims[i].duration) {
                alive.push(this._noteAnims[i]);
            }
        }
        this._noteAnims = alive;
    };

    // 获取动画进度 0..1
    PianoRoll.prototype._getAnimProgress = function(noteId, type) {
        for (var i = 0; i < this._noteAnims.length; i++) {
            var a = this._noteAnims[i];
            if (a.id === noteId && a.type === type) {
                return Math.min(1, (performance.now() - a.startTime) / a.duration);
            }
        }
        return -1;
    };

    // ============ 音符播放高亮动画 ============
    PianoRoll.prototype.highlightPlayingNotes = function(noteArray) {
        if (!noteArray || noteArray.length === 0) return;
        var now = performance.now();
        var duration = this._animDuration; // 播放高亮动画 1 秒
        for (var i = 0; i < noteArray.length; i++) {
            var n = noteArray[i];
            if (!n || !n.id) continue;
            this._playHighlights[n.id] = { startTime: now, duration: duration };
        }
        if (!this._animLoopRunning) {
            this._processPlayHighlights();
            if (this._hasActiveHighlights()) this._startAnimLoop();
        }
    };

    PianoRoll.prototype.clearPlayHighlights = function() {
        this._playHighlights = {};
    };

    PianoRoll.prototype._processPlayHighlights = function() {
        var now = performance.now();
        var keys = Object.keys(this._playHighlights);
        for (var i = 0; i < keys.length; i++) {
            var h = this._playHighlights[keys[i]];
            if (now - h.startTime >= h.duration) {
                delete this._playHighlights[keys[i]];
            }
        }
    };

    PianoRoll.prototype._hasActiveHighlights = function() {
        return Object.keys(this._playHighlights).length > 0;
    };

    // _ensureGridCache 已移除，改用全量渲染

    // 处理音轨面板点击命中 (鼠标/触摸共用)
    PianoRoll.prototype._handleTrackPanelHit = function(hit, e) {
        if (hit.type === 'addtrack') {
            if (this.onAddTrack) this.onAddTrack();
            return;
        }
        if (hit.type === 'name') {
            var layout = this._getTrackButtonLayout(this._cfg.cellH * this.zoom);
            var nameY = this._layerToScreen(hit.layer);
            this._showTrackNameEditor(hit.layer, layout.nameStart, nameY, layout.nameEnd - layout.nameStart);
            return;
        }
        if (hit.type === 'selectall') {
            // 全选按钮：追加到当前选择，而不是替换
            this.selectNotesInLayer(hit.layer, true);
            if (this.onSelectAllInLayer) this.onSelectAllInLayer(hit.layer);
            return;
        }
        if (hit.type === 'drag') {
            // 拖动手柄: 由 _onMouseDown/_onTouchStart 处理长按拖动, 不在此处理
            return;
        }
        if (hit.type === 'more') {
            // 更多按钮: 显示 M/S/音量/删除 菜单
            this._showTrackMoreMenu(hit.layer, e.clientX, e.clientY);
            return;
        }
        if (hit.type === 'volume') {
            // 音量按钮: 只显示滑块+输入框
            this._showVolumePopup(hit.layer, e.clientX, e.clientY);
            return;
        }
        if (hit.type === 'delete') {
            if (this.onDeleteTrack) this.onDeleteTrack(hit.layer);
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }
        var info = this.getTrackInfo(hit.layer);
        var updated = { name: info.name, muted: info.muted, solo: info.solo, volume: info.volume };
        if (hit.type === 'mute') updated.muted = !info.muted;
        else if (hit.type === 'solo') updated.solo = !info.solo;
        this.setTrackInfo(hit.layer, updated);
        if (this.onTrackChanged) this.onTrackChanged(hit.layer, updated);
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 音轨更多菜单 (M / S / 音量 / 删除)
    PianoRoll.prototype._showTrackMoreMenu = function(layer, clientX, clientY) {
        var self = this;
        var existing = document.getElementById('track-more-menu');
        if (existing) existing.remove();

        var trackInfo = this.getTrackInfo(layer);
        var translate = window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate : function(text) { return text; };
        var menu = document.createElement('div');
        menu.id = 'track-more-menu';
        menu.style.cssText = 'position:fixed;z-index:10002;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;min-width:120px;';

        function addItem(label, onClick, danger) {
            var item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;border-radius:4px;cursor:pointer;white-space:nowrap;' + (danger ? 'color:#ff6b6b;' : '');
            item.textContent = label;
            item.addEventListener('mouseenter', function() { item.style.background = 'rgba(255,255,255,0.08)'; });
            item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
            item.addEventListener('click', function(ev) {
                ev.stopPropagation();
                onClick();
                menu.remove();
                document.removeEventListener('mousedown', closeHandler, true);
                document.removeEventListener('touchstart', closeHandler, true);
            });
            menu.appendChild(item);
        }

        addItem(translate(trackInfo.muted ? '取消静音' : '静音') + ' (M)', function() {
            var info = self.getTrackInfo(layer);
            var updated = { name: info.name, muted: !info.muted, solo: info.solo, volume: info.volume };
            self.setTrackInfo(layer, updated);
            if (self.onTrackChanged) self.onTrackChanged(layer, updated);
            self._fullRedrawNeeded = true;
            self.render();
        });
        addItem(translate(trackInfo.solo ? '取消独奏' : '独奏') + ' (S)', function() {
            var info = self.getTrackInfo(layer);
            var updated = { name: info.name, muted: info.muted, solo: !info.solo, volume: info.volume };
            self.setTrackInfo(layer, updated);
            if (self.onTrackChanged) self.onTrackChanged(layer, updated);
            self._fullRedrawNeeded = true;
            self.render();
        });
        addItem(translate('音量:') + ' ' + (trackInfo.volume !== undefined ? trackInfo.volume : 100), function() {
            self._showVolumePopup(layer, clientX, clientY);
        });
        addItem(translate('删除音轨'), function() {
            if (self.onDeleteTrack) self.onDeleteTrack(layer);
            self._fullRedrawNeeded = true;
            self.render();
        }, true);

        document.body.appendChild(menu);
        if (window.WebNBSPositionFlyout) {
            window.WebNBSPositionFlyout(menu, { left: clientX, right: clientX, top: clientY, bottom: clientY });
        }

        // 点击外部关闭
        var closeHandler = function(ev) {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeHandler, true);
                document.removeEventListener('touchstart', closeHandler, true);
            }
        };
        setTimeout(function() {
            document.addEventListener('mousedown', closeHandler, true);
            document.addEventListener('touchstart', closeHandler, true);
        }, 50);
    };

    // 音量设置弹窗 (仅滑块 + 输入框, 单位 %)
    PianoRoll.prototype._showVolumePopup = function(layer, clientX, clientY) {
        // 移除已有弹窗
        var existing = document.getElementById('track-volume-popup');
        if (existing) existing.remove();

        var self = this;
        var trackInfo = this.getTrackInfo(layer);
        var currentVol = trackInfo.volume !== undefined ? trackInfo.volume : 100;

        var popup = document.createElement('div');
        popup.id = 'track-volume-popup';
        popup.style.cssText = 'position:fixed;z-index:10001;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;';

        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(currentVol);
        slider.style.cssText = 'width:140px;accent-color:#4ecdc4;';

        var input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '100';
        input.value = String(currentVol);
        input.style.cssText = 'width:50px;background:#1a1a2e;color:#d0d0d0;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 4px;font-size:12px;text-align:center;';

        var unit = document.createElement('span');
        unit.textContent = '%';
        unit.style.cssText = 'color:#888;font-size:12px;';

        row.appendChild(slider);
        row.appendChild(input);
        row.appendChild(unit);
        popup.appendChild(row);
        document.body.appendChild(popup);

        // 定位 (避免超出屏幕)
        if (window.WebNBSPositionFlyout) {
            window.WebNBSPositionFlyout(popup, { left: clientX, right: clientX, top: clientY, bottom: clientY });
        }

        var updateVolume = function(val) {
            val = Math.max(0, Math.min(100, parseInt(val) || 0));
            slider.value = String(val);
            input.value = String(val);
            var info = self.getTrackInfo(layer);
            var updated = { name: info.name, muted: info.muted, solo: info.solo, volume: val };
            self.setTrackInfo(layer, updated);
            if (self.onTrackChanged) self.onTrackChanged(layer, updated);
            if (self.onSetTrackVolume) self.onSetTrackVolume(layer, val);
            if (self.onNotesChanged) self.onNotesChanged([]);
            // 回调内部可能通过 syncPianoRollTrackInfo 把 trackInfo.volume 重置为默认 100,
            // 这里在所有回调之后重新写回正确音量, 保证显示与持久化一致
            var infoAfter = self.getTrackInfo(layer);
            self.setTrackInfo(layer, { name: infoAfter.name, muted: infoAfter.muted, solo: infoAfter.solo, volume: val });
            self._fullRedrawNeeded = true;
            self.render();
        };

        slider.addEventListener('input', function() { updateVolume(this.value); });
        slider.addEventListener('mousedown', function() {
            if (self.onVolumeChangeStart) self.onVolumeChangeStart(layer);
        });
        input.addEventListener('input', function() { updateVolume(this.value); });
        input.addEventListener('change', function() { updateVolume(this.value); });
        input.addEventListener('focus', function() {
            if (self.onVolumeChangeStart) self.onVolumeChangeStart(layer);
        });

        // 点击外部关闭
        var closeHandler = function(ev) {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener('mousedown', closeHandler, true);
                document.removeEventListener('touchstart', closeHandler, true);
            }
        };
        setTimeout(function() {
            document.addEventListener('mousedown', closeHandler, true);
            document.addEventListener('touchstart', closeHandler, true);
        }, 50);
    };

    // 显示音轨名称编辑器 (HTML input 覆盖)
    PianoRoll.prototype._showTrackNameEditor = function(layer, x, y, width) {
        var self = this;
        // 清理之前的编辑器
        if (this._trackNameInput) {
            this._trackNameInput.remove();
            this._trackNameInput = null;
        }
        var trackInfo = this.getTrackInfo(layer);
        var input = document.createElement('input');
        input.type = 'text';
        input.value = trackInfo.name || ('Layer ' + (layer + 1));
        input.style.cssText = 'position:fixed;z-index:10000;background:#1a1a2e;color:#d0d0d0;border:1px solid #4ecdc4;border-radius:3px;padding:2px 4px;font-size:11px;font-family:inherit;width:' + width + 'px;';
        var rect = this.canvas.getBoundingClientRect();
        input.style.left = (rect.left + x) + 'px';
        input.style.top = (rect.top + y) + 'px';
        document.body.appendChild(input);
        this._trackNameInput = input;
        input.focus();
        input.select();

        var commit = function() {
            var newName = input.value.trim();
            if (newName && self.onTrackRename) {
                self.onTrackRename(layer, newName);
            }
            input.remove();
            if (self._trackNameInput === input) self._trackNameInput = null;
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = trackInfo.name || ''; input.blur(); }
        });
    };

    // ============ 鼠标事件 ============
    PianoRoll.prototype._onMouseDown = function(e) {
        // 全局标记: 刚刚有右键菜单/弹窗被关闭, 这次 mousedown 是"关闭残留", 不应触发放置音符
        if (this._suppressNextClick) {
            this._suppressNextClick = false;
            return;
        }
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        // 记录鼠标位置 (用于粘贴时定位准星位置)
        this._lastMouseX = x;
        this._lastMouseY = y;
        var pw = this._currentPanelWidth;

        // Space+左键: 平移画布 (右键平移的可靠替代, 不受浏览器手势干扰)
        if (e.button === 0 && this._spaceHeld) {
            this._mouseDown = true;
            this._hasMoved = false;
            this._dragStartX = x;
            this._dragStartY = y;
            this._isPanning = true;
            this._panButton = 0;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // 顶部滑动条: 左右翻页 (拖动滚动视图, 不跳播放头)
        if (y < this._cfg.progressBarHeight) {
            this._isDraggingProgressBar = true;
            this._mouseDown = true;
            this._dragStartX = x;
            this._dragStartY = y;
            this._scrollFromSliderX(x);
            return;
        }

        // 时间轴标尺: 拖动滑条形式 (按下不跳转, 拖动时保持按下点与播放头的相对偏移, 轻点才跳转)
        if (y < this._cfg.timelineHeight && x >= pw) {
            this._isTimelineDrag = true;
            this._mouseDown = true;
            this._timelineDragStartX = x;
            this._timelineDragMoved = false;
            var phTick = (this._smoothedPlayheadTick !== undefined && this._smoothedPlayheadTick !== null)
                ? this._smoothedPlayheadTick : this.playheadTick;
            var phX = this._tickToScreen(phTick);
            // 记录鼠标与播放头的相对偏移, 拖动时保持该偏移, 避免一开始就跳转到鼠标位置
            this._timelineDragOffsetX = phX - x;
            return;
        }

        // 播放头拖拽: 点击编辑区内播放头红线附近 (6px)
        if (e.button === 0 && y >= this._cfg.timelineHeight && x >= pw) {
            var phTick = (this._smoothedPlayheadTick !== undefined && this._smoothedPlayheadTick !== null)
                ? this._smoothedPlayheadTick : this.playheadTick;
            var phX = this._tickToScreen(phTick);
            if (Math.abs(x - phX) <= 6) {
                this._isDraggingPlayhead = true;
                this._mouseDown = true;
                this._dragStartX = x;
                this._dragStartY = y;
                var dragTick = this._screenToTickNearest(x);
                this.playheadTick = dragTick;
                this._smoothedPlayheadTick = dragTick;
                this.seekToTick(dragTick);
                return;
            }
        }

        // 左侧音轨信息区按钮点击 (桌面端)
        if (x < pw && y >= this._cfg.timelineHeight && e.button === 0) {
            var hit = this._hitTestTrackPanel(x, y);
            if (hit) {
                // 拖动手柄: 桌面端直接进入拖拽模式
                if (hit.type === 'drag') {
                    this._isDraggingTrack = true;
                    this._draggedTrackLayer = hit.layer;
                    this._dragTargetLayer = hit.layer;
                    this._mouseDown = true;
                    this._dragStartX = x;
                    this._dragStartY = y;
                    this._fullRedrawNeeded = true;
                    this.render();
                    return;
                }
                // 按下视觉反馈 (名称区域除外)
                if (hit.type !== 'name') {
                    this._trackPanelPressed = { layer: hit.layer, type: hit.type };
                    this._fullRedrawNeeded = true;
                    this.render();
                }
                this._handleTrackPanelHit(hit, e);
                return;
            }
        }

        // 左侧音轨信息区右键菜单 (桌面端)
        if (x < pw && y >= this._cfg.timelineHeight && e.button === 2) {
            var layerHit = this._screenToLayer(y);
            if (layerHit >= 0 && layerHit < this.trackCount) {
                this._handleTrackContextMenu(e, layerHit);
                return;
            }
        }

        this._mouseButton = e.button;
        this._mouseDown = true;
        this._hasMoved = false;
        this._dragStartX = x;
        this._dragStartY = y;
        this._isDraggingNote = false;
        this._pendingPlace = false;
        this._isErasing = false;
        this._erasedNoteIds = {};
        this._isPanning = false;
        // 重置右键平移标记, 防止上次拖出 canvas 未消费导致菜单误判
        this._rightDragMoved = false;

        var clickedNote = this._getNoteAt(x, y);

        if (this.currentTool === 'select' && e.button === 0) {
            if (clickedNote) {
                // 选择工具: 点击音符 = 多选/取消 (等效一直按住 Ctrl), 不清除已有选区
                this._toggleSelection(clickedNote);
                // 仅当该音符仍处于选中状态时才允许拖动 (刚被取消选中的音符不拖动)
                if (this.selectedNotes[clickedNote.id]) {
                    this._snapDragPositions();
                    this._beginDragPreview(x, y, clickedNote.id);
                }
            } else {
                this._isSelecting = true;
                // 存储锚点网格坐标 (mousemove/边缘自动滚动时保持框选起点不变)
                this._selectStartTick = this._screenToTick(x);
                this._selectStartLayer = this._screenToLayer(y);
                this._selectionRect = this._makeSelectionRect(x, y, x, y);
                // 选择工具: 框选默认增量添加 (相当于一直按住 Ctrl), 不清除已有选区
            }
            return;
        }

        if (this.currentTool === 'eraser' && e.button === 0) {
            // 橡皮: 统一清除入口 (区域清除 / 连续清除, 配置来自创作辅助)
            if (this.onNoteDragStart) this.onNoteDragStart();
            this._eraseAt(x, y);
            return;
        }

        if (this.currentTool === 'brush' && e.button === 0) {
            var brushTick = this._screenToTickNearest(x);
            var brushLayer = this._screenToLayer(y);
            var brushKey = this.getSelectedKey();
            // 未通过钢琴键盘选音调时回退为当前层 (与默认工具点击放置一致)
            if (brushKey === null || brushKey === undefined || brushKey < 0) brushKey = brushLayer;
            // 仅编辑区内生效: 排除左侧音轨面板/时间轴上方的空白区域
            if (x >= this._currentPanelWidth && y >= this._cfg.timelineHeight && brushTick >= 0 && brushLayer >= 0 && brushLayer < this.trackCount) {
                // 记录当前格, 供 mousemove 同格去重
                this._lastPaintTick = brushTick;
                this._lastPaintLayer = brushLayer;
                // 统一放置入口: 按配置走普通放置/延音放置 (内部走 onNoteAdded / onNoteGroupAdded)
                this._placeBrushNote(brushTick, brushLayer, brushKey, true);
            }
            return;
        }

        // 选轨模式: 点击选择音轨行 (演奏模式 / 歌曲压缩的通用选轨)
        if ((this.currentTool === 'performance' || this._trackSelectMode) && e.button === 0) {
            var perfLayer = this._screenToLayer(y);
            if (perfLayer >= 0 && perfLayer < this.trackCount) {
                var selList = this._trackSelectMode ? this.compressionSelectedLayers : this.performanceSelectedLayers;
                var idx = selList.indexOf(perfLayer);
                if (idx >= 0) {
                    selList.splice(idx, 1);
                } else {
                    selList.push(perfLayer);
                }
                this._highlightLayer = selList.length > 0 ? selList[selList.length - 1] : -1;
                this.render();
                if (this._trackSelectMode) {
                    if (this.onTrackSelectChanged) this.onTrackSelectChanged(selList.slice());
                } else if (this.onPerformanceLayersChanged) {
                    this.onPerformanceLayersChanged(this.performanceSelectedLayers);
                }
            }
            return;
        }

        if (e.button === 0) {
            if (clickedNote) {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    this._toggleSelection(clickedNote);
                } else if (this.selectedNotes[clickedNote.id] && Object.keys(this.selectedNotes).length > 1) {
                    // 点击已选中的多选音符，保持选择不变
                } else if (!this.selectedNotes[clickedNote.id]) {
                    this._selectNote(clickedNote, false);
                }
                this._snapDragPositions();
                this._beginDragPreview(x, y, clickedNote.id);
                // 左键点击已有音符时给出声音反馈
                if (this.onNotePreview) {
                    this.onNotePreview(clickedNote.instrument, clickedNote.key);
                }
                this._fullRedrawNeeded = true;
                this.render();
            } else {
                var hadSelection = Object.keys(this.selectedNotes).length > 0;
                this._isSelecting = true;
                // 存储锚点网格坐标, 避免滚动时选择框偏移
                this._selectStartTick = this._screenToTick(x);
                this._selectStartLayer = this._screenToLayer(y);
                this._selectionRect = {
                    tick1: this._selectStartTick, layer1: this._selectStartLayer,
                    tick2: this._selectStartTick, layer2: this._selectStartLayer,
                    sx1: x, sy1: y,
                    sx2: x, sy2: y
                };
                // 已有选中音符时, 本次点击是"取消选择", 不应在松手时放置新音符
                this._pendingPlace = !e.shiftKey && !e.ctrlKey && !e.metaKey && !hadSelection;
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) this._clearSelection();
                if (hadSelection) {
                    this._fullRedrawNeeded = true;
                    this.render();
                }
            }
        } else if (e.button === 1 || e.button === 2) {
            // 中键 / 右键: 按住拖动平移画布
            // 右键原本是浏览器默认手势(上下文菜单), 这里覆盖为平移;
            // 右键轻点(未移动)松手后仍会弹出上下文菜单 (见 _onContextMenu 的 _rightDragMoved 判断)
            this._isPanning = true;
            this._panButton = e.button;
            this._rightDragMoved = false;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    };

    PianoRoll.prototype._onContextMenu = function(e) {
        e.preventDefault();
        e.stopPropagation();

        // 右键按住拖动进行过平移: 只覆盖浏览器默认菜单, 不弹出应用内菜单
        // (右键轻点未移动时, 这里会正常继续弹出上下文菜单)
        if (this._rightDragMoved) {
            this._rightDragMoved = false;
            return;
        }

        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var pw = this._currentPanelWidth;

        if (x < pw && y >= this._cfg.timelineHeight) {
            var layerHit = this._screenToLayer(y);
            if (layerHit >= 0 && layerHit < this.trackCount) {
                this._handleTrackContextMenu(e, layerHit);
                return;
            }
        }

        var ids = [];
        var clickedNote = this._getNoteAt(x, y);
        if (clickedNote) {
            if (!this.selectedNotes[clickedNote.id]) {
                this._selectNote(clickedNote, false);
            }
            ids = this.getSelectedNoteIds();
        }
        if (this.onContextMenu) {
            this.onContextMenu(e.clientX, e.clientY, ids, false);
        }
    };

    PianoRoll.prototype._onMouseMove = function(e) {
        // Space 按住时显示 grab 光标 (提示可平移)
        if (this._spaceHeld && !this._isPanning) {
            this.canvas.style.cursor = 'grab';
        } else if (this.currentTool === 'eraser') {
            this.canvas.style.cursor = 'crosshair';
        } else if (this.currentTool === 'brush') {
            this.canvas.style.cursor = 'crosshair';
        } else if (this.currentTool === 'select') {
            this.canvas.style.cursor = 'default';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }

        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        // 记录鼠标位置 (用于粘贴时定位)
        this._lastMouseX = x;
        this._lastMouseY = y;
        this._updateTrackPanelTooltip(x, y);

        // 悬停在音轨名称区域时改变光标为文本样式, 提示可点击重命名
        var pw = this._currentPanelWidth;
        var panelHit = null;
        if (pw > 0 && x < pw && y >= this._cfg.timelineHeight) {
            panelHit = this._hitTestTrackPanel(x, y);
            if (panelHit && panelHit.type === 'name') {
                this.canvas.style.cursor = 'text';
            } else if (panelHit && panelHit.type === 'drag') {
                this.canvas.style.cursor = 'grab';
            }
        }

        // 音轨信息栏按钮悬浮高亮 (hover 状态变化时重绘; 移出面板区域自动清除)
        var newHover = null;
        if (panelHit && panelHit.type !== 'name' && panelHit.type !== 'drag') {
            newHover = { layer: panelHit.layer, type: panelHit.type };
        }
        var oh = this._trackPanelHover;
        if ((oh && (!newHover || oh.layer !== newHover.layer || oh.type !== newHover.type))
            || (!oh && newHover)) {
            this._trackPanelHover = newHover;
            this._fullRedrawNeeded = true;
            this.requestRender();
        }

        // 延音放置: 悬停预览 (画笔/默认工具延音模式下显示整组放置位置, 不落库)
        if (this.currentTool === 'brush' || this.currentTool === 'default') {
            this._updateSustainPreview(x, y);
        }

        if (!this._mouseDown) return;

        // 顶部滑动条拖拽 (左右翻页滚动视图)
        if (this._isDraggingProgressBar) {
            this._scrollFromSliderX(x);
            return;
        }

        // 时间轴标尺拖拽 (拖动滑条: 保持按下时的相对偏移, 不跳转到鼠标位置)
        if (this._isTimelineDrag) {
            if (Math.abs(x - this._timelineDragStartX) > this._dragThreshold) {
                this._timelineDragMoved = true;
            }
            var rdragTick = this._screenToTick(x + this._timelineDragOffsetX);
            this.seekToTick(rdragTick);
            if (this.onTimelineSeek) this.onTimelineSeek(rdragTick);
            return;
        }

        // 播放头拖拽
        if (this._isDraggingPlayhead) {
            var dragTick = this._screenToTick(x);
            this.playheadTick = dragTick;
            this._smoothedPlayheadTick = dragTick;
            this.seekToTick(dragTick);
            return;
        }

        if (this._isDraggingTrack) {
            var cellH = this._cfg.cellH * this.zoom;
            var targetLayer = Math.floor((y - this._cfg.timelineHeight + this.scrollY) / cellH);
            if (targetLayer < 0) targetLayer = 0;
            if (targetLayer >= this.trackCount) targetLayer = this.trackCount - 1;
            this._dragTargetLayer = targetLayer;
            this._fullRedrawNeeded = true;
            this.requestRender();
            return;
        }

        if (Math.abs(x - this._dragStartX) > this._dragThreshold || Math.abs(y - this._dragStartY) > this._dragThreshold) {
            this._hasMoved = true;
            if (this._pendingPlace) this._pendingPlace = false;
        }

        if (this._isPanning) {
            // 右键拖动标记: 拖动过则 contextmenu 事件不再弹出菜单
            if (this._panButton === 2 && this._hasMoved) this._rightDragMoved = true;
            var dx = x - this._dragStartX;
            var dy = y - this._dragStartY;
            this.scrollX = Math.max(0, this.scrollX - dx);
            this.scrollY = Math.max(0, this.scrollY - dy);
            this._dragStartX = x;
            this._dragStartY = y;
            this._fullRedrawNeeded = true;
            this.requestRender();
            return;
        }

        if (this._mouseButton === 0) {
            if (this.currentTool === 'eraser') {
                this._eraseAt(x, y);
            } else if (this.currentTool === 'brush') {
                var brushTick = this._screenToTickNearest(x);
                var brushLayer = this._screenToLayer(y);
                var brushKey = this.getSelectedKey();
                // 未通过钢琴键盘选音调时回退为当前层 (与 mousedown / 触控画笔逻辑一致,
                // 否则未选音调时按住拖动一笔也画不出来)
                if (brushKey === null || brushKey === undefined || brushKey < 0) brushKey = brushLayer;
                if (x >= this._currentPanelWidth && y >= this._cfg.timelineHeight && brushTick >= 0 && brushLayer >= 0 && brushLayer < this.trackCount) {
                    // 同格去重 (与触控 _paintStroke 一致, 避免同格重复放置)
                    if (this._lastPaintTick === brushTick && this._lastPaintLayer === brushLayer) return;
                    this._lastPaintTick = brushTick;
                    this._lastPaintLayer = brushLayer;
                    // 拖动绘制: undo 已在 mousedown 时记录一次, 这里只放置+持久化 (统一入口, 支持延音模式)
                    this._placeBrushNote(brushTick, brushLayer, brushKey, false);
                }
            } else if (this.currentTool === 'select' && this._isSelecting && this._selectionRect) {
                // 选择框: 锚点固定为网格坐标, 当前角跟随鼠标 (网格坐标)
                this._selectionRect = {
                    tick1: this._selectStartTick, layer1: this._selectStartLayer,
                    tick2: this._screenToTick(x), layer2: this._screenToLayer(y),
                    sx1: this._selectionRect.sx1, sy1: this._selectionRect.sy1,
                    sx2: x, sy2: y
                };
                // 选择工具: 框选默认增量添加 (相当于一直按住 Ctrl)
                this._updateEdgeAutoScroll(x, y, true);
                this._fullRedrawNeeded = true;
                this.requestRender();
            } else if (this._isSelecting) {
                this._selectionRect = {
                    tick1: this._selectStartTick, layer1: this._selectStartLayer,
                    tick2: this._screenToTick(x), layer2: this._screenToLayer(y),
                    sx1: this._selectionRect ? this._selectionRect.sx1 : this._dragStartX, sy1: this._selectionRect ? this._selectionRect.sy1 : this._dragStartY,
                    sx2: x, sy2: y
                };
                if (this._hasMoved) {
                    this._selectByRect(this._selectionRect.tick1, this._selectionRect.layer1, this._selectionRect.tick2, this._selectionRect.layer2, e.shiftKey || e.ctrlKey || e.metaKey);
                }
                this._updateEdgeAutoScroll(x, y, e.shiftKey || e.ctrlKey || e.metaKey);
                this._fullRedrawNeeded = true;
                this.requestRender();
            } else if (this._hasMoved && Object.keys(this.selectedNotes).length > 0) {
                this._isDraggingNote = true;
                this._updateDragPreview(x, y);
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
            }
        }
    };

    PianoRoll.prototype._onMouseUp = function(e) {
        if (!this._mouseDown) return;
        this._mouseDown = false;
        // 音轨信息栏按钮按下状态复位 (点击动画结束)
        if (this._trackPanelPressed) {
            this._trackPanelPressed = null;
            this._fullRedrawNeeded = true;
            this.render();
        }
        // 若本次不是音符拖动, 清理拖动预览状态
        if (!this._isDraggingNote) this._dragPreview = null;
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        // 播放头拖拽结束
        if (this._isDraggingPlayhead) {
            this._isDraggingPlayhead = false;
            return;
        }

        // 时间轴标尺拖拽结束 (未滑动的轻点 → 跳转到点击位置)
        if (this._isTimelineDrag) {
            this._isTimelineDrag = false;
            if (!this._timelineDragMoved) {
                var rupTick = this._screenToTickNearest(this._timelineDragStartX);
                if (rupTick >= 0) {
                    this.seekToTick(rupTick);
                    if (this.onTimelineSeek) this.onTimelineSeek(rupTick);
                }
            }
            return;
        }

        // 顶部进度条拖拽结束
        if (this._isDraggingProgressBar) {
            this._isDraggingProgressBar = false;
            return;
        }

        // 选择工具框选结束
        if (this.currentTool === 'select' && this._isSelecting && this._selectionRect) {
            this._stopEdgeAutoScroll();
            // 选择工具: 框选默认增量添加 (相当于一直按住 Ctrl)
            this._selectByRect(this._selectionRect.tick1, this._selectionRect.layer1, this._selectionRect.tick2, this._selectionRect.layer2, true);
            this._isSelecting = false;
            this._selectionRect = null;
            this._selectStartTick = 0;
            this._selectStartLayer = 0;
            this.render();
            return;
        }

        // 轨道拖拽排序结束
        if (this._isDraggingTrack) {
            this._isDraggingTrack = false;
            if (this._draggedTrackLayer >= 0 && this._dragTargetLayer >= 0 &&
                this._draggedTrackLayer !== this._dragTargetLayer) {
                if (this.onReorderTrack) {
                    this.onReorderTrack(this._draggedTrackLayer, this._dragTargetLayer);
                } else if (this.onMoveTrack) {
                    var from = this._draggedTrackLayer;
                    var to = this._dragTargetLayer;
                    var dir = (to > from) ? 1 : -1;
                    var steps = Math.abs(to - from);
                    for (var s = 0; s < steps; s++) {
                        this.onMoveTrack(from + s * dir, dir);
                    }
                }
            }
            this._draggedTrackLayer = -1;
            this._dragTargetLayer = -1;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._isSelecting) {
            this._stopEdgeAutoScroll();
            this._isSelecting = false;
            var hadRect = this._selectionRect && (this._selectionRect.tick1 !== this._selectionRect.tick2 || this._selectionRect.layer1 !== this._selectionRect.layer2);
            this._selectionRect = null;
            if (hadRect) {
                this._fullRedrawNeeded = true;
                this.render();
            }
        } else if (this._isDraggingNote && Object.keys(this.selectedNotes).length > 0) {
            this._stopEdgeAutoScroll();
            this._finalizeDragMove();
            this._isDraggingNote = false;
            this._fullRedrawNeeded = true;
            this.render();
        }

        // 桌面端：左键单击空白处放置音符
        if (this._mouseButton === 0 && this._pendingPlace && !this._hasMoved) {
            this._pendingPlace = false;
            this._placeNoteAt(x, y);
        }

        if (this._isPanning) {
            // 松手时若右键发生过拖动, 标记本次右键为"平移"而非"打开菜单"
            if (this._panButton === 2 && this._hasMoved) this._rightDragMoved = true;
            this._isPanning = false;
            this._panButton = -1;
            this.canvas.style.cursor = 'crosshair';
        }
    };

    PianoRoll.prototype._onWheel = function(e) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            var delta = -e.deltaY * 0.0025;
            this.setZoom(this.zoom * (1 + delta));
        } else if (e.shiftKey) {
            this.scrollX = Math.max(0, this.scrollX + e.deltaY);
        } else {
            this.scrollX = Math.max(0, this.scrollX + e.deltaX);
            this.scrollY = Math.max(0, this.scrollY + e.deltaY);
        }
        // 滚动时选择框自动跟随网格 (存储的是网格坐标, _drawSelectionRect 会根据 scrollX/Y 自动转换)
        // 不需要重新计算, 否则屏幕坐标->网格坐标转换会因 scroll 变化而产生偏移
        this._fullRedrawNeeded = true;
        this.requestRender();
    };

    // ============ 触摸事件 ============
    // 状态:
    //   'none' / 'tap' / 'longpress-anim' / 'select'(拖拽音符) / 'drag-select'(选区) / 'pan'(平移) / 'zoom'
    // 行为:
    //   - 按下音符, 600ms内未移动 → 放大动画, 保持最后一帧
    //   - 长按动画已播放, 松开 → 弹出右键菜单, 并淡出
    //   - 长按动画已播放, 中途移动 > 10px → 取消动画, 转为拖拽/选区/平移
    //   - 按下音符, 600ms内移动 > 10px → 取消长按, 转为拖拽音符
    //   - 按下空白, 600ms内移动 > 10px → 取消长按, 单指平移
    //   - 按下空白, 600ms未移动 → 进入选区模式 (保持, 手指移动即扩展选区)
    //   - 按下空白, 未移动且未长按, 快速松开 → 放置音符

    // 触控画笔/橡皮: 在指定屏幕坐标放置/删除音符 (手指滑过即连续绘制, 与桌面端按住绘画一致)
    // isStart=true 时首次按下, 走 onNoteAdded 标准流程记录一次 undo (与桌面 mousedown 行为一致)
    PianoRoll.prototype._paintStroke = function(x, y, isStart) {
        // 触控画笔/橡皮只应在编辑区内生效 (排除左侧音轨面板/时间轴区域)
        if (x < this._currentPanelWidth || y < this._cfg.timelineHeight) return;
        if (this.currentTool === 'eraser') {
            // 橡皮: 统一清除入口 (区域清除/连续清除)
            if (isStart && this.onNoteDragStart) this.onNoteDragStart();
            this._eraseAt(x, y);
            return;
        }
        var brushTick = this._screenToTickNearest(x);
        var brushLayer = this._screenToLayer(y);
        var brushKey = this.getSelectedKey();
        // 未通过钢琴键盘选音调时回退为当前层 (与默认工具触控放置一致, 避免画笔按下无任何反应)
        if (brushKey === null || brushKey === undefined || brushKey < 0) brushKey = brushLayer;
        if (brushTick < 0 || brushLayer < 0 || brushLayer >= this.trackCount) return;
        // 停留在同一格时不重复放置 (touchmove 同一格会停留多帧)
        if (!isStart && this._lastPaintTick === brushTick && this._lastPaintLayer === brushLayer) return;
        this._lastPaintTick = brushTick;
        this._lastPaintLayer = brushLayer;
        // 统一放置入口: 普通放置 / 延音放置 (isStart 走 onNoteAdded / onNoteGroupAdded 记录一次 undo)
        this._placeBrushNote(brushTick, brushLayer, brushKey, isStart);
    };

    PianoRoll.prototype._onTouchStart = function(e) {
        // 全局标记: 刚关闭弹窗, 这次 touchstart 不应触发任何交互
        // 但进度条/时间轴拖动不受此限制 (不是"放置音符"操作)
        var isProgressBarArea = false;
        if (e.touches && e.touches.length === 1) {
            var rect0 = this.canvas.getBoundingClientRect();
            var ty0 = e.touches[0].clientY - rect0.top;
            var tx0 = e.touches[0].clientX - rect0.left;
            if (ty0 < this._cfg.progressBarHeight || (ty0 < this._cfg.timelineHeight && tx0 >= this._currentPanelWidth)) {
                isProgressBarArea = true;
            }
        }
        if (this._suppressNextClick && !isProgressBarArea) {
            this._suppressNextClick = false;
            return;
        }
        e.preventDefault();

        if (e.touches.length === 2) {
            this._cancelLongPress();
            this._fadeOutAnimation();
            this._touchMode = 'zoom';
            this._touchMoved = false;
            var t1 = e.touches[0], t2 = e.touches[1];
            var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
            this._pinchDist = Math.sqrt(dx * dx + dy * dy);
            var rect = this.canvas.getBoundingClientRect();
            this._pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
            this._pinchMidY = (t1.clientY + t2.clientY) / 2 - rect.top;
            this._lastTouchX = this._pinchMidX;
            this._lastTouchY = this._pinchMidY;
            return;
        }

        if (e.touches.length === 1) {
            var touch = e.touches[0];
            var rect = this.canvas.getBoundingClientRect();
            var x = touch.clientX - rect.left;
            var y = touch.clientY - rect.top;
            // 同步 _lastMouseX/Y, 使粘贴功能可以使用最后触摸位置
            this._lastMouseX = x;
            this._lastMouseY = y;
            var pw = this._currentPanelWidth;

            // 顶部滑动条: 左右翻页 (拖动滚动视图, 不跳播放头)
            if (y < this._cfg.progressBarHeight) {
                this._isDraggingProgressBar = true;
                this._touchMode = 'progress-drag';
                this._touchStartX = x;
                this._touchStartY = y;
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._scrollFromSliderX(x);
                return;
            }

            // 时间轴标尺: 拖动滑条形式 (按下不跳转, 拖动时保持按下点与播放头的相对偏移, 轻点才跳转)
            if (y < this._cfg.timelineHeight && x >= pw) {
                this._isTimelineDrag = true;
                this._touchMode = 'timeline-drag';
                this._touchStartX = x;
                this._touchStartY = y;
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._timelineDragStartX = x;
                this._timelineDragMoved = false;
                var tphTick = (this._smoothedPlayheadTick !== undefined && this._smoothedPlayheadTick !== null)
                    ? this._smoothedPlayheadTick : this.playheadTick;
                var tphX = this._tickToScreen(tphTick);
                // 记录手指与播放头的相对偏移, 拖动时保持该偏移, 避免一开始就跳转到手指位置
                this._timelineDragOffsetX = tphX - x;
                return;
            }

            // 播放头拖拽: 触摸编辑区内播放头红线附近 (移动端增大触控宽度到16px)
            if (y >= this._cfg.timelineHeight && x >= pw) {
                var tphTick = (this._smoothedPlayheadTick !== undefined && this._smoothedPlayheadTick !== null)
                    ? this._smoothedPlayheadTick : this.playheadTick;
                var tphX = this._tickToScreen(tphTick);
                if (Math.abs(x - tphX) <= 16) {
                    this._isDraggingPlayhead = true;
                    this._touchMode = 'playhead-drag';
                    this._touchStartX = x;
                    this._touchStartY = y;
                    this._lastTouchX = x;
                    this._lastTouchY = y;
                    var pdragTick = this._screenToTickNearest(x);
                this.playheadTick = pdragTick;
                this._smoothedPlayheadTick = pdragTick;
                this.seekToTick(pdragTick);
                    return;
                }
            }

            // 检查是否点击了左侧音轨信息区的按钮
            if (x < pw && y >= this._cfg.timelineHeight) {
                var hitResult = this._hitTestTrackPanel(x, y);
                if (hitResult) {
                    // 拖动手柄: 长按后进入拖拽模式
                    if (hitResult.type === 'drag') {
                        this._touchMode = 'track-drag-pending';
                        this._touchStartX = x;
                        this._touchStartY = y;
                        this._lastTouchX = x;
                        this._lastTouchY = y;
                        this._draggedTrackLayer = hitResult.layer;
                        this._dragTargetLayer = hitResult.layer;
                        this._trackDragStartY = y;
                        // 长按 250ms 后进入拖拽模式
                        var dragSelf = this;
                        this._trackDragTimer = setTimeout(function() {
                            dragSelf._touchMode = 'track-drag';
                            dragSelf._isDraggingTrack = true;
                            dragSelf.render();
                        }, 250);
                        return;
                    }
                    // 记录点击的按钮, 等待 touchend 时触发, 避免误触
                    this._pendingTrackButton = hitResult;
                    this._pendingTrackClientX = touch.clientX;
                    this._pendingTrackClientY = touch.clientY;
                    this._touchStartX = x;
                    this._touchStartY = y;
                    this._touchMode = 'track-btn';
                    return;
                }
            }

            // 选轨模式: 点击选择音轨行 (演奏模式 / 歌曲压缩的通用选轨)
            if (this.currentTool === 'performance' || this._trackSelectMode) {
                var perfLayer = this._screenToLayer(y);
                if (perfLayer >= 0 && perfLayer < this.trackCount) {
                    var selList = this._trackSelectMode ? this.compressionSelectedLayers : this.performanceSelectedLayers;
                    var idx = selList.indexOf(perfLayer);
                    if (idx >= 0) {
                        selList.splice(idx, 1);
                    } else {
                        selList.push(perfLayer);
                    }
                    this._highlightLayer = selList.length > 0 ? selList[selList.length - 1] : -1;
                    this.render();
                    if (this._trackSelectMode) {
                        if (this.onTrackSelectChanged) this.onTrackSelectChanged(selList.slice());
                    } else if (this.onPerformanceLayersChanged) {
                        this.onPerformanceLayersChanged(this.performanceSelectedLayers);
                    }
                }
                return;
            }

            // 触控画笔/橡皮: 手指按下滑过即放置/删除 (与桌面端按住绘画一致),
            // 不进入长按/平移/画布 pan —— "滑动即绘制"。仅编辑区内生效。
            if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && x >= pw && y >= this._cfg.timelineHeight) {
                this._touchStartX = x;
                this._touchStartY = y;
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._touchMoved = false;
                this._dragStartX = x;
                this._dragStartY = y;
                this._lastPaintTick = -1;
                this._lastPaintLayer = -1;
                this._touchMode = 'paint';
                // 按下即画/擦 (首次按下走标准流程, 记录一次 undo)
                this._paintStroke(x, y, true);
                return;
            }

            this._touchStartTime = Date.now();
            this._touchStartX = x;
            this._touchStartY = y;
            this._lastTouchX = x;
            this._lastTouchY = y;
            this._touchMoved = false;
            this._dragStartX = x;
            this._dragStartY = y;
            this._longPressFired = false;
            this._isDraggingNote = false;
            this._pendingTrackButton = null;

            var clickedNote = this._getNoteAt(x, y);
            this._touchedNote = clickedNote || null;

            if (clickedNote) {
                if (this.currentTool === 'select') {
                    // 触控选择工具: 点击音符 = 多选/取消 (等效一直按住 Ctrl), 不清除已有选区
                    this._toggleSelection(clickedNote);
                    // 仅当该音符仍处于选中状态时才允许拖动 (刚被取消选中的音符不拖动)
                    if (this.selectedNotes[clickedNote.id]) this._beginDragPreview(x, y, clickedNote.id);
                } else {
                    // 如果点击的已是选中音符且有多选，保持选择不变
                    if (this.selectedNotes[clickedNote.id] && Object.keys(this.selectedNotes).length > 1) {
                        // 保持多选，不清除
                    } else {
                        this._selectNote(clickedNote, false);
                    }
                    // 触摸按下音符时记录拖动预览锚点 (移动时音符跟随手指, 不跳格)
                    this._beginDragPreview(x, y, clickedNote.id);
                }
            } else if (this.currentTool === 'select') {
                // 触控选择工具: 空白处按下立即开始框选 (等同桌面端选择工具,
                // additive 不清除已有选区), 选框直接跟手, 无需先长按
                this._isSelecting = true;
                this._selectStartTick = this._screenToTick(x);
                this._selectStartLayer = this._screenToLayer(y);
                this._selectionRect = {
                    tick1: this._selectStartTick, layer1: this._selectStartLayer,
                    tick2: this._selectStartTick, layer2: this._selectStartLayer,
                    sx1: x, sy1: y, sx2: x, sy2: y
                };
            } else {
                // 移动端: 点击空白处不清除选区, 只能通过取消选择按钮清除
            }

            // 选择工具下按在空白处 → 直接进入框选模式 (drag-select); 其余仍是 tap
            this._touchMode = (this.currentTool === 'select' && !clickedNote) ? 'drag-select' : 'tap';
            // 框选模式不需要长按菜单, 不启动长按定时器, 避免 600ms 后误触发长按动画打断框选
            if (this._touchMode !== 'drag-select') this._startLongPressTimer(clickedNote);
        }
    };

    PianoRoll.prototype._onTouchMove = function(e) {
        e.preventDefault();

        if (e.touches.length === 2 && this._touchMode === 'zoom') {
            var t1 = e.touches[0], t2 = e.touches[1];
            var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var rect = this.canvas.getBoundingClientRect();
            var cx = (t1.clientX + t2.clientX) / 2 - rect.left;
            var cy = (t1.clientY + t2.clientY) / 2 - rect.top;
            if (this._pinchDist > 0 && Math.abs(dist - this._pinchDist) > 5) {
                // 以双指中心为锚点缩放，保持该点对应的内容位置不变
                this.setZoom(this.zoom * (dist / this._pinchDist), cx, cy);
                this._pinchDist = dist;
            }
            var panX = this._lastTouchX - cx, panY = this._lastTouchY - cy;
            if (Math.abs(panX) > 1 || Math.abs(panY) > 1) {
                this._touchMoved = true;
                this.scrollX = Math.max(0, this.scrollX + panX);
                this.scrollY = Math.max(0, this.scrollY + panY);
            }
            this._lastTouchX = cx;
            this._lastTouchY = cy;
            this._fullRedrawNeeded = true;
            this.requestRender();
            return;
        }

        if (e.touches.length === 1) {
            var touch = e.touches[0];
            var rect = this.canvas.getBoundingClientRect();
            var x = touch.clientX - rect.left;
            var y = touch.clientY - rect.top;
            var dx = Math.abs(x - this._touchStartX);
            var dy = Math.abs(y - this._touchStartY);

            if (this._touchMode === 'playhead-drag' && this._isDraggingPlayhead) {
                var tdragTick = this._screenToTick(x);
                this.playheadTick = tdragTick;
                this._smoothedPlayheadTick = tdragTick;
                this.seekToTick(tdragTick);
                this._lastTouchX = x;
                this._lastTouchY = y;
                return;
            }

            // 时间轴标尺拖拽 (拖动滑条: 保持按下时的相对偏移, 不跳转到手指位置)
            if (this._touchMode === 'timeline-drag' && this._isTimelineDrag) {
                if (Math.abs(x - this._timelineDragStartX) > 10 || Math.abs(y - this._touchStartY) > 10) {
                    this._timelineDragMoved = true;
                }
                var tdragTick = this._screenToTick(x + this._timelineDragOffsetX);
                this.seekToTick(tdragTick);
                if (this.onTimelineSeek) this.onTimelineSeek(tdragTick);
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
                return;
            }

            // 顶部滑动条拖拽 (左右翻页滚动视图)
            if (this._touchMode === 'progress-drag' && this._isDraggingProgressBar) {
                this._scrollFromSliderX(x);
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
                return;
            }

            // 轨道拖拽排序 - 等待长按
            if (this._touchMode === 'track-drag-pending') {
                // 移动超过阈值则取消长按, 转为平移
                if (dy > 10 || dx > 10) {
                    if (this._trackDragTimer) {
                        clearTimeout(this._trackDragTimer);
                        this._trackDragTimer = null;
                    }
                    this._touchMode = 'pan';
                    this._draggedTrackLayer = -1;
                }
                return;
            }

            if (this._touchMode === 'track-drag' && this._isDraggingTrack) {
                var cellH = this._cfg.cellH * this.zoom;
                var targetLayer = Math.floor((y - this._cfg.timelineHeight + this.scrollY) / cellH);
                if (targetLayer < 0) targetLayer = 0;
                if (targetLayer >= this.trackCount) targetLayer = this.trackCount - 1;
                this._dragTargetLayer = targetLayer;
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
                return;
            }

            // 音轨按钮点击中途移动判定
            if (this._touchMode === 'track-btn') {
                if (dx > 8 || dy > 8) {
                    this._pendingTrackButton = null;
                    this._touchMode = 'pan';
                } else {
                    return;
                }
            }

            // 触控画笔/橡皮: 滑过即连续放置/删除 (不做移动阈值判定, 保持"滑动即绘制")
            if (this._touchMode === 'paint') {
                this._paintStroke(x, y, false);
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
                return;
            }

            if (!this._touchMoved && (dx > 10 || dy > 10)) {
                this._touchMoved = true;
            }

            // 已在长按动画态, 且用户开始移动 → 隐藏动画, 进入选择框/拖拽模式
            if (this._touchMode === 'longpress-anim' && this._touchMoved) {
                this._fadeOutAnimation();
                this._cancelLongPress();
                if (this._touchedNote) {
                    // 长按音符后移动 → 拖拽音符
                    this._snapDragPositions();
                    this._touchMode = 'select';
                    this._isDraggingNote = true;
                } else {
                    // 长按空白后移动 → 选区模式 (additive=true, 不清除已选)
                    this._touchMode = 'drag-select';
                    this._isSelecting = true;
                    this._selectStartTick = this._screenToTick(this._dragStartX);
                    this._selectStartLayer = this._screenToLayer(this._dragStartY);
                    this._selectionRect = {
                        tick1: this._selectStartTick, layer1: this._selectStartLayer,
                        tick2: this._screenToTick(x), layer2: this._screenToLayer(y),
                        sx1: this._dragStartX, sy1: this._dragStartY,
                        sx2: x, sy2: y
                    };
                }
            }

            // 未达到长按触发, 已移动: 取消长按, 进入拖拽/平移
            if (this._touchMoved && !this._longPressFired && this._touchMode === 'tap') {
                this._cancelLongPress();
                if (this._touchedNote) {
                    this._snapDragPositions();
                    this._touchMode = 'select';
                    this._isDraggingNote = true;
                } else {
                    this._touchMode = 'pan';
                }
            }

            if (this._touchMode === 'select' && this._isDraggingNote) {
                // 音符跟随手指实时预览, 并吸附到最近格 (显示目标格描边)
                this._updateDragPreview(x, y);
                this._lastTouchX = x;
                this._lastTouchY = y;
                this._fullRedrawNeeded = true;
                this.requestRender();
            } else if (this._touchMode === 'pan') {
                var pDx = this._lastTouchX - x;
                var pDy = this._lastTouchY - y;
                if (Math.abs(pDx) > 0 || Math.abs(pDy) > 0) {
                    this.scrollX = Math.max(0, this.scrollX + pDx);
                    this.scrollY = Math.max(0, this.scrollY + pDy);
                    this._lastTouchX = x;
                    this._lastTouchY = y;
                    this._fullRedrawNeeded = true;
                    this.requestRender();
                }
            } else if (this._touchMode === 'drag-select') {
                this._selectionRect = {
                    tick1: this._selectStartTick, layer1: this._selectStartLayer,
                    tick2: this._screenToTick(x), layer2: this._screenToLayer(y),
                    sx1: this._selectionRect.sx1, sy1: this._selectionRect.sy1,
                    sx2: x, sy2: y
                };
                this._selectByRect(this._selectionRect.tick1, this._selectionRect.layer1, this._selectionRect.tick2, this._selectionRect.layer2, true);
                this._updateEdgeAutoScroll(x, y, true);
                this._fullRedrawNeeded = true;
                this.requestRender();
            }
        }
    };

    PianoRoll.prototype._onTouchEnd = function(e) {
        // 若本次不是音符拖动, 清理拖动预览状态
        if (this._touchMode !== 'select' || !this._isDraggingNote) this._dragPreview = null;

        if (this._touchMode === 'playhead-drag') {
            this._isDraggingPlayhead = false;
            this._touchMode = 'none';
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        // 时间轴标尺拖拽结束 (未滑动的轻点 → 跳转到点击位置)
        if (this._touchMode === 'timeline-drag') {
            this._isTimelineDrag = false;
            this._touchMode = 'none';
            if (!this._timelineDragMoved) {
                var tuptick = this._screenToTickNearest(this._timelineDragStartX);
                if (tuptick >= 0) {
                    this.seekToTick(tuptick);
                    if (this.onTimelineSeek) this.onTimelineSeek(tuptick);
                }
            }
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        // 顶部进度条拖拽结束
        if (this._touchMode === 'progress-drag') {
            this._isDraggingProgressBar = false;
            this._touchMode = 'none';
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._touchMode === 'track-drag-pending') {
            if (this._trackDragTimer) {
                clearTimeout(this._trackDragTimer);
                this._trackDragTimer = null;
            }
            this._touchMode = 'none';
            this._draggedTrackLayer = -1;
            this._dragTargetLayer = -1;
            return;
        }

        if (this._touchMode === 'track-drag' && this._isDraggingTrack) {
            this._isDraggingTrack = false;
            this._touchMode = 'none';
            if (this._draggedTrackLayer >= 0 && this._dragTargetLayer >= 0 &&
                this._draggedTrackLayer !== this._dragTargetLayer) {
                if (this.onReorderTrack) {
                    this.onReorderTrack(this._draggedTrackLayer, this._dragTargetLayer);
                } else if (this.onMoveTrack) {
                    var from = this._draggedTrackLayer;
                    var to = this._dragTargetLayer;
                    var dir = (to > from) ? 1 : -1;
                    var steps = Math.abs(to - from);
                    for (var s = 0; s < steps; s++) {
                        this.onMoveTrack(from + s * dir, dir);
                    }
                }
            }
            this._draggedTrackLayer = -1;
            this._dragTargetLayer = -1;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._touchMode === 'track-btn') {
            var btn = this._pendingTrackButton;
            this._pendingTrackButton = null;
            this._touchMode = 'none';
            if (btn) {
                var synthE = {
                    clientX: this._pendingTrackClientX || 0,
                    clientY: this._pendingTrackClientY || 0
                };
                this._handleTrackPanelHit(btn, synthE);
            }
            return;
        }

        if (this._touchMode === 'zoom') {
            this._touchMode = 'none';
            this._pinchDist = 0;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        // 触控画笔/橡皮: 手指抬起结束绘制
        if (this._touchMode === 'paint') {
            this._touchMode = 'none';
            this._lastPaintTick = -1;
            this._lastPaintLayer = -1;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._touchMode === 'select' && this._isDraggingNote) {
            if (Object.keys(this.selectedNotes).length > 0) {
                this._finalizeDragMove();
            }
            this._touchMode = 'none';
            this._isDraggingNote = false;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._touchMode === 'pan') {
            this._touchMode = 'none';
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        if (this._touchMode === 'drag-select') {
            this._stopEdgeAutoScroll();
            if (this._selectionRect) {
                this._selectByRect(
                    this._selectionRect.tick1, this._selectionRect.layer1,
                    this._selectionRect.tick2, this._selectionRect.layer2, true
                );
            }
            this._touchMode = 'none';
            this._isSelecting = false;
            this._selectionRect = null;
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }

        // 长按动画模式: 按住期间没有移动就松开 → 弹出菜单
        if (this._touchMode === 'longpress-anim') {
            this._cancelLongPress();
            var hasSelectionAtEnd = Object.keys(this.selectedNotes).length > 0;
            if (this._longPressIsOnNote || hasSelectionAtEnd) {
                // 长按音符 或 有已选音符 → 淡出动画 + 弹出音符右键菜单
                this._showContextMenu();
                this._fadeOutAnimation();
            } else {
                // 长按空白且无已选音符 → 淡出动画 + 弹出普通右键菜单
                this._fadeOutAnimation();
                if (this.onContextMenu) {
                    this.onContextMenu(this._touchStartX, this._touchStartY, [], true);
                }
            }
            this._touchMode = 'none';
            return;
        }

        this._cancelLongPress();
        this._touchMode = 'none';

        if (!this._touchMoved && !this._longPressFired) {
            if (this.currentTool === 'performance') {
                // 演奏模式不在 touchend 放置音符, 已在 touchstart 处理选择
            } else if (this._touchedNote) {
                if (this.currentTool === 'select') {
                    // 选择工具: 选择状态已在 touchstart 通过 _toggleSelection 处理 (多选/取消),
                    // 这里不再调用 _selectNote(false), 否则会把已选的多音符清空成只剩这一个
                } else {
                    this._selectNote(this._touchedNote, false);
                }
                this._touchedNote = null;
                this._fullRedrawNeeded = true;
                this.render();
            } else {
                var tick2 = this._screenToTick(this._touchStartX);
                var layer2 = this._screenToLayer(this._touchStartY);
                if (tick2 >= 0 && layer2 >= 0 && layer2 < this.trackCount && this.onNoteAdded) {
                    var useKey = this._selectedKey !== undefined && this._selectedKey >= 0
                        ? this._selectedKey : layer2;
                    this.onNoteAdded({
                        tick: tick2, layer: layer2,
                        instrument: this.currentInstrument,
                        key: useKey, velocity: 100, pan: 50, pitch: 0
                    });
                    // addNote 已调用 render(), 无需重复
                }
            }
        }

        this._touchedNote = null;
    };

    // 左侧音轨信息区点击命中检测 (名称 / 全选 / 拖动 / 更多 / 添加音轨)
    // 桌面端: M / S / ✕ / 音量 直接在面板上显示
    PianoRoll.prototype._hitTestTrackPanel = function(x, y) {
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        if (pw <= 0) return null;
        var cellH = cfg.cellH * this.zoom;
        var layerStart = Math.floor(this.scrollY / cellH);
        var layerEnd = Math.ceil((this.scrollY + this.displayHeight - cfg.timelineHeight) / cellH);
        var layout = this._getTrackButtonLayout(cellH);
        var btnSize = layout.btnSize;

        for (var layer = Math.max(0, layerStart); layer <= Math.min(this.trackCount - 1, layerEnd); layer++) {
            var noteY = layer * cellH - this.scrollY + cfg.timelineHeight;
            if (y >= noteY && y < noteY + cellH) {
                var btnCenterY = noteY + cellH / 2;
                var btnY1 = btnCenterY - btnSize / 2;
                var btnY2 = btnCenterY + btnSize / 2;
                if (y >= btnY1 && y <= btnY2) {
                    if (layout.isDesktop) {
                        // 桌面端: 从右到左检测 delete → solo → mute
                        if (x >= layout.deleteX && x <= layout.deleteX + layout.deleteW) {
                            return { layer: layer, type: 'delete' };
                        }
                        if (x >= layout.selX && x <= layout.selX + layout.selW) {
                            return { layer: layer, type: 'selectall' };
                        }
                        if (x >= layout.soloX && x <= layout.soloX + layout.soloW) {
                            return { layer: layer, type: 'solo' };
                        }
                        if (x >= layout.muteX && x <= layout.muteX + layout.muteW) {
                            return { layer: layer, type: 'mute' };
                        }
                        // 音量区域
                        if (x >= layout.volStart && x <= layout.volEnd) {
                            return { layer: layer, type: 'volume' };
                        }
                        // 拖动手柄
                        if (x >= layout.dragX && x <= layout.dragX + layout.dragW) {
                            return { layer: layer, type: 'drag' };
                        }
                    } else {
                        // 移动端: 更多按钮 (⋮)
                        if (x >= layout.moreX && x <= layout.moreX + layout.moreW) {
                            return { layer: layer, type: 'more' };
                        }
                        // 拖动手柄 (长按拖动调整顺序)
                        if (x >= layout.dragX && x <= layout.dragX + layout.dragW) {
                            return { layer: layer, type: 'drag' };
                        }
                        // 全选按钮 (拥挤时隐藏)
                        if (layout.selX >= 0 && x >= layout.selX && x <= layout.selX + layout.selW) {
                            return { layer: layer, type: 'selectall' };
                        }
                    }
                }
                // 名称区域
                if (x >= layout.nameStart && x <= layout.nameEnd) {
                    return { layer: layer, type: 'name' };
                }
                return null;
            }
        }

        // 添加音轨按钮
        if (this._addTrackBtnRect) {
            var r = this._addTrackBtnRect;
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                return { layer: -1, type: 'addtrack' };
            }
        }
        return null;
    };

    // 轨道右键菜单
    PianoRoll.prototype._handleTrackContextMenu = function(e, layer) {
        e.preventDefault();
        var self = this;

        // Create a context menu
        var menu = document.createElement('div');
        menu.className = 'track-context-menu';
        menu.style.cssText = 'position:fixed;z-index:10000;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';

        var trackInfo = this.getTrackInfo(layer);

        // 重命名轨道
        var renameItem = document.createElement('div');
        renameItem.className = 'track-menu-item';
        renameItem.innerHTML = '<i class="fa-solid fa-pen-to-square"></i><span>' + translate('重命名轨道') + '</span>';
        renameItem.addEventListener('click', function() {
            menu.remove();
            var layout = self._getTrackButtonLayout(self._cfg.cellH * self.zoom);
            var nameY = self._layerToScreen(layer);
            self._showTrackNameEditor(layer, layout.nameStart, nameY, layout.nameEnd - layout.nameStart);
        });
        menu.appendChild(renameItem);

        var divider0 = document.createElement('div');
        divider0.className = 'track-menu-divider';
        menu.appendChild(divider0);

        // 移动轨道 - 上移
        var moveUp = document.createElement('div');
        moveUp.className = 'track-menu-item';
        var translate = window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate : function(text) { return text; };
        moveUp.innerHTML = '<i class="fa-solid fa-arrow-up"></i><span>' + translate('上移轨道') + '</span>';
        moveUp.addEventListener('click', function() { menu.remove(); if (self.onMoveTrack) self.onMoveTrack(layer, -1); });
        menu.appendChild(moveUp);

        // 移动轨道 - 下移
        var moveDown = document.createElement('div');
        moveDown.className = 'track-menu-item';
        moveDown.innerHTML = '<i class="fa-solid fa-arrow-down"></i><span>' + translate('下移轨道') + '</span>';
        moveDown.addEventListener('click', function() { menu.remove(); if (self.onMoveTrack) self.onMoveTrack(layer, 1); });
        menu.appendChild(moveDown);

        var divider = document.createElement('div');
        divider.className = 'track-menu-divider';
        menu.appendChild(divider);

        // 删除轨道
        var deleteTrack = document.createElement('div');
        deleteTrack.className = 'track-menu-item track-menu-danger';
        deleteTrack.innerHTML = '<i class="fa-solid fa-trash"></i><span>' + translate('删除轨道') + '</span>';
        deleteTrack.addEventListener('click', function() { menu.remove(); if (self.onDeleteTrack) self.onDeleteTrack(layer); });
        menu.appendChild(deleteTrack);

        var divider2 = document.createElement('div');
        divider2.className = 'track-menu-divider';
        menu.appendChild(divider2);

        // 音量滑块
        var volItem = document.createElement('div');
        volItem.className = 'track-menu-item';
        volItem.style.cssText = 'flex-direction:column;align-items:stretch;padding:8px 12px;';
        volItem.innerHTML = '<span style="font-size:12px;color:#888;">' + translate('音量:') + ' <span id="track-vol-label">' + (trackInfo ? trackInfo.volume : 100) + '</span></span>';
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = trackInfo ? trackInfo.volume : 100;
        slider.style.cssText = 'width:100%;margin-top:4px;';
        slider.addEventListener('input', function() {
            document.getElementById('track-vol-label').textContent = slider.value;
            if (self.onSetTrackVolume) self.onSetTrackVolume(layer, parseInt(slider.value));
        });
        slider.addEventListener('mousedown', function() {
            if (self.onVolumeChangeStart) self.onVolumeChangeStart(layer);
        });
        volItem.appendChild(slider);
        menu.appendChild(volItem);

        document.body.appendChild(menu);
        if (window.WebNBSPositionFlyout) {
            window.WebNBSPositionFlyout(menu, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
        }

        setTimeout(function() {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    };

    // 桌面端：在指定坐标放置音符
    PianoRoll.prototype._placeNoteAt = function(x, y) {
        var tick = this._screenToTick(x);
        var layer = this._screenToLayer(y);
        if (tick < 0 || layer < 0 || layer >= this.trackCount) return;
        var bcfg = this._getBrushConfig();
        if (bcfg && bcfg.mode === 'sustain') {
            // 延音放置: 默认工具点击同样触发 (内部按配置处理覆盖/缩小/跳过, 走 onNoteGroupAdded)
            this._placeBrushNote(tick, layer, this.getSelectedKey(), true);
            return;
        }
        var noteAt = this._getNoteAt(x, y);
        if (noteAt) return; // 已有音符则不再放置
        if (!this.onNoteAdded) return;
        var pianoKey = this.getSelectedKey();
        var useKey = (pianoKey !== null && pianoKey !== undefined && pianoKey >= 0)
            ? pianoKey : layer;
        this.onNoteAdded({
            tick: tick, layer: layer,
            instrument: this.currentInstrument,
            key: useKey, velocity: this._getPlaceVelocity(), pan: 50, pitch: 0
        });
        if (this.onNotePreview) {
            this.onNotePreview(this.currentInstrument, useKey);
        }
    };

    // ============ 创作辅助: 配置注入 ============
    PianoRoll.prototype.setAssistConfig = function(cfg) {
        this.assistConfig = cfg || null;
        this._hoverSustainCells = null;
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype._getBrushConfig = function() {
        return (this.assistConfig && this.assistConfig.brush) ? this.assistConfig.brush : null;
    };

    PianoRoll.prototype._getEraserConfig = function() {
        return (this.assistConfig && this.assistConfig.eraser) ? this.assistConfig.eraser : null;
    };

    // 普通放置的音符音量 (默认 100)
    PianoRoll.prototype._getPlaceVelocity = function() {
        var bcfg = this._getBrushConfig();
        if (!bcfg || !bcfg.normal) return 100;
        return clampInt(bcfg.normal.velocity, 1, 100, 100);
    };

    // 当前格是否有音符 (触控/鼠标放置时的障碍判定)
    PianoRoll.prototype._noteAtCell = function(tick, layer) {
        for (var i = 0; i < this.notes.length; i++) {
            if (this.notes[i].tick === tick && this.notes[i].layer === layer) return true;
        }
        return false;
    };

    // 统一放置入口: 根据配置走 普通放置 / 延音放置
    // isStart=true 表示一笔手势的首次调用 (走 onNoteAdded/onNoteGroupAdded 记录一次撤销)
    PianoRoll.prototype._placeBrushNote = function(tick, layer, key, isStart) {
        var bcfg = this._getBrushConfig();
        if (bcfg && bcfg.mode === 'sustain') {
            this._placeSustainAt(tick, layer, isStart);
            return;
        }
        var note = {
            tick: tick, layer: layer,
            instrument: this.currentInstrument,
            key: key,
            velocity: this._getPlaceVelocity(), pan: 50, pitch: 0
        };
        if (isStart) {
            if (this.onNoteAdded) {
                this.onNoteAdded(note);
            } else {
                this._removeNoteAtPos(tick, layer);
                this.addNote(note);
                if (this.onNotesChanged) this.onNotesChanged([]);
            }
        } else {
            this._removeNoteAtPos(tick, layer);
            this.addNote(note);
            if (this.onNotesChanged) this.onNotesChanged([]);
        }
    };

    // ============ 延音放置 (伪延音) ============
    PianoRoll.prototype._sustainVelocities = function(count, startVel, fade, minVel, easeType) {
        var vels = [startVel];
        var easeFns = {
            linear: function(p) { return p; },
            easeIn: function(p) { return p * p; },
            easeOut: function(p) { return 1 - (1 - p) * (1 - p); },
            quadIn: function(p) { return p * p * p; },
            quadOut: function(p) { return 1 - Math.pow(1 - p, 3); }
        };
        var ease = easeFns[easeType] || easeFns.linear;
        if (fade && count > 0) {
            for (var i = 1; i <= count; i++) {
                var p = i / count;
                var v = Math.round(startVel - (startVel - minVel) * ease(p));
                vels.push(clampInt(v, 1, 100, 100));
            }
        } else {
            for (var j = 1; j <= count; j++) vels.push(startVel);
        }
        return vels;
    };

    // 计算延音组布局: 返回 {startTick, layer, count, mode} 或 null (整组放弃)
    // count = 延音音符个数 (不含首音符)
    PianoRoll.prototype._sustainPlan = function(tick, layer) {
        var bcfg = this._getBrushConfig() || {};
        var st = bcfg.sustain || {};
        var N = clampInt(st.length, 0, 64, 5);
        var mode = (st.overlap === 'shrink' || st.overlap === 'skip') ? st.overlap : 'overwrite';
        var gap = clampInt(st.gap, 0, 64, 0);
        var count = N;
        // 禁止覆盖: 首音符格被占用 → 整组不放置
        if (mode === 'skip' && this._noteAtCell(tick, layer)) return null;
        // 缩小长度: 遇到障碍提前收尾 (组内最大 tick <= 障碍tick - 留空K - 1)
        if (mode === 'shrink') {
            var eff = null;
            for (var i = 0; i <= N; i++) {
                if (this._noteAtCell(tick + i, layer)) { eff = i - 1 - gap; break; }
            }
            if (eff === null) eff = N;
            if (eff < 0) return null;
            count = Math.min(N, eff);
        }
        // 曲长上限截断
        var cap = count;
        if (this.totalTicks && this.totalTicks > 0) {
            var remain = Math.floor(this.totalTicks - tick - 1);
            if (remain < 0) remain = 0;
            cap = Math.min(count, remain);
        }
        count = Math.max(0, cap);
        return { startTick: tick, layer: layer, count: count, mode: mode };
    };

    // 生成延音组音符数组 (首音符 + count 个延音音符)
    PianoRoll.prototype._computeSustainGroup = function(tick, layer, key) {
        var plan = this._sustainPlan(tick, layer);
        if (!plan) return null;
        var bcfg = this._getBrushConfig() || {};
        var st = bcfg.sustain || {};
        var startVel = this._getPlaceVelocity();
        var fade = !!st.fade;
        var minVel = clampInt(st.minVel, 1, 100, 10);
        var easeType = st.ease || 'linear';
        var vels = this._sustainVelocities(plan.count, startVel, fade, minVel, easeType);
        var group = [];
        for (var i = 0; i <= plan.count; i++) {
            var cellTick = plan.startTick + i;
            // skip 模式: 已有音符的格子跳过 (不放置, 不替换)
            if (plan.mode === 'skip' && this._noteAtCell(cellTick, plan.layer)) continue;
            group.push({
                tick: cellTick, layer: plan.layer,
                instrument: this.currentInstrument,
                key: key,
                velocity: vels[i], pan: 50, pitch: 0
            });
        }
        return group;
    };

    // 执行一组放置:
    // - isStart=true 且存在 onNoteGroupAdded: 交给 main 处理 (一次 pushUndo + addNote)
    // - 否则 (滑动续笔/无回调): 直接批量写入, 一次渲染
    PianoRoll.prototype._executePlaceGroup = function(group, isStart) {
        if (isStart && this.onNoteGroupAdded) {
            this.onNoteGroupAdded(group);
            return;
        }
        for (var i = 0; i < group.length; i++) {
            var n = group[i];
            this._removeNoteAtPos(n.tick, n.layer);
            this.addNote(n);
        }
        if (this.onNotesChanged) this.onNotesChanged([]);
    };

    // 在指定格放置一组延音 (key 来自当前选中音高, 回退为层号)
    PianoRoll.prototype._placeSustainAt = function(tick, layer, isStart) {
        var key = this.getSelectedKey();
        if (key === null || key === undefined || key < 0) key = layer;
        var group = this._computeSustainGroup(tick, layer, key);
        if (!group || group.length === 0) return;
        this._executePlaceGroup(group, isStart);
        // 试听提示音: 仅首音符触发, 延音音符不逐个试听
        if (isStart && this.onNotePreview) {
            this.onNotePreview(group[0].instrument, group[0].key);
        }
    };

    // 悬停预览: 计算与放置完全一致的位置集合 (不落库)
    PianoRoll.prototype._computeSustainPreview = function(tick, layer) {
        var plan = this._sustainPlan(tick, layer);
        if (!plan) return null;
        var bcfg = this._getBrushConfig() || {};
        var st = bcfg.sustain || {};
        var startVel = this._getPlaceVelocity();
        var vels = this._sustainVelocities(plan.count, startVel, !!st.fade, clampInt(st.minVel, 1, 100, 10), st.ease || 'linear');
        var cells = [];
        for (var i = 0; i <= plan.count; i++) {
            var cellTick = plan.startTick + i;
            // skip 模式: 预览也跳过已占用格子
            if (plan.mode === 'skip' && this._noteAtCell(cellTick, plan.layer)) continue;
            cells.push({ tick: cellTick, layer: plan.layer, velocity: vels[i] });
        }
        return cells;
    };

    PianoRoll.prototype._updateSustainPreview = function(x, y) {
        var bcfg = this._getBrushConfig();
        var want = bcfg && bcfg.mode === 'sustain' && bcfg.sustain && bcfg.sustain.preview !== false;
        var prev = null;
        if (want && (this.currentTool === 'brush' || this.currentTool === 'default')) {
            var lx = this._screenToTick(x);
            var ly = this._screenToLayer(y);
            if (x >= this._currentPanelWidth && y >= this._cfg.timelineHeight && lx >= 0 && ly >= 0 && ly < this.trackCount) {
                prev = this._computeSustainPreview(lx, ly);
            }
        }
        var changed = (prev === null) !== (this._hoverSustainCells === null);
        if (!changed && prev !== null && this._hoverSustainCells !== null) {
            if (prev.length !== this._hoverSustainCells.length) changed = true;
            else {
                for (var i = 0; i < prev.length; i++) {
                    if (prev[i].tick !== this._hoverSustainCells[i].tick || prev[i].layer !== this._hoverSustainCells[i].layer) {
                        changed = true; break;
                    }
                }
            }
        }
        if (changed) {
            this._hoverSustainCells = prev;
            this._fullRedrawNeeded = true;
            this.requestRender();
        }
    };

    // 绘制延音放置预览 (半透明块, 叠加音量透明度映射)
    PianoRoll.prototype._drawSustainPreview = function() {
        if (!this._hoverSustainCells || this._hoverSustainCells.length === 0) return;
        if (this.currentTool !== 'brush' && this.currentTool !== 'default') return;
        if (!this._getBrushConfig() || this._getBrushConfig().mode !== 'sustain') return;
        var ctx = this.ctx;
        var cfg = this._cfg;
        var w = this.displayWidth, h = this.displayHeight;
        var cellW = cfg.cellW * this.zoom, cellH = cfg.cellH * this.zoom;
        var pw = this._currentPanelWidth;
        for (var i = 0; i < this._hoverSustainCells.length; i++) {
            var c = this._hoverSustainCells[i];
            var sx = this._tickToScreen(c.tick);
            var sy = this._layerToScreen(c.layer);
            if (sx + cellW < pw || sx > w || sy + cellH < cfg.timelineHeight || sy > h) continue;
            var alpha = 0.35 * this._velocityToOpacity(c.velocity);
            ctx.fillStyle = 'rgba(120, 200, 255,' + alpha.toFixed(3) + ')';
            ctx.fillRect(sx + 1, sy + 1, Math.max(1, cellW - 2), Math.max(1, cellH - 2));
        }
    };

    // ============ 橡皮: 区域清除 / 连续清除 ============
    // 在指定屏幕坐标执行一次清除 (区域清除 = 以该格为中心; 连续清除 = 从命中音符级联扩散)
    PianoRoll.prototype._eraseAt = function(x, y) {
        if (x < this._currentPanelWidth || y < this._cfg.timelineHeight) return;
        var ecfg = this._getEraserConfig();
        var mode = ecfg ? ecfg.mode : 'single';
        if (mode === 'single') {
            var hit = this._getNoteAt(x, y);
            if (!hit) return;
            this.removeNotesByIds([hit.id]);
            if (this.onNotesChanged) this.onNotesChanged([]);
            return;
        }
        if (mode === 'chain') {
            var hit = this._getNoteAt(x, y);
            if (!hit) return;
            this.removeNotesByIds(this._collectChainNotes(hit));
            if (this.onNotesChanged) this.onNotesChanged([]);
            return;
        }
        // 区域清除
        var cx = this._screenToTick(x);
        var cy = this._screenToLayer(y);
        if (cy < 0 || cy >= this.trackCount) return;
        var R = clampInt(ecfg && ecfg.area ? ecfg.area.radius : 3, 0, 32, 3);
        var shape = ecfg && ecfg.area && ecfg.area.shape === 'square' ? 'square' : 'circle';
        var ids = [];
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            var dx = n.tick - cx, dy = n.layer - cy;
            var inRange = shape === 'square'
                ? (Math.abs(dx) <= R && Math.abs(dy) <= R)
                : (dx * dx + dy * dy <= R * R);
            if (inRange) ids.push(n.id);
        }
        if (ids.length > 0) {
            this.removeNotesByIds(ids);
            if (this.onNotesChanged) this.onNotesChanged([]);
        }
    };

    // 连续清除: 从命中音符 8 方向 BFS, 只扩散到满足同类判定的音符
    PianoRoll.prototype._collectChainNotes = function(start) {
        var ecfg = this._getEraserConfig() || {};
        var chain = ecfg.chain || {};
        var sim = chain.sim || {};
        var limit = clampInt(chain.limit, 1, 1024, 64);
        var wantInst = !!sim.instrument, wantKey = !!sim.key, wantVel = !!sim.velocity;
        var anyAttr = wantInst || wantKey || wantVel;
        // 建立 (tick_layer) → note 索引, 便于 O(1) 邻居查找
        var cellMap = {};
        for (var i = 0; i < this.notes.length; i++) {
            cellMap[this.notes[i].tick + '_' + this.notes[i].layer] = this.notes[i];
        }
        var ids = [start.id];
        var visited = {};
        visited[start.id] = true;
        var queue = [start];
        var dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
        while (queue.length > 0 && ids.length < limit) {
            var cur = queue.shift();
            for (var d = 0; d < dirs.length; d++) {
                var nt = cur.tick + dirs[d][0];
                var nl = cur.layer + dirs[d][1];
                if (nt < 0 || nl < 0 || nl >= this.trackCount) continue;
                var nb = cellMap[nt + '_' + nl];
                if (!nb || visited[nb.id]) continue;
                if (anyAttr) {
                    if (wantInst && nb.instrument !== start.instrument) continue;
                    if (wantKey && nb.key !== start.key) continue;
                    if (wantVel && nb.velocity !== start.velocity) continue;
                }
                visited[nb.id] = true;
                ids.push(nb.id);
                queue.push(nb);
                if (ids.length >= limit) return ids;
            }
        }
        return ids;
    };

    // ============ 查找浮层: 当前命中高亮 ============
    PianoRoll.prototype.setFindHighlight = function(noteId) {
        this._findHighlightId = (noteId === null || noteId === undefined) ? null : noteId;
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype._drawFindHighlight = function() {
        var id = this._findHighlightId;
        if (id === null || id === undefined) return;
        var note = null;
        for (var i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === id) { note = this.notes[i]; break; }
        }
        if (!note) return;
        var cfg = this._cfg, pw = this._currentPanelWidth;
        var w = this.displayWidth, h = this.displayHeight;
        var cellW = cfg.cellW * this.zoom, cellH = cfg.cellH * this.zoom;
        var x = this._tickToScreen(note.tick);
        var y = this._layerToScreen(note.layer);
        if (x + cellW < pw || x > w || y + cellH < cfg.timelineHeight || y > h) return;
        var ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 214, 70, 0.25)';
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
        ctx.strokeStyle = 'rgba(255, 214, 70, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        ctx.restore();
    };

    // ============ 公开方法 ============
    // 设置当前选中的音调 (来自钢琴键盘)
    PianoRoll.prototype.setSelectedKey = function(key) {
        this._selectedKey = key;
    };

    PianoRoll.prototype.getSelectedKey = function() {
        return this._selectedKey;
    };

    PianoRoll.prototype.setNotes = function(notes) {
        var src = (notes || []).slice();
        // 底层防重叠: 同一 (tick, layer) 只保留第一个音符, 从根源杜绝"一个格子多个音符"
        var seen = {};
        var cleaned = [];
        for (var i = 0; i < src.length; i++) {
            var key = src[i].tick + '_' + src[i].layer;
            if (seen[key]) continue;
            seen[key] = true;
            cleaned.push(src[i]);
        }
        this.notes = cleaned;
        for (var j = 0; j < this.notes.length; j++) {
            if (!this.notes[j].id) this.notes[j].id = this._nextId();
        }
        // 计数器基于现有 id 最大序号, 不能简单用 length+1 (删除音符留下 id 空洞时会撞上旧 id)
        this._recalcNoteIdCounter();
        this.selectedNotes = {};
        this._playHighlights = {};
        this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.addNote = function(noteData) {
        var tick = noteData.tick || 0;
        var layer = noteData.layer || 0;
        // 完全不允许同一个格子出现多个音符：先删除该位置现有的音符
        for (var i = this.notes.length - 1; i >= 0; i--) {
            if (this.notes[i].tick === tick && this.notes[i].layer === layer) {
                this.notes.splice(i, 1);
            }
        }
        var note = {
            id: this._nextId(),
            tick: tick,
            layer: layer,
            instrument: noteData.instrument !== undefined ? noteData.instrument : this.currentInstrument,
            key: noteData.key !== undefined ? noteData.key : layer,
            velocity: noteData.velocity || 100,
            pan: noteData.pan || 50,
            pitch: noteData.pitch || 0
        };
        this.notes.push(note);
        this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
        return note;
    };

    PianoRoll.prototype.removeNote = function(noteId) {
        for (var i = this.notes.length - 1; i >= 0; i--) {
            if (this.notes[i].id === noteId) { this.notes.splice(i, 1); break; }
        }
        delete this.selectedNotes[noteId];
        this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 删除指定轨道的所有音符
    PianoRoll.prototype.removeNotesInLayer = function(layer) {
        var removed = false;
        for (var i = this.notes.length - 1; i >= 0; i--) {
            if (this.notes[i].layer === layer) {
                delete this.selectedNotes[this.notes[i].id];
                this.notes.splice(i, 1);
                removed = true;
            }
        }
        if (removed) {
            this._markNoteIndexDirty();
            this._fullRedrawNeeded = true;
            this.render();
        }
    };

    PianoRoll.prototype.removeNotesByIds = function(noteIds) {
        if (!noteIds || noteIds.length === 0) {
            this._fullRedrawNeeded = true;
            this.render();
            return;
        }
        var idsMap = {};
        for (var i = 0; i < noteIds.length; i++) idsMap[noteIds[i]] = true;
        // 找出被删的 note 列表，传入动画
        var removedNotes = [];
        for (var j = 0; j < this.notes.length; j++) {
            if (idsMap[this.notes[j].id]) {
                removedNotes.push(this.notes[j]);
            }
        }
        // 先播放删除动画（仅当 note 数量较少，避免动画队列过重）
        if (removedNotes.length <= 30) {
            for (var ri = 0; ri < removedNotes.length; ri++) {
                this._addDeleteAnimation(removedNotes[ri]);
            }
        }
        // 立即从主列表删除
        var newNotes = [];
        for (var kj = 0; kj < this.notes.length; kj++) {
            if (!idsMap[this.notes[kj].id]) newNotes.push(this.notes[kj]);
        }
        this.notes = newNotes;
        for (var ki = 0; ki < noteIds.length; ki++) delete this.selectedNotes[noteIds[ki]];
        this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.updateNote = function(noteId, updates) {
        var idx = this._findNoteById(noteId);
        if (idx < 0) return;
        var keys = Object.keys(updates);
        for (var k = 0; k < keys.length; k++) this.notes[idx][keys[k]] = updates[keys[k]];
        // tick 变化需要重建索引
        if (updates.tick !== undefined) this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.getNotes = function() { return this.notes; };

    PianoRoll.prototype.getSelectedNotes = function() {
        var result = [];
        for (var i = 0; i < this.notes.length; i++) {
            if (this.selectedNotes[this.notes[i].id]) result.push(this.notes[i]);
        }
        return result;
    };

    PianoRoll.prototype.getSelectedNoteIds = function() { return Object.keys(this.selectedNotes); };

    PianoRoll.prototype.selectAll = function() {
        this.selectedNotes = {};
        for (var i = 0; i < this.notes.length; i++) this.selectedNotes[this.notes[i].id] = true;
        this._fullRedrawNeeded = true;
        this.render();
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    PianoRoll.prototype.selectNotesInLayer = function(layer, additive) {
        if (!additive) this.selectedNotes = {};
        for (var i = 0; i < this.notes.length; i++) {
            if (this.notes[i].layer === layer) this.selectedNotes[this.notes[i].id] = true;
        }
        this._fullRedrawNeeded = true;
        this.render();
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    PianoRoll.prototype.selectNotes = function(noteIds) {
        this.selectedNotes = {};
        for (var i = 0; i < noteIds.length; i++) this.selectedNotes[noteIds[i]] = true;
        this._fullRedrawNeeded = true;
        this.render();
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    // 条件选择: 按音色筛选当前选区
    // ignoreInstruments: 要忽略(取消选择)的音色索引数组
    // 若当前无选择, 则先全选再筛选 (等价于"全部音符中筛选")
    PianoRoll.prototype.filterSelectionByInstrument = function(ignoreInstruments) {
        var ignoreSet = {};
        for (var i = 0; i < ignoreInstruments.length; i++) ignoreSet[ignoreInstruments[i]] = true;

        // 无选择时先全选
        if (Object.keys(this.selectedNotes).length === 0) {
            this.selectedNotes = {};
            for (var j = 0; j < this.notes.length; j++) this.selectedNotes[this.notes[j].id] = true;
        }

        // 移除忽略音色的音符
        for (var k = 0; k < this.notes.length; k++) {
            var note = this.notes[k];
            if (ignoreSet[note.instrument]) {
                delete this.selectedNotes[note.id];
            }
        }

        this._fullRedrawNeeded = true;
        this.render();
        if (this.onSelectionChanged) this.onSelectionChanged(this.getSelectedNotes());
    };

    PianoRoll.prototype.deleteSelected = function() {
        var ids = Object.keys(this.selectedNotes);
        this.removeNotesByIds(ids);
        if (this.onNotesChanged) this.onNotesChanged([]);
    };

    PianoRoll.prototype.copySelected = function() {
        var selected = this.getSelectedNotes();
        this.clipboard = selected.map(function(n) {
            return { tick: n.tick, layer: n.layer, instrument: n.instrument, key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch };
        });
    };

    PianoRoll.prototype.hasClipboard = function() { return this.clipboard.length > 0; };

    PianoRoll.prototype.paste = function(offsetTick, offsetLayer) {
        // 注意: 不能用 || 默认值, offset 为 0 时会被错误替换为 1, 导致粘贴位置偏移一格
        offsetTick = (typeof offsetTick === 'number') ? offsetTick : 1;
        offsetLayer = (typeof offsetLayer === 'number') ? offsetLayer : 0;
        var newNotes = [];
        var minNewTick = Infinity, maxNewTick = -Infinity;
        var minNewLayer = Infinity, maxNewLayer = -Infinity;
        // 收集所有新音符的目标位置, 用于检测冲突
        var newPositions = {};
        for (var i = 0; i < this.clipboard.length; i++) {
            var src = this.clipboard[i];
            // clamp layer 到 [0, trackCount-1], 防止粘贴到屏幕外
            var newLayer = Math.max(0, Math.min(this.trackCount - 1, src.layer + offsetLayer));
            var newTick = Math.max(0, src.tick + offsetTick);
            var note = {
                id: this._nextId(),
                tick: newTick,
                layer: newLayer,
                instrument: src.instrument,
                // 保留原音符 key (音调), 不随 layer 变化
                key: (typeof src.key === 'number') ? src.key : newLayer,
                velocity: src.velocity, pan: src.pan, pitch: src.pitch
            };
            this.notes.push(note);
            newNotes.push(note);
            newPositions[newTick + '_' + newLayer] = note.id;
            if (newTick < minNewTick) minNewTick = newTick;
            if (newTick > maxNewTick) maxNewTick = newTick;
            if (newLayer < minNewLayer) minNewLayer = newLayer;
            if (newLayer > maxNewLayer) maxNewLayer = newLayer;
        }
        // 底层防重叠: 删除被新音符覆盖的旧音符 (同一 tick+layer 位置, 且不是新粘贴的)
        var toRemove = [];
        for (var j = this.notes.length - 1; j >= 0; j--) {
            var oldNote = this.notes[j];
            if (newPositions[oldNote.tick + '_' + oldNote.layer] === oldNote.id) continue; // 跳过新音符
            if (newPositions[oldNote.tick + '_' + oldNote.layer]) {
                toRemove.push(oldNote.id);
            }
        }
        if (toRemove.length > 0) {
            this.removeNotesByIds(toRemove);
        }
        this.selectedNotes = {};
        for (var k = 0; k < newNotes.length; k++) this.selectedNotes[newNotes[k].id] = true;
        // 关键: 初始化 _dragNoteStart, 使粘贴的音符可以立即被拖动
        this._snapDragPositions();
        // 粘贴后不自动翻页 (保持当前视图), 仅标记索引脏和重绘
        this._markNoteIndexDirty();
        this._fullRedrawNeeded = true;
        this.render();
        return newNotes;
    };

    // 滚动 canvas 使给定网格范围可见 (如果已在屏幕内则不滚动)
    PianoRoll.prototype._scrollToRange = function(minTick, maxTick, minLayer, maxLayer) {
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var visibleMinTick = Math.floor(this.scrollX / (cfg.cellW * this.zoom));
        var visibleMaxTick = Math.floor((this.scrollX + (this.displayWidth - pw)) / (cfg.cellW * this.zoom));
        var visibleMinLayer = Math.floor(this.scrollY / (cfg.cellH * this.zoom));
        var visibleMaxLayer = Math.floor((this.scrollY + (this.displayHeight - cfg.timelineHeight)) / (cfg.cellH * this.zoom));
        var needScroll = false;
        var targetScrollX = this.scrollX;
        var targetScrollY = this.scrollY;
        if (maxTick > visibleMaxTick) {
            targetScrollX = (maxTick + 2) * cfg.cellW * this.zoom - (this.displayWidth - pw);
            needScroll = true;
        } else if (minTick < visibleMinTick) {
            targetScrollX = (minTick - 1) * cfg.cellW * this.zoom;
            needScroll = true;
        }
        if (maxLayer > visibleMaxLayer) {
            targetScrollY = (maxLayer + 1) * cfg.cellH * this.zoom - (this.displayHeight - cfg.timelineHeight);
            needScroll = true;
        } else if (minLayer < visibleMinLayer) {
            targetScrollY = (minLayer - 1) * cfg.cellH * this.zoom;
            needScroll = true;
        }
        if (needScroll) {
            this.scrollX = Math.max(0, targetScrollX);
            this.scrollY = Math.max(0, targetScrollY);
        }
    };

    // ============ 边缘自动滚动 (选择/拖拽时) ============
    // 当鼠标/手指进入屏幕边缘的一定范围内时, 持续滚动 canvas
    // 越靠近边缘速度越快, 但限制最大速度; 缓慢靠近则缓慢翻页
    PianoRoll.prototype._startEdgeAutoScroll = function(screenX, screenY) {
        var EDGE = 80; // 触发边缘自动滚动的边沿范围 (px), 扩大范围让用户更容易触发
        var MAX_SPEED = 24; // 最大滚动速度 (px/帧), 限制合理范围避免滑太快
        var MIN_SPEED = 1;  // 最小滚动速度 (px/帧), 进入边沿即开始缓慢翻页
        var pw = this._currentPanelWidth;
        var th = this._cfg.timelineHeight;
        var editW = this.displayWidth - pw;
        var editH = this.displayHeight - th;
        var dx = 0, dy = 0;
        // 只在编辑区域内才检测边缘
        if (screenX > pw && screenY > th) {
            var relX = screenX - pw;
            var relY = screenY - th;
            // 左边缘: relX 越小越靠近边缘, 速度越大 (负方向)
            if (relX < EDGE) {
                var ratioX = 1 - relX / EDGE; // 0~1, 越靠近边缘越接近 1
                dx = -(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratioX);
            } else if (relX > editW - EDGE) {
                var ratioX2 = 1 - (editW - relX) / EDGE;
                dx = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratioX2;
            }
            // 上边缘
            if (relY < EDGE) {
                var ratioY = 1 - relY / EDGE;
                dy = -(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratioY);
            } else if (relY > editH - EDGE) {
                var ratioY2 = 1 - (editH - relY) / EDGE;
                dy = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * ratioY2;
            }
        }
        if (dx !== 0 || dy !== 0) {
            if (!this._edgeScrollRAF) {
                var self = this;
                this._edgeScrollDx = dx;
                this._edgeScrollDy = dy;
                this._edgeScrollRAF = requestAnimationFrame(function loop() {
                    var maxSx = self._getMaxScrollX();
                    self.scrollX = Math.max(0, Math.min(maxSx, self.scrollX + (self._edgeScrollDx || 0)));
                    self.scrollY = Math.max(0, self.scrollY + (self._edgeScrollDy || 0));
                    // 如果正在选择, 更新选择框: 锚点固定为网格坐标, 当前角跟随鼠标
                    if (self._isSelecting && self._selectionRect && self._edgeCurrentX != null) {
                        self._selectionRect = {
                            tick1: self._selectStartTick, layer1: self._selectStartLayer,
                            tick2: self._screenToTick(self._edgeCurrentX), layer2: self._screenToLayer(self._edgeCurrentY),
                            sx1: self._selectionRect.sx1, sy1: self._selectionRect.sy1,
                            sx2: self._edgeCurrentX, sy2: self._edgeCurrentY
                        };
                        self._selectByRect(self._selectionRect.tick1, self._selectionRect.layer1, self._selectionRect.tick2, self._selectionRect.layer2, self._edgeAdditive || false);
                    }
                    self._fullRedrawNeeded = true;
                    self.render();
                    if (self._edgeScrollRAF) {
                        self._edgeScrollRAF = requestAnimationFrame(loop);
                    }
                });
            }
            this._edgeScrollDx = dx;
            this._edgeScrollDy = dy;
        } else {
            // 在非边缘区域, 更新方向但不停止 RAF (保持平滑)
            this._edgeScrollDx = 0;
            this._edgeScrollDy = 0;
        }
    };

    PianoRoll.prototype._updateEdgeAutoScroll = function(screenX, screenY, additive) {
        this._edgeCurrentX = screenX;
        this._edgeCurrentY = screenY;
        this._edgeAdditive = !!additive;
        this._startEdgeAutoScroll(screenX, screenY);
    };

    PianoRoll.prototype._stopEdgeAutoScroll = function() {
        if (this._edgeScrollRAF) {
            cancelAnimationFrame(this._edgeScrollRAF);
            this._edgeScrollRAF = null;
        }
        this._edgeScrollDx = 0;
        this._edgeScrollDy = 0;
        this._edgeCurrentX = null;
        this._edgeCurrentY = null;
    };

    // ============ 音量透明度 / 背景图片 / 网格透明度 ============
    PianoRoll.prototype.setVolumeOpacityEnabled = function(enabled) {
        this.volumeOpacityEnabled = !!enabled;
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 根据音量计算不透明度 (0-100 → 1.0 ~ 0.2)
    PianoRoll.prototype._velocityToOpacity = function(velocity) {
        if (!this.volumeOpacityEnabled) return 1.0;
        var v = Math.max(0, Math.min(100, velocity || 0));
        // 0 → 0.2 (80%透明), 100 → 1.0 (不透明)
        return 0.2 + (v / 100) * 0.8;
    };

    // 设置面板透明度 (0-1, 1=完全不透明; 用于透出网页背景图片)
    PianoRoll.prototype.setPanelAlpha = function(alpha) {
        this.panelAlpha = Math.max(0, Math.min(1, alpha));
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 设置左侧音轨信息栏透明度 (独立于面板透明度)
    PianoRoll.prototype.setTrackPanelAlpha = function(alpha) {
        this.trackPanelAlpha = Math.max(0, Math.min(1, alpha));
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 设置网格透明度 (0=不透明, 1=完全透明)
    PianoRoll.prototype.setGridOpacity = function(opacity) {
        this.gridOpacity = Math.max(0, Math.min(1, opacity));
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.duplicateSelected = function() {
        var selected = this.getSelectedNotes();
        if (selected.length === 0) return [];
        this.clipboard = selected.map(function(n) {
            return { tick: n.tick, layer: n.layer, instrument: n.instrument, key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch };
        });
        return this.paste(1, 0);
    };

    PianoRoll.prototype.setInstrument = function(instrument) { this.currentInstrument = instrument; };

    // ============ 自定义音色颜色解析 (缓存) ============
    // 自定音色 (instrument >= 20) 使用其设置颜色的纯色方块图标/底色
    PianoRoll.prototype.refreshCustomInstrumentCache = function() {
        this._customColorMap = null;
        this._fullRedrawNeeded = true;
        if (this.render) this.render();
    };

    PianoRoll.prototype._ensureCustomColorMap = function() {
        if (this._customColorMap) return this._customColorMap;
        var map = {};
        if (window.CustomInstruments && typeof CustomInstruments.list === 'function') {
            var list = CustomInstruments.list();
            for (var i = 0; i < list.length; i++) {
                if (list[i] && typeof list[i].instrument === 'number') {
                    map[list[i].instrument] = list[i].color || '#4aa3ff';
                }
            }
        }
        this._customColorMap = map;
        return map;
    };

    // 获取乐器颜色: 自定义音色用用户设置色, 其余用内置色板
    PianoRoll.prototype._getInstrumentColor = function(instrument) {
        if (typeof instrument === 'number' && instrument >= 20) {
            var map = this._ensureCustomColorMap();
            if (map[instrument]) return map[instrument];
        }
        return INSTRUMENT_COLORS[instrument % INSTRUMENT_COLORS.length];
    };

    PianoRoll.prototype.setZoom = function(zoom, anchorX, anchorY) {
        var newZoom = Math.max(0.15, Math.min(4, zoom));
        // 双指缩放时保持锚点(手指中心)对应的世界坐标不变
        if (anchorX !== undefined && anchorY !== undefined) {
            var oldZoom = this.zoom;
            var cellW = this._cfg.cellW;
            var cellH = this._cfg.cellH;
            var worldX = (anchorX - this._editOriginX() + this.scrollX) / (cellW * oldZoom);
            var worldY = (anchorY - this._editOriginY() + this.scrollY) / (cellH * oldZoom);
            this.zoom = newZoom;
            this.scrollX = worldX * cellW * this.zoom - anchorX + this._editOriginX();
            this.scrollY = worldY * cellH * this.zoom - anchorY + this._editOriginY();
            this.scrollX = Math.max(0, this.scrollX);
            this.scrollY = Math.max(0, this.scrollY);
        } else {
            this.zoom = newZoom;
        }
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.getZoom = function() { return this.zoom; };

    PianoRoll.prototype.scrollToTick = function(tick) {
        var centerX = this.displayWidth / 2;
        this.scrollX = tick * this._cfg.cellW * this.zoom + this._currentPanelWidth - centerX;
        this.scrollX = Math.max(0, this.scrollX);
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype.getCurrentTickScreenX = function(tick) {
        return tick * this._cfg.cellW * this.zoom - this.scrollX + this._currentPanelWidth;
    };

    PianoRoll.prototype.setNotesData = function(notes) {
        var src = notes || [];
        // 底层防重叠: 同一 (tick, layer) 只保留第一个音符
        var seen = {};
        var cleaned = [];
        for (var i = 0; i < src.length; i++) {
            var key = src[i].tick + '_' + src[i].layer;
            if (seen[key]) continue;
            seen[key] = true;
            cleaned.push(src[i]);
        }
        this.notes = cleaned;
        for (var j = 0; j < this.notes.length; j++) {
            if (!this.notes[j].id) this.notes[j].id = this._nextId();
        }
        this._recalcNoteIdCounter();
        this.selectedNotes = {};
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 设置音轨信息
    PianoRoll.prototype.setTrackInfo = function(layer, info) {
        this.trackInfo[layer] = info;
        this._staticLayerDirty = true;  // 静音/独奏变化影响蒙版层
    };

    PianoRoll.prototype.getTrackInfo = function(layer) {
        return this.trackInfo[layer] || { name: 'Layer ' + (layer + 1), muted: false, solo: false, volume: 100 };
    };

    // ============ 面板宽度 / 折叠动画 ============
    // 根据最长音轨名称计算所需面板宽度
    PianoRoll.prototype._calculatePanelWidth = function() {
        var ctx = this.ctx;
        if (!ctx) return this._cfg.sidePanelWidth;
        ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
        var longestW = 0;
        for (var layer = 0; layer < this.trackCount; layer++) {
            var info = this.getTrackInfo(layer);
            var name = info.name || ('Layer ' + (layer + 1));
            var w = ctx.measureText(name).width;
            if (w > longestW) longestW = w;
        }
        var minW = this._isDesktop ? 220 : 134;
        var maxW = this._isDesktop ? 320 : 250;
        return Math.max(minW, Math.min(maxW, Math.ceil(longestW) + 120));
    };

    // 更新面板宽度 (音轨变化时调用)
    PianoRoll.prototype.updatePanelWidth = function() {
        if (this._panelAnimating) return;
        var newWidth = this._calculatePanelWidth();
        if (this._panelTargetWidth > 0) {
            this._currentPanelWidth = newWidth;
            this._panelTargetWidth = newWidth;
        }
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 设置面板折叠/展开 (带动画)
    PianoRoll.prototype.setPanelCollapsed = function(collapsed) {
        // 折叠时清理残留的音轨名称编辑输入框
        if (collapsed && this._trackNameInput) {
            this._trackNameInput.remove();
            this._trackNameInput = null;
        }
        this._panelTargetWidth = collapsed ? 0 : this._calculatePanelWidth();
        if (!this._panelAnimating) {
            this._panelAnimating = true;
            this._panelAnimStart = Date.now();
            this._panelAnimStartWidth = this._currentPanelWidth;
            this._animatePanel();
        }
    };

    // 面板宽度动画 (easeOutCubic, 250ms)
    PianoRoll.prototype._animatePanel = function() {
        var elapsed = (Date.now() - this._panelAnimStart) / 250; // 250ms
        if (elapsed >= 1) {
            this._currentPanelWidth = this._panelTargetWidth;
            this._panelAnimating = false;
        } else {
            // easeOutCubic
            var t = 1 - Math.pow(1 - elapsed, 3);
            var startW = this._panelAnimStartWidth || 134;
            this._currentPanelWidth = startW + (this._panelTargetWidth - startW) * t;
            var self = this;
            requestAnimationFrame(function() { self._animatePanel(); });
        }
        this._fullRedrawNeeded = true;
        this.render();
    };

    // ============ 渲染 ============

    // 请求全量重绘
    PianoRoll.prototype.requestFullRedraw = function() {
        this._fullRedrawNeeded = true;
        this.render();
    };

    PianoRoll.prototype._drawPulseIndicator = function() {
        if (!this._lpActive) return;
        var ctx = this.ctx;
        var sx = this._dragStartX, sy = this._dragStartY;
        if (!sx) return;
        // 360ms 内扩散到最大并保持; 缓入缓出 (三次), 快速且柔和
        var elapsed = performance.now() - (this._lpAnimStart || 0);
        var dur = this._lpAnimDuration || 360;
        var t = Math.min(1, elapsed / dur);
        var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic
        var baseR = 34, maxR = 78; // 最终半径 78px, 远大于手指触点 (约 20-40px), 保证不被手指挡住
        var r = baseR + (maxR - baseR) * eased;
        ctx.save();
        // 外圈: 灰白色粗环
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ececf1';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 内圈: 增加层次感, 更亮
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        // 半透明灰白填充, 随扩散逐渐显现
        ctx.globalAlpha = 0.15 * (0.5 + 0.5 * eased);
        ctx.fillStyle = '#ececf1';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    PianoRoll.prototype._drawSelectionRect = function() {
        if (!this._isSelecting || !this._selectionRect) return;
        var ctx = this.ctx;
        var rect = this._selectionRect;
        // 直接使用屏幕坐标的"按下点 → 当前点"绘制, 完全跟手, 不吸附网格;
        // 若旧状态没有屏幕坐标 (理论不会发生), 回退到网格坐标渲染
        var x1 = (typeof rect.sx1 === 'number') ? rect.sx1 : this._tickToScreen(rect.tick1);
        var y1 = (typeof rect.sy1 === 'number') ? rect.sy1 : this._layerToScreen(rect.layer1);
        var x2 = (typeof rect.sx2 === 'number') ? rect.sx2 : this._tickToScreen(rect.tick2 + 1);
        var y2 = (typeof rect.sy2 === 'number') ? rect.sy2 : this._layerToScreen(rect.layer2 + 1);
        var sx = Math.min(x1, x2);
        var sy = Math.min(y1, y2);
        var sw = Math.abs(x2 - x1);
        var sh = Math.abs(y2 - y1);
        if (sw <= 2 && sh <= 2) return;
        ctx.fillStyle = this._cfg.selectionColor;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = this._cfg.selectionBorder;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, sw, sh);
    };

    // RAF 节流的 render: 一帧内多次调用只绘制一次
    PianoRoll.prototype.requestRender = function() {
        if (this._renderRAF) return;
        var self = this;
        this._renderRAF = requestAnimationFrame(function() {
            self._renderRAF = null;
            self.render();
        });
    };

    // 重建音符空间索引 (按 tick 分桶) + 层→乐器颜色缓存
    PianoRoll.prototype._rebuildNoteIndex = function() {
        this._notesByTick = {};
        this._layerInstrument = {};  // layer -> instrument (用于面板颜色, 避免每帧遍历所有音符)
        for (var i = 0; i < this.notes.length; i++) {
            var t = this.notes[i].tick;
            if (!this._notesByTick[t]) this._notesByTick[t] = [];
            this._notesByTick[t].push(i);
            // 记录每层第一个音符的乐器 (用于面板颜色显示)
            if (this._layerInstrument[this.notes[i].layer] === undefined) {
                this._layerInstrument[this.notes[i].layer] = this.notes[i].instrument;
            }
        }
        this._noteIndexDirty = false;
    };

    // 标记索引为脏 (在 addNote/removeNote/paste/moveNote 时调用)
    PianoRoll.prototype._markNoteIndexDirty = function() {
        this._noteIndexDirty = true;
    };

    PianoRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom;
        var cellH = cfg.cellH * this.zoom;

        // 清理动画状态 (仅在动画循环未运行时处理, 避免重复)
        if (!this._animLoopRunning) {
            this._processNoteAnims();
            this._processPlayHighlights();
        }
        // 如果还有活着的动画且动画循环未运行, 启动刷新
        if ((this._noteAnims.length > 0 || this._hasActiveHighlights()) && !this._animLoopRunning) {
            this._startAnimLoop();
        }

        var displayTick = this._getDisplayTick();

        // 平滑翻页: 播放时将 playhead 固定到屏幕左 1/3 处, 面板移动
        if (this.smoothScrollEnabled && this.isPlaying) {
            var playheadX = pw + (w - pw) / 3;
            this.scrollX = displayTick * cellW + pw - playheadX;
        }

        // 非平滑翻页: 书本翻页效果
        if (!this.smoothScrollEnabled && this.isPlaying) {
            var screenX = displayTick * cellW - this.scrollX + pw;
            if (screenX > w) {
                this.scrollX = Math.max(0, displayTick * cellW);
            } else if (screenX < pw && this.scrollX > 0) {
                this.scrollX = Math.max(0, displayTick * cellW);
            }
        }

        // ======== 直接渲染 (离屏缓存方案已移除: scrollX/Y 变化时每帧重建适得其反) ========

        // 清除上一帧内容: 画布透明, 必须清空否则滑动时旧帧像素残留产生残影
        ctx.clearRect(0, 0, w, h);

        // 背景:
        // - 无背景图 (body 无 bg-active): 画布绘制默认双色背景, 与重构前观感一致 (网格默认可见)
        // - 有背景图 (body.bg-active): 画布保持透明, 由容器半透明 + 网格材质透出网页背景图片
        if (!document.body.classList.contains('bg-active')) {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#16162a';
            ctx.fillRect(pw, cfg.timelineHeight, w - pw, h - cfg.timelineHeight);
        }

        // 网格 (交替行底色 + 网格线, 受网格透明度控制)
        this._drawGrid();

        // 静音轨道叠加半透明黑色蒙版
        this._drawMutedOverlays();

        // ======== 动态层 (直接绘制到主 canvas) ========

        // 选轨模式: 高亮选中的音轨行 (演奏模式 / 通用选轨)
        var _selListForCanvas = this._trackSelectMode ? this.compressionSelectedLayers
            : (this.currentTool === 'performance' ? this.performanceSelectedLayers : null);
        if (_selListForCanvas) {
            for (var li = 0; li < _selListForCanvas.length; li++) {
                var selLayer = _selListForCanvas[li];
                var layerY = this._cfg.timelineHeight + selLayer * cellH - this.scrollY;
                if (layerY + cellH > this._cfg.timelineHeight && layerY < h) {
                    ctx.fillStyle = 'rgba(76, 194, 255, 0.08)';
                    ctx.fillRect(pw, layerY, w - pw, cellH);
                }
            }
        }

        // 音符
        this._drawNotes();

        // 动画中的音符 (删除/放置效果)
        this._drawAnimatedNotes();

        // 延音放置预览 (半透明块, 显示整组将放置的位置, 叠加音量透明度)
        this._drawSustainPreview();

        // 查找浮层: 当前命中音符高亮
        this._drawFindHighlight();

        // 进度条 + 时间轴: 在音符之后绘制, 覆盖溢出到顶部区域的音符
        // (背景模式时时间轴半透明, 音符透过可见; 非背景模式时时间轴不透明, 完全覆盖音符)
        this._drawProgressBar();
        this._drawTimeline();

        // 左侧音轨信息区: 始终在音符之上绘制, 覆盖音符
        // (信息栏透明时, 音符透过半透明背景可见并逐渐滑出屏幕; 不透明时音符被完全遮挡)
        this._drawTrackPanel();

        if (!this._overlayCanvas) this._drawPlayhead();
        if (this._overlayCanvas) this.redrawPlaybackOverlay();

        // 长按时的扩散脉冲指示 (大灰白环, 见 _drawPulseIndicator)
        this._drawPulseIndicator();

        // 框选矩形 (屏幕坐标起终点, 跟手不吸附网格)
        this._drawSelectionRect();

        // 钢琴键盘 (键标签 + 高亮)
        this._drawPianoKeyboard();
    };

    // 绘制播放头指示器 (canvas内, 跟随滚动)
    PianoRoll.prototype._drawPlayhead = function() {
        if (this.playheadTick === null || this.playheadTick === undefined) return;
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;

        var displayTick = this._getDisplayTick();

        // 平滑翻页模式: 播放头固定在屏幕左 1/3 处
        // 非平滑模式使用插值后的 tick, 让播放头随 rAF 平滑移动
        var x;
        if (this.smoothScrollEnabled && this.isPlaying) {
            x = pw + (w - pw) / 3;
        } else {
            x = this._tickToScreen(displayTick);
        }

        if (x < pw || x > w) return;

        ctx.save();
        // 竖线 (移除 shadowBlur: Canvas 阴影是最昂贵操作, 改用亮色双线模拟发光感)
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, cfg.timelineHeight);
        ctx.lineTo(x, h);
        ctx.stroke();
        // 辅助亮线 (模拟发光, 无 shadow 开销)
        ctx.strokeStyle = 'rgba(255, 100, 130, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 1, cfg.timelineHeight);
        ctx.lineTo(x - 1, h);
        ctx.stroke();

        // 顶部三角形
        ctx.fillStyle = '#e94560';
        ctx.beginPath();
        ctx.moveTo(x, cfg.timelineHeight);
        ctx.lineTo(x - 6, cfg.timelineHeight - 8);
        ctx.lineTo(x + 6, cfg.timelineHeight - 8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    };

    // ============ 顶部滑动条 (左右翻页/滚动视图) ============
    PianoRoll.prototype._drawProgressBar = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var cfg = this._cfg;
        var barHeight = cfg.progressBarHeight;
        var barY = 0;
        var pw = this._currentPanelWidth;

        // 使用插值后的 tick 计算播放头位置 (仅作标记显示)
        var displayTick = this._getDisplayTick();

        // 轨道背景: 背景模式下使用 panelAlpha (半透明, 音符可透过)
        var pbAlpha = document.body.classList.contains('bg-active') ? this.panelAlpha : 0.35;
        ctx.fillStyle = 'rgba(0, 0, 0, ' + pbAlpha + ')';
        ctx.fillRect(0, barY, w, barHeight);

        // 滚动窗口 (thumb): 表示当前可视区域在全部内容中的位置
        var maxScroll = this._getMaxScrollX();
        var contentWidth = Math.max(1, this.totalTicks * (cfg.cellW * this.zoom));
        var visibleWidth = Math.max(1, w - pw);
        var ratio = maxScroll > 0 ? Math.min(1, this.scrollX / maxScroll) : 0;
        var thumbW = Math.max(30, Math.min(w, (visibleWidth / contentWidth) * w));
        var thumbX = ratio * (w - thumbW);

        // 滚动窗口填充
        ctx.fillStyle = 'rgba(78, 205, 196, 0.32)';
        ctx.fillRect(thumbX, barY, thumbW, barHeight);
        // 顶部高亮线
        ctx.fillStyle = 'rgba(78, 205, 196, 0.85)';
        ctx.fillRect(thumbX, barY, thumbW, 2);

        // Tick marks (刻度线仅作背景装饰)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        var tickStep = Math.max(1, Math.floor(this.totalTicks / 16));
        if (this.totalTicks > 0) {
            for (var t = 0; t <= this.totalTicks; t += tickStep) {
                var tx = (t / this.totalTicks) * w;
                ctx.beginPath();
                ctx.moveTo(tx, barY + barHeight - 4);
                ctx.lineTo(tx, barY + barHeight);
                ctx.stroke();
            }
        }

        // 播放头标记 (细红线, 仅显示, 不可拖动)
        if (this.totalTicks > 0) {
            var px = (displayTick / this.totalTicks) * w;
            ctx.fillStyle = 'rgba(233, 69, 96, 0.85)';
            ctx.fillRect(px - 1, barY + 2, 2, barHeight - 4);
        }
    };

    // 仅重绘顶部进度条区域 (轻量, 可在播放循环高频调用)
    PianoRoll.prototype._redrawProgressBarOnly = function() {
        if (!this.ctx) return;
        var w = this.displayWidth;
        var barHeight = this._cfg.progressBarHeight;
        // 清除进度条区域并重绘背景色, 再绘制进度条
        this.ctx.fillStyle = 'rgba(26, 26, 46, ' + this.panelAlpha + ')';
        this.ctx.fillRect(0, 0, w, barHeight);
        this._drawProgressBar();
    };

    PianoRoll.prototype.seekToTick = function(tick) {
        this.currentTick = Math.max(0, Math.min(this.totalTicks, tick));
        // 同步播放头位置, 避免 main.js 播放循环用旧值覆盖
        this.playheadTick = this.currentTick;
        // 立即同步平滑插值, 防止点击时间轴时播放头停留在中间位置
        this._smoothedPlayheadTick = this.currentTick;
        this._smoothedProgressTick = this.currentTick;
        // 清除播放插值基准, 避免非播放状态下 _getDisplayTick 加上 frac 偏移
        this._lastTickTime = 0;
        // 清除所有音符动画, 防止点击时间轴时动画重播
        this._noteAnims = [];
        this._playHighlights = {};
        this._animLoopRunning = false;
        if (this._animLoopRAF) {
            cancelAnimationFrame(this._animLoopRAF);
            this._animLoopRAF = null;
        }
        // 注意: 不在此处 scrollToPlayhead, 避免进度条拖拽/时间栏点击时意外翻页
        // 程序化 seek (如 main.js seekToTick) 自行负责滚动到播放头
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 非播放状态下滚动使播放头可见 (仅当播放头在可视区域外时滚动)
    PianoRoll.prototype._scrollToPlayhead = function() {
        if (this.playheadTick === null || this.playheadTick === undefined) return;
        var cellW = this._cfg.cellW * this.zoom;
        var pw = this._currentPanelWidth;
        var w = this.displayWidth;
        // 计算播放头在屏幕上的 x 位置
        var playheadX = this.playheadTick * cellW - this.scrollX + pw;
        // 如果播放头不在可视区域内, 滚动到居中
        if (playheadX < pw || playheadX > w) {
            this.scrollX = this.playheadTick * cellW - (w - pw) / 2;
            if (this.scrollX < 0) this.scrollX = 0;
            var maxScroll = this._getMaxScrollX();
            if (this.scrollX > maxScroll) this.scrollX = maxScroll;
        }
    };

    // ============ 时间轴 ============
    PianoRoll.prototype._drawTimeline = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var cfg = this._cfg;
        var th = cfg.timelineHeight;
        var ph = cfg.progressBarHeight;
        var pw = this._currentPanelWidth;

        // 背景 (从进度条下方开始)
        ctx.fillStyle = 'rgba(18, 18, 42, ' + this.panelAlpha + ')';
        ctx.fillRect(0, ph, w, th - ph);

        // 底部分隔线
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, th - 0.5);
        ctx.lineTo(w, th - 0.5);
        ctx.stroke();

        // 左侧音轨区上方
        ctx.fillStyle = 'rgba(14, 14, 34, ' + this.panelAlpha + ')';
        ctx.fillRect(0, ph, pw, th - ph);

        // 刻度
        var tickStart = Math.floor(this.scrollX / (cfg.cellW * this.zoom));
        var tickEnd = Math.ceil((this.scrollX + w - pw) / (cfg.cellW * this.zoom));
        var cellW = cfg.cellW * this.zoom;

        for (var tick = tickStart; tick <= tickEnd; tick++) {
            var x = this._tickToScreen(tick);
            if (x < pw || x > w) continue;

            var isBeat = tick % 4 === 0;
            var isMeasure = tick % 16 === 0;

            // 刻度线 (从进度条下方开始)
            ctx.strokeStyle = isMeasure ? 'rgba(255,255,255,0.2)' : (isBeat ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)');
            ctx.lineWidth = isMeasure ? 1.5 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, isMeasure ? ph : (isBeat ? ph + 4 : ph + 10));
            ctx.lineTo(x, th - 6);
            ctx.stroke();

            // 刻度标签
            if (isMeasure || (isBeat && cellW > 15)) {
                ctx.fillStyle = isMeasure ? '#aaa' : '#666';
                ctx.font = (isMeasure ? 'bold ' : '') + '9px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(tick.toString(), x, ph + 2);
            }
        }
    };

    // ============ 左侧音轨信息区 ============
    // 按钮布局计算 (draw 和 hit-test 共用)
    PianoRoll.prototype._getTrackButtonLayout = function(cellH) {
        var pw = this._currentPanelWidth;
        var btnSize = Math.min(14, cellH * 0.55);

        if (this._isDesktop && pw >= 220) {
            var rightMargin = 4;
            var btnGap = 1;
            var btnW = 16;
            var btnH = Math.min(20, cellH * 0.7);
            var dragW = 14;
            var volumeW = Math.max(40, pw - 170);

            var x = pw - rightMargin;
            var dragX = x - dragW; x -= dragW + btnGap;
            var deleteX = x - btnW; x -= btnW + btnGap;
            var selectX = x - btnW; x -= btnW + btnGap;
            var soloX = x - btnW; x -= btnW + btnGap;
            var muteX = x - btnW; x -= btnGap + 2;
            var volEnd = x;
            var volStart = Math.max(88, pw - 150);

            var nameStart = 8;
            var nameEnd = volStart - 2;

            return {
                btnSize: btnH,
                isDesktop: true,
                nameStart: nameStart,
                nameEnd: nameEnd,
                volStart: volStart, volEnd: volEnd,
                muteX: muteX, muteW: btnW,
                soloX: soloX, soloW: btnW,
                selX: selectX, selW: btnW,
                deleteX: deleteX, deleteW: btnW,
                dragX: dragX, dragW: dragW,
                moreX: -1, moreW: 0,
                crowded: false
            };
        }

        var gap = 3;
        var smallW = btnSize;
        var selW = smallW;
        var moreW = smallW;

        // 从右到左排列: 更多(⋮) → 拖动手柄 → 全选
        // M/S/音量/删除 收起在"更多"菜单中, 避免小屏幕按钮溢出
        var x = pw - 2;
        var moreX = x - moreW; x -= moreW + gap;
        var dragX = x - smallW; x -= smallW + gap;  // 拖动手柄
        var selX = x - selW; x -= selW + gap;

        // 动态拥挤度检测: 名称区域至少需要 30px 才不拥挤
        var nameEnd = x;
        var nameStart = 6;
        var nameSpace = nameEnd - nameStart;
        var crowded = nameSpace < 30;

        // 仍然拥挤时隐藏全选按钮, 保留更多和拖动手柄
        if (crowded) {
            x = pw - 2;
            moreX = x - moreW; x -= moreW + gap;
            dragX = x - smallW; x -= smallW + gap;
            selX = -1; selW = 0;  // 标记隐藏
            nameEnd = x;
        }

        return {
            btnSize: btnSize,
            isDesktop: false,
            moreX: moreX, moreW: moreW,
            dragX: dragX, dragW: smallW,
            selX: selX, selW: selW,
            nameStart: nameStart,
            nameEnd: nameEnd,
            crowded: crowded
        };
    };

    // 音轨信息栏按钮交互状态: 0=正常, 1=悬浮, 2=按下
    PianoRoll.prototype._trackBtnState = function(layer, type) {
        var p = this._trackPanelPressed;
        if (p && p.layer === layer && p.type === type) return 2;
        var h = this._trackPanelHover;
        if (h && h.layer === layer && h.type === type) return 1;
        return 0;
    };

    PianoRoll.prototype._drawTrackPanel = function() {
        if (this._currentPanelWidth <= 0) return;  // 面板折叠时不绘制

        var ctx = this.ctx;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;

        // 背景 (使用独立的音轨信息栏透明度, 不受面板透明度影响)
        ctx.fillStyle = 'rgba(18, 18, 42, ' + this.trackPanelAlpha + ')';
        ctx.fillRect(0, cfg.timelineHeight, pw, h - cfg.timelineHeight);

        // 右侧分隔线
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pw - 0.5, cfg.timelineHeight);
        ctx.lineTo(pw - 0.5, h);
        ctx.stroke();

        // 每行音轨信息
        var cellH = cfg.cellH * this.zoom;
        var layerStart = Math.floor(this.scrollY / cellH);
        var layerEnd = Math.ceil((this.scrollY + h - cfg.timelineHeight) / cellH);
        var layout = this._getTrackButtonLayout(cellH);
        var btnSize = layout.btnSize;

        // 按钮悬浮/按下高亮辅助 (覆盖在按钮底色上, 不遮挡文字/图标)
        var self = this;
        var btnOverlay = function(btnLayer, btnType, bx, by, bw, bh) {
            var st = self._trackBtnState(btnLayer, btnType);
            if (st > 0) {
                ctx.fillStyle = st === 2 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.13)';
                ctx.fillRect(bx, by, bw, bh);
            }
        };

        for (var layer = Math.max(0, layerStart); layer <= Math.min(this.trackCount - 1, layerEnd); layer++) {
            var y = this._layerToScreen(layer);
            if (y + cellH < cfg.timelineHeight || y > h) continue;

            var trackInfo = this.getTrackInfo(layer);
            var color = INSTRUMENT_COLORS[0]; // 默认颜色

            // 使用缓存的层→乐器映射 (避免每帧遍历所有音符)
            if (this._noteIndexDirty) this._rebuildNoteIndex();
            var inst = this._layerInstrument[layer];
            if (inst !== undefined) {
                color = this._getInstrumentColor(inst);
            }

            // 行背景
            if (trackInfo.muted) {
                ctx.fillStyle = 'rgba(255,255,255,0.02)';
            } else {
                ctx.fillStyle = layer % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)';
            }
            ctx.fillRect(0, y, pw, cellH);

            // 选轨模式: 高亮选中的音轨 (演奏模式 / 通用选轨)
            var _selListForPanel = this._trackSelectMode ? this.compressionSelectedLayers
                : (this.currentTool === 'performance' ? this.performanceSelectedLayers : null);
            if (_selListForPanel && _selListForPanel.indexOf(layer) >= 0) {
                ctx.fillStyle = 'rgba(76, 194, 255, 0.15)';
                ctx.fillRect(0, y, pw, cellH);
                // 左侧高亮条
                ctx.fillStyle = '#4cc2ff';
                ctx.fillRect(0, y, 3, cellH);
            }

            // 左侧颜色条
            ctx.fillStyle = color;
            ctx.globalAlpha = trackInfo.muted ? 0.3 : 0.7;
            ctx.fillRect(0, y, 3, cellH);
            ctx.globalAlpha = 1;

            // 音轨名称（单行显示）
            var textY = y + cellH / 2;
            ctx.fillStyle = trackInfo.muted ? '#555' : '#d0d0d0';
            ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            var maxTextW = layout.nameEnd - layout.nameStart;
            var displayName = trackInfo.name || ('Layer ' + (layer + 1));
            if (ctx.measureText(displayName).width > maxTextW) {
                while (displayName.length > 1 && ctx.measureText(displayName + '..').width > maxTextW) {
                    displayName = displayName.slice(0, -1);
                }
                displayName += '..';
            }
            ctx.fillText(displayName, layout.nameStart, textY);

            if (layout.isDesktop) {
                // 桌面端：音量文本按钮 (点击弹出音量设置, 不再绘制比例条)
                var volW = layout.volEnd - layout.volStart;
                var volY = textY - btnSize / 2;
                var volH = btnSize;
                var volVal = (trackInfo.volume !== undefined ? trackInfo.volume : 100);
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(layout.volStart, volY, volW, volH);
                btnOverlay(layer, 'volume', layout.volStart, volY, volW, volH);
                ctx.strokeStyle = trackInfo.muted ? 'rgba(255,255,255,0.12)' : 'rgba(78,205,196,0.35)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(layout.volStart, volY, volW, volH);
                ctx.fillStyle = trackInfo.muted ? '#666' : (volVal === 0 ? '#e94560' : '#4ecdc4');
                ctx.font = 'bold 10px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('[' + volVal + '%]', layout.volStart + volW / 2, textY);

                // 静音按钮 (M)
                var muteBg = trackInfo.muted ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)';
                var muteFg = trackInfo.muted ? '#e94560' : '#aaa';
                ctx.fillStyle = muteBg;
                ctx.fillRect(layout.muteX, textY - btnSize / 2, layout.muteW, btnSize);
                ctx.strokeStyle = muteFg;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(layout.muteX, textY - btnSize / 2, layout.muteW, btnSize);
                ctx.fillStyle = muteFg;
                ctx.font = 'bold ' + Math.max(8, Math.min(12, btnSize * 0.65)) + 'px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('M', layout.muteX + layout.muteW / 2, textY);

                // 独奏按钮 (S)
                var soloBg = trackInfo.solo ? 'rgba(233,196,69,0.3)' : 'rgba(255,255,255,0.06)';
                var soloFg = trackInfo.solo ? '#e9c445' : '#aaa';
                ctx.fillStyle = soloBg;
                ctx.fillRect(layout.soloX, textY - btnSize / 2, layout.soloW, btnSize);
                btnOverlay(layer, 'solo', layout.soloX, textY - btnSize / 2, layout.soloW, btnSize);
                ctx.strokeStyle = soloFg;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(layout.soloX, textY - btnSize / 2, layout.soloW, btnSize);
                ctx.fillStyle = soloFg;
                ctx.fillText('S', layout.soloX + layout.soloW / 2, textY);

                // Select all notes in this track (additive selection).
                ctx.fillStyle = 'rgba(78,205,196,0.15)';
                ctx.fillRect(layout.selX, textY - btnSize / 2, layout.selW, btnSize);
                ctx.strokeStyle = 'rgba(78,205,196,0.55)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(layout.selX, textY - btnSize / 2, layout.selW, btnSize);
                ctx.fillStyle = '#4ecdc4';
                ctx.font = 'bold ' + Math.max(8, Math.min(11, btnSize * 0.62)) + 'px "Segoe UI", sans-serif';
                ctx.fillText('A', layout.selX + layout.selW / 2, textY);

                // 删除按钮 (✕)
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(layout.deleteX, textY - btnSize / 2, layout.deleteW, btnSize);
                btnOverlay(layer, 'delete', layout.deleteX, textY - btnSize / 2, layout.deleteW, btnSize);
                ctx.strokeStyle = 'rgba(233,69,96,0.5)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(layout.deleteX, textY - btnSize / 2, layout.deleteW, btnSize);
                ctx.fillStyle = '#e94560';
                ctx.font = 'bold ' + Math.max(8, Math.min(12, btnSize * 0.65)) + 'px "Segoe UI", sans-serif';
                ctx.fillText('✕', layout.deleteX + layout.deleteW / 2, textY);

                // 拖动手柄 (多排点 grip dots 图标, 代表防滑/可拖拽)
                var dCx = layout.dragX + layout.dragW / 2;
                var dH = btnSize * 0.65;
                var dotR = 1.3;
                var dotCols = 2;
                var dotRows = 3;
                var colGap = 5;
                var rowGap = dH / (dotRows - 1);
                ctx.fillStyle = '#888';
                for (var dr = 0; dr < dotRows; dr++) {
                    for (var dc = 0; dc < dotCols; dc++) {
                        var dx = dCx + (dc - (dotCols - 1) / 2) * colGap;
                        var dy = textY + (dr - (dotRows - 1) / 2) * rowGap;
                        ctx.beginPath();
                        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            } else {
                // 全选 按钮 (图标: 双勾 ✓✓)
                if (layout.selX >= 0) {
                    ctx.fillStyle = 'rgba(78,205,196,0.15)';
                    ctx.fillRect(layout.selX, textY - btnSize/2, layout.selW, btnSize);
                    btnOverlay(layer, 'selectall', layout.selX, textY - btnSize/2, layout.selW, btnSize);
                    ctx.strokeStyle = '#4ecdc4';
                    ctx.lineWidth = 1.5;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    var cx = layout.selX + layout.selW / 2;
                    var cy = textY;
                    var s = btnSize * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(cx - s * 1.2, cy);
                    ctx.lineTo(cx - s * 0.5, cy + s * 0.7);
                    ctx.lineTo(cx + s * 0.2, cy - s * 0.8);
                    ctx.moveTo(cx + s * 0.3, cy);
                    ctx.lineTo(cx + s, cy + s * 0.7);
                    ctx.lineTo(cx + s * 1.7, cy - s * 0.8);
                    ctx.stroke();
                }

                // 拖动手柄 (≡ 图标, 长按拖动调整顺序)
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(layout.dragX, textY - btnSize/2, btnSize, btnSize);
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 1.2;
                ctx.lineCap = 'round';
                var _dragCx = layout.dragX + btnSize / 2;
                var _dragCy = textY;
                var _dragS = btnSize * 0.25;
                ctx.beginPath();
                ctx.moveTo(_dragCx - _dragS, _dragCy - _dragS * 0.7);
                ctx.lineTo(_dragCx + _dragS, _dragCy - _dragS * 0.7);
                ctx.moveTo(_dragCx - _dragS, _dragCy);
                ctx.lineTo(_dragCx + _dragS, _dragCy);
                ctx.moveTo(_dragCx - _dragS, _dragCy + _dragS * 0.7);
                ctx.lineTo(_dragCx + _dragS, _dragCy + _dragS * 0.7);
                ctx.stroke();

                // 更多按钮 (⋮): 点击展开 M/S/音量/删除 菜单
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(layout.moreX, textY - btnSize/2, btnSize, btnSize);
                ctx.fillStyle = '#aaa';
                ctx.font = 'bold ' + Math.max(8, btnSize) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⋮', layout.moreX + btnSize/2, textY + 1);
            }

            // 行分隔线
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y + cellH - 0.5);
            ctx.lineTo(pw, y + cellH - 0.5);
            ctx.stroke();
        }

        // 添加音轨按钮 (底部)
        var addTrackY = this.trackCount * cellH - this.scrollY + cfg.timelineHeight;
        var addBtnH = 24;
        if (addTrackY + addBtnH < h && this.trackCount > 0) {
            var addBtnW = Math.min(pw - 8, 100);
            var addBtnX = (pw - addBtnW) / 2;
            ctx.fillStyle = 'rgba(78,205,196,0.15)';
            ctx.fillRect(addBtnX, addTrackY + 4, addBtnW, addBtnH);
            btnOverlay(-1, 'addtrack', addBtnX, addTrackY + 4, addBtnW, addBtnH);
            ctx.strokeStyle = 'rgba(78,205,196,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(addBtnX, addTrackY + 4, addBtnW, addBtnH);
            ctx.fillStyle = '#4ecdc4';
            ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+ 添加音轨', addBtnX + addBtnW/2, addTrackY + 4 + addBtnH/2);
            this._addTrackBtnRect = { x: addBtnX, y: addTrackY + 4, w: addBtnW, h: addBtnH };
        } else {
            this._addTrackBtnRect = null;
        }

        // 拖拽排序视觉指示
        if (this._isDraggingTrack && this._draggedTrackLayer >= 0) {
            // 高亮被拖拽的轨道
            var dragY = this._layerToScreen(this._draggedTrackLayer);
            ctx.fillStyle = 'rgba(78,205,196,0.2)';
            ctx.fillRect(0, dragY, pw, cellH);
            ctx.strokeStyle = '#4ecdc4';
            ctx.lineWidth = 2;
            ctx.strokeRect(0.5, dragY + 0.5, pw - 1, cellH - 1);

            // 目标位置插入指示线
            if (this._dragTargetLayer >= 0 && this._dragTargetLayer !== this._draggedTrackLayer) {
                var targetY = this._layerToScreen(this._dragTargetLayer);
                // 如果向下拖, 指示线在目标行底部; 向上拖, 在目标行顶部
                var indicatorY = (this._dragTargetLayer > this._draggedTrackLayer) ? targetY + cellH : targetY;
                ctx.strokeStyle = '#e8a423';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, indicatorY - 1);
                ctx.lineTo(pw, indicatorY - 1);
                ctx.stroke();
            }
        }
    };

    // ============ 网格 ============
    PianoRoll.prototype._drawGrid = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom;
        var cellH = cfg.cellH * this.zoom;
        // 网格透明度 (0-1, 1=完全透明; 背景图片模式下可调低, 不影响音符)
        var gridAlpha = 1 - this.gridOpacity;

        var tickStart = Math.floor(this.scrollX / cellW);
        var tickEnd = Math.ceil((this.scrollX + w - pw) / cellW);

        // 计算有音轨的行范围 (垂直线只在此范围内绘制)
        // 考虑 scrollY: 音轨区域在屏幕上的实际位置
        var trackAreaTop = cfg.timelineHeight;
        var trackAreaBottom = cfg.timelineHeight + this.trackCount * cellH - this.scrollY;
        if (trackAreaTop < cfg.timelineHeight) trackAreaTop = cfg.timelineHeight;
        if (trackAreaBottom > h) trackAreaBottom = h;
        if (trackAreaBottom < trackAreaTop) trackAreaBottom = trackAreaTop;

        // 水平线 (layer 方向) - 先绘制, 用于行范围计算
        var layerStart = Math.floor(this.scrollY / cellH);
        var layerEnd = Math.ceil((this.scrollY + h - cfg.timelineHeight) / cellH);

        // 行交替背景: 一行暗一行亮 (在垂直线之前绘制作为底色)
        for (var layerBg = Math.max(0, layerStart); layerBg <= Math.min(this.trackCount - 1, layerEnd); layerBg++) {
            var yTop = this._layerToScreen(layerBg);
            if (yTop + cellH < cfg.timelineHeight || yTop > h) continue;
            // 偶数层 (0, 2, 4...) 较亮, 奇数层较暗; 应用网格透明度
            ctx.fillStyle = (layerBg % 2 === 0)
                ? 'rgba(255, 255, 255, ' + (0.025 * gridAlpha) + ')'
                : 'rgba(0, 0, 0, ' + (0.10 * gridAlpha) + ')';
            ctx.fillRect(pw, yTop, w - pw, cellH);
        }

        // 垂直线 (tick 方向) - 仅在有音轨的行范围内绘制
        // 性能优化: 按 beat/non-beat 分组, 用 2 次 stroke 代替 N 次
        if (this.trackCount > 0 && trackAreaBottom > trackAreaTop) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.06 * gridAlpha) + ')';
            ctx.beginPath();
            for (var tick = tickStart; tick <= tickEnd; tick++) {
                if (tick % 4 !== 0) continue;
                var xb = this._tickToScreen(tick);
                if (xb < pw || xb > w) continue;
                ctx.moveTo(xb, trackAreaTop);
                ctx.lineTo(xb, trackAreaBottom);
            }
            ctx.stroke();

            ctx.lineWidth = 0.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.03 * gridAlpha) + ')';
            ctx.beginPath();
            for (var tick2 = tickStart; tick2 <= tickEnd; tick2++) {
                if (tick2 % 4 === 0) continue;
                var x2 = this._tickToScreen(tick2);
                if (x2 < pw || x2 > w) continue;
                ctx.moveTo(x2, trackAreaTop);
                ctx.lineTo(x2, trackAreaBottom);
            }
            ctx.stroke();
        }

        // 水平线 (layer 方向) - 按 octave/non-octave 分组
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 * gridAlpha) + ')';
        ctx.beginPath();
        for (var layer = Math.max(0, layerStart); layer <= Math.min(this.trackCount - 1, layerEnd); layer++) {
            if (layer % 12 !== 0) continue;
            var yo = this._layerToScreen(layer);
            if (yo < cfg.timelineHeight || yo > h) continue;
            ctx.moveTo(pw, yo);
            ctx.lineTo(w, yo);
        }
        ctx.stroke();

        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.03 * gridAlpha) + ')';
        ctx.beginPath();
        for (var layer2 = Math.max(0, layerStart); layer2 <= Math.min(this.trackCount - 1, layerEnd); layer2++) {
            if (layer2 % 12 === 0) continue;
            var y2 = this._layerToScreen(layer2);
            if (y2 < cfg.timelineHeight || y2 > h) continue;
            ctx.moveTo(pw, y2);
            ctx.lineTo(w, y2);
        }
        ctx.stroke();
    };

    // ============ 音符渲染 ============
    PianoRoll.prototype._drawNotes = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom;
        var cellH = cfg.cellH * this.zoom;
        // 音符间隔 (左右内边距, 单位 px; 0-16)
        var notePad = Math.max(0, Math.min(16, this.notePadding || 0));
        var now = performance.now();

        // 拖动预览状态: 选中音符跟随鼠标渲染 (浮点平滑) + 目标格描边 (吸附格)
        // 注意: 只要正在拖动就渲染预览 (即使尚未跨格, 音符也应平滑跟随鼠标)
        var dragActive = !!(this._dragPreview && this._isDraggingNote);
        var dragDeltaTick = 0, dragDeltaLayer = 0;
        if (dragActive) {
            dragDeltaTick = this._dragPreview.previewTick - this._dragPreview.baseTick;
            dragDeltaLayer = this._dragPreview.previewLayer - this._dragPreview.baseLayer;
        }

        // 检查哪些音符正在动画中
        var animIds = {};
        for (var ai = 0; ai < this._noteAnims.length; ai++) {
            animIds[this._noteAnims[ai].id] = this._noteAnims[ai].type;
        }

        var animScale = this._getAnimationScale();
        var animNoteSet = null;
        if ((this._isAnimating || this._animHoldAtEnd) && this._animNoteIds) {
            animNoteSet = {};
            for (var an = 0; an < this._animNoteIds.length; an++) {
                animNoteSet[this._animNoteIds[an]] = true;
            }
        }

        // 性能优化: 使用空间索引只遍历可见 tick 范围内的音符
        // 信息栏透明时, 音符渲染范围延伸到屏幕左边缘 (在信息栏区域也继续渲染)
        var leftClip = this.trackPanelAlpha < 0.999 ? 0 : pw;
        if (this._noteIndexDirty) this._rebuildNoteIndex();
        var tickStart = Math.max(0, Math.floor((this.scrollX - pw + leftClip) / cellW));
        var tickEnd = Math.ceil((this.scrollX + w - pw) / cellW);
        var drawnSet = {};

        // 批量绘制优化: 按颜色分组, 减少 fillStyle 切换
        var colorBuckets = {};  // color -> [{note, drawX, drawW, ny, ...}]

        for (var tick = tickStart; tick <= tickEnd; tick++) {
            var bucket = this._notesByTick[tick];
            if (!bucket) continue;
            for (var bi = 0; bi < bucket.length; bi++) {
                var i = bucket[bi];
                if (drawnSet[i]) continue;
                drawnSet[i] = true;
                var note = this.notes[i];
                if (!note) continue;
                if (animIds[note.id]) continue;

                var isSelected = !!this.selectedNotes[note.id];

                // 拖动预览: 选中音符按浮点预览位置渲染 (抓取点贴着鼠标平滑跟随), 并轻微放大
                var drawTick = note.tick, drawLayer = note.layer;
                if (dragActive && isSelected) {
                    var dragStart = this._dragNoteStart[note.id];
                    if (dragStart) {
                        drawTick = Math.max(0, dragStart.tick + dragDeltaTick);
                        drawLayer = Math.max(0, Math.min(this.trackCount - 1, dragStart.layer + dragDeltaLayer));
                    }
                }

                var nx = this._tickToScreen(drawTick);
                var ny = this._layerToScreen(drawLayer);

                // 垂直裁剪: 背景模式时音符渲染到画布顶部边缘 (透过半透明时间栏可见),
                // 非背景模式时裁剪到时间栏底部 (时间栏会覆盖)
                var topClip = document.body.classList.contains('bg-active') ? 0 : cfg.timelineHeight;
                if (nx + cellW < leftClip || nx > w || ny + cellH < topClip || ny > h) continue;

                var color = this._getInstrumentColor(note.instrument);
                var pitchKey = (typeof note.key === 'number' && note.key >= 0) ? note.key : note.layer;
                var pitchLabel = pitchClassLabel(pitchKey);
                var isAnimatingLP = animNoteSet && animNoteSet[note.id];

                var scale = isAnimatingLP ? animScale : (dragActive && isSelected ? 1.15 : 1);
                var drawX = nx + notePad;
                var drawW = Math.max(2, cellW - notePad * 2);

                var highlightAlpha = 0;
                var hl = this._playHighlights[note.id];
                if (hl) {
                    var progress = Math.min(1, Math.max(0, (now - hl.startTime) / hl.duration));
                    highlightAlpha = (1 - progress) * 0.72;
                }

                // 按颜色分组
                if (!colorBuckets[color]) colorBuckets[color] = [];
                colorBuckets[color].push({
                    note: note, drawX: drawX, drawW: drawW, ny: ny,
                    isSelected: isSelected, pitchLabel: pitchLabel,
                    scale: scale, highlightAlpha: highlightAlpha
                });
            }
        }

        // 按颜色分组绘制, 减少 fillStyle/strokeStyle 状态切换
        var colors = Object.keys(colorBuckets);
        for (var ci = 0; ci < colors.length; ci++) {
            var color = colors[ci];
            var items = colorBuckets[color];
            for (var ii = 0; ii < items.length; ii++) {
                var item = items[ii];
                this._drawNoteBlock(ctx, item.drawX, item.ny, item.drawW, cellH, color,
                    item.isSelected, item.pitchLabel, item.note, item.scale, item.highlightAlpha);
            }
        }

        // 拖动预览: 描边显示所有选中音符的吸附目标格 (松手后会落在的格子)
        // 注意: 目标格使用整数 targetTick/targetLayer (鼠标所在格), 与音符的浮点预览位置分离
        if (dragActive) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 2;
            if (ctx.setLineDash) ctx.setLineDash([4, 3]);
            var pv2 = this._dragPreview;
            var tDeltaTick = pv2.targetTick - pv2.baseTick;
            var tDeltaLayer = pv2.targetLayer - pv2.baseLayer;
            var dragIds = Object.keys(this.selectedNotes);
            for (var di = 0; di < dragIds.length; di++) {
                var ds = this._dragNoteStart[dragIds[di]];
                if (!ds) continue;
                var dt = Math.max(0, ds.tick + tDeltaTick);
                var dl = Math.max(0, Math.min(this.trackCount - 1, ds.layer + tDeltaLayer));
                var tx = this._tickToScreen(dt);
                var ty = this._layerToScreen(dl);
                if (tx + cellW < leftClip || tx > w || ty + cellH < topClip || ty > h) continue;
                ctx.strokeRect(tx + 1, ty + 1, cellW - 2, cellH - 2);
            }
            ctx.restore();
        }
    };

    // 绘制动画中的音符 (放置/删除效果) - 使用 ease-out 缓动保证丝滑
    PianoRoll.prototype._drawAnimatedNotes = function() {
        var ctx = this.ctx;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellW = cfg.cellW * this.zoom;
        var cellH = cfg.cellH * this.zoom;

        // 缓动函数：cubic ease-out -> 1 - (1-t)^3
        function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }
        // 弹性回弹：用于放置动画末段轻微软回弹
        function easeOutBack(t) {
            var c1 = 1.70158;
            var c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }

        for (var i = 0; i < this._noteAnims.length; i++) {
            var anim = this._noteAnims[i];
            var rawProgress = Math.min(1, Math.max(0, (performance.now() - anim.startTime) / anim.duration));
            var nx = this._tickToScreen(anim.tick);
            var ny = this._layerToScreen(anim.layer);

            // 信息栏透明时, 动画音符同样延伸到屏幕左边缘
            var animLeftClip = this.trackPanelAlpha < 0.999 ? 0 : pw;
            // 垂直裁剪: 背景模式时延伸到画布顶部, 非背景模式时裁剪到时间栏
            var animTopClip = document.body.classList.contains('bg-active') ? 0 : cfg.timelineHeight;
            if (nx + cellW < animLeftClip || ny + cellH < animTopClip) continue;

            if (anim.type === 'delete-flash') {
                var dfEased = easeOutCubic(rawProgress);
                var dfAlpha = (1.0 - dfEased) * 0.6;
                ctx.save();
                ctx.globalAlpha = dfAlpha;
                ctx.fillStyle = '#e94560';
                ctx.fillRect(nx, ny, cellW, cellH);
                ctx.restore();
                continue;
            }

            var color = this._getInstrumentColor(anim.instrument);
            var animKey = (typeof anim.key === 'number' && anim.key >= 0) ? anim.key : anim.layer;
            var pitchLabel = pitchClassLabel(animKey);

            if (anim.type === 'place') {
                // 放置: 0.3 -> 1.08 (ease-out-back 末段轻微回弹) -> 1.0
                // 用两段：先放大到 1.08, 再回落到 1.0
                var pEased = easeOutBack(rawProgress);
                var pScale = 0.3 + 0.78 * pEased;
                // 末段补正
                if (rawProgress > 0.75) {
                    pScale = 1.0 - 0.05 * (1 - easeOutCubic((rawProgress - 0.75) / 0.25));
                }
                var pAlpha = easeOutCubic(rawProgress);
                this._drawNoteBlockAnim(ctx, nx, ny, cellW, cellH, color, pitchLabel, anim, pScale, pAlpha, false, animKey);
            } else if (anim.type === 'delete') {
                // 删除: 1.0 -> 1.25 (ease-out) + alpha 1.0 -> 0 (ease-in)
                var dEased = easeOutCubic(rawProgress);
                var dScale = 1.0 + 0.25 * dEased;
                var dAlpha = 1.0 - dEased;
                this._drawNoteBlockAnim(ctx, nx, ny, cellW, cellH, color, pitchLabel, anim, dScale, dAlpha, true, animKey);
            }
        }
    };

    // 绘制动画中的音符块
    PianoRoll.prototype._drawNoteBlockAnim = function(ctx, x, y, w, h, color, pitchLabel, anim, scale, alpha, isDelete, pitchKey) {
        ctx.save();
        ctx.globalAlpha = alpha;
        var cx = x + w / 2, cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        var pad = 1;
        var bx = x + pad, by = y + pad;
        var bw = w - pad * 2, bh = h - pad * 2;

        // 底色
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, bw, bh);

        // 纹理 (简化绘制, 避免 multiply 在低端设备上过于昂贵)
        if (this._noteBlockImg && this._noteBlockImg.complete && this._noteBlockImg.naturalWidth > 0) {
            ctx.globalAlpha = alpha * 0.4;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this._noteBlockImg, 0, 0,
                this._noteBlockImg.naturalWidth, this._noteBlockImg.naturalHeight,
                bx, by, bw, bh);
        }

        // 音高标签左上角
        ctx.globalAlpha = alpha;
        if (bw > 12) {
            var labelSize = Math.max(7, Math.min(bw * 0.35, 11));
            // 超出 Minecraft 标准音域 (33-57) 时, 文字显示为红色 (移除 shadow, 改用深色描边模拟可读性)
            var outOfRange = (typeof pitchKey === 'number') && (pitchKey < MINECRAFT_PITCH_MIN || pitchKey > MINECRAFT_PITCH_MAX);
            ctx.font = 'bold ' + labelSize + 'px "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            if (outOfRange) {
                // 深色描边代替 shadow (性能远优于 shadowBlur)
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 2;
                ctx.strokeText(pitchLabel, bx + 2, by + 2);
                ctx.fillStyle = '#ff5555';
            } else {
                ctx.fillStyle = '#ffffff';
            }
            ctx.fillText(pitchLabel, bx + 2, by + 2);
        }

        // 边框
        if (isDelete) {
            ctx.strokeStyle = 'rgba(233,69,96,' + alpha + ')';
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = 'rgba(0,0,0,' + (alpha * 0.5) + ')';
            ctx.lineWidth = 1;
        }
        ctx.strokeRect(bx, by, bw, bh);

        ctx.restore();
    };

    // 静音/独奏轨道叠加半透明黑色蒙版
    PianoRoll.prototype._drawMutedOverlays = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        var cfg = this._cfg;
        var pw = this._currentPanelWidth;
        var cellH = cfg.cellH * this.zoom;

        var layerStart = Math.floor(this.scrollY / cellH);
        var layerEnd = Math.ceil((this.scrollY + h - cfg.timelineHeight) / cellH);

        // Check if any track is soloed
        var hasSolo = false;
        for (var layer = 0; layer < this.trackCount; layer++) {
            var ti = this.getTrackInfo(layer);
            if (ti && ti.solo) { hasSolo = true; break; }
        }

        for (var layer = Math.max(0, layerStart); layer <= Math.min(this.trackCount - 1, layerEnd); layer++) {
            var trackInfo = this.getTrackInfo(layer);
            if (!trackInfo) continue;

            var shouldMute = false;
            if (hasSolo) {
                // Solo mode: mute all non-soloed tracks
                shouldMute = !trackInfo.solo;
            } else {
                // Normal mode: mute only muted tracks
                shouldMute = trackInfo.muted;
            }

            if (!shouldMute) continue;

            var y = this._layerToScreen(layer);
            if (y + cellH < cfg.timelineHeight || y > h) continue;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(pw, y, w - pw, cellH);
        }
    };

    // 绘制 2D 音符盒 (填充整个网格单元)
    PianoRoll.prototype._drawNoteBlock = function(ctx, x, y, w, h, color, isSelected, pitchLabel, note, scale, highlightAlpha) {
        var cfg = this._cfg;
        var cx = x + w / 2, cy = y + h / 2;

        ctx.save();
        if (scale !== 1) {
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
        }

        // 音量透明度 (音符不受背景透明度影响, 仅由音量决定)
        var velAlpha = this._velocityToOpacity(note.velocity);
        if (velAlpha < 1) ctx.globalAlpha = velAlpha;

        // 音符盒填充整个网格单元 (留1px边距防止重叠)
        var pad = 1;
        var bx = x + pad, by = y + pad;
        var bw = w - pad * 2, bh = h - pad * 2;

        // 底色 (乐器颜色)
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, bw, bh);

        // 叠加 note block sprite 纹理 (仅一次绘制, 避免 multiply 操作在低端设备上过于昂贵)
        if (this._noteBlockImg && this._noteBlockImg.complete && this._noteBlockImg.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this._noteBlockImg, 0, 0,
                this._noteBlockImg.naturalWidth, this._noteBlockImg.naturalHeight,
                bx, by, bw, bh);
            ctx.restore();
        }

        // 乐器图标 (右下角): 自定义音色无贴图, 用其颜色绘制小方块
        var instImg = this._instrumentImages[note.instrument];
        if (bw > 14) {
            var iconSize = Math.max(6, Math.min(bw * 0.3, 12));
            var ix = bx + bw - iconSize - 2;
            var iy = by + bh - iconSize - 2;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 0.9;
            // 半透明白底
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(ix - 1, iy - 1, iconSize + 2, iconSize + 2);
            if ((typeof note.instrument === 'number' && note.instrument >= 20) || !(instImg && instImg.complete && instImg.naturalWidth > 0)) {
                // 自定义音色 / 图标缺失: 纯色方块
                ctx.fillStyle = this._getInstrumentColor(note.instrument);
                ctx.fillRect(ix, iy, iconSize, iconSize);
            } else {
                ctx.drawImage(instImg, 0, 0, instImg.naturalWidth, instImg.naturalHeight, ix, iy, iconSize, iconSize);
            }
            ctx.restore();
        }

        // 音高标签 (白色字体，左上角)
        if (bw > 12) {
            var labelSize = Math.max(7, Math.min(bw * 0.35, 11));
            // 超出 Minecraft 标准音域 (33-57) 时, 文字显示为红色 (移除 shadow, 改用深色描边)
            var pitchKeyNum = (typeof note.key === 'number') ? note.key : note.layer;
            var outOfRange = pitchKeyNum < MINECRAFT_PITCH_MIN || pitchKeyNum > MINECRAFT_PITCH_MAX;
            ctx.font = 'bold ' + labelSize + 'px "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            if (outOfRange) {
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 2;
                ctx.strokeText(pitchLabel, bx + 2, by + 2);
                ctx.fillStyle = '#ff5555';
            } else {
                ctx.fillStyle = '#ffffff';
            }
            ctx.fillText(pitchLabel, bx + 2, by + 2);
        }

        // 方块名 (音符底部) — 独立开关
        if (noteBlockEnabled && bw > 18) {
            var blkName = NOTE_BLOCK_NAMES[note.instrument] || '';
            if (blkName) {
                var blkSize = Math.max(7, Math.min(bw * 0.28, 10));
                ctx.font = blkSize + 'px "Segoe UI", sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillText(blkName, bx + 2, by + bh - 2);
            }
        }

        // 点击次数 (音符右上角) — 独立开关
        if (noteClicksEnabled && bw > 16) {
            var clickText = '' + noteBlockClicks(pitchKeyNum);
            var clkSize = Math.max(7, Math.min(bw * 0.28, 10));
            ctx.font = clkSize + 'px "Segoe UI", sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillText(clickText, bx + bw - 2, by + 2);
        }

        // 播放高亮：白色叠加，快速淡入淡出
        if (highlightAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = highlightAlpha;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx, by, bw, bh);
            ctx.restore();
        }

        // 黑色边框
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);

        // 选中高亮
        if (isSelected) {
            ctx.strokeStyle = cfg.selectionBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
        }

        ctx.restore();
    };

    // 绘制圆角矩形路径
    PianoRoll.prototype._roundRect = function(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    };

    // 框选音符
    PianoRoll.prototype._selectNotesInRect = function(rect) {
        this.selectedNotes = {};
        if (!rect) return [];
        var sx = Math.min(rect.x1, rect.x2), ex = Math.max(rect.x1, rect.x2);
        var sy = Math.min(rect.y1, rect.y2), ey = Math.max(rect.y1, rect.y2);
        var cfg = this._cfg;
        var cellW = cfg.cellW * this.zoom, cellH = cfg.cellH * this.zoom;
        for (var i = 0; i < this.notes.length; i++) {
            var note = this.notes[i];
            var nx = this._tickToScreen(note.tick), ny = this._layerToScreen(note.layer);
            if (nx + cellW >= sx && nx <= ex && ny + cellH >= sy && ny <= ey) {
                this.selectedNotes[note.id] = true;
            }
        }
        return Object.keys(this.selectedNotes);
    };

    // 切换音调标签八度数字显示 (主界面设置项同步)
    PianoRoll.prototype.setOctaveLabelSetting = function(enabled) {
        octaveLabelEnabled = !!enabled;
    };

    // 切换音符上额外信息显示 (点击次数 / 方块名, 两个独立开关, 主界面设置项同步)
    PianoRoll.prototype.setNoteExtraEnabled = function(clicksEnabled, blockEnabled) {
        noteClicksEnabled = !!clicksEnabled;
        noteBlockEnabled = !!blockEnabled;
        this._fullRedrawNeeded = true;
        this.render();
    };

    // 导出
    window.PianoRoll = PianoRoll;
    window.NOTE_COLORS = INSTRUMENT_COLORS;
    window.PITCH_LABELS = PITCH_LABELS;
})();
