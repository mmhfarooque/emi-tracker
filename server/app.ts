import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { schedule, validDate, type LoanInput, type Loan } from "./finance.js";
import { createGoogleProvider, type GoogleProvider } from "./google-auth.js";

const scrypt = promisify(scryptCallback);
type UserRow = {
  id: string;
  name: string;
  email: string;
  password: string;
  currency: string;
};
type LoanRow = LoanInput & { id: string; user_id: string };
const currencies = ["BDT", "USD", "EUR", "GBP", "INR"] as const;
const loanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lender: z.string().trim().min(1).max(80),
  category: z.enum([
    "Home",
    "Auto",
    "Personal",
    "Education",
    "Business",
    "Other",
  ]),
  principal: z
    .number()
    .min(1)
    .max(1_000_000_000)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
      "Use at most two decimal places",
    ),
  annualRate: z.number().min(0).max(60),
  months: z.number().int().min(1).max(600),
  firstDue: z
    .string()
    .refine(validDate, "Enter a valid first due date")
    .refine(
      (v) => v >= "2000-01-01" && v <= "2100-12-31",
      "Use a date between 2000 and 2100",
    ),
  color: z.enum(["sage", "blue", "peach", "lavender"]),
});
const accountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
  currency: z.enum(currencies).default("BDT"),
});
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createApp(
  databasePath: string,
  options: { google?: GoogleProvider | null } = {},
) {
  const google =
    options.google === undefined ? createGoogleProvider() : options.google;
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'BDT');
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, lender TEXT NOT NULL, category TEXT NOT NULL, principal REAL NOT NULL, annualRate REAL NOT NULL, months INTEGER NOT NULL, firstDue TEXT NOT NULL, color TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments (loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE, instalment INTEGER NOT NULL, paid_on TEXT NOT NULL, PRIMARY KEY (loan_id, instalment));
    CREATE INDEX IF NOT EXISTS loans_user ON loans(user_id);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS google_accounts (subject TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS oauth_attempts (state TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL, currency TEXT NOT NULL, link_user TEXT, link_session TEXT);`);
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok" });
  });
  const secure = process.env.COOKIE_SECURE === "true";
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? { directives: { "upgrade-insecure-requests": null } }
          : false,
      strictTransportSecurity: secure ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.get("host"))
          return res
            .status(403)
            .json({ error: "Cross-origin requests are not allowed." });
      } catch {
        return res.status(403).json({ error: "Invalid request origin." });
      }
    }
    next();
  });
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
    }),
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
  const createSession = (res: Response, userId: string) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
      hashToken(token),
      userId,
      Date.now() + 30 * 86400000,
    );
    res.cookie("emi_session", token, {
      ...cookieOptions,
      maxAge: 30 * 86400000,
    });
  };
  const safeUser = (u: UserRow) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    currency: u.currency,
    googleConnected: !!db
      .prepare("SELECT subject FROM google_accounts WHERE user_id = ?")
      .get(u.id),
    hasPassword: !!u.password,
  });
  const sessionFor = (req: Request) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("emi_session="))
      ?.slice(12);
    if (!token) return null;
    const user = db
      .prepare(
        "SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ?",
      )
      .get(hashToken(token), Date.now()) as UserRow | undefined;
    return user ? { user, token: hashToken(token) } : null;
  };
  const oauthCookie = { ...cookieOptions, path: "/api/auth/google/callback" };
  function beginGoogle(
    res: Response,
    currency: string,
    link?: { user: UserRow; token: string },
  ) {
    const state = randomBytes(32).toString("hex"),
      nonce = randomBytes(32).toString("hex"),
      verifier = randomBytes(48).toString("base64url");
    db.prepare("DELETE FROM oauth_attempts WHERE expires < ?").run(Date.now());
    db.prepare("INSERT INTO oauth_attempts VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      hashToken(state),
      nonce,
      verifier,
      Date.now() + 600000,
      currency,
      link?.user.id ?? null,
      link?.token ?? null,
    );
    res.cookie("emi_oauth", state, { ...oauthCookie, maxAge: 600000 });
    return google!.authorizationUrl({ state, nonce, verifier });
  }
  app.get("/api/auth/config", (_req, res) =>
    res.json({
      googleEnabled: !!google,
      registrationEnabled: process.env.ALLOW_REGISTRATION !== "false",
    }),
  );
  app.get("/api/auth/google", (req, res) => {
    if (!google) return res.redirect("/?auth_result=unavailable");
    const currency = currencies.includes(
      req.query.currency as (typeof currencies)[number],
    )
      ? String(req.query.currency)
      : "BDT";
    const canonical = new URL(google.redirectUri);
    if (req.get("host") !== canonical.host)
      return res.redirect(
        `${canonical.origin}/api/auth/google?currency=${currency}`,
      );
    return res.redirect(beginGoogle(res, currency));
  });
  app.get("/api/auth/google/callback", async (req, res) => {
    const fail = (code: string) => res.redirect(`/?auth_result=${code}`);
    if (!google) return fail("unavailable");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("emi_oauth="))
        ?.slice(10) ?? "";
    res.clearCookie("emi_oauth", oauthCookie);
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      cookie.length !== state.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))
    )
      return fail("expired");
    const attempt = db
      .prepare("DELETE FROM oauth_attempts WHERE state = ? RETURNING *")
      .get(hashToken(state)) as
      | {
          nonce: string;
          verifier: string;
          expires: number;
          currency: string;
          link_user: string | null;
          link_session: string | null;
        }
      | undefined;
    if (!attempt || attempt.expires < Date.now()) return fail("expired");
    if (req.query.error) return fail("cancelled");
    if (typeof req.query.code !== "string" || req.query.code.length > 4096)
      return fail("failed");
    const linkSession = attempt.link_user ? sessionFor(req) : null;
    if (
      attempt.link_user &&
      (!linkSession ||
        linkSession.user.id !== attempt.link_user ||
        linkSession.token !== attempt.link_session)
    )
      return fail("link_expired");
    try {
      const identity = await google.verify(req.query.code, attempt.verifier);
      if (
        !identity.emailVerified ||
        identity.nonce !== attempt.nonce ||
        !z.email().safeParse(identity.email).success
      )
        return fail("failed");
      const linked = db
        .prepare(
          "SELECT users.* FROM users JOIN google_accounts ON users.id = google_accounts.user_id WHERE google_accounts.subject = ?",
        )
        .get(identity.subject) as UserRow | undefined;
      if (attempt.link_user) {
        if (linked && linked.id !== attempt.link_user)
          return fail("google_in_use");
        if (!linked) {
          if (
            db
              .prepare("SELECT subject FROM google_accounts WHERE user_id = ?")
              .get(attempt.link_user)
          )
            return fail("already_linked");
          db.prepare("INSERT INTO google_accounts VALUES (?, ?)").run(
            identity.subject,
            attempt.link_user,
          );
        }
        return res.redirect("/?auth_result=linked");
      }
      let user = linked;
      if (!user) {
        if (
          db.prepare("SELECT id FROM users WHERE email = ?").get(identity.email)
        )
          return fail("email_in_use");
        if (process.env.ALLOW_REGISTRATION === "false")
          return fail("registration_disabled");
        user = {
          id: randomUUID(),
          name: identity.name,
          email: identity.email,
          password: "",
          currency: attempt.currency,
        };
        db.exec("BEGIN");
        try {
          db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run(
            user.id,
            user.name,
            user.email,
            user.password,
            user.currency,
          );
          db.prepare("INSERT INTO google_accounts VALUES (?, ?)").run(
            identity.subject,
            user.id,
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      createSession(res, user.id);
      return res.redirect("/");
    } catch {
      return fail("failed");
    }
  });
  app.post("/api/auth/register", async (req, res) => {
    if (process.env.ALLOW_REGISTRATION === "false")
      return res
        .status(403)
        .json({ error: "New account registration is disabled." });
    const data = accountSchema.parse(req.body);
    const salt = randomBytes(16).toString("hex");
    const key = (await scrypt(data.password, salt, 64)) as Buffer;
    const user = {
      id: randomUUID(),
      ...data,
      password: `${salt}:${key.toString("hex")}`,
    };
    try {
      db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run(
        user.id,
        user.name,
        user.email,
        user.password,
        user.currency,
      );
    } catch (error) {
      if (db.prepare("SELECT id FROM users WHERE email = ?").get(data.email))
        return res
          .status(409)
          .json({ error: "An account already uses that email." });
      throw error;
    }
    createSession(res, user.id);
    return res.status(201).json(safeUser(user));
  });
  app.post("/api/auth/login", async (req, res) => {
    const data = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(data.email) as UserRow | undefined;
    const [salt, expected] = (user?.password
      ? user.password.split(":")
      : undefined) ?? ["missing-user-salt", "00".repeat(64)];
    const actual = (await scrypt(data.password, salt, 64)) as Buffer;
    if (
      !user?.password ||
      !timingSafeEqual(actual, Buffer.from(expected, "hex"))
    )
      return res.status(401).json({ error: "Email or password is incorrect." });
    createSession(res, user.id);
    return res.json(safeUser(user));
  });
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("emi_session="))
      ?.slice(12);
    const user =
      token &&
      (db
        .prepare(
          "SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ?",
        )
        .get(hashToken(token), Date.now()) as UserRow | undefined);
    if (!user)
      return res.status(401).json({ error: "Please sign in to continue." });
    res.locals.user = user;
    res.locals.token = hashToken(token!);
    next();
  });
  app.get("/api/me", (_req, res) => res.json(safeUser(res.locals.user)));
  app.post("/api/me/google", (req, res) => {
    if (!google)
      return res
        .status(503)
        .json({ error: "Google sign-in is not available yet." });
    if (
      db
        .prepare("SELECT subject FROM google_accounts WHERE user_id = ?")
        .get(res.locals.user.id)
    )
      return res
        .status(409)
        .json({ error: "A Google account is already connected." });
    if (req.get("host") !== new URL(google.redirectUri).host)
      return res
        .status(400)
        .json({
          error:
            "Open this workspace using the configured Google callback origin first.",
        });
    return res.json({
      url: beginGoogle(res, res.locals.user.currency, {
        user: res.locals.user,
        token: res.locals.token,
      }),
    });
  });
  app.post("/api/logout", (_req, res) => {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(res.locals.token);
    res.clearCookie("emi_session", cookieOptions).json({ ok: true });
  });
  app.patch("/api/me", (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(60),
        currency: z.enum(currencies),
      })
      .parse(req.body);
    if (
      data.currency !== res.locals.user.currency &&
      db
        .prepare("SELECT id FROM loans WHERE user_id = ? LIMIT 1")
        .get(res.locals.user.id)
    )
      return res.status(409).json({
        error:
          "Currency cannot be changed while you have loans. Amounts are not automatically converted.",
      });
    db.prepare("UPDATE users SET name = ?, currency = ? WHERE id = ?").run(
      data.name,
      data.currency,
      res.locals.user.id,
    );
    res.json(safeUser({ ...res.locals.user, ...data }));
  });
  function serialize(row: LoanRow): Loan {
    const paid = db
      .prepare("SELECT instalment, paid_on FROM payments WHERE loan_id = ?")
      .all(row.id) as { instalment: number; paid_on: string }[];
    const { user_id: _, ...loan } = row;
    return {
      ...loan,
      schedule: schedule(loan).map((s) => ({
        ...s,
        paidOn: paid.find((p) => p.instalment === s.number)?.paid_on ?? null,
      })),
    };
  }
  function ownedLoan(id: string, userId: string) {
    return db
      .prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
      .get(id, userId) as LoanRow | undefined;
  }
  function insertLoan(userId: string, data: LoanInput) {
    const id = randomUUID();
    db.prepare("INSERT INTO loans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      userId,
      data.name,
      data.lender,
      data.category,
      data.principal,
      data.annualRate,
      data.months,
      data.firstDue,
      data.color,
    );
    return id;
  }
  app.get("/api/loans", (_req, res) =>
    res.json(
      (
        db
          .prepare("SELECT * FROM loans WHERE user_id = ? ORDER BY rowid DESC")
          .all(res.locals.user.id) as LoanRow[]
      ).map(serialize),
    ),
  );
  app.post("/api/loans", (req, res) => {
    const data = loanSchema.parse(req.body);
    const id = insertLoan(res.locals.user.id, data);
    res.status(201).json(serialize(ownedLoan(id, res.locals.user.id)!));
  });
  app.delete("/api/loans/:id", (req, res) => {
    if (!ownedLoan(req.params.id, res.locals.user.id))
      return res.status(404).json({ error: "Loan not found." });
    db.prepare("DELETE FROM loans WHERE id = ? AND user_id = ?").run(
      req.params.id,
      res.locals.user.id,
    );
    res.json({ ok: true });
  });
  app.put("/api/loans/:id/payments/:number", (req, res) => {
    const loan = ownedLoan(req.params.id, res.locals.user.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    const number = z.coerce
      .number()
      .int()
      .min(1)
      .max(loan.months)
      .parse(req.params.number);
    const { paidOn } = z
      .object({
        paidOn: z
          .string()
          .refine(validDate, "Invalid payment date")
          .refine(
            (v) => v <= new Date().toISOString().slice(0, 10),
            "Payment date cannot be in the future",
          ),
      })
      .parse(req.body);
    db.prepare(
      "INSERT INTO payments VALUES (?, ?, ?) ON CONFLICT (loan_id, instalment) DO UPDATE SET paid_on = excluded.paid_on",
    ).run(loan.id, number, paidOn);
    res.json(serialize(loan));
  });
  app.delete("/api/loans/:id/payments/:number", (req, res) => {
    const loan = ownedLoan(req.params.id, res.locals.user.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });
    const number = z.coerce
      .number()
      .int()
      .min(1)
      .max(loan.months)
      .parse(req.params.number);
    db.prepare("DELETE FROM payments WHERE loan_id = ? AND instalment = ?").run(
      loan.id,
      number,
    );
    res.json(serialize(loan));
  });
  app.post("/api/sample", (_req, res) => {
    if (
      db
        .prepare("SELECT id FROM loans WHERE user_id = ? LIMIT 1")
        .get(res.locals.user.id)
    )
      return res
        .status(409)
        .json({ error: "Sample loans can only be added to an empty account." });
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 5),
    )
      .toISOString()
      .slice(0, 10);
    const samples: LoanInput[] = [
      {
        name: "A place to call home",
        lender: "Home bank",
        category: "Home",
        principal: 2400000,
        annualRate: 9.5,
        months: 120,
        firstDue: start,
        color: "sage",
      },
      {
        name: "The everyday drive",
        lender: "Auto finance",
        category: "Auto",
        principal: 650000,
        annualRate: 11,
        months: 48,
        firstDue: start.slice(0, 8) + "18",
        color: "blue",
      },
      {
        name: "A fresh start",
        lender: "Personal bank",
        category: "Personal",
        principal: 180000,
        annualRate: 12,
        months: 24,
        firstDue: start.slice(0, 8) + "25",
        color: "peach",
      },
    ];
    db.exec("BEGIN");
    try {
      for (const sample of samples) {
        const id = insertLoan(res.locals.user.id, sample);
        for (const row of schedule(sample).slice(0, 6))
          db.prepare("INSERT INTO payments VALUES (?, ?, ?)").run(
            id,
            row.number,
            row.dueDate,
          );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.status(201).json({ ok: true });
  });
  const escapeCSV = (v: unknown) => {
    let value = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  };
  app.get("/api/export", (_req, res) => {
    const loans = (
      db
        .prepare("SELECT * FROM loans WHERE user_id = ? ORDER BY rowid")
        .all(res.locals.user.id) as LoanRow[]
    ).map(serialize);
    const rows: unknown[][] = [
      [
        "Loan",
        "Lender",
        "Currency",
        "Instalment",
        "Due date",
        "Amount",
        "Principal",
        "Interest",
        "Scheduled balance",
        "Paid on",
      ],
    ];
    for (const loan of loans)
      for (const s of loan.schedule)
        rows.push([
          loan.name,
          loan.lender,
          res.locals.user.currency,
          s.number,
          s.dueDate,
          (s.amount / 100).toFixed(2),
          (s.principal / 100).toFixed(2),
          (s.interest / 100).toFixed(2),
          (s.balance / 100).toFixed(2),
          s.paidOn ?? "",
        ]);
    res
      .attachment("emi-tracker.csv")
      .type("text/csv")
      .send(
        "\uFEFF" + rows.map((r) => r.map(escapeCSV).join(",")).join("\r\n"),
      );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (err instanceof SyntaxError && "body" in err)
      return res.status(400).json({ error: "Invalid JSON body." });
    if (err && typeof err === "object" && "status" in err && err.status === 413)
      return res.status(413).json({ error: "Request is too large." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return { app, db };
}
