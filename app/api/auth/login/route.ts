import { NextResponse } from "next/server"
import { getAuthorizationUrl, setOauthState } from "@/lib/auth"

export async function GET() {
  const state = crypto.randomUUID()
  await setOauthState(state)
  const authUrl = getAuthorizationUrl(state)
  return NextResponse.redirect(authUrl)
}
