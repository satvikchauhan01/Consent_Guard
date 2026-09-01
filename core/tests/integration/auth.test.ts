import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../../src/index.js";
import { RefreshToken } from "../../src/models/refreshToken.model.js";
import { config } from "../../src/config/index.js";

// ---------------------------------------------------------------------------
// In-memory MongoDB Replica Set setup
// ---------------------------------------------------------------------------
// MongoMemoryReplSet is required (not MongoMemoryServer/standalone) because
// rotateRefreshToken() uses a Mongoose session+transaction, which MongoDB only
// supports on replica set members or mongos. Standalone mode rejects sessions
// with "Transaction numbers are only allowed on a replica set member or mongos".

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  // Clear all collections between tests for full isolation
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "/api/auth";
const VALID_EMAIL = "alice@example.com";
const VALID_PASSWORD = "SecurePass123";

async function registerAndLogin(email = VALID_EMAIL, password = VALID_PASSWORD) {
  await request(app).post(`${BASE}/register`).send({ email, password });

  const res = await request(app).post(`${BASE}/login`).send({ email, password });

  return res.body as { accessToken: string; refreshToken: string };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  it("Test 1 — returns 201 and user object without passwordHash", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(VALID_EMAIL);
    expect(res.body.user.role).toBe("USER");
    // passwordHash must NEVER be exposed
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("Test 2 — returns 409 EMAIL_ALREADY_EXISTS on duplicate email", async () => {
    await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("Test 3 — returns 400 VALIDATION_ERROR for short password", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("Test 3b — returns 400 VALIDATION_ERROR for malformed email", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: "not-an-email", password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("Test 3c — returns 400 VALIDATION_ERROR for unknown extra fields (strict schema)", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD, role: "ADMIN" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("Test 4 — returns 200 with accessToken and refreshToken on valid credentials", async () => {
    await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.accessToken.split(".")).toHaveLength(3); // JWT format
  });

  it("Test 5 — returns 401 INVALID_CREDENTIALS for wrong password", async () => {
    await request(app)
      .post(`${BASE}/register`)
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: VALID_EMAIL, password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });

  it("Test 6 — returns 401 INVALID_CREDENTIALS for unknown email (no user enumeration)", async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: "ghost@example.com", password: VALID_PASSWORD });

    // Must be IDENTICAL response to wrong-password — no "user not found" leak
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /api/auth/refresh", () => {
  it("Test 7 — returns new accessToken and refreshToken on valid refresh", async () => {
    const { refreshToken } = await registerAndLogin();

    const res = await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
    // New refresh token must be different from the old one
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it("Test 8 (ACCEPTANCE) — replaying an already-rotated refresh token returns 401 REFRESH_TOKEN_REVOKED", async () => {
    const { refreshToken: originalToken } = await registerAndLogin();

    // First use — valid rotation
    const firstRotate = await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken: originalToken });
    expect(firstRotate.status).toBe(200);

    // Replay the OLD token — must be rejected
    const replay = await request(app).post(`${BASE}/refresh`).send({ refreshToken: originalToken });

    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("REFRESH_TOKEN_REVOKED");
  });

  it("Test 9 — returns 401 REFRESH_TOKEN_EXPIRED for an expired refresh token", async () => {
    const { refreshToken } = await registerAndLogin();

    // Manually back-date the token's expiry in the DB
    const { hashToken } = await import("../../src/lib/tokens.js");
    const tokenHash = hashToken(refreshToken);
    await RefreshToken.updateOne(
      { tokenHash },
      { expiresAt: new Date(Date.now() - 1000) } // 1 second in the past
    );

    const res = await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("REFRESH_TOKEN_EXPIRED");
  });
});

describe("Access Token expiry", () => {
  it("Test 10 (ACCEPTANCE) — an expired access JWT is rejected by jwt.verify", () => {
    // Sign a token with -1s expiry (already expired at the moment of creation)
    const expiredToken = jwt.sign(
      { userId: "000000000000000000000001", role: "USER" },
      config.JWT_SECRET,
      { expiresIn: -1 }
    );

    expect(() => jwt.verify(expiredToken, config.JWT_SECRET)).toThrow(jwt.TokenExpiredError);
  });
});

describe("POST /api/auth/logout", () => {
  it("Test 11 — returns 204 on valid logout; same token is then rejected", async () => {
    const { refreshToken } = await registerAndLogin();

    const logoutRes = await request(app).post(`${BASE}/logout`).send({ refreshToken });

    expect(logoutRes.status).toBe(204);

    // Attempting to use the now-revoked token must fail
    const refreshRes = await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error).toBe("REFRESH_TOKEN_REVOKED");
  });
});
