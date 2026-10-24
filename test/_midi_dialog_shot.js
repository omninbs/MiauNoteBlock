/** 临时: 截取 MIDI 导入弹窗现状 (桌面/移动) */
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
    for (const vp of [{ w: 1600, h: 900, name: 'desktop' }, { w: 390, h: 844, name: 'mobile' }]) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.goto(APP, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
        for (let i = 0; i < 4; i++) {
            const mask = page.locator('#privacy-popup-mask');
            if (await mask.count() && await mask.isVisible().catch(() => false)) {
                await mask.locator('button').last().click({ force: true }).catch(() => {});
                await page.waitForTimeout(300); continue;
            }
            const ov = page.locator('.app-dialog-overlay').first();
            if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) break;
            const btns = ov.locator('button'); const n = await btns.count();
            if (!n) break;
            await btns.nth(n - 1).click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
        }
        await page.setInputFiles('#file-input', MIDI);
        await page.waitForSelector('#midi-popup', { state: 'visible', timeout: 20000 });
        await page.waitForTimeout(800);
        const ov = page.locator('.app-dialog-overlay').first();
        if (await ov.count() && await ov.isVisible().catch(() => false)) {
            const btns = ov.locator('button'); await btns.nth((await btns.count()) - 1).click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
        }
        await page.screenshot({ path: path.join(OUT, `midi-${vp.name}.png`) });
        // 记录弹窗尺寸与可见性
        const info = await page.evaluate(() => {
            const d = document.querySelector('.midi-import-dialog');
            const body = document.querySelector('.midi-tab-content');
            const basic = document.querySelector('#midi-tab-basic');
            return {
                dialog: d ? { w: d.clientWidth, h: d.clientHeight, scrollH: d.scrollHeight } : null,
                body: body ? { h: body.clientHeight, scrollH: body.scrollHeight, scrollTop: body.scrollTop } : null,
                basic: basic ? { h: basic.scrollHeight } : null,
                vh: window.innerHeight
            };
        });
        console.log(vp.name, JSON.stringify(info));
        await page.close();
    }
    await browser.close();
})();
