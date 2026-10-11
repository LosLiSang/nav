import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  autoItemMinWidth,
  bookmarkGridTemplate,
  estimateTextWidth,
  MAX_ITEM_WIDTH,
  MIN_ITEM_WIDTH,
} from '../src/lib/bookmarkGrid.ts'

test('CJK chars are wider than latin chars', () => {
  assert.ok(estimateTextWidth('杭电计算机', 13) > estimateTextWidth('kaggle', 13))
  assert.equal(estimateTextWidth('', 13), 0)
})

test('auto item width follows title content and stays clamped', () => {
  for (const [titles, opts, check] of [
    [[], {}, (w) => w === MIN_ITEM_WIDTH],
    [['tg', 'GPU'], {}, (w) => w === MIN_ITEM_WIDTH],
    [['x'.repeat(200)], {}, (w) => w === MAX_ITEM_WIDTH],
    // 4~6 个汉字的常见标题应完整放下（13px * 6 + 图标/内边距）
    [['杭电计算机学院', '让计算更简单', '网易云音乐', 'GPU'], {}, (w) => w >= 6 * 13 + 40 && w <= MAX_ITEM_WIDTH],
  ]) {
    const w = autoItemMinWidth(titles, opts)
    assert.ok(check(w), `${JSON.stringify(titles)} -> ${w}`)
  }
})

test('bigger font, bold or icon needs more width', () => {
  const titles = ['杭电计算机学院', '让计算更简单']
  const base = autoItemMinWidth(titles, { fontSize: 13 })
  assert.ok(autoItemMinWidth(titles, { fontSize: 16 }) > base)
  assert.ok(autoItemMinWidth(titles, { fontSize: 13, isBold: true }) > base)
  assert.ok(autoItemMinWidth(titles, { fontSize: 13, showIcon: false }) < base)
})

test('one outlier long title does not shrink column count for everyone', () => {
  const titles = ['GitHub', 'V2EX', 'kaggle', 'flomo', 'KOOK', 'Machines - a very very long bookmark title']
  assert.ok(autoItemMinWidth(titles) < MAX_ITEM_WIDTH)
})

test('grid template per column mode', () => {
  assert.equal(bookmarkGridTemplate(['a'], { columnMode: 'manual', manualColumns: 5 }), 'repeat(5, minmax(0, 1fr))')
  assert.equal(bookmarkGridTemplate(['a'], {}), 'repeat(7, minmax(0, 1fr))')
  assert.match(bookmarkGridTemplate(['a'], { columnMode: 'auto' }), /^repeat\(auto-fill, minmax\(min\(\d+px, 100%\), 1fr\)\)$/)
})

test('content width resolves to window percentage, migrating legacy px', async () => {
  const { resolveContentWidth } = await import('../src/lib/contentWidth.ts')
  for (const [settings, expected] of [
    [{}, 75],
    [{ contentWidth: 90 }, 90],
    [{ contentWidth: 10 }, 50],
    [{ contentWidth: 140 }, 100],
    [{ cardWidth: 0 }, 100],
    [{ cardWidth: 1920 }, 100],
    [{ cardWidth: 1380 }, 72],
    [{ cardWidth: 800 }, 50],
    [{ contentWidth: 60, cardWidth: 0 }, 60],
  ]) {
    assert.equal(resolveContentWidth(settings), expected, JSON.stringify(settings))
  }
})
