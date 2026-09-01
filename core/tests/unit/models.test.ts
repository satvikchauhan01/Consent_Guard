import { describe, expect, it } from "vitest";
import mongoose, { Schema, Types } from "mongoose";
import {
  ActorType,
  ApplicationStatus,
  AuditLog,
  auditLogSchema,
  ConsentPurpose,
  consentPurposeSchema,
  ConsentRecord,
  consentRecordSchema,
  ConsentStatus,
  ConsumerApplication,
  consumerApplicationSchema,
  IdempotencyKey,
  idempotencyKeySchema,
  PolicyStatus,
  PolicyVersion,
  policyVersionSchema,
  RefreshToken,
  refreshTokenSchema,
  User,
  userSchema,
  UserRole,
} from "../../src/models/index.js";

// Helper function to find an index by key pattern in schema.indexes()
function findIndex(
  schema: Schema,
  keyPattern: Record<string, number>
): [Record<string, number>, Record<string, unknown> | undefined] | undefined {
  const indexes = schema.indexes();
  return indexes.find(([keys]) => {
    const keysEntries = Object.entries(keys);
    const targetEntries = Object.entries(keyPattern);
    if (keysEntries.length !== targetEntries.length) return false;
    return keysEntries.every(([k, v], idx) => targetEntries[idx][0] === k && targetEntries[idx][1] === v);
  }) as [Record<string, number>, Record<string, unknown> | undefined] | undefined;
}

