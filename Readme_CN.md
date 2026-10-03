<div align="center">

<!-- LOGO为AI生成 -->
<img src="/docs/logo.png" alt="MiauNoteBlock" width="1280" />

# MiauNoteBlock

**一款完全在浏览器中运行的跨平台我的世界音符盒（NBS）音乐编辑器。**

*编曲、编辑、试听、导出，全程无需安装。*

[![Stars](https://img.shields.io/github/stars/COM1919/MiauNoteBlock?style=for-the-badge&logo=github&color=f2b705)](https://github.com/COM1919/MiauNoteBlock/stargazers)
[![License](https://img.shields.io/github/license/COM1919/MiauNoteBlock?style=for-the-badge&color=3da639)](./LICENSE)
[![Website](https://img.shields.io/badge/在线体验-webnbs.com-4a90d9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://webnbs.com)
[![Languages](https://img.shields.io/badge/多语言-10%20种-8a63d2?style=for-the-badge&logo=googletranslate&logoColor=white)](#-支持的界面语言)
[![PRs Welcome](https://img.shields.io/badge/欢迎-PR-brightgreen?style=for-the-badge&logo=git&logoColor=white)](#-参与贡献)
[![Made with AI](https://img.shields.io/badge/代码-约70%25%20由AI生成-ff69b4?style=for-the-badge&logo=openai&logoColor=white)](#-关于-ai-生成的代码)

[**English**](./Readme.md) · [**简体中文**](./Readme_CN.md)

</div>

---

<div align="center">

### 🎹 [**打开在线编辑器 → webnbs.com**](https://webnbs.com)

</div>

---

## 📖 目录

- [MiauNoteBlock 是什么？](#-miaunoteblock-是什么)
- [界面预览](#-界面预览)
- [功能特性](#-功能特性)
- [在线体验](#-在线体验)
- [支持的界面语言](#-支持的界面语言)
- [技术栈](#-技术栈)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [参与贡献](#-参与贡献)
- [交流与反馈](#-交流与反馈)
- [开源协议](#-开源协议)
- [关于 AI 生成的代码](#-关于-ai-生成的代码)

---

## 🐱 MiauNoteBlock 是什么？

**MiauNoteBlock** 是一款完全运行在浏览器端的 **Minecraft Note Block Studio（NBS）** 编辑器。它的目标是让音符盒编曲在**任何设备**上都能用——电脑、笔记本、平板、手机，打开浏览器就能创作，无需安装、无需插件、也无需把文件上传到服务器。

它读写 Minecraft 音符盒社区通用的标准 `.nbs` 格式，支持 **MIDI** 导入导出，通过**八度转换算法**把任意音乐搬进音符盒音域且尽量不损失听感，还能在本地把作品渲染成 **MP3 / WAV**。

> **隐私优先：** 所有文件都在你的浏览器里处理，不上传、不永久存储。

它最初以 *NoteBlockWeb* 的名字发布，现在正式更名为 **MiauNoteBlock**。

---

## 🖼 界面预览

<!-- 截图位：把图片放进 ./assets/ 目录，文件名与下方保持一致即可 -->
<div align="center">

<img src="./assets/screenshot-editor.png" alt="钢琴卷帘编辑器" width="90%" />

*钢琴卷帘编辑，WinUI / Fluent 风格界面。*

<img src="./assets/screenshot-midi.png" alt="MIDI 导入与音色拟合" width="90%" />

*MIDI 导入，自动音色拟合与延音轨道识别。*

<img src="./assets/screenshot-mobile.png" alt="移动端布局" width="42%" />

*为手机与平板优化的触控布局。*

</div>

---

## ✨ 功能特性

<table>
<tr><td width="50%" valign="top">

**🎼 编辑**
- Canvas 实现的完整**钢琴卷帘**编辑器
- 标准 `.nbs` 导入 / 导出
- 画笔、橡皮、选择、演奏等多种工具
- 框选多选、复制粘贴、撤销重做
- 音符查找 / 替换（Ctrl+F）
- 音轨管理、音量与音色控制
- 音符点击次数 / 方块名叠加显示

</td><td width="50%" valign="top">

**🎧 音频与 MIDI**
- **MIDI 导入 / 导出**，完全离线
- **八度转换算法**：在尽量不损失听感的前提下把音乐塞进音符盒音域
- **GM 音色拟合**：把 MIDI 的 General MIDI 音色映射到 NBS 音色，并按乐器自动配置高 / 低替代音色
- **延音轨道自动识别**：风琴、弦乐、Pad 等持续型音色自动启用延音
- 支持 **SoundFont（SF3 / SF2）**，基于 SpessaSynth，失败时回退内置合成器
- 在浏览器内直接渲染导出 **MP3 / WAV**

</td></tr>
<tr><td width="50%" valign="top">

**🐈 更多**
- **自定义音色**：导入自己的采样，本地保存（元数据存 `localStorage`，音频存 `IndexedDB`）
- **歌曲压缩**：基于感知模型的音符精简，从「仅去重」到强力压缩，并实时预估体积
- **QWERTY 演奏模式**：把网格当成乐器来弹
- 创作辅助工具，让编排更顺手
- 完全**离线构建**（`file://`），音频内嵌可直接双击打开

</td><td width="50%" valign="top">

**🌍 平台**
- 任何现代浏览器都能跑，**免安装**
- **触控优化**：画笔 / 橡皮连续涂抹、双指平移、横屏抽屉
- **10 种界面语言**（AI 翻译）
- 仿 WinUI 3 / Fluent Design 的自适应主题，含 Mica / Acrylic 半透明材质
- 原生桌面 / 移动客户端已在计划中

</td></tr>
</table>

---

## ⬇ 在线体验

编辑器已公开部署，任何人都可以免费使用：

> ### 👉 **[https://webnbs.com](https://webnbs.com)**

无需下载、无需安装，作品始终留在你自己的设备上。

**离线 / 自托管构建**（双击 `index.html`，可在 `file://` 下使用）：

```bash
npm install      # 仅构建脚本需要，一次即可
npm run build    # src/  ->  blbl-toy/，音频以 base64 内嵌
```

然后打开 `blbl-toy/index.html`。

> 为了摆脱浏览器窗口的限制，我们正在计划制作原生桌面 / 移动客户端。

---

## 🌍 支持的界面语言

| 语言 | Locale |
| --- | --- |
| English (United States) | `en-US` |
| 简体中文 | `zh-CN` |
| Español | `es-ES` |
| Português (Brasil) | `pt-BR` |
| Русский | `ru-RU` |
| Deutsch | `de-DE` |
| Français | `fr-FR` |
| 日本語 | `ja-JP` |
| 한국어 | `ko-KR` |
| Bahasa Indonesia | `id-ID` |

翻译由 AI 生成，可能并不完全准确，欢迎提交 issues 指正。

---

## 🛠 技术栈

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Canvas](https://img.shields.io/badge/Canvas%202D-000000?style=flat-square&logo=html5&logoColor=white)
![Web Audio](https://img.shields.io/badge/Web%20Audio%20API-9b59b6?style=flat-square&logo=audiomack&logoColor=white)
![Web MIDI](https://img.shields.io/badge/Web%20MIDI%20API-1abc9c?style=flat-square&logo=midi&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)

</div>

- **前端：** 原生 JavaScript（无框架）、分层 Canvas 渲染、Web Audio API 播放、Web MIDI 实时输入。
- **音频：** 使用 SpessaSynth（`WorkletSynthesizer`）播放 SoundFont，另有内置回退合成器，以及一套离线渲染管线用于导出 MP3/WAV。
- **后端：** 一个轻量的 **FastAPI** 服务，只负责托管静态文件、提供极小的 `/api/config` 接口并注入 SEO 元数据。所有 NBS/MIDI 的解析、转换与播放都在**客户端**完成。

---

## 🚀 快速开始

### 本地运行（开发服务器）

```bash
# 1. 安装 Python 依赖
pip install fastapi uvicorn pyyaml

# 2. 启动服务（读取 config.yaml，默认端口 8000）
python app.py
```

然后访问 `http://127.0.0.1:8000`。

### 构建离线包

```bash
npm run build          # 或：node build_local.js
# Windows 便捷脚本：
build_local.bat
```

构建产物在 `blbl-toy/`，其中的 20 个 OGG 音色样本会以 base64 内嵌，可直接从磁盘双击打开使用。

### 配置

首次启动会自动生成 `config.yaml`，用于配置监听地址与端口、隐私声明、应用内显示的更新日志、SoundFont 下载地址以及 SEO 元数据。

---

## 📁 项目结构

```text
MiauNoteBlock/
├── app.py                  # FastAPI 静态托管 + SEO 注入
├── config.yaml             # 服务器 / 隐私 / 版本 / 音色库 / SEO 配置
├── build_local.js          # 离线（file://）构建脚本
├── build_local.bat         # Windows 构建脚本
├── src/
│   ├── index.html          # 单页应用外壳
│   └── static/
│       ├── css/            # WinUI / Fluent 风格主题
│       ├── js/             # 编辑器、钢琴卷帘、NBS/MIDI 客户端、音频引擎、i18n
│       ├── sounds/         # 20 个 OGG 音符盒音色样本
│       └── sprites/        # 乐器图标
├── docs/                   # 设计文档
└── test/                   # Node / Python 回归测试
```

---

## 👥 参与贡献

欢迎任何规模的贡献——报 Bug、修翻译、加功能、提设计建议都行。

1. **发现 BUG 或有新想法？** 请到 [Issues](../../issues/new/choose) 提交。
2. **准备提 PR？** 建议先开 Issue 讨论改动方案，除非是很少的代码量。
3. **翻译：** 10 种语言的词典都在 `src/static/js/i18n.js`，补充或修正文案是很好的入门贡献。

本地开发需要 **Node.js**（用于构建与测试）和 **Python 3**（用于开发服务器）。

---

## 💬 交流与反馈

欢迎加入 QQ 交流群，分享乐曲、获取技术支持，和其他 NBS 创作者交流：

> **QQ 交流群：2156069838**

反馈邮箱：`3451392772@qq.com`

---

## 📜 开源协议

本项目采用 **GNU General Public License v3.0** 开源协议。

- 允许个人学习、本地自由修改；
- 任何公开分发（免费 / 商用）的衍生程序，**必须保持开源、标注原作者，并遵循 GPLv3 协议**；
- **禁止未经单独授权闭源打包进行商业售卖。**

我们只是想让更多人能在不同设备上编辑 NBS，同时也加入了很多实用的新颖功能。

完整协议内容见 [LICENSE](./LICENSE)。

---

## 🤖 关于 AI 生成的代码

**本项目约 70% 的代码由 AI 编写。**

> 虽然它不能保证代码质量完美，但事实证明 AI 确实令人印象深刻。由于个人习惯，有些代码缺乏完美的注释，并充斥着 AI 生成的无关备注。阅读代码时，你可以让 AI 提供协助。

---

<div align="center">

**如果 MiauNoteBlock 对你的我的世界音符盒创作有帮助，请点一个 ⭐ Star，这真的很重要！**

<a href="https://github.com/COM1919/MiauNoteBlock/stargazers"><img src="https://img.shields.io/github/stars/COM1919/MiauNoteBlock?style=social" alt="给项目点 Star" /></a>

<sub>用 ❤ 和大量的提示词工程制作。</sub>

</div>