/* ==================================================================
   36-color-picker.js — 统一取色器浮层 (基于 iro.js)
   提供 WebNBS.openColorPicker(opts), 供片段轨道颜色 / 设置配色等复用。
   opts = { color, anchorEl, title, swatches: ['#hex',...],
            onInput(hex), onCommit(hex), onCancel() }
   - swatches: 预设色板 (如片段轨道原始配色), 点击即选中
   - onCancel: 未点「确定」而关闭 (取消/遮罩/Esc) 时回调, 供调用方撤回预览
   ================================================================== */
(function() {
    'use strict';

    var N = window.WebNBS;
    function i18nText() { return N.i18nText.apply(this, arguments); }

    // 浮层层级: 高于设置弹窗(100400/100410/100430)与片段右键菜单(100050/100060),
    // 低于系统级 tooltip(100500) 与桌面外壳原生提示, 避免遮挡系统级反馈。
    var OVERLAY_Z = 100480;

    var _root = null;       // 全屏遮罩 (点击外部关闭)
    var _panel = null;      // 取色面板
    var _wheelEl = null;    // iro 挂载容器
    var _titleEl = null;
    var _hexEl = null;
    var _rEl = null;
    var _gEl = null;
    var _bEl = null;
    var _picker = null;
    var _opts = null;
    var _swatchEl = null;   // 预设色板容器
    var _committed = false; // 本次打开是否通过「确定」关闭
    var _currentHex = '#4cc2ff';
    var _syncing = false;

    function isMobile() {
        return (window.innerWidth || document.documentElement.clientWidth) < 720;
    }

    function normalizeHex(value) {
        var v = String(value || '').trim();
        if (v.charAt(0) !== '#') v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(v)) {
            return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
        }
        return null;
    }

    function clampByte(n) {
        n = Number(n);
        if (!isFinite(n)) return 0;
        return Math.max(0, Math.min(255, Math.round(n)));
    }

    function rgbToHex(r, g, b) {
        function pad(n) { return (n < 16 ? '0' : '') + n.toString(16); }
        return '#' + pad(clampByte(r)) + pad(clampByte(g)) + pad(clampByte(b));
    }

    function syncInputs(rgb) {
        _syncing = true;
        if (_hexEl) _hexEl.value = _currentHex.slice(1).toUpperCase();
        if (_rEl) _rEl.value = rgb.r;
        if (_gEl) _gEl.value = rgb.g;
        if (_bEl) _bEl.value = rgb.b;
        _syncing = false;
    }

    function emitInput() {
        if (_opts && typeof _opts.onInput === 'function') {
            try { _opts.onInput(_currentHex); } catch (e) { console.warn('取色器 onInput 回调异常:', e); }
        }
    }

    // 由 HEX / RGB 输入驱动: 同步 iro 内部颜色, 并触发实时预览
    function applyHex(hex, source) {
        hex = normalizeHex(hex);
        if (!hex) return;
        _currentHex = hex;
        _syncing = true;
        if (_picker) {
            try { _picker.color.hexString = hex; } catch (e) {}
        }
        var rgb = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
        if (source !== 'wheel') syncInputs(rgb);
        _syncing = false;
        emitInput();
    }

    function bindPickerEvents() {
        if (!_picker) return;
        _picker.on('color:change', function(color) {
            if (_syncing) return;
            _currentHex = color.hexString;
            var rgb = color.rgb;
            syncInputs(rgb);
            emitInput();
        });
    }

    function createPicker(width) {
        if (!window.iro || !window.iro.ColorPicker) {
            console.warn('iro.js 未加载, 无法创建取色器');
            return null;
        }
        if (_picker) {
            try { _picker.off('color:change'); } catch (e) {}
            _picker = null;
        }
        _wheelEl.innerHTML = '';
        _picker = new window.iro.ColorPicker(_wheelEl, {
            width: width,
            color: _currentHex,
            layout: [
                { component: window.iro.ui.Wheel },
                { component: window.iro.ui.Box }
            ]
        });
        bindPickerEvents();
        return _picker;
    }

    function ensureDom() {
        if (_root) return;
        _root = document.createElement('div');
        _root.className = 'wn-cp-overlay';
        _root.style.zIndex = String(OVERLAY_Z);
        _root.style.display = 'none';
        _root.innerHTML =
            '<div class="wn-cp-panel" role="dialog" aria-modal="true">'
            + '<div class="wn-cp-head">'
            + '<span class="wn-cp-title"></span>'
            + '<button type="button" class="wn-cp-close" aria-label="' + i18nText('关闭') + '">&times;</button>'
            + '</div>'
            + '<div class="wn-cp-body">'
            + '<div class="wn-cp-left">'
            + '<div class="wn-cp-wheel" aria-label="' + i18nText('色相') + '"></div>'
            + '</div>'
            + '<div class="wn-cp-right">'
            + '<div class="wn-cp-fields">'
            + '<label class="wn-cp-hex-row"><span>' + i18nText('十六进制') + '</span>'
            + '<input class="wn-cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off"></label>'
            + '<div class="wn-cp-rgb">'
            + '<label><span>R</span><input class="wn-cp-r" type="number" min="0" max="255" step="1"></label>'
            + '<label><span>G</span><input class="wn-cp-g" type="number" min="0" max="255" step="1"></label>'
            + '<label><span>B</span><input class="wn-cp-b" type="number" min="0" max="255" step="1"></label>'
            + '</div>'
            + '<div class="wn-cp-swatches" hidden></div>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="wn-cp-actions">'
            + '<button type="button" class="wn-cp-btn wn-cp-cancel">' + i18nText('取消') + '</button>'
            + '<button type="button" class="wn-cp-btn wn-cp-ok">' + i18nText('确定') + '</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(_root);

        _panel = _root.querySelector('.wn-cp-panel');
        _wheelEl = _root.querySelector('.wn-cp-wheel');
        _swatchEl = _root.querySelector('.wn-cp-swatches');
        _titleEl = _root.querySelector('.wn-cp-title');
        _hexEl = _root.querySelector('.wn-cp-hex');
        _rEl = _root.querySelector('.wn-cp-r');
        _gEl = _root.querySelector('.wn-cp-g');
        _bEl = _root.querySelector('.wn-cp-b');

        // 点击遮罩空白处关闭: 要求按下与抬起都在面板外, 避免面板内拖动/滑出色轮时误关
        var overlayPressed = false;
        _root.addEventListener('pointerdown', function(e) {
            overlayPressed = !_panel.contains(e.target);
        });
        _root.addEventListener('pointerup', function(e) {
            var outside = !_panel.contains(e.target);
            if (overlayPressed && outside) closeColorPicker();
            overlayPressed = false;
        });
        _root.addEventListener('pointercancel', function() { overlayPressed = false; });
        _root.querySelector('.wn-cp-close').addEventListener('click', closeColorPicker);
        _root.querySelector('.wn-cp-cancel').addEventListener('click', closeColorPicker);
        // 预设色板: 点击即选中该色 (走 applyHex 触发实时预览)
        _swatchEl.addEventListener('click', function(e) {
            var chip = e.target.closest ? e.target.closest('.wn-cp-swatch') : null;
            if (!chip) return;
            applyHex(chip.getAttribute('data-hex'), 'swatch');
        });

        _root.querySelector('.wn-cp-ok').addEventListener('click', function() {
            _committed = true;
            var cb = _opts && _opts.onCommit;
            var hex = _currentHex;
            closeColorPicker();
            if (typeof cb === 'function') {
                try { cb(hex); } catch (e) { console.warn('取色器 onCommit 回调异常:', e); }
            }
        });

        _hexEl.addEventListener('input', function() {
            if (_syncing) return;
            var raw = _hexEl.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            var hex = normalizeHex(raw);
            if (hex) applyHex(hex, 'hex');
        });
        _hexEl.addEventListener('blur', function() {
            if (!normalizeHex(_hexEl.value)) {
                _hexEl.value = _currentHex.slice(1).toUpperCase();
            }
        });
        function onRgbInput() {
            if (_syncing) return;
            applyHex(rgbToHex(_rEl.value, _gEl.value, _bEl.value), 'rgb');
        }
        _rEl.addEventListener('input', onRgbInput);
        _gEl.addEventListener('input', onRgbInput);
        _bEl.addEventListener('input', onRgbInput);

        document.addEventListener('keydown', function(e) {
            if (!_root || _root.style.display === 'none') return;
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                e.stopPropagation();
                closeColorPicker();
            }
        }, true);
    }

    function positionPanel(anchorEl) {
        var mobile = isMobile();
        _root.classList.toggle('is-mobile', mobile);
        _panel.classList.toggle('is-mobile', mobile);
        if (mobile) {
            // 手机端: 底部居中大面板, 由 CSS 定位
            _root.style.display = 'flex';
            _panel.style.left = '';
            _panel.style.top = '';
            return;
        }
        _root.style.display = 'block';
        _panel.style.left = '8px';
        _panel.style.top = '8px';
        var anchorRect = null;
        if (anchorEl && anchorEl.getBoundingClientRect) {
            anchorRect = anchorEl.getBoundingClientRect();
        } else if (anchorEl && isFinite(anchorEl.left)) {
            anchorRect = anchorEl;
        }
        var vw = window.innerWidth || document.documentElement.clientWidth;
        var vh = window.innerHeight || document.documentElement.clientHeight;
        var pw = _panel.offsetWidth || 300;
        var ph = _panel.offsetHeight || 300;
        var margin = 8;
        var left, top;
        if (anchorRect) {
            left = anchorRect.left;
            top = (anchorRect.bottom || anchorRect.top) + 6;
            if (top + ph > vh - margin) top = (anchorRect.top || 0) - ph - 6;
            left = Math.max(margin, Math.min(vw - pw - margin, left));
            top = Math.max(margin, Math.min(vh - ph - margin, top));
        } else {
            left = Math.max(margin, (vw - pw) / 2);
            top = Math.max(margin, (vh - ph) / 2);
        }
        _panel.style.left = Math.round(left) + 'px';
        _panel.style.top = Math.round(top) + 'px';
    }

    function openColorPicker(opts) {
        opts = opts || {};
        if (!window.iro || !window.iro.ColorPicker) {
            console.warn('iro.js 未加载, 无法打开取色器');
            return false;
        }
        ensureDom();
        _opts = opts;
        _committed = false;
        _currentHex = normalizeHex(opts.color) || '#4cc2ff';
        if (_titleEl) _titleEl.textContent = opts.title || i18nText('选择颜色');
        // 预设色板: 有则显示色块行, 无则隐藏
        if (_swatchEl) {
            var sw = Array.isArray(opts.swatches) ? opts.swatches.filter(function(c) { return normalizeHex(c); }) : [];
            if (sw.length) {
                _swatchEl.innerHTML = sw.map(function(c) {
                    var hex = normalizeHex(c);
                    return '<button type="button" class="wn-cp-swatch" data-hex="' + hex + '" title="' + hex.toUpperCase() + '" style="background:' + hex + '"></button>';
                }).join('');
                _swatchEl.hidden = false;
            } else {
                _swatchEl.innerHTML = '';
                _swatchEl.hidden = true;
            }
        }
        _root.classList.toggle('is-mobile', isMobile());
        _root.style.display = isMobile() ? 'flex' : 'block';
        // 先显示以便测量尺寸, 再创建 iro 并定位
        createPicker(isMobile() ? 220 : 118);
        syncInputs({
            r: parseInt(_currentHex.slice(1, 3), 16),
            g: parseInt(_currentHex.slice(3, 5), 16),
            b: parseInt(_currentHex.slice(5, 7), 16)
        });
        positionPanel(opts.anchorEl);
        return true;
    }

    function closeColorPicker() {
        if (!_root) return;
        var wasOpen = _root.style.display !== 'none';
        _root.style.display = 'none';
        var cb = _opts && !_committed && wasOpen ? _opts.onCancel : null;
        _opts = null;
        if (_picker) {
            try { _picker.off('color:change'); } catch (e) {}
        }
        // 未确认关闭 → 通知调用方撤回实时预览
        if (typeof cb === 'function') {
            try { cb(); } catch (e) { console.warn('取色器 onCancel 回调异常:', e); }
        }
    }

    N.openColorPicker = openColorPicker;
    N.closeColorPicker = closeColorPicker;
    N.isColorPickerOpen = function() { return !!( _root && _root.style.display !== 'none'); };
})();
