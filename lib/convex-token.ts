import { SignJWT, exportJWK, importPKCS8, importSPKI } from "jose"
import { env, requireEnv } from "@/lib/env"
import { CONVEX_SESSION_CLAIM, CONVEX_TOKEN_AUDIENCE } from "@/lib/convex-auth"
import type { Session } from "@/lib/models"

const ALG = "RS256"

function getIssuer(): string {
  return process.env.CONVEX_AUTH_ISSUER || env.appUrl
}

function getAudience(): string {
  return process.env.CONVEX_AUTH_AUDIENCE || CONVEX_TOKEN_AUDIENCE
}

export async function mintConvexToken(session: Session): Promise<string> {
  const privateKeyPem = requireEnv("CONVEX_JWT_PRIVATE_KEY")
  const keyId = requireEnv("CONVEX_JWT_KID")

  const privateKey = await importPKCS8(privateKeyPem, ALG)

  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    [CONVEX_SESSION_CLAIM]: {
      user: session.user,
      role: session.role,
      customerIds: session.customerIds,
    },
    email: session.user.email,
    name: session.user.name,
  })
    .setProtectedHeader({ alg: ALG, kid: keyId, typ: "JWT" })
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .setSubject(session.user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 5)
    .sign(privateKey)
}

export async function getConvexJwks(): Promise<{ keys: Record<string, unknown>[] }> {
  const publicKeyPem = requireEnv("CONVEX_JWT_PUBLIC_KEY")
  const keyId = requireEnv("CONVEX_JWT_KID")
  const publicKey = await importSPKI(publicKeyPem, ALG)
  const jwk = await exportJWK(publicKey)

  return {
    keys: [
      {
        ...jwk,
        alg: ALG,
        use: "sig",
        kid: keyId,
      },
    ],
  }
}
