import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';
import { OnModuleDestroy, OnModuleInit, Injectable } from '@nestjs/common';

@Injectable()
class WaitlistWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  constructor(private readonly config: ConfigService, private readonly waitlist: WaitlistService) {}
  onModuleInit() {
    if (this.config.get<string>('WAITLIST_MAIL_WORKER') !== 'true') return;
    this.timer = setInterval(() => {
      if (!this.flight) this.flight = this.waitlist.drainOnce().then(() => undefined).catch(() => undefined).finally(() => { this.flight = undefined; });
    }, 1000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}

@Module({
  imports: [ConfigModule, MailModule, PrismaModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistWorker],
  exports: [WaitlistService],
})
export class WaitlistModule {}
