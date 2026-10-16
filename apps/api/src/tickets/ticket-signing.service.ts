import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  encodeTicketQr,
  signTicketQr,
  verifyTicketQr,
  type SignedTicketQr,
  type TicketQrVerification,
} from './ticket-qr.js';
import {
  exportTicketPublicKey,
  loadTicketSigningKeys,
  type TicketSigningKeys,
} from './ticket-signing-keys.js';

export interface IssuedTicketQr extends SignedTicketQr {
  qrPayload: string;
}

export interface TicketPublicKeyInfo {
  keyId: string;
  // Base64 SPKI DER, importable with WebCrypto `importKey('spki', ...)`.
  publicKey: string;
  active: boolean;
}

@Injectable()
export class TicketSigningService {
  private readonly logger = new Logger(TicketSigningService.name);
  private readonly keys: TicketSigningKeys;

  constructor(config: ConfigService) {
    this.keys = loadTicketSigningKeys({
      NODE_ENV: config.get<string>('NODE_ENV'),
      APP_ENV: config.get<string>('APP_ENV'),
      TICKET_SIGNING_ACTIVE_KEY_ID: config.get<string>('TICKET_SIGNING_ACTIVE_KEY_ID'),
      TICKET_SIGNING_PRIVATE_KEY: config.get<string>('TICKET_SIGNING_PRIVATE_KEY'),
      TICKET_SIGNING_PUBLIC_KEYS: config.get<string>('TICKET_SIGNING_PUBLIC_KEYS'),
    });
    if (this.keys.ephemeral) {
      this.logger.warn(
        'TICKET_SIGNING_PRIVATE_KEY is not configured; using a temporary key. Tickets issued now will not verify after a restart.',
      );
    }
  }

  // Sign once at issue time and store keyId + signature with the ticket:
  // after a rotation the retired private key is gone, so it cannot re-sign.
  sign(claims: { code: string; showtimeId: string }): IssuedTicketQr {
    const signed = signTicketQr(
      { ...claims, keyId: this.keys.activeKeyId },
      this.keys.privateKey,
    );
    return { ...signed, qrPayload: encodeTicketQr(signed) };
  }

  verify(raw: string): TicketQrVerification {
    return verifyTicketQr(raw, this.keys.publicKeys);
  }

  getPublicKeys(): TicketPublicKeyInfo[] {
    return [...this.keys.publicKeys].map(([keyId, key]) => ({
      keyId,
      publicKey: exportTicketPublicKey(key),
      active: keyId === this.keys.activeKeyId,
    }));
  }
}
