import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

// ---------------------------------------------------------------------------
// Refresh Token Hashing
// ---------------------------------------------------------------------------
// Raw refresh tokens are never stored in the database. We store only an
// HMAC-SHA256 hash derived from HMAC_KEY. High-entropy tokens don't need
// Argon2 (that's for low-entropy passwords); HMAC is fast and correct here.

export function hashToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", config.HMAC_KEY)
    .update(rawToken)
    .digest("hex");
}

export function generateRawToken(): string {
  // 48 bytes → 96 hex chars of cryptographically secure randomness
  return crypto.randomBytes(48).toString("hex");
}

// ---------------------------------------------------------------------------
// Access JWT
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  userId: string;
  role: string;
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifies an access JWT. Throws if the token is invalid, expired, or
 * tampered with. Callers must handle the thrown JwtError.
 */
export function verifyAccessToken(token: string): DecodedAccessToken {
  return jwt.verify(token, config.JWT_SECRET) as DecodedAccessToken;
}
