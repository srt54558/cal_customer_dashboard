import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { mintConvexToken } from "@/lib/convex-token"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED", code: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.accessDeniedReason) {
    return NextResponse.json({ error: "FORBIDDEN", code: "FORBIDDEN" }, { status: 403 })
  }

  const token = await mintConvexToken(session)
  return NextResponse.json({ token })
}
