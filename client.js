window.__ModuleLoader__.load({
  id: "dsh-msg-time",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // The conversation service must exist before this bundle applies.
    const inject = ["conversation"];

    /**
     * Build the header for one submission instant.
     * @param at - the instant the user committed the message.
     * @returns the bracket header text.
     */
    function header(at) {
      const pad = (value) => String(value).padStart(2, "0");
      const date = `${at.getFullYear()}/${pad(at.getMonth() + 1)}/${pad(at.getDate())}`;
      const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
      return `[user_sent_at: ${date} ${time}]\n`;
    }

    /**
     * Patch one conversation-like object so every submitted prompt carries a
     * header. Idempotent: repeated calls do not stack wrappers.
     * @param target - candidate object owning `sendSession`.
     * @returns whether a patchable `sendSession` was found.
     */
    function patch(target) {
      if (target === null || target === undefined) return false;
      if (typeof target.sendSession !== "function") return false;
      if (target.sendSession.__msgTime === true) return true;
      const original = target.sendSession;
      const patched = function sendSession(session, text, attachmentIds, mode, signal) {
        // Leave non-string / empty submissions (attachment-only sends) untouched.
        const stamped = typeof text === "string" && text !== "" ? header(new Date()) + text : text;
        return original.call(this, session, stamped, attachmentIds, mode, signal);
      };
      patched.__msgTime = true;
      target.sendSession = patched;
      return true;
    }

    /**
     * Resolve the live object that owns `sendSession`.
     * @param ctx - browser plugin context.
     * @returns the patchable target, or undefined when not materialized yet.
     */
    function resolveTarget(ctx) {
      const service = ctx.get("conversation");
      if (service === null || service === undefined) return undefined;
      // `UiConversation` is the service itself; some hosts expose the owning
      // controller instead, whose accessor yields the same instance.
      if (typeof service.sendSession === "function") return service;
      if (typeof service.conversation === "function") {
        const inner = service.conversation();
        if (inner !== null && inner !== undefined && typeof inner.sendSession === "function") return inner;
      }
      return undefined;
    }

    /**
     * Install the header patch, retrying briefly until the conversation service
     * is materialized. Any failure is contained: sending must never break
     * because of this plugin.
     * @param ctx - browser plugin context.
     */
    function apply(ctx, io) {
      // Timer seam: the DSH client passes nothing and gets real timers; tests
      // inject stubs so retry polling never escapes the test process.
      const timers = io !== undefined && io !== null ? io : { setInterval, clearInterval };
      let settled = false;
      let timer;
      let attempts = 0;

      const stop = () => {
        settled = true;
        if (timer !== undefined) timers.clearInterval(timer);
        timer = undefined;
      };

      const attempt = () => {
        if (settled) return;
        let ok = false;
        try {
          ok = patch(resolveTarget(ctx));
        } catch (error) {
          console.warn("[msg-time] patch attempt failed:", error);
        }
        if (ok) {
          stop();
          console.info("[msg-time] ready: outgoing prompts carry [user_sent_at] headers");
          return;
        }
        // Give up after ~30s rather than polling forever.
        if (++attempts >= 60) {
          stop();
          console.warn("[msg-time] conversation service never became patchable; headers disabled");
        }
      };

      attempt();
      if (!settled) {
        timer = timers.setInterval(attempt, 500);
        ctx.effect(() => () => timers.clearInterval(timer));
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    // Test hook: pure helpers, consumed by test/client.test.mjs. Not a plugin
    // contract — the loader only reads apply/inject.
    exports.__test = { header, patch };
    return module.exports;
  },
});
