/* 18-toast.js — MiauNoteBlock 功能模块
   来源: 原 main.js L9685-L9737; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    function $() { return N.$.apply(this, arguments); }

    function _ensureToastContainer() {
        var c = $('toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
        return c;
    }
    function showToast(message, options) {
        options = options || {};
        var container = _ensureToastContainer();
        var toast = document.createElement('div');
        toast.className = 'toast ' + (options.type || 'info');
        var icon = document.createElement('i');
        icon.className = options.icon || 'fa-solid fa-circle-info';
        icon.style.marginRight = '8px';
        var content = document.createElement('span');
        content.className = 'toast-message';
        content.textContent = message;
        toast.appendChild(icon); toast.appendChild(content);
        var fill = null;
        if (options.progress !== undefined) {
            var bar = document.createElement('div');
            bar.className = 'toast-progress';
            fill = document.createElement('div');
            fill.className = 'toast-progress-fill';
            fill.style.width = '0%';
            bar.appendChild(fill); toast.appendChild(bar);
        }
        container.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.add('toast-show'); });
        toast._content = content; toast._fill = fill;
        // 默认 3 秒自动消失; duration: 0 表示常驻;
        // 带进度条的 toast 默认常驻 (进度结束时由调用方 dismissToast 关闭)
        var dur = options.duration === undefined
            ? (options.progress !== undefined ? 0 : 3000)
            : options.duration;
        if (dur > 0) setTimeout(function() { dismissToast(toast); }, dur);
        return toast;
    }
    function updateToast(toast, message, progress) {
        if (!toast) return;
        if (message !== undefined && toast._content) toast._content.textContent = message;
        if (progress !== undefined && toast._fill) toast._fill.style.width = Math.round(progress) + '%';
    }
    function dismissToast(toast, delay) {
        if (!toast) return;
        if (delay > 0) { setTimeout(function() { dismissToast(toast, 0); }, delay); return; }
        toast.classList.remove('toast-show');
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }

    // ============ SoundFont 音色库初始化 ============
    // 策略: 页面加载只读取本地缓存; 下载由设置决定
    //   'ask'  (默认) 真正播放 MIDI 音符时弹窗询问
    //   'auto'         真正播放 MIDI 音符时静默后台下载

    // ---- 导出 ----
    N._ensureToastContainer = _ensureToastContainer;
    N.showToast = showToast;
    N.updateToast = updateToast;
    N.dismissToast = dismissToast;
})(window.WebNBS);
