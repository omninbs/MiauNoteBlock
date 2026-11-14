# 规格：NBS 模式「添加」菜单 + 音频轨道 + 片段模式特殊轨道独占

## 需求
1. NBS 模式侧栏底部「添加音轨」「添加歌词轨道」两按钮收纳为一个「添加」按钮，点击弹出菜单选择要添加的轨道类型。
2. 新增**音频轨道**类型：可导入音频文件，音频块可分割、任意重组（类似片段模式）；与 NBS 轨道样式/功能相同，只是块的内容是音频。
3. 片段模式同步显示歌词轨道与音频轨道；特殊类型轨道（歌词/音频）不能被合并为片段轨道，必须独占一个片段轨道。

## 数据模型（00-core.js state 新增）
```js
audioLanes: [],      // [{ id, name, after, volume, muted }]  after 语义同 lyricLanes
audioClips: [],      // [{ id, lane, tick, dur, offsetSec, bufferId, gain }]  dur 单位 tick
audioBuffers: {},    // { id: { name, buffer, duration } }  仅内存持有，不持久化
_audioLaneIdSeq: 0,
_audioClipIdSeq: 0,
_audioBufferIdSeq: 0
```
- 持久化策略：audioLanes/audioClips 随工程元数据保存；audioBuffers 不持久化，刷新后 clips 保留但标记「缺失音频，请重新导入」。

## 实施清单

### A. 00-core.js（state 字段）
- 在 lyricClipboard 块之后追加 audioLanes/audioClips/audioBuffers/seq 字段及注释。

### B. 新模块 src/static/js/modules/22-audio.js（模仿 21-lyrics.js 导出模式）
- addAudioLane(after)、removeAudioLane(index)、renameAudioLane(index,name)、moveAudioLaneTo(index,toAfter)
- importAudioFile(file) → ArrayBuffer → AudioEngine.decodeAudio → 建 bufferId + lane + 首个 clip（tick=0, dur=按 tempo 换算）
- createAudioClip(lane,tick,bufferId)、splitAudioClip(id,tick)（分割点两侧 offsetSec 续接）、removeAudioClip(id)
- commitAudioClipDrag(id,tick,lane)、setAudioClipGain(id,gain)
- syncAudioToRoll() → pr.setAudioLanes(state.audioLanes); pr.audioClips 快照
- showAudioLaneMenu(x,y,index)、showAudioClipMenu(x,y,clipId)（DOM 菜单：分割/删除/增益/导入）
- refreshAudioLaneUI()（打开工程/自动恢复时同步）
- N.registerAudio(...) 导出。

### C. audio_engine.js
- 新增 decodeAudio(arrayBuffer) → Promise<AudioBuffer>
- 新增 playAudioClip(buffer, whenSec, offsetSec, gain, pan, layerKey)：BufferSource → gainNode → (pan) → masterGain，登记 _activeSources 用于 stopLayerAudio/stopAllAudio。

### D. piano_roll.js（核心改动）
1. **行模型**（~L1261-1438 区域）：
   - setAudioLanes(lanes)：照 setLyricLanes 复制+变化检测模式。
   - _audioLaneCount/_audioAfterOf：照 lyric 版。
   - _rowLayout：rows 增加 {type:'audio',lane}；同一 after 桶内歌词行在前、音频行在后；sig 纳入 audioLanes。
   - _rowIndexOfAudio/_audioRowScreenY/_audioLaneAtY/_audioRowRect：照 lyric 版。
2. **画布音频块渲染**：_drawAudioRows（照 _drawLyricRows L7603-7758 模式）：clip 块绘制波形 peaks 缓存（clip.id→peaks 采样点）+ 文件名；块颜色用音频专属色（如青灰蓝）。
3. **音频块交互**（照歌词块 mousedown ~L3944 / mousemove ~L4307 / mouseup ~L5340 / 触摸 ~L5117 模式）：
   - 拖动移动（tick+lane）、拖左右边调 dur（右边缘）、点击选中、长按/右键弹 showAudioClipMenu（分割/删除/增益）。
4. **侧栏音频行**（_drawTrackPanel L8143-8204 歌词行之后仿照）：♪→🔊 符号、名称、删除✕、拖动柄。
5. **添加按钮收纳**（L8206-8245）：
   - 删除两按钮并排逻辑，改画一个居中「+ 添加」按钮：_addEntryBtnRect，btnOverlay(-3,'addentry')。
