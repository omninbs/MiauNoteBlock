/* 10-assist.js — MiauNoteBlock 功能模块
   来源: 原 main.js L4932-L5366; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function applyArpeggioTracks() { return N.applyArpeggioTracks.apply(this, arguments); }
    function applyClearSustain() { return N.applyClearSustain.apply(this, arguments); }
    function applyPitchShift() { return N.applyPitchShift.apply(this, arguments); }
    function applySustainFill() { return N.applySustainFill.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function openFindPanel() { return N.openFindPanel.apply(this, arguments); }
    function showSustainFillAlert() { return N.showSustainFillAlert.apply(this, arguments); }


    // ============ 创作辅助悬浮窗 ============
    var ASSIST_STORAGE_KEY = 'noteblock.assistConfig.v1';
    var assistConfig = null;

    function defaultAssistConfig() {
        return {
            brush: {
                mode: 'normal',
                normal: { velocity: 100 },
                sustain: { preview: true, length: 5, overlap: 'overwrite', gap: 0, fade: false, minVel: 10, ease: 'linear' }
            },
            eraser: {
                mode: 'single',
                area: { radius: 3, shape: 'circle' },
                chain: { sim: { instrument: false, key: false, velocity: false }, limit: 64 }
            }
        };
    }

    function loadAssistConfig() {
        var cfg = defaultAssistConfig();
        try {
            var raw = localStorage.getItem(ASSIST_STORAGE_KEY);
            if (!raw) return cfg;
            var saved = JSON.parse(raw);
            if (saved && saved.brush) {
                var b = cfg.brush;
                if (saved.brush.mode === 'normal' || saved.brush.mode === 'sustain') b.mode = saved.brush.mode;
                if (saved.brush.normal && typeof saved.brush.normal.velocity === 'number') b.normal.velocity = clampNum(saved.brush.normal.velocity, 1, 100, 100);
                if (saved.brush.sustain) {
                    for (var k in b.sustain) {
                        if (saved.brush.sustain[k] !== undefined) b.sustain[k] = saved.brush.sustain[k];
                    }
                }
            }
            if (saved && saved.eraser) {
                var e = cfg.eraser;
                if (saved.eraser.mode === 'single' || saved.eraser.mode === 'area' || saved.eraser.mode === 'chain') e.mode = saved.eraser.mode;
                if (saved.eraser.area) {
                    if (typeof saved.eraser.area.radius === 'number') e.area.radius = clampNum(saved.eraser.area.radius, 0, 32, 3);
                    if (saved.eraser.area.shape === 'circle' || saved.eraser.area.shape === 'square') e.area.shape = saved.eraser.area.shape;
                }
                if (saved.eraser.chain) {
                    if (saved.eraser.chain.sim) {
                        for (var sk in e.chain.sim) {
                            if (saved.eraser.chain.sim[sk] !== undefined) e.chain.sim[sk] = !!saved.eraser.chain.sim[sk];
                        }
                    }
                    if (typeof saved.eraser.chain.limit === 'number') e.chain.limit = clampNum(saved.eraser.chain.limit, 1, 1024, 64);
                }
            }
        } catch(e) { /* 忽略损坏配置 */ }
        return cfg;
    }

    function clampNum(v, min, max, fb) {
        if (typeof v !== 'number' || isNaN(v)) v = fb;
        return Math.max(min, Math.min(max, Math.round(v)));
    }

    function saveAssistConfig() {
        try { localStorage.setItem(ASSIST_STORAGE_KEY, JSON.stringify(assistConfig)); } catch(e) {}
        pushAssistConfig();
    }

    function pushAssistConfig() {
        if (state.pianoRoll && state.pianoRoll.setAssistConfig) {
            state.pianoRoll.setAssistConfig(assistConfig);
        }
    }

    function assistPanelVisible() {
        var panel = $('assist-panel');
        return panel && panel.style.display !== 'none';
    }

    function updateAssistPanelForTool() {
        var tool = state.pianoRoll ? state.pianoRoll.currentTool : 'default';
        var brushSec = $('assist-section-brush');
        var eraserSec = $('assist-section-eraser');
        var selectSec = $('assist-section-select');
        var emptySec = $('assist-section-empty');
        if (brushSec) brushSec.style.display = (tool === 'brush' || tool === 'default') ? '' : 'none';
        if (eraserSec) eraserSec.style.display = tool === 'eraser' ? '' : 'none';
        if (selectSec) selectSec.style.display = tool === 'select' ? '' : 'none';
        if (emptySec) emptySec.style.display = (tool === 'performance') ? '' : 'none';
    }

    function positionAssistPanel() {
        var panel = $('assist-panel');
        var btn = $('btn-assist');
        if (!panel || !btn) return;
        // 每次打开都定位在按钮下方 (不持久化位置, 避免拖出屏幕外无法恢复)
        var pw = panel.offsetWidth || 300;
        var rect = btn.getBoundingClientRect();
        var x = Math.max(8, rect.right - pw);
        var y = rect.bottom + 8;
        x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - 60));
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    }

    function openAssistPanel() {
        var panel = $('assist-panel');
        if (!panel) return;
        updateAssistPanelForTool();
        syncAssistPanelUI();
        positionAssistPanel();
        panel.style.display = 'flex';
        panel.setAttribute('aria-hidden', 'false');
        var btn = $('btn-assist');
        if (btn) btn.classList.add('active');
    }

    function closeAssistPanel() {
        var panel = $('assist-panel');
        if (!panel) return;
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
        var btn = $('btn-assist');
        if (btn) btn.classList.remove('active');
        // 关闭时兜底保存 (数字输入可能在未失焦时被点击旁处关闭)
        saveAssistConfig();
    }

    function toggleAssistPanel() {
        if (assistPanelVisible()) closeAssistPanel();
        else openAssistPanel();
    }

    function setAssistToggle(id, on) {
        var el = $(id);
        if (!el) return;
        el.classList.toggle('active', !!on);
        el.textContent = on ? '开' : '关';
    }

    function setAssistSegActive(containerId, target) {
        var container = $(containerId);
        if (!container) return;
        var btns = container.querySelectorAll('.assist-seg-btn');
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        if (target) target.classList.add('active');
    }

    function syncAssistTabBodies(sectionId, activeTab) {
        var section = $(sectionId);
        if (!section) return;
        var tabs = section.querySelectorAll('.assist-tab');
        var bodies = section.querySelectorAll('.assist-tab-body');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-assist-tab') === activeTab);
        }
        for (var j = 0; j < bodies.length; j++) {
            bodies[j].style.display = (bodies[j].id === 'assist-tab-' + activeTab) ? '' : 'none';
        }
    }

    // 读取 DOM 数值输入并回写配置 (min/max 夹取)
    function bindAssistNumber(id, getSetter, min, max, fb) {
        var el = $(id);
        if (!el) return;
        function read() {
            var v = parseInt(el.value, 10);
            if (isNaN(v)) v = fb;
            v = Math.max(min, Math.min(max, v));
            el.value = v;
            return v;
        }
        el.addEventListener('input', function() {
            getSetter(read());
            pushAssistConfig();
        });
        el.addEventListener('change', function() {
            getSetter(read());
            saveAssistConfig();
        });
    }

    function syncAssistPanelUI() {
        if (!assistConfig) return;
        var b = assistConfig.brush, e = assistConfig.eraser;
        var nv = $('assist-normal-velocity');
        if (nv) nv.value = b.normal.velocity;
        var sl = $('assist-sustain-length');
        if (sl) sl.value = b.sustain.length;
        var sg = $('assist-sustain-gap');
        if (sg) sg.value = b.sustain.gap;
        var sm = $('assist-sustain-minvel');
        if (sm) sm.value = b.sustain.minVel;
        var ar = $('assist-area-radius');
        if (ar) ar.value = e.area.radius;
        var cl = $('assist-chain-limit');
        if (cl) cl.value = e.chain.limit;
        setAssistToggle('assist-sustain-preview', b.sustain.preview);
        setAssistToggle('assist-sustain-fade', b.sustain.fade);
        syncAssistTabBodies('assist-section-brush', b.mode === 'sustain' ? 'sustain' : 'normal');
        syncAssistTabBodies('assist-section-eraser', e.mode === 'chain' ? 'chain' : (e.mode === 'area' ? 'area' : 'single'));
        var owBtn = document.querySelector('#assist-overwrite-seg .assist-seg-btn[data-assist-overwrite="' + b.sustain.overlap + '"]');
        setAssistSegActive('assist-overwrite-seg', owBtn);
        var easeBtn = document.querySelector('#assist-ease-seg .assist-seg-btn[data-assist-ease="' + b.sustain.ease + '"]');
        setAssistSegActive('assist-ease-seg', easeBtn);
        var shapeBtn = document.querySelector('#assist-area-shape-seg .assist-seg-btn[data-assist-shape="' + e.area.shape + '"]');
        setAssistSegActive('assist-area-shape-seg', shapeBtn);
        var simBtns = document.querySelectorAll('#assist-chain-similar-seg .assist-seg-btn');
        for (var i = 0; i < simBtns.length; i++) {
            var attr = simBtns[i].getAttribute('data-assist-similar');
            simBtns[i].classList.toggle('active', !!e.chain.sim[attr]);
        }
        var shrinkRow = $('assist-shrink-gap-row');
        if (shrinkRow) shrinkRow.style.display = b.sustain.overlap === 'shrink' ? '' : 'none';
        var fadeOpts = $('assist-fade-options');
        if (fadeOpts) fadeOpts.style.display = b.sustain.fade ? '' : 'none';
    }

    function initAssistDrag() {
        var header = $('assist-panel-header');
        var panel = $('assist-panel');
        if (!header || !panel) return;
        function isCloseTarget(t) {
            return t && (t.id === 'assist-panel-close' || (t.closest && t.closest('.assist-panel-close')));
        }
        header.addEventListener('mousedown', function(e) {
            if (isCloseTarget(e.target)) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var origX = panel.offsetLeft, origY = panel.offsetTop;
            function onMove(ev) {
                panel.style.left = Math.max(0, origX + ev.clientX - startX) + 'px';
                panel.style.top = Math.max(0, origY + ev.clientY - startY) + 'px';
            }
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
            var startX = t.clientX, startY = t.clientY;
            var origX = panel.offsetLeft, origY = panel.offsetTop;
            function onMove(ev) {
                var mt = ev.touches[0];
                if (!mt) return;
                panel.style.left = Math.max(0, origX + mt.clientX - startX) + 'px';
                panel.style.top = Math.max(0, origY + mt.clientY - startY) + 'px';
            }
            function onUp() {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
            }
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onUp);
        });
    }

    function initCreativeAssist() {
        assistConfig = loadAssistConfig();
        pushAssistConfig();

        var btn = $('btn-assist');
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleAssistPanel();
            });
        }
        var closeBtn = $('assist-panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeAssistPanel();
            });
        }
        // 查找按钮 (选择工具悬浮窗内)
        var findBtn = $('assist-find-btn');
        if (findBtn) {
            findBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeAssistPanel();
                if (findPanelVisible()) closeFindPanel();
                else openFindPanel();
            });
        }

        // 选择工具: 延音填充
        var sfBtn = $('assist-apply-sustain-fill');
        if (sfBtn) {
            sfBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var selected = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
                if (!selected || selected.length < 2) {
                    showSustainFillAlert('请先在钢琴卷帘上选择至少 2 个音符再使用延音填充。', '延音填充');
                    return;
                }
                var interval = parseInt($('assist-sustain-interval').value);
                if (isNaN(interval) || interval < 0) interval = 0;
                if (interval > 16) interval = 16;
                applySustainFill(interval);
            });
        }

        // 选择工具: 清除延音
        var csBtn = $('assist-apply-clear-sustain');
        if (csBtn) {
            csBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var selected = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
                if (!selected || selected.length === 0) {
                    showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用清除延音。', '清除延音');
                    return;
                }
                var gap = parseInt($('assist-clear-sustain-gap').value);
                if (isNaN(gap) || gap < 0) gap = 0;
                if (gap > 16) gap = 16;
                applyClearSustain(gap);
            });
        }

        // 选择工具: 音调偏移
        var psBtn = $('assist-apply-pitch-shift');
        if (psBtn) {
            psBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var selected = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
                if (!selected || selected.length === 0) {
                    showSustainFillAlert('请先选择要偏移的音符', '音调偏移');
                    return;
                }
                var mode = $('assist-pitch-shift-mode').value;
                var value = parseInt($('assist-pitch-shift-value').value) || 0;
                applyPitchShift(mode, value);
            });
        }

        // 选择工具: 上下起伏
        var arBtn = $('assist-apply-arpeggio');
        if (arBtn) {
            arBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var selected = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
                if (!selected || selected.length === 0) {
                    showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用上下起伏。', '上下起伏');
                    return;
                }
                var pattern = $('assist-arpeggio-pattern').value;
                applyArpeggioTracks(pattern);
            });
        }

        // Tab 切换 = 模式开关
        var tabs = document.querySelectorAll('.assist-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function(e) {
                e.stopPropagation();
                var name = this.getAttribute('data-assist-tab');
                var section = this.closest('.assist-section');
                if (!section) return;
                if (section.id === 'assist-section-brush') {
                    assistConfig.brush.mode = name === 'sustain' ? 'sustain' : 'normal';
                } else if (section.id === 'assist-section-eraser') {
                    if (name === 'chain') assistConfig.eraser.mode = 'chain';
                    else if (name === 'area') assistConfig.eraser.mode = 'area';
                    else assistConfig.eraser.mode = 'single';
                }
                saveAssistConfig();
                syncAssistPanelUI();
            });
        }

        // Toggle 开关
        var toggles = document.querySelectorAll('.assist-toggle');
        for (var j = 0; j < toggles.length; j++) {
            toggles[j].addEventListener('click', function(e) {
                e.stopPropagation();
                var on = !this.classList.contains('active');
                if (this.id === 'assist-sustain-preview') {
                    assistConfig.brush.sustain.preview = on;
                } else if (this.id === 'assist-sustain-fade') {
                    assistConfig.brush.sustain.fade = on;
                }
                saveAssistConfig();
                syncAssistPanelUI();
            });
        }

        // 分段单选组
        function bindSeg(containerId, attrName, apply) {
            var container = $(containerId);
            if (!container) return;
            var btns = container.querySelectorAll('.assist-seg-btn');
            for (var k = 0; k < btns.length; k++) {
                btns[k].addEventListener('click', function(e) {
                    e.stopPropagation();
                    var val = this.getAttribute(attrName);
                    setAssistSegActive(containerId, this);
                    apply(val);
                    saveAssistConfig();
                    syncAssistPanelUI();
                });
            }
        }
        bindSeg('assist-overwrite-seg', 'data-assist-overwrite', function(v) { assistConfig.brush.sustain.overlap = v; });
        bindSeg('assist-ease-seg', 'data-assist-ease', function(v) { assistConfig.brush.sustain.ease = v; });
        bindSeg('assist-area-shape-seg', 'data-assist-shape', function(v) { assistConfig.eraser.area.shape = v; });

        // 同类判定 (多选)
        var simBtns = document.querySelectorAll('#assist-chain-similar-seg .assist-seg-btn');
        for (var s = 0; s < simBtns.length; s++) {
            simBtns[s].addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('active');
                var attr = this.getAttribute('data-assist-similar');
                assistConfig.eraser.chain.sim[attr] = this.classList.contains('active');
                saveAssistConfig();
            });
        }

        // 数值输入
        bindAssistNumber('assist-normal-velocity', function(v) { assistConfig.brush.normal.velocity = v; }, 1, 100, 100);
        bindAssistNumber('assist-sustain-length', function(v) { assistConfig.brush.sustain.length = v; }, 0, 64, 5);
        bindAssistNumber('assist-sustain-gap', function(v) { assistConfig.brush.sustain.gap = v; }, 0, 64, 0);
        bindAssistNumber('assist-sustain-minvel', function(v) { assistConfig.brush.sustain.minVel = v; }, 1, 100, 10);
        bindAssistNumber('assist-area-radius', function(v) { assistConfig.eraser.area.radius = v; }, 0, 32, 3);
        bindAssistNumber('assist-chain-limit', function(v) { assistConfig.eraser.chain.limit = v; }, 1, 1024, 64);

        initAssistDrag();
        syncAssistPanelUI();
    }

    // ---- 导出 ----
    N.defaultAssistConfig = defaultAssistConfig;
    N.loadAssistConfig = loadAssistConfig;
    N.clampNum = clampNum;
    N.saveAssistConfig = saveAssistConfig;
    N.pushAssistConfig = pushAssistConfig;
    N.assistPanelVisible = assistPanelVisible;
    N.updateAssistPanelForTool = updateAssistPanelForTool;
    N.positionAssistPanel = positionAssistPanel;
    N.openAssistPanel = openAssistPanel;
    N.closeAssistPanel = closeAssistPanel;
    N.toggleAssistPanel = toggleAssistPanel;
    N.setAssistToggle = setAssistToggle;
    N.setAssistSegActive = setAssistSegActive;
    N.syncAssistTabBodies = syncAssistTabBodies;
    N.bindAssistNumber = bindAssistNumber;
    N.syncAssistPanelUI = syncAssistPanelUI;
    N.initAssistDrag = initAssistDrag;
    N.initCreativeAssist = initCreativeAssist;
    N.ASSIST_STORAGE_KEY = ASSIST_STORAGE_KEY;
    N.assistConfig = assistConfig;
})(window.WebNBS);
