#!/usr/bin/env node
/**
 * 把 Chrome / Edge「导出书签」生成的 HTML（NETSCAPE-Bookmark-file-1）
 * 转成 nav 能直接导入的备份 JSON（个人中心 → 数据管理 → 导入备份）。
 *
 * 用法：
 *   node scripts/chrome-bookmarks-to-nav.mjs <bookmarks.html> --mode cards --out nav-backup.json
 *
 * 四种模式（顶层分类卡片的取法不同）：
 *   cards      只保留「模块：我的常用网址」下面的文件夹 —— 也就是导航页里原本就有的那几张卡片，
 *              其余模块整个丢掉（推荐用于「只更新我原有的卡片」）
 *   modules    顶层分类 = 每个二级文件夹，外加「模块：X」本身（推荐：所有书签在导航页都看得见）
 *   folders    顶层分类 = 每个二级文件夹（完全保留原来的文件夹划分，分类条会比较长）
 *   structured 顶层分类 = 「模块：我的常用网址」下的文件夹；其余模块写成 多级分类 / subCategory
 *              （当前版本的导航页还没有多级分类的界面，那部分书签只存在数据里，不会被渲染）
 *
 * 输出的 JSON 只包含 categories / subSections / subCategories / bookmarks 四个键，
 * 不含 memos、totpAccounts、settings —— 导入时这几项会保持原样不被覆盖。
 */

import { readFileSync, writeFileSync } from 'node:fs'

const CATEGORY_COLORS = [
  '#3b82f6',
  '#ec4899',
  '#10b981',
  '#22c55e',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#6366f1',
  '#14b8a6',
]

/** 和仓库里 src/lib/defaults.ts 已经用过的 id 对齐，导进去以后设置里的 activeXxx 仍然有效 */
const KNOWN_CATEGORY_IDS = {
  生产力工具: 'cat-prod',
  兴趣相关: 'cat-interest',
  技术相关: 'cat-tech',
  'TODO课程+书籍': 'cat-todo',
  优质博客: 'cat-blog',
  闹着玩的: 'cat-fun',
  Document: 'cat-doc',
  nocase: 'cat-nocase',
  工具: 'cat-tools',
  生活: 'cat-life',
  休闲: 'cat-leisure',
  多级分类: 'cat-multi',
}

const KNOWN_SECTION_IDS = {
  工具: 'sec-tools',
  生活: 'sec-life',
  休闲: 'sec-leisure',
  多级分类: 'sec-multi',
}

const KNOWN_SECTION_ICONS = {
  工具: 'wrench',
  生活: 'coffee',
  休闲: 'gamepad',
  多级分类: 'folder',
}

const KNOWN_SUB_CATEGORY_IDS = { 邮箱: 'sub-mail', 绘图: 'sub-draw', 翻译: 'sub-trans' }

const SUB_CATEGORY_ICONS = {
  邮箱: 'mail',
  绘图: 'pen-tool',
  翻译: 'languages',
  文档: 'file-text',
  PDF: 'file-text',
  网盘: 'hard-drive',
  查询: 'search',
  搜盘: 'search',
  图片: 'image',
  海报: 'image',
  壁纸: 'image',
  图床: 'upload',
  协作: 'users',
  配色: 'palette',
  创作: 'sparkles',
  问卷: 'clipboard-list',
  排版: 'type',
  简历: 'file-badge',
  开发: 'code',
  购物: 'shopping-cart',
  折扣: 'percent',
  汽车: 'car',
  房产: 'home',
  银行: 'landmark',
  社区: 'users',
  旅游: 'compass',
  手机: 'smartphone',
  学习: 'book-open',
  摄影: 'camera',
  法律: 'scale',
  招聘: 'briefcase',
  模板: 'layout-template',
  菜谱: 'utensils',
  字体: 'type',
  图标: 'shapes',
  域名: 'globe',
  视频: 'video',
  直播: 'radio',
  电影: 'film',
  记录: 'notebook-pen',
  音乐: 'music',
  电台: 'radio-tower',
  动漫: 'tv',
  小说: 'book',
  有趣: 'laugh',
  门户: 'globe',
  资讯: 'newspaper',
  军事: 'shield',
  体育: 'dumbbell',
  科技: 'cpu',
  数码: 'smartphone',
  商业: 'briefcase',
  财经: 'trending-up',
  时政: 'landmark',
  未分类: 'folder',
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[body.toLowerCase()] ?? match
  })
}

