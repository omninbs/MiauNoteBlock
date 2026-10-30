/* 19-soundfont.js — MiauNoteBlock 功能模块
   来源: 原 main.js L9738-L9929; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var _appDialogStack = N._appDialogStack;
    function $() { return N.$.apply(this, arguments); }
    function showAppConfirm() { return N.showAppConfirm.apply(this, arguments); }
    function showToast() { return N.showToast.apply(this, arguments); }
    function updateToast() { return N.updateToast.apply(this, arguments); }
    function dismissToast() { return N.dismissToast.apply(this, arguments); }
    function _appDialogOverlay() { return N._appDialogOverlay.apply(this, arguments); }
    function _appDialogBox() { return N._appDialogBox.apply(this, arguments); }
    function _closeAppDialog() { return N._closeAppDialog.apply(this, arguments); }
    function _appDialogBtn() { return N._appDialogBtn.apply(this, arguments); }

    //   'off'          不使用 (内置合成器)
    N.shared._sfConfig = null;
    var _sfOnDemandTriggered = false;

    function updateSfStatusText(status, info) {
        var el = $('settings-midi-sf-status');
        if (!el) return;
        var text = status;
        switch (status) {
            case 'idle': text = '未下载 (播放 MIDI 音符时按设置提示)'; break;
            case 'downloading': text = '正在下载' + (info && info.name ? ' ' + info.name : '') + '...'; break;
            case 'loading': text = '正在解析音色库...'; break;
            case 'ready':
                text = (info && info.name ? info.name : 'MIDI 音色库') + ' 已就绪 (' + ((info && info.presets) || 0) + ' 个预设' +
                    (info && info.engine ? ', ' + info.engine : '') + ')';
                break;
            case 'failed': text = '下载/解析失败, 将使用内置合成器'; break;
        }
        el.textContent = text;
    }

    function getMidiSfMode() {
        try {
            var v = localStorage.getItem('midi_sf_mode');
            if (v === 'auto' || v === 'off') return v;
        } catch (e) {}
        return 'ask';
    }

    function startSfDownload() {
        if (!window.SoundfontLoader) return;
        SoundfontLoader.download();
    }

    // 真正需要播放 MIDI 音符时调用: 按设置触发下载/询问 (每会话仅一次)
    function ensureSoundfontOnDemand() {
        if (_sfOnDemandTriggered) return;
        if (!window.SoundfontLoader || !N.shared._sfConfig || !N.shared._sfConfig.url) return;
        var mode = getMidiSfMode();
        if (mode === 'off') return;
        var st = SoundfontLoader.getStatus();
        if (st === 'ready' || st === 'downloading' || st === 'loading') return;
        _sfOnDemandTriggered = true;
        if (mode === 'auto') {
            startSfDownload();
        } else {
            // ask: 弹窗询问
            showAppConfirm('播放 MIDI 音符需要音色库 (SF3/SF2) 才能获得真实音色。是否现在下载？下载后可离线使用，解析期间仍可用内置合成器播放。', {
                title: '下载 MIDI 音色库',
                icon: 'fa-solid fa-cloud-arrow-down',
                okText: '下载', cancelText: '暂不'
            }).then(function(ok) {
                if (ok) startSfDownload();
            });
        }
    }

    function initSoundfontLoader(sfCfg) {
        if (!sfCfg || !sfCfg.url) return;
        if (!window.SoundfontLoader) return;
        N.shared._sfConfig = sfCfg;
        var toast = null;
        SoundfontLoader.onStatusChange = function(status, info) {
            updateSfStatusText(status, info);
            switch (status) {
                case 'downloading':
                    toast = showToast('正在下载 ' + (info.name || 'MIDI 音色库') + '...', {
                        icon: 'fa-solid fa-cloud-arrow-down', progress: 0
                    });
                    break;
                case 'loading':
                    if (toast) {
                        var ic = toast.querySelector('i');
                        if (ic) { ic.className = 'fa-solid fa-cog fa-spin'; ic.style.marginRight = '8px'; }
                        updateToast(toast, '正在解析音色库...', 0);
                    }
                    break;
                case 'ready':
                    if (toast) {
                        var ic2 = toast.querySelector('i');
                        if (ic2) { ic2.className = 'fa-solid fa-circle-check'; ic2.style.marginRight = '8px'; }
                        var fmt = info.isSF3 ? 'SF3' : 'SF2';
                        var eng = info.engine ? ' (' + info.engine + ')' : '';
                        updateToast(toast, fmt + ' 音色库已就绪' + eng + ' (' + (info.presets || 0) + ' 个预设)', 100);
                        dismissToast(toast, 3000);
                    }
                    break;
                case 'idle':
                    break;
                case 'failed':
                    if (toast) {
                        var ic3 = toast.querySelector('i');
                        if (ic3) { ic3.className = 'fa-solid fa-circle-exclamation'; ic3.style.marginRight = '8px'; }
                        updateToast(toast, '音色库下载失败, 将使用内置合成器', 0);
                        dismissToast(toast, 5000);
                    } else {
                        toast = showToast('音色库下载失败, 将使用内置合成器', {
                            icon: 'fa-solid fa-circle-exclamation', type: 'error', duration: 5000
                        });
                    }
                    break;
            }
        };
        SoundfontLoader.onProgress = function(loaded, total, name) {
            if (!toast) return;
            if (total > 0) {
                updateToast(toast, '正在下载 ' + name + ' (' + (loaded/1048576).toFixed(1) + '/' + (total/1048576).toFixed(1) + ' MB)', (loaded/total)*100);
            } else {
                updateToast(toast, '正在下载 ' + name + ' (' + (loaded/1048576).toFixed(1) + ' MB)', 0);
            }
        };
        SoundfontLoader.onParseProgress = function(prog) {
            if (toast) updateToast(toast, '正在解析音色库...', Math.max(10, prog * 100));
            updateSfStatusText('loading');
        };
        SoundfontLoader.init(sfCfg);
    }

    // ============ 隐私政策弹窗 ============
    function initPrivacyPopup() {
        var AGREED_KEY = 'webnbs_privacy_agreed';
        var alreadyAgreed = false;
        try {
            alreadyAgreed = localStorage.getItem(AGREED_KEY) === '1';
        } catch (e) {}

        var mask = $('privacy-popup-mask');
        var msgEl = $('privacy-popup-message');
        var btn = $('privacy-popup-agree');
        if (!mask || !btn) return;

        // 拉取服务器配置
        fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
            if (cfg && cfg.release) {
                showReleaseNotes(cfg.release);
                // 同步"关于"弹窗版本号 (与 config.yaml 的 release.version 保持一致)
                var aboutVer = $('about-version');
                if (aboutVer && cfg.release.version) aboutVer.textContent = cfg.release.version;
            }
            // 公开模式且首次访问才显示隐私弹窗
            if (!alreadyAgreed && cfg && cfg.privacy && cfg.privacy.enabled && cfg.is_public) {
                // 政策正文: 优先使用服务端 config.yaml 提供的文本, 未提供则沿用页面内置的完整政策
                if (msgEl && cfg.privacy.message) {
                    msgEl.textContent = String(cfg.privacy.message);
                }
                mask.style.display = 'flex';
            }
            // 初始化 SoundFont 音色库 (后台异步下载)
            if (cfg && cfg.soundfont) initSoundfontLoader(cfg.soundfont);
        }).catch(function() {
            // 离线打开 (file:// 协议) 或配置接口不可用时, 同样展示隐私声明:
            // 正文使用页面内置的完整政策 (同时覆盖"在线访问"与"离线软件"两种使用方式)
            if (!alreadyAgreed) mask.style.display = 'flex';
        });

        btn.addEventListener('click', function() {
            mask.style.display = 'none';
            try { localStorage.setItem(AGREED_KEY, '1'); } catch (e) {}
        });
    }

    function showReleaseNotes(release) {
        var version = String(release.version || '').trim();
        if (!version) return;
        var storageKey = 'webnbs_release_seen';
        try {
            if (localStorage.getItem(storageKey) === version) return;
            localStorage.setItem(storageKey, version);
        } catch (e) {}
        var overlay = _appDialogOverlay();
        var title = (window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t('update_notes') : '更新日志') + ' · ' + version;
        var box = _appDialogBox(title, '', 'fa-solid fa-sparkles', { maxWidth: 560 });
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        var notes = document.createElement('textarea');
        notes.readOnly = true;
        notes.value = String(release.notes || '');
        notes.setAttribute('aria-label', title);
        notes.style.cssText = 'width:100%;min-height:130px;resize:vertical;box-sizing:border-box;padding:8px;border:0;border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-primary);font:12px/1.55 var(--font-family);';
        body.appendChild(notes);
        var close = function() { _closeAppDialog(overlay); };
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var closeBtn = _appDialogBtn(window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t('close') : '关闭', true);
        closeBtn.addEventListener('click', close);
        box.querySelector('.popup-actions').appendChild(closeBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    }

    // ============ 横屏模式抽屉 ============

    // ---- 导出 ----
    N._sfOnDemandTriggered = _sfOnDemandTriggered;
    N.updateSfStatusText = updateSfStatusText;
    N.getMidiSfMode = getMidiSfMode;
    N.startSfDownload = startSfDownload;
    N.ensureSoundfontOnDemand = ensureSoundfontOnDemand;
    N.initSoundfontLoader = initSoundfontLoader;
    N.initPrivacyPopup = initPrivacyPopup;
    N.showReleaseNotes = showReleaseNotes;
})(window.WebNBS);
