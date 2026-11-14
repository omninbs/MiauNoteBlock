/* Temp/nbw_perf_audio2.js — 定位音频首播卡顿: AudioContext 预热 vs AudioBuffer 预热 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8135;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function makeWav(seconds, freq) {
    const sr = 44100, n = Math.floor(sr * seconds);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 18000), 44 + i * 2);
    return b;
}
const WAV = makeWav(45, 330);
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = (req.url || '/').split('?')[0];
            if (url === '/__long.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(WAV); return; }
            let p = decodeURIComponent(url); if (p.endsWith('/')) p += 'index.html';
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
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && window.WebNBS.state && window.WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    await page.evaluate(async () => {
        const N = WebNBS, st = N.state;
        const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none';
        st.song = st.song || {}; st.song.layers = []; st.notes = [];
        for (let L = 0; L < 4; L++) {
            st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
            for (let t = 0; t < 80; t += 2) st.notes.push({ id: 'p' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
        }
        st.tracks = []; st.maxTick = 200; st.tempo = 20;
        st.lyrics = []; st.lyricLanes = []; st.segments = []; st.segmentLanes = [];
        st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
        st.pianoRoll.setNotes(st.notes); st.pianoRoll.render();
        const res = await fetch('/__long.wav');
        await N.importAudioFile(new File([await res.arrayBuffer()], 'long.wav', { type: 'audio/wav' }));
        for (let i = 0; i < 100 && !Object.keys(st.audioBuffers).length; i++) await new Promise(r => setTimeout(r, 100));
    });

    async function playMeasure(prewarm) {
        return page.evaluate(async (mode) => {
            const N = WebNBS, st = N.state, pr = st.pianoRoll;
            const AE = window.AudioEngine;
            st.followProgress = false;
            N.seekToTick(0, true); pr.scrollX = 0;
            // 预热
            const ac = AE.getContext ? AE.getContext() : null;
            if (mode !== 'none' && ac) {
                if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) {} }
                if (mode === 'buffer') {
                    const keys = Object.keys(st.audioBuffers);
                    const buf = keys.length ? st.audioBuffers[keys[0]].buffer : null;
                    if (buf) {
                        try {
                            const src = ac.createBufferSource();
                            const g = ac.createGain(); g.gain.value = 0;
                            src.buffer = buf; src.connect(g); g.connect(ac.destination);
                            src.start(ac.currentTime, 0);
                            src.stop(ac.currentTime + 0.03);
                        } catch (e) {}
                    }
                } else {
                    try {
                        const b = ac.createBuffer(1, 1, 22050);
                        const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination);
                        s.start(ac.currentTime);
                    } catch (e) {}
                }
                await new Promise(r => setTimeout(r, 260));
            }
            const frames = [];
            let stop = false, last = performance.now();
            function frame() { const n = performance.now(); frames.push(n - last); last = n; if (!stop && frames.length < 180) requestAnimationFrame(frame); }
            requestAnimationFrame(frame);
            N.handlePlayToggle();
            await new Promise(r => setTimeout(r, 2200));
            N.handlePlayToggle();
            stop = true;
            await new Promise(r => setTimeout(r, 120));
            const f = frames.slice(1).sort((a, b) => b - a);
            return { maxMs: Math.round(f[0] || 0), over50: f.filter(x => x > 50).length, first12: frames.slice(1, 13).map(x => Math.round(x)) };
        }, prewarm);
    }

    const noPrewarm = await playMeasure('none');
    await page.waitForTimeout(300);
    const ctxPrewarm = await playMeasure('context');
    await page.waitForTimeout(300);
    const bufPrewarm = await playMeasure('buffer');
    console.log('不预热  :', JSON.stringify(noPrewarm));
    console.log('上下文预热:', JSON.stringify(ctxPrewarm));
    console.log('缓冲预热 :', JSON.stringify(bufPrewarm));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
