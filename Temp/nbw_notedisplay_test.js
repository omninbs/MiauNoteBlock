/* Temp/nbw_notedisplay_test.js — 音符显示设置验证
   运行: node Temp/nbw_notedisplay_test.js（需先 npm run build）*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', 'blbl-toy');
const PORT = 8127;
const results = [];
const errors = [];
function record(name, status, detail) {
    results.push({ name, status });
    console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
function startServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent((req.url || '/').split('?')[0]);
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

(async () => {
    const srv = await startServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('webnbs_privacy_agreed', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    try {
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.WebNBS && WebNBS.state && WebNBS.state.pianoRoll, null, { timeout: 20000 });
        await page.waitForTimeout(1500); // 等音色图标加载完

        /* T1 设置项: 音色图标 大小/位置 (不可调颜色); 其余三类 大小/位置/颜色 */
        const t1 = await page.evaluate(() => {
            const need = [];
            ['icon', 'pitch', 'block', 'index'].forEach(k => {
                need.push('settings-note-' + k + '-size');
                need.push('settings-note-' + k + '-pos');
                if (k !== 'icon') need.push('settings-note-' + k + '-color');
            });
            const missing = need.filter(id => !document.getElementById(id));
            return { missing, iconColorExists: !!document.getElementById('settings-note-icon-color') };
        });
        record('T1 显示内容设置项完整且音色图标不可调色',
            (t1.missing.length === 0 && !t1.iconColorExists) ? 'PASS' : 'FAIL', JSON.stringify(t1));

        /* T2 预览块颜色取音色(乐器)颜色 (patch 取色函数验证数据来源) */
        const t2 = await page.evaluate(() => {
            const N = WebNBS, pr = N.state.pianoRoll;
            const orig = pr._getInstrumentColor;
            let calls = 0;
            pr._getInstrumentColor = function () { calls++; return '#00ff00'; };
            N.renderNotePreview();
            const cv = document.getElementById('note-display-preview');
            const g = cv.getContext('2d');
            const img = g.getImageData(0, 0, cv.width, cv.height).data;
            let green = 0;
            for (let i = 0; i < img.length; i += 4) {
                // 预览块按音量有透明度, 混合后绿色仍占主导
                if (img[i + 1] > 140 && img[i] < 40 && img[i + 2] < 40) green++;
            }
            pr._getInstrumentColor = orig;
            N.renderNotePreview();
            return { green, calls };
        });
        record('T2 预览块底色来自音色颜色', (t2.green > 200 && t2.calls >= 3) ? 'PASS' : 'FAIL', JSON.stringify(t2));

        /* T3 20 个音色图标平均色 vs 调色板 (顺序一致性参考) */
        const t4 = await page.evaluate(async () => {
            const pal = window.NOTE_COLORS.slice();
            const out = [];
            for (let i = 0; i < 20; i++) {
                const img = await new Promise((res) => {
                    const im = new Image();
                    im.onload = () => res(im);
                    im.onerror = () => res(null);
                    im.src = 'static/sprites/spr_instrumenticons/inst_' + i + '.png';
                });
                if (!img) { out.push({ i, avg: null }); continue; }
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                const g = c.getContext('2d');
                g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data;
                let r = 0, gg = 0, b = 0, n = 0;
                for (let p = 0; p < d.length; p += 4) {
                    if (d[p + 3] < 40) continue;
                    r += d[p]; gg += d[p + 1]; b += d[p + 2]; n++;
                }
                if (!n) { out.push({ i, avg: null }); continue; }
                out.push({ i, avg: [Math.round(r / n), Math.round(gg / n), Math.round(b / n)], color: pal[i] });
            }
            return out;
        });
        const t4bad = t4.filter(o => !o.avg);
        record('T4 音色图标资源齐全 (0~19)', t4bad.length === 0 ? 'PASS' : 'FAIL', '缺失: ' + t4bad.map(o => o.i).join(','));
        console.log('  图标平均色 vs 调色板:');
        t4.forEach(o => {
            if (!o.avg) return;
            console.log(`   inst ${String(o.i).padStart(2)}: rgb(${o.avg.join(',')})  色板 ${o.color}`);
        });
    } catch (e) {
        record('脚本执行', 'FAIL', String(e && e.message || e));
    }
    await browser.close();
    srv.close();
    const fail = results.filter(r => r.status === 'FAIL');
    console.log(`\n===== 汇总 PASS ${results.length - fail.length} / FAIL ${fail.length} =====`);
    if (errors.length) errors.slice(0, 8).forEach(e => console.log('  ' + e));
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
