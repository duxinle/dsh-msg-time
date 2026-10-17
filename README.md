# dsh-msg-time

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.1-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](./README.zh.md) · **English**

Stamp **every outgoing user message** in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with the moment you sent it, so the model always knows when each message was written.

```
[user_sent_at: 2026/10/17 14:41:44]
Can you tell what time it is right now?
```

> The time is sampled **the instant you press send** — not when the UI renders it, not when the model reads it.

---

## What it enables

Without any tool call, the model can answer questions like these:

```
You:  [user_sent_at: 2026/10/17 14:41:44]
      Can you tell what time it is right now?

Model: According to the timestamp on your message, it is 2026-10-17 14:41:44.
       Since you asked me not to use tools, I cannot verify against the network
       or the system clock.
```

```
You:  [user_sent_at: 2026/10/17 14:42:58]
      How long have we been chatting?

Model: From your first message (14:41:44) to now (14:42:58), about 1 min 14 s.
       Derived from the message timestamps; per your instruction, no tools used.
```

![Demo: the model reads the timestamp straight out of the message](https://raw.githubusercontent.com/duxinle/dsh-msg-time/main/assets/demo.png)

It saves a full tool round-trip: asking "what time is it" used to require a `date` invocation; now the time is already in context.

---

## How it differs from other time plugins

| | dsh-msg-time | `dsh-time-context` (bundled) | `dsh-time-prefix` |
|---|---|---|---|
| Granularity | **every message** | one anchor per turn | every message |
| Where the time lives | **inside the message body** | separate synthetic message | message body prefix |
| Sample instant | **the moment you press send** | when the step is prepared | when the step is prepared |
| Multiple messages per turn | independent timestamps | shared anchor, 10-min throttle | shared timestamp per batch |
| Precision | seconds | seconds | minutes |
| Side | client | host | host |

> If all you need is "the model knows roughly what time it is", the bundled `dsh-time-context` is enough — you do not need this plugin.
> This one solves a narrower problem: **the exact send time of each individual message**.

---

## Install

```sh
# from npm
dsh plugin --profile desktop add dsh-msg-time

# or straight from GitHub (no npm account needed)
dsh plugin --profile desktop add github:duxinle/dsh-msg-time
```

Then **fully quit and relaunch the app** (not just close the window). The profile's plugin layer and the client module graph are built only at startup.

> Works on both the desktop app and the Web profile — it only depends on the client-side `conversation` service and assumes nothing about the host platform.

---

## Behavior

| Case | Behavior |
|---|---|
| Normal send (Enter / queue / steer / accelerated Enter) | stamped |
| Slash commands (`/compact`, …) | **not** stamped, to avoid corrupting command parsing |
| Attachment-only message (no text) | **not** stamped, otherwise an empty message would appear |
| On any failure | all patch logic is wrapped in `try/catch`; sending is **never** blocked |
| Re-install / re-load | idempotent, never stacks two headers |

---

## Known limits

- **Second precision, local clock.** If the system clock is wrong, the stamp is wrong. This is the *local send time*, not a trusted time source.
- **No timezone offset.** Output is `2026/10/17 14:41:44`. For cross-timezone use, add `getTimezoneOffset()` in `header()` inside `client.js`.
- **The header is persisted into the session log.** That is the only way to make it model-visible — anything outside `content` is invisible to the model. Accepted because the header is purely additive and does not change meaning.
- **Depends on the internal method `UiConversation#sendSession`.** If DSH refactors it, the plugin fails silently (the console shows a `never became patchable` warning). This is the most fragile part; see *Maintenance* below.

---

## How it works

It wraps the single client-side sink for outgoing messages:

```js
// @deepseek-ai/dsh-client-ui-conversation, class UiConversation
sendSession(session, text, attachmentIds, mode, signal)
//                      ↑ the final message body
```

Call chain (verified layer by layer against the sources):

```
You press send
  → SessionInputShell.sink()                     (lib/client.js:14333)
  → conversation.sendSession(session, text, …)   (lib/client.js:14334)
  → session.beginSubmission({ mode, text, … })   (lib/client.js:3413)
  → Host admission → persisted as a user/message event → visible to the model
```

Every normal send path funnels through this **one** function, so a single wrap covers all of them without DOM hooks or keyboard interception.

**Why not the host-side `agent/pre-step`?** That path works too (`dsh-time-prefix` does exactly that), but it samples when the model starts processing: several messages sent in one turn share a single timestamp, and the host side must manage injection accumulation and throttling. The client approach is a closer match for "the send time of each message", at the cost of one extra client-side dependency.

---

## Uninstall

```sh
dsh plugin --profile desktop remove dsh-msg-time
```

Then relaunch. Removal is clean: the plugin lives only in the plugin layer, modifies no official files, and has no effect on the app itself.

---

## Development

```sh
npm test     # node --test, zero dependencies
```

The tests install a `window.__ModuleLoader__` stub via `node:vm`, capture the bundle factory, and assert the pure helpers (`header()` / `patch()`) plus failure safety — no DSH runtime, browser, or network required.

```
client.js          browser half: lazy CJS export of apply / inject
index.js           host half: no-op, present only so dsh.client discovery sees this package
cordis.patch.yml   bundle patch: inserts one loader entry
test/              node:test unit tests
assets/            demo screenshots
```

**Zero runtime dependencies**: no `@deepseek-ai/*` imports, avoiding peer-version gating and resolution-path issues.

---

## Maintenance warning

This plugin relies on the DSH client's internal class `UiConversation` and its `sendSession` method. **This is not a public API.** It can break when upstream refactors.

Symptom if it breaks: messages stop carrying headers, and the browser console shows

```
[msg-time] conversation service never became patchable; headers disabled
```

The fix is to re-locate the new outgoing-message sink and update `resolveTarget()` in `client.js`. Issues and PRs welcome.

---

## License

[MIT](./LICENSE)
