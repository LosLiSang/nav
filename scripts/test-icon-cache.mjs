import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconStatus, planIconCleanup, toggleSelection } from '../src/lib/iconCache.ts'
import { IconRequestPool } from '../src/lib/iconRequestPool.ts'

const bookmark = (id, url, extra = {}) => ({ id, url, title: id, order: 0, createdAt: 1, updatedAt: 1, ...extra })
const rows = [
  bookmark('empty', 'https://empty.test/a', { categoryId: 'main' }),
  bookmark('shared', 'https://empty.test/b', { subCategoryId: 'sub' }),
  bookmark('good', 'https://good.test', { categoryId: 'main' }),
  bookmark('manual', 'https://empty.test/c', { iconUrl: 'data:image/svg+xml,manual' }),
  bookmark('invalid', 'http://[broken'),
]

test('empty means neither a valid remote result nor a manual icon', () => {
  for (const [row, cached, failed, expected] of [
    [rows[0], {}, {}, 'empty'],
    [rows[0], { 'empty.test': 'blob:valid' }, {}, 'remote'],
    [rows[0], { 'empty.test': 'blob:broken' }, { 'empty.test': true }, 'empty'],
    [rows[3], {}, { 'empty.test': true }, 'manual'],
    [bookmark('spaces', 'https://empty.test', { iconUrl: '  ' }), {}, {}, 'empty'],
  ]) assert.equal(iconStatus(row, cached, failed), expected)
})

test('default empty selection protects valid remote and manual icons', () => {
  const plan = planIconCleanup(rows, ['empty', 'good', 'manual'], 'empty', { 'good.test': 'blob:valid' }, {})
  assert.deepEqual(plan.bookmarks.map(b => b.id), ['empty'])
  assert.deepEqual(plan.targets, [{ domain: 'empty.test', url: 'https://empty.test/a' }])
  assert.deepEqual(plan.relatedBookmarks.map(b => b.id), ['shared'])
})

test('all mode deduplicates domains and excludes manual overrides', () => {
  const plan = planIconCleanup(rows, ['empty', 'shared', 'manual', 'empty', 'invalid'], 'all', {}, {})
  assert.equal(plan.targets.length, 1)
  assert.deepEqual(plan.invalidBookmarks.map(b => b.id), ['invalid'])
  assert.deepEqual(plan.relatedBookmarks, [])
  assert.deepEqual(planIconCleanup(rows, [], 'all', {}, {}).targets, [])
})

test('hierarchical selection toggles only the requested group', () => {
  assert.deepEqual(toggleSelection(['good'], ['empty', 'shared'], true), ['good', 'empty', 'shared'])
  assert.deepEqual(toggleSelection(['good', 'empty', 'shared'], ['empty', 'shared'], false), ['good'])
})

test('requests deduplicate and invalidation only supersedes the target domain', async () => {
  const pool = new IconRequestPool()
  let release
  let calls = 0
  let oldCurrent
  const old = pool.run('a', async (current, signal) => {
    calls++
    oldCurrent = current
    await new Promise(resolve => { release = resolve })
    return signal.aborted ? 'cancelled' : 'old'
  })
  assert.equal(pool.run('a', () => { throw new Error('duplicate') }), old)
  const other = pool.run('b', async current => current())
  await Promise.resolve()
  pool.invalidate(['a'])
  assert.equal(oldCurrent(), false)
  const fresh = pool.run('a', async current => current() ? 'fresh' : 'stale')
  release()
  assert.equal(await old, 'cancelled')
  assert.equal(await fresh, 'fresh')
  assert.equal(await other, true)
  assert.equal(calls, 1)
})
