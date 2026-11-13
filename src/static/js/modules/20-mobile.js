/* 20-mobile.js — MiauNoteBlock 功能模块
   来源: 原 main.js L9930-L10376; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function $setText() { return N.$setText.apply(this, arguments); }
    function $setValue() { return N.$setValue.apply(this, arguments); }
    function closeFindPanel() { return N.closeFindPanel.apply(this, arguments); }
    function findPanelVisible() { return N.findPanelVisible.apply(this, arguments); }
    function handleContextAction() { return N.handleContextAction.apply(this, arguments); }
    function handlePasteOrSystemClipboard() { return N.handlePasteOrSystemClipboard.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function openFindPanel() { return N.openFindPanel.apply(this, arguments); }
    function restartPlayback() { return N.restartPlayback.apply(this, arguments); }
    function showMidiNotice() { return N.showMidiNotice.apply(this, arguments); }
    function switchTool() { return N.switchTool.apply(this, arguments); }

    // ============ 移动端侧边抽屉 ============
    // 竖屏: 顶栏右侧按钮 (设置/关于/创作辅助/自定义音色/功能) 收进抽屉;
    // 横屏: 视口高度紧张, 顶栏按钮按【从左到右】的顺序全部收进抽屉。
    // 条目不使用 cloneNode 复制原按钮: 克隆会把 id 一起复制下来
    // (例如速度输入框 #tempo-value), 造成重复 id 并让 $('tempo-value') 取错节点。
    var DRAWER_TOOLBAR_LEFT = [
        { id: 'btn-file', icon: 'fa-file', label: '文件' },
        { id: 'btn-save', icon: 'fa-floppy-disk', label: '保存' },
        { id: 'btn-undo', icon: 'fa-rotate-left', label: '撤销' },
        { id: 'btn-redo', icon: 'fa-rotate-right', label: '重做' }
    ];
    var DRAWER_TOOLBAR_RIGHT = [
        { id: 'btn-settings', icon: 'fa-gear', label: '设置' },
        { id: 'btn-about', icon: 'fa-circle-info', label: '关于' },
        { id: 'btn-assist', icon: 'fa-wand-magic-sparkles', label: '创作辅助' },
        { id: 'btn-custom-instruments', icon: 'fa-wave-square', label: '自定义音色' },
        { id: 'btn-functions', icon: 'fa-table-cells-large', label: '功能' }
    ];

    // 与 CSS 中「手机横屏」的媒体条件保持一致
    function isMobileLandscapeLayout() {
        if (!window.matchMedia) return false;
        return window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;
    }

    function createLandscapeDrawerDOM() {
        var drawer = $('landscape-drawer');
        var closeBtn = $('landscape-drawer-close');
        var backBtn = $('landscape-drawer-back');
        var mask = $('landscape-drawer-mask');
        var body = $('landscape-drawer-body');
        var mainList = $('drawer-main-list');
        var subpage = $('drawer-subpage');
        var openBtn = $('mobile-drawer-btn');
        if (!drawer || !body || !mainList) return;

        var titleEl = $('landscape-drawer-title');
        var _drawerHomeTitle = N.i18nText('菜单');
        if (titleEl) titleEl.textContent = _drawerHomeTitle;

        // 会打开浮层菜单的按钮: 在抽屉里改为「子页」展开菜单内容, 避免浮层在抽屉里位置错乱

        function closeLandscapeDrawer() {
            closeAllPages();
            drawer.classList.remove('visible');
            if (mask) mask.classList.remove('visible');
            drawer.setAttribute('aria-hidden', 'true');
            var openBtnEl = $('mobile-drawer-btn');
            if (openBtnEl) openBtnEl.classList.remove('is-hidden');
        }

        function makeDrawerItem(icon, label, disabled, onClick) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'drawer-item';
            item.disabled = !!disabled;
            var iconEl = document.createElement('i');
            iconEl.className = 'fa-solid ' + icon + ' drawer-icon';
            iconEl.setAttribute('aria-hidden', 'true');
            var textEl = document.createElement('span');
            textEl.textContent = N.i18nText(label);
            item.appendChild(iconEl);
            item.appendChild(textEl);
            item.addEventListener('click', onClick);
            return item;
        }

        // 带浮层菜单的按钮 -> 抽屉子页 (菜单内容搬进抽屉, 左上角返回)
        // 用栈支持多级: 文件菜单里的「历史文件 / 导出为…」再展开一层
        var _pageStack = [];

        function clearSubpageDom() {
            while (subpage && subpage.firstChild) subpage.removeChild(subpage.firstChild);
        }

        function pushDrawerPage(el, titleText) {
            if (!subpage || !el) return false;
            var parent = el.parentNode;
            var next = el.nextSibling;
            el.setAttribute('data-drawer-embedded', '1');
            el.style.display = 'block';
            clearSubpageDom();
            subpage.appendChild(el);
            subpage.hidden = false;
            drawer.classList.add('is-subpage');
            if (titleEl) titleEl.textContent = titleText;
            _pageStack.push({ el: el, parent: parent, next: next, title: titleText });
            subpage.scrollTop = 0;
            return true;
        }

        function popDrawerPage() {
            var info = _pageStack.pop();
            if (!info) return;
            clearSubpageDom();
            if (info.el) {
                info.el.removeAttribute('data-drawer-embedded');
                var staysInDom = (info.el.id === 'functions-menu');
                if (staysInDom) {
                    // functions-menu 是 index.html 的常驻节点: 放回原位, 桌面端仍可用
                    info.el.style.display = 'none';
                    if (info.parent) {
                        if (info.next && info.next.parentNode === info.parent) info.parent.insertBefore(info.el, info.next);
                        else info.parent.appendChild(info.el);
                    }
                } else if (info.el.parentNode) {
                    info.el.parentNode.removeChild(info.el);
                }
            }
            var top = _pageStack[_pageStack.length - 1];
            if (top) {
                if (subpage) {
                    subpage.appendChild(top.el);
                    top.el.style.display = 'block';
                }
                if (titleEl) titleEl.textContent = top.title;
            } else {
                if (subpage) subpage.hidden = true;
                drawer.classList.remove('is-subpage');
                if (titleEl) titleEl.textContent = _drawerHomeTitle;
            }
        }

        function closeAllPages() {
            while (_pageStack.length) popDrawerPage();
        }

        function openDrawerMenuPage(entryId, titleText) {
            var menuId = (entryId === 'btn-file') ? 'file-menu'
                : (entryId === 'btn-functions') ? 'functions-menu' : null;
            if (!menuId) return false;
            closeAllPages();
            var pre = $(menuId);
            if (pre) {
                if (menuId === 'file-menu') pre.remove();
                else pre.style.display = 'none';
            }
            var trigger = $(entryId);
            if (trigger) trigger.click();
            var menu = $(menuId);
            if (!menu) return false;
            return pushDrawerPage(menu, N.i18nText(titleText || '菜单'));
        }

        // 子页内点击: 带子菜单的项再展开一层; 普通菜单项执行后收起抽屉
        if (subpage) {
            subpage.addEventListener('click', function(e) {
                var target = e.target;
                if (!target || !target.closest) return;
                var subItem = target.closest('.file-menu-has-sub');
                if (subItem) {
                    e.preventDefault();
                    e.stopPropagation();
                    // 桌面端靠 mouseenter 展开子菜单, 触屏用点击代替
                    subItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                    var submenu = document.getElementById('history-submenu')
                        || document.getElementById('export-submenu');
                    if (submenu) pushDrawerPage(submenu, (subItem.textContent || '').trim());
                    return;
                }
                if (!target.closest('.file-menu-item, .functions-menu-item')) return;
                // 普通项: 大多数会立刻执行并收起菜单, 这里把抽屉一并收起
                setTimeout(function() {
                    if (drawer.classList.contains('visible')) closeLandscapeDrawer();
                }, 0);
            });
        }

        // 转发到原按钮: 原按钮仍在 DOM 中 (只是被 CSS 隐藏), 逻辑与桌面端完全一致
        function appendForwardingGroup(entries) {
            var groupEl = document.createElement('div');
            groupEl.className = 'drawer-group';
            for (var i = 0; i < entries.length; i++) {
                (function(entry) {
                    var orig = $(entry.id);
                    groupEl.appendChild(makeDrawerItem(
                        entry.icon,
                        entry.label,
                        !orig || orig.disabled,
                        function() {
                            // 文件 / 功能: 菜单内容在抽屉子页显示 (左上角返回)
                            if (entry.id === 'btn-file' || entry.id === 'btn-functions') {
                                if (openDrawerMenuPage(entry.id, entry.label)) return;
                            }
                            closeLandscapeDrawer();
                            var target = $(entry.id);
                            if (target) target.click();
                        }
                    ));
                })(entries[i]);
            }
            mainList.appendChild(groupEl);
        }

        // 每次打开时重建: 方向变化后条目集合随之变化, 也顺带同步按钮的禁用状态
        function buildDrawerBody() {
            mainList.innerHTML = '';
            if (isMobileLandscapeLayout()) appendForwardingGroup(DRAWER_TOOLBAR_LEFT);
            appendForwardingGroup(DRAWER_TOOLBAR_RIGHT);

            // 附加: 查找音符 (顶栏没有对应按钮)
            var extraGroup = document.createElement('div');
            extraGroup.className = 'drawer-group';
            extraGroup.appendChild(makeDrawerItem('fa-magnifying-glass', '查找音符', false, function() {
                closeLandscapeDrawer();
                if (findPanelVisible()) closeFindPanel();
                else openFindPanel();
            }));
            mainList.appendChild(extraGroup);
        }

        function openLandscapeDrawer() {
            closeAllPages();
            buildDrawerBody();
            drawer.classList.add('visible');
            if (mask) mask.classList.add('visible');
            drawer.setAttribute('aria-hidden', 'false');
            // 悬浮的抽屉按钮在抽屉打开时隐藏, 避免压在抽屉上
            var openBtnEl = $('mobile-drawer-btn');
            if (openBtnEl) openBtnEl.classList.add('is-hidden');
        }

        if (openBtn) {
            openBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                openLandscapeDrawer();
            });
        }
        if (closeBtn) closeBtn.addEventListener('click', closeLandscapeDrawer);
        if (backBtn) backBtn.addEventListener('click', popDrawerPage);
        if (mask) mask.addEventListener('click', closeLandscapeDrawer);

        // ESC: 先退出子页, 再关闭抽屉
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape' || !drawer.classList.contains('visible')) return;
            if (drawer.classList.contains('is-subpage')) popDrawerPage();
            else closeLandscapeDrawer();
        });

        N.openMobileDrawer = openLandscapeDrawer;
        N.closeMobileDrawer = closeLandscapeDrawer;
    }

    // ============ 移动端顶栏进度信息 ============
    // 左: 实际秒数 (当前 / 全长), 中: 速度 (可拖动/输入), 右: 节拍进度
    // 绝对 tick 进度仍由状态栏 #progress-time 显示, 两者互不影响
    var NBS_TICKS_PER_BEAT = 4;                         // NBS 标准: 1 拍 (四分) = 4 tick
    var NBS_TICKS_PER_WHOLE = NBS_TICKS_PER_BEAT * 4;   // 1 全音 = 4 拍 = 16 tick
    var MOBILE_PROGRESS_MIN_INTERVAL_MS = 60;           // 播放时本函数每帧都会调用, 略作节流
    var _mobileProgressLastRun = -1;
    var _mobileProgressLastClock = -1;

    function padNumber(value, width) {
        var text = String(value);
        while (text.length < width) text = '0' + text;
        return text;
    }

    // NBS 的 tempo 单位就是 tick/秒 (t/s), 因此秒数 = tick / tempo
    function ticksToSeconds(ticks) {
        var tps = parseFloat(state.tempo);
        if (!isFinite(tps) || tps <= 0) return 0;
        var value = parseFloat(ticks);
        if (!isFinite(value) || value < 0) value = 0;
        return value / tps;
    }

    // "00:02:11;187" —— 时:分:秒;毫秒
    function formatClock(seconds) {
        var totalMs = Math.round(Math.max(0, seconds) * 1000);
        var ms = totalMs % 1000;
        var totalSec = (totalMs - ms) / 1000;
        return padNumber(Math.floor(totalSec / 3600), 2) + ':' +
            padNumber(Math.floor(totalSec / 60) % 60, 2) + ':' +
            padNumber(totalSec % 60, 2) + ';' + padNumber(ms, 3);
    }

    // 节拍进度: 全音 · 四分 · 十六分, 三段都从 1 开始计数
    function formatBeatProgress(tick) {
        var t = Math.floor(Math.max(0, tick));
        return {
            whole: Math.floor(t / NBS_TICKS_PER_WHOLE) + 1,
            quarter: Math.floor((t % NBS_TICKS_PER_WHOLE) / NBS_TICKS_PER_BEAT) + 1,
            sixteenth: (t % NBS_TICKS_PER_BEAT) + 1
        };
    }

    function formatTempoValue(value) {
        var v = parseFloat(value);
        if (!isFinite(v) || v < 0) v = 0;
        return (Math.round(v * 100) / 100).toFixed(2);
    }

    function setTextIfChanged(el, text) {
        if (el && el.textContent !== text) el.textContent = text;
    }

    // 顶栏溢出逐级压缩 (mp-compact → mp-ultra): 与 refreshToolbarLayout 的
    // toolbar-compact 同一套思路 —— 按实际测量结果切换, 而不是写死断点。
    var _mobileProgressLayoutTimer = null;
    var _mobileProgressLayoutKey = '';

    function refreshMobileProgressLayout() {
        var bar = $('mobile-bar-progress');
        var toolbar = $('toolbar');
        if (!bar || !toolbar) return;
        toolbar.classList.remove('mp-compact', 'mp-ultra');
        if (!bar.clientWidth) return;
        if (bar.scrollWidth <= bar.clientWidth + 1) return;
        toolbar.classList.add('mp-compact');
        if (bar.scrollWidth > bar.clientWidth + 1) toolbar.classList.add('mp-ultra');
    }

    // ---------- 进度信息的宿主: 竖屏/桌面在顶栏, 手机横屏在底部状态栏 ----------
    // 横屏时顶栏整条隐藏, 进度信息 (时间/速度/节拍) 全部搬到底栏右侧, 抽屉按钮
    // 由 CSS 悬浮到右上角。DOM 搬动而不是复制, 保证 id 与事件绑定只有一份。
    function syncMobileProgressHost() {
        var bar = $('mobile-bar-progress');
        var toolbar = $('toolbar');
        var statusBar = $('status-bar');
        if (!bar || !toolbar || !statusBar) return;
        var drawerBtn = $('mobile-drawer-btn');
        var landscape = isMobileLandscapeLayout();
        if (landscape) {
            // 抽屉按钮移到 body 上悬浮到右上角: 状态栏带 backdrop-filter,
            // 会让内部的 position:fixed 相对状态栏定位 (而不是视口)
            if (drawerBtn && drawerBtn.parentNode !== document.body) {
                document.body.appendChild(drawerBtn);
                drawerBtn.classList.add('mbp-drawer-floating');
            }
            var instBtn = $('btn-instrument-selector');
            var rightGroup = instBtn && instBtn.parentNode;
            if (rightGroup && bar.parentNode !== rightGroup) {
                rightGroup.insertBefore(bar, instBtn);
            }
        } else {
            if (drawerBtn && drawerBtn.parentNode !== bar) {
                bar.insertBefore(drawerBtn, bar.firstChild);
                drawerBtn.classList.remove('mbp-drawer-floating');
            }
            if (bar.parentNode !== toolbar) {
                var rightSection = toolbar.querySelector('.toolbar-right');
                if (rightSection && rightSection.parentNode === toolbar) toolbar.insertBefore(bar, rightSection);
                else toolbar.appendChild(bar);
            }
        }
        refreshMobileProgressLayout();
    }

    function scheduleMobileProgressLayout() {
        if (_mobileProgressLayoutTimer) return;
        _mobileProgressLayoutTimer = setTimeout(function() {
            _mobileProgressLayoutTimer = null;
            refreshMobileProgressLayout();
        }, 60);
    }

    function updateMobileProgress(force) {
        var currentEl = $('mbp-time-current');
        if (!currentEl) return;

        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (!force && _mobileProgressLastRun >= 0 && (now - _mobileProgressLastRun) < MOBILE_PROGRESS_MIN_INTERVAL_MS) {
            return;
        }
        _mobileProgressLastRun = now;

        var currentTick = state.currentTick || 0;
        var totalTicks = N.getSongLengthTicks ? N.getSongLengthTicks() : 0;

        var clockCurrent = formatClock(ticksToSeconds(currentTick));
        var clockTotal = '/ ' + formatClock(ticksToSeconds(totalTicks));
        var tempoText = formatTempoValue(state.tempo);
        var beat = formatBeatProgress(currentTick);

        // 当前时间只在毫秒位真的变化时写 DOM, 避免每帧触发顶栏重排
        if (clockCurrent !== _mobileProgressLastClock) {
            _mobileProgressLastClock = clockCurrent;
            setTextIfChanged($('mbp-time-current'), clockCurrent);
        }
        setTextIfChanged($('mbp-time-total'), clockTotal);
        setTextIfChanged($('mbp-tempo-value'), tempoText);
        setTextIfChanged($('mbp-beat-whole'), String(beat.whole));
        setTextIfChanged($('mbp-beat-quarter'), String(beat.quarter));
        setTextIfChanged($('mbp-beat-sixteenth'), String(beat.sixteenth));

        // 文字长度变化 (如节拍位数、速度位数) 可能改变顶栏所需宽度, 重新量一次
        var layoutKey = clockCurrent.length + '|' + clockTotal.length + '|' + tempoText.length +
            '|' + beat.whole + '|' + beat.quarter + '|' + beat.sixteenth;
        if (layoutKey !== _mobileProgressLayoutKey) {
            _mobileProgressLayoutKey = layoutKey;
            scheduleMobileProgressLayout();
        }
    }

    // ============ 移动端速度控件 (拖动微调 + 点击输入) ============
    var MOBILE_TEMPO_MIN = 0;
    var MOBILE_TEMPO_MAX = 512;
    var MOBILE_TEMPO_STEP_PER_PX = 0.2;   // 上下拖动 1px = 0.2 t/s
    var MOBILE_TEMPO_DRAG_THRESHOLD = 4;  // 位移小于该值视为点击

    function applyMobileTempo(value) {
        var v = parseFloat(value);
        if (!isFinite(v)) return;
        v = Math.max(MOBILE_TEMPO_MIN, Math.min(MOBILE_TEMPO_MAX, v));
        v = Math.round(v * 100) / 100;
        state.tempo = v;
        $setValue('tempo-value', String(v));
        $setValue('settings-tempo-input', v);
        $setText('settings-tempo-value', v.toFixed(1));
        markDirty();
        if (state.isPlaying) restartPlayback();
        updateMobileProgress(true);
    }

    function initMobileTempoControl() {
        var wrap = $('mbp-tempo');
        var readout = $('mbp-tempo-readout');
        var input = $('mbp-tempo-input');
        if (!wrap || !readout || !input) return;

        var drag = null;

        function startEdit() {
            input.value = formatTempoValue(state.tempo);
            wrap.classList.add('is-editing');
            // 弹出数字键盘并全选, 便于直接覆盖
            try { input.focus(); } catch (e) {}
            if (input.select) input.select();
        }

        function commitEdit() {
            if (!wrap.classList.contains('is-editing')) return;
            wrap.classList.remove('is-editing');
            applyMobileTempo(input.value);
        }

        function cancelEdit() {
            wrap.classList.remove('is-editing');
            updateMobileProgress(true);
        }

        input.addEventListener('keydown', function(e) {
            // 阻止冒泡到全局快捷键 (数字键在项目里绑定了钢琴音符)
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
                input.blur();
            }
        });
        input.addEventListener('blur', function() {
            if (wrap.classList.contains('is-editing')) commitEdit();
        });

        readout.addEventListener('pointerdown', function(e) {
            if (typeof e.button === 'number' && e.button !== 0) return;
            drag = {
                startY: e.clientY,
                startTempo: parseFloat(state.tempo) || 0,
                moved: false,
                undoPushed: false
            };
            wrap.classList.add('is-dragging');
            if (readout.setPointerCapture) {
                try { readout.setPointerCapture(e.pointerId); } catch (err) {}
            }
            e.preventDefault();
        });

        readout.addEventListener('pointermove', function(e) {
            if (!drag) return;
            var delta = drag.startY - e.clientY;   // 向上拖动 = 提速
            if (!drag.moved && Math.abs(delta) < MOBILE_TEMPO_DRAG_THRESHOLD) return;
            drag.moved = true;
            if (!drag.undoPushed) {
                if (N.pushUndo) N.pushUndo();
                drag.undoPushed = true;
            }
            applyMobileTempo(drag.startTempo + delta * MOBILE_TEMPO_STEP_PER_PX);
            e.preventDefault();
        });

        function endDrag(e) {
            if (!drag) return;
            var moved = drag.moved;
            drag = null;
            wrap.classList.remove('is-dragging');
            if (readout.releasePointerCapture && e && typeof e.pointerId === 'number') {
                try { readout.releasePointerCapture(e.pointerId); } catch (err) {}
            }
            // 没有发生位移 = 单击: 就地输入速度
            if (!moved) startEdit();
        }
        readout.addEventListener('pointerup', endDrag);
        readout.addEventListener('pointercancel', endDrag);

        // 键盘可达: 聚焦后回车开始输入
        readout.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startEdit();
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
        updateMobileProgress(true);
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

    // 方向变化时立即校正进度信息宿主 (横屏 <-> 竖屏)
    (function watchMobileProgressHost() {
        var mq = window.matchMedia
            ? window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)')
            : null;
        if (mq && mq.addEventListener) {
            mq.addEventListener('change', function() { syncMobileProgressHost(); });
        }
        window.addEventListener('orientationchange', function() {
            setTimeout(syncMobileProgressHost, 120);
        });
    })();

    // ---- 导出 ----
    N.createLandscapeDrawerDOM = createLandscapeDrawerDOM;
    N.createMobileFabBar = createMobileFabBar;
    N.initMobileToolSwitcher = initMobileToolSwitcher;
    N.initMobileTempoControl = initMobileTempoControl;
    N.updateMobileProgress = updateMobileProgress;
    N.refreshMobileProgressLayout = refreshMobileProgressLayout;
    N.syncMobileProgressHost = syncMobileProgressHost;
    N.applyMobileTempo = applyMobileTempo;
    N.isMobileLandscapeLayout = isMobileLandscapeLayout;
    N.initRadioTempoSlider = initRadioTempoSlider;
    N.updateRadioTempoSlider = updateRadioTempoSlider;
    N.setRadioTempo = setRadioTempo;
    N.RADIO_TEMPO_MIN = RADIO_TEMPO_MIN;
    N.RADIO_TEMPO_MAX = RADIO_TEMPO_MAX;
    N.RADIO_TEMPO_STEP = RADIO_TEMPO_STEP;
    N.RADIO_TEMPO_PX_PER_STEP = RADIO_TEMPO_PX_PER_STEP;
    N.radioTempoDragState = radioTempoDragState;
})(window.WebNBS);
