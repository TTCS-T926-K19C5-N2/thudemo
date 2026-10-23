import {
  CanActivate,
  Controller,
  ExecutionContext,
  Header,
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { BookingAccessService } from './booking-access.service.js';
import {
  canonicalPeer,
  verifyLoginPeer,
  LOGIN_PEER_HEADER,
} from 'shared/login-peer';

@Injectable()
export class BookingAccessGuard implements CanActivate {
  constructor(private readonly access: BookingAccessService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.method !== 'POST' || !req.user) return true;
    let path: string;
    try {
      path = decodeURIComponent(req.path).replace(/\/+$/, '').toLowerCase();
    } catch {
      throw new BadRequestException('Đường dẫn đặt vé không hợp lệ.');
    }
    const matched = /^\/showtimes\/([0-9a-f-]{36})\/(holds|orders)$/i.exec(
      path,
    );
    const order = path === '/orders';
    if (!matched && !order) return true;
    let peer: string;
    try {
      const header = req.headers[LOGIN_PEER_HEADER];
      peer =
        header === undefined
          ? canonicalPeer(req.socket.remoteAddress)
          : verifyLoginPeer(
              typeof header === 'string' ? header : '',
              process.env.AUTH_PROXY_SECRET,
            );
    } catch {
      throw new ForbiddenException('Nguồn đặt vé không hợp lệ.');
    }
    const retry = await this.access.limit(
      matched?.[2] === 'holds' ? 'hold' : 'order',
      req.user.id,
      peer,
    );
    if (retry > 0) {
      context
        .switchToHttp()
        .getResponse<{ setHeader: (k: string, v: string) => void }>()
        .setHeader('Retry-After', String(retry));
      throw new HttpException(
        {
          code: 'BOOKING_RATE_LIMIT',
          message: 'Bạn thao tác quá nhanh. Hãy chờ rồi thử lại.',
          retryAfterSeconds: retry,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const showtimeId: unknown =
      matched?.[1] ??
      (req.body as { showtimeId?: unknown } | undefined)?.showtimeId;
    if (
      typeof showtimeId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(showtimeId) &&
      !(await this.access.admitted(showtimeId, req.user.id))
    )
      throw new HttpException(
        {
          code: 'WAITING_ROOM_REQUIRED',
          message: 'Vui lòng vào phòng chờ để nhận lượt đặt vé.',
          showtimeId,
        },
        429,
      );
    return true;
  }
}
@Controller('showtimes/:id/waiting-room')
@Roles('BUYER')
class WaitingRoomController {
  constructor(private readonly access: BookingAccessService) {}
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.access.join(id, req.user.id);
  }
}
@Module({
  providers: [
    BookingAccessService,
    { provide: APP_GUARD, useClass: BookingAccessGuard },
  ],
  controllers: [WaitingRoomController],
})
export class BookingAccessModule {}