6. **按钮命中**（L5633-5646）：addtrack/addlyriclane 命中分支替换为 addentry → 返回 {layer:-3, type:'addentry'}。
7. **点击分发**（L3592/L3597 区域）：onAddTrack/onAddLyricLane 调用处替换为 onAddTrackMenu(clientX, clientY)。
8. 片段模式 _renderSegmentEditor（L1818-1925）：特殊 lane 行渲染歌词/音频块（只读同步显示）。

### E. 14-playback.js（播放调度）
- startPlaybackLoop（L325-488）tick 步进处：遍历 state.audioClips，tick===clip.tick 且 buffer 存在 → AudioEngine.playAudioClip(buffer, when=now+残差, offsetSec, gain*lane.volume, pan=lane 声像, layerKey='audio:'+laneId)。
- seekToTick/停止时经由现有 stopLayerAudio 清理（layerKey 前缀）。

### F. 片段模式特殊轨道（03-segment-model.js + 05-segments.js）
- segmentEnsureLanes（03 L27-457）：末尾为每条 lyricLane 追加 {id, muted, solo:false, volume:100, height:48, special:{kind:'lyric', laneId:lane.id}}；audioLane 同理 {kind:'audio'}。已存在 special lane 不重复追加。
- segmentCaptureFromSong（05 L133-266）：special lane 不产 notes。
- segmentCompose（05 L270-441）：跳过 special lane（其内容由渲染层直接从 state.lyrics/state.audioClips 读取）。
- segmentAddLane/合并/裁剪/分割入口：若 lane.special → 短路禁止（提示 toast/直接 return）。
- _renderSegmentEditor 轨道背景循环（L1859-1868）：special lane 行绘制歌词块（米黄）或音频块（青蓝，含波形示意），数据源 state.lyrics/state.audioClips 过滤 laneId；只读显示 +「同步」角标。
- 侧栏 renderSegmentSidePanel（05 L1069-1110）：special lane 显示锁定样式（🔒 + 类型名），禁止删除/合并按钮。

### G. 09-piano-roll.js（回调注册 L130-328）
- onAddTrackMenu 回调：弹 DOM 菜单（WebNBSPositionFlyout 定位）：
  - 「NBS 音轨」→ 原有 onAddTrack 逻辑
  - 「歌词轨道」→ 原有 onAddLyricLane 逻辑
  - 「音频轨道」→ 触发隐藏 file input（accept="audio/*"）→ importAudioFile

### H. i18n（src/static/js/i18n.js）
- 新 key（9 语言）：'添加'、'NBS 音轨'、'歌词轨道'、'音频轨道'、'导入音频文件'、'分割音频'、'删除音频块'、'音频增益'、'音频'、'音频轨道缺失音频' 等涉及的条目。

### I. index.html
- 在 21-lyrics.js 之后注册 modules/22-audio.js（含构建产物同步——构建脚本自动合并，仅需确认 src 与 dist 一致）。

## 明确不改
- NBS 轨道本身、歌词块既有交互、片段模式普通 lane 逻辑。
- .nbs 导入导出格式（音频轨道只随工程元数据持久化）。

## 验证（a10）
1. `npm run build` 通过。
2. 无头浏览器（playwright-core + Edge，Temp/nbw_audio_test.js，端口 8126，addInitScript webnbs_privacy_agreed='1'）：
   - 侧栏只有 1 个「+ 添加」按钮，点击弹出 3 项菜单；
   - 选「NBS 音轨」→ trackCount+1；选「歌词轨道」→ lyricLanes+1；选「音频轨道」→ 弹文件选择（用页面内程序生成 wav 并 setInputFiles 模拟导入）→ audioLanes+1 且画布出现音频块；
   - 音频块拖动移动、右键菜单分割为两块、dur 调整；
   - 切换片段模式 → 每条 lyric/audio lane 各独占一条特殊片段轨道，侧栏显示锁定样式；歌词/音频块只读同步显示；
   - 特殊 lane 合并/裁剪入口被禁止；
   - 播放时音频 clip 被调度（mock AudioBuffer 计数或状态标记）。
3. 回归：原添加音轨/歌词轨道功能、歌词块编辑、片段模式普通操作。

## 待确认（已按摘要默认拍板，可改）
- 音频块颜色定为青蓝系（区别歌词米黄）。
- 「添加」按钮菜单含 3 项；音频轨道菜单项点击后立即打开文件选择。
