/* Temp/nbw_wave_long_test.js — 长音频 (3 分钟) 音频块波形诊断
   运行: node Temp/nbw_wave_long_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8151;
const results = [];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json', '.svg': 'image/svg+xml' };
function record(name, status, detail) {
    results.push({ name, status });
    console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
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
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.evaluate(() => { const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none'; });
    await page.waitForTimeout(800);

    try {
        const r = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            const AC = window.AudioContext || window.webkitAudioContext;
            const ac = new AC();
            const sr = 44100, secs = 180, len = sr * secs;
            const buf = ac.createBuffer(2, len, sr);   // 立体声, 模拟真实音乐
            const dL = buf.getChannelData(0), dR = buf.getChannelData(1);
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                // 每 0.5 秒一个音, 幅度 0.25~0.9 波动
                const k = Math.floor(t * 2);
                const amp = 0.25 + 0.6 * Math.abs(Math.sin(k * 1.7));
                const env = Math.exp(-(t * 2 % 1) * 4);
                const v = Math.sin(2 * Math.PI * 220 * t) * amp * env;
                dL[i] = v;
                dR[i] = v * 0.8;
            }
            st.tempo = 20;
            st.song = st.song || {};
            st.song.layers = [{ name: 'Layer 1', volume: 100, stereo: 100, lock: 0 }];
            st.notes = [{ id: 'n1', tick: 0, layer: 0, instrument: 0, key: 48, velocity: 100, pan: 100, pitch: 0 }];
            st.tracks = []; st.maxTick = 3700;
            st.lyrics = []; st.lyricLanes = [];
            st.segmentsEditMode = false;
            st.segments = []; st.segmentLanes = []; st._segmentsEdited = false;
            st.audioLanes = [{ id: 'al1', name: '参考音频', after: 0, volume: 100, muted: false }];
            st.audioClips = [{ id: 'c1', lane: 0, tick: 0, dur: Math.round(secs * 20), offsetSec: 0, bufferId: 'b1', gain: 1, name: 'ref.mp3' }];
            st.audioBuffers = { b1: { name: 'ref.mp3', buffer: buf, duration: secs } };
            if (N.syncAudioToRoll) N.syncAudioToRoll();
            roll._audioPeaks = {};
            roll._fullRedrawNeeded = true;
            roll.render();

            const t0 = performance.now();
            const peaks = roll._computeAudioPeaks(st.audioClips[0], 4000);
            const t1 = performance.now();
            let mx = 0, zeros = 0;
            if (peaks) {
                for (const p of peaks) {
                    mx = Math.max(mx, Math.abs(p.max), Math.abs(p.min));
                    if (Math.abs(p.max) < 1e-6 && Math.abs(p.min) < 1e-6) zeros++;
                }
            }
            // 采样音频行
            const cv = roll.canvas, c2 = cv.getContext('2d');
            const dpr = cv.width / (cv.clientWidth || cv.width);
            const rect = roll._audioRowRect(0);
            const x0 = roll._tickToScreen(0);
            const px = Math.round((x0 + 6) * dpr), py = Math.round((rect.top + rect.h * 0.2) * dpr);
            const w = Math.max(1, Math.round(600 * dpr)), h = Math.max(1, Math.round(rect.h * 0.6 * dpr));
            let bright = 0;
            try {
                const d = c2.getImageData(px, py, w, h).data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    if (lum > 110) bright++;
                }
            } catch (e) {}
            // 中等缩放: 让一个屏幕显示约 30 秒
            roll._setZoom ? roll._setZoom(0.1) : (roll.zoom = 0.1);
            roll._fullRedrawNeeded = true;
            roll.render();
            return {
                peaksLen: peaks ? peaks.length : null,
                peakMax: mx, zeroBars: zeros,
                computeMs: Math.round(t1 - t0),
                rect, bright,
                zoomX: roll._zoomX(), clipW: roll._cfg.cellW * roll._zoomX() * 3600
            };
        });
        record('L1 3分钟立体声: 峰值计算正常', (r.peaksLen === 4000 && r.peakMax > 0.5 && r.zeroBars < 4000) ? 'PASS' : 'FAIL', JSON.stringify(r));
        record('L2 3分钟音频块出现波形像素', r.bright > 100 ? 'PASS' : 'FAIL', 'bright=' + r.bright);
        record('L3 峰值计算耗时 < 120ms', r.computeMs < 120 ? 'PASS' : 'FAIL', r.computeMs + 'ms');
        await page.screenshot({ path: path.join(__dirname, 'nbw_wave_long.png') });
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.stack || e));
    }
    await browser.close();
    srv.close();
    const fail = results.filter(x => x.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
