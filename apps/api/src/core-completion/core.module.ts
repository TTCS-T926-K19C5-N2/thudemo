import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CoreService } from './core.service.js';
import { MailAdminService } from './mail-admin.service.js';
import { MailModule } from '../mail/mail.module.js';
import { RegistrationSettings } from '../users/registration-settings.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import {
  canonicalPeer,
  verifyLoginPeer,
  LOGIN_PEER_HEADER,
} from 'shared/login-peer';
import { ScannerModule } from '../scanner/scanner.module.js';
@Controller()
class CoreController {
  constructor(
    private readonly core: CoreService,
    private readonly admin: MailAdminService,
  ) {}
  private peer(req: AuthenticatedRequest) {
    let peer: string;
    try {
      const h = req.headers[LOGIN_PEER_HEADER];
      peer =
        h === undefined
          ? canonicalPeer(req.socket.remoteAddress)
          : verifyLoginPeer(
              typeof h === 'string' ? h : '',
              process.env.AUTH_PROXY_SECRET,
            );
    } catch {
      throw new ForbiddenException('Nguồn yêu cầu không hợp lệ.');
    }
    return peer;
  }
  @Public()
  @Post('auth/forgot-password')
  @HttpCode(202)
  forgot(@Req() req: AuthenticatedRequest, @Body() b: unknown) {
    return this.core.forgot(
      (b as { email?: unknown } | null)?.email,
      this.peer(req),
    );
  }
  @Public()
  @Post('auth/reset-password')
  @HttpCode(200)
  reset(@Req() req: AuthenticatedRequest, @Body() b: unknown) {
    const input = b as { token?: unknown; password?: unknown } | null;
    return this.core.reset(input?.token, input?.password, this.peer(req));
  }
  @Roles('ORGANIZER')
  @Post('showtimes/:id/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() b: unknown,
  ) {
    return this.core.reschedule(id, req.user.id, b);
  }
  @Roles('ADMIN')
  @Get('operations/mail')
  @Header('Cache-Control', 'private, no-store')
  mail(
    @Query('page') page?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    return this.admin.list(page, status, kind);
  }
  @Roles('ADMIN')
  @Post('operations/mail/retry')
  @HttpCode(200)
  retry(@Req() req: AuthenticatedRequest, @Body() b: unknown) {
    return this.admin.retry(req.user.id, b);
  }
}
@Injectable()
export class CoreWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  private nextReminder = 0;
  private readonly logger = new Logger(CoreWorker.name);
  constructor(private readonly core: CoreService) {}
  onModuleInit() {
    if (!this.core.notificationEnabled && !this.core.passwordWorkerEnabled)
      return;
    this.timer = setInterval(() => void this.tick(), 2000);
    this.timer.unref();
    void this.tick();
  }
  tick() {
    if (this.flight) return this.flight;
    this.flight = (async () => {
      if (this.core.passwordWorkerEnabled) await this.core.deliverReset();
      if (this.core.notificationEnabled) {
        if (Date.now() >= this.nextReminder) {
          await this.core.enqueueReminders();
          this.nextReminder = Date.now() + 60000;
        }
        await this.core.deliverNotification();
      }
    })()
      .catch(() => {
        this.logger.warn(
          'Communication work deferred; dependency unavailable.',
        );
      })
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight;
  }
}
@Module({
  imports: [MailModule, ScannerModule],
  providers: [CoreService, RegistrationSettings, MailAdminService, CoreWorker],
  controllers: [CoreController],
  exports: [CoreService],
})
export class CoreCompletionModule {}
