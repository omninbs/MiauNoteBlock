/* 01-dialogs.js — MiauNoteBlock 功能模块
   来源: 原 main.js L380-L987; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function closeTransientFloats() { return N.closeTransientFloats.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function renderSongToBlob() { return N.renderSongToBlob.apply(this, arguments); }
    function setPlayButtonIcon() { return N.setPlayButtonIcon.apply(this, arguments); }
    function startPlaybackLoop() { return N.startPlaybackLoop.apply(this, arguments); }
    function stopPlaybackLoop() { return N.stopPlaybackLoop.apply(this, arguments); }
    function updateProgressUI() { return N.updateProgressUI.apply(this, arguments); }

    var _appDialogStack = [];

    function _appDialogOverlay() {
        // 弹出模态弹窗时先关闭残留的悬浮菜单, 避免其被遮罩盖住却仍占据点击热区
        closeTransientFloats();
        var ov = document.createElement('div');
        ov.className = 'app-dialog-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100400;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.15s ease;';
        return ov;
    }

    // 统一弹窗骨架, 与「缩放精度」弹窗同构:
    //   .popup-content > .settings-header(图标 + 标题 + 关闭) > .settings-body > .popup-actions
    // 不再写内联外观样式, 一律交给 style.css 驱动, 保证所有弹窗视觉一致。
    function _appDialogBox(title, message, icon, options) {
        options = options || {};
        var box = document.createElement('div');
        box.className = 'app-dialog-box popup-content';
        box.style.cssText = 'width:100%;max-width:' + (options.maxWidth || 400) + 'px;';
        box.innerHTML =
            '<div class="settings-header">'
            + '<i class="' + (icon || 'fa-solid fa-circle-info') + '"></i>'
            + '<h4></h4>'
            + '<button class="settings-close-btn" id="app-dialog-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body" style="white-space:pre-line;"></div>'
            + '<div class="popup-actions"></div>';
        box.querySelector('.settings-header h4').textContent = title || '';
        // message 允许包含简单 HTML (如 <b>), 保持既有行为
        box.querySelector('.settings-body').innerHTML = message || '';
        return box;
    }

    function _appDialogBtn(text, primary) {
        var b = document.createElement('button');
        b.className = 'popup-btn ' + (primary ? 'popup-btn-primary' : 'popup-btn-cancel');
        b.textContent = text;
        return b;
    }

    function _closeAppDialog(overlay, resolve, value) {
        var idx = _appDialogStack.indexOf(overlay);
        if (idx >= 0) _appDialogStack.splice(idx, 1);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (resolve) resolve(value);
    }

    // showAppAlert(message, options) -> Promise<void>
    // options: { title, icon, okText }
    function showAppAlert(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '提示'), i18nText(message), options.icon || 'fa-solid fa-circle-info', options);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var close = function() { _closeAppDialog(overlay, resolve); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', close);
            box.querySelector('.popup-actions').appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { okBtn.focus(); }, 50);
        });
    }

    // showAppConfirm(message, options) -> Promise<boolean> (无 checkbox) | Promise<{ok, checked}>
    // options: { title, icon, okText, cancelText, checkbox: { label, checked } }
    function showAppConfirm(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '确认'), i18nText(message), options.icon || 'fa-solid fa-circle-question', options);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var result = { ok: false, checked: !!(options.checkbox && options.checkbox.checked) };
            var cb = null;
            if (options.checkbox) {
                var body = box.querySelector('.settings-body');
                var wrap = document.createElement('label');
                wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;';
                cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = result.checked;
                wrap.appendChild(cb);
                var span = document.createElement('span');
                span.textContent = i18nText(options.checkbox.label || '');
                if (options.checkbox.title) span.title = i18nText(options.checkbox.title);
                wrap.appendChild(span);
                body.appendChild(wrap);
            }
            var close = function() {
                _closeAppDialog(overlay, resolve, options.checkbox ? result : result.ok);
            };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', function() {
                result.ok = true;
                if (cb) result.checked = cb.checked;
                close();
            });
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { okBtn.focus(); }, 50);
        });
    }

    // showAppPrompt(message, defaultValue, options) -> Promise<string|null>
    // options: { title, icon, okText, cancelText, placeholder }
    function showAppPrompt(message, defaultValue, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '输入'), i18nText(message), options.icon || 'fa-solid fa-keyboard', options);
            // 在 body 中追加输入框
            var body = box.querySelector('.settings-body');
            var input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue || '';
            input.placeholder = i18nText(options.placeholder || '');
            input.style.cssText = 'width:100%;margin-top:8px;padding:8px 10px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
            body.appendChild(input);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var result = null;
            var close = function() { _closeAppDialog(overlay, resolve, result); };
            var submit = function() { result = input.value; close(); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { close(); }
            });
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', submit);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { input.focus(); input.select(); }, 50);
        });
    }

    // showExportDialog(defaultName, defaultAuthor, defaultDesc, options) -> Promise<{name, author, description}|null>
    // 导出弹窗: 文件名(必填) + 折叠的作者/介绍输入
    function showExportDialog(defaultName, defaultAuthor, defaultDesc, options) {
        options = options || {};
        // options.customInstruments: 作品使用到的自定义音色编号数组(>=20), 非空时在弹窗内警告并提供「作品包(zip)」选项
        var customNos = (options.customInstruments && options.customInstruments.length) ? options.customInstruments.slice() : null;
        var hasLyrics = !!options.hasLyrics;
        var segCount = options.segmentCount || 0;
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '导出 NBS'), '', options.icon || 'fa-solid fa-file-export', { maxWidth: (customNos || hasLyrics || segCount > 1) ? 480 : 420 });
            var body = box.querySelector('.settings-body');
            // 清空默认 message 内容
            body.textContent = '';

            // 文件名输入
            var nameLabel = document.createElement('label');
            nameLabel.textContent = i18nText('文件名:');
            nameLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;font-weight:500;';
            body.appendChild(nameLabel);

            var nameInputWrap = document.createElement('div');
            nameInputWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = defaultName || '';
            nameInput.placeholder = i18nText('请输入文件名');
            nameInput.style.cssText = 'flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
            var extSpan = document.createElement('span');
            extSpan.textContent = '.nbs';
            extSpan.style.cssText = 'font-size:12px;color:var(--text-tertiary,#888);flex-shrink:0;';
            nameInputWrap.appendChild(nameInput);
            nameInputWrap.appendChild(extSpan);
            body.appendChild(nameInputWrap);

            // 折叠栏: 作者和介绍
            var collapseWrap = document.createElement('div');
            collapseWrap.style.cssText = 'margin-top:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);overflow:hidden;';
            var collapseHeader = document.createElement('div');
            collapseHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;background:var(--ctrl-fill-default,#1c1c1c);user-select:none;font-size:12px;color:var(--text-secondary,#aaa);';
            collapseHeader.innerHTML = '<span><i class="fa-solid fa-chevron-right" style="margin-right:6px;transition:transform 0.15s;font-size:10px;"></i>' + i18nText('作者和介绍 (可选)') + '</span>';
            var collapseBody = document.createElement('div');
            collapseBody.style.cssText = 'padding:10px 12px;display:none;border-top:1px solid var(--ctrl-stroke-default,#444);';
            collapseWrap.appendChild(collapseHeader);
            collapseWrap.appendChild(collapseBody);
            body.appendChild(collapseWrap);

            var collapsed = true;
            var chevron = collapseHeader.querySelector('i');
            collapseHeader.addEventListener('click', function(e) {
                e.stopPropagation();
                collapsed = !collapsed;
                collapseBody.style.display = collapsed ? 'none' : 'block';
                chevron.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
            });

            // 作者输入
            var authorLabel = document.createElement('label');
            authorLabel.textContent = i18nText('作者:');
            authorLabel.style.cssText = 'display:block;font-size:12px;color:var(--text-primary,#fff);margin-bottom:4px;';
            collapseBody.appendChild(authorLabel);
            var authorInput = document.createElement('input');
            authorInput.type = 'text';
            authorInput.value = defaultAuthor || '';
            authorInput.placeholder = i18nText('作者名 (可选)');
            authorInput.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;margin-bottom:10px;';
            collapseBody.appendChild(authorInput);

            // 介绍输入
            var descLabel = document.createElement('label');
            descLabel.textContent = i18nText('介绍:');
            descLabel.style.cssText = 'display:block;font-size:12px;color:var(--text-primary,#fff);margin-bottom:4px;';
            collapseBody.appendChild(descLabel);
            var descInput = document.createElement('textarea');
            descInput.value = defaultDesc || '';
            descInput.placeholder = i18nText('歌曲介绍 (可选)');
            descInput.rows = 3;
            descInput.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;resize:vertical;font-family:inherit;';
            collapseBody.appendChild(descInput);

            // ---------- 自定义音色警告 + 作品包选项 ----------
            var packageChk = null;
            if (customNos && customNos.length) {
                var warnWrap = document.createElement('div');
                warnWrap.style.cssText = 'margin-top:12px;border:1px solid rgba(255,255,255,0.10);border-left:2px solid rgba(230,168,74,0.75);border-radius:var(--radius-sm,6px);padding:10px 12px;background:rgba(255,255,255,0.035);';
                var warnTitle = document.createElement('div');
                warnTitle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--accent-orange,#ffb43c);margin-bottom:6px;';
                warnTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>本作品使用了 ' + customNos.length + ' 个自定义音色</span>';
                warnWrap.appendChild(warnTitle);
                var warnText = document.createElement('div');
                warnText.style.cssText = 'font-size:12px;color:var(--text-secondary,#aaa);line-height:1.7;margin-bottom:8px;';
                warnText.textContent = '标准 .nbs 只保存音色引用（不含音频），在其它设备/播放器上这些音色会静音。';
                warnWrap.appendChild(warnText);
                var packageLbl = document.createElement('label');
                packageLbl.style.cssText = 'display:flex;align-items:flex-start;gap:6px;font-size:12px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;line-height:1.6;';
                packageChk = document.createElement('input');
                packageChk.type = 'checkbox';
                packageChk.style.cssText = 'accent-color:var(--accent-primary,#4aa3ff);width:14px;height:14px;margin-top:2px;flex-shrink:0;';
                packageLbl.appendChild(packageChk);
                packageLbl.appendChild(document.createTextNode('导出自定义音色作品包 (zip)：歌曲 + 使用到的音色音频一起打包，完整携带音色'));
                warnWrap.appendChild(packageLbl);
                body.appendChild(warnWrap);
            }

            // ---------- 歌词导出选项 ----------
            var lyricsChk = null;
            if (hasLyrics) {
                var lyWrap = document.createElement('div');
                lyWrap.style.cssText = 'margin-top:12px;border:1px solid rgba(255,255,255,0.10);border-left:2px solid rgba(74,144,217,0.75);border-radius:var(--radius-sm,6px);padding:10px 12px;background:rgba(255,255,255,0.035);';
                var lyTitle = document.createElement('div');
                lyTitle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-primary,#e4e8ec);margin-bottom:6px;';
                lyTitle.innerHTML = '<i class="fa-solid fa-microphone-lines"></i><span>' + i18nText('本作品包含歌词标注') + '</span>';
                lyWrap.appendChild(lyTitle);
                var lyLbl = document.createElement('label');
                lyLbl.style.cssText = 'display:flex;align-items:flex-start;gap:6px;font-size:12px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;line-height:1.6;';
                lyricsChk = document.createElement('input');
                lyricsChk.type = 'checkbox';
                lyricsChk.checked = true;
                lyricsChk.style.cssText = 'accent-color:var(--accent-primary,#4aa3ff);width:14px;height:14px;margin-top:2px;flex-shrink:0;';
                lyLbl.appendChild(lyricsChk);
                lyLbl.appendChild(document.createTextNode(i18nText('同时导出歌词 (打包为 zip：歌曲 + lyrics.json)')));
                lyWrap.appendChild(lyLbl);
                body.appendChild(lyWrap);
            }

            // ---------- 片段导出选项 (存在多个片段时) ----------
            var segmentsZipRadio = null;
            var mergeSegRadio = null;
            if (segCount > 1) {
                var segWrap = document.createElement('div');
                segWrap.style.cssText = 'margin-top:12px;border:1px solid rgba(255,255,255,0.10);border-left:2px solid rgba(74,144,217,0.75);border-radius:var(--radius-sm,6px);padding:10px 12px;background:rgba(255,255,255,0.035);';
                var segTitle = document.createElement('div');
                segTitle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-primary,#e4e8ec);margin-bottom:6px;';
                segTitle.innerHTML = '<i class="fa-solid fa-film"></i><span>' + i18nText('本作品包含') + ' ' + segCount + ' ' + i18nText('个片段') + '</span>';
                segWrap.appendChild(segTitle);

                var mkRow = function(value, labelText, checked) {
                    var lbl = document.createElement('label');
                    lbl.style.cssText = 'display:flex;align-items:flex-start;gap:6px;font-size:12px;color:var(--text-primary,#fff);cursor:pointer;user-select:none;line-height:1.6;margin-top:4px;';
                    var r = document.createElement('input');
                    r.type = 'radio';
                    r.name = 'nbs-export-segment-mode';
                    r.value = value;
                    r.checked = !!checked;
                    r.style.cssText = 'accent-color:var(--accent,#4a90d9);width:14px;height:14px;margin-top:2px;flex-shrink:0;';
                    lbl.appendChild(r);
                    lbl.appendChild(document.createTextNode(labelText));
                    segWrap.appendChild(lbl);
                    return r;
                };
                mergeSegRadio = mkRow('merge', i18nText('合并后导出：把片段首尾相接，消除空隙'), true);
                segmentsZipRadio = mkRow('keep', i18nText('保留片段：导出为 ZIP（歌曲 + segments.json 分割信息）'), false);
                var segHint = document.createElement('div');
                segHint.style.cssText = 'font-size:11px;color:var(--text-tertiary,#888);line-height:1.6;margin-top:6px;';
                segHint.textContent = i18nText('「保留片段」会同时保留片段之间的空隙；ZIP 内记录每段的分割位置，重新导入可还原。');
                segWrap.appendChild(segHint);
                body.appendChild(segWrap);
            }

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            // ---------- NBS 版本 (从设置移到导出弹窗, 导出时决定) ----------
            var versionSel = document.createElement('select');
            var vWrap = document.createElement('div');
            vWrap.style.cssText = 'margin-top:12px;display:flex;align-items:center;gap:8px;';
            var vLabel = document.createElement('label');
            vLabel.textContent = i18nText('NBS 版本');
            vLabel.style.cssText = 'font-size:12px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0;';
            versionSel.style.cssText = 'flex:1;height:28px;padding:0 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);';
            var vOptions = [['4', 'V4'], ['5', 'V5'], ['6', 'V6']];
            for (var vi = 0; vi < vOptions.length; vi++) {
                var opt = document.createElement('option');
                opt.value = vOptions[vi][0];
                opt.textContent = vOptions[vi][1];
                versionSel.appendChild(opt);
            }
            var vDefault = 5;
            try {
                var savedVer = parseInt(localStorage.getItem('nbs_export_version'), 10);
                if (savedVer === 4 || savedVer === 5 || savedVer === 6) vDefault = savedVer;
            } catch (e) {}
            // 含铜号角 (16~19) 或自定义音色 (>=20) 时只有 V6 能完整保存, 版本被锁定
            if (options.lockV6) {
                vDefault = 6;
                versionSel.disabled = true;
                versionSel.style.opacity = '0.6';
                versionSel.style.cursor = 'not-allowed';
            }
            versionSel.value = String(vDefault);
            vWrap.appendChild(vLabel);
            vWrap.appendChild(versionSel);
            body.appendChild(vWrap);
            if (options.lockV6) {
                var vHint = document.createElement('div');
                vHint.style.cssText = 'font-size:11px;color:var(--text-tertiary,#888);line-height:1.6;margin-top:4px;';
                vHint.textContent = i18nText('作品使用了铜号角或自定义音色，仅 V6 可以完整保存，版本已锁定为 V6。');
                body.appendChild(vHint);
            }

            var result = null;
            var close = function() { _closeAppDialog(overlay, resolve, result); };
            var submit = function() {
                var name = (nameInput.value || '').trim();
                if (!name) {
                    nameInput.style.borderColor = 'var(--accent-orange,#ff8c42)';
                    nameInput.focus();
                    return;
                }
                // 移除末尾的 .nbs 后缀 (保存时会自动添加)
                if (name.toLowerCase().endsWith('.nbs')) {
                    name = name.slice(0, -4);
                }
                result = {
                    name: name,
                    author: (authorInput.value || '').trim(),
                    description: (descInput.value || '').trim(),
                    packageZip: !!(packageChk && packageChk.checked),
                    lyricsZip: !!(lyricsChk && lyricsChk.checked),
                    segmentsZip: !!(segmentsZipRadio && segmentsZipRadio.checked),
                    mergeSegments: !!(mergeSegRadio && mergeSegRadio.checked),
                    nbsVersion: parseInt(versionSel.value, 10) || 5
                };
                close();
            };

            box.querySelector('#app-dialog-x').addEventListener('click', close);
            nameInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { close(); }
            });
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '导出'), true);
            okBtn.addEventListener('click', submit);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { nameInput.focus(); nameInput.select(); }, 50);
        });
    }

    // showAudioExportDialog() -> 独立的音频导出弹窗 (MP3/WAV + 音效风格 + 渲染进度)
    function showAudioExportDialog() {
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox('导出为音频', '', 'fa-solid fa-music', { maxWidth: 420 });
            var body = box.querySelector('.settings-body');
            body.textContent = '';

            // 文件名输入
            var nameLabel = document.createElement('label');
            nameLabel.textContent = '文件名:';
            nameLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;font-weight:500;';
            body.appendChild(nameLabel);

            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            var defaultName = (state.importedFileName || (state.song.name || state.song.song_name || 'song')).replace(/\.(nbs|mp3|wav)$/i, '');
            nameInput.value = defaultName || 'song';
            nameInput.placeholder = '请输入文件名';
            nameInput.style.cssText = 'width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
            body.appendChild(nameInput);

            var aeBody = document.createElement('div');
            aeBody.style.cssText = 'margin-top:10px;';
            body.appendChild(aeBody);

            // 分段按钮样式
            var SEG_OFF = 'padding:5px 12px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#555);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-secondary,#aaa);cursor:pointer;';
            var SEG_ON  = 'padding:5px 12px;font-size:12px;border:1px solid var(--accent-primary,#4aa3ff);border-radius:var(--radius-sm,6px);background:var(--accent-primary,#4aa3ff);color:#fff;cursor:pointer;';
            function setSegVisual(b, on) {
                b.style.cssText = on ? SEG_ON : SEG_OFF;
            }
            function segPicker(container, items, initialIdx, onChange) {
                var btns = [];
                items.forEach(function(label, idx) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.style.cssText = SEG_OFF;
                    b.addEventListener('click', function() {
                        if (b.classList.contains('seg-on')) return;
                        btns.forEach(function(o) { o.classList.remove('seg-on'); setSegVisual(o, false); });
                        b.classList.add('seg-on');
                        setSegVisual(b, true);
                        if (onChange) onChange(idx);
                    });
                    container.appendChild(b);
                    btns.push(b);
                });
                if (initialIdx >= 0 && btns[initialIdx]) {
                    btns[initialIdx].classList.add('seg-on');
                    setSegVisual(btns[initialIdx], true);
                }
                return btns;
            }

            // 格式: MP3 / WAV
            var fmtRow = document.createElement('div');
            fmtRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
            fmtRow.innerHTML = '<span style="font-size:12px;color:var(--text-primary,#fff);min-width:38px;">格式</span>';
            var fmtSeg = document.createElement('div');
            fmtSeg.style.cssText = 'display:flex;gap:6px;';
            fmtRow.appendChild(fmtSeg);
            aeBody.appendChild(fmtRow);
            var fmtMp3 = true;
            var kbpsRow = document.createElement('div');
            kbpsRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
            kbpsRow.innerHTML = '<span style="font-size:12px;color:var(--text-primary,#fff);min-width:38px;">码率</span>';
            var kbpsSeg = document.createElement('div');
            kbpsSeg.style.cssText = 'display:flex;gap:6px;';
            kbpsRow.appendChild(kbpsSeg);
            aeBody.appendChild(kbpsRow);
            segPicker(fmtSeg, ['MP3', 'WAV'], 0, function(idx) {
                fmtMp3 = (idx === 0);
                kbpsRow.style.display = fmtMp3 ? 'flex' : 'none';
            });
            var kbps = 192;
            segPicker(kbpsSeg, ['128k', '192k', '320k'], 1, function(idx) { kbps = [128, 192, 320][idx]; });

            // 音效风格
            var styleRow = document.createElement('div');
            styleRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;';
            styleRow.innerHTML = '<span style="font-size:12px;color:var(--text-primary,#fff);min-width:38px;">风格</span>';
            var styleSeg = document.createElement('div');
            styleSeg.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
            styleRow.appendChild(styleSeg);
            aeBody.appendChild(styleRow);
            var styleDescRow = document.createElement('div');
            styleDescRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
            var styleDesc = document.createElement('div');
            styleDesc.style.cssText = 'font-size:11px;color:var(--text-tertiary,#888);line-height:1.5;flex:1;';
            styleDescRow.appendChild(styleDesc);
            aeBody.appendChild(styleDescRow);

            var styleOrder = (window.AudioRender && AudioRender.STYLE_ORDER) ? AudioRender.STYLE_ORDER : ['dry'];
            var currentStyle = styleOrder[0];
            styleDesc.textContent = AudioRender.STYLES[currentStyle].desc;
            segPicker(styleSeg, styleOrder.map(function(id) { return AudioRender.STYLES[id].name; }), 0, function(idx) {
                currentStyle = styleOrder[idx];
                styleDesc.textContent = AudioRender.STYLES[currentStyle].desc;
            });

            // 独立试听按钮 (不影响主界面播放风格)
            var previewBtn = document.createElement('button');
            previewBtn.type = 'button';
            previewBtn.style.cssText = 'padding:4px 10px;font-size:11px;border:1px solid var(--accent-secondary,#2f9e6e);border-radius:var(--radius-sm,6px);background:rgba(47,158,110,0.12);color:var(--accent-secondary,#2f9e6e);cursor:pointer;white-space:nowrap;';
            previewBtn.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i>试听';
            styleDescRow.appendChild(previewBtn);
            var previewing = false;
            var savedStyle = null;
            var previewStopTimer = null;
            function stopPreview() {
                if (!previewing) return;
                previewing = false;
                if (previewStopTimer) { clearTimeout(previewStopTimer); previewStopTimer = null; }
                // 停止当前播放循环并静音所有音源, 再恢复之前的实时风格
                if (state.isPlaying) {
                    stopPlaybackLoop();
                    if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
                    setPlayButtonIcon(false);
                    updateProgressUI();
                    if (state.pianoRoll) {
                        state.pianoRoll.isPlaying = false;
                        state.pianoRoll.clearPlayHighlights();
                    }
                }
                state.isPlaying = false;
                if (savedStyle !== null && window.AudioEngine && AudioEngine.setStyle) {
                    AudioEngine.setStyle(savedStyle);
                }
                savedStyle = null;
                previewBtn.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i>试听';
            }
            previewBtn.addEventListener('click', function() {
                if (previewing) { stopPreview(); return; }
                previewing = true;
                previewBtn.innerHTML = '<i class="fa-solid fa-stop" style="margin-right:4px;"></i>停止';
                if (window.AudioEngine && AudioEngine.getStyle) savedStyle = AudioEngine.getStyle();
                if (window.AudioEngine && AudioEngine.setStyle) AudioEngine.setStyle(currentStyle);
                // 试听 = 用所选风格启动实时播放循环 (AudioEngine.stop 不存在, 直接走主播放链路)
                if (state.isPlaying) stopPlaybackLoop();
                if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
                state.isPlaying = true;
                setPlayButtonIcon(true);
                startPlaybackLoop();
                previewStopTimer = setTimeout(stopPreview, 15000);
            });

            // 渲染进度
            var aeProgWrap = document.createElement('div');
            aeProgWrap.style.cssText = 'display:none;margin-bottom:8px;';
            var aeProgLabel = document.createElement('div');
            aeProgLabel.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);margin-bottom:4px;';
            aeProgLabel.textContent = '准备渲染…';
            var aeProgTrack = document.createElement('div');
            aeProgTrack.style.cssText = 'height:6px;border-radius:3px;background:var(--ctrl-fill-default,#1c1c1c);overflow:hidden;border:1px solid var(--ctrl-stroke-default,#444);';
            var aeProgBar = document.createElement('div');
            aeProgBar.style.cssText = 'height:100%;width:0;background:var(--accent-primary,#4aa3ff);transition:width 0.2s;';
            aeProgTrack.appendChild(aeProgBar);
            aeProgWrap.appendChild(aeProgLabel);
            aeProgWrap.appendChild(aeProgTrack);
            aeBody.appendChild(aeProgWrap);
            function setAeProgress(label, pct) {
                aeProgWrap.style.display = 'block';
                if (label) aeProgLabel.textContent = label;
                aeProgBar.style.width = Math.max(2, Math.min(100, pct)) + '%';
            }
            function hideAeProgress() { aeProgWrap.style.display = 'none'; }

            // 底部按钮区: 渲染并导出 + 关闭
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);
            var close = function() { stopPreview(); _closeAppDialog(overlay, resolve, null); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var exportBtn = _appDialogBtn('渲染并导出', true);
            exportBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right:5px;"></i>渲染并导出';
            exportBtn.addEventListener('click', function() {
                if (exportBtn.disabled) return;
                var name = (nameInput.value || defaultName || 'song').trim();
                name = name.replace(/\.(nbs|mp3|wav)$/i, '');
                if (!name) name = 'song';
                exportBtn.disabled = true;
                setAeProgress('准备渲染…', 3);
                renderSongToBlob({
                    name: name,
                    format: fmtMp3 ? 'mp3' : 'wav',
                    kbps: kbps,
                    styleId: currentStyle,
                    onProgress: function(label, pct) { setAeProgress(label, pct); }
                }).then(function(res) {
                    hideAeProgress();
                    exportBtn.disabled = false;
                    AudioRender.downloadBlob(res.blob, res.filename);
                    showAppAlert('音频已导出：' + res.filename, { title: '导出完成', icon: 'fa-solid fa-circle-check' });
                }).catch(function(err) {
                    hideAeProgress();
                    exportBtn.disabled = false;
                    showAppAlert('音频导出失败：' + (err && err.message ? err.message : '未知错误'), { title: '音频导出', icon: 'fa-solid fa-triangle-exclamation' });
                });
            });
            var closeBtn = _appDialogBtn('关闭', false);
            closeBtn.addEventListener('click', close);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(exportBtn);
            actions.appendChild(closeBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { nameInput.focus(); nameInput.select(); }, 50);
        });
    }

    // ---- 导出 ----
    N._appDialogOverlay = _appDialogOverlay;
    N._appDialogBox = _appDialogBox;
    N._appDialogBtn = _appDialogBtn;
    N._closeAppDialog = _closeAppDialog;
    N.showAppAlert = showAppAlert;
    N.showAppConfirm = showAppConfirm;
    N.showAppPrompt = showAppPrompt;
    N.showExportDialog = showExportDialog;
    N.showAudioExportDialog = showAudioExportDialog;
    N._appDialogStack = _appDialogStack;
})(window.WebNBS);
