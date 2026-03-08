# openclaw-src

## 1. 概述

老哥一句话版：这个 `openclaw-src` 不是拿来摆拍的，就是奔着一个目标去的——**把 OpenClaw 里那些“能用但别扭”的地方狠狠干顺**。

这套东西现在主打就两个字：**顺手、稳当**。

最近这一波主要补的是这些：

- 聊天里提到本地生成的图片文件，比如 `world-map.png:1`，现在 Web UI 里能直接预览，不用你再去文件管理器里翻半天。
- Chat 输入区补了 `+` 上传，文件传完就直接进当前聊天流，少走弯路。
- Files 这一块不是小修小补，而是狠狠干了一轮：
  - 文件夹点整行直接进，不用再点一次 `open`
  - 桌面端单击文件，右侧直接出内容/详情
  - 长按 / 右键菜单统一管 `预览 / 下载 / 删除`
  - 文本、Markdown、图片都能看，代码还有语法高亮
  - 文本和 Markdown 现在还能直接在线编辑，`Edit / Save / Discard` 都接好了
- Quick Tools 这块也顺手收拾过，摘要 / TODO 走统一 RPC 路径，逻辑更稳，少点抽风。
- 安装和部署脚本也补了稳定性，尤其是 gateway 启动、探活、时序校验这些坑，现在不至于一言不合自己把自己判死刑。

如果你平时就是拿 OpenClaw 做聊天、跑工具、看文件、生成图、顺手改点东西，那这版就是给你这种“真正在干活的人”准备的，不是 PPT 工程。

![show1](show1.png)

---

## 2. 核心特性

### 聊天这块，终于像个能打的工具了

- **本地图片内联预览**：assistant 回复里只要提到工作区里的图片路径，比如 `hanfu-beauty.png:1`、`world-map.png:1`，Control UI 会直接把图渲染出来，不再只给你一个文件名自己脑补。
- **上传文件更顺手**：输入框旁边的 `+` 可以直接传文件，上传后自动接进当前聊天，不用绕路。
- **Quick Tools 更利索**：摘要、TODO 这些快捷能力底层统一到同一条 RPC 路径，逻辑更干净；长内容处理也比之前稳，少一点“看起来能用，实际全靠运气”的味道。

### 文件区不再是摆设

- **文件夹整行直达**：现在点文件夹整行就直接进去，`Open` 这种多余按钮已经下岗，不再搞二次点击这种老年操作。
- **桌面端更像正经文件系统**：桌面端单击文件后，右侧直接出当前文件内容或文件详情；支持预览的文件，内容在上、信息在下；不支持预览的文件，也会老老实实把大小、类型、路径这些信息摆出来。
- **文件操作统一进菜单**：文件行不再挂一堆零碎按钮；长按（移动端）或右键（桌面端）直接弹菜单，统一放 `预览 / 下载 / 删除`，逻辑干净很多。
- **预览能力明显增强**：文本、Markdown、图片都已打通；代码文件带语法高亮；图片支持 `Fit / 100%` 和背景切换；Markdown 还能切 `Render / Source`。
- **在线编辑已经接上**：文本和 Markdown 文件现在可以直接 `Edit / Save / Discard`，不用为了改个小配置反复切回 shell。
- **目录状态和操作链更稳**：你上次看到哪、点到哪，刷新后还能接着来；桌面端左右两栏也都能独立滚动，不再出现“看着挺大，结果底下半截内容死活看不见”的抽象场面。

### 部署不是玄学了

- **安装 / 部署探活更稳**：gateway 还没完全起来时，不会过早因为 RPC probe 失败直接判死刑。
- **Linux 系统目录写入更稳**：部署到系统 `dist` 时补了更靠谱的写法，少踩权限坑。
- **脚本拉取更抗缓存**：安装脚本补了 cache-buster，避免你明明改了远端却还在跑旧脚本。

### 适合谁用

- 你天天开着 OpenClaw 干活，嫌原版某些交互不够顺。
- 你经常生成图片、读写文件、切会话，想少点机械操作。
- 你希望“一键部署”不是嘴上说说，而是真的能落地。

说白了，这个仓库不是搞概念，是奔着一句话去的：

> **能少折腾你一次，就少折腾你一次。**

---

## 3. 一键部署

先把最重要的话摆前面：

> **这个安装脚本会先卸载你当前的 OpenClaw，再装指定版本。**
> 不是我手欠，是为了避免环境漂移、版本串味、脚本看着像跑完了，结果实际一堆状态半死不活。

### macOS / Linux

直接跑：

```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.sh | bash
```

如果你只想上 UI，不想动 full 流程：

```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.sh | bash -s -- --scope ui
```

### Windows（PowerShell）

先把前置环境整明白，不然后面各种报错看着就烦：

1. 安装 Git：`https://git-scm.com/download/win`
   - 安装时记得勾上 **Add Git to PATH**
2. 安装 Node.js 22+：`https://registry.npmmirror.com/binary.html?path=node/`
3. 打开 PowerShell 执行：

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

然后再跑：

```powershell
iwr -useb https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.ps1 | iex
```

如果你只想部署 UI：

```powershell
$tmp = Join-Path $env:TEMP "install-custom.ps1"
iwr -useb https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.ps1 -OutFile $tmp
powershell -ExecutionPolicy Bypass -File $tmp -Scope ui
```

### 安装时会发生什么

脚本现在基本就是“少废话，按顺序狠狠干”：

1. 检查基础依赖
2. 让你输入 `sub2api baseUrl` 和 `apiKey`
   - `baseUrl` 默认是 `https://jp.code.respyun.com/v1`
3. 强制卸载旧 OpenClaw
4. 安装指定版本 OpenClaw
5. 自动写好 `~/.openclaw/openclaw.json` 和相关 provider 配置
6. 拉取或复用 `~/.openclaw/workspace/openclaw-src`
7. 安装依赖并执行部署
8. 按顺序检查 gateway：安装、启动、状态、HTTP 就绪
9. 最后打开 `openclaw dashboard`

### 这版更适合怎么用

推荐你这么理解：

- 想省事：直接一键安装。
- 想稳：改完就走脚本，不要自己东拼西凑半套命令。
- 想看图：聊天里直接引用本地图片路径，让 UI 帮你预览。
- 想改文件：直接在 Files 里看、改、存，不要来回切窗口把自己绕晕。

就这样，没什么玄乎的。

你要的是一个**能干活、少犯病、UI 顺手**的 OpenClaw，这个仓库现在就是往这条路上狠狠干的。
