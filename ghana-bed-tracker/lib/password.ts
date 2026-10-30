/** Password hashing + verification (PBKDF2-SHA256, no external dependency). */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
