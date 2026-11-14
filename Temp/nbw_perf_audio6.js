/* Temp/nbw_perf_audio6.js — AudioBufferSource vs MediaElement 流式播放 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8139;
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
        const res = await fetch('/__wav45.wav');
        const ab = await res.arrayBuffer();
        const blob = new Blob([ab], { type: 'audio/wav' });
        const AE = window.AudioEngine;
        AE.init && AE.init();
        const ac = AE.getContext();
        if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) {} }

        function measureFrames(action, ms) {
            return new Promise((resolve) => {
                const frames = [];
                let stop = false, last = performance.now();
                function f() { const n = performance.now(); frames.push(n - last); last = n; if (!stop && frames.length < 150) requestAnimationFrame(f); }
                requestAnimationFrame(f);
                Promise.resolve(action()).then(() => {
                    setTimeout(() => {
                        stop = true;
                        const s = frames.slice(1).sort((a, b) => b - a);
                        resolve({ maxMs: Math.round(s[0] || 0), over50: s.filter(x => x > 50).length });
                    }, ms);
                });
            });
        }

        // A: AudioBufferSource
        const buf = await ac.decodeAudioData(ab.slice(0));
        const A = await measureFrames(() => {
            const src = ac.createBufferSource(), g = ac.createGain();
            src.buffer = buf; g.gain.value = 0.4; src.connect(g); g.connect(ac.destination);
            src.start();
            setTimeout(() => { try { src.stop(); } catch (e) {} }, 1400);
        }, 1500);
        await new Promise(r => setTimeout(r, 300));

        // B: MediaElement + MediaElementSource
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        el.preload = 'auto';
        const src2 = ac.createMediaElementSource(el);
        const g2 = ac.createGain(); g2.gain.value = 0.4;
        src2.connect(g2); g2.connect(ac.destination);
        const B = await measureFrames(async () => {
            try { await el.play(); } catch (e) { return; }
            setTimeout(() => { el.pause(); }, 1400);
        }, 1500);
        URL.revokeObjectURL(url);
        return { bufferSource: A, mediaElement: B };
    });
    console.log(JSON.stringify(out));
    await browser.close();
    srv.close();
})().catch(e => { console.error('fatal:', e); process.exit(2); });
