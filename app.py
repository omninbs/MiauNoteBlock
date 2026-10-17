"""
MiauNoteBlock - 基于网页的 NBS 音符块编曲工具
FastAPI 静态托管服务

说明: NBS/MIDI 的解析、转换与播放已全部在浏览器端完成 (static/js/nbs_client.js),
服务端仅负责托管前端静态文件并提供少量配置接口。
"""
import os
import re
import json

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware

# ============ 加载配置文件 ============
# 隐私政策正文 (简体中文, 一份文本同时覆盖"在线访问"与"离线打包软件"两种使用方式)
# 同时作为: 1) config.yaml 默认配置中的 privacy.message;
#          2) 内存默认配置的 privacy.message;
#          3) 页面内置的 #privacy-popup-message 文本与之一致。
_PRIVACY_MESSAGE = """MiauNoteBlock 隐私政策

本政策同时适用于同一份程序的两种使用方式：在浏览器中在线访问网页版，以及将程序打包为离线软件后在本地打开。程序在技术上无法区分这两种方式，因此采用统一政策；两者的数据处理差异已在文中分别说明。

一、我们不收集的信息
本程序没有账号、登录或注册功能，不会收集您的姓名、邮箱、手机号、身份证号、通讯录、位置、相册等个人信息，也不会要求您提供任何身份凭证。程序不会读取您设备上与编曲无关的文件。

二、您在程序中打开与导出的文件
您选择的 MIDI、NBS 等文件仅在您的设备上（浏览器内存）被读取与编辑，不会上传到我们的服务器；导出的 NBS、音频、作品包等文件在本地生成，由您自行保存。您的作品内容不会被我们获取或留存。

三、本地存储
为记住您的偏好，程序会在您的设备上使用浏览器本地存储：
- localStorage：界面语言、外观与功能开关、上次会话的自动保存数据（含乐谱与歌词标注）；
- IndexedDB：您导入的自定义音色音频，以及（如使用）MIDI 音色库缓存。
上述数据只保存在本机，可通过清理浏览器数据或程序内相应功能随时删除。

四、在线访问时的访问统计
在线访问网页版时，页面集成了第三方匿名访问统计服务（analytics.xozet.com），用于了解整体使用情况。它记录的是不针对个人身份的数据，例如页面访问量与访客数、访问来源、浏览器与操作系统类型、屏幕尺寸、访问时间与停留时长。该统计不用于广告投放，也不用于识别、追踪或定位您的个人身份。该第三方脚本可能使用 Cookie 或设备本地标识来区分独立访客，其数据处理遵循服务提供方的隐私规则。

五、外部资源与网络请求
- 在线访问时，页面会从公共 CDN 加载图标字体与网页字体（cdnjs.cloudflare.com、fonts.googleapis.com）。
- 若管理员配置了 MIDI 音色库下载地址，程序会在您选择下载时由浏览器直连下载该文件，并缓存到本机以便离线复用。
- 打包为离线软件后，音色样本与主要脚本已内嵌在程序中，无网络时上述外部请求不会成功，程序仍可完整离线使用；若离线软件在联网环境中打开，其行为与在线访问一致（包括上述匿名访问统计）。

六、数据安全与第三方共享
我们不会出售您的数据，也不会将数据分享给第三方用于营销。除上述匿名访问统计与公共 CDN 外，本程序不会向其他外部服务发送您的数据。

七、未成年人
本程序不针对特定年龄群体设计，不会有意收集未成年人的个人信息。

八、政策更新
若本政策发生变化，我们会在程序内更新本说明内容，必要时会重新征得您的同意。

九、联系方式
如对本政策有任何疑问，可通过下方邮箱与我们联系：3451392772@qq.com"""


def _indent_block(text, spaces):
    """把多行文本按指定空格数整体缩进, 用于嵌入 YAML 块标量 (|-)"""
    pad = ' ' * spaces
    return '\n'.join((pad + line) if line.strip() else '' for line in text.split('\n'))


