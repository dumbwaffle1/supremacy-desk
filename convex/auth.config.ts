// JWT issuer config for Convex Auth. CONVEX_SITE_URL is provided automatically
// by the Convex deployment; the JWT keys (JWT_PRIVATE_KEY / JWKS) are generated
// during auth setup — see DEPLOY.md.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
