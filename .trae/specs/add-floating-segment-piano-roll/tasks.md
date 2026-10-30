# Tasks

- [x] Task 0: 建立行为基线
  - [x] 0.1 用构造数据（4 轨 × 64 tick）跑真实 `runSegSplit()`，记录轨道数/片段数/音符数，确认零丢失（64 → 8 片段 64 音符）
  - [x] 0.2 用 Edge + puppeteer-core 记录关键交互：页面加载无 pageerror、`WebNBS.init` 执行完成、片段模式进入/退出、分割弹窗、i18n 切换
  - [x] 0.3 基线数值写入冒烟脚本输出，作为拆分后对比标准

- [x] Task 1: 片段分割弹窗精简
  - [x] 1.1 删除 `.seg-split-hint` 与 `.seg-split-note` 两段长说明，替换为单条警告「对 NBS 数据处理可能效果很差」
  - [x] 1.2 精简选项文案：复选框改为短语，颗粒度选项改为「小（1 小节）/中（2 小节）/大（4 小节）」
  - [x] 1.3 调整弹窗内边距与字号层级，保证警告条视觉权重低于主选项

- [x] Task 2: 合并轨道默认关闭
  - [x] 2.1 `#seg-split-merge-tracks` 移除 `checked`
  - [x] 2.2 `runSegSplit()` 读取默认值改为 `false`（元素缺失时也不合并）
  - [x] 2.3 验证勾选后仍按原签名规则合并

- [x] Task 3: 弹窗文案接入 i18n
  - [x] 3.1 弹窗所有中文源串补入 `i18n.js` 的 `UI_TEXT`（en-US 必填，其余语言缺省回退英文）
  - [x] 3.2 验证非中文语言下弹窗无中文残留，且切换语言即时生效

- [x] Task 4: 浮动窗口基础设施
  - [x] 4.1 新增窗口容器与最小化标题栏的 HTML/CSS（Fluent 风格、阴影层级、`z-index` 高于片段工具栏且低于系统弹窗）
  - [x] 4.2 实现窗口管理器：按轨道 id 建窗/复用、置顶、关闭、多窗口
  - [x] 4.3 实现标题栏拖动、八向缩放、最小尺寸限制、视口边界约束
  - [x] 4.4 实现最小化（右上角堆叠、可拖动离开、不覆盖已有标题栏）与最大化/还原（双击标题栏）
  - [x] 4.5 实现按轨道持久化（位置/尺寸/最大化/最小化，localStorage 单一键）
  - [x] 4.6 双击片段改为调用窗口管理器，替换原「退出片段模式 + seek」回调

- [x] Task 5: 窗口内钢琴卷帘渲染
  - [x] 5.1 复用 `piano_roll.js` 的颜色/坐标/网格能力，建立窗口独立画布与视口状态
  - [x] 5.2 渲染 Y 音高标尺、X 时间标尺、小节网格、播放头
  - [x] 5.3 实现延音识别：同层同音高逐 tick 连续音符合并为长音符矩形
  - [x] 5.4 音符内图标与文字只排布在起始端
  - [x] 5.5 实现缩放（Ctrl+滚轮）与水平/垂直滚动，滚动条或拖拽平移
  - [x] 5.6 重叠音符叠层绘制：错位保证每个图标 ≥1/2 可见，颜色取最上层
  - [x] 5.7 重叠数量变化时图标位置平滑动画过渡

- [x] Task 6: 窗口内编辑交互
  - [x] 6.1 命中测试：区分音符主体、右边缘（改长度）、左边缘（移动）、空白网格
  - [x] 6.2 绘制与删除（画笔/橡皮擦/右键删除），实时写回并 `pushUndo()`
  - [x] 6.3 拖动移动（时间 + 音高，吸附网格）
  - [x] 6.4 拖右边缘改长度：按 tick 增删连续音符，与相邻同音合并/拆分
  - [x] 6.5 框选多选、批量移动/删除
  - [x] 6.6 复制/粘贴/重复（窗口内剪贴板，相对偏移 + 吸附）
  - [x] 6.7 网格档位切换（1 tick / 8 tick / 16 tick）
  - [x] 6.8 选择规则：默认最上层；Alt+悬浮+滚轮临时切换；移出 1 秒恢复；点击聚焦置顶（仅影响显示顺序）
  - [x] 6.9 底部力度控制器：竖条拖动与数值输入，绑定选中音符
  - [x] 6.10 撤销/重做在窗口内生效并与主视图同步

- [x] Task 7: 播放同步与参考片段
  - [x] 7.1 左上角开关滑块：同步主播放头（默认）/ 仅播放本窗口内容（片段内循环）
  - [x] 7.2 播放头按 tick 同步绘制；局部播放不干扰主界面状态
  - [x] 7.3 窗口菜单选择同轨参考片段，半透明不可编辑绘制，可取消

- [x] Task 8: 窗口 i18n
  - [x] 8.1 新增全部中文源串进词典
  - [x] 8.2 canvas 内文字（音名、力度、提示）监听 `webnbs:languagechange` 重绘
  - [x] 8.3 验证窗口打开状态下切换语言即时生效

- [x] Task 9: 重构准备：共享内核提取
  - [x] 9.1 建立 `window.WebNBS` 命名空间：暴露 `state`、`$`/`$setText`/`$setValue`、`i18nText`、`showToast`、`pushUndo`/`restoreSnapshot`、`markDirty`、`segmentSync` 等共享 API
  - [x] 9.2 main.js 改为「内核 + 内联实现」过渡态，所有现有函数保持原语义
  - [x] 9.3 跑 Task 0 基线，确认数值不变

