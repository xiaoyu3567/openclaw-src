# openclaw-src

## 1. 概述

老哥一句话版：这个 `openclaw-src` 不是拿来搞花活的，是拿来**把 OpenClaw 日常真正在用的那几处痛点狠狠干平**的。

现在这套东西，重点就四个字：**更顺、更稳**。

最近这一波主要干了这些事：

- 聊天里提到本地生成的图片文件，比如 `world-map.png:1`，现在可以直接在 Web UI 里预览，不用你来回切文件管理器找图。
- Chat 输入区补上了 `+` 上传文件，上传后会自动带进消息流里，少一堆手搓步骤。
- Files tab 这一块也狠狠干了一轮：**文件夹点整行直接进，不再点个文件夹还得再戳一次 `open`**；文件操作统一收进长按 / 右键菜单，逻辑更顺，移动端也不别扭。
- 文件预览现在不是傻乎乎堆在页面最底下了，而是改成**画中画浮层**；文本、Markdown、图片都能直接看，常见代码文件还补了**语法高亮**，终于不像在盲盒里翻源码。
- Quick Tools 这块顺手收拾了一遍，摘要 / TODO 的流程更统一，底层走单一路径，少点玄学报错。
- 部署和安装脚本也补了稳定性，尤其是 gateway 启动和探活这块，不再一上来就自己把自己吓死。

如果你平时就是拿 OpenClaw 做聊天、跑工具、看文件、生成图、顺手再改点东西，那这版就是给你这种“真在干活的人”准备的，不是摆拍版。

![show1](show1.png)

---

## 2. 核心特性

### 聊天这块，终于像个能打的工具了

- **本地图片内联预览**：assistant 回复里只要提到工作区里的图片路径，比如 `hanfu-beauty.png:1`、`world-map.png:1`，Control UI 会直接把图渲染出来。
- **上传文件更顺手**：输入框旁边的 `+` 可以直接传文件，上传完自动接进当前聊天，不用绕路。
- **Quick Tools 更利索**：摘要、TODO 这些快捷能力底层改成统一 RPC 路径，逻辑更干净；最近还补了两阶段 map-reduce 流程，处理长内容更稳。

### 文件区不再是摆设

- **文件夹整行直达**：现在点文件夹整行就能直接进去，`Open` 按钮已经下岗，不再搞二次点击这种老年操作。
- **文件操作统一进菜单**：文件行默认不再挂个傻站着的 `download` 按钮；长按（移动端）或右键（桌面端）直接弹菜单，里面统一放 `预览 / 下载 / 删除`。
- **预览改成画中画浮层**：不再把预览怼在页面最下面，直接用浮层弹出来，边看边回列表，顺手多了。
- **常见文件能直接看**：文本、Markdown、图片都已打通；代码文件还补了**语法高亮**，至少不再一坨白字糊你脸上。
- **目录状态持久化**：你上次看到哪、点到哪，页面刷新后还能接着来，不会一夜回到解放前。

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
> 不是我手欠，是为了避免环境漂移、版本串味、脚本看着跑完了结果实际半死不活。

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

脚本现在基本是“少问废话，按顺序狠狠干”：

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

就这样，没什么玄乎的。

你要的是一个**能干活、少犯病、UI 顺手**的 OpenClaw，这个仓库现在就是往这条路上狠狠干的。
