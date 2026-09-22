import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const hex = process.env.TENANT_SECRET_KEY;
  if (!hex || hex.length !== 64) throw new Error('TENANT_SECRET_KEY must be 32 bytes hex (64 chars)');
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM. Output: iv:tag:ciphertext (hex). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}

export function decryptSecret(enc: string): string {
  const [iv, tag, data] = enc.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}

export function randomPassword(len = 32): string {
  return randomBytes(len).toString('base64url').slice(0, len);
}