const TOKEN =
  /<DL\b[^>]*>|<\/DL>|<DT>\s*<H3\b([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A\b([^>]*)>([\s\S]*?)<\/A>/gi

function hrefOf(attributes) {
  const match = attributes.match(/\bHREF\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
  if (!match) return ''
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim()
}

/** 解析成 { type: 'folder' | 'link', name, url, children } 的树 */
function parseBookmarks(html) {
  const root = { type: 'folder', name: '', children: [] }
  const stack = [root]
  let pending = null

  for (const match of html.matchAll(TOKEN)) {
    const token = match[0]

    if (/^<DL\b/i.test(token)) {
      if (pending) {
        stack[stack.length - 1].children.push(pending)
        stack.push(pending)
        pending = null
      } else {
        // 最外层（或没有归属文件夹）的 <DL>：沿用当前容器，不要凭空多一层
        stack.push(stack[stack.length - 1])
      }
    } else if (/^<\/DL/i.test(token)) {
      if (stack.length > 1) stack.pop()
    } else if (match[2] !== undefined) {
      pending = {
        type: 'folder',
        name: decodeEntities(match[2]).replace(/\s+/g, ' ').trim(),
        children: [],
      }
    } else {
      const url = hrefOf(match[3] ?? '')
      if (!url) continue
      const title = decodeEntities(match[4] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      stack[stack.length - 1].children.push({ type: 'link', name: title, url })
    }
  }

  return root
}

function linksOf(folder) {
  return folder.children.filter((child) => child.type === 'link')
}

function foldersOf(folder) {
  return folder.children.filter((child) => child.type === 'folder')
}

function stripModulePrefix(name) {
  return name.replace(/^模块\s*[:：]\s*/, '').trim() || name
}

function makeCategoryId(name, index) {
  return KNOWN_CATEGORY_IDS[name] ?? `cat-${index}`
}

function makeSectionId(name, index) {
  return KNOWN_SECTION_IDS[name] ?? `sec-${index}`
}

function convert(rootFolder, mode) {
  const modules = foldersOf(rootFolder)
  const loosedLinks = linksOf(rootFolder)
  const categories = []
  const subSections = []
  const subCategories = []
  const bookmarks = []
  const skippedEmptyFolders = []
  let bookmarkId = 0
  let categoryIndex = 0
  let sectionIndex = 0
  let subCategoryIndex = 0

  function pushBookmark(node, target) {
    const order = bookmarks.filter(
      (bookmark) =>
        bookmark.categoryId === target.categoryId &&
        bookmark.subCategoryId === target.subCategoryId,
    ).length
    bookmarks.push({
      id: `bm-${bookmarkId++}`,
      ...(target.categoryId ? { categoryId: target.categoryId } : {}),
      ...(target.subCategoryId ? { subCategoryId: target.subCategoryId } : {}),
      title: node.name || node.url,
      url: node.url,
      order,
      createdAt: Date.now() + bookmarkId,
      updatedAt: Date.now() + bookmarkId,
    })
  }

  function addCategory(name, links) {
    const id = makeCategoryId(name, categoryIndex)
    categories.push({
      id,
      name: name || '未分类',
      color: CATEGORY_COLORS[categoryIndex % CATEGORY_COLORS.length],
      order: categoryIndex,
    })
    categoryIndex += 1
    for (const link of links) pushBookmark(link, { categoryId: id })
    return id
  }

  for (const moduleFolder of modules) {
    const moduleName = stripModulePrefix(moduleFolder.name)
    const leafFolders = foldersOf(moduleFolder)
    const looseModuleLinks = linksOf(moduleFolder)
    const isCommonModule = moduleName.includes('我的常用网址')

    if (mode === 'structured' && !isCommonModule) {
      const sectionId = makeSectionId(moduleName, sectionIndex)
      subSections.push({
        id: sectionId,
        name: moduleName,
        icon: KNOWN_SECTION_ICONS[moduleName] ?? 'folder',
        order: sectionIndex,
      })
      sectionIndex += 1

      const buckets = leafFolders.map((leaf) => ({ name: leaf.name, links: linksOf(leaf) }))
      if (looseModuleLinks.length > 0) buckets.push({ name: '未分类', links: looseModuleLinks })

      for (const bucket of buckets) {
        if (bucket.links.length === 0) {
          skippedEmptyFolders.push(`${moduleName} / ${bucket.name}`)
          continue
        }
        const subCategoryId =
          KNOWN_SUB_CATEGORY_IDS[bucket.name] ?? `sub-${++subCategoryIndex}`
        subCategories.push({
          id: subCategoryId,
          sectionId,
          name: bucket.name,
          icon: SUB_CATEGORY_ICONS[bucket.name] ?? 'folder',
          order: subCategories.filter((sub) => sub.sectionId === sectionId).length,
        })
        for (const link of bucket.links) pushBookmark(link, { subCategoryId })
      }
      continue
    }

    if (mode === 'cards' || mode === 'modules') {
      // 「我的常用网址」下面的文件夹本来就是一个一个分类卡片，保持不动
      if (isCommonModule) {
        for (const leaf of leafFolders) {
          const links = linksOf(leaf)
          if (links.length === 0) {
            skippedEmptyFolders.push(`${moduleName} / ${leaf.name}`)
            continue
          }
          addCategory(leaf.name, links)
        }
        if (looseModuleLinks.length > 0) {
          addCategory(`${moduleName}（未分类）`, looseModuleLinks)
        }
        continue
      }

      // cards 模式：不是「我的常用网址」的模块整块丢掉
      if (mode === 'cards') continue

      // 其余模块整块摊平成一张分类卡片，否则界面里看不到它们
      const flattened = [
        ...looseModuleLinks,
        ...leafFolders.flatMap((leaf) => {
          const links = linksOf(leaf)
          if (links.length === 0) skippedEmptyFolders.push(`${moduleName} / ${leaf.name}`)
          return links
        }),
      ]
      if (flattened.length === 0) continue
      addCategory(moduleName, flattened)
      continue
    }

    // folders 模式：每个二级文件夹（含「模块：我的常用网址」下的）都是一个顶层分类
    for (const leaf of leafFolders) {
      const links = linksOf(leaf)
      if (links.length === 0) {
        skippedEmptyFolders.push(`${moduleName} / ${leaf.name}`)
        continue
      }
      addCategory(leaf.name, links)
    }
    if (looseModuleLinks.length > 0) {
      addCategory(`${moduleName}（未分类）`, looseModuleLinks)
    }
  }

  if (loosedLinks.length > 0) addCategory('书签栏未分类', loosedLinks)

  return { categories, subSections, subCategories, bookmarks, skippedEmptyFolders }
}

function main() {
  const args = process.argv.slice(2)
  const input = args.find((arg) => !arg.startsWith('--'))
  const flag = (name, fallback) => {
    const index = args.indexOf(`--${name}`)
    return index === -1 ? fallback : args[index + 1]
  }
  const mode = flag('mode', 'modules')
  const out = flag('out', '').replace(/\s+/g, ' ').trim()

  if (!input || !['cards', 'modules', 'folders', 'structured'].includes(mode)) {
    console.error(
      '用法: node scripts/chrome-bookmarks-to-nav.mjs <bookmarks.html> [--mode cards|modules|folders|structured] [--out <file.json>]',
    )
    process.exit(1)
  }

  const html = readFileSync(input, 'utf8')
  const root = parseBookmarks(html)
  const topFolders = foldersOf(root)
  const container = topFolders.length === 1 ? topFolders[0] : root

  const result = convert(container, mode)
  const payload = {
    categories: result.categories,
    subSections: result.subSections,
    subCategories: result.subCategories,
    bookmarks: result.bookmarks,
  }
  const json = `${JSON.stringify(payload, null, 2)}\n`
  if (out) writeFileSync(out, json, 'utf8')

  const lines = [
    `模式: ${mode}`,
    `顶层文件夹: ${container.name || '(无)'}`,
    `分类: ${payload.categories.length}`,
    `多级分区: ${payload.subSections.length}`,
    `多级分类: ${payload.subCategories.length}`,
    `书签: ${payload.bookmarks.length}`,
  ]
  if (result.skippedEmptyFolders.length > 0) {
    lines.push(`跳过的空文件夹: ${result.skippedEmptyFolders.join('、')}`)
  }
  if (out) lines.push(`已写入: ${out}`)
  console.log(lines.join('\n'))
  if (out) return
  console.log(json)
}

main()
