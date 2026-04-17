import { NextResponse } from "next/server"
import { getConvexJwks } from "@/lib/convex-token"

export async function GET() {
  const jwks = await getConvexJwks()
  return NextResponse.json(jwks)
}
