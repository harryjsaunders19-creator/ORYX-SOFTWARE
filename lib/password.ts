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
  let result = ""
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)  return "Password must be at least 8 characters"
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter"
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter"
  if (!/[0-9]/.test(password)) return "Password must include a number"
  return null
}
