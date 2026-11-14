/* Temp/nbw_perf_audio3.js — 长帧耗时归属定位 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8136;
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
async function newPage(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && window.WebNBS.state && window.WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    return { ctx, page };
}
async function setup(page, withAudio) {
    await page.evaluate(async (withAudio) => {
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
        if (withAudio) {
            const res = await fetch('/__long.wav');
            await N.importAudioFile(new File([await res.arrayBuffer()], 'long.wav', { type: 'audio/wav' }));
            for (let i = 0; i < 100 && !Object.keys(st.audioBuffers).length; i++) await new Promise(r => setTimeout(r, 100));
        }
    }, withAudio);
}
async function measure(page) {
    return page.evaluate(async () => {
        const N = WebNBS, st = N.state, pr = st.pianoRoll, AE = window.AudioEngine;
        const buckets = { playNote: 0, playClip: 0, render: 0, hlNotes: 0, hlTracks: 0, progress: 0, other: 0 };
        function wrap(obj, key, bucket) {
            if (!obj || typeof obj[key] !== 'function') return null;
            const orig = obj[key];
            obj[key] = function () {
                const t = performance.now();
                const r = orig.apply(obj, arguments);
                buckets[bucket] += performance.now() - t;
                return r;
            };
            return orig;
        }
        const restores = [];
        let o;
        o = wrap(AE, 'playNote', 'playNote'); if (o) restores.push(() => AE.playNote = o);
        o = wrap(AE, 'playClip', 'playClip'); if (o) restores.push(() => AE.playClip = o);
        o = wrap(pr, 'render', 'render'); if (o) restores.push(() => pr.render = o);
        o = wrap(pr, 'highlightPlayingNotes', 'hlNotes'); if (o) restores.push(() => pr.highlightPlayingNotes = o);
        o = wrap(pr, 'highlightTriggeredTracks', 'hlTracks'); if (o) restores.push(() => pr.highlightTriggeredTracks = o);
        o = wrap(N, 'updateProgressUI', 'progress'); if (o) restores.push(() => N.updateProgressUI = o);

        st.followProgress = false;
        N.seekToTick(0, true); pr.scrollX = 0;
        const frames = [];
        const longFrames = [];
        let stop = false, last = performance.now();
        let prev = Object.assign({}, buckets);
        function frame() {
            const n = performance.now();
            const dt = n - last;
            const snap = {};
            for (const k in buckets) { snap[k] = Math.round(buckets[k] - prev[k]); prev[k] = buckets[k]; }
            frames.push({ dt: Math.round(dt), ...snap });
            if (dt > 100) longFrames.push({ i: frames.length, dt: Math.round(dt), ...snap });
            last = n;
            if (!stop && frames.length < 180) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        N.handlePlayToggle();
        await new Promise(r => setTimeout(r, 2200));
        N.handlePlayToggle();
        stop = true;
        await new Promise(r => setTimeout(r, 120));
        restores.forEach(f => f());
        const dts = frames.slice(1).map(f => f.dt).sort((a, b) => b - a);
        return { maxMs: dts[0] || 0, over50: dts.filter(x => x > 50).length, longFrames };
    });
}

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

    const a = await newPage(browser);
    await setup(a.page, false);
    const baseline = await measure(a.page);
    await a.ctx.close();

    const b = await newPage(browser);
    await setup(b.page, true);
    const withAudio = await measure(b.page);
    await b.ctx.close();

    console.log('基线(无音频, 独立页面):', JSON.stringify(baseline));
    console.log('有音频(独立页面):', JSON.stringify(withAudio));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
