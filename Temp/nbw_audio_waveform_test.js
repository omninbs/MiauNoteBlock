/* Temp/nbw_audio_waveform_test.js — 音频块波形绘制 / 背景淡化回归
   运行: node Temp/nbw_audio_waveform_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8146;
const results = [];
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
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

let srv, browser, ctx, page;
(async () => {
    srv = await startServer();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    try {
        // 准备: 0.5 秒 buffer, 前 0.25s 正弦(响) + 后 0.25s 静音; clip 时长 10 tick @ tempo 20 = 0.5s
        const prep = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            const AC = window.AudioContext || window.webkitAudioContext;
            const ac = new AC();
            const sr = 44100, len = Math.floor(sr * 0.5);
            const buf = ac.createBuffer(1, len, sr);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                d[i] = t < 0.25 ? Math.sin(2 * Math.PI * 220 * t) * 0.8 : 0;
            }
            st.tempo = 20;
            st.song = st.song || {};
            st.song.layers = [{ name: 'Layer 1', volume: 100, stereo: 100, lock: 0 }];
            st.notes = [];
            st.tracks = []; st.maxTick = 40;
            st.lyrics = []; st.lyricLanes = [];
            st.segmentsEditMode = false;
            st.segments = []; st.segmentLanes = []; st._segmentsEdited = false;
            st.audioLanes = [{ id: 'al1', name: '参考音频', after: -1, volume: 100, muted: false }];
            st.audioClips = [{ id: 'c1', lane: 0, tick: 0, dur: 10, offsetSec: 0, bufferId: 'b1', gain: 1, name: 'ref.wav' }];
            st.audioBuffers = { b1: { name: 'ref.wav', buffer: buf, duration: 0.5 } };
            roll.audioLanes = [{ id: 'al1', name: '参考音频', after: -1, volume: 100, muted: false }];
            roll.audioClips = st.audioClips;
            roll.audioBuffers = st.audioBuffers;
            roll._audioPeaks = {};
            roll.trackCount = 1;
            N.segmentEnsure();
            N.segmentSync();
            roll._fullRedrawNeeded = true;
            roll.render();
            return { rowRect: roll._audioRowRect(0) };
        });

        /* W1: 峰值数据正确 — 前段有振幅, 后段静音 */
        const w1 = await page.evaluate(() => {
            const roll = WebNBS.state.pianoRoll;
            const clip = WebNBS.state.audioClips[0];
            const peaks = roll._computeAudioPeaks(clip, 200);
            if (!peaks) return { ok: false };
            const half = Math.floor(peaks.length / 2);
            let loudMax = 0, quietMax = 0;
            for (let i = 0; i < half; i++) loudMax = Math.max(loudMax, peaks[i].max, -peaks[i].min);
            for (let i = half; i < peaks.length; i++) quietMax = Math.max(quietMax, peaks[i].max, -peaks[i].min);
            return { ok: true, loudMax, quietMax, n: peaks.length };
        });
        record('W1 峰值聚合: 有声段有振幅/静音段趋零',
            (w1.ok && w1.loudMax > 0.5 && w1.quietMax < 0.05) ? 'PASS' : 'FAIL', JSON.stringify(w1));

        /* W2: 柱数随宽度自适应 (宽块不再固定 60 柱) */
        const w2 = await page.evaluate(() => {
            const roll = WebNBS.state.pianoRoll;
            const clip = WebNBS.state.audioClips[0];
            const a = roll._computeAudioPeaks(clip, 40);
            const b = roll._computeAudioPeaks(clip, 300);
            return { a: a ? a.length : 0, b: b ? b.length : 0 };
        });
        record('W2 聚合柱数随请求变化', (w2.a === 40 && w2.b === 300) ? 'PASS' : 'FAIL', JSON.stringify(w2));

        /* W3: tempo 变化会使波形缓存失效 (旧实现只看 dur, 改速度不重算) */
        const w3 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            const clip = st.audioClips[0];
            const p1 = roll._getAudioPeaks(clip, 100);
            const sig1 = roll._audioPeaks[clip.id].sig;
            st.tempo = 40;   // 速度减半 → 同样 10 tick 变成 0.25 秒
            const p2 = roll._getAudioPeaks(clip, 100);
            const sig2 = roll._audioPeaks[clip.id].sig;
            st.tempo = 20;
            return { changed: sig1 !== sig2, p1: !!p1, p2: !!p2 };
        });
        record('W3 tempo 改变后波形缓存失效重算', (w3.changed && w3.p2) ? 'PASS' : 'FAIL', JSON.stringify(w3));

        /* W4: NBS 模式渲染 — 有声段可见波形, 静音段几乎无波形; 背景不再是高亮青块 */
        const w4 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            st.tempo = 20;
            roll._audioPeaks = {};
            roll._fullRedrawNeeded = true;
            roll.render();
            const cv = roll.canvas, rect = roll._audioRowRect(0);
            const c2 = cv.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            // canvas 像素坐标 = CSS 坐标 * dpr
            const toPx = (x, y) => [Math.round(x * dpr), Math.round(y * dpr)];
            const cellW = roll._cfg.cellW * roll._zoomX();
            const x0 = roll._tickToScreen(0);
            const wpx = cellW * 10;
            const y0 = rect.top, hh = rect.h;
            function brightCount(xa, xb) {
                const [px, py] = toPx(xa, y0 + 2);
                const [px2, py2] = toPx(xb, y0 + hh - 2);
                const w = Math.max(1, px2 - px), h = Math.max(1, py2 - py);
                const data = c2.getImageData(px, py, w, h).data;
                let n = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    if (lum > 110) n++;
                }
                return n;
            }
            const sampling = roll.segmentsEditMode;
            return {
                loudPixels: brightCount(x0 + 6, x0 + wpx * 0.45),
                quietPixels: brightCount(x0 + wpx * 0.58, x0 + wpx - 4),
                wpx, rowRect: rect
            };
        });
        record('W4 NBS 模式: 有声段绘制波形, 静音段无波形',
            (w4.loudPixels > 40 && w4.quietPixels < w4.loudPixels * 0.35) ? 'PASS' : 'FAIL', JSON.stringify(w4));

        /* W5: 背景淡化 — 块内无波形区域不再明显亮于行底色 */
        const w5 = await page.evaluate(() => {
            const roll = WebNBS.state.pianoRoll;
            const cv = roll.canvas, rect = roll._audioRowRect(0);
            const c2 = cv.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const x0 = roll._tickToScreen(0);
            const cellW = roll._cfg.cellW * roll._zoomX();
            const wpx = cellW * 10;
            // 静音段中部一块 (无波形): 取平均亮度
            function avgLum(xa, ya, xb, yb) {
                const px = Math.round(xa * dpr), py = Math.round(ya * dpr);
                const w = Math.max(1, Math.round((xb - xa) * dpr)), h = Math.max(1, Math.round((yb - ya) * dpr));
                const d = c2.getImageData(px, py, w, h).data;
                let s = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) { s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
                return n ? s / n : 0;
            }
            // 采块上部窄带 (波形带从 0.16 起, 此处只有块底色): 取平均亮度
            const clipLum = avgLum(x0 + cellW * 6, rect.top + 1, x0 + cellW * 9, rect.top + rect.h * 0.12);
            // 同行但块外 (右侧 20px 起) 作为行底色基准
            const rowLum = avgLum(x0 + wpx + 24, rect.top + 1, x0 + wpx + 60, rect.top + rect.h * 0.12);
            return { clipLum, rowLum, diff: clipLum - rowLum };
        });
        record('W5 块背景淡化: 块内底色与行底色差异 < 22', (w5.diff < 22) ? 'PASS' : 'FAIL', JSON.stringify(w5));

        /* W6: 片段模式音频块也绘制真实波形 (旧实现是假的等距竖线) */
        const w6 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            st.segmentLanes = [{ id: 1, name: 'L0', muted: false, solo: false, volume: 100, height: 64, layerKeys: [0] }];
            st.segments = [{ id: 1, lane: 0, start: 0, end: 60, name: 'seg', notes: [] }];
            N.segmentEnsureLanes();
            const hasSpecial = (st.segmentLanes || []).some(l => l.special && l.special.kind === 'audio');
            st.segmentsEditMode = true;
            if (roll.setSegmentsEditMode) roll.setSegmentsEditMode(true);
            roll.segmentsEditMode = true;
            roll._audioPeaks = {};
            roll._fullRedrawNeeded = true;
            roll.render();
            // 找到 special 音频轨所在行号
            let laneIdx = -1;
            for (let i = 0; i < st.segmentLanes.length; i++) {
                const sp = st.segmentLanes[i] && st.segmentLanes[i].special;
                if (sp && sp.kind === 'audio') { laneIdx = i; break; }
            }
            if (laneIdx < 0) return { ok: false, hasSpecial };
            const lane = st.segmentLanes[laneIdx];
            const top = roll.getSegmentLaneTop(laneIdx) + 5;
            const hh = lane.height - 10;
            const cv = roll.canvas, c2 = cv.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const x0 = roll._tickToScreen(0);
            const cellW = roll._cfg.cellW * roll._zoomX();
            const wpx = cellW * 10;
            function brightCount(xa, xb) {
                const px = Math.round(xa * dpr), py = Math.round((top + 2) * dpr);
                const w = Math.max(1, Math.round((xb - xa) * dpr)), h = Math.max(1, Math.round((hh - 4) * dpr));
                const d = c2.getImageData(px, py, w, h).data;
                let n = 0;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    if (lum > 110) n++;
                }
                return n;
            }
            return {
                ok: true, hasSpecial, laneIdx,
                loudPixels: brightCount(x0 + 6, x0 + wpx * 0.45),
                quietPixels: brightCount(x0 + wpx * 0.58, x0 + wpx - 4)
            };
        });
        record('W6 片段模式音频块: 真实波形(有声有、静音无)',
            (w6.ok && w6.hasSpecial && w6.loudPixels > 40 && w6.quietPixels < w6.loudPixels * 0.35) ? 'PASS' : 'FAIL',
            JSON.stringify(w6));

        /* W7: 片段模式/恢复 NBS 模式后渲染不报错 */
        const w7 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            st.segmentsEditMode = false;
            if (roll.setSegmentsEditMode) roll.setSegmentsEditMode(false);
            roll.segmentsEditMode = false;
            roll._fullRedrawNeeded = true;
            try { roll.render(); } catch (e) { return { err: String(e && e.message || e) }; }
            return { err: null };
        });
        record('W7 模式切换后渲染无异常', w7.err ? 'FAIL' : 'PASS', JSON.stringify(w7));

        /* W8: 无 buffer (缺失音频) 不崩且只画虚线框 */
        const w8 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            st.audioBuffers = {};
            roll.audioBuffers = {};
            roll._audioPeaks = {};
            roll._fullRedrawNeeded = true;
            try { roll.render(); } catch (e) { return { err: String(e && e.message || e) }; }
            const peaks = roll._computeAudioPeaks(st.audioClips[0], 100);
            return { err: null, peaks: peaks === null };
        });
        record('W8 缺失 buffer 时安全降级', (!w8.err && w8.peaks) ? 'PASS' : 'FAIL', JSON.stringify(w8));

        /* W9: buffer 丢失但 clip.wave (随工程保存的波形概览) 存在时, 仍能画出真实波形 */
        const w9 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, roll = st.pianoRoll;
            // 重新造一段 buffer, 生成波形概览
            const AC = window.AudioContext || window.webkitAudioContext;
            const ac = new AC();
            const sr = 44100, len = Math.floor(sr * 0.5);
            const buf = ac.createBuffer(1, len, sr);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                d[i] = t < 0.25 ? Math.sin(2 * Math.PI * 220 * t) * 0.8 : 0;
            }
            const wave = roll.buildClipWaveData(buf, 800);
            // 写回工程数据并清空缓冲 (模拟刷新后音频未解码 / 旧工程)
            st.audioClips[0].wave = wave;
            st.audioBuffers = {};
            roll.audioBuffers = {};
            roll.audioClips = st.audioClips.map(c => ({
                id: c.id, lane: c.lane || 0, tick: c.tick, dur: c.dur,
                offsetSec: c.offsetSec || 0, bufferId: c.bufferId, gain: c.gain || 1,
                name: c.name || '', missing: true, wave: c.wave || null
            }));
            roll._audioPeaks = {};
            roll._fullRedrawNeeded = true;
            roll.render();
            const cv = roll.canvas, c2 = cv.getContext('2d');
            const dpr = cv.width / (cv.clientWidth || cv.width);
            const rect = roll._audioRowRect(0);
            const x0 = roll._tickToScreen(0);
            const cellW = roll._cfg.cellW * roll._zoomX();
            const wpx = cellW * 10;
            function bright(xa, xb) {
                const px = Math.round(xa * dpr), py = Math.round((rect.top + 1) * dpr);
                const w = Math.max(1, Math.round((xb - xa) * dpr)), h = Math.max(1, Math.round((rect.h - 2) * dpr));
                const dd = c2.getImageData(px, py, w, h).data;
                let n = 0;
                for (let i = 0; i < dd.length; i += 4) {
                    const lum = 0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2];
                    if (lum > 110) n++;
                }
                return n;
            }
            const fallbackPeaks = roll._peaksFromWaveData(roll.audioClips[0], 200);
            return {
                waveOk: !!(wave && wave.data && wave.data.length === 1600 && wave.dur > 0),
                fallbackLen: fallbackPeaks ? fallbackPeaks.length : null,
                loudPixels: bright(x0 + 6, x0 + wpx * 0.45),
                quietPixels: bright(x0 + wpx * 0.58, x0 + wpx - 4)
            };
        });
        record('W9 音频缺失但 clip.wave 存在时仍绘制波形',
            (w9.waveOk && w9.fallbackLen === 200 && w9.loudPixels > 40 && w9.quietPixels < w9.loudPixels * 0.35) ? 'PASS' : 'FAIL',
            JSON.stringify(w9));
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.stack || e));
    }

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
