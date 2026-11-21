/* Temp/nbw_wave_import_test.js — 真实导入链路下的波形可见性 + 刷新恢复后波形
   运行: node Temp/nbw_wave_import_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8149;
const results = [];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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

// 页面内脚本: 生成 1.5 秒 WAV 并导入, 然后统计音频行亮像素 (波形)
const PAGE_IMPORT_AND_MEASURE = async () => {
    const N = WebNBS, st = N.state, roll = st.pianoRoll;
    function makeWav(secs, sr) {
        const n = Math.floor(sr * secs);
        const buf = new ArrayBuffer(44 + n * 2);
        const dv = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
        dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) {
            const t = i / sr;
            const v = Math.sin(2 * Math.PI * 300 * t) * 0.5;
            dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, v * 32767)), true);
        }
        return buf;
    }
    const ab = makeWav(1.5, 44100);
    const f = new File([ab], 'tone.wav', { type: 'audio/wav' });
    await N.importAudioFile(f);
    // 轮询等待 clips
    for (let i = 0; i < 60; i++) {
        if ((st.audioClips || []).length) break;
        await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 600));
    const pr = st.pianoRoll;
    pr._audioPeaks = {};
    pr._fullRedrawNeeded = true;
    pr.render();
    const cv = pr.canvas, c2 = cv.getContext('2d');
    const dpr = cv.width / (cv.clientWidth || cv.width);
    const rect = pr._audioRowRect(0);
    const x0 = pr._tickToScreen(0);
    const cellW = pr._cfg.cellW * pr._zoomX();
    const wpx = cellW * 30;
    function bright(xa, xb, yFrac) {
        const px = Math.round(xa * dpr), py = Math.round((rect.top + rect.h * yFrac) * dpr);
        const w = Math.max(1, Math.round((xb - xa) * dpr)), h = Math.max(1, Math.round(rect.h * 0.5 * dpr));
        const d = c2.getImageData(px, py, w, h).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum > 120) n++;
        }
        return n;
    }
    const keys = Object.keys(st.audioBuffers || {});
    const b0 = keys.length ? st.audioBuffers[keys[0]] : null;
    return {
        lanes: (st.audioLanes || []).length,
        clips: (st.audioClips || []).length,
        bufHasAB: !!(b0 && b0.buffer && typeof b0.buffer.getChannelData === 'function'),
        rollBufs: pr.audioBuffers ? Object.keys(pr.audioBuffers).length : -1,
        missing: (pr.audioClips && pr.audioClips[0]) ? !!pr.audioClips[0].missing : null,
        peaks: (function () {
            const p = pr._computeAudioPeaks(pr.audioClips[0], 300);
            return p ? p.length : null;
        })(),
        brightPx: bright(x0 + 8, x0 + wpx - 8, 0.2)
    };
};

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.evaluate(() => {
        const w = document.getElementById('welcome-screen');
        if (w) w.style.display = 'none';
    });
    await page.waitForTimeout(800);

    try {
        const r1 = await page.evaluate(PAGE_IMPORT_AND_MEASURE);
        record('I1 真实导入后音频块绘制波形',
            (r1.clips >= 1 && r1.bufHasAB && r1.missing === false && r1.brightPx > 60) ? 'PASS' : 'FAIL',
            JSON.stringify(r1));

        // 触发一次自动保存, 然后模拟刷新
        await page.evaluate(() => {
            if (WebNBS.autoSaveLocal) WebNBS.autoSaveLocal();
            try { if (window.WebNBS && WebNBS.state) WebNBS.markDirty(); } catch (e) {}
        });
        await page.waitForTimeout(800);
        // 音频原始字节应已写入 IndexedDB (刷新后据此重新解码恢复)
        const dbState = await page.evaluate(async () => {
            if (!WebNBS.projectDbKeys) return { keys: null };
            const keys = await WebNBS.projectDbKeys();
            return { keys: keys, audioKeys: (keys || []).filter(k => String(k).indexOf('audio_asset__') === 0) };
        });
        record('I2 音频字节已写入 IndexedDB', (dbState.audioKeys && dbState.audioKeys.length >= 1) ? 'PASS' : 'FAIL',
            JSON.stringify(dbState));

        // 重新加载页面 (走自动恢复)
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
        await page.evaluate(() => { const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none'; });
        // 走「继续上次的项目」的恢复路径
        await page.evaluate(async () => {
            if (WebNBS.autoLoadLocal) WebNBS.autoLoadLocal();
        });
        await page.waitForTimeout(2500);
        // 显式再调一次, 便于拿到返回的诊断信息
        const dbRestore = await page.evaluate(async () => {
            if (!WebNBS.restoreAudioAssetsFromDb) return { err: 'no api' };
            const n = await WebNBS.restoreAudioAssetsFromDb();
            const raw = await WebNBS.projectDbGet('audio_asset__' + ((WebNBS.state.audioClips || [])[0] || {}).bufferId);
            return {
                restored: n,
                clipBufId: (WebNBS.state.audioClips || [])[0] ? WebNBS.state.audioClips[0].bufferId : null,
                recExists: !!raw,
                recBytes: raw && raw.bytes ? (raw.bytes.byteLength || 0) : -1
            };
        });
        console.log('dbRestore', JSON.stringify(dbRestore));
        const r3 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state, pr = st.pianoRoll;
            for (let i = 0; i < 40; i++) {
                if ((st.audioClips || []).length) break;
                await new Promise(r => setTimeout(r, 100));
            }
            pr._audioPeaks = {};
            pr._fullRedrawNeeded = true;
            pr.render();
            const cv = pr.canvas, c2 = cv.getContext('2d');
            const dpr = cv.width / (cv.clientWidth || cv.width);
            const rect = pr._audioRowRect(0);
            const x0 = pr._tickToScreen(0);
            const cellW = pr._cfg.cellW * pr._zoomX();
            const wpx = cellW * 30;
            let n = 0;
            try {
                const px = Math.round((x0 + 8) * dpr), py = Math.round((rect.top + rect.h * 0.2) * dpr);
                const w = Math.max(1, Math.round((wpx - 16) * dpr));
                const h = Math.max(1, Math.round(rect.h * 0.5 * dpr));
                const d = c2.getImageData(px, py, w, h).data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    if (lum > 120) n++;
                }
            } catch (e) {}
            const keys = Object.keys(st.audioBuffers || {});
            return {
                lanes: (st.audioLanes || []).length,
                clips: (st.audioClips || []).length,
                bufCount: keys.length,
                missing: (pr.audioClips && pr.audioClips[0]) ? !!pr.audioClips[0].missing : null,
                brightPx: n
            };
        });
        record('I3 刷新后自动恢复仍显示波形',
            (r3.clips >= 1 && r3.bufCount >= 1 && r3.missing === false && r3.brightPx > 60) ? 'PASS' : 'FAIL',
            JSON.stringify(r3));
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.stack || e));
    }

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
