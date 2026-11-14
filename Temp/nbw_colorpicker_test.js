/* Temp/nbw_colorpicker_test.js — 取色器: 不误关父弹窗 + 底部按钮/紧凑尺寸
   运行: node Temp/nbw_colorpicker_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8129;
const results = [];
const errors = [];
function record(name, status, detail) {
    results.push({ name, status });
    console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            fs.readFile(path.join(ROOT, p), (err, data) => {
                if (err) { res.writeHead(404); res.end('not found'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}
const settingsOpen = (page) => page.evaluate(() => {
    const p = document.getElementById('settings-popup');
    if (!p) return false;
    const cs = getComputedStyle(p);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && p.classList.contains('active');
});

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    try {
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
        await page.waitForTimeout(1200);
        await page.evaluate(() => { const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none'; });

        // 打开设置 → 显示 → 音符显示
        await page.click('#btn-settings');
        await page.waitForTimeout(300);
        await page.click('[data-settings-tab="display"]');
        await page.click('[data-display-subtab="note"]');
        // 颜色按钮在折叠分组内, 先全部展开
        await page.evaluate(() => {
            document.querySelectorAll('#settings-subpanel-note details').forEach(d => { d.open = true; });
        });
        await page.waitForTimeout(250);
        const t0 = await settingsOpen(page);
        record('T0 设置弹窗已打开', t0 ? 'PASS' : 'FAIL');

        // 打开音调文字的颜色取色器
        await page.click('#settings-note-pitch-color');
        await page.waitForTimeout(400);
        const t1 = await page.evaluate(() => {
            const cp = document.querySelector('.wn-cp-overlay');
            return { cpOpen: !!cp && getComputedStyle(cp).display !== 'none' };
        });
        const keepOpen1 = await settingsOpen(page);
        record('T1 点击调色板后设置弹窗仍打开', (t1.cpOpen && keepOpen1) ? 'PASS' : 'FAIL', `cpOpen=${t1.cpOpen} settings=${keepOpen1}`);

        // 尺寸/布局: 面板紧凑, 按钮位于面板底部且是面板直接子元素
        const t2 = await page.evaluate(() => {
            const panel = document.querySelector('.wn-cp-panel');
            const actions = document.querySelector('.wn-cp-actions');
            const body = document.querySelector('.wn-cp-body');
            const btn = document.querySelector('.wn-cp-btn.wn-cp-ok');
            if (!panel || !actions) return { err: 'no panel' };
            const pr = panel.getBoundingClientRect();
            const ar = actions.getBoundingClientRect();
            const br = body.getBoundingClientRect();
            const gr = btn.getBoundingClientRect();
            // RGB 输入框不能截断数值 (255 需完整可见)
            const rgb = Array.from(document.querySelectorAll('.wn-cp-rgb input')).map(i => ({
                w: i.clientWidth, sw: i.scrollWidth, v: i.value
            }));
            const lab0 = document.querySelector('.wn-cp-rgb > label');
            const r0 = (el) => { const q = el.getBoundingClientRect(); return { x: Math.round(q.x), w: Math.round(q.width) }; };
            return {
                panelW: Math.round(pr.width), panelH: Math.round(pr.height),
                actionsParentIsPanel: actions.parentElement === panel,
                actionsBelowBody: ar.top >= br.bottom - 1,
                actionsAtBottom: Math.abs(ar.bottom - pr.bottom) <= 14,
                btnH: Math.round(gr.height), btnW: Math.round(gr.width),
                rgb, rgbOk: rgb.every(r => r.sw <= r.w + 1),
                diag: {
                    right: r0(document.querySelector('.wn-cp-right')),
                    fields: r0(document.querySelector('.wn-cp-fields')),
                    rgbRow: r0(document.querySelector('.wn-cp-rgb')),
                    label: r0(lab0),
                    span: r0(lab0.querySelector('span')),
                    input: r0(lab0.querySelector('input')),
                    css: {
                        grid: getComputedStyle(document.querySelector('.wn-cp-rgb')).gridTemplateColumns,
                        flex: getComputedStyle(lab0.querySelector('input')).flex,
                        box: getComputedStyle(lab0.querySelector('input')).boxSizing,
                        width: getComputedStyle(lab0.querySelector('input')).width
                    }
                }
            };
        });
        const t2ok = !t2.err && t2.panelW <= 320 && t2.actionsParentIsPanel && t2.actionsBelowBody &&
            t2.actionsAtBottom && t2.btnH <= 30 && t2.btnW <= 60 && t2.rgbOk;
        record('T2 按钮在底部且面板紧凑', t2ok ? 'PASS' : 'FAIL', JSON.stringify(t2));

        // 在色轮内拖动: 不应关闭取色器
        const wheel = await page.$('.wn-cp-wheel');
        let wheelBox = wheel ? await wheel.boundingBox() : null;
        if (wheelBox) {
            const cx = wheelBox.x + wheelBox.width / 2, cy = wheelBox.y + wheelBox.height / 2;
            await page.mouse.move(cx, cy);
            await page.mouse.down();
            await page.mouse.move(cx + 20, cy + 10, { steps: 6 });
            await page.mouse.move(cx - 15, cy - 8, { steps: 6 });
            await page.mouse.up();
        }
        await page.waitForTimeout(250);
        const t3 = await page.evaluate(() => {
            const cp = document.querySelector('.wn-cp-overlay');
            return { cpOpen: !!cp && getComputedStyle(cp).display !== 'none' };
        });
        const keepOpen3 = await settingsOpen(page);
        record('T3 色轮拖动不会误关取色器/设置弹窗', (t3.cpOpen && keepOpen3) ? 'PASS' : 'FAIL', JSON.stringify({ ...t3, settings: keepOpen3 }));

        await page.screenshot({ path: path.join(__dirname, 'nbw_colorpicker.png') });

        // 点击遮罩空白处: 关闭取色器, 设置弹窗保持
        await page.mouse.click(8, 8);
        await page.waitForTimeout(300);
        const t4 = await page.evaluate(() => {
            const cp = document.querySelector('.wn-cp-overlay');
            return { cpOpen: !!cp && getComputedStyle(cp).display !== 'none' };
        });
        const keepOpen4 = await settingsOpen(page);
        record('T4 点遮罩关闭取色器但保留设置弹窗', (!t4.cpOpen && keepOpen4) ? 'PASS' : 'FAIL', JSON.stringify({ ...t4, settings: keepOpen4 }));

        // 再次打开, Esc 关闭
        await page.click('#settings-note-pitch-color');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const t5 = await page.evaluate(() => {
            const cp = document.querySelector('.wn-cp-overlay');
            return { cpOpen: !!cp && getComputedStyle(cp).display !== 'none' };
        });
        const keepOpen5 = await settingsOpen(page);
        record('T5 Esc 关闭取色器且保留设置弹窗', (!t5.cpOpen && keepOpen5) ? 'PASS' : 'FAIL', JSON.stringify({ ...t5, settings: keepOpen5 }));

        // 确定按钮提交后: 颜色生效且设置弹窗保留
        await page.click('#settings-note-pitch-color');
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            const hex = document.querySelector('.wn-cp-hex');
            hex.value = 'ff0000';
            hex.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);
        await page.click('.wn-cp-btn.wn-cp-ok');
        await page.waitForTimeout(300);
        const t6 = await page.evaluate(() => {
            const cp = document.querySelector('.wn-cp-overlay');
            const cfg = WebNBS.state.pianoRoll.getNoteDisplayConfig();
            return { cpOpen: !!cp && getComputedStyle(cp).display !== 'none', pitchColor: cfg.pitchColor };
        });
        const keepOpen6 = await settingsOpen(page);
        record('T6 确定后颜色生效且设置弹窗保留',
            (!t6.cpOpen && t6.pitchColor === '#ff0000' && keepOpen6) ? 'PASS' : 'FAIL', JSON.stringify({ ...t6, settings: keepOpen6 }));
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.message || e));
    }
    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    if (errors.length) errors.slice(0, 6).forEach(e => console.log('  ' + e));
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
