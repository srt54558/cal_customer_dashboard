import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createHmac, timingSafeEqual } from "node:crypto"
import { env, requireEnv } from "@/lib/env"
import {
  resolveCustomerMappingByEmailDomainDetailed,
  validateSessionObject,
} from "@/lib/data-store"
import { api } from "@/convex/_generated/api"
import { convexMutationForSession, convexSetUserProfile } from "@/lib/convex-server"
import { type Role, type Session } from "@/lib/models"

export interface CalUser {
  id: string
  email: string
  username: string
  name: string
  avatarUrl?: string
}

const SESSION_COOKIE_NAME = "cal_session"
const OAUTH_STATE_COOKIE_NAME = "cal_oauth_state"

function normalizeAvatarUrl(avatarUrl?: string): string | undefined {
  if (!avatarUrl) return undefined
  if (/^https?:\/\//i.test(avatarUrl) || avatarUrl.startsWith("data:")) {
    return avatarUrl
  }
  if (avatarUrl.startsWith("/")) {
    return `https://app.cal.com${avatarUrl}`
  }
  return avatarUrl
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8")
}

function signValue(value: string): string {
  const secret = env.sessionSecret || requireEnv("SESSION_SECRET")
  return createHmac("sha256", secret).update(value).digest("base64url")
}

function encodeSessionCookie(session: Session): string {
  const payload = base64urlEncode(JSON.stringify(session))
  const signature = signValue(payload)
  return `${payload}.${signature}`
}

function decodeSessionCookie(raw: string): Session | null {
  const [payload, signature] = raw.split(".")
  if (!payload || !signature) {
    return null
  }

  const expectedSignature = signValue(payload)
  const signatureBuffer = Buffer.from(signature, "utf8")
  const expectedBuffer = Buffer.from(expectedSignature, "utf8")
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsed = JSON.parse(base64urlDecode(payload))
    return validateSessionObject(parsed)
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    const session = decodeSessionCookie(sessionCookie.value)
    if (!session) {
      return null
    }
    if (session.role !== "customer_user") {
      return null
    }

    if (Date.now() >= session.expiresAt) {
      const refreshed = await refreshAccessToken(session)
      if (!refreshed) {
        await clearSession()
        return null
      }
      await setSession(refreshed)
      return refreshed
    }

    return {
      ...session,
      user: {
        ...session.user,
        avatarUrl: normalizeAvatarUrl(session.user.avatarUrl),
      },
    }
  } catch {
    return null
  }
}

export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function setOauthState(state: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  })
}

export async function getOauthState(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value || null
}

export async function clearOauthState(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(OAUTH_STATE_COOKIE_NAME)
}

async function refreshAccessToken(session: Session): Promise<Session | null> {
  try {
    const response = await fetch("https://api.cal.com/v2/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.calClientId,
        client_secret: env.calClientSecret,
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const refreshedUser = await fetchCalUserProfile(data.access_token).catch(() => session.user)
    const refreshedSession: Session = {
      ...session,
      user: refreshedUser,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    await syncProfileToConvex(refreshedSession).catch(() => null)
    return refreshedSession
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  if (session.accessDeniedReason) {
    redirect("/access-denied")
  }
  return session
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.calClientId,
    redirect_uri: env.calRedirectUri,
    state,
    scope: "PROFILE_READ",
  })

  return `https://app.cal.com/auth/oauth2/authorize?${params.toString()}`
}

type CalOAuthTokens = {
  access_token: string
  refresh_token: string
  expires_in: number
}

function normalizeCalTokenPayload(payload: unknown): CalOAuthTokens | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const direct = payload as Partial<CalOAuthTokens>
  if (direct.access_token && direct.refresh_token && typeof direct.expires_in === "number") {
    return {
      access_token: direct.access_token,
      refresh_token: direct.refresh_token,
      expires_in: direct.expires_in,
    }
  }

  const wrapped = (payload as { data?: Partial<CalOAuthTokens> }).data
  if (wrapped?.access_token && wrapped.refresh_token && typeof wrapped.expires_in === "number") {
    return {
      access_token: wrapped.access_token,
      refresh_token: wrapped.refresh_token,
      expires_in: wrapped.expires_in,
    }
  }

  return null
}

async function fetchCalUserProfile(accessToken: string): Promise<CalUser> {
  const profileResponse = await fetch("https://api.cal.com/v2/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (!profileResponse.ok) {
    throw new Error("Failed to fetch user profile")
  }

  const profileData = await profileResponse.json()
  const rawUser = profileData.data

  return {
    id: String(rawUser.id),
    email: String(rawUser.email),
    username: String(rawUser.username),
    name: String(rawUser.name || rawUser.username),
    avatarUrl: normalizeAvatarUrl(rawUser.avatarUrl || undefined),
  }
}

async function syncProfileToConvex(session: Session): Promise<void> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return

  try {
    await convexMutationForSession(session, api.portal.syncMyProfileScoped, {
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
    })
    return
  } catch {
    // Fallback for environments still relying on internal secret wiring.
  }

  await convexSetUserProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    avatarUrl: session.user.avatarUrl,
  })
}

export async function createSessionFromCalTokens(tokensPayload: unknown): Promise<Session> {
  const tokens = normalizeCalTokenPayload(tokensPayload)
  if (!tokens) {
    throw new Error("Invalid OAuth token payload")
  }

  const user = await fetchCalUserProfile(tokens.access_token)

  const role: Role = "customer_user"

  const mapping = await resolveCustomerMappingByEmailDomainDetailed(user.email)
  const customerIds = mapping.customerIds || []

  const nextSession: Session = {
    user,
    role,
    customerIds,
    accessDeniedReason: mapping.reason ?? undefined,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
  await syncProfileToConvex(nextSession).catch(() => null)
  return nextSession
}
