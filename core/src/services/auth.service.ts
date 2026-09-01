import mongoose from "mongoose";
import { config } from "../config/index.js";
import { User, UserRole } from "../models/user.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import {
  hashPassword,
  verifyPassword,
  dummyVerify,
} from "../lib/password.js";
import {
  hashToken,
  generateRawToken,
  generateAccessToken,
} from "../lib/tokens.js";

// ---------------------------------------------------------------------------
// Typed error codes — consumed by the controller to set HTTP status codes
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusHint: number = 400
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRefreshExpiryDate(): Date {
  // Parse JWT_REFRESH_EXPIRES_IN like "7d", "24h", "30m" into a Date
  const raw = config.JWT_REFRESH_EXPIRES_IN;
  const match = raw.match(/^(\d+)(d|h|m|s)$/);
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN: "${raw}"`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const msMap: Record<string, number> = {
    d: 86400000,
    h: 3600000,
    m: 60000,
    s: 1000,
  };

  return new Date(Date.now() + value * msMap[unit]);
}

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

export async function registerUser(email: string, password: string) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AuthError("EMAIL_ALREADY_EXISTS", "Email is already registered", 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    email,
    passwordHash,
    role: UserRole.USER,
  });

  // Never return passwordHash to the caller
  return {
    id: (user._id as mongoose.Types.ObjectId).toString(),
    email: user.email,
    role: user.role,
  };
}

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

export async function loginUser(email: string, password: string) {
  const user = await User.findOne({ email });

  if (!user) {
    // Run dummy Argon2 to prevent timing-based user enumeration
    await dummyVerify();
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  // Generate tokens
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getRefreshExpiryDate();

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
  });

  const accessToken = generateAccessToken({
    userId: (user._id as mongoose.Types.ObjectId).toString(),
    role: user.role,
  });

  return { accessToken, refreshToken: rawToken };
}

// ---------------------------------------------------------------------------
// rotateRefreshToken  (rotate-on-use)
// ---------------------------------------------------------------------------
// GEMINI.md constraint: every mutation + its audit row in one transaction.
// Here we use a Mongoose session to atomically:
//  1. Mark the old row revokedAt = now  (it is permanently dead)
//  2. Insert a new row
// If either step fails, both are rolled back.

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const existingToken = await RefreshToken.findOne({ tokenHash });

  if (!existingToken) {
    throw new AuthError(
      "INVALID_REFRESH_TOKEN",
      "Refresh token not found",
      401
    );
  }

  if (existingToken.revokedAt != null) {
    throw new AuthError(
      "REFRESH_TOKEN_REVOKED",
      "Refresh token has already been used or revoked",
      401
    );
  }

  if (existingToken.expiresAt < new Date()) {
    throw new AuthError(
      "REFRESH_TOKEN_EXPIRED",
      "Refresh token has expired",
      401
    );
  }

  // Fetch user to embed fresh role claim in the new access token
  const user = await User.findById(existingToken.userId);
  if (!user) {
    throw new AuthError("INVALID_REFRESH_TOKEN", "User no longer exists", 401);
  }

  // Atomic rotate: revoke old → create new in one MongoDB session
  const session = await mongoose.startSession();
  let newRawToken: string;

  try {
    await session.withTransaction(async () => {
      // Step 1: revoke the presented token
      existingToken.revokedAt = new Date();
      await existingToken.save({ session });

      // Step 2: issue a new token row
      newRawToken = generateRawToken();
      const newHash = hashToken(newRawToken);
      const expiresAt = getRefreshExpiryDate();

      await RefreshToken.create(
        [{ userId: user._id, tokenHash: newHash, expiresAt }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const accessToken = generateAccessToken({
    userId: (user._id as mongoose.Types.ObjectId).toString(),
    role: user.role,
  });

  return { accessToken, refreshToken: newRawToken! };
}

// ---------------------------------------------------------------------------
// revokeRefreshToken  (logout)
// ---------------------------------------------------------------------------

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const tokenDoc = await RefreshToken.findOne({ tokenHash });

  if (!tokenDoc || tokenDoc.revokedAt != null) {
    throw new AuthError(
      "INVALID_REFRESH_TOKEN",
      "Refresh token not found or already revoked",
      401
    );
  }

  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();
}
