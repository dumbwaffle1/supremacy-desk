/**
 * Generates the RS256 keypair Convex Auth uses to sign/verify session JWTs.
 * Prints two values to paste into your Convex deployment env:
 *
 *   node scripts/generateKeys.mjs
 *   # then:
 *   npx convex env set JWT_PRIVATE_KEY -- "<printed private key>"
 *   npx convex env set JWKS '<printed jwks json>'
 *
 * (Or just run `npx @convex-dev/auth` once, which does this for you.)
 * `jose` ships transitively with @auth/core, so no extra install is needed.
 */
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

console.log("\n=== JWT_PRIVATE_KEY (set as a single line, keep the \\n's) ===\n");
console.log(privateKey.trimEnd().replace(/\n/g, " "));
console.log("\n=== JWKS ===\n");
console.log(jwks);
console.log("");
