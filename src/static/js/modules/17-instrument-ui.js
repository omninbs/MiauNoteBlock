/* 17-instrument-ui.js — MiauNoteBlock 功能模块
   来源: 原 main.js L9361-L9684; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function $() { return N.$.apply(this, arguments); }
    function getInstrumentNames() { return N.getInstrumentNames.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }


    // ============ 乐器选择器 ============
    function createInstrumentSelectorDOM() {
        var btn = $('btn-instrument-selector');
        if (!btn) return;

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleInstrumentPopup();
        });

        // 创建弹窗（如已存在则复用）
        var popup = $('instrument-popup');
        if (popup) return;
        popup = document.createElement('div');
        popup.id = 'instrument-popup';
        popup.className = 'instrument-popup';
        popup.style.cssText = 'position:fixed;z-index:9998;'
            + 'background:rgba(22,33,62,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:8px 0;min-width:200px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;max-height:400px;overflow-y:auto;';
        document.body.appendChild(popup);
    }

    function toggleInstrumentPopup() {
        // 桌面端使用浮动窗口
        if (window.innerWidth >= 769) {
            showInstrumentFloatingWindow();
            return;
        }
        var popup = $('instrument-popup');
        if (!popup) return;
        if (popup.classList.contains('visible')) {
            popup.classList.remove('visible');
            return;
        }
        popup.classList.add('visible');
        renderInstrumentPopup();
        var btn = $('btn-instrument-selector');
        if (btn) {
            var btnRect = btn.getBoundingClientRect();
            window.WebNBSPositionFlyout(popup, btnRect, { placement: 'top-end' });
        }
    }

    function showInstrumentFloatingWindow() {
        var existing = $('inst-float-win');
        if (existing) { existing.remove(); return; }

        var win = document.createElement('div');
        win.id = 'inst-float-win';
        win.style.cssText = 'position:fixed;bottom:40px;right:16px;z-index:9998;background:rgba(20,20,34,var(--surface-bg-alpha));backdrop-filter:var(--surface-blur);-webkit-backdrop-filter:var(--surface-blur);border:1px solid var(--ctrl-stroke-default);border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(8,40px);gap:4px;box-shadow:0 8px 32px rgba(0,0,0,0.5);cursor:default;';

        var instNames = getInstrumentNames();

        // 更新所有按钮的高亮状态
        function updateButtonHighlight() {
            var btns = win.querySelectorAll('button');
            for (var b = 0; b < btns.length; b++) {
                var bIdx = parseInt(btns[b].getAttribute('data-idx'));
                var cColor = btns[b].getAttribute('data-custom-color');
                if (bIdx === state.currentInstrument) {
                    // 自定义音色选中时保留其纯色图标, 仅用边框/亮度标记选中态
                    btns[b].style.background = cColor || 'var(--ctrl-fill-pressed)';
                    btns[b].style.borderColor = 'var(--accent)';
                    btns[b].style.filter = 'brightness(1.12)';
                } else {
                    btns[b].style.background = cColor || 'var(--ctrl-fill-default)';
                    btns[b].style.borderColor = cColor ? 'rgba(255,255,255,0.28)' : 'var(--ctrl-stroke-default)';
                    btns[b].style.filter = '';
                }
            }
        }

        for (var i = 0; i < instNames.length; i++) {
            (function(idx) {
                var btn = document.createElement('button');
                btn.setAttribute('data-idx', idx);
                btn.style.cssText = 'width:36px;height:36px;padding:2px;background:' + (state.currentInstrument === idx ? 'var(--ctrl-fill-pressed)' : 'var(--ctrl-fill-default)') + ';border:1px solid ' + (state.currentInstrument === idx ? 'var(--accent)' : 'var(--ctrl-stroke-default)') + ';border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.12s,border-color 0.12s;';
                btn.innerHTML = '<img src="static/sprites/spr_instrumenticons/inst_' + idx + '.png" style="width:28px;height:28px;image-rendering:pixelated;" onerror="this.style.display=\'none\'">';
                btn.title = instNames[idx];
                btn.addEventListener('mouseenter', function() {
                    btn.style.background = 'var(--ctrl-fill-hover)';
                    btn.style.borderColor = 'var(--accent)';
                });
                btn.addEventListener('mouseleave', function() {
                    if (state.currentInstrument !== idx) {
                        btn.style.background = 'var(--ctrl-fill-default)';
                        btn.style.borderColor = 'var(--ctrl-stroke-default)';
                    }
                });
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    state.currentInstrument = idx;
                    if (state.pianoRoll) state.pianoRoll.setInstrument(idx);
                    updateInstrumentSelectorUI();
                    // 不再关闭窗口, 仅更新高亮
                    updateButtonHighlight();
                    markDirty();
                });
                win.appendChild(btn);
            })(i);
        }

        // 自定义音色区段
        var customs = (window.CustomInstruments) ? CustomInstruments.list() : [];
        if (customs.length > 0) {
            var sep = document.createElement('div');
            sep.style.cssText = 'grid-column:1/-1;height:1px;background:rgba(255,255,255,0.12);margin:2px 0;';
            win.appendChild(sep);
            for (var c = 0; c < customs.length; c++) {
                (function(citem) {
                    var cBtn = document.createElement('button');
                    cBtn.setAttribute('data-idx', citem.instrument);
                    cBtn.setAttribute('data-custom-color', citem.color || '#4aa3ff');
                    cBtn.style.cssText = 'width:36px;height:36px;padding:2px;background:' + citem.color + ';border:1px solid ' + (state.currentInstrument === citem.instrument ? 'var(--accent)' : 'rgba(255,255,255,0.35)') + ';border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.12s,border-color 0.12s;box-sizing:border-box;';
                    cBtn.title = citem.name;
                    cBtn.addEventListener('mouseenter', function() {
                        cBtn.style.filter = 'brightness(1.18)';
                        cBtn.style.borderColor = 'var(--accent)';
                    });
                    cBtn.addEventListener('mouseleave', function() {
                        cBtn.style.filter = '';
                        if (state.currentInstrument !== citem.instrument) {
                            cBtn.style.borderColor = 'rgba(255,255,255,0.35)';
                        } else {
                            cBtn.style.borderColor = 'var(--accent)';
                        }
                    });
                    cBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        state.currentInstrument = citem.instrument;
                        if (state.pianoRoll) state.pianoRoll.setInstrument(citem.instrument);
                        updateInstrumentSelectorUI();
                        updateButtonHighlight();
                        markDirty();
                    });
                    win.appendChild(cBtn);
                })(customs[c]);
            }
        }

        document.body.appendChild(win);

        // 拖拽功能: 在窗口空白处 (非按钮/图片) 按下鼠标可拖动窗口
        var isDragging = false;
        var dragOffsetX = 0, dragOffsetY = 0;

        win.addEventListener('mousedown', function(e) {
            // 仅在点击窗口本身 (非乐器按钮/图片) 时开始拖拽
            if (e.target === win || (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'IMG')) {
                isDragging = true;
                var rect = win.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                win.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                win.style.left = (e.clientX - dragOffsetX) + 'px';
                win.style.top = (e.clientY - dragOffsetY) + 'px';
                win.style.right = 'auto';
                win.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                win.style.cursor = 'default';
            }
        });
    }

    function renderInstrumentPopup() {
        var popup = $('instrument-popup');
        if (!popup) return;
        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        var html = '';
        for (var i = 0; i < names.length; i++) {
            var sel = (i === state.currentInstrument) ? ' ctx-selected' : '';
            var color = colors[i] || '#d4a96a';
            html += '<div class="ctx-item inst-popup-item' + sel + '" data-instrument="' + i + '" style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;">';
            // 方块图标 (24x24, 纯色圆角正方形, 无边框无发光)
            html += '<span style="display:inline-block;width:24px;height:24px;flex-shrink:0;position:relative;border:none;border-radius:3px;background:' + color + ';overflow:hidden;">';
            html += '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" onerror="this.style.display=\'none\'" style="position:absolute;top:2px;left:2px;width:20px;height:20px;image-rendering:pixelated;image-rendering:crisp-edges;" />';
            html += '</span>';
            html += '<span>' + names[i] + '</span>';
            html += '</div>';
        }

        // 自定义音色区段
        var citems = (window.CustomInstruments) ? CustomInstruments.list() : [];
        if (citems.length > 0) {
            html += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:6px 12px;"></div>';
            for (var ci = 0; ci < citems.length; ci++) {
                var c = citems[ci];
                var cSel = (c.instrument === state.currentInstrument) ? ' ctx-selected' : '';
                var escName = String(c.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                html += '<div class="ctx-item inst-popup-item' + cSel + '" data-instrument="' + c.instrument + '" style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;">';
                html += '<span style="display:inline-block;width:24px;height:24px;flex-shrink:0;border-radius:3px;background:' + (c.color || '#4aa3ff') + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2);"></span>';
                html += '<span>' + escName + '</span>';
                html += '</div>';
            }
        }
        popup.innerHTML = html;

        var items = popup.querySelectorAll('.inst-popup-item');
        for (var j = 0; j < items.length; j++) {
            items[j].addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
            items[j].addEventListener('mouseleave', function() { this.style.background = ''; });
            items[j].addEventListener('click', function(e) {
                var inst = parseInt(this.dataset.instrument);
                state.currentInstrument = inst;
                if (state.pianoRoll) state.pianoRoll.setInstrument(inst);
                updateInstrumentSelectorUI();
                popup.classList.remove('visible');
                markDirty();
                e.stopPropagation();
            });
        }
    }

    function updateInstrumentSelectorUI() {
        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];
        var dot = $('inst-color-dot');
        var name = $('inst-name-text');
        var instIdx = state.currentInstrument;

        // 自定义音色 (instrument >= 20): 纯色圆角块 + 自定义名
        if (instIdx >= 20) {
            var citem = (window.CustomInstruments) ? CustomInstruments.getByInstrument(instIdx) : null;
            if (citem) {
                if (dot) {
                    dot.innerHTML = '';
                    dot.classList.remove('instrument-icon-fallback');
                    dot.style.background = citem.color || '#4aa3ff';
                }
                if (name) name.textContent = citem.name;
                return;
            }
        }

        var norm = instIdx % 20;
        if (dot) {
            var color = colors[norm] || '#d4a96a';
            dot.textContent = '';
            dot.classList.remove('instrument-icon-fallback');
            var icon = document.createElement('img');
            icon.src = window.STATIC_BASE + '/sprites/spr_instrumenticons/inst_' + norm + '.png';
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            icon.onerror = function() {
                this.remove();
                dot.classList.add('instrument-icon-fallback');
            };
            dot.appendChild(icon);
            dot.style.background = color;
        }
        if (name) name.textContent = names[norm] || i18nText('竖琴');
    }

    // ============ 轨道面板 ============
    function createTrackPanelDOM() {
        // 轨道信息完全通过 canvas 内绘制呈现 (见 piano_roll.js _drawTrackPanel)
        // 此处仅添加一些辅助样式
        if ($('track-panel-style-added')) return;
        var style = document.createElement('style');
        style.id = 'track-panel-style-added';
        style.textContent = ''
            + '.context-menu .ctx-item { padding: 8px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.1s; }'
            + '.context-menu .ctx-item:hover { background: rgba(255,255,255,0.08); }'
            + '.context-menu .ctx-disabled { color: #555; cursor: default; }'
            + '.context-menu .ctx-separator { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }'
            + '.context-menu .ctx-icon { font-size: 14px; width: 18px; text-align: center; }'
            + '.context-menu .ctx-arrow { margin-left: auto; font-size: 10px; opacity: 0.5; }'
            + '.ctx-selected { background: rgba(78,205,196,0.15); }'
            + '.instrument-popup { position: fixed; z-index: 9998; display: none; background: rgba(22,33,62,0.96); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 8px 0; min-width: 200px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #eaeaea; font-size: 13px; max-height: 400px; overflow-y: auto; }'
            + '.instrument-popup.active { display: block; }'
            + '.instrument-popup .ctx-item { padding: 8px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; }'
            + '.instrument-popup .ctx-item:hover { background: rgba(255,255,255,0.08); }'
            + '@keyframes pianoSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }'
            + '@keyframes pianoSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }'
            + '#piano-keyboard { animation: pianoSlideUp 0.28s ease-out; }'
            + '#piano-keyboard.collapsing { animation: pianoSlideDown 0.28s ease-in; }'
            + '#piano-keyboard .piano-key { transition: background 0.1s, transform 0.1s; }'
            + '#piano-keyboard .piano-key.white:active, #piano-keyboard .piano-key.white.selected { background: #4ecdc4 !important; }'
            + '#piano-keyboard .piano-key.black:active, #piano-keyboard .piano-key.black.selected { background: #4ecdc4 !important; }';
        document.head.appendChild(style);
    }

    function syncTrackPanelToggleButton() {
        var trackPanelToggle = $('track-panel-toggle');
        if (!trackPanelToggle || !state.pianoRoll) return;
        // 片段模式没有 NBS 音轨栏, 该按钮必须隐藏
        // (内联 !important 才能压过样式表里同样的 display:flex !important)
        if (document.body.classList.contains('segment-edit-mode')) {
            trackPanelToggle.style.setProperty('display', 'none', 'important');
            return;
        }
        trackPanelToggle.style.removeProperty('display');
        var widthRef = (state.pianoRoll._panelTargetWidth !== undefined && state.pianoRoll._panelTargetWidth !== null)
            ? state.pianoRoll._panelTargetWidth
            : state.pianoRoll._currentPanelWidth;
        var collapsed = widthRef <= 10;
        trackPanelToggle.classList.toggle('collapsed', collapsed);
        var icon = trackPanelToggle.querySelector('i');
        if (icon) icon.className = collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
        var label = collapsed ? '展开音轨信息栏' : '折叠音轨信息栏';
        trackPanelToggle.title = label;
        trackPanelToggle.setAttribute('aria-label', label);
        trackPanelToggle.style.display = 'flex';
        trackPanelToggle.style.visibility = 'visible';
        trackPanelToggle.style.opacity = '1';
        trackPanelToggle.style.pointerEvents = 'auto';
    }

    // ============ Toast 通知系统 ============

    // ---- 导出 ----
    N.createInstrumentSelectorDOM = createInstrumentSelectorDOM;
    N.toggleInstrumentPopup = toggleInstrumentPopup;
    N.showInstrumentFloatingWindow = showInstrumentFloatingWindow;
    N.renderInstrumentPopup = renderInstrumentPopup;
    N.updateInstrumentSelectorUI = updateInstrumentSelectorUI;
    N.createTrackPanelDOM = createTrackPanelDOM;
    N.syncTrackPanelToggleButton = syncTrackPanelToggleButton;
})(window.WebNBS);
