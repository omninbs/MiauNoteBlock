/* Temp/nbw_wave_perf_test.js — 长音频波形抽样的性能与正确性 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8148;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && window.WebNBS.state && window.WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1100);

    const out = await page.evaluate(async () => {
        const N = WebNBS, st = N.state, pr = st.pianoRoll;
        const AE = window.AudioEngine;
        AE.init && AE.init();
        const ac = AE.getContext ? AE.getContext() : new AudioContext();
        if (ac && ac.state === 'suspended') { try { await ac.resume(); } catch (e) {} }
        // 5 分钟音频缓冲 (与真实音乐长度相当)
        const secs = 300;
        const buf = ac.createBuffer(1, ac.sampleRate * secs, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i += 7) d[i] = Math.sin(i * 0.001) * 0.8;
        st.audioLanes = [{ id: 'al1', name: 'a', after: 0, volume: 100, muted: false }];
        st.audioClips = [{ id: 'ac1', lane: 0, tick: 0, dur: secs * st.tempo, offsetSec: 0, bufferId: 'b1', gain: 1 }];
        st.audioBuffers = { b1: { name: 'long.wav', buffer: buf, duration: secs } };
        pr.setAudioLanes(st.audioLanes);
        pr.setAudioBuffers(st.audioBuffers);
        pr.audioClips = st.audioClips;

        // 1) 非播放时直接计算 (抽样后应与长度无关)
        pr._audioPeaks = {};
        const t0 = performance.now();
        const peaks = pr._computeAudioPeaks(st.audioClips[0]);
        const computeMs = performance.now() - t0;

        // 2) 播放中首次取峰值: 应立即返回 null 且不阻塞
        pr._audioPeaks = {};
        st.isPlaying = true;
        const t1 = performance.now();
        const during = pr._getAudioPeaks(st.audioClips[0]);
        const duringMs = performance.now() - t1;
        await new Promise(r => setTimeout(r, 120));
        const cached = pr._audioPeaks['ac1'] && pr._audioPeaks['ac1'].peaks;
        st.isPlaying = false;

        return {
            computeMs: Math.round(computeMs * 100) / 100,
            duringMs: Math.round(duringMs * 100) / 100,
            duringNull: during === null,
            peaksLen: peaks ? peaks.length : 0,
            hasAmplitude: !!(peaks && peaks.some(p => Math.abs(p.max) > 0.3)),
            asyncCached: !!cached,
            secs
        };
    });
    console.log(JSON.stringify(out));
    const ok = out.computeMs < 30 && out.duringNull && out.duringMs < 5 &&
        out.peaksLen === 60 && out.hasAmplitude && out.asyncCached;
    console.log(ok ? '[PASS] 长音频波形抽样与播放期延迟计算' : '[FAIL] 波形优化未达预期');
    await browser.close();
    srv.close();
    process.exit(ok ? 0 : 1);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