# 默认配置文件模板 (带注释, 首次启动时自动写入 config.yaml)
_DEFAULT_CONFIG_YAML = """# MiauNoteBlock 配置文件
# 修改后需重启服务生效

# 服务器监听配置
server:
  # 监听 IP
  # - 0.0.0.0 : 公开服务, 接受任意IP访问 (公网模式)
  # - 127.0.0.1 : 仅本机访问 (本地开发模式)
  host: 0.0.0.0
  # 监听端口
  port: 8000

# 公开模式配置
# - true  : 公开为站点, 任何人可访问
# - false : 本地/受控模式, 仅受信任用户访问
public: true

# 隐私政策 (首次访问时强制同意)
privacy:
  # 是否启用隐私弹窗
  enabled: true
  # 隐私政策内容 (完整政策, 同时覆盖在线访问与离线软件两种使用方式)
  # 留空或删除该行时, 页面会使用内置的同内容政策文本
  message: |-
    __PRIVACY_MESSAGE__

# 版本更新提示：修改版本号或内容后，客户端会在下次访问时显示更新日志
release:
  version: "2.4.9"
  notes: |
    本次更新
    - 新增 Español、Русский、Deutsch、Français、日本語和한국어界面语言；Português (Brasil) 已继续保留。
    - 修复底部乐器选择器在桌面端图标缺失、文字被挤为竖排的问题。
    - 将四种最新铜号角乐器统一为 Minecraft Wiki 官方名称。
    - 新增简体中文、English (United States)、Português (Brasil) 和 Bahasa Indonesia 界面语言。
    - 全局补充工具栏、菜单、提示和动态控件的多语言文本。
    - 修复移动端横屏仍显示桌面工具栏的问题。
    - 所有主要右键菜单、功能菜单、文件菜单、轨道菜单、音量浮层和片段菜单均会根据实际可用空间自动翻转、限高并提供内部滚动。
    - 底部 88 键钢琴键盘改为按真实键盘宽度居中。
    - 统一右键和浮层菜单为更接近 Windows 11 WinUI 的半透明 Mica/Acrylic 视觉。

# MIDI 音色库配置 (SF3/SF2 格式)
# 配置下载链接后, 由客户端在设置中选择下载策略 (播放时询问 / 自动后台下载 / 不使用)。
# 已下载的音色库会缓存在浏览器 (IndexedDB), 再次访问直接复用。
# 未配置或下载失败时, 自动回退到浏览器内置合成器 (质量较低, 无法准确拟合)。
# 引擎: 使用 SpessaSynth 合成器 (WorkletSynthesizer), 音质与性能优于旧解析器。
soundfont:
  # SF3/SF2 音色文件下载链接 (支持 http/https 直链, 客户端直连下载, 不占用服务器带宽)
  # 文件格式: .sf3 (推荐, Vorbis 压缩, 体积小质量好) 或 .sf2 (未压缩 PCM)
  url: ""
  # 音色库名称 (仅用于下载提示显示, 如 "GeneralUser GS")
  name: ""
"""

