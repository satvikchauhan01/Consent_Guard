import { z } from "zod";

// ---------------------------------------------------------------------------
// Register / Login
// ---------------------------------------------------------------------------

export const RegisterSchema = z
  .object({
    email: z
      .string({ required_error: "email is required" })
      .email("email must be a valid email address")
      .toLowerCase(),
    password: z
      .string({ required_error: "password is required" })
      .min(8, "password must be at least 8 characters"),
  })
  .strict(); // reject any unknown fields

export const LoginSchema = z
  .object({
    email: z
      .string({ required_error: "email is required" })
      .email("email must be a valid email address")
      .toLowerCase(),
    password: z.string({ required_error: "password is required" }).min(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// Refresh / Logout
// ---------------------------------------------------------------------------

export const RefreshSchema = z
  .object({
    refreshToken: z
      .string({ required_error: "refreshToken is required" })
      .min(1, "refreshToken cannot be empty"),
  })
  .strict();

export const LogoutSchema = RefreshSchema; // same shape

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
