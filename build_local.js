/**
 * build_local.js - 本地离线构建脚本
 *
 * 用途：
 *   将 src/ 下的 20 个 OGG 音色样本编码为 base64 内嵌表，
 *   把结果连同完整前端资源复制到 blbl-toy/，
 *   使 blbl-toy/index.html 可在 file:// 协议下直接双击打开使用
 *   （file:// 下浏览器禁止 fetch 本地资源，无法加载外部 OGG）。
 *
 * 用法：
 *   node build_local.js                 # 默认：src/ -> blbl-toy/
 *   node build_local.js --out <dir>     # 自定义输出目录
 *   node build_local.js --src <dir>     # 自定义源码目录
 *
 * 输出物：
 *   <out>/index.html                    # 注入了 sounds_base64.js 引用
 *   <out>/static/sounds/sounds_base64.js# 内嵌 base64 音色表
 *   <out>/static/...                    # 其余静态资源（含原 .ogg，作为回退）
 *
 * 源码侧改动：audio_engine.js 的 getSoundArrayBuffer(name)
 *   优先读 window.SOUNDS_BASE64，未找到时回退 fetch。
 *   因此 HTTP 服务器托管的 src/ 源码不受任何影响。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var DEFAULT_SRC = path.join(ROOT, 'src');
var DEFAULT_OUT = path.join(ROOT, 'blbl-toy');
var SOUNDS_BASE64_REL = path.join('static', 'sounds', 'sounds_base64.js');

function log(msg) {
    process.stdout.write(msg + '\n');
}

function parseArgs(argv) {
    var args = { src: DEFAULT_SRC, out: DEFAULT_OUT };
    for (var i = 2; i < argv.length; i++) {
        var a = argv[i];
        if (a === '--src' && argv[i + 1]) { args.src = path.resolve(argv[++i]); }
        else if (a === '--out' && argv[i + 1]) { args.out = path.resolve(argv[++i]); }
        else if (a === '-h' || a === '--help') { args.help = true; }
    }
    return args;
}

function usage() {
    log('用法: node build_local.js [--src <dir>] [--out <dir>]');
}

function listSounds(srcDir) {
    var dir = path.join(srcDir, 'static', 'sounds');
    if (!fs.existsSync(dir)) {
        log('错误: 未找到音色目录 ' + dir);
        process.exit(1);
    }
    return fs.readdirSync(dir)
        .filter(function (f) { return /\.ogg$/i.test(f); })
        .sort();
}

function buildBase64Table(srcDir, soundFiles) {
    var lines = [];
    lines.push('/**');
    lines.push(' * sounds_base64.js - 由 build_local.js 自动生成，请勿手改');
    lines.push(' * 生成时间: ' + new Date().toISOString());
    lines.push(' * 音色样本数: ' + soundFiles.length);
    lines.push(' * 用途: file:// 协议下双击 index.html 打开时使用（规避 fetch 本地资源受限）');
    lines.push(' */');
    lines.push('window.SOUNDS_BASE64 = window.SOUNDS_BASE64 || {};');
    lines.push('(function () {');
    lines.push('    "use strict";');
    lines.push('    var M = window.SOUNDS_BASE64;');
    lines.push('    var b64 = {');

    var totalRaw = 0;
    for (var i = 0; i < soundFiles.length; i++) {
        var file = soundFiles[i];
        var name = file.replace(/\.ogg$/i, '');
        var full = path.join(srcDir, 'static', 'sounds', file);
        var data = fs.readFileSync(full);
        totalRaw += data.length;
        lines.push("        '" + name + "': '" + data.toString('base64') + "',");
    }

    lines.push('    };');
    lines.push('    for (var k in b64) M[k] = b64[k];');
    lines.push('})();');
    lines.push('');

    return { content: lines.join('\n'), totalRaw: totalRaw };
}

function copyDir(src, dst, acc) {
    fs.mkdirSync(dst, { recursive: true });
    if (!acc) acc = { files: 0, dirs: 0 };
    var entries = fs.readdirSync(src, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var s = path.join(src, e.name);
        var d = path.join(dst, e.name);
        if (e.isDirectory()) {
            copyDir(s, d, acc);
            acc.dirs++;
        } else {
            fs.copyFileSync(s, d);
            acc.files++;
        }
    }
    return acc;
}

function injectBase64Script(htmlPath) {
    var html = fs.readFileSync(htmlPath, 'utf8');
    // 版本号: 当日 + 序列号，避免重建后命中旧 base64 缓存
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var stamp = '20' + pad(d.getFullYear() % 100) + pad(d.getMonth() + 1) + pad(d.getDate()) +
                pad(Math.floor(d.getHours() * 60 + d.getMinutes()));
    var tag = '<script src="static/sounds/sounds_base64.js?v=' + stamp + '"></script>';
    var marker = '<script src="static/js/audio_engine.js?v=';

    // 幂等: 若已有 base64 引用(任意版本)，先移除再按新时间戳重写
    var cleaned = html.replace(/\s*<script src="static\/sounds\/sounds_base64\.js(?:\?v=[^"]*)?"><\/script>\n?/, '');
    if (cleaned === html) {
        log('  · index.html 无旧 base64 引用');
    } else {
        log('  · index.html 已移除旧 base64 引用');
    }
    var idx = cleaned.indexOf(marker);
    if (idx === -1) {
        log('错误: index.html 未找到 audio_engine.js 引用点，无法注入');
        process.exit(1);
    }
    // 插入到 audio_engine.js 引用之前
    var out = cleaned.slice(0, idx) + tag + '\n' + cleaned.slice(idx);
    fs.writeFileSync(htmlPath, out, 'utf8');
    log('  · index.html 已注入 base64 引用 v=' + stamp + '（位于 audio_engine.js 之前）');
    return true;
}

