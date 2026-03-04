# openclaw-src

## 1. 概述

`openclaw-src` 是基于 OpenClaw 的实用增强版，目标是让日常使用更顺手：会话管理更高效、thinking 状态更透明、异常恢复更可靠。

当前分支 `feat/quick-tools-v1-p1p2` 在原有增强基础上，继续聚焦输入区体验、`@` 文件选择、工具入口交互与移动端一致性优化。

![Control UI 新特性预览 1](show1.png)

## 2. 本分支相对 `main` 的用户可感知更新

### 2.1 输入框体验升级（更清爽、默认更紧凑）

- 输入区视觉升级为更圆润、干净的卡片风格
- 默认高度更紧凑，多行输入时自动扩展
- 默认提示文案已移除，输入框保持空白

### 2.2 `@` 文件选择（最小可用）

- 在输入框输入 `@` 时，立即拉起文件候选选择框
- 支持继续输入路径（如 `@/root/`），候选实时刷新
- 选择候选后自动替换到输入内容
- 支持 `Esc` 快速关闭候选框

### 2.3 工具入口交互整理

- `工具`（wrench）按钮用于弹出 quick tools 菜单
- `+` 按钮当前为占位入口，点击显示内联 `Coming soon`（非弹窗，不打断输入）

### 2.4 移动端体验一致性

- 工具菜单定位与边界处理优化，减少遮挡与截断
- 移动端按钮布局更紧凑，图标优先，单手操作更稳定

### 2.5 稳定性与验证

- 补充 `@` 触发、路径刷新、选择替换、`Esc` 关闭等测试
- 保持发送、Refine、会话等主流程行为不变

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

- 当前开发分支：`feat/quick-tools-v1-p1p2`
- 建议在该分支完成验收后再合并到 `main`
