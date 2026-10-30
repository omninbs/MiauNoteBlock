/* 20-mobile.js — MiauNoteBlock 功能模块
   来源: 原 main.js L9930-L10376; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function openFindPanel() { return N.openFindPanel.apply(this, arguments); }
    function handlePasteOrSystemClipboard() { return N.handlePasteOrSystemClipboard.apply(this, arguments); }
    function showMidiNotice() { return N.showMidiNotice.apply(this, arguments); }
    function handleContextAction() { return N.handleContextAction.apply(this, arguments); }
    function switchTool() { return N.switchTool.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function restartPlayback() { return N.restartPlayback.apply(this, arguments); }

    function createLandscapeDrawerDOM() {
        var btn = $('landscape-menu-btn');
        var drawer = $('landscape-drawer');
        var closeBtn = $('landscape-drawer-close');
        var mask = $('landscape-drawer-mask');
        var body = $('landscape-drawer-body');
        if (!btn || !drawer || !body) return;

        // 把主工具栏的所有按钮克隆到抽屉
        var toolbar = $('toolbar');
        if (toolbar) {
            var sections = toolbar.querySelectorAll('.toolbar-section');
            sections.forEach(function(section) {
                var clone = section.cloneNode(true);
                // 给按钮添加文字标签 (如果只有图标)
                clone.querySelectorAll('.toolbar-btn').forEach(function(b) {
                    var icon = b.querySelector('i');
                    if (icon && !b.querySelector('.label')) {
                        var labelText = b.title || b.id || '';
                        if (labelText && b.id !== 'btn-toolbar-more') {
                            var label = document.createElement('span');
                            label.className = 'label';
                            label.textContent = labelText;
                            b.appendChild(label);
                        }
                    }
                    // 绑定事件 - 通过 id 触发原按钮
                    var origId = b.id;
                    if (origId) {
                        b.addEventListener('click', function(e) {
                            // 关闭抽屉, 触发原按钮点击
                            closeLandscapeDrawer();
                            var orig = $(origId);
                            if (orig) orig.click();
                        });
                    }
                });
                body.appendChild(clone);
            });
        }

        // 附加: 查找音符入口 (顶栏无对应按钮, 手动添加)
        if (body && !body.querySelector('[data-landscape-find]')) {
            var findEntry = document.createElement('button');
            findEntry.setAttribute('data-landscape-find', '1');
            findEntry.className = 'toolbar-btn drawer-find-entry';
            findEntry.title = '查找音符 (Ctrl+F)';
            findEntry.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
            findEntry.innerHTML = '<i class="fa-solid fa-magnifying-glass icon"></i><span class="label">查找音符</span>';
            findEntry.addEventListener('click', function() {
                closeLandscapeDrawer();
                if (findPanelVisible()) closeFindPanel();
                else openFindPanel();
            });
            body.appendChild(findEntry);
        }

        // 打开抽屉
        btn.addEventListener('click', function() {
            drawer.classList.add('visible');
            mask.classList.add('visible');
            drawer.setAttribute('aria-hidden', 'false');
        });

        // 关闭抽屉
        function closeLandscapeDrawer() {
            drawer.classList.remove('visible');
            mask.classList.remove('visible');
            drawer.setAttribute('aria-hidden', 'true');
        }
        if (closeBtn) closeBtn.addEventListener('click', closeLandscapeDrawer);
        if (mask) mask.addEventListener('click', closeLandscapeDrawer);

        // ESC 关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && drawer.classList.contains('visible')) {
                closeLandscapeDrawer();
            }
        });
    }

    // ============ 移动端底部浮动操作按钮 (FAB) ============
    function createMobileFabBar() {
        var pr = state.pianoRoll;
        if (!pr) return;

        // 取消选择（仅移动端）
        var btnDeselect = $('mobile-fab-deselect');
        if (btnDeselect) {
            btnDeselect.addEventListener('click', function() {
                if (state.pianoRoll) state.pianoRoll.clearSelection();
            });
        }

        // 全选
        var btnSelectAll = $('fab-select-all');
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', function() {
                if (state.pianoRoll) state.pianoRoll.selectAll();
            });
        }

        // 复制
        var btnCopy = $('fab-copy');
        if (btnCopy) {
            btnCopy.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.copySelected();
                state.clipboard = state.pianoRoll.clipboard;
            });
        }

        // 剪切
        var btnCut = $('fab-cut');
        if (btnCut) {
            btnCut.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.copySelected();
                state.clipboard = state.pianoRoll.clipboard;
                state.pianoRoll.deleteSelected();
                state.notes = state.pianoRoll.getNotes();
            });
        }

        // 删除
        var btnDelete = $('fab-delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.deleteSelected();
                state.notes = state.pianoRoll.getNotes();
            });
        }

        // ========== 竖屏模式: 单个悬浮按钮 + 右键菜单 ==========
        var fabSingle = $('mobile-fab-single');
        var fabMenu = $('fab-context-menu');
        if (fabSingle && fabMenu) {
            function setFabMenuVisible(visible) {
                fabMenu.classList.toggle('visible', !!visible);
                fabMenu.style.display = visible ? 'block' : 'none';
                if (visible) {
                    var fabRect = fabSingle.getBoundingClientRect();
                    window.WebNBSPositionFlyout(fabMenu, fabRect, { placement: 'top-end', gap: 10 });
                }
            }
            fabSingle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                setFabMenuVisible(!fabMenu.classList.contains('visible'));
            });

            // 点击菜单项
            var fabItems = fabMenu.querySelectorAll('.fab-context-menu-item');
            for (var fi = 0; fi < fabItems.length; fi++) {
                (function(item) {
                    item.addEventListener('click', function() {
                        var action = item.getAttribute('data-action');
                        setFabMenuVisible(false);
                        if (!state.pianoRoll) return;
                        if (action === 'select-all') {
                            state.pianoRoll.selectAll();
                        } else if (action === 'copy') {
                            state.pianoRoll.copySelected();
                            state.clipboard = state.pianoRoll.clipboard;
                        } else if (action === 'cut') {
                            state.pianoRoll.copySelected();
                            state.clipboard = state.pianoRoll.clipboard;
                            state.pianoRoll.deleteSelected();
                            state.notes = state.pianoRoll.getNotes();
                        } else if (action === 'delete') {
                            state.pianoRoll.deleteSelected();
                            state.notes = state.pianoRoll.getNotes();
                        } else if (action === 'paste') {
                            if (!state.pianoRoll) return;
                            // 以画布中心为粘贴目标 (需使用画布相对坐标, 不能用 window 坐标)
                            var prRect = state.pianoRoll.canvas.getBoundingClientRect();
                            var tick = state.pianoRoll._screenToTick(prRect.width / 2);
                            var layer = state.pianoRoll._screenToLayer(prRect.height / 2);
                            handlePasteOrSystemClipboard(tick, layer);
                        } else if (action === 'change-instrument' || action === 'change-volume') {
                            // 复用桌面右键菜单的处理函数 (需要先设置 state.contextMenuTarget)
                            var selectedIds = state.pianoRoll.getSelectedNoteIds ? state.pianoRoll.getSelectedNoteIds() : [];
                            if (selectedIds.length === 0) {
                                showMidiNotice('请先选择音符', 'info');
                                return;
                            }
                            state.contextMenuTarget = selectedIds;
                            // FAB 菜单项位置作为子菜单弹出参考点
                            var fabRect = item.getBoundingClientRect();
                            handleContextAction(action, fabRect.left, fabRect.top);
                        }
                    });
                })(fabItems[fi]);
            }

            // 点击外部关闭菜单
            document.addEventListener('click', function(e) {
                if (fabMenu.classList.contains('visible') && !fabMenu.contains(e.target) && e.target !== fabSingle) {
                    setFabMenuVisible(false);
                }
            });
        }
    }

    // ============ 移动端工具切换器 ============
    // 触控屏设备 (含手机/平板/大屏触控屏) 显示:
    //   折叠态 = 单个圆形按钮 (60% 透明度) 显示当前工具图标;
    //   点击后向左展开完整 5 工具栏; 点击工具栏里的工具即切换, 但保持展开;
    //   点击工具栏以外的位置时关闭, 并拦截(吞掉)这一次交互, 避免误触到下方画布。
    function initMobileToolSwitcher() {
        var sw = $('mobile-tool-switcher');
        if (!sw) return;
        var trigger = $('mobile-tool-trigger');
        var bar = $('mobile-tool-bar');
        if (!trigger || !bar) return;

        var TOOL_ICONS = {
            'default': 'fa-arrow-pointer',
            'select': 'fa-vector-square',
            'eraser': 'fa-eraser',
            'brush': 'fa-paintbrush',
            'performance': 'fa-music'
        };
        var open = false;

        function currentTool() {
            return (state.pianoRoll && state.pianoRoll.currentTool) || 'default';
        }

        // 让触发按钮上的图标始终与当前工具保持一致
        function syncTriggerIcon() {
            var icon = TOOL_ICONS[currentTool()] || 'fa-arrow-pointer';
            var ic = trigger.querySelector('i');
            if (ic) ic.className = 'fa-solid ' + icon;
        }

        function setOpen(visible) {
            if (open === visible) return;
            open = visible;
            sw.classList.toggle('open', visible);
            if (visible) syncTriggerIcon();
        }

        // 点击折叠按钮: 展开 / 收起
        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            syncTriggerIcon();
            setOpen(!open);
        });

        // 点击工具栏中的某个工具: 只切换工具, 不收起 (点击栏外才收起)
        bar.addEventListener('click', function(e) {
            var btn = e.target.closest ? e.target.closest('.tool-btn') : null;
            if (btn && btn.getAttribute('data-tool')) {
                var tool = btn.getAttribute('data-tool');
                if (tool && state.pianoRoll) switchTool(tool);
                syncTriggerIcon(); // 折叠按钮图标立即跟随新选中的工具
            }
        });

        // 展开状态下, 点击工具条以外的任意位置: 关闭并拦截这一次交互,
        // 使该次点击不会落到下方的钢琴卷帘(不会误放/误选音符)。
        // 一次物理点击会依次派发 pointerdown → touchstart/mousedown → click 等多个事件,
        // 因此用一个短时间窗把"关闭栏的那一次点击"相关联的事件全部拦住。
        // 例外: 画笔/橡皮工具下, 若手指落在编辑区, 收起工具栏但【不拦截】——
        // 这次触摸的本意就是放置/删除音符, 拦截会让"滑动绘制"的第一笔失效。
        var swallowTs = 0;
        var outsideSwallow = function(e) {
            var now = (e.timeStamp != null ? e.timeStamp : Date.now());
            if (open && !sw.contains(e.target)) {
                open = false;
                sw.classList.remove('open');
                var swallowThis = true;
                try {
                    // 仅当是画笔/橡皮工具且触摸起点在编辑区 (x >= 面板宽, y >= 时间轴高) 时不拦截
                    // pointerdown 无 touches, 但 PointerEvent/MouseEvent 自带 clientX/Y, 直接使用
                    var touch = (e.touches && e.touches[0]) ? e.touches[0]
                        : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0]
                        : (typeof e.clientX === 'number') ? e : null;
                    var pr = state.pianoRoll;
                    if (touch && pr && (pr.currentTool === 'brush' || pr.currentTool === 'eraser')) {
                        var r = pr.canvas.getBoundingClientRect();
                        var lx = touch.clientX - r.left;
                        var ly = touch.clientY - r.top;
                        if (lx >= pr._currentPanelWidth && ly >= pr._cfg.timelineHeight) {
                            swallowThis = false;
                        }
                    }
                } catch (err) { swallowThis = true; }
                if (swallowThis) swallowTs = now + 220; // 在 220 毫秒内把这一次点击的关联事件全部吞掉
            }
            if (now <= swallowTs) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        };
        document.addEventListener('pointerdown', outsideSwallow, true);
        document.addEventListener('touchstart', outsideSwallow, { capture: true, passive: false });
        document.addEventListener('mousedown', outsideSwallow, true);
        document.addEventListener('click', outsideSwallow, true);
    }

    // ============ 收音机式 (指针居中) 速度滑块 ============
    var RADIO_TEMPO_MIN = 1;
    var RADIO_TEMPO_MAX = 512;
    var RADIO_TEMPO_STEP = 0.2;
    var RADIO_TEMPO_PX_PER_STEP = 2;  // 每 0.2 一格 2px
    var radioTempoDragState = null;

    function initRadioTempoSlider() {
        var wrap = $('settings-tempo-radio');
        var track = $('settings-tempo-track');
        if (!wrap || !track) return;

        // 生成刻度
        track.innerHTML = '';
        var totalSteps = Math.round((RADIO_TEMPO_MAX - RADIO_TEMPO_MIN) / RADIO_TEMPO_STEP);  // 2555
        var trackWidth = totalSteps * RADIO_TEMPO_PX_PER_STEP;
        track.style.width = trackWidth + 'px';

        // 每 1 个整数单位 = 5 格 (0.2 * 5) = 长刻度, 每 5 个整数 = 数字标注
        for (var i = 0; i <= totalSteps; i++) {
            var val = RADIO_TEMPO_MIN + i * RADIO_TEMPO_STEP;
            var x = i * RADIO_TEMPO_PX_PER_STEP;
            var tick = document.createElement('div');
            // 每 5 步 (即 1 个整数) 为长刻度
            if (i % 5 === 0) {
                tick.className = 'settings-tempo-tick settings-tempo-tick-major';
            } else {
                tick.className = 'settings-tempo-tick';
                tick.style.height = '12px';
                tick.style.top = '8px';
            }
            tick.style.left = x + 'px';
            // 数字标注: 每 25 步 (= 5 个整数) 一个数字
            if (i % 25 === 0) {
                var label = document.createElement('div');
                label.className = 'settings-tempo-tick-num';
                label.textContent = val.toFixed(1);
                label.style.left = x + 'px';
                track.appendChild(label);
            }
            track.appendChild(tick);
        }

        // 拖动逻辑: 鼠标按下时记录起始位置
        // 关键: 拖动期间直接用 deltaX 计算 (不要重新获取 startValue), 避免抖动
        wrap.addEventListener('mousedown', function(e) {
            e.preventDefault();
            radioTempoDragState = {
                startX: e.clientX,
                startValue: state.tempo,
                dragging: true
            };
            document.body.style.cursor = 'ew-resize';
            // 防止文本选择
            window.getSelection().removeAllRanges();
        });
        // 触摸支持
        wrap.addEventListener('touchstart', function(e) {
            var t = e.touches[0];
            radioTempoDragState = {
                startX: t.clientX,
                startValue: state.tempo,
                dragging: true
            };
        }, { passive: true });

        // 滚轮支持
        wrap.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -1 : 1;
            setRadioTempo(state.tempo + delta * RADIO_TEMPO_STEP);
        }, { passive: false });

        // 初始化位置
        updateRadioTempoSlider();
    }

    function updateRadioTempoSlider() {
        var track = $('settings-tempo-track');
        if (!track) return;
        var steps = (state.tempo - RADIO_TEMPO_MIN) / RADIO_TEMPO_STEP;
        var offset = steps * RADIO_TEMPO_PX_PER_STEP;
        // 容器宽度 = 父容器宽度; 让当前值居中需要把 track 偏移 -(offset - containerWidth/2)
        var container = track.parentElement;
        var containerWidth = container ? container.clientWidth : 600;
        // 使用 transform 替代 left 避免回流, 配合 will-change 提升性能
        track.style.transform = 'translate3d(' + (-(offset - containerWidth / 2)) + 'px, 0, 0)';

        // 警告提示: 速度超过 128
        var warning = $('settings-tempo-warning');
        if (warning) {
            warning.style.display = (state.tempo > 128) ? 'flex' : 'none';
        }
    }

    function setRadioTempo(val) {
        // 限制 1-512, 步进 0.2
        val = Math.max(RADIO_TEMPO_MIN, Math.min(RADIO_TEMPO_MAX, val));
        val = Math.round(val / RADIO_TEMPO_STEP) * RADIO_TEMPO_STEP;
        // 修复浮点精度
        val = Math.round(val * 10) / 10;
        state.tempo = val;
        $setText('settings-tempo-value', val.toFixed(3).replace(/\.?0+$/, ''));
        $('tempo-value').value = val.toFixed(1);
        $setValue('settings-tempo-input', val);
        updateRadioTempoSlider();
        markDirty();
        if (state.isPlaying) restartPlayback();
    }

    // 全局鼠标事件 (拖动期间)
    // 关键: 拖动过程中, 每帧都基于 (startValue + 当前增量) 计算,
    // 而不是每帧累加, 防止亚像素抖动和方向反转
    document.addEventListener('mousemove', function(e) {
        if (!radioTempoDragState || !radioTempoDragState.dragging) return;
        var deltaX = e.clientX - radioTempoDragState.startX;
        // 1px = 0.2 步 (例如往左滑 deltaX 为负, 速度减小)
        var stepsDelta = deltaX / RADIO_TEMPO_PX_PER_STEP;
        var newVal = radioTempoDragState.startValue + stepsDelta * RADIO_TEMPO_STEP;
        // 仅当与上次值差异 > 0.05 时才更新, 减少抖动
        if (Math.abs(newVal - state.tempo) >= RADIO_TEMPO_STEP * 0.5) {
            setRadioTempo(newVal);
        }
    });
    document.addEventListener('mouseup', function() {
        if (radioTempoDragState) {
            radioTempoDragState = null;
            document.body.style.cursor = '';
        }
    });
    document.addEventListener('touchmove', function(e) {
        if (!radioTempoDragState || !radioTempoDragState.dragging) return;
        var t = e.touches[0];
        var deltaX = t.clientX - radioTempoDragState.startX;
        var stepsDelta = deltaX / RADIO_TEMPO_PX_PER_STEP;
        var newVal = radioTempoDragState.startValue + stepsDelta * RADIO_TEMPO_STEP;
        if (Math.abs(newVal - state.tempo) >= RADIO_TEMPO_STEP * 0.5) {
            setRadioTempo(newVal);
        }
    }, { passive: true });
    document.addEventListener('touchend', function() {
        if (radioTempoDragState) radioTempoDragState = null;
    });

    // ---- 导出 ----
    N.createLandscapeDrawerDOM = createLandscapeDrawerDOM;
    N.createMobileFabBar = createMobileFabBar;
    N.initMobileToolSwitcher = initMobileToolSwitcher;
    N.RADIO_TEMPO_MIN = RADIO_TEMPO_MIN;
    N.RADIO_TEMPO_MAX = RADIO_TEMPO_MAX;
    N.RADIO_TEMPO_STEP = RADIO_TEMPO_STEP;
    N.RADIO_TEMPO_PX_PER_STEP = RADIO_TEMPO_PX_PER_STEP;
    N.initRadioTempoSlider = initRadioTempoSlider;
    N.updateRadioTempoSlider = updateRadioTempoSlider;
    N.setRadioTempo = setRadioTempo;
})(window.WebNBS);
