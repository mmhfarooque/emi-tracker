import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { createHash } from "node:crypto";

export type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  nonce: string;
  emailVerified: boolean;
};
export type GoogleProvider = {
  redirectUri: string;
  authorizationUrl(values: {
    state: string;
    nonce: string;
    verifier: string;
  }): string;
  verify(code: string, verifier: string): Promise<GoogleIdentity>;
};

export function createGoogleProvider(env = process.env): GoogleProvider | null {
  const clientId = env.GOOGLE_CLIENT_ID,
    clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    env.GOOGLE_REDIRECT_URI ||
    `http://127.0.0.1:${env.PORT || "3100"}/api/auth/google/callback`;
  const url = new URL(redirectUri);
  if (
    url.pathname !== "/api/auth/google/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "GOOGLE_REDIRECT_URI must be an HTTPS callback URL, or HTTP localhost for development.",
    );
  }
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  return {
    redirectUri,
    authorizationUrl({ state, nonce, verifier }) {
      const result = new URL(
        client.generateAuthUrl({
          scope: ["openid", "email", "profile"],
          state,
          prompt: "select_account",
          code_challenge_method: CodeChallengeMethod.S256,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        }),
      );
      result.searchParams.set("nonce", nonce);
      return result.href;
    },
    async verify(code, verifier) {
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier,
      });
      if (!tokens.id_token) throw new Error("Missing Google ID token");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email)
        throw new Error("Missing Google identity");
      return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: (payload.name || payload.email.split("@")[0]).slice(0, 60),
        nonce: (payload as typeof payload & { nonce?: string }).nonce || "",
      };
    },
  };
}
