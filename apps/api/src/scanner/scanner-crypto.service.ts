import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import {
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';
import {
  parseTicketQr,
  ticketQrInput,
  type TicketQrPublicKey,
} from 'shared/ticket-qr';

export interface ScannerPublicKeyInfo extends TicketQrPublicKey {
  version: 'ET1';
  algorithm: 'Ed25519';
  verificationKeys: TicketQrPublicKey[];
}
@Injectable()
export class ScannerCryptoService {
  private readonly keys = new Map<string, KeyObject>();
  private readonly activeKeyId: string | undefined;
  private readonly privateKey: KeyObject | undefined;

  constructor(config: ConfigService) {
    this.activeKeyId = config.get<string>('SCANNER_KEY_ID');
    const privateFile = config.get<string>('SCANNER_SIGNING_PRIVATE_KEY_FILE');
    const privatePem = config.get<string>('SCANNER_SIGNING_PRIVATE_KEY');
    const activePublic = config.get<string>('SCANNER_PUBLIC_KEY');
    const publicRing = config.get<string>('SCANNER_PUBLIC_KEYS');
    if (
      !this.activeKeyId &&
      !privateFile &&
      !privatePem &&
      !activePublic &&
      !publicRing
    )
      return;
    try {
      if (!this.activeKeyId || !/^[A-Za-z0-9_-]{1,32}$/.test(this.activeKeyId))
        throw Error();
      const ring: unknown = publicRing ? JSON.parse(publicRing) : {};
      if (!ring || typeof ring !== 'object' || Array.isArray(ring))
        throw Error();
      for (const [id, pem] of Object.entries(ring)) {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof pem !== 'string')
          throw Error();
        if (!pem.trim().startsWith('-----BEGIN PUBLIC KEY-----')) throw Error();
        const key = createPublicKey(pem);
        if (key.asymmetricKeyType !== 'ed25519') throw Error();
        this.keys.set(id, key);
      }
      if (activePublic) {
        if (!activePublic.trim().startsWith('-----BEGIN PUBLIC KEY-----'))
          throw Error();
        const key = createPublicKey(activePublic);
        if (key.asymmetricKeyType !== 'ed25519') throw Error();
        const existing = this.keys.get(this.activeKeyId);
        if (
          existing &&
          !existing
            .export({ type: 'spki', format: 'der' })
            .equals(key.export({ type: 'spki', format: 'der' }))
        )
          throw Error();
        this.keys.set(this.activeKeyId, key);
      }
      if (privateFile && privatePem) throw Error();
      if (privateFile || privatePem) {
        this.privateKey = createPrivateKey(
          privateFile ? readFileSync(privateFile) : privatePem!,
        );
        if (this.privateKey.asymmetricKeyType !== 'ed25519') throw Error();
        const derived = createPublicKey(this.privateKey);
        const configured = this.keys.get(this.activeKeyId);
        if (
          configured &&
          !configured
            .export({ type: 'spki', format: 'der' })
            .equals(derived.export({ type: 'spki', format: 'der' }))
        )
          throw Error();
        this.keys.set(this.activeKeyId, derived);
      }
      if (!this.keys.has(this.activeKeyId)) throw Error();
    } catch {
      // Never include parse errors, PEM, paths or environment values in logs.
      throw new Error(
        'Invalid ticket QR key configuration; no ephemeral fallback',
      );
    }
  }
  getKeyId(): string {
    if (!this.activeKeyId) throw this.unavailable();
    return this.activeKeyId;
  }
  getPublicKeys(): TicketQrPublicKey[] {
    if (!this.keys.size) throw this.unavailable();
    return [...this.keys].map(([keyId, key]) => ({
      keyId,
      key: key.export({ type: 'spki', format: 'pem' }).toString().trim(),
    }));
  }
  getPublicKeyInfo(): ScannerPublicKeyInfo {
    const keyId = this.getKeyId();
    const verificationKeys = this.getPublicKeys();
    return {
      keyId,
      key: verificationKeys.find((key) => key.keyId === keyId)!.key,
      version: 'ET1',
      algorithm: 'Ed25519',
      verificationKeys,
    };
  }
  issueQr(ticketId: string, showtimeId: string): string {
    if (!this.privateKey) throw this.unavailable();
    const input = ticketQrInput({
      keyId: this.getKeyId(),
      showtimeId,
      ticketId,
    });
    return (
      input +
      '.' +
      sign(null, Buffer.from(input, 'ascii'), this.privateKey).toString(
        'base64url',
      )
    );
  }
  verifyQr(value: unknown) {
    const claims = parseTicketQr(value);
    if (!this.keys.size) throw this.unavailable();
    const key = claims && this.keys.get(claims.keyId);
    if (
      !claims ||
      !key ||
      !verify(
        null,
        Buffer.from(claims.signingInput, 'ascii'),
        key,
        Buffer.from(claims.signature, 'base64url'),
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_QR_SIGNATURE',
        message: 'Mã QR không hợp lệ hoặc chữ ký không được xác minh.',
      });
    }
    return claims;
  }
  private unavailable() {
    return new ServiceUnavailableException({
      code: 'QR_KEYS_UNAVAILABLE',
      message: 'Chưa sẵn sàng xác minh QR. Liên hệ người phụ trách và thử lại.',
    });
  }
}
