import { chromium, devices, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const temp = mkdtempSync(path.join(tmpdir(), "emi-browser-"));
const base = "http://127.0.0.1:3317";
const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    APP_HOST: "127.0.0.1",
    PORT: "3317",
    DATABASE_PATH: path.join(temp, "browser.sqlite"),
    COOKIE_SECURE: "false",
    TRUST_PROXY: "0",
    ALLOW_REGISTRATION: "true",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout?.on("data", (d) => (output += d));
server.stderr?.on("data", (d) => (output += d));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const errors: string[] = [];
async function noOverflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(widths.page, `${label}: no page overflow`).toBeLessThanOrEqual(
    widths.viewport,
  );
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i === 99) throw new Error(output);
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const { defaultBrowserType: _, ...phone } = devices["iPhone 13"];
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/mobile-auth.png",
    fullPage: true,
  });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page, `auth ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Your name", { exact: true }).fill("Mahmud");
  await page.getByLabel("Email address").fill("mobile-test@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-mobile-test-password");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Mahmud." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore sample loans" }).click();
  await expect(
    page.getByRole("button", { name: "A place to call home" }),
  ).toBeVisible();
  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width > 900 ? 1000 : 844 });
    await noOverflow(page, `dashboard ${width}`);
    const amountsFit = await page
      .locator(".stat-card .fit-amount, .next-payment .fit-amount")
      .evaluateAll((elements) =>
        elements.every((e) => e.scrollWidth <= e.clientWidth + 1),
      );
    expect(amountsFit, `financial amounts fit at ${width}px`).toBe(true);
    for (const name of [
      "My loans",
      "Payments",
      "EMI calculator",
      "Settings",
      "Overview",
    ]) {
      const link =
        width <= 900
          ? mobileNav.getByRole("button", {
              name:
                name === "My loans"
                  ? "Loans"
                  : name === "EMI calculator"
                    ? "Calculator"
                    : name === "Overview"
                      ? "Home"
                      : name,
              exact: true,
            })
          : page
              .getByRole("navigation", { name: "Main navigation" })
              .getByRole("button", { name, exact: name !== "My loans" });
      if (name === "Settings" && width > 900)
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
      else await link.click();
      await noOverflow(page, `${name} ${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Add a loan", exact: true }).click();
  await page.getByLabel("Loan name").fill("Mobile test loan");
  await page.getByLabel("Lender", { exact: true }).fill("Test lender");
  await page.getByLabel("Loan amount").fill("1200");
  await page.getByLabel("Annual interest rate").fill("0");
  await page.getByLabel("Tenure").fill("12");
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page, `loan form ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize({ width: 390, height: 540 });
  await noOverflow(page, "loan form with reduced keyboard-height viewport");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add loan", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Add loan", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add loan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await mobileNav.getByRole("button", { name: "Loans", exact: true }).click();
  await page.getByRole("button", { name: "Mobile test loan" }).click();
  await noOverflow(page, "loan schedule 390");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record" })
    .first()
    .click();
  await noOverflow(page, "record payment 390");
  await page.getByRole("button", { name: "Confirm payment" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Paid · undo" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Mobile test loan" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Paid · undo" }),
  ).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Paid · undo" })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Paid · undo" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Delete loan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete loan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mobile test loan" }),
  ).toHaveCount(0);
  await mobileNav
    .getByRole("button", { name: "Calculator", exact: true })
    .click();
  await page.getByLabel("Loan amount").fill("1200");
  await page.getByLabel("Annual interest rate").fill("0");
  await page.getByLabel("Tenure").fill("12");
  await expect(page.locator(".calculator-result>h2")).toContainText("100.00");
  await page.getByRole("button", { name: "Track this as a loan" }).click();
  await expect(page.getByRole("dialog").getByLabel("Loan amount")).toHaveValue(
    "1200",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await mobileNav.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  mkdirSync("test-results", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/mobile-390.png",
    fullPage: false,
  });
  await mobileNav
    .getByRole("button", { name: "Payments", exact: true })
    .click();
  await page.screenshot({ path: "test-results/mobile-payments.png" });
  await mobileNav.getByRole("button", { name: "Home", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: "test-results/mobile-320.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    "PASS: 7 viewport widths, all pages, mobile account creation, sample data, loan creation, payment, reload persistence, undo, deletion, calculator, and no browser errors.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  rmSync(temp, { recursive: true, force: true });
}
