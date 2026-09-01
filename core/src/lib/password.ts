import { hash, verify, argon2id, type HashOptions } from "argon2";

// ---------------------------------------------------------------------------
// Password Hashing — Argon2id
// ---------------------------------------------------------------------------
// Argon2id is the OWASP-recommended algorithm for password hashing (2024).
// It is memory-hard and resistant to GPU/ASIC brute force.
// We use it ONLY for passwords — not for API keys or refresh tokens, which
// are high-entropy and need fast HMAC lookups instead.
//
// Two issues fixed from the original:
//  1. argon2.Options does not exist in this version — the correct exported
//     type is HashOptions (named export from "argon2").
//  2. hash() has two overloads: { raw: true } → Buffer, everything else →
//     string. Annotating the options object with HashOptions & { raw?: false }
//     makes the compiler select the string overload unambiguously.

const ARGON2_OPTIONS: HashOptions & { raw?: false } = {
  type: argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3, // 3 iterations
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(plaintext: string, digest: string): Promise<boolean> {
  try {
    return await verify(digest, plaintext);
  } catch {
    // verify() throws on a malformed digest — treat as non-match
    return false;
  }
}

// ---------------------------------------------------------------------------
// Constant-time dummy verify
// ---------------------------------------------------------------------------
// When a user is NOT found, we still run a dummy Argon2 verify against a
// static hash to prevent timing-based user enumeration attacks. The dummy
// hash is pre-computed from "dummy-password-for-timing".

const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

export async function dummyVerify(): Promise<void> {
  await verify(DUMMY_HASH, "dummy-password-for-timing").catch(() => {});
}
