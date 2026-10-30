import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app.js";
import {
  createGoogleProvider,
  type GoogleProvider,
  type GoogleIdentity,
} from "../server/google-auth.js";

const host = "127.0.0.1:3100";
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "emi-google-"));
  let nonce = "";
  const identity: GoogleIdentity = {
    subject: "google-subject-1",
    email: "google@example.com",
    name: "Google User",
    emailVerified: true,
    nonce: "",
  };
  const provider: GoogleProvider = {
    redirectUri: `http://${host}/api/auth/google/callback`,
    authorizationUrl(values) {
      nonce = values.nonce;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${values.state}`;
    },
    async verify(code, verifier) {
      assert.ok(verifier.length >= 43);
      if (code === "invalid") throw new Error("Rejected token");
      return {
        ...identity,
        nonce: code === "wrong-nonce" ? "incorrect" : nonce,
      };
    },
  };
  const { app, db } = createApp(path.join(dir, "test.sqlite"), {
    google: provider,
  });
  const start = async (agent: ReturnType<typeof request.agent>) => {
    const res = await agent
      .get("/api/auth/google?currency=USD")
      .set("Host", host)
      .expect(302);
    assert.ok(res.headers["set-cookie"][0].includes("HttpOnly"));
    assert.ok(res.headers["set-cookie"][0].includes("SameSite=Lax"));
    const state = new URL(res.headers.location).searchParams.get("state")!;
    return `/api/auth/google/callback?state=${state}&code=success`;
  };
  return {
    app,
    db,
    identity,
    start,
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("Google provider uses PKCE, minimum identity scopes and a fixed callback", () => {
  assert.equal(createGoogleProvider({}), null);
  assert.throws(() =>
    createGoogleProvider({
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-placeholder",
      GOOGLE_REDIRECT_URI: "http://example.com/api/auth/google/callback",
    }),
  );
  const provider = createGoogleProvider({
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-placeholder",
    GOOGLE_REDIRECT_URI: `http://${host}/api/auth/google/callback`,
  })!;
  const url = new URL(
    provider.authorizationUrl({
      state: "test-state",
      nonce: "test-nonce",
      verifier: "a".repeat(64),
    }),
  );
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("nonce"), "test-nonce");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("client_secret"), null);
  assert.equal(url.searchParams.get("redirect_uri"), provider.redirectUri);
});

test("Google signup, stable subject login, password rejection, and callback replay protection", async () => {
  const f = fixture();
  try {
    const agent = request.agent(f.app);
    assert.equal(
      (await agent.get("/api/auth/config")).body.googleEnabled,
      true,
    );
    const callback = await f.start(agent);
    await agent.get(callback).expect(302).expect("Location", "/");
    const me = (await agent.get("/api/me").expect(200)).body;
    assert.equal(me.email, "google@example.com");
    assert.equal(me.currency, "USD");
    assert.equal(me.googleConnected, true);
    assert.equal(me.hasPassword, false);
    await agent
      .get(callback)
      .expect(302)
      .expect("Location", "/?auth_result=expired");
    await agent.post("/api/logout").expect(200);
    await agent
      .post("/api/auth/login")
      .send({ email: "google@example.com", password: "anything" })
      .expect(401);
    f.identity.email = "updated@example.com";
    await agent
      .get(await f.start(agent))
      .expect(302)
      .expect("Location", "/");
    assert.equal((await agent.get("/api/me")).body.id, me.id);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get()!.n, 1);
  } finally {
    f.close();
  }
});

test("rejects missing browser state, expiry, cancellation, unverified email, invalid token and nonce mismatch", async () => {
  const f = fixture();
  try {
    const agent = request.agent(f.app);
    const callback = await f.start(agent);
    await request(f.app)
      .get(callback)
      .expect(302)
      .expect("Location", "/?auth_result=expired");
    f.db.prepare("UPDATE oauth_attempts SET expires = 0").run();
    await agent
      .get(callback)
      .expect(302)
      .expect("Location", "/?auth_result=expired");
    await agent
      .get(
        (await f.start(agent)).replace("code=success", "error=access_denied"),
      )
      .expect(302)
      .expect("Location", "/?auth_result=cancelled");
    for (const code of ["invalid", "wrong-nonce"])
      await agent
        .get((await f.start(agent)).replace("code=success", `code=${code}`))
        .expect(302)
        .expect("Location", "/?auth_result=failed");
    f.identity.emailVerified = false;
    await agent
      .get(await f.start(agent))
      .expect(302)
      .expect("Location", "/?auth_result=failed");
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get()!.n, 0);
  } finally {
    f.close();
  }
});

test("password accounts require explicit Google linking and preserve their workspace", async () => {
  const f = fixture();
  try {
    const owner = request.agent(f.app),
      google = request.agent(f.app);
    const registered = await owner
      .post("/api/auth/register")
      .send({
        name: "Owner",
        email: f.identity.email,
        password: "test-owner-password",
      })
      .expect(201);
    await google
      .get(await f.start(google))
      .expect(302)
      .expect("Location", "/?auth_result=email_in_use");
    await google.get("/api/me").expect(401);
    const link = await owner
      .post("/api/me/google")
      .set("Host", host)
      .expect(200);
    const state = new URL(link.body.url).searchParams.get("state");
    await owner
      .get(`/api/auth/google/callback?state=${state}&code=success`)
      .expect(302)
      .expect("Location", "/?auth_result=linked");
    assert.equal((await owner.get("/api/me")).body.googleConnected, true);
    await google
      .get(await f.start(google))
      .expect(302)
      .expect("Location", "/");
    assert.equal((await google.get("/api/me")).body.id, registered.body.id);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get()!.n, 1);
  } finally {
    f.close();
  }
});

test("linking requires the same active session and Google signup respects closed registration", async () => {
  const f = fixture(),
    previous = process.env.ALLOW_REGISTRATION;
  try {
    const agent = request.agent(f.app);
    await agent
      .post("/api/auth/register")
      .send({
        name: "Owner",
        email: "local@example.com",
        password: "test-owner-password",
      })
      .expect(201);
    const link = await agent
      .post("/api/me/google")
      .set("Host", host)
      .expect(200);
    await agent.post("/api/logout").expect(200);
    await agent
      .get(
        `/api/auth/google/callback?state=${new URL(link.body.url).searchParams.get("state")}&code=success`,
      )
      .expect(302)
      .expect("Location", "/?auth_result=link_expired");
    process.env.ALLOW_REGISTRATION = "false";
    await agent
      .get(await f.start(agent))
      .expect(302)
      .expect("Location", "/?auth_result=registration_disabled");
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM google_accounts").get()!.n,
      0,
    );
  } finally {
    if (previous === undefined) delete process.env.ALLOW_REGISTRATION;
    else process.env.ALLOW_REGISTRATION = previous;
    f.close();
  }
});