# 独立定义的 SEO 配置段 (带注释和默认值)。
# 1) 首次启动生成 config.yaml 时作为默认配置的一部分写入;
# 2) 若已有 config.yaml 但缺少 seo 段, 会把这个段追加到文件末尾,
#    使用户能看到并可修改默认关键词/标题/描述。
_SEO_CONFIG_YAML = """# SEO 搜索引擎优化配置
# 这些值会作为 <meta> 标签写入首页 <head>, 供百度/Google/Bing 等搜索引擎
# 与 QQ/微信等社交平台分享卡片读取。留空即使用默认值 (下方已标注默认)。
# 修改后需重启服务生效。
seo:
  # 站点公开地址 (用于生成分享卡片的绝对链接, 如 https://example.com/)
  # 留空则分享卡片使用相对地址 (部分平台可能需要绝对地址才能显示图片)
  site_url: ""
  # SEO 标题 (浏览器标签 + 搜索结果标题 + 分享卡片标题)
  # 默认: MiauNoteBlock - 在线 Minecraft 音符盒 (NBS) 编曲编辑器
  title: ""
  # SEO 描述 (搜索结果摘要 + 分享卡片描述), 建议 60~120 个字符
  # 默认: 免费在线 Minecraft 音符盒 (Note Block / NBS) 编曲工具：支持 NBS 导入导出、MIDI 导入、钢琴卷帘编辑、音色拟合与音频渲染，无需安装即可在浏览器中使用。
  description: ""
  # 搜索引擎关键词 (逗号分隔)。注意: 现在的搜索引擎已不依赖 keywords 决定排名,
  # 主要作用是对 HTML 进行语义标注。
  # 默认: Minecraft, 音符盒, Note Block, NBS, 编曲, 编辑器, 音乐制作, MIDI, 在线工具, Music, Editor, Note block music
  keywords: ""
"""

# 合并: 默认配置文件 = 基本配置 + seo 段
# 同时把隐私政策正文按 YAML 块标量缩进后填入模板
_DEFAULT_CONFIG_YAML = _DEFAULT_CONFIG_YAML.replace(
    '    __PRIVACY_MESSAGE__', _indent_block(_PRIVACY_MESSAGE, 4)
)
_DEFAULT_CONFIG_YAML += "\n" + _SEO_CONFIG_YAML


# ============ SEO 搜索引擎优化 ============
# 配置 seo.title/site_url/description/keywords 留空时使用的默认值。
SEO_DEFAULTS = {
    'site_url': '',
    'title': 'MiauNoteBlock - 在线 Minecraft 音符盒 (NBS) 编曲编辑器',
    'description': '免费在线 Minecraft 音符盒 (Note Block / NBS) 编曲工具：支持 NBS 导入导出、MIDI 导入、钢琴卷帘编辑、音色拟合与音频渲染，无需安装即可在浏览器中使用。',
    'keywords': 'Minecraft, 音符盒, Note Block, NBS, 编曲, 编辑器, 音乐制作, MIDI, 在线工具, Music, Editor, Note block music',
}


def _ensure_seo_in_config(config_path):
    """若已有 config.yaml 但缺少 seo 段, 把默认 seo 段(带注释和默认值)追加到文件末尾,
    使用户能直接看到默认可修改的关键词/标题/描述。"""
    try:
        import yaml
        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        if 'seo' in data:
            return
        with open(config_path, 'a', encoding='utf-8') as f:
            f.write('\n' + _SEO_CONFIG_YAML)
        print('[MiauNoteBlock] 已在 config.yaml 末尾写入默认 SEO 配置 (可自行修改关键词/标题/描述)')
    except Exception as e:
        print(f'[警告] 写入默认 SEO 配置到 config.yaml 失败: {e}')


def load_config():
    """加载 config.yaml 配置文件, 不存在则自动创建默认配置"""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.yaml')
    default_config = {
        'server': {'host': '0.0.0.0', 'port': 8000},
        'public': True,
        'privacy': {
            'enabled': True,
            'message': _PRIVACY_MESSAGE
        },
        'release': {
            'version': '2.4.9',
            'notes': 'See config.yaml for the current release notes.'
        },
        'soundfont': {
            'url': '',
            'name': ''
        },
        'seo': dict(SEO_DEFAULTS)
    }
    if not os.path.exists(config_path):
        # 配置文件不存在, 自动创建带注释的默认配置
        try:
            import yaml
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write(_DEFAULT_CONFIG_YAML)
            print(f"[MiauNoteBlock] 已自动创建默认配置文件: {config_path}")
        except ImportError:
            print("[警告] 未安装 PyYAML, 无法写入默认配置文件, 使用内存默认配置. pip install pyyaml")
        except Exception as e:
            print(f"[警告] 创建默认 config.yaml 失败: {e}, 使用内存默认配置")
        return default_config
    try:
        import yaml
        with open(config_path, 'r', encoding='utf-8') as f:
            user_config = yaml.safe_load(f) or {}
        # 合并配置
        for key in default_config:
            if key in user_config:
                if isinstance(default_config[key], dict):
                    if isinstance(user_config[key], dict):
                        default_config[key].update(user_config[key])
                    else:
                        default_config[key] = user_config[key]
                else:
                    default_config[key] = user_config[key]
        _ensure_seo_in_config(config_path)
        return default_config
    except ImportError:
        print("[警告] 未安装 PyYAML, 使用默认配置. pip install pyyaml")
        return default_config
    except Exception as e:
        print(f"[警告] 加载 config.yaml 失败: {e}, 使用默认配置")
        return default_config


