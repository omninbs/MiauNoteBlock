/**
 * MiauNoteBlock 装配入口
 *
 * 原 2 万行的单体 main.js 已按功能拆分到 static/js/modules/*.js，
 * 各模块通过 window.WebNBS 命名空间协作，加载顺序见 index.html。
 * 本文件只负责在 DOMContentLoaded 时启动应用。
 */
(function () {
    'use strict';

    window.WebNBS = window.WebNBS || {};
    window.WebNBS.shared = window.WebNBS.shared || {};

    // 与原实现一致: 以 document 作为 this 调用 init
    function boot() {
        var init = window.WebNBS.init;
        if (typeof init === 'function') init.call(document);
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
