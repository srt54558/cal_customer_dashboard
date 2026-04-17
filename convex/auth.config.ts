const issuer = process.env.CONVEX_AUTH_ISSUER || "http://localhost:3000"
const applicationID = process.env.CONVEX_AUTH_AUDIENCE || "cal-customer-portal"

export default {
  providers: [
    {
      domain: issuer,
      applicationID,
    },
  ],
};
