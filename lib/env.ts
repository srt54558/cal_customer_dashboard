export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  calClientId: process.env.CAL_CLIENT_ID || "",
  calClientSecret: process.env.CAL_CLIENT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  calRedirectUri: process.env.CAL_REDIRECT_URI || "",
  linearApiKey: process.env.LINEAR_API_KEY || "",
  linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET || "",
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL || "",
}

export function requireEnv(name: keyof typeof process.env): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}
