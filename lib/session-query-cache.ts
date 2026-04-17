const sessionQueryCache = new Map<string, unknown>()

export function getSessionQuerySnapshot<T>(key: string): T | undefined {
  return sessionQueryCache.get(key) as T | undefined
}

export function setSessionQuerySnapshot<T>(key: string, value: T): void {
  sessionQueryCache.set(key, value)
}

export function clearSessionQuerySnapshot(key: string): void {
  sessionQueryCache.delete(key)
}
