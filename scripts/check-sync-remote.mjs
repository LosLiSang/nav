/**
 * nav-sync 远端自检：连通性 / 鉴权 / 响应契约 / CORS（只读，可随时重复执行）
 *
 * 用法：
 *   $env:SYNC_TOKEN="<你的 token>"; node scripts/check-sync-remote.mjs
 *   $env:SYNC_TOKEN="<你的 token>"; node scripts/check-sync-remote.mjs https://其它地址
 *
 * 国内网络注意：*.workers.dev 的 DNS 经常被污染（解析到 Meta/Yahoo 的地址段），
 * 直连必失败。让 Node 走代理即可（Node 24+ 需要显式开启才会读代理环境变量）：
 *   $env:NODE_USE_ENV_PROXY="1"
 *
 * 为什么是只读的：它要能在任何时刻重跑 —— 包括你已经存了真实书签之后。
 * 写路径（上传 / 拉取 / 冲突保护）的完整验证在 scripts/smoke-sync-local.mjs，
 * 那份跑在本地 worker + 本地 D1 上，不会碰生产数据。
 */

const DEFAULT_URL = 'https://nav-sync.lisang.workers.dev'

const baseUrl = (process.argv[2] || process.env.SYNC_URL || DEFAULT_URL).replace(/\/+$/, '')
const token = (process.env.SYNC_TOKEN || '').trim()

if (!token) {
  console.error('缺少 SYNC_TOKEN 环境变量。用法：SYNC_TOKEN=xxx node scripts/check-sync-remote.mjs')
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const auth = { Authorization: `Bearer ${token}` }

async function main() {
  console.log(`目标: ${baseUrl}\n`)

  // 1. 健康检查：不鉴权，但也不该泄露数据
  const health = await fetch(`${baseUrl}/`)
  const healthBody = await health.json().catch(() => ({}))
  check(
    '健康检查可达，且服务端已配置 token',
    health.status === 200 && healthBody.configured === true,
    `HTTP ${health.status}, configured=${healthBody.configured}`,
  )
  check(
    '健康检查不泄露数据',
    !JSON.stringify(healthBody).includes('bookmarks'),
    JSON.stringify(healthBody),
  )

  // 2. 鉴权必须真的生效
  const anon = await fetch(`${baseUrl}/api/data`)
  check('无 token 读取被拒绝', anon.status === 401, `HTTP ${anon.status}`)

  const wrong = await fetch(`${baseUrl}/api/data`, {
    headers: { Authorization: 'Bearer definitely-not-the-token' },
  })
  check('错误 token 读取被拒绝', wrong.status === 401, `HTTP ${wrong.status}`)

  // 3. 正确 token：验证响应契约
  const authed = await fetch(`${baseUrl}/api/data`, { headers: auth })
  const body = await authed.json().catch(() => null)
  check('正确 token 读取成功', authed.status === 200, `HTTP ${authed.status}`)
  check(
    '响应契约完整（doc / updatedAt / rev）',
    body !== null && 'doc' in body && 'updatedAt' in body && 'rev' in body,
    body ? `updatedAt=${body.updatedAt} rev=${body.rev}` : '无响应体',
  )
  check(
    '写入的 token 没有被换行等空白字符污染',
    authed.status === 200,
    authed.status === 401 ? 'token 与服务端不一致（很可能写入时带了空白字符）' : 'ok',
  )

  // 4. 浏览器跨域：GitHub Pages 上的前端能不能调通全靠这个
  const preflight = await fetch(`${baseUrl}/api/data`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://loslisang.github.io',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  const allowOrigin = preflight.headers.get('access-control-allow-origin')
  const allowHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase()
  check('跨域预检通过', preflight.status === 204, `HTTP ${preflight.status}`)
  check(
    '预检允许携带 Authorization 头',
    Boolean(allowOrigin) && allowHeaders.includes('authorization'),
    `allow-origin=${allowOrigin}, allow-headers=${allowHeaders}`,
  )

  // 5. 当前云端内容概览（只报数量，不打印内容）
  if (body && body.doc) {
    const d = body.doc
    console.log(
      `\n云端现有数据: 分类 ${d.categories?.length ?? 0} / 书签 ${d.bookmarks?.length ?? 0} / 备忘录 ${d.memos?.length ?? 0} / TOTP ${d.totpAccounts?.length ?? 0}`,
    )
    console.log(`云端版本: ${new Date(body.updatedAt).toISOString()} (rev ${body.rev})`)
  } else {
    console.log('\n云端目前是空的（等价于刚部署好，等你首次上传）')
  }

  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} 通过`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(`自检失败: ${error.message}`)
  process.exitCode = 1
})
