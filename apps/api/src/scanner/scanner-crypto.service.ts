import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

export interface ScannerPublicKeyInfo {
  keyId: string;
  key: string;
}

@Injectable()
export class ScannerCryptoService {
  private readonly logger = new Logger(ScannerCryptoService.name);
  private readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKeyPem: string;

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('SCANNER_KEY_ID') ?? 'k1';

    const envPrivateKey = this.config.get<string>('SCANNER_SIGNING_PRIVATE_KEY');
    const envPublicKey = this.config.get<string>('SCANNER_PUBLIC_KEY');

    if (envPrivateKey && envPublicKey) {
      try {
        this.privateKey = createPrivateKey(envPrivateKey);
        this.publicKeyPem = envPublicKey.trim();
      } catch (err: any) {
        this.logger.warn(`Failed to parse configured keys, generating ephemeral pair: ${err.message}`);
        const pair = generateKeyPairSync('ed25519');
        this.privateKey = pair.privateKey;
        this.publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
      }
    } else {
      const pair = generateKeyPairSync('ed25519');
      this.privateKey = pair.privateKey;
      this.publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
    }
  }

  getKeyId(): string {
    return this.keyId;
  }

  getPublicKeyInfo(): ScannerPublicKeyInfo {
    return {
      keyId: this.keyId,
      key: this.publicKeyPem,
    };
  }

  signTicket(code: string, showtimeId: string): string {
    const payload = `${this.keyId}:${showtimeId}:${code}`;
    const sig = sign(null, Buffer.from(payload, 'utf8'), this.privateKey);
    return sig.toString('base64url');
  }

  verifyTicket(code: string, showtimeId: string, signature: string): boolean {
    try {
      const payload = `${this.keyId}:${showtimeId}:${code}`;
      const pubKey = createPublicKey(this.publicKeyPem);
      return verify(
        null,
        Buffer.from(payload, 'utf8'),
        pubKey,
        Buffer.from(signature, 'base64url'),
      );
    } catch {
      return false;
    }
  }
}
