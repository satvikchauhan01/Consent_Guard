import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";

// Look for .env file in cwd or parent directories
const candidateEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Database
  MONGO_URI: z.string().min(1, "MONGO_URI is required and cannot be empty"),

  // Security & Secrets
  JWT_SECRET: z.string().min(16, "JWT_SECRET is required (min 16 chars)"),
  SESSION_COOKIE_SECRET: z.string().min(16, "SESSION_COOKIE_SECRET is required (min 16 chars)"),
  HMAC_KEY: z.string().min(16, "HMAC_KEY is required (min 16 chars)"),

  // Rate Limiting
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().positive().default(10),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().positive().default(900000),

  RATE_LIMIT_CHECK_MAX: z.coerce.number().positive().default(1000),
  RATE_LIMIT_CHECK_WINDOW_MS: z.coerce.number().positive().default(60000),

  RATE_LIMIT_ADMIN_MAX: z.coerce.number().positive().default(100),
  RATE_LIMIT_ADMIN_WINDOW_MS: z.coerce.number().positive().default(60000),

  // Cache & Consent Policies
  CACHE_TTL_SECONDS: z.coerce.number().positive().default(30),
  RECONSENT_GRACE_HOURS: z.coerce.number().positive().default(24),

  // AI Compliance Layer (Explicitly Optional)
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val === "" || val === undefined ? undefined : val)),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(rawEnv: Record<string, unknown> = process.env): Config {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues || [];
    const formattedErrors = issues
      .map((err) => `  - [${err.path.join(".")}]: ${err.message}`)
      .join("\n");

    const message = `[ConsentGuard Config Error] Fatal: Invalid or missing environment configuration:\n${formattedErrors}`;
    console.error(message);
    throw new Error(message);
  }

  return result.data;
}

export const config: Config = loadConfig();
