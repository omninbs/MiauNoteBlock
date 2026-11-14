/* Temp/nbw_perf_audio7.js — 二分: 音频 x 音符 x 渲染 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8140;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function wav(sec, sr) {
    const n = Math.floor(sr * sec), freq = 330;
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 18000), 44 + i * 2);
    return b;
}
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const m = /^\/__wav(\d+)\.wav$/.exec((req.url || '').split('?')[0]);
            if (m) { const b = wav(parseInt(m[1], 10), 48000); res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(b); return; }
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
async function scenario(browser, opts) {
    const { ctx, page } = await fresh(browser);
    const out = await page.evaluate(async (opts) => {
        const N = WebNBS, st = N.state, pr = st.pianoRoll, AE = window.AudioEngine;
        const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none';
        st.song = st.song || {}; st.song.layers = []; st.notes = [];
        for (let L = 0; L < 4; L++) {
            st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
            for (let t = 0; t < 200; t += 2) st.notes.push({ id: 'p' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
        }
        st.tracks = []; st.maxTick = 400; st.tempo = 20;
        st.lyrics = []; st.lyricLanes = []; st.segments = []; st.segmentLanes = [];
        st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
        if (opts.noNotes) st.notes = [];
        pr.setNotes(st.notes); pr.render();
        AE.init && AE.init();
        const ac = AE.getContext();
        if (ac && ac.state === 'suspended') { try { await ac.resume(); } catch (e) {} }
        if (opts.audio) {
            const res = await fetch('/__wav45.wav');
            await N.importAudioFile(new File([await res.arrayBuffer()], 'a.wav', { type: 'audio/wav' }));
            for (let i = 0; i < 100 && !Object.keys(st.audioBuffers).length; i++) await new Promise(r => setTimeout(r, 100));
        }
        let origRender = null;
        if (opts.noRender) { origRender = pr.render; pr.render = function () {}; }
        st.followProgress = false;
        N.seekToTick(0, true); pr.scrollX = 0;
        const frames = [];
        let stop = false, last = performance.now();
        function f() { const n = performance.now(); frames.push(n - last); last = n; if (!stop && frames.length < 160) requestAnimationFrame(f); }
        requestAnimationFrame(f);
        N.handlePlayToggle();
        await new Promise(r => setTimeout(r, 1800));
        N.handlePlayToggle();
        stop = true;
        await new Promise(r => setTimeout(r, 100));
        if (origRender) pr.render = origRender;
        const s = frames.slice(1).sort((a, b) => b - a);
        return { maxMs: Math.round(s[0] || 0), over50: s.filter(x => x > 50).length };
    }, opts);
    await ctx.close();
    return out;
}
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    console.log('A 音符+音频+渲染 :', JSON.stringify(await scenario(browser, { audio: true })));
    console.log('B 仅音频+渲染    :', JSON.stringify(await scenario(browser, { audio: true, noNotes: true })));
    console.log('C 音符+音频无渲染:', JSON.stringify(await scenario(browser, { audio: true, noRender: true })));
    console.log('D 音符无音频+渲染:', JSON.stringify(await scenario(browser, {})));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
