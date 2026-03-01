# openclaw-src（基于 OpenClaw 的定制版本）

本仓库基于 OpenClaw 进行定制，目标是提升日常使用中的会话管理效率、输入体验和可观测性。

## 功能改进（相对 OpenClaw）

- 会话管理增强（Control UI）
  - 顶部增加会话创建（`+`）、删除（trash）、刷新按钮。
  - 创建支持完整 key、短后缀（`agent:main:xxx`）、随机后缀，并自动切换到新会话。
  - 删除支持按序号、完整 key、短尾 key 匹配。
  - 删除失败不再静默，统一显示明确错误信息。
  - Chat 会话下拉框改为显示 all sessions（不再仅展示 recent-only 会话）。
  - 侧边栏点击 Chat 时默认保留当前会话；仅在当前会话不存在时回退到 main。

- 输入体验优化
  - `Enter` 改为换行。
  - `Ctrl/Cmd+Enter` 才发送消息。
  - 移除输入框内 `New session` 按钮，减少误触。

- 后端每会话思考计时（per-session）
  - 新增持久化字段：`thinkingStartedAt`、`thinkingRunId`。
  - `sessions.list` 返回会话思考状态。
  - 顶部状态显示 `idle` 或 `thinking: HH:MM:SS`。
  - 切会话、刷新页面后计时状态可延续。

- 移动端 UI 修正
  - 修复移动端聊天控制区可见性与可操作性问题。
  - 优化头部与控制区换行布局。
  - 压缩移动端间距与内边距，提升可读性与操作密度。

- Provider 余量/用量面板
  - 在 Usage 页增加 Provider 用量卡片。
  - 支持多 Provider 配置（名称、Base URL、API Key、刷新间隔、超时）。
  - 展示余量、周期用量、RPM/TPM、延迟、最后刷新时间。
  - 默认折叠“今日用量”“累计用量”详情，减少首屏信息噪音。
  - 支持展开原始 JSON 便于排障。
  - 新增跨浏览器配置同步 MVP：
    - Provider 配置持久化到 Gateway：`~/.openclaw/settings/usage-providers.json`（权限 `600`）。
    - 新增 RPC：`usage.provider.config.list`、`usage.provider.config.upsert`、`usage.provider.config.delete`。
    - 首次进入 Usage 页时，若服务端为空且本地有旧配置，自动执行一次 localStorage → Gateway 迁移。
    - 同步刷新策略：进入 Usage 页、窗口 focus、每 30 秒轮询拉取配置。

## 部署（macOS）

### 1) 安装 OpenClaw

```bash
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com
```

### 2) 初始化配置

```bash
openclaw onboard --install-daemon
```

### 3) 拉取源码并构建 UI

```bash
cd ~/.openclaw/workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd openclaw-src
pnpm install
pnpm ui:build
```

### 4) 验证与覆盖 UI 产物

```bash
which openclaw
openclaw gateway status

# 只覆盖 web UI 产物，不动整个 dist
rsync -a --delete dist/control-ui/ /opt/homebrew/lib/node_modules/openclaw/dist/control-ui/

openclaw gateway restart
openclaw gateway status
```

## 部署（Windows，PowerShell）

### 1) 安装 OpenClaw

```powershell
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com
```

### 2) 初始化配置

```powershell
openclaw onboard --install-daemon
```

### 3) 拉取源码并构建 UI

```powershell
cd $HOME\.openclaw\workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd .\openclaw-src
pnpm install
pnpm ui:build
```

### 4) 验证与覆盖 UI 产物

```powershell
where openclaw
openclaw gateway status

# 只覆盖 web UI 产物，不动整个 dist
$openclawRoot = Join-Path $env:APPDATA "npm\node_modules\openclaw\dist\control-ui"
robocopy ".\dist\control-ui" $openclawRoot /MIR

openclaw gateway restart
openclaw gateway status
```

## 说明

- 本 README 聚焦“功能差异”和“部署步骤”，不展开通用 OpenClaw 文档内容。
- 如需回溯定制细节，请查看对应 commit 历史与 `ui/src/ui`、`src/gateway` 下变更。
