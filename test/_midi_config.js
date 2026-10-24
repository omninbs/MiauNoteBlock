/**
 * MIDI 导入配置(按文件哈希) + 默认值 + 轨道命名 回归测试
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://127.0.0.1:8000';
const MIDI_A = 'C:\\Users\\MSI\\Desktop\\Big制作\\Midi\\level!.mid';
const MIDI_B = 'C:\\Users\\MSI\\Desktop\\Big制作\\Midi\\The Other Side Of Paradise.mid';
const OUT = path.join(__dirname, '_out');

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    async function dismiss() {
        for (let i = 0; i < 6; i++) {
            const mask = page.locator('#privacy-popup-mask');
            if (await mask.count().catch(() => 0) && await mask.isVisible().catch(() => false)) {
                await mask.locator('button').last().click({ force: true }).catch(() => {});
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
    async function readDialog() {
        return page.evaluate(() => ({
            octaveMode: document.querySelector('#midi-octave-mode').value,
            smart: document.querySelector('#midi-smart-substitute').checked,
            forceFold: document.querySelector('#midi-force-fold').checked,
            autoSplit: document.querySelector('#midi-auto-split-segments').checked,
            persistKey: localStorage.getItem('midi_import_prefs_v2') ? 'exists' : 'none'
        }));
    }
    async function openMidi(file) {
        await dismiss();
        await page.setInputFiles('#file-input', file);
        await page.waitForSelector('#midi-popup', { state: 'visible', timeout: 20000 });
        await page.waitForTimeout(900);
        await dismiss();
    }
    async function importMidi() {
        await dismiss();
        await page.click('#midi-import-btn');
        await page.waitForSelector('#midi-popup', { state: 'hidden', timeout: 90000 });
        await page.waitForFunction(() => {
            const el = document.querySelector('#note-count');
            return el && /(\d+)/.test(el.textContent) && parseInt(el.textContent.replace(/\D+/g, ''), 10) > 0;
        }, { timeout: 90000 });
        await page.waitForTimeout(600);
        await dismiss();
    }

    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    // 记录转换结果, 便于检查轨道命名
    await page.evaluate(() => {
        const orig = window.NBSClient._convertMidiToNBS;
        window.NBSClient._convertMidiToNBS = function (ab, st) {
            const song = orig.call(this, ab, st);
            window.__dbgSongs = window.__dbgSongs || [];
            window.__dbgSongs.push({ names: (song.layers || []).map(l => l.name), notes: song.notes.length });
            return song;
        };
    });

    // 1) 文件 A 默认值
    await openMidi(MIDI_A);
    console.log('A 默认:', JSON.stringify(await readDialog()));

    // 2) 改设置后导入
    await page.evaluate(() => {
        const om = document.querySelector('#midi-octave-mode');
        om.value = '0'; om.dispatchEvent(new Event('change', { bubbles: true }));
        const sp = document.querySelector('#midi-auto-split-segments'); sp.checked = false;
        const sm = document.querySelector('#midi-smart-substitute'); sm.checked = false;
    });
    await importMidi();
    const namesA = await page.evaluate(() => window.__dbgSongs && window.__dbgSongs[0] ? window.__dbgSongs[0].names : []);
    console.log('A 导入后轨道名(前 20):', JSON.stringify(namesA.slice(0, 20)));
    console.log('A 含打击乐族名:', namesA.some(n => ['底鼓', '军鼓', '踩镲', '嗵鼓', '镲片', '打击乐'].includes(n)));

    // 3) 文件 B → 应该是默认值, 不继承 A
    await openMidi(MIDI_B);
    console.log('B 默认:', JSON.stringify(await readDialog()));
    await page.click('#midi-cancel-btn');
    await page.waitForTimeout(400);

    // 4) 再开 A → 恢复 A 的配置
    await openMidi(MIDI_A);
    console.log('A 恢复:', JSON.stringify(await readDialog()));
    await page.click('#midi-cancel-btn');
    await page.waitForTimeout(400);

    // 5) 刷新后 → 配置丢失, 回到默认
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
        const orig = window.NBSClient._convertMidiToNBS;
        window.NBSClient._convertMidiToNBS = function (ab, st) {
            const song = orig.call(this, ab, st);
            window.__dbgSongs = window.__dbgSongs || [];
            window.__dbgSongs.push({ names: (song.layers || []).map(l => l.name) });
            return song;
        };
    });
    await openMidi(MIDI_A);
    console.log('刷新后 A:', JSON.stringify(await readDialog()));

    console.log('页面错误:', JSON.stringify(errors.slice(0, 5)));
    await page.screenshot({ path: path.join(OUT, 'config-after-reload.png') });
    await browser.close();
})().catch(e => { console.error('测试失败:', e); process.exit(1); });
