// Only this isolated entry replaces DNS and the network wire; production has no fixture switch.
import { createApp } from '../src/index'
export default createApp({
  async resolve(host, signal) {
    return fetch(`http://127.0.0.1:8822/dns?host=${encodeURIComponent(host)}`, { signal }).then(r => r.json()) as Promise<string[]>
  },
  async request(url, _address, signal) {
    return fetch(`http://127.0.0.1:8822/wire?url=${encodeURIComponent(url.href)}`, { signal, redirect: 'manual' })
  },
})
