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
    function showToast() { return N.showToast.apply(this, arguments); }
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
                    showToast(i18nText('音频已导出') + ': ' + res.filename, { icon: 'fa-solid fa-music' });
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

    // 导出 NBS / MNB 前的元数据弹窗 (文件名 / 作者 / 描述)
    // resolve(null) = 取消; resolve({name, author, description}) = 确认导出
    function showExportMetaDialog(defaults, format) {
        defaults = defaults || {};
        var isMNB = (format === 'mnb');
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var title = isMNB ? '导出为 MNB 工程' : '导出为 NBS';
            var box = _appDialogBox(i18nText(title), '',
                isMNB ? 'fa-solid fa-box-archive' : 'fa-solid fa-file-export', { maxWidth: 440 });
            var body = box.querySelector('.settings-body');
            body.textContent = '';
            body.style.whiteSpace = 'normal';

            var tip = document.createElement('div');
            tip.className = 'dlg-hint';
            var tipText = isMNB ? i18nText('工程包') : i18nText('歌曲文件');
            tip.innerHTML = '<i class="fa-solid fa-circle-info"></i><span></span>';
            tip.querySelector('span').textContent = tipText;
            tip.title = isMNB
                ? i18nText('压缩包格式, 内含歌曲、歌词、片段与自定义音色, 可用「打开文件」重新导入')
                : i18nText('标准 NBS 歌曲文件, 不含歌词与片段信息');
            body.appendChild(tip);

            var fields = {};
            function addField(key, label, value, placeholder, multiline) {
                var wrap = document.createElement('div');
                wrap.className = 'dlg-field';
                var lab = document.createElement('label');
                lab.className = 'dlg-label';
                lab.textContent = i18nText(label);
                wrap.appendChild(lab);
                var el = multiline ? document.createElement('textarea') : document.createElement('input');
                if (multiline) { el.rows = 3; }
                else { el.type = 'text'; }
                el.className = 'dlg-input';
                el.value = value || '';
                el.placeholder = i18nText(placeholder || '');
                wrap.appendChild(el);
                body.appendChild(wrap);
                fields[key] = el;
            }

            addField('name', '文件名', defaults.name || '', '不含扩展名');
            addField('author', '作者', defaults.author || '', '可选');
            addField('description', '描述', defaults.description || '', '可选', true);

            // 插入 DOM 并入栈: 此前缺失导致弹窗创建在游离节点上, 永远不可见
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var done = false;
            var close = function() {
                if (done) return;
                done = true;
                _closeAppDialog(overlay, resolve, null);
            };
            var submit = function() {
                if (done) return;
                done = true;
                _closeAppDialog(overlay, resolve, {
                    name: fields.name.value.trim() || defaults.name || 'Untitled',
                    author: fields.author.value.trim(),
                    description: fields.description.value.trim()
                });
            };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var cancelBtn = _appDialogBtn(i18nText('取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText('导出'), true);
            okBtn.addEventListener('click', submit);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            box.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault(); submit();
                }
                if (e.key === 'Escape') close();
            });
            setTimeout(function() { fields.name.focus(); fields.name.select(); }, 50);
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
    N.showAudioExportDialog = showAudioExportDialog;
    N.showExportMetaDialog = showExportMetaDialog;
    N._appDialogStack = _appDialogStack;
})(window.WebNBS);
