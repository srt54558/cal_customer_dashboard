"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"

type AuthState = {
  isLoading: boolean
  isAuthenticated: boolean
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>
}

type CachedToken = {
  token: string | null
  expiresAtMs: number
}

let cachedToken: CachedToken | null = null
let inFlightTokenRequest: Promise<string | null> | null = null

function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1]))
    if (typeof payload.exp !== "number") return null
    return payload.exp * 1000
  } catch {
    return null
  }
}

function readCachedToken(now: number): string | null {
  if (!cachedToken) return null
  if (cachedToken.expiresAtMs <= now) {
    cachedToken = null
    return null
  }
  return cachedToken.token
}

function useTokenBridgeAuth(): AuthState {
  const pathname = usePathname()
  const shouldAttemptAuth = pathname !== "/login"

  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: shouldAttemptAuth,
      fetchAccessToken: async ({ forceRefreshToken }) => {
        const now = Date.now()
        if (!forceRefreshToken) {
          const tokenFromCache = readCachedToken(now)
          if (tokenFromCache !== null) {
            return tokenFromCache
          }
          if (inFlightTokenRequest) {
            return inFlightTokenRequest
          }
        }

        inFlightTokenRequest = (async () => {
        const response = await fetch("/api/convex/token", { cache: "no-store" })
        if (!response.ok) {
            cachedToken = { token: null, expiresAtMs: Date.now() + 5_000 }
          return null
        }
        const payload = (await response.json()) as { token?: string }
          const token = payload.token ?? null
          if (token) {
            const expMs = decodeJwtExpMs(token)
            const safeExpiry = expMs ? Math.max(Date.now() + 5_000, expMs - 30_000) : Date.now() + 60_000
            cachedToken = { token, expiresAtMs: safeExpiry }
            return token
          }
          cachedToken = { token: null, expiresAtMs: Date.now() + 5_000 }
          return null
        })()

        try {
          return await inFlightTokenRequest
        } finally {
          inFlightTokenRequest = null
        }
      }
    }),
    [shouldAttemptAuth]
  )
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  const auth = useTokenBridgeAuth()

  if (!convex) {
    return <>{children}</>
  }

  return (
    <ConvexProviderWithAuth client={convex} useAuth={() => auth}>
      {children}
    </ConvexProviderWithAuth>
  )
}
