/**
 * dsh-msg-time — host half.
 *
 * This plugin does all of its work in the browser. The host half exists only so
 * the package appears in the Loader tree, which is what `dsh.client` discovery
 * scans for browser bundles (`exports["./client"]`). Loading it has no effect
 * on the agent, the session, or the system prompt.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'msg-time'

/** Nothing to inject: this host half touches no service. */
export const inject = []

/** No-op: the browser half carries the behavior. */
export function apply() {}
