/* Temp/nbw_label_follow_test.js — 标签跟随视口 + 设置子标签持久化验证 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8133;
const results = [];
function record(n, s, d) { results.push({ n, s }); console.log(`[${s}] ${n}${d ? ' — ' + d : ''}`); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            fs.readFile(path.join(ROOT, p), (err, data) => {
                if (err) { res.writeHead(404); res.end('nf'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    /* 准备: 一个长歌词块 */
    await page.evaluate(() => {
        const N = WebNBS, st = N.state;
        const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none';
        st.song = st.song || {}; st.song.layers = [{ name: 'Layer 1', volume: 100, stereo: 100, lock: 0 }];
        st.notes = []; st.tracks = []; st.maxTick = 200; st.tempo = 20;
        st.segments = []; st.segmentLanes = [];
        st.lyricLanes = [{ id: 'll1', name: '歌词 1', after: 0 }];
        st.lyrics = [{ id: 'ly1', lane: 0, tick: 10, duration: 40, text: '标签跟随标签跟随标签跟随' }];
        st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
        N.ensureLyricLanes && N.ensureLyricLanes();
        N.syncLyricsToRoll && N.syncLyricsToRoll();
        st.pianoRoll.setNotes([]);
        st.pianoRoll.totalTicks = 200;
        st.pianoRoll.render();
    });
    await page.waitForTimeout(300);

    function measure(scrollX) {
        return page.evaluate((sx) => {
            const pr = WebNBS.state.pianoRoll;
            pr.scrollX = sx;
            pr._fullRedrawNeeded = true;
            pr.render();
            const cv = pr.canvas, ctx = cv.getContext('2d');
            const dprX = cv.width / (cv.clientWidth || cv.width);
            const dprY = cv.height / (cv.clientHeight || cv.height);
            // 歌词行 y: 用行模型定位
            let y = 0;
            try {
                const idx = pr._rowLayout().rows.findIndex(r => r.type === 'lyric');
                if (idx >= 0) y = pr._trackRowScreenY(idx) + pr._cfg.cellH / 2;
            } catch (e) {}
            if (!y) y = pr._cfg.timelineHeight + 40;
            const rowY = Math.round(y * dprY);
            const img = ctx.getImageData(0, Math.max(0, rowY - 6), cv.width, 12).data;
            let minWhite = -1, count = 0;
            for (let i = 0; i < img.length; i += 4) {
                const r = img[i], g = img[i + 1], b = img[i + 2];
                if (r > 235 && g > 235 && b > 235) {
                    const x = Math.round((i / 4) % (cv.width));
                    if (minWhite < 0 || x < minWhite) minWhite = x;
                    count++;
                }
            }
            return { minWhite: Math.round(minWhite / dprX), count, pw: pr._currentPanelWidth, rowY: Math.round(y) };
        }, scrollX);
    }

    const base = await measure(0);
    // 让块左半被侧栏遮挡: 块起点 = 10*cellW - scrollX + pw
    const shifted = await page.evaluate(() => {
        const pr = WebNBS.state.pianoRoll;
        return Math.round(10 * pr._cfg.cellW * pr._zoomX() + 60);
    });
    const clipped = await measure(shifted);
    record('T1 标签随视口裁剪(贴住可见左边缘)',
        (base.minWhite > 300 && clipped.minWhite >= clipped.pw - 2 && clipped.minWhite < base.minWhite - 50) ? 'PASS' : 'FAIL',
        JSON.stringify({ base, clipped }));

    /* 设置子标签持久化 */
    const t2 = await page.evaluate(async () => {
        const tab = document.querySelector('[data-settings-tab="display"]');
        if (tab) tab.click();
        const sub = document.querySelector('[data-display-subtab="segment"]');
        if (sub) sub.click();
        await new Promise(r => setTimeout(r, 200));
        const sel = document.getElementById('settings-segment-preview-mode');
        if (!sel) return { err: 'no select' };
        sel.value = 'physical';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const panel = document.getElementById('settings-subpanel-segment');
        const visible = panel ? getComputedStyle(panel).display !== 'none' : false;
        return {
            saved: localStorage.getItem('noteblock.segment_preview_mode'),
            mode: WebNBS.state.pianoRoll.segmentPreviewMode,
            panelVisible: visible
        };
    });
    record('T2 片段模式设置子标签可用且持久化',
        (!t2.err && t2.saved === 'physical' && t2.mode === 'physical' && t2.panelVisible) ? 'PASS' : 'FAIL', JSON.stringify(t2));

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.s === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
