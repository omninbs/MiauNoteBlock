/* Temp/nbw_stream_test2.js — 180s: 音频播放 / 移除音频 / 纯渲染 分别测量 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8150;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function wav(sec, sr) {
    const n = Math.floor(sr * sec), freq = 220;
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 16000), 44 + i * 2);
    return b;
}
const WAV180 = wav(180, 48000);
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            if ((req.url || '').split('?')[0] === '/__wav180.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(WAV180); return; }
            let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            fs.readFile(path.join(ROOT, p), (err, data) => {
                if (err) { res.writeHead(404); res.end('nf'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}
async function fresh(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && window.WebNBS.state && window.WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1100);
    return { ctx, page };
}
async function scenario(browser, mode) {
    const { ctx, page } = await fresh(browser);
    const out = await page.evaluate(async (mode) => {
        const N = WebNBS, st = N.state, pr = st.pianoRoll, AE = window.AudioEngine;
        const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none';
        st.song = st.song || {}; st.song.layers = []; st.notes = [];
        for (let L = 0; L < 4; L++) {
            st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
            for (let t = 0; t < 400; t += 2) st.notes.push({ id: 'p' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
        }
        st.tracks = []; st.maxTick = 3600; st.tempo = 20;
        st.lyrics = []; st.lyricLanes = []; st.segments = []; st.segmentLanes = [];
        st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
        pr.setNotes(st.notes); pr.render();
        AE.init && AE.init();
        if (mode !== 'noaudio') {
            const res = await fetch('/__wav180.wav');
            await N.importAudioFile(new File([await res.arrayBuffer()], 'l.wav', { type: 'audio/wav' }));
            for (let i = 0; i < 200 && !Object.keys(st.audioBuffers).length; i++) await new Promise(r => setTimeout(r, 100));
            for (let i = 0; i < 40; i++) { if (AE.isClipStreamReady && AE.isClipStreamReady()) break; await new Promise(r => setTimeout(r, 100)); }
        }
        if (mode === 'noaudio') { st.audioLanes = []; st.audioClips = []; st.audioBuffers = {}; N.refreshAudioLaneUI && N.refreshAudioLaneUI(); }
        const frames = [];
        let stop = false, last = performance.now();
        function f() { const n = performance.now(); frames.push(n - last); last = n; if (!stop && frames.length < 150) requestAnimationFrame(f); }
        st.followProgress = false;
        N.seekToTick(0, true); pr.scrollX = 0;
        requestAnimationFrame(f);
        if (mode === 'renderonly') {
            // 不播放, 仅渲染
            for (let i = 0; i < 100; i++) { pr._fullRedrawNeeded = true; pr.render(); await new Promise(r => setTimeout(r, 16)); }
        } else {
            N.handlePlayToggle();
            await new Promise(r => setTimeout(r, 2000));
            N.handlePlayToggle();
        }
        stop = true;
        await new Promise(r => setTimeout(r, 150));
        const s = frames.slice(1).sort((a, b) => b - a);
        return {
            mode, maxMs: Math.round(s[0] || 0),
            over50: s.filter(x => x > 50).length,
            over200: s.filter(x => x > 200).length,
            first8: frames.slice(1, 9).map(x => Math.round(x)),
            totalTicks: pr.totalTicks, streamReady: AE.isClipStreamReady ? AE.isClipStreamReady() : null
        };
    }, mode);
    await ctx.close();
    return out;
}
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    console.log('音频+播放 :', JSON.stringify(await scenario(browser, 'audio')));
    console.log('无音频+播放:', JSON.stringify(await scenario(browser, 'noaudio')));
    console.log('音频+仅渲染:', JSON.stringify(await scenario(browser, 'renderonly')));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
