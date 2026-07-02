/**
 * Company Password Vault — shared business credentials.
 * Import from `@/modules/password-vault` only.
 */
export { passwordVaultService } from "./services/vault-service"
export type {
  PasswordVaultEntry,
  CreatePasswordVaultInput,
  UpdatePasswordVaultInput,
} from "./types"
export { encryptVaultSecret, decryptVaultSecret } from "./crypto/vault-crypto"
export { parseCreateBody, parseUpdateBody, parseSortOrder } from "./api/validation"
export { default as PasswordVaultPage } from "./components/password-vault-page"
