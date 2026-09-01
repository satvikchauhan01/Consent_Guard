import { Request, Response } from "express";
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  LogoutSchema,
} from "../validators/auth.validators.js";
import {
  registerUser,
  loginUser,
  rotateRefreshToken,
  revokeRefreshToken,
  AuthError,
} from "../services/auth.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleAuthError(err: unknown, res: Response): void {
  if (err instanceof AuthError) {
    res.status(err.statusHint).json({
      error: err.code,
      message: err.message,
    });
    return;
  }
  console.error("[Auth] Unhandled error:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request body validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password);
    res.status(201).json({ user });
  } catch (err) {
    handleAuthError(err, res);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request body validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const tokens = await loginUser(parsed.data.email, parsed.data.password);
    res.status(200).json(tokens);
  } catch (err) {
    handleAuthError(err, res);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

export async function refresh(req: Request, res: Response): Promise<void> {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request body validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const tokens = await rotateRefreshToken(parsed.data.refreshToken);
    res.status(200).json(tokens);
  } catch (err) {
    handleAuthError(err, res);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

export async function logout(req: Request, res: Response): Promise<void> {
  const parsed = LogoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request body validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    await revokeRefreshToken(parsed.data.refreshToken);
    res.status(204).send();
  } catch (err) {
    handleAuthError(err, res);
  }
}