describe("Step 4 — Mongoose Schemas & Indexes (All 8 Entities)", () => {
  describe("1. User Entity", () => {
    it("has unique index on email", () => {
      const emailIdx = findIndex(userSchema, { email: 1 });
      expect(emailIdx).toBeDefined();
      expect(emailIdx?.[1]?.unique).toBe(true);
    });

    it("has required, lowercase, and trim configuration on email", () => {
      const emailPath = userSchema.path("email") as any;
      expect(emailPath).toBeDefined();
      expect(emailPath.isRequired).toBe(true);
      expect(emailPath.options.lowercase).toBe(true);
      expect(emailPath.options.trim).toBe(true);
    });

    it("has passwordHash and role with [USER, ADMIN] enum", () => {
      const passwordPath = userSchema.path("passwordHash") as any;
      expect(passwordPath.isRequired).toBe(true);

      const rolePath = userSchema.path("role") as any;
      expect(rolePath.isRequired).toBe(true);
      expect(rolePath.enumValues).toEqual(expect.arrayContaining(["USER", "ADMIN"]));
      expect(rolePath.defaultValue).toBe(UserRole.USER);
    });

    it("enables timestamps", () => {
      expect((userSchema as any).options.timestamps).toBe(true);
    });

    it("validates a valid User document", async () => {
      const user = new User({
        email: "PATIENT@Example.COM",
        passwordHash: "hashed_password_123",
        role: UserRole.USER,
      });
      await expect(user.validate()).resolves.toBeUndefined();
      expect(user.email).toBe("patient@example.com");
    });
  });

  describe("2. ConsumerApplication Entity", () => {
    it("has unique index on name", () => {
      const nameIdx = findIndex(consumerApplicationSchema, { name: 1 });
      expect(nameIdx).toBeDefined();
      expect(nameIdx?.[1]?.unique).toBe(true);
    });

    it("defines required fields and status enum [ACTIVE, SUSPENDED]", () => {
      const statusPath = consumerApplicationSchema.path("status") as any;
      expect(statusPath.enumValues).toEqual(expect.arrayContaining(["ACTIVE", "SUSPENDED"]));
      expect(statusPath.defaultValue).toBe(ApplicationStatus.ACTIVE);

      const apiKeyHashPath = consumerApplicationSchema.path("apiKeyHash") as any;
      expect(apiKeyHashPath.isRequired).toBe(true);
    });

    it("supports previousKeyHash, previousKeyExpiresAt, scopes array, and lastUsedAt", () => {
      const prevKeyPath = consumerApplicationSchema.path("previousKeyHash");
      expect(prevKeyPath).toBeDefined();

      const prevKeyExpPath = consumerApplicationSchema.path("previousKeyExpiresAt");
      expect(prevKeyExpPath).toBeDefined();

      const scopesPath = consumerApplicationSchema.path("scopes") as any;
      expect(scopesPath).toBeDefined();

      const lastUsedPath = consumerApplicationSchema.path("lastUsedAt");
      expect(lastUsedPath).toBeDefined();
    });

    it("validates a valid ConsumerApplication document", async () => {
      const app = new ConsumerApplication({
        name: "Hospital Portal",
        apiKeyHash: "hmac_hash_abc",
        scopes: ["consent:check", "consent:stream", "audit:read"],
      });
      await expect(app.validate()).resolves.toBeUndefined();
    });
  });

  describe("3. ConsentPurpose Entity", () => {
    it("has compound unique index on (applicationId, code)", () => {
      const purposeIdx = findIndex(consentPurposeSchema, { applicationId: 1, code: 1 });
      expect(purposeIdx).toBeDefined();
      expect(purposeIdx?.[1]?.unique).toBe(true);
    });

    it("defines required fields: applicationId, code, name, description, required, active", () => {
      const appRef = consentPurposeSchema.path("applicationId") as any;
      expect(appRef.isRequired).toBe(true);
      expect(appRef.options.ref).toBe("ConsumerApplication");

      const codePath = consentPurposeSchema.path("code") as any;
      expect(codePath.isRequired).toBe(true);

      const namePath = consentPurposeSchema.path("name") as any;
      expect(namePath.isRequired).toBe(true);

      const descPath = consentPurposeSchema.path("description") as any;
      expect(descPath.isRequired).toBe(true);

      const reqPath = consentPurposeSchema.path("required") as any;
      expect(reqPath.defaultValue).toBe(false);

      const activePath = consentPurposeSchema.path("active") as any;
      expect(activePath.defaultValue).toBe(true);
    });

    it("validates a valid ConsentPurpose document", async () => {
      const purpose = new ConsentPurpose({
        applicationId: new Types.ObjectId(),
        code: "MARKETING_COMMS",
        name: "Marketing Communications",
        description: "Receive updates and promotional material",
        required: false,
        active: true,
      });
      await expect(purpose.validate()).resolves.toBeUndefined();
    });
  });

  describe("4. PolicyVersion Entity", () => {
    it("has compound unique index on (purposeId, version)", () => {
      const policyIdx = findIndex(policyVersionSchema, { purposeId: 1, version: 1 });
      expect(policyIdx).toBeDefined();
      expect(policyIdx?.[1]?.unique).toBe(true);
    });

    it("defines required fields: purposeId ref, version, content, status enum [DRAFT, PUBLISHED], requiresReconsent", () => {
      const purposeRef = policyVersionSchema.path("purposeId") as any;
      expect(purposeRef.isRequired).toBe(true);
      expect(purposeRef.options.ref).toBe("ConsentPurpose");

      const versionPath = policyVersionSchema.path("version") as any;
      expect(versionPath.isRequired).toBe(true);

      const contentPath = policyVersionSchema.path("content") as any;
      expect(contentPath.isRequired).toBe(true);

      const statusPath = policyVersionSchema.path("status") as any;
      expect(statusPath.enumValues).toEqual(expect.arrayContaining(["DRAFT", "PUBLISHED"]));
      expect(statusPath.defaultValue).toBe(PolicyStatus.DRAFT);

      const reconsentPath = policyVersionSchema.path("requiresReconsent") as any;
      expect(reconsentPath.isRequired).toBe(true);
      expect(reconsentPath.defaultValue).toBe(false);
    });

    it("supports nullable plainLanguageSummary and publishedAt", () => {
      const summaryPath = policyVersionSchema.path("plainLanguageSummary");
      expect(summaryPath).toBeDefined();

      const publishedAtPath = policyVersionSchema.path("publishedAt");
      expect(publishedAtPath).toBeDefined();
    });

    it("validates a valid PolicyVersion document", async () => {
      const policy = new PolicyVersion({
        purposeId: new Types.ObjectId(),
        version: "1.0",
        content: "Detailed policy terms and conditions...",
        plainLanguageSummary: "We will only send relevant updates.",
        status: PolicyStatus.DRAFT,
        requiresReconsent: false,
      });
      await expect(policy.validate()).resolves.toBeUndefined();
    });
  });

  describe("5. ConsentRecord Entity", () => {
    it("has compound unique index on (userId, applicationId, purposeId)", () => {
      const uniqueIdx = findIndex(consentRecordSchema, {
        userId: 1,
        applicationId: 1,
        purposeId: 1,
      });
      expect(uniqueIdx).toBeDefined();
      expect(uniqueIdx?.[1]?.unique).toBe(true);
    });

    it("has compound secondary index on (applicationId, purposeId, status)", () => {
      const secondaryIdx = findIndex(consentRecordSchema, {
        applicationId: 1,
        purposeId: 1,
        status: 1,
      });
      expect(secondaryIdx).toBeDefined();
    });

    it("defines references: userId, applicationId, purposeId, policyVersionId", () => {
      expect((consentRecordSchema.path("userId") as any).options.ref).toBe("User");
      expect((consentRecordSchema.path("applicationId") as any).options.ref).toBe("ConsumerApplication");
      expect((consentRecordSchema.path("purposeId") as any).options.ref).toBe("ConsentPurpose");
      expect((consentRecordSchema.path("policyVersionId") as any).options.ref).toBe("PolicyVersion");
    });

    it("defines status enum [NOT_GRANTED, GRANTED, WITHDRAWN] and optimistic concurrency version counter", () => {
      const statusPath = consentRecordSchema.path("status") as any;
      expect(statusPath.enumValues).toEqual(expect.arrayContaining(["NOT_GRANTED", "GRANTED", "WITHDRAWN"]));
      expect(statusPath.defaultValue).toBe(ConsentStatus.NOT_GRANTED);

      const versionPath = consentRecordSchema.path("version") as any;
      expect(versionPath.isRequired).toBe(true);
      expect(versionPath.defaultValue).toBe(1);
    });

    it("supports grantedAt and withdrawnAt timestamps", () => {
      expect(consentRecordSchema.path("grantedAt")).toBeDefined();
      expect(consentRecordSchema.path("withdrawnAt")).toBeDefined();
    });

    it("validates a valid ConsentRecord document", async () => {
      const record = new ConsentRecord({
        userId: new Types.ObjectId(),
        applicationId: new Types.ObjectId(),
        purposeId: new Types.ObjectId(),
        policyVersionId: new Types.ObjectId(),
        status: ConsentStatus.GRANTED,
        version: 1,
        grantedAt: new Date(),
      });
      await expect(record.validate()).resolves.toBeUndefined();
    });
  });

  describe("6. AuditLog Entity", () => {
    it("has index on (applicationId, createdAt)", () => {
      const appCreatedIdx = findIndex(auditLogSchema, { applicationId: 1, createdAt: 1 });
      expect(appCreatedIdx).toBeDefined();
    });

    it("has index on (actorId, createdAt)", () => {
      const actorCreatedIdx = findIndex(auditLogSchema, { actorId: 1, createdAt: 1 });
      expect(actorCreatedIdx).toBeDefined();
    });

    it("defines actorType enum [USER, ADMIN, SYSTEM] and required action/applicationId", () => {
      const actorTypePath = auditLogSchema.path("actorType") as any;
      expect(actorTypePath.enumValues).toEqual(expect.arrayContaining(["USER", "ADMIN", "SYSTEM"]));
      expect(actorTypePath.isRequired).toBe(true);

      expect((auditLogSchema.path("action") as any).isRequired).toBe(true);
      expect((auditLogSchema.path("applicationId") as any).isRequired).toBe(true);
    });

    it("supports nullable actorId and purposeId, previousState, newState, metadata", () => {
      expect(auditLogSchema.path("actorId")).toBeDefined();
      expect(auditLogSchema.path("purposeId")).toBeDefined();
      expect(auditLogSchema.path("previousState")).toBeDefined();
      expect(auditLogSchema.path("newState")).toBeDefined();
      expect(auditLogSchema.path("metadata")).toBeDefined();
    });

    it("validates a valid AuditLog document", async () => {
      const audit = new AuditLog({
        actorId: new Types.ObjectId(),
        actorType: ActorType.USER,
        applicationId: new Types.ObjectId(),
        action: "CONSENT_GRANTED",
        previousState: { status: "NOT_GRANTED" },
        newState: { status: "GRANTED" },
        metadata: { ip: "127.0.0.1", userAgent: "Mozilla/5.0" },
      });
      await expect(audit.validate()).resolves.toBeUndefined();
    });
  });

  describe("7. RefreshToken Entity", () => {
    it("has unique index on tokenHash", () => {
      const tokenHashIdx = findIndex(refreshTokenSchema, { tokenHash: 1 });
      expect(tokenHashIdx).toBeDefined();
      expect(tokenHashIdx?.[1]?.unique).toBe(true);
    });

    it("has index on userId", () => {
      const userIdIdx = findIndex(refreshTokenSchema, { userId: 1 });
      expect(userIdIdx).toBeDefined();
    });

    it("defines required userId ref, tokenHash, expiresAt, and nullable revokedAt", () => {
      expect((refreshTokenSchema.path("userId") as any).isRequired).toBe(true);
      expect((refreshTokenSchema.path("userId") as any).options.ref).toBe("User");
      expect((refreshTokenSchema.path("tokenHash") as any).isRequired).toBe(true);
      expect((refreshTokenSchema.path("expiresAt") as any).isRequired).toBe(true);
      expect(refreshTokenSchema.path("revokedAt")).toBeDefined();
    });

    it("validates a valid RefreshToken document", async () => {
      const token = new RefreshToken({
        userId: new Types.ObjectId(),
        tokenHash: "sha256_hashed_refresh_token",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await expect(token.validate()).resolves.toBeUndefined();
    });
  });

  describe("8. IdempotencyKey Entity", () => {
    it("has compound unique index on (applicationId, key)", () => {
      const keyIdx = findIndex(idempotencyKeySchema, { applicationId: 1, key: 1 });
      expect(keyIdx).toBeDefined();
      expect(keyIdx?.[1]?.unique).toBe(true);
    });

    it("defines required applicationId ref, key, requestHash, responseSnapshot", () => {
      expect((idempotencyKeySchema.path("applicationId") as any).isRequired).toBe(true);
      expect((idempotencyKeySchema.path("applicationId") as any).options.ref).toBe("ConsumerApplication");
      expect((idempotencyKeySchema.path("key") as any).isRequired).toBe(true);
      expect((idempotencyKeySchema.path("requestHash") as any).isRequired).toBe(true);
      expect((idempotencyKeySchema.path("responseSnapshot") as any).isRequired).toBe(true);
    });

    it("validates a valid IdempotencyKey document", async () => {
      const record = new IdempotencyKey({
        applicationId: new Types.ObjectId(),
        key: "idemp-key-12345",
        requestHash: "body_hash_xyz",
        responseSnapshot: { allowed: true, reason: "OK" },
      });
      await expect(record.validate()).resolves.toBeUndefined();
    });
  });
});
