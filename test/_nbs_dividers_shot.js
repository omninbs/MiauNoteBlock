/** 临时: 验证 NBS 模式片段轨道分割线 / 片段边界竖线 开关 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://127.0.0.1:8000';
const MIDI = 'C:\\Users\\MSI\\Desktop\\Big制作\\Midi\\level!.mid';
const OUT = path.join(__dirname, '_out');

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    async function dismiss() {
        for (let i = 0; i < 6; i++) {
            const mask = page.locator('#privacy-popup-mask');
            if (await mask.count().catch(() => 0) && await mask.isVisible().catch(() => false)) {
                await mask.locator('button').last().click({ force: true }).catch(() => {});
                await page.waitForTimeout(250); continue;
            }
            const oct = page.locator('#octave-popup');
            if (await oct.count().catch(() => 0) && await oct.isVisible().catch(() => false)) {
                const x = page.locator('#octave-close-x');
                if (await x.count()) await x.click({ force: true }).catch(() => {});
                else await page.locator('#octave-close-btn').click({ force: true }).catch(() => {});
                await page.waitForTimeout(250); continue;
            }
            const ov = page.locator('.app-dialog-overlay').first();
            if (!(await ov.count().catch(() => 0)) || !(await ov.isVisible().catch(() => false))) return;
            const btns = ov.locator('button'); const n = await btns.count();
            if (!n) return;
            await btns.nth(n - 1).click({ force: true }).catch(() => {});
            await page.waitForTimeout(250);
        }
    }
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await dismiss();
    await page.evaluate(() => {
        const orig = PianoRoll.prototype.setLayerGroups;
        PianoRoll.prototype.setLayerGroups = function (g) {
            window.__dbgGroups = g;
            return orig.call(this, g);
        };
        const origDraw = PianoRoll.prototype._drawTrackGroupDividers;
        PianoRoll.prototype._drawTrackGroupDividers = function () {
            var gs = this._nbsLayerGroups || [];
            window.__dbgDraw = {
                enabled: this.showSegmentLaneDividers,
                groups: gs.length,
                segMode: this.segmentsEditMode,
                top: this._editAreaTop(),
                bottom: this._editAreaBottom(),
                ys: gs.slice(0, 5).map(g => this._layerBaseY(g.from)),
                scrollY: this.scrollY,
                originY: this._editOriginY()
            };
            return origDraw.call(this);
        };
    });
    await page.setInputFiles('#file-input', MIDI);
    await page.waitForSelector('#midi-popup', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(900);
    await dismiss();
    const names = await page.evaluate(() => {
        const chk = document.querySelector('#settings-seg-lane-dividers');
        const b = document.querySelector('#settings-seg-boundary-lines');
        return { laneDividers: chk ? chk.checked : null, boundary: b ? b.checked : null };
    });
    console.log('设置默认:', JSON.stringify(names));
    await page.click('#midi-import-btn');
    await page.waitForSelector('#midi-popup', { state: 'hidden', timeout: 90000 });
    await page.waitForTimeout(1800);
    await dismiss();
    await page.waitForTimeout(400);
    await dismiss();
    console.log('分组:', await page.evaluate(() => JSON.stringify(window.__dbgGroups || [])));
    console.log('绘制调用:', await page.evaluate(() => JSON.stringify(window.__dbgDraw || null)));
    console.log('像素对比:', await page.evaluate(() => {
        const c = document.querySelector('#piano-roll');
        const ctx = c.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const px = y => {
            const d = ctx.getImageData(Math.round(500 * dpr), Math.round(y * dpr), 1, 1).data;
            return [d[0], d[1], d[2]];
        };
        return JSON.stringify({ y118: px(118), y119: px(119), y120: px(120), y121: px(121) });
    }));
    await page.screenshot({ path: path.join(OUT, 'nbs-dividers-on.png') });
    await page.screenshot({ path: path.join(OUT, 'nbs-dividers-crop.png'), clip: { x: 0, y: 50, width: 260, height: 300 } });

    // 打开片段边界竖线
    await page.evaluate(() => {
        const b = document.querySelector('#settings-seg-boundary-lines');
        if (b) { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'nbs-boundary-on.png') });

    // 关闭横向分割线
    await page.evaluate(() => {
        const c = document.querySelector('#settings-seg-lane-dividers');
        if (c) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'nbs-dividers-off.png') });
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
