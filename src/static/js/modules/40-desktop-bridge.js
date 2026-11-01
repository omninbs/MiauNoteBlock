/**
 * 桌面外壳（Tauri / MSIX）专属桥接层
 *
 * 设计原则：浏览器与服务器部署下 window.__TAURI__ 不存在，本模块第一行即 return，
 * 不包装任何原型方法、不改动任何业务逻辑，因此对静态打开、服务端部署完全零影响。
 *
 * 仅提供两类增强：
 *   1. 下载重定向：导出动作（a[download] + blob URL）改为系统「另存为」对话框
 *   2. 打开/导入：文件选择改为系统原生对话框，读回字节后注入 input，复用原有导入链路
 *   3. 窗口标题：软件名 + 当前歌曲名 + 未保存 * 标记
 */
(function () {
    'use strict';

    var N = window.WebNBS;
    var T = window.__TAURI__;
    if (!N || !T || !T.core || typeof T.core.invoke !== 'function') { return; }

    var invoke = T.core.invoke;
    var APP_NAME = 'MiauNoteBlock';

    function notify(msg) {
        if (typeof N.toast === 'function') {
            try { N.toast(msg); return; } catch (e) { /* 回退到控制台 */ }
        }
        console.warn('[desktop] ' + msg);
    }

    /* ==================== 1. 下载重定向 ==================== */

    // 记录 blob URL 与 Blob 的对应关系，拦截时才能取到实际内容
    var blobByUrl = {};
    var origCreateObjectURL = URL.createObjectURL;
    var origRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = function (obj) {
        var url = origCreateObjectURL.call(URL, obj);
        if (obj instanceof Blob) { blobByUrl[url] = obj; }
        return url;
    };

    URL.revokeObjectURL = function (url) {
        delete blobByUrl[url];
        return origRevokeObjectURL.call(URL, url);
    };

    // 分块大小：大于此值的导出（音频 WAV 等）不会一次性塞进 IPC
    var CHUNK_SIZE = 4 * 1024 * 1024;

    function readChunkAsBase64(part) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () {
                var s = String(fr.result);
                var comma = s.indexOf(',');
                resolve(comma >= 0 ? s.slice(comma + 1) : '');
            };
            fr.onerror = function () { reject(fr.error || new Error('读取数据块失败')); };
            fr.readAsDataURL(part);
        });
    }

    function writeBlobToPath(path, blob) {
        var offset = 0;
        function nextChunk() {
            if (offset >= blob.size) { return Promise.resolve(null); }
            var end = Math.min(offset + CHUNK_SIZE, blob.size);
            var part = blob.slice(offset, end);
            offset = end;
            return readChunkAsBase64(part).then(function (b64) {
                return invoke('write_file_chunk', { path: path, base64: b64 }).then(nextChunk);
            });
        }
        return invoke('write_file_begin', { path: path }).then(nextChunk);
    }

    function saveBlobAs(filename, blob) {
        var dot = filename.lastIndexOf('.');
        var ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
        invoke('pick_save_path', {
            defaultName: filename,
            extensions: ext ? [ext] : []
        }).then(function (path) {
            if (!path) { return null; }   // 用户取消
            return writeBlobToPath(path, blob);
        }).catch(function (err) {
            notify('保存失败：' + (err && err.message ? err.message : err));
        });
    }

    // 仅拦截「带 download 属性且 href 指向本页创建的 blob」的导出点击，其余一律放行
    var origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        try {
            var name = this.download;
            var url = this.href;
            if (name && url && blobByUrl[url]) {
                saveBlobAs(name, blobByUrl[url]);
                return;
            }
        } catch (e) { /* 落到原生逻辑 */ }
        return origAnchorClick.apply(this, arguments);
    };

    /* ==================== 2. 打开 / 导入文件 ==================== */

    function parseAccept(accept) {
        var out = [];
        var parts = String(accept || '').split(',');
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim();
            if (p.charAt(0) !== '.' || p.length < 2) { continue; }
            out.push(p.slice(1).toLowerCase());
        }
        return out;
    }

    function fileNameOf(path) {
        var segs = String(path).split(/[\\/]/);
        return segs[segs.length - 1] || 'file';
    }

    function injectIntoInput(input, path, data) {
        var bytes = new Uint8Array(data);
        var file = new File([bytes], fileNameOf(path));
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 只拦截单选文件 input（.nbs/.mid/.zip 等）；目录选择与多选保持原样
    var origInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
        var input = this;
        try {
            if (input.type === 'file' && !input.multiple && !input.webkitdirectory) {
                var exts = parseAccept(input.accept);
                invoke('pick_file', { extensions: exts }).then(function (path) {
                    if (!path) { return null; }   // 用户取消，不再弹第二次
                    return invoke('read_file_bytes', { path: path }).then(function (data) {
                        injectIntoInput(input, path, data);
                        return null;
                    });
                }).catch(function (err) {
                    notify('打开文件失败：' + (err && err.message ? err.message : err));
                });
                return;
            }
        } catch (e) { /* 落到原生逻辑 */ }
        return origInputClick.apply(this, arguments);
    };

    /* ==================== 3. 窗口标题 ==================== */

    var lastTitle = '';

    function currentSongName() {
        try {
            var song = N.state && N.state.song;
            var n = song && (song.name || song.song_name);
            if (n) { return String(n); }
        } catch (e) { /* 用 DOM 兜底 */ }
        var el = document.getElementById('song-name');
        return el ? (el.textContent || '').trim() : '';
    }

    function isDirty() {
        try {
            var tab = typeof N.tabGetActive === 'function' ? N.tabGetActive() : null;
            if (tab) { return !!tab.dirty; }
            return !!(N.shared && N.shared._dirty);
        } catch (e) { return false; }
    }

    function refreshTitle() {
        var name = currentSongName();
        if (!name || name === APP_NAME) { name = '未命名'; }
        var title = APP_NAME + ' - ' + name + (isDirty() ? ' *' : '');
        if (title === lastTitle) { return; }
        lastTitle = title;
        invoke('set_app_title', { title: title }).catch(function () { });
    }

    // 轮询而非挂钩业务函数：避免与多标签页/自动保存的重渲染时序耦合，
    // 且 350ms 一次只读两个属性，开销可忽略。
    setInterval(refreshTitle, 350);
    refreshTitle();
})();