CONFIG = load_config()


def _inject_seo(html):
    """把 SEO 元数据注入首页 <head>:
    - 百度/Google/Bing 等搜索引擎: title/keywords/description/robots/canonical/JSON-LD
    - 社交分享卡片 (QQ/微信/微博/WhatsApp/Facebook): Open Graph + schema.org itemprop
    - Twitter: twitter:card 大图卡片
    配置 seo 段留空时使用 SEO_DEFAULTS 默认值。"""
    seo = CONFIG.get('seo', {}) or {}
    title = str(seo.get('title') or '').strip() or SEO_DEFAULTS['title']
    description = str(seo.get('description') or '').strip() or SEO_DEFAULTS['description']
    keywords = str(seo.get('keywords') or '').strip() or SEO_DEFAULTS['keywords']
    site_url = str(seo.get('site_url') or '').strip()
    base_url = site_url.rstrip('/') if site_url else ''
    page_url = (base_url + '/') if base_url else '/'
    image = (base_url + '/static/logo.png') if base_url else '/static/logo.png'

    def esc(s):  # HTML 属性转义
        return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                 .replace('"', '&quot;').replace("'", '&#39;'))

    et, ed, ek, ei = esc(title), esc(description), esc(keywords), esc(image)

    # 替换已有 <title> (与配置标题保持一致)
    html = re.sub(r'<title>[^<]*</title>', '<title>' + et + '</title>', html, count=1)

    tags = []
    # ---- 搜索引擎基础元数据 (百度/Google/Bing/搜狗/360 等) ----
    tags.append('<meta name="keywords" content="' + ek + '">')
    tags.append('<meta name="description" content="' + ed + '">')
    tags.append('<meta name="robots" content="index, follow, max-image-preview:large">')
    tags.append('<meta name="author" content="MiauNoteBlock">')
    tags.append('<meta name="copyright" content="MiauNoteBlock">')
    tags.append('<meta name="application-name" content="MiauNoteBlock">')
    if base_url:
        tags.append('<link rel="canonical" href="' + esc(page_url) + '">')

    # ---- Open Graph (Facebook / WhatsApp / QQ / 微信 / 微博 / 知乎等社交平台) ----
    tags.append('<meta property="og:type" content="website">')
    tags.append('<meta property="og:site_name" content="MiauNoteBlock">')
    tags.append('<meta property="og:locale" content="zh_CN">')
    tags.append('<meta property="og:title" content="' + et + '">')
    tags.append('<meta property="og:description" content="' + ed + '">')
    tags.append('<meta property="og:image" content="' + ei + '">')
    tags.append('<meta property="og:image:alt" content="' + et + '">')
    if base_url:
        tags.append('<meta property="og:url" content="' + esc(page_url) + '">')

    # ---- QQ / 微信分享: 补充 schema.org itemprop, 与 og 互为兜底 ----
    tags.append('<meta itemprop="name" content="' + et + '">')
    tags.append('<meta itemprop="description" content="' + ed + '">')
    tags.append('<meta itemprop="image" content="' + ei + '">')
    tags.append('<meta itemprop="image:alt" content="' + et + '">')

    # ---- Twitter 分享卡片 (大图模式) ----
    tags.append('<meta name="twitter:card" content="summary_large_image">')
    tags.append('<meta name="twitter:title" content="' + et + '">')
    tags.append('<meta name="twitter:description" content="' + ed + '">')
    tags.append('<meta name="twitter:image" content="' + ei + '">')

    # ---- 结构化数据 (Google / Bing 富结果) ----
    json_ld = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        'name': 'MiauNoteBlock',
        'url': page_url,
        'description': description,
        'applicationCategory': 'MusicApplication',
        'operatingSystem': 'Any',
        'genre': 'Music',
        'inLanguage': 'zh-CN'
    }
    tags.append('<script type="application/ld+json">' +
                json.dumps(json_ld, ensure_ascii=False) + '</script>')

    block = '\n    '.join(tags)
    if '</head>' in html:
        html = html.replace('</head>', block + '\n</head>', 1)
    else:
        html += '\n' + block
    return html


