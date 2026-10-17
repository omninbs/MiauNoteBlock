/* ==================================================================
   custom_dropdown.js — 自定义下拉框 + 自定义 Tooltip
   替代原生 <select> 和 title 属性, 兼容性更好 (适用于 WebView 打包)
   ================================================================== */
(function() {
    'use strict';

    // ============ 自定义 Tooltip ============
    var tipEl = null;
    var tipTimer = null;
    var tipHideTimer = null;

    function ensureTipEl() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.className = 'cdd-tip';
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function showTip(text, x, y) {
        if (!text) return;
        var el = ensureTipEl();
        el.textContent = text;
        el.style.left = '0px';
        el.style.top = '0px';
        el.classList.add('cdd-tip-visible');
        // 计算位置
        var rect = el.getBoundingClientRect();
        var tx = x + 12;
        var ty = y + 18;
        if (tx + rect.width > window.innerWidth - 4) tx = x - rect.width - 8;
        if (ty + rect.height > window.innerHeight - 4) ty = y - rect.height - 8;
        el.style.left = Math.max(4, tx) + 'px';
        el.style.top = Math.max(4, ty) + 'px';
    }

    function hideTip() {
        if (!tipEl) return;
        tipEl.classList.remove('cdd-tip-visible');
    }

    function scheduleTip(text, e) {
        if (tipTimer) clearTimeout(tipTimer);
        if (tipHideTimer) clearTimeout(tipHideTimer);
        tipTimer = setTimeout(function() {
            showTip(text, e.clientX, e.clientY);
        }, 500);
    }

    function cancelTip() {
        if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
        tipHideTimer = setTimeout(function() { hideTip(); }, 100);
    }

    // 初始化: 将所有带 title 属性的元素替换为自定义 tooltip
    function initTooltips() {
        var els = document.querySelectorAll('[title]');
        for (var i = 0; i < els.length; i++) {
            (function(el) {
                var text = el.getAttribute('title');
                if (!text) return;
                el.removeAttribute('title');
                el.setAttribute('data-tip', text);
                // Keep the source text when title becomes data-tip so language
                // changes can translate tooltips after the custom conversion.
                if (!el.dataset.i18nDataTip) el.dataset.i18nDataTip = el.dataset.i18nTitle || text;
                el.addEventListener('mouseenter', function(e) {
                    scheduleTip(el.getAttribute('data-tip') || text, e);
                });
                el.addEventListener('mousemove', function(e) {
                    if (tipEl && tipEl.classList.contains('cdd-tip-visible')) {
                        showTip(el.getAttribute('data-tip') || text, e.clientX, e.clientY);
                    }
                });
                el.addEventListener('mouseleave', function() {
                    cancelTip();
                });
            })(els[i]);
        }
    }

    // 动态观察 DOM 变化, 为新增的带 title 的元素自动绑定 tooltip
    var tipObserver = null;
    function observeTooltips() {
        if (tipObserver) tipObserver.disconnect();
        tipObserver = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.hasAttribute && node.hasAttribute('title')) {
                        bindTooltip(node);
                    }
                    if (node.querySelectorAll) {
                        var children = node.querySelectorAll('[title]');
                        for (var k = 0; k < children.length; k++) {
                            bindTooltip(children[k]);
                        }
                    }
                }
            }
        });
        tipObserver.observe(document.body, { childList: true, subtree: true });
    }

    function bindTooltip(el) {
        // 兼容两种来源: 尚未转换的 title, 或已被转换过的 data-tip
        var text = el.getAttribute('title') || el.getAttribute('data-tip');
        if (!text) return;
        el.removeAttribute('title');
        el.setAttribute('data-tip', text);
        // See initTooltips: title is removed by this component, but i18n still
        // needs the unmodified source value to translate future tooltip text.
        if (!el.dataset.i18nDataTip) el.dataset.i18nDataTip = el.dataset.i18nTitle || text;
        el.addEventListener('mouseenter', function(e) {
            scheduleTip(el.getAttribute('data-tip') || text, e);
        });
        el.addEventListener('mousemove', function(e) {
            if (tipEl && tipEl.classList.contains('cdd-tip-visible')) {
                showTip(el.getAttribute('data-tip') || text, e.clientX, e.clientY);
            }
        });
        el.addEventListener('mouseleave', function() {
            cancelTip();
        });
    }

    // ============ 自定义下拉框 ============

    // 全局注册表: 记录所有打开的下拉框实例
    var openInstances = [];

    /**
     * 将原生 <select> 转换为自定义下拉框
     * 原生 select 会被隐藏, 但保留在 DOM 中以保持兼容性
     * change 事件会正常派发到原 select 上
     */
    function convertSelect(select) {
        if (select.dataset.cddConverted) return;
        select.dataset.cddConverted = '1';

        // 创建包裹容器
        var wrap = document.createElement('div');
        wrap.className = 'cdd-wrap';
        // 继承 select 的内联样式中的 width
        var inlineWidth = select.style.width;
        if (inlineWidth) wrap.style.width = inlineWidth;
        if (select.style.cssText) {
            // 复制 margin 等
            if (select.style.margin) wrap.style.margin = select.style.margin;
        }

        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        select.style.display = 'none';

        // 创建触发器
        var trigger = document.createElement('div');
        trigger.className = 'cdd-trigger';
        trigger.innerHTML = '<span class="cdd-label"></span><span class="cdd-arrow"></span>';
        wrap.appendChild(trigger);

        // 原 select 会被隐藏, 其悬浮提示需转移到用户实际看到的触发器上
        var tipText = select.getAttribute('data-tip') || select.getAttribute('title');
        if (tipText) {
            if (select.dataset.i18nDataTip) trigger.dataset.i18nDataTip = select.dataset.i18nDataTip;
            trigger.setAttribute('title', tipText);
            bindTooltip(trigger);
        }

        var labelEl = trigger.querySelector('.cdd-label');

        // 创建下拉列表
        var list = document.createElement('div');
        list.className = 'cdd-list';
        wrap.appendChild(list);

        var isOpen = false;

        function getSelectedOption() {
            return select.options[select.selectedIndex];
        }

        function updateLabel() {
            var opt = getSelectedOption();
            labelEl.textContent = opt ? opt.textContent : '';
        }

        function rebuildOptions() {
            list.innerHTML = '';
            var selectedVal = select.value;
            for (var i = 0; i < select.options.length; i++) {
                (function(opt) {
                    var item = document.createElement('div');
                    item.className = 'cdd-option';
                    if (opt.value === selectedVal) item.classList.add('cdd-selected');
                    item.textContent = opt.textContent;
                    item.addEventListener('click', function(e) {
                        e.stopPropagation();
                        select.value = opt.value;
                        // 派发 change 事件
                        var evt = document.createEvent('HTMLEvents');
                        evt.initEvent('change', true, false);
                        select.dispatchEvent(evt);
                        // 也派发 input 事件
                        var inputEvt = document.createEvent('HTMLEvents');
                        inputEvt.initEvent('input', true, false);
                        select.dispatchEvent(inputEvt);
                        updateLabel();
                        closeList();
                    });
                    list.appendChild(item);
                })(select.options[i]);
            }
            updateLabel();
        }

        function openList() {
            if (isOpen) return;
            // 先关闭其他打开的下拉框
            closeAllLists();
            rebuildOptions();
            trigger.classList.add('cdd-open');
            isOpen = true;
            openInstances.push(closeList);

            // 将下拉列表挂载到 body, 使用 fixed 定位, 避免被弹窗 overflow 截断
            document.body.appendChild(list);
            list.classList.add('cdd-visible');
            list.style.position = 'fixed';

            // 计算位置: 优先在触发器下方显示, 空间不足时向上显示
            var triggerRect = trigger.getBoundingClientRect();
            // 先临时设为 auto 以测量自然宽度 (重置 min-width 避免继承父级宽度)
            list.style.maxHeight = 'none';
            list.style.width = 'auto';
            list.style.minWidth = '0';
            list.style.maxWidth = 'none';

            // 测量内容自然宽度
            var contentWidth = 0;
            var items = list.querySelectorAll('.cdd-option');
            for (var ci = 0; ci < items.length; ci++) {
                var w = items[ci].scrollWidth;
                if (w > contentWidth) contentWidth = w;
            }
            // 如果选项为空, 回退到 scrollWidth
            if (contentWidth === 0) contentWidth = list.scrollWidth;
            var triggerW = triggerRect.width;
            // 宽度: 取触发器宽度和内容宽度的较大值, 但不超过 240px, 不小于 60px
            var listWidth = Math.min(240, Math.max(60, triggerW, contentWidth + 16));
            list.style.width = listWidth + 'px';
            list.style.minWidth = listWidth + 'px';
            list.style.maxWidth = listWidth + 'px';

            var viewportH = window.innerHeight;
            var spaceBelow = viewportH - triggerRect.bottom;
            var spaceAbove = triggerRect.top;

            // 限制最大高度, 避免超出视口
            var maxH = Math.max(spaceBelow, spaceAbove) - 8;
            if (maxH < 120) maxH = 120;
            if (maxH > 320) maxH = 320;
            list.style.maxHeight = maxH + 'px';

            // 重新测量应用 maxHeight 后的高度
            var listHeight = list.offsetHeight;

            var top, left = triggerRect.left;
            if (spaceBelow >= listHeight + 4 || spaceBelow >= spaceAbove) {
                // 下方显示
                top = triggerRect.bottom + 2;
            } else {
                // 上方显示
                top = triggerRect.top - listHeight - 2;
            }

            // 水平方向: 防止超出视口右侧
            var viewportW = window.innerWidth;
            if (left + listWidth > viewportW - 4) {
                left = Math.max(4, viewportW - listWidth - 4);
            }

            list.style.left = left + 'px';
            list.style.top = top + 'px';
            // 自定义下拉列表需高于弹窗遮罩(100200), 但低于自定义 tooltip(100500) 与自定义弹窗(100400)
            list.style.zIndex = '100280';
        }

        function closeList() {
            if (!isOpen) return;
            list.classList.remove('cdd-visible');
            trigger.classList.remove('cdd-open');
            isOpen = false;
            // 从全局注册表移除
            var idx = openInstances.indexOf(closeList);
            if (idx >= 0) openInstances.splice(idx, 1);
        }

        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isOpen) closeList();
            else openList();
        });

        // 阻止 list 内部点击事件冒泡 (防止触发弹窗关闭等)
        list.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // 点击外部关闭: 检查点击是否在 wrap 或 list 内
        // 由于 list 被移到 body, 需要同时检查 wrap 和 list
        document.addEventListener('click', function(e) {
            if (!wrap.contains(e.target) && !list.contains(e.target)) {
                closeList();
            }
        }, true);

        // 监听 select 的 options 变化 (通过 MutationObserver)
        var observer = new MutationObserver(function() {
            rebuildOptions();
        });
        observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });

        // 监听外部对 select.value 的修改
        var lastValue = select.value;
        setInterval(function() {
            if (select.value !== lastValue) {
                lastValue = select.value;
                updateLabel();
            }
        }, 200);

        // 提供外部 API
        select._cdd = {
            refresh: function() { rebuildOptions(); },
            open: openList,
            close: closeList
        };

        rebuildOptions();
    }

    function closeAllLists() {
        // 关闭所有打开的下拉框实例
        while (openInstances.length > 0) {
            var closeFn = openInstances.pop();
            if (closeFn) closeFn();
        }
    }

    function convertAllSelects() {
        var selects = document.querySelectorAll('select:not([data-cddConverted])');
        for (var i = 0; i < selects.length; i++) {
            convertSelect(selects[i]);
        }
    }

    // ============ 初始化 ============
    function init() {
        initTooltips();
        convertAllSelects();
        observeTooltips();

        // 动态观察 DOM, 为新增的 select 自动转换
        var selectObserver = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'SELECT' && !node.dataset.cddConverted) {
                        convertSelect(node);
                    }
                    if (node.querySelectorAll) {
                        var selects = node.querySelectorAll('select:not([data-cddConverted])');
                        for (var k = 0; k < selects.length; k++) {
                            convertSelect(selects[k]);
                        }
                    }
                }
            }
        });
        selectObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 提供全局 API
    window.CustomDropdown = {
        convert: convertSelect,
        convertAll: convertAllSelects,
        refresh: function(select) {
            if (select && select._cdd) select._cdd.refresh();
        },
        initTooltips: initTooltips,
        bindTooltip: bindTooltip
    };

    // DOMContentLoaded 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
