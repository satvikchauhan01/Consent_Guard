import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/index.js";

describe("Core Health & Placeholder Endpoints", () => {
  it("GET / returns service info and ok status", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "ConsentGuard Core",
    });
  });

  it("GET /health returns healthy status with uptime and timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe("number");
  });
});
