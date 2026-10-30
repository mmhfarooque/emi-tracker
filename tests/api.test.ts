import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app.js";

test("accounts, ownership, payment lifecycle, exports, and database persistence", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emi-api-"));
  let { app, db } = createApp(path.join(dir, "test.sqlite"));
  try {
    const owner = request.agent(app),
      other = request.agent(app);
    await request(app).get("/api/loans").expect(401);
    await owner
      .post("/api/auth/register")
      .send({
        name: "Owner",
        email: "OWNER@example.com",
        password: "safe-test-password",
        currency: "BDT",
      })
      .expect(201);
    const me = await owner.get("/api/me").expect(200);
    assert.equal(me.body.email, "owner@example.com");
    assert.equal(me.body.password, undefined);
    await other
      .post("/api/auth/register")
      .send({
        name: "Other",
        email: "other@example.com",
        password: "safe-test-password",
      })
      .expect(201);
    const data = {
      name: '=HYPERLINK("test")',
      lender: "Test bank",
      category: "Home",
      principal: 100000,
      annualRate: 12,
      months: 12,
      firstDue: "2026-01-31",
      color: "sage",
    };
    await owner
      .post("/api/loans")
      .send({ ...data, months: 0 })
      .expect(400);
    await owner
      .post("/api/loans")
      .send({ ...data, firstDue: "2026-02-30" })
      .expect(400);
    await owner
      .post("/api/loans")
      .set("Origin", "https://malicious.example")
      .send(data)
      .expect(403);
    const created = await owner.post("/api/loans").send(data).expect(201),
      id = created.body.id;
    assert.equal(created.body.schedule.length, 12);
    assert.equal(created.body.user_id, undefined);
    assert.deepEqual((await other.get("/api/loans").expect(200)).body, []);
    await other
      .put(`/api/loans/${id}/payments/1`)
      .send({ paidOn: "2026-01-31" })
      .expect(404);
    await other.delete(`/api/loans/${id}`).expect(404);
    await owner
      .put(`/api/loans/${id}/payments/13`)
      .send({ paidOn: "2026-01-31" })
      .expect(400);
    await owner
      .put(`/api/loans/${id}/payments/1`)
      .send({ paidOn: "2099-01-01" })
      .expect(400);
    await owner
      .put(`/api/loans/${id}/payments/1`)
      .send({ paidOn: "2026-01-31" })
      .expect(200);
    const duplicate = await owner
      .put(`/api/loans/${id}/payments/1`)
      .send({ paidOn: "2026-01-31" })
      .expect(200);
    assert.equal(
      duplicate.body.schedule.filter((s: { paidOn: string }) => s.paidOn)
        .length,
      1,
    );
    const csv = await owner.get("/api/export").expect(200);
    assert.ok(csv.text.includes('"\'=HYPERLINK(""test"")"'));
    assert.ok(csv.text.includes("2026-01-31"));
    await owner
      .patch("/api/me")
      .send({ name: "Renamed", currency: "USD" })
      .expect(409);
    await owner
      .patch("/api/me")
      .send({ name: "Renamed", currency: "BDT" })
      .expect(200);
    await owner.delete(`/api/loans/${id}/payments/1`).expect(200);
    assert.equal(
      (await owner.get("/api/loans")).body[0].schedule[0].paidOn,
      null,
    );
    db.close();
    ({ app, db } = createApp(path.join(dir, "test.sqlite")));
    const reopened = request.agent(app);
    await reopened
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "incorrect" })
      .expect(401);
    await reopened
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "safe-test-password" })
      .expect(200);
    const persisted = await reopened.get("/api/loans").expect(200);
    assert.equal(persisted.body[0].id, id);
    await reopened.delete(`/api/loans/${id}`).expect(200);
    assert.equal((await reopened.get("/api/loans")).body.length, 0);
    await reopened.post("/api/sample").expect(201);
    await reopened.post("/api/sample").expect(409);
    assert.equal((await reopened.get("/api/loans")).body.length, 3);
    await reopened.post("/api/logout").expect(200);
    await reopened.get("/api/me").expect(401);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
