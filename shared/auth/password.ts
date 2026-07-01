import crypto from "crypto"
import bcrypt from "bcryptjs"

const SALT_ROUNDS = 12

export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, SALT_ROUNDS)
}

export function verifyPassword(plaintext: string, hash: string): boolean {
  return bcrypt.compareSync(plaintext, hash)
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const bytes = crypto.randomBytes(12)
  return Array.from(bytes, b => chars[b % chars.length]).join("")
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)  return "Password must be at least 8 characters"
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter"
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter"
  if (!/[0-9]/.test(password)) return "Password must include a number"
  return null
}
