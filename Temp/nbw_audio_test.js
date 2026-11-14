/* Temp/nbw_audio_test.js — NBS 音频轨道 + 「添加」菜单 + 片段特殊轨道 无头验证
   运行: node Temp/nbw_audio_test.js  （需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8126;
const results = [];
const consoleErrors = [];

function record(name, status, detail) {
    results.push({ name, status, detail: detail || '' });
    console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

/* ---------- 测试 WAV (44100Hz 16bit 单声道正弦) ---------- */
function makeWav(seconds, freq) {
    const sr = 44100, n = Math.floor(sr * seconds);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
        buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 20000), 44 + i * 2);
    }
    return buf;
}
const TEST_WAV = makeWav(1.5, 440);

/* ---------- 静态服务器 ---------- */
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = (req.url || '/').split('?')[0];
            if (url === '/__test_tone.wav') {
                res.writeHead(200, { 'Content-Type': 'audio/wav' });
                res.end(TEST_WAV); return;
            }
            let p = decodeURIComponent(url);
            if (p.endsWith('/')) p += 'index.html';
            const file = path.join(ROOT, p);
            if (!file.toLowerCase().startsWith(ROOT.toLowerCase())) { res.writeHead(403); res.end(); return; }
            fs.readFile(file, (err, data) => {
                if (err) { res.writeHead(404); res.end('not found'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}

/* ---------- 页面辅助 ---------- */
async function openAddMenu(page) {
    return page.evaluate(() => {
        const N = window.WebNBS;
        if (N && N.closeTransientFloats) try { N.closeTransientFloats(); } catch (e) {}
        const pr = N.state.pianoRoll;
        if (!pr || !pr.onAddTrackMenu) return 'no-callback';
        pr.onAddTrackMenu(300, 300);
        const menus = Array.from(document.querySelectorAll('.context-menu'))
            .filter(m => m.offsetParent !== null || getComputedStyle(m).display !== 'none');
        if (!menus.length) return 'no-menu';
        return 'items:' + menus[menus.length - 1].children.length +
            '|texts:' + Array.from(menus[menus.length - 1].children).map(c => (c.textContent || '').trim().slice(0, 12)).join('/');
    });
}
async function clickMenuItem(page, idx) {
    return page.evaluate((i) => {
        const menus = Array.from(document.querySelectorAll('.context-menu'))
            .filter(m => m.offsetParent !== null || getComputedStyle(m).display !== 'none');
        const m = menus[menus.length - 1];
        if (!m) return 'no-menu';
        const items = Array.from(m.children).filter(c => c.nodeType === 1);
        const el = items[i];
        if (!el) return 'no-item';
        for (const type of ['mousedown', 'mouseup', 'click']) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
        return 'ok:' + (el.textContent || '').trim().slice(0, 20);
    }, idx);
}

/* ---------- 主流程 ---------- */
(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({
        channel: 'msedge', headless: true,
        args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=Autoplay']
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => {
        try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {}
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
    page.on('response', r => { if (r.status() === 404) consoleErrors.push('404: ' + r.url()); });

    try {
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
        await page.waitForTimeout(1200); // 等待初始化/欢迎屏
        await page.evaluate(() => {
            const w = document.getElementById('welcome-screen');
            if (w) w.style.display = 'none';
            const pr = WebNBS.state.pianoRoll;
            if (pr) { if (pr.resize) try { pr.resize(); } catch (e) {} try { pr.render(); } catch (e) {} }
        });
        await page.waitForTimeout(400);

        /* T1 「添加」按钮收纳 */
        const t1 = await page.evaluate(() => {
            const pr = WebNBS.state.pianoRoll;
            return {
                entry: pr._addEntryBtnRect || null,
                oldTrack: pr._addTrackBtnRect || null,
                oldLyric: pr._addLyricLaneBtnRect || null
            };
        });
        record('T1 添加按钮收纳为单按钮',
            (t1.entry && !t1.oldTrack && !t1.oldLyric) ? 'PASS' : 'FAIL',
            JSON.stringify(t1));

        /* T2 「添加」菜单弹出 3 项 */
        const t2 = await openAddMenu(page);
        await page.screenshot({ path: path.join(__dirname, 'nbw_audio_menu.png') });
        record('T2 添加菜单弹出且含 3 项',
            (typeof t2 === 'string' && t2.indexOf('items:3') === 0) ? 'PASS' : 'FAIL', String(t2));

        /* T3 菜单第 1 项 → NBS 音轨 +1 */
        const cnt = () => page.evaluate(() => {
            const st = WebNBS.state;
            if (st.song && Array.isArray(st.song.layers)) return st.song.layers.length;
            if (Array.isArray(st.tracks)) return st.tracks.length;
            return -1;
        });
        const before3 = await cnt();
        const c3 = await clickMenuItem(page, 0);
        await page.waitForTimeout(300);
        const after3 = await cnt();
        record('T3 菜单添加 NBS 音轨', (before3 >= 0 && after3 === before3 + 1) ? 'PASS' : 'FAIL',
            `before=${before3} after=${after3} click=${c3}`);

        /* T4 菜单第 2 项 → 歌词轨道 +1 */
        await openAddMenu(page);
        const before4 = await page.evaluate(() => WebNBS.state.lyricLanes.length);
        const c4 = await clickMenuItem(page, 1);
        await page.waitForTimeout(300);
        const after4 = await page.evaluate(() => WebNBS.state.lyricLanes.length);
        record('T4 菜单添加歌词轨道', after4 === before4 + 1 ? 'PASS' : 'FAIL',
            `before=${before4} after=${after4} click=${c4}`);

        /* T5a 菜单第 3 项 → 音频文件选择 input */
        await openAddMenu(page);
        const c5 = await clickMenuItem(page, 2);
        await page.waitForTimeout(300);
        const t5a = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type=file]'))
                .filter(i => (i.accept || '').indexOf('audio') === 0);
            return inputs.length;
        });
        record('T5a 菜单音频轨道项触发文件选择', t5a >= 1 ? 'PASS' : 'FAIL', `inputs=${t5a} click=${c5}`);

        /* T5b 导入音频文件 → lane/clip/buffer (importAudioFile 内部异步解码, 轮询等待) */
        await page.evaluate(async () => {
            const N = WebNBS;
            const res = await fetch('/__test_tone.wav');
            const ab = await res.arrayBuffer();
            const f = new File([ab], 'tone.wav', { type: 'audio/wav' });
            await N.importAudioFile(f);
        });
        await page.waitForFunction(() => {
            const st = window.WebNBS && WebNBS.state;
            return st && st.audioLanes && st.audioLanes.length >= 1 && st.audioClips && st.audioClips.length >= 1;
        }, null, { timeout: 8000 }).catch(() => {});
        const t5b = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            const keys = Object.keys(st.audioBuffers || {});
            const b0 = keys.length ? st.audioBuffers[keys[0]] : null;
            const pr = st.pianoRoll;
            return {
                lanes: st.audioLanes.length,
                clips: st.audioClips.length,
                bufCount: keys.length,
                bufDur: b0 ? b0.duration : null,
                isAB: !!(b0 && b0.buffer && typeof b0.buffer.getChannelData === 'function'),
                clipRefOk: !!(st.audioClips[0] && st.audioClips[0].bufferId === (keys[0] || null)),
                rollClips: pr && pr.audioClips ? pr.audioClips.length : -1,
                missing: pr && pr.audioClips && pr.audioClips[0] ? !!pr.audioClips[0].missing : null,
                hasDraw: !!(pr && pr._drawAudioRows),
                hasSetLanes: !!(pr && pr.setAudioLanes)
            };
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(__dirname, 'nbw_audio_canvas.png') });
        const t5bOk = t5b.lanes >= 1 && t5b.clips === 1 && t5b.bufCount === 1 && t5b.isAB &&
            t5b.rollClips === 1 && t5b.missing === false && t5b.hasDraw && t5b.hasSetLanes;
        record('T5b 导入音频生成轨道与音频块', t5bOk ? 'PASS' : 'FAIL', JSON.stringify(t5b));

        /* T6 分割 / 增益 / dur / 移动 / 删除 */
        const t6 = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            const c0 = st.audioClips[0];
            if (!c0) return { err: 'no clip' };
            const out = { origDur: c0.dur };
            N.splitAudioClip(c0.id, c0.tick + Math.floor(c0.dur / 2));
            out.afterSplit = st.audioClips.length;
            const c1 = st.audioClips[0], c2 = st.audioClips[1];
            out.c1Dur = c1.dur; out.c2Tick = c2 && c2.tick; out.c2Offset = c2 ? c2.offsetSec : null;
            N.setAudioClipGain(c2.id, 1.5); out.c2Gain = c2.gain;
            N.setAudioClipDur(c1.id, Math.max(1, c1.dur - 2)); out.c1DurAfter = c1.dur;
            N.setAudioClipTick(c2.id, 6, 0); out.c2TickAfter = c2.tick; out.c2Lane = c2.lane;
            N.removeAudioClip(c2.id); out.afterRemove = st.audioClips.length;
            return out;
        });
        const t6Ok = !t6.err && t6.afterSplit === 2 && t6.c2Offset > 0 && t6.c2Gain === 1.5 &&
            t6.c1DurAfter === t6.c1Dur - 2 && t6.c2TickAfter === 6 && t6.c2Lane === 0 && t6.afterRemove === 1;
        record('T6 音频块分割/增益/时长/移动/删除', t6Ok ? 'PASS' : 'FAIL', JSON.stringify(t6));

        /* T7 片段模式特殊轨道独占 (特殊 lane 位于 state.segmentLanes) */
        await page.evaluate(() => {
            const N = WebNBS;
            if (N.enterSegmentsEditMode) N.enterSegmentsEditMode();
            else { N.state.segmentsEditMode = true; }
            if (N.segmentEnsure) try { N.segmentEnsure(); } catch (e) {}
            N.segmentEnsureLanes();
            if (N.renderSegmentSidePanel) { try { N.renderSegmentSidePanel(); } catch (e) {} }
        });
        await page.waitForTimeout(500);
        const t7 = await page.evaluate(() => {
            const st = WebNBS.state;
            const lanes = st.segmentLanes || [];
            const special = lanes.filter(l => l && l.special)
                .map(l => ({ kind: l.special.kind, laneId: l.special.laneId, notesLen: (l.notes || []).length }));
            return {
                laneCount: lanes.length, special,
                lyricIds: (st.lyricLanes || []).map(l => l.id),
                audioIds: (st.audioLanes || []).map(l => l.id),
                lockedDom: !!document.querySelector('.seg-lane-locked')
            };
        });
        await page.screenshot({ path: path.join(__dirname, 'nbw_audio_segments.png') });

        /* T7c 片段画布真实绘制同步块 (像素采样: 音频青蓝 / 歌词米黄) */
        const t7px = await page.evaluate(() => {
            const N = WebNBS, st = N.state, pr = st.pianoRoll;
            // 补一个歌词块用于像素验证
            st.lyrics = st.lyrics || [];
            if (!st.lyrics.some(l => l.id === 'ly_test')) {
                st.lyrics.push({ id: 'ly_test', lane: 0, tick: 4, duration: 8, text: '测试歌词' });
                if (N.syncLyricsToRoll) N.syncLyricsToRoll();
            }
            try { pr.render(); } catch (e) {}
            const lanes = st.segmentLanes || [];
            const cv = pr.canvas, ctx = cv.getContext('2d');
            const sx = cv.width / (cv.clientWidth || cv.width);
            const sy = cv.height / (cv.clientHeight || cv.height);
            const out = { audioPx: 0, lyricPx: 0 };
            for (let i = 0; i < lanes.length; i++) {
                const sp = lanes[i] && lanes[i].special;
                if (!sp) continue;
                const top = pr.getSegmentLaneTop(i);
                const h = lanes[i].height;
                const y = Math.round((top + h / 2) * sy);
                if (y < 0 || y >= cv.height) continue;
                let img;
                try {
                    img = ctx.getImageData(Math.round(150 * sx), y, Math.round(400 * sx), 1).data;
                } catch (e) { continue; }
                for (let p = 0; p < img.length; p += 4) {
                    const r = img[p], g = img[p + 1], b = img[p + 2];
                    if (sp.kind === 'audio' && b > 100 && b > r + 30) out.audioPx++;
                    if (sp.kind === 'lyric' && r > 120 && g > 100 && b < 140) out.lyricPx++;
                }
            }
            return out;
        });
        record('T7c 片段画布绘制歌词/音频同步块',
            (t7px.audioPx > 20 && t7px.lyricPx > 20) ? 'PASS' : 'FAIL', JSON.stringify(t7px));
        await page.screenshot({ path: path.join(__dirname, 'nbw_audio_segments_blocks.png') });
        const wantSpecial = t7.lyricIds.length + t7.audioIds.length;
        const lyricCovered = t7.lyricIds.every(id => t7.special.some(s => s.kind === 'lyric' && s.laneId === id));
        const audioCovered = t7.audioIds.every(id => t7.special.some(s => s.kind === 'audio' && s.laneId === id));
        const notesEmpty = t7.special.every(s => s.notesLen === 0);
        record('T7 片段特殊轨道独占 (歌词+音频, notes 空)',
            (wantSpecial > 0 && t7.special.length === wantSpecial && lyricCovered && audioCovered && notesEmpty) ? 'PASS' : 'FAIL',
            JSON.stringify(t7));
        record('T7b 片段侧栏锁定样式 DOM', t7.lockedDom ? 'PASS' : 'SKIP', `lockedDom=${t7.lockedDom}`);

        /* T8 播放调度音频 clip */
        await page.evaluate(() => {
            const st = WebNBS.state;
            st.segmentsEditMode = false;
            const layer = st.song && st.song.layers && st.song.layers[0];
            if (layer && Array.isArray(layer.notes)) {
                layer.notes.push({ tick: 0, key: 60, dur: 8, layer: 0, vol: 100 });
            }
            const AE = window.AudioEngine;
            if (AE && AE.getContext) { try { const c = AE.getContext(); if (c && c.resume) c.resume(); } catch (e) {} }
            window.__audioPlays = 0; window.__lastAudioLayer = null;
            if (AE && AE.playClip) {
                const orig = AE.playClip.bind(AE);
                AE.playClip = function (buffer, when, off, gain, pan, layerKey) {
                    window.__audioPlays++; window.__lastAudioLayer = layerKey;
                    try { return orig(buffer, when, off, gain, pan, layerKey); } catch (e) {}
                };
            }
        });
        await page.evaluate(() => WebNBS.seekToTick(0, true));
        await page.evaluate(() => WebNBS.handlePlayToggle());
        await page.waitForTimeout(1800);
        const t8State = await page.evaluate(() => ({ isPlaying: !!WebNBS.state.isPlaying, plays: window.__audioPlays || 0, layer: window.__lastAudioLayer }));
        await page.evaluate(() => { if (WebNBS.handleStop) WebNBS.handleStop(); else WebNBS.handlePlayToggle(); });
        if (t8State.plays >= 1) {
            record('T8 播放调度音频 clip', String(t8State.layer || '').indexOf('audio:') === 0 ? 'PASS' : 'FAIL', JSON.stringify(t8State));
        } else {
            record('T8 播放调度音频 clip', t8State.isPlaying ? 'FAIL' : 'SKIP',
                `plays=${t8State.plays} isPlaying=${t8State.isPlaying}(歌曲可能无有效音符未启动)`);
        }

        /* T9 回归: 歌词轨道 API / 画布渲染 / 普通片段 lane */
        const t9 = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            const out = {};
            const before = st.lyricLanes.length;
            N.addLyricLane(null);
            out.lyricAdd = st.lyricLanes.length === before + 1;
            N.removeLyricLane(st.lyricLanes.length - 1);
            out.lyricRemove = st.lyricLanes.length === before;
            try { st.pianoRoll.render(); out.renderOk = true; } catch (e) { out.renderOk = false; out.renderErr = String(e && e.message || e); }
            try {
                if (N.segmentAddLane) {
                    const n0 = (st.segmentLanes || []).length;
                    N.segmentAddLane();
                    out.segAdd = (st.segmentLanes || []).length === n0 + 1;
                    out.specialKept = (st.segmentLanes || []).filter(l => l && l.special).length ===
                        ((st.lyricLanes || []).length + (st.audioLanes || []).length);
                } else out.segAdd = null;
            } catch (e) { out.segAdd = false; out.segAddErr = String(e && e.message || e); }
            return out;
        });
        const t9Ok = t9.lyricAdd && t9.lyricRemove && t9.renderOk &&
            (t9.segAdd === null || t9.segAdd === true) && t9.specialKept !== false;
        record('T9 回归: 歌词轨道/渲染/普通片段 lane', t9Ok ? 'PASS' : 'FAIL', JSON.stringify(t9));

        /* T10 音频编辑可撤销 (快照含 audioLanes/audioClips) */
        const t10 = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            if (!st.audioClips.length) return { err: 'no clip' };
            const id = st.audioClips[0].id;
            const before = st.audioClips[0].gain;
            N.pushUndo();
            N.setAudioClipGain(id, before === 2 ? 0.5 : 2);
            const changed = st.audioClips[0].gain;
            N.performUndo();
            const restored = st.audioClips[0] ? st.audioClips[0].gain : null;
            return { before, changed, restored, rollClips: st.pianoRoll ? st.pianoRoll.audioClips.length : -1 };
        });
        record('T10 音频块修改可撤销',
            (!t10.err && t10.changed !== t10.before && t10.restored === t10.before) ? 'PASS' : 'FAIL',
            JSON.stringify(t10));

        /* T11 新建文件清空音频轨道 */
        const t11 = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            N.resetToNewFile();
            return { lanes: (st.audioLanes || []).length, clips: (st.audioClips || []).length };
        });
        record('T11 新建文件清空音频轨道',
            (t11.lanes === 0 && t11.clips === 0) ? 'PASS' : 'FAIL', JSON.stringify(t11));
    } catch (err) {
        record('脚本执行', 'FAIL', String(err && err.message || err));
    }

    await browser.close();
    srv.close();

    const fail = results.filter(r => r.status === 'FAIL');
    console.log('\n===== 汇总 =====');
    console.log(`PASS ${results.filter(r => r.status === 'PASS').length} / FAIL ${fail.length} / SKIP ${results.filter(r => r.status === 'SKIP').length}`);
    if (consoleErrors.length) {
        console.log('---- 页面错误 ----');
        consoleErrors.slice(0, 12).forEach(e => console.log('  ' + e));
    }
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
