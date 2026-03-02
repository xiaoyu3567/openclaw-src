# openclaw-src

一个面向真实生产使用场景的 OpenClaw 定制版。

> 目标很直接：会话管理更顺手、思考状态更透明、异常恢复更可靠。

## 为什么做这个版本？

这个仓库保留了 OpenClaw 的核心能力，同时重点优化了日常高频痛点：

- 多会话切换与管理效率
- Agent thinking 状态可观测性
- gateway 重启/任务卡住后的自愈能力
- Usage 页面与移动端交互体验

## 核心特性（Highlights）

### 1）会话管理增强（Control UI）

- 顶部统一提供：创建（`+`）、删除（trash）、刷新。
- 创建会话支持：
  - 完整 key
  - 短后缀（自动补全为 `agent:main:xxx`）
  - 随机后缀
- 删除会话支持：
  - 按序号
  - 按完整 key
  - 按 key 尾部匹配
- Chat 下拉框显示 all sessions（不再仅 recent-only）。
- 从侧边栏回到 Chat 时，优先保留当前会话上下文。

### 2）每会话 Thinking + Liveness 自愈

- 每个会话持久化 thinking 信息：
  - `thinkingStartedAt`
  - `thinkingRunId`
- 顶部 thinking 状态升级为四态：
  - `idle`
  - `thinking`
  - `suspect`（疑似无进展）
  - `stalled`（已停滞/恢复中）
- 引入 progress-based liveness 判定，用于区分“长任务”与“无响应”。
- maintenance 自动回收 stalled/timeout run，减少僵尸 thinking。
- gateway 启动后会做 orphan marker reconcile，避免“计时永远不结束”。

### 3）输入体验优化

- `Enter` 换行。
- `Ctrl/Cmd + Enter` 发送。
- 移除输入框内 `New session` 按钮，降低误触率。

### 4）Usage 页优化

- 新增 Provider 用量卡片，支持多 Provider 配置。
- 展示余额/周期用量、RPM/TPM、延迟、刷新时间。
- “今日用量 / 累计用量”默认折叠，首屏更清爽。
- 支持展开原始 JSON，便于排障和对账。

### 5）移动端可用性修复

- 修复聊天控制区的可见性和可操作性。
- 优化头部与控制区换行布局。
- 缩减间距和内边距，提高信息密度与可读性。

## 一键部署助手（新手推荐）

仓库已内置菜单式部署助手，默认提供：一键部署、仅更新 UI、完整升级、回滚、健康检查。

### macOS / Linux

```bash
cd openclaw-src
./scripts/deploy.sh
```

### Windows（PowerShell）

```powershell
cd .\openclaw-src
.\scripts\deploy.ps1
```

可选非交互模式示例：

```bash
node scripts/deploy-assistant.mjs --action deploy-ui --yes
node scripts/deploy-assistant.mjs --action health
```

## 快速部署

### macOS

```bash
# 1) 安装 OpenClaw
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com

# 2) 初始化
openclaw onboard --install-daemon

# 3) 拉取源码并构建 UI
cd ~/.openclaw/workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd openclaw-src
pnpm install
pnpm ui:build

# 4) 覆盖 web UI 产物并重启 gateway
rsync -a --delete dist/control-ui/ /opt/homebrew/lib/node_modules/openclaw/dist/control-ui/
openclaw gateway restart
openclaw gateway status
```

### Windows（PowerShell）

```powershell
# 1) 安装 OpenClaw
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com

# 2) 初始化
openclaw onboard --install-daemon

# 3) 拉取源码并构建 UI
cd $HOME\.openclaw\workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd .\openclaw-src
pnpm install
pnpm ui:build

# 4) 覆盖 web UI 产物并重启 gateway
$openclawRoot = Join-Path $env:APPDATA "npm\node_modules\openclaw\dist\control-ui"
robocopy ".\dist\control-ui" $openclawRoot /MIR
openclaw gateway restart
openclaw gateway status
```

## 升级后 30 秒自检

- 打开 Chat，确认 session 下拉能看到预期所有会话。
- 发送一条消息，确认顶部状态能正确在 `thinking/suspect/stalled/idle` 间变化。
- 重启一次 gateway，确认不会出现 thinking 卡死不回收。
- 打开 Usage，确认“今日/累计”默认折叠。

## 说明

- 本 README 侧重“使用价值”和“快速上手”。
- 底层实现细节请查看提交历史，以及 `src/gateway`、`ui/src/ui` 目录变更。
