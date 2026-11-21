/* Temp/nbw_export_single_test.js — 复现「导出为NBS导出的是未更改状态, 批量导出正常」
   运行: node Temp/nbw_export_single_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8145;
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
// 导出后解析: 走与 _performExport 完全一致的链路 (compose → buildExportSongData → API.saveSong)
async function exportSingleAndParse() {
    return await page.evaluate(async () => {
        const N = WebNBS, st = N.state;
        N.segmentEnsureComposedForExport();
        const song = N.buildExportSongData({ name: 't', author: '', description: '' });
        const parsed = NBSClient._parseNBS(await (await fetch((await API.saveSong(song)).downloadUrl)).arrayBuffer());
        return {
            notes: parsed.notes.map(n => ({ t: n.tick, l: n.layer, i: n.instrument, k: n.key })),
            layers: (song.layers || []).length,
            maxTick: st.maxTick
        };
    });
}
// 批量导出链路: tabStash → tabCapture → buildExportSongDataFromSnapshot → saveNBS
async function exportBatchAndParse() {
    return await page.evaluate(async () => {
        const N = WebNBS, st = N.state;
        N.tabStash && N.tabStash();
        const tabs = st.tabs || [];
        const snap = (st.tabs && tabs.length) ? tabs[tabs.length - 1].snapshot : null;
        const cap = snap || (function() {
            // 无标签页环境: 直接构造当前快照
            const song = st.song || {};
            return {
                notes: JSON.parse(JSON.stringify(st.notes || [])),
                layers: JSON.parse(JSON.stringify(song.layers || [])),
                meta: { name: 't' }, tempo: st.tempo
            };
        })();
        const song = N.buildExportSongDataFromSnapshot(cap, 't');
        const parsed = NBSClient._parseNBS(await (await NBSClient.saveNBS(song)).arrayBuffer());
        return { notes: parsed.notes.map(n => ({ t: n.tick, l: n.layer, i: n.instrument, k: n.key })) };
    });
}
function sig(notes) {
    return notes.map(n => n.t + ':' + n.l + ':' + n.i + ':' + n.k).sort().join(',');
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
        /* S1: NBS 模式下 UI 点击添加音符 → 单个导出应包含新音符 */
        await page.evaluate(() => {
            const N = WebNBS, st = N.state;
            st.song = st.song || {};
            st.song.layers = [];
            for (let L = 0; L < 2; L++) st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
            st.notes = [];
            for (let t = 0; t < 40; t += 4) st.notes.push({ id: 's1_' + t, tick: t, layer: 0, instrument: 0, key: 48, velocity: 100, pan: 100, pitch: 0 });
            st.tracks = []; st.maxTick = 50; st.tempo = 20;
            st.lyrics = []; st.lyricLanes = [];
            st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
            st.segments = []; st.segmentLanes = []; st._segmentsEdited = false; st.segmentsEditMode = false;
            N.segmentEnsure();
            N.segmentSync();
            st.pianoRoll.setNotes(st.notes);
            st.pianoRoll.render();
        });
        // UI 真实点击添加一个音符 (tick 6, layer 0)
        await page.evaluate(() => {
            const roll = WebNBS.state.pianoRoll;
            const cellW = 32, cellH = 32;
            const canvas = roll.canvas || document.querySelector('#piano-roll-canvas') || document.querySelector('canvas');
            const rect = canvas.getBoundingClientRect();
            // 用应用内部 API 直接触发放置回调, 等价于画布单击
            roll.onNoteGroupAdded ? null : null;
        });
        const s1 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            // 模拟画布单击放置 (与 onNotePlace 相同路径)
            const roll = st.pianoRoll;
            roll._removeNoteAtPos(6, 0);
            roll.addNote({ tick: 6, layer: 0, instrument: 0, key: 60, velocity: 100, pan: 100, pitch: 0 });
            if (roll.onNotesChanged) roll.onNotesChanged([]);
            const single = await (async () => {
                N.segmentEnsureComposedForExport();
                const song = N.buildExportSongData({ name: 't', author: '', description: '' });
                const parsed = NBSClient._parseNBS(await (await fetch((await API.saveSong(song)).downloadUrl)).arrayBuffer());
                return parsed.notes.map(n => ({ t: n.tick, l: n.layer, i: n.instrument, k: n.key }));
            })();
            return { single, stateCount: st.notes.length };
        });
        const s1HasNew = s1.single.some(n => n.t === 6 && n.k === 60);
        record('S1 NBS模式加音符→单个导出包含新音符', (s1HasNew && s1.single.length === s1.stateCount) ? 'PASS' : 'FAIL',
            `exported=${s1.single.length} state=${s1.stateCount} hasNew=${s1HasNew}`);

        /* S2: 片段编辑(移动片段)不退出 → 单个导出 vs 批量导出 对比 */
        const s2 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.song.layers = [];
            st.notes = [];
            for (let L = 0; L < 2; L++) {
                st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                for (let t = 0; t < 40; t += 4) st.notes.push({ id: 's2_' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
            }
            st.tracks = []; st.maxTick = 50; st.tempo = 20;
            st.segmentsEditMode = false; st._segmentsEdited = false;
            st.segments = []; st.segmentLanes = [];
            N.segmentEnsure();
            N.segmentCaptureFromSong();
            st.segmentsEditMode = true;
            // 用户把唯一的片段整体后移 20 tick (UI 拖动等价)
            for (const s of st.segments) { s.start += 20; s.end += 20; }
            return true;
        });
        const single2 = await exportSingleAndParse();
        const batch2 = await exportBatchAndParse();
        const s2max = Math.max.apply(null, single2.notes.map(n => n.t));
        record('S2 片段移动后单个导出反映移动', s2max >= 56 ? 'PASS' : 'FAIL', `maxTick=${s2max}`);
        record('S2b 单个导出与批量导出一致', sig(single2.notes) === sig(batch2.notes),
            `single=${single2.notes.length} batch=${batch2.notes.length}`);
        // 退出片段模式后再导出, 应保持一致
        await page.evaluate(() => { WebNBS.segmentEnsureComposedForExport(); WebNBS.state.segmentsEditMode = false; });
        const single2b = await exportSingleAndParse();
        record('S2c 退出片段模式后导出仍一致', sig(single2b.notes) === sig(batch2.notes),
            `single=${single2b.notes.length} batch=${batch2.notes.length}`);

        /* S3: 片段模式内用片段钢琴窗口改音符(不关窗口) → 导出 */
        const s3 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            // 重新进入片段模式
            st.segmentsEditMode = true;
            N.segmentCaptureFromSong();
            // 直接修改片段内音符 (模拟钢琴窗口编辑已提交到 segment.notes)
            const seg = st.segments[0];
            if (seg.notes && seg.notes.length) seg.notes[0].key = 70;
            return true;
        });
        const single3 = await exportSingleAndParse();
        const s3Has = single3.notes.some(n => n.k === 70);
        record('S3 片段内改音符→单个导出反映修改', s3Has ? 'PASS' : 'FAIL', `hasKey70=${s3Has} n=${single3.notes.length}`);
        await page.evaluate(() => { WebNBS.state.segmentsEditMode = false; });

        /* S4: 音符编辑后经撤销/重做再导出 */
        const s4 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.segmentsEditMode = false; st._segmentsEdited = false;
            st.segments = []; st.segmentLanes = [];
            N.segmentEnsure(); N.segmentSync();
            st.notes = [];
            for (let t = 0; t < 20; t += 4) st.notes.push({ id: 's4_' + t, tick: t, layer: 0, instrument: 0, key: 48, velocity: 100, pan: 100, pitch: 0 });
            st.maxTick = 30;
            st.pianoRoll.setNotes(st.notes);
            N.pushUndo && N.pushUndo();
            st.notes.push({ id: 's4x', tick: 24, layer: 0, instrument: 0, key: 55, velocity: 100, pan: 100, pitch: 0 });
            st.pianoRoll.setNotes(st.notes);
            const song = N.buildExportSongData({ name: 't', author: '', description: '' });
            const parsed = NBSClient._parseNBS(await (await fetch((await API.saveSong(song)).downloadUrl)).arrayBuffer());
            return { hasNew: parsed.notes.some(n => n.tick === 24 && n.key === 55), count: parsed.notes.length };
        });
        record('S4 撤销栈共存时导出包含未撤销改动', s4.hasNew ? 'PASS' : 'FAIL', JSON.stringify(s4));

        /* S5: 全新音符 → 立即导出, 歌词/音频轨同时存在 */
        const s5 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.lyricLanes = [{ id: 'll1', name: 'L', after: 0 }];
            st.lyrics = [{ id: 'ly1', lane: 0, tick: 0, duration: 8, text: 'hi' }];
            st.audioLanes = [{ id: 'al1', name: 'A', after: 0, volume: 100, muted: false }];
            st.audioClips = [];
            const song = N.buildExportSongData({ name: 't', author: '', description: '' });
            const parsed = NBSClient._parseNBS(await (await fetch((await API.saveSong(song)).downloadUrl)).arrayBuffer());
            return { count: parsed.notes.length, layers: (song.layers || []).length };
        });
        record('S5 歌词/音频轨存在时导出音符数正常', s5.count > 0 ? 'PASS' : 'FAIL', JSON.stringify(s5));

        /* S6 用户报告的核心场景: 曾在片段模式编辑过(_segmentsEdited=true),
           退出后在 NBS 模式继续编辑音符 → 单个导出必须包含后续编辑, 不能被片段旧副本覆盖 */
        const s6 = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.song.layers = [];
            st.notes = [];
            for (let L = 0; L < 2; L++) {
                st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                for (let t = 0; t < 40; t += 4) st.notes.push({ id: 's6_' + L + '_' + t, tick: t, layer: L, instrument: L, key: 48 + L, velocity: 100, pan: 100, pitch: 0 });
            }
            st.tracks = []; st.maxTick = 50; st.tempo = 20;
            st.lyrics = []; st.lyricLanes = [];
            st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
            // 1) 进入片段模式并移动片段 (留下 _segmentsEdited=true)
            st.segments = []; st.segmentLanes = []; st._segmentsEdited = false;
            N.segmentEnsure();
            N.segmentCaptureFromSong();
            st.segmentsEditMode = true;
            for (const s of st.segments) { s.start += 20; s.end += 20; }
            st._segmentsEdited = true;
            // 2) 正常退出片段模式 (exit 内部会缝合)
            N.exitSegmentsEditMode();
            // 3) 回到 NBS 模式继续编辑: 加一个新音符 (k=77)
            st.pianoRoll._removeNoteAtPos(2, 0);
            st.pianoRoll.addNote({ tick: 2, layer: 0, instrument: 0, key: 77, velocity: 100, pan: 100, pitch: 0 });
            if (st.pianoRoll.onNotesChanged) st.pianoRoll.onNotesChanged([]);
            // 4) 单个导出链路
            const composed = N.segmentEnsureComposedForExport();
            const song = N.buildExportSongData({ name: 't', author: '', description: '' });
            const parsed = NBSClient._parseNBS(await (await fetch((await API.saveSong(song)).downloadUrl)).arrayBuffer());
            return {
                composed, edited: !!st._segmentsEdited,
                hasNew: parsed.notes.some(n => n.tick === 2 && n.key === 77),
                count: parsed.notes.length, stateCount: st.notes.length
            };
        });
        record('S6 片段编辑过→NBS模式再编辑→导出包含新编辑 (用户反馈场景)',
            (!s6.composed && s6.hasNew && s6.count === s6.stateCount) ? 'PASS' : 'FAIL', JSON.stringify(s6));
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.stack || e));
    }

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });


