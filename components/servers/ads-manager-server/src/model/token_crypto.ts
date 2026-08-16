// Model utility: AES-256-GCM encrypt/decrypt for OAuth refresh tokens at rest (FR: "refresh
// tokens OAuth criptografados em repouso", SPEC.md Data Protection).
//
// Uses only Node's built-in `node:crypto` — not a third-party wrapper — so this stays a plain,
// dependency-free, easily unit-testable Model function (per backend-standards: Model performs
// business logic only). `createCipheriv`/`randomBytes` involve no I/O (no disk/network/DB calls),
// so this fits the Model layer's "no I/O" rule even though it isn't deterministic byte-for-byte
// across calls (a fresh random IV is generated per encryption, which is required for AES-GCM to
// be secure) — decrypting the output of encrypt() is what's deterministic and tested.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const PAYLOAD_SEPARATOR = '.';

const decodeKey = (keyBase64: string): Buffer => {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `tokenEncryptionKey must decode to exactly ${KEY_LENGTH_BYTES} bytes (base64); got ${key.length}. ` +
        'Set a real key via the TOKEN_ENCRYPTION_KEY env var (see src/config/load_config.ts).'
    );
  }
  return key;
};

// Encrypts a plaintext refresh token. Output encodes iv + authTag + ciphertext (all base64,
// joined by '.') so decryptRefreshToken can reconstruct everything it needs from a single string
// column (oauth_refresh_token_encrypted).
export const encryptRefreshToken = (keyBase64: string, plainText: string): string => {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
    PAYLOAD_SEPARATOR
  );
};

// Decrypts a payload produced by encryptRefreshToken. Not wired into Dependencies yet — nothing
// in this change needs to decrypt a stored token (that happens when actually calling the Google
// Ads API on a connected account, which is out of scope here; see the campaign-performance-
// dashboard change). Exported now so it's tested alongside encryptRefreshToken (round-trip).
export const decryptRefreshToken = (keyBase64: string, encryptedPayload: string): string => {
  const key = decodeKey(keyBase64);
  const [ivB64, authTagB64, dataB64] = encryptedPayload.split(PAYLOAD_SEPARATOR);
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('decryptRefreshToken: malformed encrypted payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};
