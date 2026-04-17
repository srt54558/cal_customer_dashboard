interface CookieStore {
  set(options: {
    name: string
    value: string
    path?: string
    domain?: string
    expires?: number | Date
    sameSite?: "strict" | "lax" | "none"
    secure?: boolean
  }): Promise<void>
}

declare const cookieStore: CookieStore
