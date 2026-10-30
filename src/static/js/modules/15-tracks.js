/* 15-tracks.js — MiauNoteBlock 功能模块
   来源: 原 main.js L8010-L8640; 依赖 window.WebNBS 命名空间, 加载顺序见 index.html */
(function (N) {
    'use strict';

    N.shared = N.shared || {};

    // ---- 跨模块依赖 ----
    var state = N.state;
    function findTrackByLayer() { return N.findTrackByLayer.apply(this, arguments); }
    function lockToMutedSolo() { return N.lockToMutedSolo.apply(this, arguments); }
    function getLayerLock() { return N.getLayerLock.apply(this, arguments); }
    function getSoloLayerMap() { return N.getSoloLayerMap.apply(this, arguments); }
    function pushUndo() { return N.pushUndo.apply(this, arguments); }
    function markDirty() { return N.markDirty.apply(this, arguments); }
    function buildNoteIndex() { return N.buildNoteIndex.apply(this, arguments); }
    function showAppAlert() { return N.showAppAlert.apply(this, arguments); }
    function $() { return N.$.apply(this, arguments); }
    function i18nText() { return N.i18nText.apply(this, arguments); }
    function handlePasteOrSystemClipboard() { return N.handlePasteOrSystemClipboard.apply(this, arguments); }
    function updateNoteCount() { return N.updateNoteCount.apply(this, arguments); }
    function getInstrumentNames() { return N.getInstrumentNames.apply(this, arguments); }
    function showAppPrompt() { return N.showAppPrompt.apply(this, arguments); }


    // 同步 pianoRoll.trackInfo 与 state.tracks
    function syncPianoRollTrackInfo() {
        if (!state.pianoRoll) return;
        for (var i = 0; i < state.tracks.length; i++) {
            var t = state.tracks[i];
            state.pianoRoll.setTrackInfo(t.layer, {
                name: t.name,
                muted: !!t.muted,
                solo: !!t.solo,
                volume: (t.volume !== undefined) ? t.volume : 100
            });
        }
    }

    function initTracks() {
        // 分析现有音符，建立轨道
        rebuildTracks();
        updateTrackPanelUI();
    }

    function rebuildTracks() {
        var layerSet = {};
        for (var i = 0; i < state.notes.length; i++) {
            var l = state.notes[i].layer;
            if (!layerSet[l]) {
                layerSet[l] = { count: 0, instrument: state.notes[i].instrument };
            }
            layerSet[l].count++;
        }

        if (state.song && state.song.layers) {
            for (var si = 0; si < state.song.layers.length; si++) {
                if (!layerSet[si]) {
                    layerSet[si] = { count: 0, instrument: 0 };
                }
            }
        }

        var layers = Object.keys(layerSet).map(Number).sort(function(a, b) { return a - b; });
        var newTracks = [];
        for (var j = 0; j < layers.length; j++) {
            var l = layers[j];
            // 优先从 state.song.layers 的 lock 字段初始化静音/独奏状态,
            // 不继承上一个文件的轨道状态
            var existing = findTrackByLayer(l);
            // 没有现有轨道时, 优先使用 state.song.layers 中保存的名称
            var savedLayer = (state.song && state.song.layers && state.song.layers[l]) ? state.song.layers[l] : null;
            var fallbackName = (savedLayer && savedLayer.name) ? savedLayer.name : ('Track ' + (j + 1));
            newTracks.push({
                name: existing ? existing.name : fallbackName,
                layer: l,
                muted: existing ? !!existing.muted : lockToMutedSolo(getLayerLock(l)).muted,
                solo: existing ? !!existing.solo : !!getSoloLayerMap()[l],
                volume: (existing && existing.volume !== undefined)
                    ? existing.volume
                    : ((savedLayer && savedLayer.volume !== undefined) ? savedLayer.volume : 100),
                instrument: layerSet[l].instrument,
                noteCount: layerSet[l].count
            });
        }

        // 如果没有轨道，创建默认轨道
        if (newTracks.length === 0) {
            var ms0 = lockToMutedSolo(getLayerLock(0));
            var saved0 = (state.song && state.song.layers && state.song.layers[0]) ? state.song.layers[0] : null;
            newTracks.push({
                name: (saved0 && saved0.name) ? saved0.name : 'Track 1',
                layer: 0,
                muted: ms0.muted,
                solo: !!getSoloLayerMap()[0],
                volume: (saved0 && saved0.volume !== undefined) ? saved0.volume : 100,
                instrument: 0,
                noteCount: 0
            });
        }

        state.tracks = newTracks;

        // 同步独奏激活状态: 从 NBS / 缓存恢复独奏轨道后, 播放判定才能生效
        var anySolo = false;
        for (var sk = 0; sk < newTracks.length; sk++) {
            if (newTracks[sk].solo) { anySolo = true; break; }
        }
        state.soloActive = anySolo;
    }

    function updateTrackPanelUI() {
        rebuildTracks();
        syncPianoRollTrackInfo();
        if (state.pianoRoll) {
            state.pianoRoll.trackCount = (state.song && state.song.layers) ? state.song.layers.length : 1;
            state.pianoRoll.render();
        }
    }

    function updateTrackName(layerIndex, newName) {
        // 没有歌曲数据时自动初始化, 保证空工程下也能修改音轨名
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layerIndex) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }
        pushUndo();
        state.song.layers[layerIndex].name = newName;
        // 同步更新内存中的轨道信息，否则 rebuildTracks 会用旧名称覆盖
        var track = findTrackByLayer(layerIndex);
        if (!track) {
            track = { layer: layerIndex, name: newName, muted: false, solo: false, volume: 100, instrument: 0, noteCount: 0 };
            state.tracks.push(track);
        } else {
            track.name = newName;
        }
        updateTrackPanelUI();
        markDirty();
    }

    function moveTrackUp(layerIndex) {
        if (!state.song || !state.song.layers || layerIndex <= 0) return;
        pushUndo();
        var layers = state.song.layers;
        var temp = layers[layerIndex];
        layers[layerIndex] = layers[layerIndex - 1];
        layers[layerIndex - 1] = temp;
        // 交换音符的 layer 值
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer === layerIndex) state.notes[i].layer = layerIndex - 1;
            else if (state.notes[i].layer === layerIndex - 1) state.notes[i].layer = layerIndex;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function moveTrackDown(layerIndex) {
        if (!state.song || !state.song.layers || layerIndex >= state.song.layers.length - 1) return;
        pushUndo();
        var layers = state.song.layers;
        var temp = layers[layerIndex];
        layers[layerIndex] = layers[layerIndex + 1];
        layers[layerIndex + 1] = temp;
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer === layerIndex) state.notes[i].layer = layerIndex + 1;
            else if (state.notes[i].layer === layerIndex + 1) state.notes[i].layer = layerIndex;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    // 拖拽排序: 将 fromLayer 移动到 toLayer 的位置
    function reorderTrack(fromLayer, toLayer) {
        if (!state.song || !state.song.layers) return;
        if (fromLayer === toLayer) return;
        if (fromLayer < 0 || fromLayer >= state.song.layers.length) return;
        if (toLayer < 0 || toLayer >= state.song.layers.length) return;
        pushUndo();
        // 移动 layer 数组
        var movedLayer = state.song.layers.splice(fromLayer, 1)[0];
        state.song.layers.splice(toLayer, 0, movedLayer);
        // 重新编号所有音符的 layer
        // 先收集所有音符的原始 layer, 然后按新顺序映射
        var layerMap = {};
        // fromLayer 被移除后, fromLayer+1..toLayer 的元素前移一位, 然后 movedLayer 插入到 toLayer
        // 构建映射: 原始 layer → 新 layer
        if (fromLayer < toLayer) {
            // 向下移: fromLayer 的元素移到 toLayer
            // fromLayer → toLayer
            // fromLayer+1..toLayer → 前移一位 (各减1)
            layerMap[fromLayer] = toLayer;
            for (var l = fromLayer + 1; l <= toLayer; l++) {
                layerMap[l] = l - 1;
            }
        } else {
            // 向上移: fromLayer 的元素移到 toLayer
            // toLayer..fromLayer-1 → 后移一位 (各加1)
            // fromLayer → toLayer
            layerMap[fromLayer] = toLayer;
            for (var l2 = toLayer; l2 < fromLayer; l2++) {
                layerMap[l2] = l2 + 1;
            }
        }
        for (var i = 0; i < state.notes.length; i++) {
            var oldLayer = state.notes[i].layer;
            if (layerMap[oldLayer] !== undefined) {
                state.notes[i].layer = layerMap[oldLayer];
            }
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function deleteTrack(layerIndex) {
        if (!state.song || !state.song.layers) return;
        if (state.song.layers.length <= 1) {
            showAppAlert('至少保留一条音轨。', {title: '删除音轨'});
            return;
        }
        pushUndo();
        state.song.layers.splice(layerIndex, 1);
        // 移除该层的音符
        state.notes = state.notes.filter(function(n) { return n.layer !== layerIndex; });
        // 重新编号
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer > layerIndex) state.notes[i].layer--;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function setTrackVolume(layerIndex, volume) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layerIndex) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }

        state.song.layers[layerIndex].volume = volume;

        var track = findTrackByLayer(layerIndex);
        if (!track) {
            track = {
                layer: layerIndex,
                name: (state.song.layers[layerIndex] && state.song.layers[layerIndex].name) || ('Track ' + (layerIndex + 1)),
                muted: false,
                solo: false,
                volume: volume,
                instrument: 0,
                noteCount: 0
            };
            state.tracks.push(track);
        } else {
            track.volume = volume;
        }

        if (state.pianoRoll) {
            var currentInfo = state.pianoRoll.getTrackInfo ? state.pianoRoll.getTrackInfo(layerIndex) : null;
            state.pianoRoll.setTrackInfo(layerIndex, {
                name: currentInfo && currentInfo.name ? currentInfo.name : track.name,
                muted: currentInfo ? !!currentInfo.muted : !!track.muted,
                solo: currentInfo ? !!currentInfo.solo : !!track.solo,
                volume: volume
            });
        }

        updateTrackPanelUI();
        markDirty();
    }

    function bindTrackPanelEvents() {
        // 绑定在 piano_roll.js 内部完成 (hitTestTrackPanel)
        return;
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============ 上下文菜单 ============
    function createContextMenuDOM() {
        var menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';
        menu.style.cssText = 'position:fixed;z-index:9999;display:none;'
            + 'background:rgba(26,26,46,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 0;min-width:180px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';
        document.body.appendChild(menu);
    }

    function showContextMenu(x, y, noteIds, isLongPress) {
        var menu = $('context-menu');
        if (!menu) return;
        hideContextMenu();

        state.contextMenuTarget = noteIds;
        var hasSelection = noteIds.length > 0;

        var t = i18nText;
        var html = '';
        // 始终显示：全选
        html += '<div class="ctx-item" data-action="select-all"><span class="ctx-icon"><i class="fa-solid fa-object-group"></i></span> ' + t('全选') + '</div>';
        html += '<div class="ctx-item" data-action="condition-select"><span class="ctx-icon"><i class="fa-solid fa-filter"></i></span> ' + t('条件选择') + '</div>';
        if (hasSelection) {
            html += '<div class="ctx-item" data-action="deselect"><span class="ctx-icon"><i class="fa-solid fa-xmark"></i></span> ' + t('取消选择') + '</div>';
            html += '<div class="ctx-separator"></div>';
            html += '<div class="ctx-item" data-action="cut"><span class="ctx-icon"><i class="fa-solid fa-scissors"></i></span> ' + t('剪切') + '</div>';
            html += '<div class="ctx-item" data-action="copy"><span class="ctx-icon"><i class="fa-solid fa-copy"></i></span> ' + t('复制') + '</div>';
            html += '<div class="ctx-item" data-action="delete"><span class="ctx-icon"><i class="fa-solid fa-trash"></i></span> ' + t('删除') + '</div>';
            html += '<div class="ctx-item" data-action="change-instrument" id="ctx-change-instrument"><span class="ctx-icon"><i class="fa-solid fa-music"></i></span> ' + t('更改乐器') + ' <span class="ctx-arrow"><i class="fa-solid fa-caret-right"></i></span></div>';
            html += '<div class="ctx-item" data-action="change-volume"><span class="ctx-icon"><i class="fa-solid fa-volume-high"></i></span> ' + t('更改音量') + '</div>';
        }
        html += '<div class="ctx-separator"></div>';
        html += '<div class="ctx-item" data-action="paste"><span class="ctx-icon"><i class="fa-solid fa-paste"></i></span> ' + t('粘贴') + '</div>';

        menu.innerHTML = html;
        menu.style.display = 'block';
        window.WebNBSPositionFlyout(menu, { left: x, right: x, top: y, bottom: y });

        // 绑定菜单项事件
        var items = menu.querySelectorAll('.ctx-item');
        for (var i = 0; i < items.length; i++) {
            items[i].addEventListener('click', function(e) {
                var action = this.dataset.action;
                if (action === 'change-instrument') {
                    handleContextAction(action, x, y);
                    e.stopPropagation();
                    return;
                }
                handleContextAction(action, x, y);
                hideContextMenu();
                e.stopPropagation();
            });
        }
    }

    function hideContextMenu() {
        var menu = $('context-menu');
        if (menu) menu.style.display = 'none';
        // 也隐藏子菜单
        var subMenu = $('instrument-submenu');
        if (subMenu) subMenu.remove();
        state.contextMenuTarget = null;
    }

    function handleContextAction(action, x, y) {
        var noteIds = state.contextMenuTarget;
        var hasNotes = noteIds && noteIds.length > 0;

        switch (action) {
            case 'select-all':
                if (state.pianoRoll) state.pianoRoll.selectAll();
                return;
            case 'deselect':
                if (state.pianoRoll) state.pianoRoll.clearSelection();
                return;
            case 'condition-select':
                showConditionSelectDialog(x, y);
                return;
            case 'paste':
                var pasteTick, pasteLayer;
                if (state.pianoRoll && typeof x === 'number' && typeof y === 'number') {
                    pasteTick = state.pianoRoll._screenToTick(x);
                    pasteLayer = state.pianoRoll._screenToLayer(y);
                }
                handlePasteOrSystemClipboard(pasteTick, pasteLayer);
                return;
        }

        if (!hasNotes) return;

        switch (action) {
            case 'delete':
                pushUndo();
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.deleteSelected();
                    state.notes = state.pianoRoll.getNotes();
                }
                buildNoteIndex(state.notes);
                updateNoteCount();
                markDirty();
                break;
            case 'copy':
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                }
                break;
            case 'cut':
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                    pushUndo();
                    state.pianoRoll.deleteSelected();
                    state.notes = state.pianoRoll.getNotes();
                    buildNoteIndex(state.notes);
                    updateNoteCount();
                    markDirty();
                }
                break;
            case 'change-instrument':
                showInstrumentSubMenu(x, y, noteIds);
                break;
            case 'change-volume':
                showVolumeDialog(noteIds);
                break;
        }
    }

    function showInstrumentSubMenu(x, y, noteIds) {
        var existing = $('instrument-submenu');
        if (existing) existing.remove();

        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        // 自定义音色库
        var citems = (window.CustomInstruments) ? CustomInstruments.list() : [];

        var sub = document.createElement('div');
        sub.id = 'instrument-submenu';
        sub.style.cssText = 'position:fixed;z-index:10000;'
            + 'background:rgba(22,33,62,0.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:4px 0;display:flex;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:12px;max-height:340px;';

        // 左列: 内置音色
        var leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex:1;min-width:170px;max-height:330px;overflow-y:auto;';
        // 右列: 自定义音色 (无自定义音色时整列隐藏)
        var rightCol = document.createElement('div');
        rightCol.style.cssText = 'flex:1;min-width:170px;max-height:330px;overflow-y:auto;border-left:1px solid rgba(255,255,255,0.12);';

        // ---- 内置音色 ----
        for (var i = 0; i < names.length; i++) {
            var color = colors[i] || '#d4a96a';
            var item = document.createElement('div');
            item.className = 'ctx-item';
            item.style.cssText = 'padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;';
            item.innerHTML = '<span style="display:inline-block;width:20px;height:20px;flex-shrink:0;position:relative;border-radius:4px;overflow:hidden;background:' + color + ';">'
                + '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;border-radius:4px;" /></span> ' + names[i];
            item.dataset.instrument = i;

            item.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
            item.addEventListener('mouseleave', function() { this.style.background = ''; });
            // 移动端: touchstart 阻止冒泡, 防止 capture 阶段误关菜单; 用 click 触发选择
            item.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            }, { passive: true });
            item.addEventListener('click', (function(inst) {
                return function(e) {
                    // 点击音色时播放预览音效（使用钢琴键盘选中的音调）
                    var selectedKey = getSelectedPianoKey();
                    if (selectedKey !== null && window.AudioEngine && AudioEngine.playNote) {
                        AudioEngine.playNote(inst, selectedKey, 80);
                    }
                    changeInstrumentForNotes(noteIds, inst);
                    if ($('instrument-submenu')) $('instrument-submenu').remove();
                    hideContextMenu();
                    e.stopPropagation();
                };
            })(i));
            leftCol.appendChild(item);
        }

        // ---- 自定义音色 (右列, 纯色方块图标) ----
        if (citems.length > 0) {
            for (var ci = 0; ci < citems.length; ci++) {
                (function(cinst) {
                    var citem = cinst;
                    var cColor = citem.color || '#4aa3ff';
                    var cName = String(citem.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    var cItem = document.createElement('div');
                    cItem.className = 'ctx-item';
                    cItem.style.cssText = 'padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;';
                    cItem.innerHTML = '<span style="display:inline-block;width:20px;height:20px;flex-shrink:0;border-radius:4px;background:' + cColor + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,0.25);"></span> ' + cName;
                    cItem.title = cName;
                    cItem.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
                    cItem.addEventListener('mouseleave', function() { this.style.background = ''; });
                    cItem.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
                    cItem.addEventListener('click', (function(inst) {
                        return function(e) {
                            var selectedKey = getSelectedPianoKey();
                            if (selectedKey !== null && window.AudioEngine && AudioEngine.playNote) {
                                AudioEngine.playNote(inst, selectedKey, 80);
                            }
                            changeInstrumentForNotes(noteIds, inst);
                            if ($('instrument-submenu')) $('instrument-submenu').remove();
                            hideContextMenu();
                            e.stopPropagation();
                        };
                    })(citem.instrument));
                    rightCol.appendChild(cItem);
                })(citems[ci]);
            }
        } else {
            rightCol.style.display = 'none';
        }

        sub.appendChild(leftCol);
        sub.appendChild(rightCol);

        document.body.appendChild(sub);
        window.WebNBSPositionFlyout(sub, { left: x, right: x, top: y, bottom: y }, { placement: 'right-start' });

        // 点击其他地方关闭子菜单
        var closeSub = function(e) {
            if (!sub.contains(e.target)) {
                sub.remove();
                document.removeEventListener('click', closeSub);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeSub);
        }, 10);
    }

    // 条件选择弹窗: 勾选要忽略(取消选择)的音色
    // - 若当前已有选择, 则从选区中移除被勾选音色的音符
    // - 若当前无选择, 则先全选再移除 (等价于"全部音符中筛选")
    function showConditionSelectDialog(x, y) {
        // 移除已存在的弹窗
        var existing = $('condition-select-dialog');
        if (existing) existing.remove();

        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        var hasSelection = state.pianoRoll && state.pianoRoll.getSelectedNoteIds().length > 0;
        var hint = hasSelection ? i18nText('勾选要从当前选择中移除的音色') : i18nText('当前无选择, 将先全选再筛选。勾选要排除的音色');

        var dlg = document.createElement('div');
        dlg.id = 'condition-select-dialog';
        dlg.style.cssText = 'position:fixed;z-index:10001;'
            + 'background:rgba(22,33,62,0.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:12px;min-width:240px;max-width:320px;';

        var html = '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">' + i18nText('条件选择') + '</div>';
        html += '<div style="font-size:11px;color:#9aa;margin-bottom:10px;line-height:1.4;">' + hint + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:220px;overflow-y:auto;margin-bottom:10px;">';
        for (var i = 0; i < names.length; i++) {
            var color = colors[i] || '#d4a96a';
            html += '<label style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.04);transition:background 0.12s;" '
                + 'onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.04)\'">'
                + '<input type="checkbox" data-instrument="' + i + '" style="accent-color:#5b8def;cursor:pointer;">'
                + '<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:' + color + ';flex-shrink:0;"></span>'
                + '<span>' + names[i] + '</span></label>';
        }
        html += '</div>';
        html += '<div style="display:flex;gap:8px;justify-content:flex-end;">'
            + '<button id="cond-cancel" class="popup-btn" style="padding:6px 14px;border-radius:6px;cursor:pointer;">' + i18nText('取消') + '</button>'
            + '<button id="cond-ok" class="popup-btn popup-btn-primary" style="padding:6px 14px;border-radius:6px;cursor:pointer;background:var(--accent-blue);color:#fff;border:none;">' + i18nText('确认') + '</button>'
            + '</div>';
        dlg.innerHTML = html;
        document.body.appendChild(dlg);

        window.WebNBSPositionFlyout(dlg, { left: x, right: x, top: y, bottom: y });

        // 取消
        var cancelBtn = dlg.querySelector('#cond-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { dlg.remove(); });
        // 确认
        var okBtn = dlg.querySelector('#cond-ok');
        if (okBtn) okBtn.addEventListener('click', function() {
            var checks = dlg.querySelectorAll('input[type=checkbox]:checked');
            var ignoreList = [];
            for (var c = 0; c < checks.length; c++) ignoreList.push(parseInt(checks[c].dataset.instrument));
            if (state.pianoRoll && ignoreList.length > 0) {
                state.pianoRoll.filterSelectionByInstrument(ignoreList);
            }
            dlg.remove();
        });

        // 点击外部关闭
        var closeDlg = function(e) {
            if (!dlg.contains(e.target)) {
                dlg.remove();
                document.removeEventListener('click', closeDlg);
            }
        };
        setTimeout(function() { document.addEventListener('click', closeDlg); }, 10);
    }

    // 获取钢琴键盘当前选中的音调
    function getSelectedPianoKey() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return null;
        var selected = keyboard.querySelector('.piano-key.selected');
        if (selected) return parseInt(selected.dataset.key);
        return null;
    }

    function changeInstrumentForNotes(noteIds, instrument) {
        pushUndo();
        // note id 为字符串（如 "note_1"），直接作为 key，不要 parseInt
        var idSet = {};
        for (var k = 0; k < noteIds.length; k++) {
            idSet[noteIds[k]] = true;
        }
        // 同时更新 state.notes 与 pianoRoll.notes，避免两侧引用不一致导致 UI 不刷新
        function applyTo(list) {
            if (!list) return;
            for (var i = 0; i < list.length; i++) {
                if (idSet[list[i].id]) {
                    list[i].instrument = instrument;
                }
            }
        }
        applyTo(state.notes);
        if (state.pianoRoll) applyTo(state.pianoRoll.notes);
        if (state.pianoRoll) {
            state.pianoRoll.render();
        }
        updateNoteCount();
        updateTrackPanelUI();
        markDirty();
    }

    function showVolumeDialog(noteIds) {
        showAppPrompt('输入音量 (0-100):', '100', {title: '修改音量', icon: 'fa-solid fa-volume-high'}).then(function(vol) {
            if (vol === null) return;
            var v = parseInt(vol);
            if (isNaN(v)) return;
            v = Math.max(0, Math.min(100, v));
            pushUndo();
            for (var i = 0; i < state.notes.length; i++) {
                if (noteIds.indexOf(state.notes[i].id) !== -1) {
                    state.notes[i].velocity = v;
                }
            }
            if (state.pianoRoll) {
                state.pianoRoll.render();
            }
            markDirty();
        });
    }

    // ============ 自定义音色系统 UI ============
    var CI_PRESET_COLORS = ['#ff6b6b','#ff9f43','#ffd93d','#6bcb77','#4aa3ff','#a55eea','#ff7ab8','#7fc8f8','#c3a6ff','#f8a5c2','#f7b731','#26de81','#45aaf2','#fd9644','#d1d8e0','#63cdda','#ff8c42','#b8e986','#778beb','#e17055'];

    // ---- 导出 ----
    N.syncPianoRollTrackInfo = syncPianoRollTrackInfo;
    N.initTracks = initTracks;
    N.rebuildTracks = rebuildTracks;
    N.updateTrackPanelUI = updateTrackPanelUI;
    N.updateTrackName = updateTrackName;
    N.moveTrackUp = moveTrackUp;
    N.moveTrackDown = moveTrackDown;
    N.reorderTrack = reorderTrack;
    N.deleteTrack = deleteTrack;
    N.setTrackVolume = setTrackVolume;
    N.bindTrackPanelEvents = bindTrackPanelEvents;
    N.escapeHTML = escapeHTML;
    N.createContextMenuDOM = createContextMenuDOM;
    N.showContextMenu = showContextMenu;
    N.hideContextMenu = hideContextMenu;
    N.handleContextAction = handleContextAction;
    N.showInstrumentSubMenu = showInstrumentSubMenu;
    N.showConditionSelectDialog = showConditionSelectDialog;
    N.getSelectedPianoKey = getSelectedPianoKey;
    N.changeInstrumentForNotes = changeInstrumentForNotes;
    N.showVolumeDialog = showVolumeDialog;
    N.CI_PRESET_COLORS = CI_PRESET_COLORS;
})(window.WebNBS);