# 创建 FastAPI 应用
app = FastAPI(title="MiauNoteBlock", description="基于网页的 NBS 音符块编曲工具")

# 启用 GZip 压缩 (小响应不压缩, 大响应自动压缩, 显著降低 JSON 体积)
# 客户端需带 Accept-Encoding: gzip
app.add_middleware(GZipMiddleware, minimum_size=512, compresslevel=6)

# 目录结构 (打包后):
#   项目根/
#     app.py            服务入口
#     config.yaml       服务器配置
#     sf2/              SoundFont 配置目录
#     src/
#       index.html     主页
#       static/        前端资源 (css/js/sounds/sprites)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, "src")
STATIC_DIR = os.path.join(SRC_DIR, "static")

# 前端资源挂载在 /static 前缀 (与 index.html 中的 /static/... 绝对路径保持一致,
# 因此打包/重组目录后无需修改 index.html)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# 服务器配置 (从 config.yaml 读取)
SERVER_HOST = CONFIG.get('server', {}).get('host', '0.0.0.0')
SERVER_PORT = CONFIG.get('server', {}).get('port', 8000)
IS_PUBLIC = CONFIG.get('public', True)


# 路由
@app.get("/")
async def index():
    """主页"""
    # 禁止缓存首页, 避免手机端一直加载旧版 HTML/JS (版本号防缓存的双保险)
    # 注入 SEO 元数据 (标题/关键词/描述/OG/微信QQ分享卡片/Twitter/JSON-LD)
    with open(os.path.join(SRC_DIR, "index.html"), 'r', encoding='utf-8') as f:
        html = _inject_seo(f.read())
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache"})


@app.get("/api/config")
async def get_config():
    """获取服务器配置 (供前端决定是否显示隐私弹窗、更新日志、音色库策略)"""
    privacy_cfg = CONFIG.get('privacy', {})
    return {
        "is_public": IS_PUBLIC,
        "server_host": SERVER_HOST,
        "server_port": SERVER_PORT,
        "privacy": {
            "enabled": privacy_cfg.get('enabled', True),
            "message": privacy_cfg.get('message', '')
        },
        "release": {
            "version": str(CONFIG.get('release', {}).get('version', '')),
            "notes": str(CONFIG.get('release', {}).get('notes', ''))
        },
        "soundfont": {
            "url": str(CONFIG.get('soundfont', {}).get('url', '')),
            "name": str(CONFIG.get('soundfont', {}).get('name', ''))
        }
    }


# 启动服务器
if __name__ == "__main__":
    import uvicorn
    print(f"[MiauNoteBlock] 启动服务器: http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"[MiauNoteBlock] 公开模式: {IS_PUBLIC}")
    print(f"[MiauNoteBlock] 前端目录: {STATIC_DIR}")
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, workers=1)
