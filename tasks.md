# 任务清单

- [x] a1 00-core.js state 添加 audioLanes/audioClips/audioBuffers/seq
- [x] a2 新建 modules/22-audio.js（lane/clip 管理+导入+菜单+sync），index.html 注册
- [x] a3 audio_engine.js decodeAudio + playAudioClip
- [x] a4 piano_roll.js 行模型/渲染/交互支持音频行
- [x] a5 piano_roll.js 「添加」按钮收纳 + addentry 命中/分发
- [x] a6 14-playback.js 调度音频 clip
- [x] a7 03-segment-model.js + 05-segments.js 特殊轨道独占 + 只读同步显示 + 侧栏锁定
- [x] a8 09-piano-roll.js onAddTrackMenu 回调（含隐藏 file input）
- [x] a9 i18n 9 语言补 key
- [x] a10 npm run build + 无头浏览器验证（菜单/导入/分割/拖动/片段独占/播放调度）+ 回归

## 验证结果（Temp/nbw_audio_test.js，14/14 PASS）

- 添加按钮收纳为单按钮；菜单 3 项；三类轨道各自可添加
- 导入音频 → 轨道 + 块 + 波形；分割/增益/时长/移动/删除
- 片段模式：歌词/音频各独占一条特殊轨道（notes 恒空），侧栏锁定，画布只读同步块
- 播放调度音频 clip（层标识 `audio:<laneId>`，暂停/跳转按层停止）
- 撤销/重做、新建文件清空、原有歌词与普通片段回归
