/** Per-resource ownership: stale completions cannot publish after invalidation.
 * No storage/network dependency; the caller checks ownership inside its write transaction.
 */
export class IconRequestPool<T> {
  private entries = new Map<string, { controller: AbortController; promise: Promise<T> }>()

  run(domain: string, task: (isCurrent: () => boolean, signal: AbortSignal) => Promise<T>): Promise<T> {
    const existing = this.entries.get(domain)
    if (existing) return existing.promise
    const controller = new AbortController()
    const entry = { controller, promise: null as unknown as Promise<T> }
    const isCurrent = () => this.entries.get(domain) === entry && !controller.signal.aborted
    entry.promise = Promise.resolve()
      .then(() => task(isCurrent, controller.signal))
      .finally(() => {
        if (this.entries.get(domain) === entry) this.entries.delete(domain)
      })
    this.entries.set(domain, entry)
    return entry.promise
  }

  get(domain: string): Promise<T> | undefined {
    return this.entries.get(domain)?.promise
  }

  invalidate(domains: string[]): void {
    for (const domain of domains) {
      this.entries.get(domain)?.controller.abort()
      this.entries.delete(domain)
    }
  }
}
