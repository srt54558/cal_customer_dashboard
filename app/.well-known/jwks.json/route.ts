import { NextResponse } from "next/server"
import { getConvexJwks } from "@/lib/convex-token"

export async function GET() {
  try {
    const jwks = await getConvexJwks()
    return NextResponse.json(jwks)
  } catch {
    // Keep build/runtime resilient when JWT envs are not configured yet.
    return NextResponse.json(
      {
        keys: [],
        error: "JWKS_NOT_CONFIGURED",
      },
      { status: 503 },
    )
  }
}
