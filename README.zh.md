# dsh-msg-time

[![npm](https://img.shields.io/npm/v/dsh-msg-time)](https://www.npmjs.com/package/dsh-msg-time)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**简体中文** · [English](./README.md)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的每一条用户消息**在发送的那一刻**加上时间头，让模型始终知道你这句话是什么时候发的。

```
[user_sent_at: 2026/10/17 14:41:44]
你可以得知现在的具体时间吗
```

> 时间在**你点发送的瞬间**采样 —— 不是渲染时刻，也不是模型读到的时刻。

---

## 模型能用它做什么

装上之后，模型不需要调用任何工具就能回答这类问题：

```
你：[user_sent_at: 2026/10/17 14:41:44]
    你可以得知现在的具体时间吗

模型：根据你这条消息的时间戳，现在是 2026年10月17日 14:41:44。
      由于你要求不使用工具，我无法联网或读取系统时钟来进一步核实。
```

```
你：[user_sent_at: 2026/10/17 14:42:58]
    我们聊天聊了多长时间了

模型：从你第一条消息 (14:41:44) 到现在 (14:42:58)，大约聊了 1分14秒。
      这是根据消息时间戳推算的；按你的要求，没有使用任何工具。
```

![演示：模型直接读取消息里的时间戳](https://raw.githubusercontent.com/duxinle/dsh-msg-time/main/assets/demo.png)

省下的是**一轮工具调用的往返**：以前问"现在几点"要跑一次 `Get-Date` / `date`，现在时间就在上下文里。

---

## 和其他时间插件的区别

| | dsh-msg-time | `dsh-time-context`（官方内置） | `dsh-time-prefix` |
|---|---|---|---|
| 粒度 | **每条消息** | 每轮（turn）一个锚点 | 每条消息 |
| 时间在哪 | **消息正文里** | 独立的合成消息 | 消息正文前缀 |
| 采样时刻 | **点发送的瞬间** | 准备该步时 | 准备该步时 |
| 轮内多条消息 | 各自独立时间 | 同轮共用锚点，且有 10 分钟节流 | 同批次共用一个时间 |
| 精度 | 秒 | 秒 | 分钟 |
| 实现位置 | 客户端 | 宿主 | 宿主 |

> 如果你要的是"模型知道大概现在几点"，官方内置的 `dsh-time-context` 已经够用，不必装这个。
> 这个插件解决的是更窄的问题：**每条消息各自的、精确的发送时刻**。

---

## 安装

```sh
dsh plugin --profile desktop add dsh-msg-time
```

装完**完全退出应用再打开**（不是关窗口）。profile 的插件层和客户端模块图只在启动时构建。

> 桌面版和 Web 版通用 —— 它只依赖客户端 `conversation` 服务，不假设宿主平台。

---

## 行为规则

| 情况 | 行为 |
|---|---|
| 普通发送（回车 / 队列 / steer / 加速发送） | 打戳 |
| 斜杠命令（`/compact` 等） | **不打戳**，避免污染命令解析 |
| 只拖附件、不打字 | **不打戳**，否则会凭空插一条空消息 |
| 失败时 | 所有 patch 逻辑包在 `try/catch` 内，**绝不会阻断发送** |
| 重复安装/加载 | 幂等，不会套两层时间头 |

---

## 已知边界

- **精度到秒，用本机时钟。** 系统时间错了，戳就是错的 —— 它是"本机发送时刻"，不是可信时间源。
- **只有本地时间，没有时区偏移。** 现在输出 `2026/10/17 14:41:44`。需要跨时区的话自己改 `client.js` 的 `header()`，把 `getTimezoneOffset()` 拼上去。
- **时间头会写进会话存档。** 这是让模型看见的唯一方式 —— 任何不进 `content` 的做法模型都读不到。接受这个代价是因为时间头是纯增量信息，不改变原意。
- **依赖 `UiConversation#sendSession` 这个内部方法。** DSH 若重构它，插件会静默失效（控制台有 `never became patchable` 警告）。这是本插件最脆的地方，见下方「维护」。

---

## 原理

包住客户端唯一的下行收口函数：

```js
// @deepseek-ai/dsh-client-ui-conversation 的 UiConversation
sendSession(session, text, attachmentIds, mode, signal)
//                      ↑ 最终正文
```

调用链（逐层核对过源码）：

```
你按发送
  → SessionInputShell.sink()                     (lib/client.js:14333)
  → conversation.sendSession(session, text, …)   (lib/client.js:14334)
  → session.beginSubmission({ mode, text, … })   (lib/client.js:3413)
  → 提交给 host → 落盘为 user/message 事件 → 模型可见
```

所有常规发送路径都汇到这**一个**函数，因此包一次即全覆盖，不需要 DOM 监听或键盘拦截。

**为什么不用宿主侧 `agent/pre-step`？** 那条路同样可行（`dsh-time-prefix` 就是这么做的），但它是"模型开始处理时"采样，一轮里连发多条消息会共用一个时间；而且宿主侧要处理注入累积与节流。客户端方案更贴近"每条消息各自的发送时刻"这个需求，代价是多了一层客户端依赖。

---

## 卸载

```sh
dsh plugin --profile desktop remove dsh-msg-time
```

重启应用。卸载是干净的：插件只存在于插件层，不影响程序本体、不修改任何官方文件。

---

## 开发

```sh
npm test     # node --test，零依赖
```

测试用 `node:vm` 装上 `window.__ModuleLoader__` 桩，捕获 bundle 的 factory，然后校验纯函数（`header()` / `patch()`）与失败安全性，不需要 DSH 运行时、浏览器或网络。

```
client.js          浏览器半边：懒加载 CJS，导出 apply / inject
index.js           宿主半边：空实现，只为让 dsh.client 发现机制扫到本包
cordis.patch.yml   bundle 补丁：插入一行 loader entry
test/              node:test 单元测试
assets/            演示截图
```

**零运行时依赖**：不 import 任何 `@deepseek-ai/*` 包，避免 peer 版本门槛与解析路径问题。

---

## 维护警告

这个插件依赖 DSH 客户端的内部类 `UiConversation` 及其 `sendSession` 方法。**这不是公开 API。** 上游重构时可能失效。

如果失效，症状是：消息不再带时间头，且浏览器控制台出现

```
[msg-time] conversation service never became patchable; headers disabled
```

修复方式是重新定位新的下行收口点并更新 `client.js` 的 `resolveTarget()`。欢迎提 issue 或 PR。

---

## License

[MIT](./LICENSE)
