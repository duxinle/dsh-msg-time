/**
 * Unit tests for the dsh-msg-time browser bundle.
 *
 * The bundle ships as a lazy-CJS registration for the DSH client module
 * loader, so the tests install a minimal `window.__ModuleLoader__` stub to
 * capture the factory and then exercise its pure helpers. No DSH runtime,
 * browser, or network access is involved.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const bundlePath = fileURLToPath(new URL('../client.js', import.meta.url))

/**
 * Execute the bundle against a loader stub and return its captured exports.
 * @returns the module exports produced by the registration factory.
 */
function loadBundle() {
  const registrations = []
  const context = {
    window: {
      __ModuleLoader__: {
        load(registration) {
          registrations.push(registration)
        },
      },
    },
    console,
    setInterval,
    clearInterval,
  }
  vm.runInNewContext(readFileSync(bundlePath, 'utf8'), context, { filename: bundlePath })
  assert.equal(registrations.length, 1, 'bundle must register exactly one module')
  const [registration] = registrations
  assert.equal(registration.id, 'dsh-msg-time')
  return {
    registration,
    exports: registration.factory(() => {
      throw new Error('bundle must not require any external module')
    }),
  }
}

/**
 * Timer stub: apply() accepts an injected timer seam, so retry polling never
 * touches the real event loop during tests.
 * @returns set/clear pair that records without scheduling.
 */
function stubTimers() {
  return {
    setInterval: () => 1,
    clearInterval: () => {},
  }
}
test('bundle registers under the package name and exports the plugin contract', () => {
  const { exports } = loadBundle()
  assert.equal(typeof exports.apply, 'function')
  // The bundle runs in its own vm realm, so compare by value, not identity.\n  assert.equal(Array.from(exports.inject).join(','), 'conversation')
})

test('bundle requires no external module during registration', () => {
  // `loadBundle` already throws from the require stub if one is requested; this
  // asserts the registration itself succeeded, which pins the zero-dependency
  // promise stated in the README.
  assert.doesNotThrow(() => loadBundle())
})

test('header() renders a zero-padded local timestamp in bracket form', () => {
  const { exports } = loadBundle()
  const { header } = exports.__test

  // Local-time constructor so the assertion holds in any timezone.
  const at = new Date(2026, 0, 5, 7, 8, 9)
  assert.equal(header(at), '[user_sent_at: 2026/01/05 07:08:09]\n')
})

test('header() pads every field and uses a trailing newline', () => {
  const { exports } = loadBundle()
  const { header } = exports.__test

  const text = header(new Date(2026, 11, 31, 23, 59, 59))
  assert.equal(text, '[user_sent_at: 2026/12/31 23:59:59]\n')
  assert.ok(text.endsWith('\n'), 'header must be followed by exactly one newline')
})

test('patch() prepends the header and forwards every argument', () => {
  const { exports } = loadBundle()
  const { patch } = exports.__test

  const calls = []
  const target = {
    sendSession(...args) {
      calls.push(args)
      return 'ok'
    },
  }

  assert.equal(patch(target), true)
  const session = { id: 's' }
  const result = target.sendSession(session, 'hello', ['a1'], 'queue', undefined)

  assert.equal(result, 'ok')
  assert.equal(calls.length, 1)
  const [gotSession, gotText, gotIds, gotMode, gotSignal] = calls[0]
  assert.equal(gotSession, session)
  assert.deepEqual(gotIds, ['a1'])
  assert.equal(gotMode, 'queue')
  assert.equal(gotSignal, undefined)
  assert.match(gotText, /^\[user_sent_at: \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\]\nhello$/u)
})

test('patch() is idempotent: a second wrap does not stack headers', () => {
  const { exports } = loadBundle()
  const { patch } = exports.__test

  const target = { sendSession: (session, text) => text }

  assert.equal(patch(target), true)
  assert.equal(patch(target), true)
  const out = target.sendSession({}, 'hi')
  assert.equal(out.match(/\[user_sent_at:/gu).length, 1, 'exactly one header after double patch')
})

test('patch() refuses objects without a usable sendSession', () => {
  const { exports } = loadBundle()
  const { patch } = exports.__test

  assert.equal(patch(undefined), false)
  assert.equal(patch(null), false)
  assert.equal(patch({}), false)
  assert.equal(patch({ sendSession: 'not-a-function' }), false)
})

test('empty and non-string submissions pass through untouched', () => {
  const { exports } = loadBundle()
  const { patch } = exports.__test

  const target = { sendSession: (session, text) => text }
  patch(target)

  // Attachment-only sends carry an empty string and must not gain a header.
  assert.equal(target.sendSession({}, ''), '')
  // Defensive: a non-string payload is forwarded verbatim.
  assert.equal(target.sendSession({}, undefined), undefined)
})

test('apply() patches a service that already exposes sendSession', () => {
  const { exports } = loadBundle()

  const target = { sendSession: (session, text) => text }
  const ctx = {
    get: (name) => (name === 'conversation' ? target : undefined),
    effect: () => {},
  }

  exports.apply(ctx, stubTimers())

  assert.match(target.sendSession({}, 'ping'), /^\[user_sent_at: .+\]\nping$/u)
})

test('apply() swallows a throwing service lookup instead of breaking sending', () => {
  const { exports } = loadBundle()

  const ctx = {
    get: () => {
      throw new Error('service not ready')
    },
    effect: () => {},
  }

  assert.doesNotThrow(() => exports.apply(ctx, stubTimers()))
})
