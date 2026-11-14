/* Temp/nbw_perf_audio9.js — 分片+分帧调度长音频 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8142;
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
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(async () => {
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
        pr.setNotes(st.notes); pr.render();
        AE.init && AE.init();
        const ac = AE.getContext();
        if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) {} }
        const res = await fetch('/__wav45.wav');
        const sab = await res.arrayBuffer();
        await N.importAudioFile(new File([sab], 'a.wav', { type: 'audio/wav' }));
        for (let i = 0; i < 100 && !Object.keys(st.audioBuffers).length; i++) await new Promise(r => setTimeout(r, 100));

        // 准备 1 秒分片
        const src = ac.createBuffer(1, Math.round(ac.sampleRate * 45), ac.sampleRate);
        const dec = await ac.decodeAudioData(sab.slice(0));
        const mono = dec.getChannelData(0);
        src.copyToChannel(mono, 0);
        const chunkSec = 1;
        const chunks = [];
        for (let t = 0; t < 45; t += chunkSec) {
            const start = Math.floor(t * ac.sampleRate);
            const len = Math.min(Math.floor(chunkSec * ac.sampleRate), src.length - start);
            const c = ac.createBuffer(1, Math.max(1, len), ac.sampleRate);
            c.copyToChannel(mono.subarray(start, start + len), 0);
            chunks.push(c);
        }
        const gain = ac.createGain(); gain.gain.value = 0.5; gain.connect(ac.destination);
        const timers = [];
        const sources = [];
        const origPlay = AE.playClip;
        let started = false;
        AE.playClip = function (buffer, whenSec, offsetSec, g, pan, layerKey) {
            if (started) return false;
            started = true;
            const t0 = ac.currentTime + 0.02;
            chunks.forEach((ch, i) => {
                const delayMs = Math.max(0, (t0 + i * chunkSec - 0.15 - ac.currentTime) * 1000);
                timers.push(setTimeout(() => {
                    try {
                        const s = ac.createBufferSource();
                        s.buffer = ch; s.connect(gain);
                        s.start(t0 + i * chunkSec);
                        sources.push(s);
                    } catch (e) {}
                }, delayMs));
            });
            return true;
        };

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
        timers.forEach(clearTimeout);
        sources.forEach(s => { try { s.stop(); } catch (e) {} });
        AE.playClip = origPlay;
        const s = frames.slice(1).sort((a, b) => b - a);
        return { maxMs: Math.round(s[0] || 0), over50: s.filter(x => x > 50).length, chunks: chunks.length, sampleRate: ac.sampleRate };
    });
    console.log('分片调度:', JSON.stringify(out));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
