import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RegistrationSettings {
  readonly encryptionKey: Buffer | null;
  readonly publicOrigin: string | null;
  readonly worker: boolean;

  constructor(config: ConfigService) {
    const raw = config.get<string>('REGISTRATION_MAIL_KEY') ?? '';
    const decoded = Buffer.from(raw, 'base64url');
    this.encryptionKey =
      decoded.length === 32 && decoded.toString('base64url') === raw
        ? decoded
        : null;
    this.worker = config.get<string>('REGISTRATION_DELIVERY_MODE') !== 'off';
    let origin: string | null = null;
    try {
      const url = new URL(
        config.get<string>('REGISTRATION_PUBLIC_ORIGIN') ?? '',
      );
      if (
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      )
        origin = url.origin;
    } catch {
      // Missing/invalid registration config closes registration, not sessions.
    }
    this.publicOrigin = origin;
  }
}
