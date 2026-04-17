import { describe, expect, it } from "vitest"
import { SessionSchema, slugifyCustomer } from "@/lib/models"

describe("slugifyCustomer", () => {
  it("uses domain prefix when present", () => {
    expect(slugifyCustomer("Acme Inc", ["acme.com"])).toBe("acme")
  })

  it("falls back to customer name", () => {
    expect(slugifyCustomer("My Great Customer", [])).toBe("my-great-customer")
  })
})

describe("SessionSchema", () => {
  it("validates required production session fields", () => {
    const parsed = SessionSchema.safeParse({
      user: {
        id: "1",
        email: "user@example.com",
        username: "user",
        name: "User",
      },
      role: "customer_user",
      customerIds: ["cust_1"],
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 1000,
    })

    expect(parsed.success).toBe(true)
  })
})
