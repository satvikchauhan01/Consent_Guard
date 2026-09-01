import argon2 from "argon2";

// ---------------------------------------------------------------------------
// Password Hashing — Argon2id
// ---------------------------------------------------------------------------
// Argon2id is the OWASP-recommended algorithm for password hashing (2024).
// It is memory-hard and resistant to GPU/ASIC brute force.
// We use it ONLY for passwords — not for API keys or refresh tokens, which
// are high-entropy and need fast HMAC lookups instead.

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MiB
  timeCost: 3,        // 3 iterations
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext, ARGON2_OPTIONS);
  } catch {
    // argon2.verify throws on malformed hash — treat as non-match
    return false;
  }
}

// ---------------------------------------------------------------------------
// Constant-time dummy verify
// ---------------------------------------------------------------------------
// When a user is NOT found, we still run a dummy Argon2 verify against a
// static hash to prevent timing-based user enumeration attacks. The dummy
// hash is pre-computed from "dummy-password-for-timing" at startup.

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

export async function dummyVerify(): Promise<void> {
  await argon2.verify(DUMMY_HASH, "dummy-password-for-timing").catch(() => {});
}
