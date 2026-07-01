/**
 * lib/backup-token.ts
 *
 * This app has no S3/cloud storage to hand off a real signed URL to, so this
 * is a minimal from-scratch equivalent: an HMAC-SHA256 signature over
 * `backupId:expiry`, using a server-only secret. A token is a bearer
 * credential valid for a short window — anyone holding a valid token can
 * download that one backup until it expires, without needing the admin's
 * session cookie at all. That's the actual point of "signed URL, time
 * limited": it's safe to put in a Slack message or a support ticket without
 * handing over a real session.
 *
 * Token format: "<expiryMs>.<hexSignature>" — deliberately not JWT (no
 * library, no header/payload/algorithm-confusion surface to worry about;
 * there's exactly one thing this token can mean).
 */
import crypto from "crypto"

const FALLBACK_SECRET = "dev-only-insecure-backup-token-secret-change-in-production"

function getSecret(): string {
  const secret = process.env.BACKUP_DOWNLOAD_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BACKUP_DOWNLOAD_SECRET must be set in production — backup download links cannot be secured without it.",
    )
  }

  // Local dev only — a predictable secret defeats signed URLs; never use in production.
  console.warn(
    "[backup-token] BACKUP_DOWNLOAD_SECRET is not set — falling back to a fixed dev secret. " +
    "Set BACKUP_DOWNLOAD_SECRET before deploying.",
  )
  return FALLBACK_SECRET
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex")
}

export interface DownloadToken {
  token: string
  expiresAt: number   // epoch ms, for the UI to show "link expires in N minutes"
}

export function generateDownloadToken(backupId: string, ttlSeconds = 600): DownloadToken {
  const expiresAt = Date.now() + ttlSeconds * 1000
  const signature = sign(`${backupId}:${expiresAt}`)
  return { token: `${expiresAt}.${signature}`, expiresAt }
}

export function verifyDownloadToken(backupId: string, token: string): boolean {
  const parts = token.split(".")
  if (parts.length !== 2) return false
  const [expiresAtStr, signature] = parts
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false

  const expected = sign(`${backupId}:${expiresAt}`)
  // timingSafeEqual throws on length mismatch rather than returning false —
  // an attacker-controlled token could easily be the wrong length, so that
  // mismatch must be treated as "invalid", not allowed to throw past this
  // check uncaught.
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
