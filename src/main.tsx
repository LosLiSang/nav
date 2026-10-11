import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { completeLoginFromLocation, setLoginNotice } from './lib/auth'

/**
 * 本地数据库按账号区分，库名在 db 模块加载时确定。
 * 所以必须先处理 GitHub 登录回跳（写入会话），再加载应用本体。
 */
async function boot() {
  const login = await completeLoginFromLocation()
  if (login.status === 'error') setLoginNotice(login.message)
  if (login.status === 'ok') setLoginNotice(`已登录为 ${login.session.user.login}`)

  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
