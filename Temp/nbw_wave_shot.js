/* Temp/nbw_wave_shot.js — 波形视觉复查 (截图 + 像素统计)
   运行: node Temp/nbw_wave_shot.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8147;
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

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const info = await page.evaluate(() => {
        const N = WebNBS, st = N.state, roll = st.pianoRoll;
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const sr = 44100, secs = 4, len = sr * secs;
        const buf = ac.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        // 8 个衰减音 (峰值 0.6), 第 3、6 个为休止 → 波形应有明显疏密
        const notes = [0, 0.5, 1.0, 1.75, 2.25, 3.0, 3.5];
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            for (const nt of notes) {
                if (t >= nt && t < nt + 0.4) {
                    const dt = t - nt;
                    v += Math.sin(2 * Math.PI * 330 * dt) * 0.6 * Math.exp(-dt * 9);
                }
            }
            d[i] = Math.max(-1, Math.min(1, v));
        }
        st.tempo = 20;
        st.song = st.song || {};
        st.song.layers = [{ name: 'Layer 1', volume: 100, stereo: 100, lock: 0 }];
        st.notes = [{ id: 'n1', tick: 0, layer: 0, instrument: 0, key: 48, velocity: 100, pan: 100, pitch: 0 }];
        st.tracks = []; st.maxTick = 80;
        st.lyrics = []; st.lyricLanes = [];
        st.segmentsEditMode = false;
        st.segments = []; st.segmentLanes = []; st._segmentsEdited = false;
        st.audioLanes = [{ id: 'al1', name: '参考音频', after: 0, volume: 100, muted: false }];
        st.audioClips = [{ id: 'c1', lane: 0, tick: 0, dur: 80, offsetSec: 0, bufferId: 'b1', gain: 1, name: 'ref.wav' }];
        st.audioBuffers = { b1: { name: 'ref.wav', buffer: buf, duration: secs } };
        if (N.syncAudioToRoll) N.syncAudioToRoll();
        roll._audioPeaks = {};
        roll._fullRedrawNeeded = true;
        roll.render();
        const rect = roll._audioRowRect(0);
        const peaks = roll._computeAudioPeaks(st.audioClips[0], 200);
        let mx = 0;
        if (peaks) for (const p of peaks) mx = Math.max(mx, Math.abs(p.max), Math.abs(p.min));
        return { rect, peakMax: mx, canvasW: roll.canvas.clientWidth, canvasH: roll.canvas.clientHeight };
    });
    console.log('info', JSON.stringify(info));

    // 截图: 整页 (便于观察音频块位置)
    await page.screenshot({ path: path.join(__dirname, 'nbw_wave_nbs_full.png') });
    // 截图: 音频块区域
    const clip = await page.evaluate(() => {
        const roll = WebNBS.state.pianoRoll;
        const r = roll._audioRowRect(0);
        const x0 = roll._tickToScreen(0);
        const wpx = roll._cfg.cellW * roll._zoomX() * 80;
        return { x: Math.max(0, x0 - 4), y: Math.max(0, r.top - 6), width: Math.min(1300, wpx + 8), height: r.h + 12 };
    });
    await page.screenshot({ path: path.join(__dirname, 'nbw_wave_nbs_clip.png'), clip });

    // 片段模式截图
    const segInfo = await page.evaluate(() => {
        const N = WebNBS, st = N.state, roll = st.pianoRoll;
        st.segmentLanes = [{ id: 1, name: 'L0', muted: false, solo: false, volume: 100, height: 72, layerKeys: [0] }];
        st.segments = [{ id: 1, lane: 0, start: 0, end: 80, name: 'seg', notes: [] }];
        N.segmentEnsureLanes();
        st.segmentsEditMode = true;
        if (roll.setSegmentsEditMode) roll.setSegmentsEditMode(true);
        roll.segmentsEditMode = true;
        roll._audioPeaks = {};
        roll._fullRedrawNeeded = true;
        roll.render();
        let idx = -1;
        for (let i = 0; i < st.segmentLanes.length; i++) {
            const sp = st.segmentLanes[i] && st.segmentLanes[i].special;
            if (sp && sp.kind === 'audio') { idx = i; break; }
        }
        if (idx < 0) return null;
        const top = roll.getSegmentLaneTop(idx);
        return { x: Math.max(0, roll._tickToScreen(0) - 4), y: Math.max(0, top - 4), width: 900, height: st.segmentLanes[idx].height + 10 };
    });
    if (segInfo) await page.screenshot({ path: path.join(__dirname, 'nbw_wave_seg_clip.png'), clip: segInfo });
    console.log('segInfo', JSON.stringify(segInfo));

    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
