/* Temp/nbw_batch2_test.js — 第二批需求集成验证
   运行: node Temp/nbw_batch2_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8132;
const results = [];
const errors = [];
function record(name, status, detail) {
    results.push({ name, status });
    console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
function makeWav(seconds, freq) {
    const sr = 44100, n = Math.floor(sr * seconds);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 20000), 44 + i * 2);
    return buf;
}
const WAV = makeWav(1.0, 440);
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = (req.url || '/').split('?')[0];
            if (url === '/__tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(WAV); return; }
            let p = decodeURIComponent(url);
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

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    try {
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
        await page.waitForTimeout(1400);
        await page.evaluate(() => {
            const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none';
            const N = WebNBS, st = N.state;
            // 基础工程: 4 层, 每层 20 个音符
            st.song = st.song || {}; st.song.layers = []; st.notes = [];
            for (let L = 0; L < 4; L++) {
                st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                for (let t = 0; t < 40; t += 2) {
                    st.notes.push({ id: 'x' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
                }
            }
            st.tracks = []; st.maxTick = 100; st.tempo = 20;
            st.lyrics = []; st.lyricLanes = [];
            st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
            st.segments = []; st.segmentLanes = [];
            N.segmentEnsure && N.segmentEnsure();
            st.pianoRoll.setNotes(st.notes);
            st.pianoRoll.render();
        });
        await page.waitForTimeout(300);

        /* T1 真实鼠标点击「+ 添加」→ 菜单保持打开且可点 */
        const btn = await page.evaluate(() => {
            const pr = WebNBS.state.pianoRoll;
            const r = pr.canvas.getBoundingClientRect();
            const b = pr._addEntryBtnRect;
            if (!b) return null;
            const sx = r.width / (pr.displayWidth || r.width);
            const sy = r.height / (pr.displayHeight || r.height);
            return { x: r.left + (b.x + b.w / 2) * sx, y: r.top + (b.y + b.h / 2) * sy };
        });
        let t1 = { clicked: false };
        if (btn) {
            await page.mouse.move(btn.x, btn.y);
            await page.mouse.down();
            await page.waitForTimeout(120);
            await page.mouse.up();
            await page.waitForTimeout(450);
            const before = await page.evaluate(() => WebNBS.state.lyricLanes.length);
            const menuState = await page.evaluate(() => {
                const m = Array.from(document.querySelectorAll('.context-menu'))
                    .filter(x => getComputedStyle(x).display !== 'none');
                return { count: m.length, texts: m.length ? m[m.length - 1].textContent : '' };
            });
            // 点第 2 项 (歌词轨道)
            if (menuState.count) {
                const items = await page.$$('.context-menu:last-of-type .context-menu-item').catch(() => []);
                const menus = await page.evaluate(() => {
                    const ms = Array.from(document.querySelectorAll('.context-menu'))
                        .filter(x => getComputedStyle(x).display !== 'none');
                    return ms.length ? ms[ms.length - 1].querySelectorAll('.context-menu-item').length : 0;
                });
                const el = await page.evaluate(() => {
                    const ms = Array.from(document.querySelectorAll('.context-menu'))
                        .filter(x => getComputedStyle(x).display !== 'none');
                    const m = ms[ms.length - 1];
                    if (!m) return null;
                    const it = m.querySelectorAll('.context-menu-item')[1];
                    if (!it) return null;
                    const r = it.getBoundingClientRect();
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                });
                if (el) { await page.mouse.click(el.x, el.y); await page.waitForTimeout(300); }
                const after = await page.evaluate(() => WebNBS.state.lyricLanes.length);
                t1 = { clicked: true, menuCount: menuState.count, items: menus, before, after };
            } else {
                t1 = { clicked: true, menuGone: true, texts: menuState.texts };
            }
        }
        record('T1 添加菜单不消失且可点选', (t1.clicked && t1.menuCount > 0 && t1.after === t1.before + 1) ? 'PASS' : 'FAIL', JSON.stringify(t1));

        /* T2 片段模式「添加音轨」弹类型菜单 → 选歌词 */
        const t2 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.segmentsEditMode = false;
            N.enterSegmentsEditMode && N.enterSegmentsEditMode();
            await new Promise(r => setTimeout(r, 250));
            const btnEl = document.querySelector('.seg-lane-add');
            if (!btnEl) return { err: 'no button' };
            const before = st.lyricLanes.length;
            btnEl.click();
            await new Promise(r => setTimeout(r, 120));
            const ms = Array.from(document.querySelectorAll('.context-menu')).filter(x => getComputedStyle(x).display !== 'none');
            const menuItems = ms.length ? ms[ms.length - 1].querySelectorAll('.context-menu-item').length : 0;
            const target = ms.length ? ms[ms.length - 1].querySelectorAll('.context-menu-item')[1] : null;
            if (target) target.click();
            await new Promise(r => setTimeout(r, 350));
            const specialLyric = (st.segmentLanes || []).filter(l => l.special && l.special.kind === 'lyric').length;
            return { menuItems, before, after: st.lyricLanes.length, specialLyric };
        });
        record('T2 片段模式添加轨道类型菜单(歌词)',
            (!t2.err && t2.menuItems === 3 && t2.after === t2.before + 1 && t2.specialLyric >= 1) ? 'PASS' : 'FAIL', JSON.stringify(t2));

        /* T3 片段模式拖动歌词块改 tick */
        const t3 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, pr = st.pianoRoll;
            st.lyrics = [{ id: 'ly_t3', lane: 0, tick: 8, duration: 8, text: '拖动测试' }];
            N.syncLyricsToRoll && N.syncLyricsToRoll();
            N.segmentEnsureLanes && N.segmentEnsureLanes();
            pr.render();
            const idx = st.segmentLanes.findIndex(l => l.special && l.special.kind === 'lyric' && l.special.laneId === st.lyricLanes[0].id);
            if (idx < 0) return { err: 'no special lane' };
            const top = pr.getSegmentLaneTop(idx);
            const lane = st.segmentLanes[idx];
            const r = pr.canvas.getBoundingClientRect();
            const sx = r.width / (pr.displayWidth || r.width);
            const sy = r.height / (pr.displayHeight || r.height);
            const x = pr._tickToScreen(10);
            const y = top + lane.height / 2;
            return { x0: r.left + x * sx, y0: r.top + y * sy, sx, sy, tick: st.lyrics[0].tick };
        });
        if (!t3.err) {
            await page.mouse.move(t3.x0, t3.y0);
            await page.mouse.down();
            await page.waitForTimeout(60);
            await page.mouse.move(t3.x0 + 60, t3.y0, { steps: 6 });
            await page.mouse.up();
            await page.waitForTimeout(250);
        }
        const t3after = await page.evaluate(() => ({ tick: WebNBS.state.lyrics[0] && WebNBS.state.lyrics[0].tick }));
        record('T3 片段模式拖动歌词块', (!t3.err && t3after.tick > t3.tick) ? 'PASS' : 'FAIL',
            JSON.stringify({ before: t3.tick, after: t3after.tick, err: t3.err }));

        /* T4 双指自由缩放 (横向+纵向同时) */
        const cdp = await ctx.newCDPSession(page);
        const t4pre = await page.evaluate(() => {
            const N = WebNBS; N.state.segmentsEditMode && N.exitSegmentsEditMode();
            const pr = N.state.pianoRoll;
            pr.setZoom && pr.setZoom(1);
            pr.zoomY = 1; pr._segZoomX = 1;
            pr.render();
            return { zoom: pr.zoom, zoomY: pr.zoomY };
        });
        const cr = await page.evaluate(() => {
            const pr = WebNBS.state.pianoRoll;
            const r = pr.canvas.getBoundingClientRect();
            return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 };
        });
        async function touch(type, pts) {
            await cdp.send('Input.dispatchTouchEvent', {
                type,
                touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 }))
            });
        }
        await touch('touchStart', [{ x: cr.x - 40, y: cr.y - 40 }, { x: cr.x + 40, y: cr.y + 40 }]);
        await page.waitForTimeout(50);
        await touch('touchMove', [{ x: cr.x - 80, y: cr.y - 80 }, { x: cr.x + 80, y: cr.y + 80 }]);
        await page.waitForTimeout(80);
        await touch('touchMove', [{ x: cr.x - 120, y: cr.y - 120 }, { x: cr.x + 120, y: cr.y + 120 }]);
        await page.waitForTimeout(80);
        await touch('touchEnd', []);
        await page.waitForTimeout(200);
        const t4post = await page.evaluate(() => {
            const pr = WebNBS.state.pianoRoll;
            return { zoom: pr.zoom, zoomY: pr.zoomY };
        });
        record('T4 双指同时缩放横向+纵向',
            (t4post.zoom > t4pre.zoom + 0.02 && t4post.zoomY > t4pre.zoomY + 0.02) ? 'PASS' : 'FAIL',
            JSON.stringify({ pre: t4pre, post: t4post }));

        /* T5 音频: 导入 → 导出 payload → 重新导入 */
        const t5 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            const res = await fetch('/__tone.wav');
            const ab = await res.arrayBuffer();
            await N.importAudioFile(new File([ab], 'tone.wav', { type: 'audio/wav' }));
            await new Promise(r => setTimeout(r, 700));
            const payload = await N.buildAudioExportPayload();
            const savedIds = Object.keys(st.audioBuffers);
            const origLanes = st.audioLanes.length, origClips = st.audioClips.length;
            // 清空后通过 importAudioPackage 恢复 (伪造 zipFile, 按 JSZip 语义区分 string/arraybuffer)
            const files = {};
            for (const f of (payload ? payload.files : [])) {
                files[f.fileName] = await f.blob.arrayBuffer();
            }
            st.audioBuffers = {}; st.audioLanes = []; st.audioClips = [];
            const jsonText = payload ? JSON.stringify(payload.meta) : '';
            const zipFile = {
                file: (name) => {
                    if (name === 'audio.json') {
                        return { async: () => Promise.resolve(jsonText) };
                    }
                    if (!files[name]) return null;
                    return {
                        async: (type) => Promise.resolve(
                            type === 'string' ? new TextDecoder().decode(files[name]) : files[name]
                        )
                    };
                }
            };
            const cnt = payload ? await N.importAudioPackage(zipFile, { audio: 'audio.json' }) : -1;
            const keys = Object.keys(st.audioBuffers);
            return {
                payloadOk: !!(payload && payload.files.length === savedIds.length && payload.meta),
                fileCount: payload ? payload.files.length : 0,
                importCount: cnt,
                lanes: st.audioLanes.length, clips: st.audioClips.length, bufs: keys.length,
                isAB: !!(st.audioBuffers[keys[0]] && st.audioBuffers[keys[0]].buffer && typeof st.audioBuffers[keys[0]].buffer.getChannelData === 'function'),
                origLanes, origClips
            };
        });
        record('T5 音频导出载荷与重新导入',
            (t5.payloadOk && t5.importCount === 1 && t5.bufs === 1 && t5.isAB &&
                t5.lanes === t5.origLanes && t5.clips === t5.origClips) ? 'PASS' : 'FAIL', JSON.stringify(t5));

        /* T6 音频裁剪 (左/右) */
        const t6 = await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            const c = st.audioClips[0];
            if (!c) return { err: 'no clip' };
            const out = { tick: c.tick, dur: c.dur, off: c.offsetSec };
            const mid1 = c.tick + Math.floor(c.dur / 2);
            N.trimAudioClip(c.id, mid1, 'left');
            out.afterLeft = { tick: c.tick, dur: c.dur, off: c.offsetSec };
            N.trimAudioClip(c.id, c.tick + Math.floor(c.dur / 2), 'right');
            out.afterRight = { dur: c.dur };
            return out;
        });
        const t6ok = !t6.err && t6.afterLeft.tick > t6.tick && t6.afterLeft.dur < t6.dur &&
            t6.afterLeft.off > t6.off && t6.afterRight.dur < t6.afterLeft.dur;
        record('T6 音频块左右裁剪', t6ok ? 'PASS' : 'FAIL', JSON.stringify(t6));

        /* T7 设置: 显示→片段模式子标签 + 物理音调选项 */
        const t7 = await page.evaluate(() => {
            const tab = document.querySelector('[data-display-subtab="segment"]');
            const panel = document.getElementById('settings-subpanel-segment');
            const sel = document.getElementById('settings-segment-preview-mode');
            const opt = sel ? Array.from(sel.options).map(o => o.value) : [];
            const oldTab = document.querySelector('[data-settings-tab="segment"]');
            const oldPanel = document.getElementById('settings-tab-segment');
            return { tab: !!tab, panel: !!panel, options: opt, oldTab: !!oldTab, oldPanel: !!oldPanel,
                hasSpw: !!document.getElementById('settings-spw-ruler') };
        });
        record('T7 设置迁移到显示子标签 + 物理音调',
            (t7.tab && t7.panel && t7.options.indexOf('physical') >= 0 && !t7.oldTab && !t7.oldPanel && t7.hasSpw) ? 'PASS' : 'FAIL',
            JSON.stringify(t7));

        /* T8 未跟随播放不改变视图 */
        const t8 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.followProgress = false;
            if (st.pianoRoll) st.pianoRoll.smoothScrollEnabled = false;
            // 复位 T4 缩放影响, 再验证播放滚动策略
            if (st.pianoRoll && st.pianoRoll.setZoom) st.pianoRoll.setZoom(1);
            if (st.pianoRoll) st.pianoRoll.zoomY = 1;
            // 播放头放在视口可视范围内 (tick 20), 用户当前滚动位置 100
            N.seekToTick(20, true);
            st.pianoRoll.scrollX = 100;
            const before = st.pianoRoll.scrollX;
            if (st.isPlaying) N.handlePlayToggle();
            N.handlePlayToggle();
            await new Promise(r => setTimeout(r, 700));
            const during = st.pianoRoll.scrollX;
            const tick = st.currentTick;
            N.handlePlayToggle();
            await new Promise(r => setTimeout(r, 100));
            return { before, during, tick, playing: st.isPlaying };
        });
        record('T8 未跟随播放不翻页/不回弹',
            (Math.abs(t8.during - t8.before) <= 2 && t8.tick > 20) ? 'PASS' : 'FAIL', JSON.stringify(t8));

        /* T9 toggle 使用主题色变量 */
        const t9 = await page.evaluate(() => {
            const css = Array.from(document.styleSheets).flatMap(s => {
                try { return Array.from(s.cssRules).map(r => r.cssText); } catch (e) { return []; }
            }).join('\n');
            const hasAccent = /settings-tab-panel[^{]*checkbox[^{]*\{[^}]*accent/.test(css) ||
                /checkbox[^{]*:checked[^{]*\{[^}]*accent/.test(css);
            return { hasAccent };
        });
        record('T9 toggle 开关使用主题色', t9.hasAccent ? 'PASS' : 'FAIL', JSON.stringify(t9));

        /* T10 MNB 端到端: 打包音频 → 通过 handleZipFile 重新导入 */
        const t10 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            // 先保证有 1 条音频轨道/块/buffer
            if (!Object.keys(st.audioBuffers).length) return { err: 'no buffer' };
            const audioPayload = await N.buildAudioExportPayload();
            const song = N.buildExportSongData({ name: 't', author: '', description: '', mode: 'mnb' });
            const nbsBlob = await NBSClient.saveNBS(song);
            const zip = new JSZip();
            zip.file('song.nbs', nbsBlob);
            for (const f of audioPayload.files) zip.file(f.fileName, f.blob);
            zip.file('audio.json', JSON.stringify(audioPayload.meta));
            zip.file('metadata.json', JSON.stringify({
                type: 'noteblock-web-song-pack', formatVersion: 2,
                song: 'song.nbs', audio: 'audio.json'
            }));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const before = { lanes: st.audioLanes.length, clips: st.audioClips.length, bufs: Object.keys(st.audioBuffers).length };
            // 清空后再导入
            st.audioBuffers = {}; st.audioLanes = []; st.audioClips = [];
            st.notes = [];
            const wait = new Promise(r => setTimeout(r, 2500));
            N.handleZipFile(new File([zipBlob], 't.mnb', { type: 'application/zip' }));
            await wait;
            const keys = Object.keys(st.audioBuffers);
            return {
                before,
                lanes: st.audioLanes.length, clips: st.audioClips.length, bufs: keys.length,
                isAB: !!(st.audioBuffers[keys[0]] && st.audioBuffers[keys[0]].buffer &&
                    typeof st.audioBuffers[keys[0]].buffer.getChannelData === 'function'),
                notes: st.notes.length
            };
        });
        record('T10 MNB 音频端到端往返',
            (!t10.err && t10.bufs === 1 && t10.isAB && t10.lanes >= 1 && t10.clips >= 1 && t10.notes > 0) ? 'PASS' : 'FAIL',
            JSON.stringify(t10));

        /* T11 允许横向滚动到内容之外 */
        const t11 = await page.evaluate(() => {
            const pr = WebNBS.state.pianoRoll;
            const maxSX = pr._getMaxScrollX ? pr._getMaxScrollX() : 0;
            const contentMax = Math.max(0, (pr.totalTicks || 0) * pr._cfg.cellW * pr._zoomX() - pr._currentPanelWidth);
            pr.scrollX = maxSX;
            const atMax = pr.scrollX;
            pr.scrollX = maxSX + 300;
            const over = pr.scrollX;
            pr.scrollX = 0;
            return { maxSX: Math.round(maxSX), contentMax: Math.round(contentMax),
                atMax: Math.round(atMax), over: Math.round(over) };
        });
        record('T11 滚动范围含一屏余量', (t11.maxSX > t11.contentMax + 50) ? 'PASS' : 'FAIL', JSON.stringify(t11));

        /* T12 物理音调预览模式可切换且渲染无异常 */
        const t12 = await page.evaluate(() => {
            const N = WebNBS, st = N.state, pr = st.pianoRoll;
            const out = {};
            try {
                pr.setSegmentPreviewMode('physical');
                out.mode = pr.segmentPreviewMode;
                out.renderOk = true;
            } catch (e) { out.renderOk = false; out.err = String(e && e.message || e); }
            pr.setSegmentPreviewMode('pitch');
            out.back = pr.segmentPreviewMode;
            return out;
        });
        record('T12 物理音调预览模式', (t12.renderOk && t12.mode === 'physical' && t12.back === 'pitch') ? 'PASS' : 'FAIL', JSON.stringify(t12));

        /* 截图: 片段模式歌词 + 音频同步块配色 */
        await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            if (!st.lyrics.length) st.lyrics = [{ id: 'ly_shot', lane: 0, tick: 4, duration: 12, text: '标签跟随测试' }];
            if (!st.segmentLanes.some(l => l.special)) N.segmentEnsureLanes && N.segmentEnsureLanes();
            if (N.syncLyricsToRoll) N.syncLyricsToRoll();
            if (!st.segmentsEditMode) N.enterSegmentsEditMode && N.enterSegmentsEditMode();
            await new Promise(r => setTimeout(r, 400));
            st.pianoRoll.render();
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(__dirname, 'nbw_batch2_segments.png') });
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.message || e));
    }

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    if (errors.length) errors.slice(0, 10).forEach(e => console.log('  ' + e));
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
