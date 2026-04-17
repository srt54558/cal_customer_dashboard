import { NextResponse } from "next/server"
import { env } from "@/lib/env"

function getIssuer(): string {
  return (process.env.CONVEX_AUTH_ISSUER || env.appUrl).replace(/\/+$/, "")
}

export async function GET() {
  const issuer = getIssuer()

  return NextResponse.json({
    issuer,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    id_token_signing_alg_values_supported: ["RS256"],
    subject_types_supported: ["public"],
    response_types_supported: ["id_token"],
    claims_supported: [
      "iss",
      "sub",
      "aud",
      "exp",
      "iat",
      "email",
      "name",
      "https://cal-portal/session",
    ],
  })
}

