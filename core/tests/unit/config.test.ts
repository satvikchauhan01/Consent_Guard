import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config/index.js";

describe("Core Configuration Loader", () => {
  const validEnv = {
    NODE_ENV: "test",
    PORT: "4000",
    MONGO_URI: "mongodb://localhost:27017/consentguard_test",
    JWT_SECRET: "test_jwt_secret_min_16_chars_length!",
    SESSION_COOKIE_SECRET: "test_session_secret_min_16_chars_len!",
    HMAC_KEY: "test_hmac_key_min_16_chars_length!!",
    RATE_LIMIT_LOGIN_MAX: "10",
    RATE_LIMIT_LOGIN_WINDOW_MS: "900000",
    RATE_LIMIT_CHECK_MAX: "1000",
    RATE_LIMIT_CHECK_WINDOW_MS: "60000",
    RATE_LIMIT_ADMIN_MAX: "100",
    RATE_LIMIT_ADMIN_WINDOW_MS: "60000",
    CACHE_TTL_SECONDS: "30",
    RECONSENT_GRACE_HOURS: "24",
  };

  it("successfully parses valid environment configuration", () => {
    const config = loadConfig(validEnv);
    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(4000);
    expect(config.MONGO_URI).toBe("mongodb://localhost:27017/consentguard_test");
    expect(config.CACHE_TTL_SECONDS).toBe(30);
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("accepts ANTHROPIC_API_KEY as explicitly optional", () => {
    const configWithAi = loadConfig({
      ...validEnv,
      ANTHROPIC_API_KEY: "sk-ant-test-key-12345",
    });
    expect(configWithAi.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-12345");
  });

  it("fails fast and throws loudly when a required variable is missing", () => {
    const invalidEnv = { ...validEnv, MONGO_URI: "" };
    expect(() => loadConfig(invalidEnv)).toThrow(
      /Fatal: Invalid or missing environment configuration/
    );
  });

  it("fails fast when secret length is below minimum requirement", () => {
    const shortSecretEnv = { ...validEnv, JWT_SECRET: "short" };
    expect(() => loadConfig(shortSecretEnv)).toThrow(/JWT_SECRET is required \(min 16 chars\)/);
  });
});
