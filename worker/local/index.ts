// Local-only entrypoint; production remains ../src/index.ts.
import { createApp, type Env } from '../src/index'
import { createLocalProxyTransport } from './proxy-transport'

export default {
  fetch(request: Request, env: Env & { LOCAL_WIRE_URL: string; LOCAL_WIRE_TOKEN: string }, ctx: ExecutionContext) {
    return createApp(createLocalProxyTransport(env.LOCAL_WIRE_URL, env.LOCAL_WIRE_TOKEN)).fetch(request, env, ctx)
  },
}
