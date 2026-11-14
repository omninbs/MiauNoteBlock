/* Temp/nbw_note_shot.js — 视觉截图: 音符显示 (音色图标/颜色/方块名/序号/音高) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8128;
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
            const file = path.join(ROOT, p);
            fs.readFile(file, (err, data) => {
                if (err) { res.writeHead(404); res.end('not found'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 760 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem('webnbs_privacy_agreed', '1');
            localStorage.setItem('noteblock.show_note_block', '1');
            localStorage.setItem('noteblock.show_note_clicks', '1');
            localStorage.setItem('show_octave_labels', '1');
        } catch (e) {}
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1600);
    await page.evaluate(() => {
        const N = WebNBS, st = N.state;
        const w = document.getElementById('welcome-screen');
        if (w) w.style.display = 'none';
        // 不同音色 + 不同音高: 验证图标与底色一一对应
        const insts = [0, 1, 5, 7, 13, 16, 19];
        st.notes = [];
        for (let i = 0; i < insts.length; i++) {
            st.notes.push({ id: 100 + i, tick: i * 3, layer: i, instrument: insts[i], key: 45 + i * 3, velocity: 100, pan: 0, pitch: 0 });
            st.notes.push({ id: 200 + i, tick: i * 3 + 1, layer: i, instrument: insts[i], key: 45 + i * 3, velocity: 100, pan: 0, pitch: 0 });
        }
        if (st.song) st.song.layers = [];
        for (let i = 0; i < insts.length; i++) {
            if (!st.song) st.song = {};
            st.song.layers.push({ name: 'Layer ' + (i + 1), volume: 100, stereo: 100, lock: 0 });
        }
        st.pianoRoll.setNotes(st.notes);
        st.pianoRoll._fullRedrawNeeded = true;
        st.pianoRoll.render();
        N.segmentSync && N.segmentSync();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(__dirname, 'nbw_note_display.png') });
    // 音符区域放大 (只截左上角, 便于核对图标/颜色/方块名)
    await page.screenshot({ path: path.join(__dirname, 'nbw_note_zoom.png'), clip: { x: 0, y: 70, width: 700, height: 230 } });
    // 设置面板预览
    await page.evaluate(() => {
        const N = WebNBS;
        const openBtn = document.querySelector('[data-open-settings], #btn-settings');
        if (openBtn) openBtn.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const tab = document.querySelector('[data-settings-tab="display"]');
        if (tab) tab.click();
        const sub = document.querySelector('[data-display-subtab="note"]');
        if (sub) sub.click();
        // 展开全部设置分组, 便于截图核对四类内容的 大小/位置/颜色
        document.querySelectorAll('#settings-subpanel-note details').forEach(d => { d.open = true; });
        WebNBS.renderNotePreview && WebNBS.renderNotePreview();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(__dirname, 'nbw_note_settings.png') });
    await page.screenshot({ path: path.join(__dirname, 'nbw_note_settings_zoom.png'), clip: { x: 315, y: 60, width: 400, height: 560 } });
    const panel = await page.$('#settings-subpanel-note');
    if (panel) await panel.screenshot({ path: path.join(__dirname, 'nbw_note_settings_panel.png') });
    await browser.close();
    srv.close();
    console.log('saved nbw_note_display.png / nbw_note_settings.png');
})().catch(e => { console.error(e); process.exit(1); });
