import { describe, expect, it } from "vitest"

function resolveRole(email: string, whitelist: Set<string>) {
  return whitelist.has(email.toLowerCase()) ? "employee" : "customer_user"
}

describe("role resolution", () => {
  it("maps whitelisted user to employee", () => {
    const whitelist = new Set(["staff@cal.com"])
    expect(resolveRole("staff@cal.com", whitelist)).toBe("employee")
  })

  it("maps non-whitelisted user to customer_user", () => {
    const whitelist = new Set(["staff@cal.com"])
    expect(resolveRole("user@acme.com", whitelist)).toBe("customer_user")
  })
})
