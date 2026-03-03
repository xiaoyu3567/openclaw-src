# openclaw-src

## 1. 概述

`openclaw-src` 是基于 OpenClaw 的实用增强版，目标是让日常使用更顺手：会话管理更高效、thinking 状态更透明、异常恢复更可靠。

当前分支 `chore/risk-hardening-p0` 在原有增强基础上，继续补齐了 Prompt Refine 工作流、移动端交互细节和测试闭环。

![Control UI 新特性预览 1](show1.png)

## 2. 本分支相对 `main` 的实际改动

### 2.1 Session 控制交互（UI）

- 顶部会话控制支持创建（`+`）、删除（trash）、刷新
- 创建支持完整 key / 短后缀 / 随机后缀
- 删除支持序号、完整 key、尾部匹配
- Chat 下拉显示 all sessions（不再 recent-only）
- 原先依赖浏览器 `prompt/confirm/alert` 的流程改为内置对话框，移动端更稳定

### 2.2 Prompt Refine（新增）

- 在输入区新增 `Refine` 按钮（位于 `Send` 左侧）
- 行为：基于当前 session 上下文 + 当前输入优化 prompt，仅回填输入框，不自动发送
- 状态流程：`1/3 Testing API -> 2/3 Organizing history -> 3/3 Optimizing prompt`
- 超时保护：20s watchdog
- 异常提示：timeout / gateway / model error / empty output
- 无明显变化时提示：`Refine completed: no significant changes.`
- thinking 中的交互切换：隐藏 `Refine`，显示 `Stop`

### 2.3 移动端体验（本轮重点）

- `Refine` icon-only（`✨`），正方形，和 `Send` 同高，同一行
- `Stop` 与 `Refine` 保持同规格按钮反馈
- `Send` 自适应填充剩余宽度
- refine loading 改为输入框底部短状态条，减少遮挡

### 2.4 Gateway 能力补齐

- 新增 `prompt.refine` 方法注册与 scope 接入
- 统一通过 gateway 路径处理 refine 请求

### 2.5 测试与可维护性

- 新增 `app-chat` refine 逻辑测试（success / timeout / error / no significant changes）
- 补充 chat 视图测试（thinking 时 Refine/Stop 切换、快捷键行为）
- UI 测试环境补齐 `jsdom`

### 2.6 安装脚本行为修正

- 一键安装脚本写入：`update.checkOnStart = false`
- 目标：减少顶部 Update available 提示干扰

## 3. 核心特性总览（当前分支）

- 会话管理增强（Control UI）
- 每会话 Thinking + Liveness 自愈
  - 持久化 `thinkingStartedAt`、`thinkingRunId`
  - 顶部状态支持 `idle / thinking / suspect / stalled`
  - stalled/timeout 自动回收，gateway 重启后清理 orphan marker
- 输入体验优化
  - `Enter` 换行，`Ctrl/Cmd+Enter` 发送
  - `Ctrl/Cmd+Shift+Enter` 触发 Refine
- Usage 页面优化
  - Provider 用量卡片、多 Provider 配置
  - 今日/累计默认折叠，支持原始 JSON 排障
- 移动端可用性与一致性修复

## 4. 一键部署

直接运行：

> 注意：安装脚本会先卸载当前 OpenClaw 再安装固定版本，用于降低环境漂移带来的问题。

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.sh | bash
```

运行时会提示输入：

- `sub2api baseUrl`（`https://jp.code.respyun.com/v1`，回车默认）
- `sub2api apiKey`（可见输入）

### Windows（仍建议先小范围验证）

```powershell
iwr -useb https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.ps1 | iex
```

安装脚本会自动完成：

1. 检查基础依赖
2. 输入 `sub2api baseUrl/apiKey`（baseUrl 默认 `https://jp.code.respyun.com/v1`）
3. 卸载当前已安装 OpenClaw 并重装固定版本
4. 自动修改 `~/.openclaw/openclaw.json`（模型与默认 agent）
5. 自动写入 `~/.openclaw/settings/usage-providers.json`
6. 写入 `update.checkOnStart=false`
7. 拉取或复用 `~/.openclaw/workspace/openclaw-src`，安装依赖并执行部署助手
8. 校验 gateway 安装/启动/状态与 HTTP 连通性
9. 执行 `openclaw dashboard`

## 5. 分支说明

- 推荐开发分支：`chore/risk-hardening-p0`
- 建议在该分支完成验证后再发 PR 合并到 `main`