function injectClientSource(htmlPath, srcDir) {
    var html = fs.readFileSync(htmlPath, 'utf8');
    var clientSrc = fs.readFileSync(path.join(srcDir, 'static', 'js', 'nbs_client.js'), 'utf8');
    // JSON 字符串中的 "</script>" 序列会提前结束 script 标签, 转义为 "<\/script>"
    var json = JSON.stringify(clientSrc).replace(/<\//g, '<\\/');
    var tag = '<script>window.NBS_CLIENT_SOURCE=' + json + ';</script>';
    var marker = '<script src="static/js/compress_est.js?v=';

    // 幂等: 若已有 NBS_CLIENT_SOURCE 注入, 先移除再重写
    var cleaned = html.replace(/\s*<script>window\.NBS_CLIENT_SOURCE=.*?<\/script>\n?/, '');
    if (cleaned === html) {
        log('  · index.html 无旧 NBS_CLIENT_SOURCE 注入');
    } else {
        log('  · index.html 已移除旧 NBS_CLIENT_SOURCE 注入');
    }
    var idx = cleaned.indexOf(marker);
    if (idx === -1) {
        log('错误: index.html 未找到 compress_est.js 引用点，无法注入 NBS_CLIENT_SOURCE');
        process.exit(1);
    }
    // 插入到 compress_est.js 引用之前
    var out = cleaned.slice(0, idx) + tag + '\n' + cleaned.slice(idx);
    fs.writeFileSync(htmlPath, out, 'utf8');
    log('  · index.html 已注入 window.NBS_CLIENT_SOURCE (' + human(clientSrc.length) + ')');
}

function dirSize(dir) {
    var total = 0;
    var walk = function (d) {
        var entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else { try { total += fs.statSync(p).size; } catch (e2) {} }
        }
    };
    walk(dir);
    return total;
}

function human(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function main() {
    var args = parseArgs(process.argv);
    if (args.help) { usage(); process.exit(0); }

    log('=== build_local.js ===');
    log('源码目录: ' + args.src);
    log('输出目录: ' + args.out);
    log('');

    if (!fs.existsSync(args.src)) {
        log('错误: 源码目录不存在: ' + args.src);
        process.exit(1);
    }

    // 1) 收集音色
    log('[1/4] 扫描音色样本...');
    var soundFiles = listSounds(args.src);
    log('  发现 ' + soundFiles.length + ' 个 .ogg: ' + soundFiles.map(function (f) { return f.replace(/\.ogg$/i, ''); }).join(', '));

    // 2) 生成 base64 表
    log('');
    log('[2/4] 生成 base64 内嵌表...');
    var t0 = Date.now();
    var table = buildBase64Table(args.src, soundFiles);
    log('  原始样本合计: ' + human(table.totalRaw));
    log('  base64 文本:  ' + human(Buffer.byteLength(table.content, 'utf8')));
    log('  膨胀比:      ' + (Buffer.byteLength(table.content, 'utf8') / Math.max(1, table.totalRaw)).toFixed(2) + 'x');

    // 3) 清空输出目录并复制
    log('');
    log('[3/4] 复制前端资源到输出目录...');
    if (fs.existsSync(args.out)) {
        fs.rmSync(args.out, { recursive: true, force: true });
        log('  已删除旧输出目录');
    }
    var stats = copyDir(args.src, args.out);
    log('  复制完成: ' + stats.files + ' 文件, ' + stats.dirs + ' 子目录');

    // 4) 写入 base64 表 + 注入 index.html
    log('');
    log('[4/4] 写入 base64 表并注入 index.html...');
    var b64Dir = path.join(args.out, 'static', 'sounds');
    fs.mkdirSync(b64Dir, { recursive: true });
    fs.writeFileSync(path.join(b64Dir, 'sounds_base64.js'), table.content, 'utf8');
    log('  已写入 static/sounds/sounds_base64.js');
    injectBase64Script(path.join(args.out, 'index.html'));
    // 内嵌 nbs_client.js 源码: file:// 离线模式下 Worker 无法 fetch, 从 window.NBS_CLIENT_SOURCE 取源码
    injectClientSource(path.join(args.out, 'index.html'), args.src);

    // 5) 汇总
    var total = dirSize(args.out);
    log('');
    log('=== 构建完成 ===');
    log('输出目录: ' + args.out);
    log('总大小:   ' + human(total));
    log('耗时:     ' + (Date.now() - t0) + ' ms');
    log('');
    log('使用方式: 双击 ' + path.join(args.out, 'index.html') + ' 即可离线使用');
}

try {
    main();
} catch (err) {
    log('');
    log('构建失败: ' + (err && err.stack ? err.stack : String(err)));
    process.exit(1);
}
