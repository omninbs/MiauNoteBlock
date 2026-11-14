/* Temp/nbw_mnb_segments_test.js — MNB 片段还原复现/验证
   运行: node Temp/nbw_mnb_segments_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8131;
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

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    try {
        /* 场景 A: 新格式 — 8 层工程, 按层拆 8 条片段轨道 */
        const A = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            const mk = (layers) => {
                st.song = st.song || {};
                st.song.layers = [];
                st.notes = [];
                for (let L = 0; L < layers; L++) {
                    st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                    for (let t = 0; t < 80; t += 2) {
                        st.notes.push({
                            id: 'n' + L + '_' + t, tick: t + L * 2, layer: L, instrument: L,
                            key: 48 + L, velocity: 100, pan: 100, pitch: 0
                        });
                    }
                }
                st.tracks = [];
                st.maxTick = 200;
                st.tempo = 20;
                st.lyrics = []; st.lyricLanes = [];
                st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
                // 按层拆片段轨道 (每条 lane 记录真实全局层)
                st.segmentLanes = [];
                st.segments = [];
                for (let L = 0; L < layers; L++) {
                    st.segmentLanes.push({
                        id: L + 1, name: 'L' + L, muted: false, solo: false,
                        volume: 100, height: 48, layerKeys: [L]
                    });
                    st.segments.push({
                        id: L + 1, lane: L, start: 0, end: 200, name: 'seg' + L, notes: []
                    });
                }
                N.segmentCaptureFromSong();
            };

            async function roundTrip() {
                const before = st.segments.map(s => s.notes.length);
                const segJson = N.buildSegmentsJson();
                const song = N.buildExportSongData({ name: 't', author: '', description: '', mode: 'mnb' });
                const blob = await NBSClient.saveNBS(song);
                const parsed = NBSClient._parseNBS(await blob.arrayBuffer());
                const zipFile = {
                    file: () => ({ async: () => Promise.resolve(JSON.stringify(segJson)) })
                };
                await N.importSegmentsFromZip(zipFile, { segments: 'segments.json' }, parsed.notes);
                const after = st.segments.map(s => s.notes.length);
                return { before, after, parsedNotes: parsed.notes.length };
            }

            mk(8);
            const r1 = await roundTrip();

            // 旧格式模拟: layers 用 0..n-1 的相对编号 (与 song.nbs 真实层错位)
            mk(8);
            const segJsonOld = N.buildSegmentsJson();
            for (let i = 0; i < segJsonOld.lanes.length; i++) {
                const oldLayers = segJsonOld.lanes[i].layers;
                segJsonOld.lanes[i].layers = oldLayers.map(() => (i + 5) % 8); // 故意错位
                segJsonOld.lanes[i].layerKeys = segJsonOld.lanes[i].layers.slice();
            }
            const song2 = N.buildExportSongData({ name: 't', author: '', description: '', mode: 'mnb' });
            const blob2 = await NBSClient.saveNBS(song2);
            const parsed2 = NBSClient._parseNBS(await blob2.arrayBuffer());
            const zf2 = { file: () => ({ async: () => Promise.resolve(JSON.stringify(segJsonOld)) }) };
            const beforeOld = st.segments.map(s => s.notes.length);
            await N.importSegmentsFromZip(zf2, { segments: 'segments.json' }, parsed2.notes);
            const afterOld = st.segments.map(s => s.notes.length);

            return { r1, old: { before: beforeOld, after: afterOld } };
        });

        const a1ok = A.r1.before.every((n, i) => n > 0 && A.r1.after[i] === n);
        record('A1 新格式 MNB: 片段音符完整还原', a1ok ? 'PASS' : 'FAIL',
            `before=${JSON.stringify(A.r1.before)} after=${JSON.stringify(A.r1.after)}`);

        const a2empty = A.old.after.filter(n => n === 0).length;
        record('A2 旧格式(层号错位): 不应出现空片段', a2empty === 0 ? 'PASS' : 'FAIL',
            `before=${JSON.stringify(A.old.before)} after=${JSON.stringify(A.old.after)} 空片段=${a2empty}`);

        /* 场景 B: 含歌词/音频特殊轨道的工程, 导入后不应重复特殊轨道 */
        const B = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.song = st.song || {};
            st.song.layers = [];
            st.notes = [];
            for (let L = 0; L < 3; L++) {
                st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                for (let t = 0; t < 40; t += 2) {
                    st.notes.push({ id: 'b' + L + '_' + t, tick: t, layer: L, instrument: L, key: 50 + L, velocity: 100, pan: 100, pitch: 0 });
                }
            }
            st.tracks = []; st.maxTick = 100; st.tempo = 20;
            st.lyricLanes = [{ id: 'll1', name: '歌词 1', after: 2 }];
            st.lyrics = [{ id: 'ly1', lane: 0, tick: 0, duration: 8, text: '测试' }];
            st.audioLanes = [{ id: 'al1', name: '音频 1', after: 2, volume: 100, muted: false }];
            st.audioClips = [{ id: 'ac1', lane: 0, tick: 0, dur: 8, offsetSec: 0, bufferId: 'buf1', gain: 1 }];
            st.audioBuffers = { buf1: { name: 'a.wav', buffer: null, duration: 1 } };
            st.segmentLanes = [];
            st.segments = [];
            for (let L = 0; L < 3; L++) {
                st.segmentLanes.push({ id: L + 1, name: 'L' + L, muted: false, solo: false, volume: 100, height: 48, layerKeys: [L] });
                st.segments.push({ id: L + 1, lane: L, start: 0, end: 100, name: 's' + L, notes: [] });
            }
            N.segmentEnsureLanes();
            N.segmentCaptureFromSong();
            const specialBefore = st.segmentLanes.filter(l => l.special).length;
            const segJson = N.buildSegmentsJson();
            const song = N.buildExportSongData({ name: 't', author: '', description: '', mode: 'mnb' });
            const parsed = NBSClient._parseNBS(await (await NBSClient.saveNBS(song)).arrayBuffer());
            const zf = { file: () => ({ async: () => Promise.resolve(JSON.stringify(segJson)) }) };
            await N.importSegmentsFromZip(zf, { segments: 'segments.json' }, parsed.notes);
            N.segmentEnsureLanes();
            const specialAfter = st.segmentLanes.filter(l => l.special).length;
            return {
                specialBefore, specialAfter,
                laneCount: st.segmentLanes.length,
                segNotes: st.segments.map(s => s.notes.length)
            };
        });
        record('B1 特殊轨道导入后不重复',
            (B.specialBefore === B.specialAfter && B.specialAfter === 2) ? 'PASS' : 'FAIL', JSON.stringify(B));

        /* 场景 C: 片段编辑模式内直接导出 (state.notes 尚未缝合) — 核心回归 */
        const C = await page.evaluate(async () => {
            const N = WebNBS, st = N.state;
            st.song = st.song || {};
            st.song.layers = [];
            st.notes = [];
            for (let L = 0; L < 4; L++) {
                st.song.layers.push({ name: 'Layer ' + (L + 1), volume: 100, stereo: 100, lock: 0 });
                for (let t = 0; t < 60; t += 2) {
                    st.notes.push({ id: 'c' + L + '_' + t, tick: t, layer: L, instrument: L, key: 52 + L, velocity: 100, pan: 100, pitch: 0 });
                }
            }
            st.tracks = []; st.maxTick = 100; st.tempo = 20;
            st.lyrics = []; st.lyricLanes = [];
            st.audioLanes = []; st.audioClips = []; st.audioBuffers = {};
            st.segmentLanes = [];
            st.segments = [];
            for (let L = 0; L < 4; L++) {
                st.segmentLanes.push({ id: L + 1, name: 'L' + L, muted: false, solo: false, volume: 100, height: 48, layerKeys: [L] });
                st.segments.push({ id: L + 1, lane: L, start: 0, end: 100, name: 's' + L, notes: [] });
            }
            st.segmentsEditMode = true;
            st._segmentsEdited = true;
            N.segmentCaptureFromSong();
            // 模拟片段编辑: 整体后移 20 tick, 第二次编辑不写回 state.notes
            for (let i = 0; i < st.segments.length; i++) {
                st.segments[i].start += 20;
                st.segments[i].end += 20;
            }
            const oldNoteTicks = st.notes.map(n => n.tick);
            const staleNotes = oldNoteTicks.every(t => t < 60);
            const segCounts = st.segments.map(s => s.notes.length);
            // 导出链路 (新逻辑: 先缝合)
            const composed = N.segmentEnsureComposedForExport();
            const maxTickAfter = Math.max.apply(null, st.notes.map(n => n.tick));
            const song = N.buildExportSongData({ name: 't', author: '', description: '', mode: 'mnb' });
            const parsed = NBSClient._parseNBS(await (await NBSClient.saveNBS(song)).arrayBuffer());
            const segJson = N.buildSegmentsJson();
            const zf = { file: () => ({ async: () => Promise.resolve(JSON.stringify(segJson)) }) };
            await N.importSegmentsFromZip(zf, { segments: 'segments.json' }, parsed.notes);
            const after = st.segments.map(s => s.notes.length);
            return {
                composed, staleNotes, segCounts, after,
                maxTickAfter, parsedNotes: parsed.notes.length,
                layers: st.segmentLanes.filter(l => !l.special).length
            };
        });
        const cOk = C.composed && C.staleNotes && C.after.every((n, i) => n > 0 && n === C.segCounts[i]) &&
            C.parsedNotes > 0;
        record('C1 片段模式内导出: 缝合后片段完整还原', cOk ? 'PASS' : 'FAIL', JSON.stringify(C));
        record('C2 缝合后音符已移到片段新位置', C.maxTickAfter >= 70 ? 'PASS' : 'FAIL', 'maxTick=' + C.maxTickAfter);
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.message || e));
    }

    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