- [x] Task 10: 全量功能拆分（按原文件行区间连续切分，共 35 个模块）
  - [x] 10.1 `modules/00-core.js` 全局状态、DOM/i18n 工具、飞窗定位、音名与键盘映射常量
  - [x] 10.2 `modules/01-dialogs.js` 应用弹窗、导出/音频导出对话框
  - [x] 10.3 `modules/02-history.js` 快照、撤销重做、`rebuildFromNotes`
  - [x] 10.4 `modules/03-segment-model.js` / `04-segment-split.js` / `05-segments.js` 片段模型、分割弹窗、片段数据与 UI
  - [x] 10.5 `modules/06-notes-index.js` / `07-tabs.js` 音符索引、多文件标签页
  - [x] 10.6 `modules/08-app-init.js` 主装配 `init()`；`09-piano-roll.js` 钢琴卷帘接入
  - [x] 10.7 `modules/10-assist.js` / `11-find.js` 创作助手、查找替换
  - [x] 10.8 `modules/12-keyboard.js` / `13-clipboard.js` / `14-playback.js` 键盘钢琴与演奏、剪贴板、播放控制
  - [x] 10.9 `modules/15-tracks.js` / `16-custom-inst.js` / `17-instrument-ui.js` 轨道、自定义音色、乐器选择器
  - [x] 10.10 `modules/18-toast.js` / `19-soundfont.js` / `20-mobile.js` Toast、音色库按需加载、移动端 UI
  - [x] 10.11 `modules/21-lyrics.js` / `22-segment-ui.js` 歌词、片段工具栏与上下文菜单
  - [x] 10.12 `modules/23-json-io.js` / `24-features-a.js` / `25-features-b.js` JSON 导入导出、压缩/延音/音域等处理
  - [x] 10.13 `modules/26-piano-keyboard.js` … `30-timbre.js` 钢琴键盘 DOM、文件 IO、MIDI 弹窗与音色拟合
  - [x] 10.14 `modules/31-midi-config.js` … `34-autosave.js` MIDI 配置、本地存储、导出、自动保存与欢迎页
  - [x] 10.15 `main.js` 收敛为装配入口（仅 `DOMContentLoaded` → `WebNBS.init.call(document)`）
  - [x] 10.16 更新 `index.html` 脚本引用（35 个模块按序 + main.js），`build_local.js` 整目录复制无需改清单

- [x] Task 11: 回归与构建
  - [x] 11.1 片段分割回归：构造数据 64 音符 → 5 轨 8 片段，音符零丢失，合并轨道默认关闭
  - [x] 11.2 无头浏览器端到端：加载无 pageerror → 片段模式 → 浮动窗口开窗/绘制/擦除/撤销/框选/力度/播放模式/关闭 → 分割 → 退出
  - [x] 11.3 多语言切换冒烟（zh-CN ↔ en-US，标题与按钮提示往返正确）
  - [x] 11.4 全部脚本 `node --check` 通过；`npm run build` 生成 `blbl-toy/`，`file://` 离线打开可用且包含 35 个模块
  - [x] 11.5 `src/index.html` 版本号统一为 `20261030c`

- [x] Task 12: 拆分缺陷修复与加固（用户反馈「快捷键失效 / 闪烁 / UI 失效」后排查）
  - [x] 12.1 `34-autosave.js` 删除重复的 `DOMContentLoaded` 注册，并为 `init()` 增加幂等保护（根因：init 执行两次 → 双渲染循环与双份事件绑定）
  - [x] 12.2 `segment_piano_window.js` 的 `roundRect` 收敛为最小正尺寸与非负圆角（缩放 < 1px/tick 时 `arcTo` 抛 `IndexSizeError` 中断整帧）
  - [x] 12.3 名字提取改为行正则扫描，修复「行尾注释使多个 `var` 被合并成单元」导致的定义名漏采（`MC_MIDI_MAX` / `_midiPrefsByHash` / `showTaskProgress` 等）
  - [x] 12.4 依赖分析不再排除局部变量，修复 `formatError` 等真实引用被误判为局部而未注入
  - [x] 12.5 `window.X = X;` 别名导出行不再计为模块定义，修复 `02-history` 加载即抛 `showAppAlert is not defined` 并连锁导致 `deepCloneNotes` 未导出
  - [x] 12.6 构造函数跨模块处理：扩展 `prototype` 的模块用真实引用，仅 `new` 的模块用惰性构造转发，修复 MIDI 弹窗 `this._computeRange is not a function`
  - [x] 12.7 回归：HTTP 与 `file://` 均 init=1、无 pageerror；MIDI 导入弹窗正常解析；13k 音符大文件片段窗口可绘制；45 步压力测试无失败且 DOM 无增长

# Task Dependencies

- Task 0 先于所有任务
- Task 3 依赖 Task 1（文案定稿后再翻译）
- Task 4 依赖 Task 0；Task 5 依赖 Task 4
- Task 6 依赖 Task 5；Task 7、Task 8 依赖 Task 5
- Task 9 依赖 Task 0 与 Task 4–8（新功能先落地再重构，避免重构中途兼容两套结构）
- Task 10 依赖 Task 9，且 10.x 各子任务串行执行（每步都基于上一步的迁移结果）
- Task 11 依赖 Task 10 全部完成
