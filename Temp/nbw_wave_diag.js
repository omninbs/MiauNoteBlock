/* Temp/nbw_wave_diag.js — 诊断音频块为何未绘制 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8148;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json' };
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
    page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.evaluate(() => {
        const w = document.getElementById('welcome-screen');
        if (w) { w.style.display = 'none'; w.classList.remove('visible'); }
        const o = document.querySelector('.welcome-overlay');
        if (o) o.style.display = 'none';
    });
    await page.waitForTimeout(800);

    const out = await page.evaluate(() => {
        const N = WebNBS, st = N.state, roll = st.pianoRoll;
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const sr = 44100, len = sr * 2;
        const buf = ac.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        // 音乐型包络: 多个衰减音 + 休止段, 峰值 0.35 (中低响度, 检验归一化效果)
        const notes = [0, 0.25, 0.5, 0.75, 1.1, 1.35, 1.6];
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            let v = 0;
            for (const nt of notes) {
                if (t >= nt && t < nt + 0.22) {
                    const dt = t - nt;
                    v += Math.sin(2 * Math.PI * 330 * dt) * 0.35 * Math.exp(-dt * 12);
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
        st.audioClips = [{ id: 'c1', lane: 0, tick: 0, dur: 40, offsetSec: 0, bufferId: 'b1', gain: 1, name: 'ref.wav' }];
        st.audioBuffers = { b1: { name: 'ref.wav', buffer: buf, duration: 2 } };
        const before = {
            stLanes: (st.audioLanes || []).length,
            stClips: (st.audioClips || []).length,
            rollLanes: (roll.audioLanes || []).length,
            rollClips: (roll.audioClips || []).length,
            rollBufs: roll.audioBuffers ? Object.keys(roll.audioBuffers).length : -1
        };
        if (N.syncAudioToRoll) N.syncAudioToRoll();
        const after = {
            stLanes: (st.audioLanes || []).length,
            stClips: (st.audioClips || []).length,
            rollLanes: (roll.audioLanes || []).length,
            rollClips: (roll.audioClips || []).length,
            rollBufs: roll.audioBuffers ? Object.keys(roll.audioBuffers).length : -1,
            laneCount: roll._audioLaneCount(),
            rowRect: roll._audioRowRect(0),
            tickToScreen0: roll._tickToScreen(0),
            clip0: roll.audioClips ? roll.audioClips[0] : null,
            peaks: (function () {
                const p = roll._computeAudioPeaks(roll.audioClips[0], 100);
                return p ? p.length : null;
            })()
        };
        roll._audioPeaks = {};
        roll._fullRedrawNeeded = true;
        roll.render();
        // 采样音频行内的像素: 青色 b>r+10 或白色亮像素
        const cv = roll.canvas, c2 = cv.getContext('2d');
        const dpr = cv.width / (cv.clientWidth || cv.width);
        const r = roll._audioRowRect(0);
        const y = Math.round((r.top + r.h / 2) * dpr);
        const img = c2.getImageData(Math.round(140 * dpr), y, Math.round(1200 * dpr), 1).data;
        let cyan = 0, bright = 0;
        for (let i = 0; i < img.length; i += 4) {
            const rr = img[i], gg = img[i + 1], bb = img[i + 2];
            if (bb > rr + 10 && bb > 30) cyan++;
            if (rr > 150 && gg > 150 && bb > 150) bright++;
        }
        return { before, after, cyan, bright, rowRect: r };
    });
    console.log(JSON.stringify(out, null, 2));
    const rr = await page.evaluate(() => {
        const roll = WebNBS.state.pianoRoll;
        const r = roll._audioRowRect(0);
        const cr = roll.canvas.getBoundingClientRect();
        return { x: cr.left + Math.max(0, roll._tickToScreen(0) - 2), y: cr.top + Math.max(0, r.top - 4), width: 900, height: r.h + 8 };
    });
    await page.screenshot({ path: path.join(__dirname, 'nbw_wave_diag_row.png'), clip: rr });

    // 片段模式音频同步行截图
    const segClip = await page.evaluate(() => {
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
        const cr = roll.canvas.getBoundingClientRect();
        const top = roll.getSegmentLaneTop(idx);
        return {
            x: cr.left + Math.max(0, roll._tickToScreen(0) - 2),
            y: cr.top + Math.max(0, top),
            width: 900,
            height: st.segmentLanes[idx].height + 4
        };
    });
    if (segClip) await page.screenshot({ path: path.join(__dirname, 'nbw_wave_diag_segrow.png'), clip: segClip });
    await page.screenshot({ path: path.join(__dirname, 'nbw_wave_diag.png') });
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
