import { NextRequest, NextResponse } from "next/server"
import {
  clearOauthState,
  createSessionFromCalTokens,
  getOauthState,
  setSession,
} from "@/lib/auth"
import { env } from "@/lib/env"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const state = searchParams.get("state")

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=OAUTH_DENIED", env.appUrl)
    )
  }

  const storedState = await getOauthState()
  await clearOauthState()

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=AUTH_SESSION_EXPIRED", env.appUrl))
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=AUTH_NO_CODE", env.appUrl))
  }

  try {
    const tokenResponse = await fetch("https://api.cal.com/v2/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.calClientId,
        client_secret: env.calClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.calRedirectUri,
      }),
      cache: "no-store",
    })

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=AUTH_FAILED", env.appUrl))
    }

    const tokens = await tokenResponse.json()

    const session = await createSessionFromCalTokens(tokens)
    await setSession(session)
    if (session.accessDeniedReason) {
      return NextResponse.redirect(new URL("/access-denied", env.appUrl))
    }
    return NextResponse.redirect(new URL("/", env.appUrl))
  } catch {
    return NextResponse.redirect(new URL("/login?error=AUTH_FAILED", env.appUrl))
  }
}
