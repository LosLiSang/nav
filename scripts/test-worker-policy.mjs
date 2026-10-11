import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DAY_MS,
  SESSION_TTL_MS,
  accountOnLogin,
  canSync,
  checkUserUpdate,
  isAllowedOrigin,
  normalizeReturnTo,
  parseList,
  planWrite,
  renewedExpiry,
  withFragment,
} from '../worker/src/policy.ts'

const PAGES = 'https://loslisang.github.io'

test('parseList splits, trims and dedupes', () => {
  for (const [input, expected] of [
    [undefined, []],
    ['', []],
    ['a, b ,a', ['a', 'b']],
    ['https://x.io  http://localhost:5173', ['https://x.io', 'http://localhost:5173']],
  ]) assert.deepEqual(parseList(input), expected)
})

test('isAllowedOrigin compares normalized origins only', () => {
  for (const [origin, expected] of [
    [PAGES, true],
    ['https://LosLiSang.github.io', true],
    ['https://loslisang.github.io.evil.com', false],
    ['http://loslisang.github.io', false],
    ['null', false],
    [undefined, false],
  ]) assert.equal(isAllowedOrigin(origin, [PAGES]), expected, String(origin))
})

test('normalizeReturnTo blocks open redirects and strips hash', () => {
  for (const [input, allowed, expected] of [
    [`${PAGES}/nav/`, [PAGES], `${PAGES}/nav/`],
    [`${PAGES}/nav/dev/#old`, [PAGES], `${PAGES}/nav/dev/`],
    ['https://evil.com/nav/', [PAGES], null],
    [`https://user:pw@loslisang.github.io/nav/`, [PAGES], null],
    ['javascript:alert(1)', [PAGES], null],
    ['/nav/', [PAGES], null],
    [`${PAGES}/nav/`, [], null],
    ['http://localhost:5173/', [PAGES, 'http://localhost:5173'], 'http://localhost:5173/'],
  ]) assert.equal(normalizeReturnTo(input, allowed), expected, input)
})

test('withFragment puts params in the hash', () => {
  assert.equal(withFragment(`${PAGES}/nav/`, { login_code: 'a b' }), `${PAGES}/nav/#login_code=a+b`)
})

test('accountOnLogin: admin list wins, existing kept, new pending', () => {
  const admins = ['LosLiSang']
  for (const [login, existing, expected] of [
    ['loslisang', null, { role: 'admin', status: 'active' }],
    ['LosLiSang', { role: 'user', status: 'disabled' }, { role: 'admin', status: 'active' }],
    ['alice', null, { role: 'user', status: 'pending' }],
    ['alice', { role: 'user', status: 'active' }, { role: 'user', status: 'active' }],
    ['bob', { role: 'admin', status: 'active' }, { role: 'admin', status: 'active' }],
    ['carol', { role: 'user', status: 'disabled' }, { role: 'user', status: 'disabled' }],
  ]) assert.deepEqual(accountOnLogin(login, admins, existing), expected, login)
})

test('only active accounts may sync', () => {
  for (const [status, expected] of [['active', true], ['pending', false], ['disabled', false]]) {
    assert.equal(canSync({ role: 'user', status }), expected)
  }
})

test('checkUserUpdate validates and protects the last admin', () => {
  const admin = { role: 'admin', status: 'active' }
  const pending = { role: 'user', status: 'pending' }
  for (const [target, patch, admins, expected] of [
    [pending, { status: 'active' }, 1, { ok: true, next: { role: 'user', status: 'active' } }],
    [pending, { role: 'root' }, 1, { ok: false, error: 'invalid_role' }],
    [pending, { status: 'gone' }, 1, { ok: false, error: 'invalid_status' }],
    [pending, {}, 1, { ok: false, error: 'empty_patch' }],
    [admin, { status: 'disabled' }, 1, { ok: false, error: 'last_admin' }],
    [admin, { role: 'user' }, 1, { ok: false, error: 'last_admin' }],
    [admin, { status: 'disabled' }, 2, { ok: true, next: { role: 'admin', status: 'disabled' } }],
    [admin, { role: 'admin' }, 1, { ok: true, next: admin }],
  ]) assert.deepEqual(checkUserUpdate(target, patch, admins), expected, JSON.stringify(patch))
})

test('renewedExpiry slides only in the second half of the session', () => {
  const now = 1_000_000
  for (const [expiresAt, expected] of [
    [now - 1, null],
    [now, null],
    [now + SESSION_TTL_MS - DAY_MS, null],
    [now + DAY_MS, now + SESSION_TTL_MS],
  ]) assert.equal(renewedExpiry(expiresAt, now), expected)
})

test('planWrite keeps optimistic concurrency', () => {
  const now = 500
  for (const [input, expected] of [
    [{ currentUpdatedAt: null, expected: null, incoming: 100, force: false }, { conflict: false, nextUpdatedAt: 100 }],
    [{ currentUpdatedAt: null, expected: 7, incoming: null, force: false }, { conflict: false, nextUpdatedAt: now }],
    [{ currentUpdatedAt: 200, expected: 100, incoming: 300, force: false }, { conflict: true }],
    [{ currentUpdatedAt: 200, expected: 100, incoming: 300, force: true }, { conflict: false, nextUpdatedAt: 300 }],
    [{ currentUpdatedAt: 200, expected: 200, incoming: 150, force: false }, { conflict: false, nextUpdatedAt: 201 }],
    [{ currentUpdatedAt: 200, expected: null, incoming: 300, force: false }, { conflict: false, nextUpdatedAt: 300 }],
  ]) assert.deepEqual(planWrite({ ...input, now }), expected, JSON.stringify(input))
})
