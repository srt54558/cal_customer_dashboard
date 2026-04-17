import { NextResponse } from "next/server"
import { clearOauthState, clearSession, getSession } from "@/lib/auth"
import { env } from "@/lib/env"
import { convexDeleteAccountScoped } from "@/lib/convex-server"

async function handleLogout(purge: boolean): Promise<NextResponse> {
  if (purge && process.env.NEXT_PUBLIC_CONVEX_URL) {
    try {
      const session = await getSession()
      if (session) {
        await convexDeleteAccountScoped(session)
      }
    } catch {
      // Do not block logout on cleanup failures.
    }
  }

  await clearOauthState()
  await clearSession()
  return NextResponse.redirect(new URL("/login", env.appUrl))
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const purge = url.searchParams.get("purge") === "1"
  return handleLogout(purge)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const purge = url.searchParams.get("purge") === "1"
  return handleLogout(purge)
}
