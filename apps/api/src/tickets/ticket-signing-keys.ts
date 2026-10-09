import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { isValidTicketKeyId } from './ticket-qr.js';

export const EPHEMERAL_TICKET_KEY_ID = 'dev-ephemeral';

export interface TicketSigningKeys {
  activeKeyId: string;
  privateKey: KeyObject;
  // Every key a scanner may meet: the active one plus retired ones that
  // already-issued tickets were signed with.
  publicKeys: Map<string, KeyObject>;
  ephemeral: boolean;
}

type Env = Record<string, string | undefined>;

function fail(message: string): never {
  throw new Error(`Không thể khởi động ứng dụng: ${message}`);
}

function isProduction(env: Env): boolean {
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const appEnv = (env.APP_ENV ?? '').toLowerCase();
  return nodeEnv === 'production' || appEnv === 'production';
}

// Accepts PEM (with real or "\n"-escaped line breaks) or single-line base64
// DER (PKCS#8 for private keys, SPKI for public keys).
export function decodeTicketKey(raw: string, kind: 'private' | 'public'): KeyObject {
  const text = raw.trim();
  let key: KeyObject;
  try {
    if (text.includes('-----BEGIN')) {
      const pem = text.replace(/\\n/g, '\n');
      key = kind === 'private' ? createPrivateKey(pem) : createPublicKey(pem);
    } else {
      const der = Buffer.from(text, 'base64');
      key =
        kind === 'private'
          ? createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
          : createPublicKey({ key: der, format: 'der', type: 'spki' });
    }
  } catch {
    throw new Error(`khoá ${kind === 'private' ? 'bí mật' : 'công khai'} không đọc được`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('khoá phải là Ed25519');
  }
  return key;
}

export function exportTicketPublicKey(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

function parseRetiredPublicKeys(raw: string | undefined): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  if (!raw?.trim()) return keys;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('TICKET_SIGNING_PUBLIC_KEYS phải là JSON dạng {"keyId": "khoá công khai"}.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('TICKET_SIGNING_PUBLIC_KEYS phải là JSON dạng {"keyId": "khoá công khai"}.');
  }

  for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isValidTicketKeyId(keyId)) {
      fail(`keyId "${keyId}" trong TICKET_SIGNING_PUBLIC_KEYS không hợp lệ (chỉ gồm chữ, số, "_" hoặc "-", tối đa 32 ký tự).`);
    }
    if (typeof value !== 'string') {
      fail(`khoá công khai "${keyId}" trong TICKET_SIGNING_PUBLIC_KEYS phải là chuỗi.`);
    }
    try {
      keys.set(keyId, decodeTicketKey(value, 'public'));
    } catch (err) {
      fail(`khoá công khai "${keyId}" trong TICKET_SIGNING_PUBLIC_KEYS: ${(err as Error).message}.`);
    }
  }
  return keys;
}

export function loadTicketSigningKeys(env: Env = process.env): TicketSigningKeys {
  const activeKeyId = env.TICKET_SIGNING_ACTIVE_KEY_ID?.trim();
  const privateRaw = env.TICKET_SIGNING_PRIVATE_KEY?.trim();
  const publicKeys = parseRetiredPublicKeys(env.TICKET_SIGNING_PUBLIC_KEYS);

  if (!activeKeyId && !privateRaw) {
    if (isProduction(env)) {
      fail('thiếu TICKET_SIGNING_ACTIVE_KEY_ID và TICKET_SIGNING_PRIVATE_KEY để ký mã QR vé trên production.');
    }
    // Local development only: tickets signed with this key stop verifying
    // after a restart. Configure a real key to keep them valid.
    const pair = generateKeyPairSync('ed25519');
    publicKeys.set(EPHEMERAL_TICKET_KEY_ID, pair.publicKey);
    return {
      activeKeyId: EPHEMERAL_TICKET_KEY_ID,
      privateKey: pair.privateKey,
      publicKeys,
      ephemeral: true,
    };
  }

  if (!activeKeyId || !privateRaw) {
    fail('TICKET_SIGNING_ACTIVE_KEY_ID và TICKET_SIGNING_PRIVATE_KEY phải được khai báo cùng nhau.');
  }
  if (!isValidTicketKeyId(activeKeyId)) {
    fail('TICKET_SIGNING_ACTIVE_KEY_ID không hợp lệ (chỉ gồm chữ, số, "_" hoặc "-", tối đa 32 ký tự).');
  }

  let privateKey: KeyObject;
  try {
    privateKey = decodeTicketKey(privateRaw, 'private');
  } catch (err) {
    fail(`TICKET_SIGNING_PRIVATE_KEY: ${(err as Error).message}.`);
  }

  const activePublicKey = createPublicKey(privateKey);
  const declared = publicKeys.get(activeKeyId);
  if (declared && !declared.equals(activePublicKey)) {
    fail(`khoá công khai "${activeKeyId}" trong TICKET_SIGNING_PUBLIC_KEYS không khớp với TICKET_SIGNING_PRIVATE_KEY.`);
  }
  publicKeys.set(activeKeyId, activePublicKey);

  return { activeKeyId, privateKey, publicKeys, ephemeral: false };
}

export function validateTicketSigningConfig(env: Env = process.env): void {
  loadTicketSigningKeys(env);
}
