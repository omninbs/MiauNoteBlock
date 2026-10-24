/**
 * MIDI 导入冒烟测试 (临时脚本)
 * 用 Playwright 驱动本机 Edge (无头), 走真实导入流程:
 * 1. 打开应用 -> 选择 MIDI 文件 -> 等待导入弹窗
 * 2. 校验「自动分割片段」默认开启、配置已持久化
 * 3. 执行导入, 进入片段模式, 读取片段轨道 (按通道 + 打击乐合并)
 * 4. 设置片段预览为「按音调」, 记录中等/最小缩放截图
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://127.0.0.1:8000';
const MIDI = process.argv[2] || 'C:\\Users\\MSI\\Desktop\\Big制作\\Midi\\The Other Side Of Paradise.mid';
const OUT = path.join(__dirname, '_out');

function log() { console.log.apply(console, arguments); }

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 可能的提示弹窗 (更新日志/隐私提示/音域提示) 会挡住交互, 先统一关掉
    async function dismissAppDialogs() {
        for (let i = 0; i < 5; i++) {
            const mask = page.locator('#privacy-popup-mask');
            if (await mask.count().catch(() => 0) && await mask.isVisible().catch(() => false)) {
                log('隐私弹窗: 关闭');
                const pb = mask.locator('button').last();
                await pb.click({ force: true }).catch(() => {});
                await page.waitForTimeout(400);
                continue;
            }
            const oct = page.locator('#octave-popup');
            if (await oct.count().catch(() => 0) && await oct.isVisible().catch(() => false)) {
                const x = page.locator('#octave-close-x');
                if (await x.count()) await x.click({ force: true }).catch(() => {});
                else await page.locator('#octave-close-btn').click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
                continue;
            }
            const ov = page.locator('.app-dialog-overlay').first();
            if (!(await ov.count().catch(() => 0))) return;
            if (!(await ov.isVisible().catch(() => false))) return;
            log('提示弹窗: ', (await ov.innerText()).replace(/\s+/g, ' ').slice(0, 200));
            const btns = ov.locator('button');
            const n = await btns.count();
            if (!n) return;
            await btns.nth(n - 1).click({ force: true }).catch(() => {});
            await page.waitForTimeout(400);
        }
    }
    await dismissAppDialogs();

    // 1) 通过欢迎页进入 MIDI 流程, 再把文件塞进隐藏 input
    if (await page.locator('#welcome-midi').count()) {
        await page.click('#welcome-midi').catch(() => {});
    }
    await page.setInputFiles('#file-input', MIDI);
    await page.waitForSelector('#midi-popup', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(600);
    await dismissAppDialogs();

    const dialogInfo = await page.evaluate((autoSplit) => {
        const split = document.querySelector('#midi-auto-split-segments');
        if (split && autoSplit === '0') {
            split.checked = false;
            split.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return {
            autoSplitChecked: split ? split.checked : null,
            rememberExists: !!document.querySelector('#midi-remember'),
            noteText: (document.querySelector('#midi-notes') || {}).textContent || '',
            trackText: (document.querySelector('#midi-tracks') || {}).textContent || '',
            percSelects: document.querySelectorAll('.midi-perc-instrument-select').length,
            percPitchSelects: document.querySelectorAll('.midi-perc-pitch-select').length,
            timbreRows: document.querySelectorAll('#midi-timbre-percussion-rows tr').length
        };
    }, process.env.AUTO_SPLIT || '1');
    log('对话框: ', JSON.stringify(dialogInfo));

    // 2) 导入
    await dismissAppDialogs();
    // 调试钩子: 记录转换结果, 便于检查打击乐层与通道映射
    await page.evaluate(() => {
        const orig = window.NBSClient._convertMidiToNBS;
        window.NBSClient._convertMidiToNBS = function (ab, st) {
            const song = orig.call(this, ab, st);
            window.__dbgSong = song;
            window.__dbgSettings = st;
            return song;
        };
    });
    await page.click('#midi-import-btn');
    await page.waitForSelector('#midi-popup', { state: 'hidden', timeout: 60000 });
    await page.waitForFunction(() => {
        const el = document.querySelector('#note-count');
        return el && /\d+/.test(el.textContent) && parseInt(el.textContent.replace(/\D+/g, ''), 10) > 0;
    }, { timeout: 60000 });
    await page.waitForTimeout(800);

    const afterImport = await page.evaluate(() => {
        let prefs = null;
        try { prefs = JSON.parse(localStorage.getItem('midi_import_prefs_v2')); } catch (e) {}
        return {
            noteCount: (document.querySelector('#note-count') || {}).textContent || '',
            prefsExists: !!prefs,
            prefsAutoSplit: prefs && prefs.basic ? prefs.basic.auto_split_segments : null,
            prefsSustain: prefs ? prefs.sustain_track_indices : null,
            oldPrefsExists: !!localStorage.getItem('midi_import_settings')
        };
    });
    log('导入后: ', JSON.stringify(afterImport));
    const dbg = await page.evaluate(() => {
        const s = window.__dbgSong;
        if (!s) return null;
        const byCh = {};
        for (const n of (s.notes || [])) {
            const ch = s.layer_channel_map[n.layer];
            const k = (ch === undefined ? 'x' : String(ch));
            byCh[k] = (byCh[k] || 0) + 1;
        }
        return {
            layerCount: (s.layers || []).length,
            layerNames: (s.layers || []).map(l => l.name),
            mapKeys: Object.keys(s.layer_channel_map || {}).length,
            ch9Layers: Object.keys(s.layer_channel_map || {}).filter(k => s.layer_channel_map[k] === 9),
            notesByChannel: byCh,
            percInstCount: Object.keys((window.__dbgSettings || {}).percussion_instruments || {}).length,
            keepLen: (window.__dbgSettings || {}).keep_note_length
        };
    });
    log('转换结果: ', JSON.stringify(dbg));
    await page.screenshot({ path: path.join(OUT, '01-nbs-after-import.png') });

    // 3) 片段预览模式 = 按音调, 进入片段模式
    await page.evaluate(() => {
        const sel = document.querySelector('#settings-segment-preview-mode');
        if (sel) { sel.value = 'pitch'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await dismissAppDialogs();
    await page.click('.ems-opt-seg');
    await page.waitForTimeout(900);
    const box = await page.locator('#piano-roll').boundingBox();

    const lanes = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#segment-side-panel .seg-lane-row'));
        return rows.map(r => {
            const n = r.querySelector('.seg-lane-name');
            return n ? n.textContent.trim() : '';
        });
    });
    // 侧边板只渲染可视行, 滚动片段视图把其余轨道也收集起来
    const laneSet = new Set(lanes);
    for (let i = 0; i < 6; i++) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(150);
        const more = await page.evaluate(() => Array.from(document.querySelectorAll('#segment-side-panel .seg-lane-row')).map(r => {
            const n = r.querySelector('.seg-lane-name');
            return n ? n.textContent.trim() : '';
        }));
        more.forEach(n => laneSet.add(n));
    }
    log('片段轨道(全部): ', JSON.stringify(Array.from(laneSet)));
    // 滚回顶部, 后续截图保持默认视图
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '02-segment-default.png') });

    // 4) 缩放到中等 / 最小, 截图对比
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(120); }
    await page.keyboard.up('Control');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, '03-segment-zoom-mid.png') });

    await page.keyboard.down('Control');
    for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 480); await page.waitForTimeout(80); }
    await page.keyboard.up('Control');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '04-segment-zoom-min.png') });

    // 5) 退出片段模式 -> 再进入, 验证按通道归属可重复 (不会全落进第一条片段)
    await page.click('.ems-opt-nbs');
    await page.waitForTimeout(500);
    const notesAfterExit = await page.evaluate(() => (document.querySelector('#note-count') || {}).textContent || '');
    await page.click('.ems-opt-seg');
    await page.waitForTimeout(900);
    const reentry = await page.evaluate(() => ({
        lanes: Array.from(document.querySelectorAll('#segment-side-panel .seg-lane-row')).map(r => {
            const n = r.querySelector('.seg-lane-name');
            return n ? n.textContent.trim() : '';
        }),
        notes: (document.querySelector('#note-count') || {}).textContent || '',
        segNames: Array.from(document.querySelectorAll('#segment-side-panel .seg-lane-name')).length
    }));
    log('退出后音符: ', notesAfterExit, ' 再次进入: ', JSON.stringify(reentry));
    await page.screenshot({ path: path.join(OUT, '05-segment-reentry.png') });

    // 6) 配置持久化 + 延音弹窗「重置配置」
    await page.click('.ems-opt-nbs');
    await page.waitForTimeout(400);
    await page.setInputFiles('#file-input', MIDI);
    await page.waitForSelector('#midi-popup', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(700);
    await dismissAppDialogs();
    const prefsUI = await page.evaluate(() => {
        const sel = document.querySelector('#midi-keep-note-length');
        if (sel) { sel.value = 'sustain'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        return {
            autoSplit: document.querySelector('#midi-auto-split-segments').checked,
            keep: sel ? sel.value : '',
            sustainCountText: (document.querySelector('#midi-sustain-tracks-count') || {}).textContent || ''
        };
    });
    await page.waitForTimeout(300);
    await page.click('#midi-sustain-tracks-btn');
    await page.waitForSelector('#sustain-tracks-popup', { state: 'visible', timeout: 10000 });
    const beforeReset = await page.evaluate(() => {
        // 先手动取消一个, 验证「重置配置」确实会恢复默认
        const first = document.querySelector('.sustain-track-checkbox:checked');
        if (first) first.checked = false;
        return {
            checkedAfterManual: document.querySelectorAll('.sustain-track-checkbox:checked').length,
            hasReset: !!document.querySelector('#sustain-tracks-reset-btn')
        };
    });
    await page.click('#sustain-tracks-reset-btn');
    await page.waitForTimeout(300);
    const afterReset = await page.evaluate(() => {
        let prefs = null;
        try { prefs = JSON.parse(localStorage.getItem('midi_import_prefs_v2')); } catch (e) {}
        return {
            checked: document.querySelectorAll('.sustain-track-checkbox:checked').length,
            savedSustain: prefs ? prefs.sustain_track_indices : null
        };
    });
    log('配置恢复: ', JSON.stringify(prefsUI), ' 重置前: ', JSON.stringify(beforeReset), ' 重置后: ', JSON.stringify(afterReset));
    await page.screenshot({ path: path.join(OUT, '06-sustain-reset.png') });

    log('页面错误: ', JSON.stringify(errors.slice(0, 6)));
    await browser.close();
})().catch(e => { console.error('测试失败:', e); process.exit(1); });
