# openclaw-src

# 🛡️ OpenClaw-Src: 彻底治好你的 AI 交互阳痿

> **老哥带路：**
> 这个 **openclaw-src** 是老子魔改的“实用增强版”。目标就三个：**会话更顺、状态更透明、断线能自愈**。

![show1](assets/show1.png)


---

## 🧠 核心黑科技（这才是真正的猛料）

* **会话自愈 (Thinking + Liveness)：**
  * 给每个会话都装了“监控”，持久化记录思考状态。
  * 顶部状态栏直接告诉你 AI 在干嘛：是 `idle`（闲着）、`thinking`（在想）、还是 `suspect/stalled`（卡死/疑死）。
  * **自动回收：** 卡死了或者超时了？它会自己清理门户，重启后自动打扫战场，不留孤儿进程。
* **操作快捷键：**
  * `Enter` 换行，`Ctrl/Cmd+Enter` 发送。
  * `Ctrl/Cmd+Shift+Enter` 直接触发 
  * **Refine**，老哥们都懂，这才是高阶玩法。
* **Usage 页面优化：** 账单要看得明白。Provider 用量卡片化，支持 JSON 原始数据排障，谁偷了你的 Token 一眼便知。

---

## 🔥 最近的“赛博手术”更新日志

别问，问就是为了让你用得更爽。这次我们把手伸向了 UI 和交互：

### 1. 输入框终于像个人用的了
* **颜值即正义：** 别再看那个土得掉渣的输入框了，现在是圆润干净的**卡片风格**。
* **自动变长：** 默认高度极度紧凑，不占地儿；你字打得多，它自己会**自动变长**，懂事得让人心疼。
* **极简主义：** 废话提示全删了，输入框干干净净，看着就想撸代码。

### 2. `@` 一下，文件自来
* **呼之即来：** 输入框打个 `@`，文件选择框瞬间弹出，不用你满硬盘去找。
* **路径补全：** 支持直接搜路径（比如 `@/root/`），候选列表实时刷新，手速多快它就多快。
* **一键替换：** 选完自动填好，`Esc` 还能一键关闭，丝滑得像抹了黄油。

### 3. 移动端不再是“残废”
* **AI 撸 AI：** 优化了菜单边界，不会再被屏幕遮挡。按钮布局更紧凑，图标优先，你在地铁上单手也能操作。

---

## 🚀 别废话，一键上车

> **老哥警告：** 脚本会先卸载原版 OpenClaw 再重装这个增强版，主要是为了防止环境漂移，别到时问我为啥之前的东西没了。

### MacOS / Ubuntu (一把梭)
```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.sh | bash

```

### Windows (什么狗屁玩意，现在还在改)

```powershell
iwr -useb https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/main/scripts/install-custom.ps1 | iex

```

**安装过程会问你：**

1. **baseUrl:** 默认 `https://jp.code.respyun.com/v1`，直接回车就行。
2. **apiKey:** 填你自己的，别发在群里。

安装完它会自动帮你改好 `openclaw.json`，配置好模型，顺便把 `update.checkOnStart` 关了，省得它瞎升级把魔改版冲了。

---

**“代码就在这，命是你自己的。点个 Star，证明你来过。”**