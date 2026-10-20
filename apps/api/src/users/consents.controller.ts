import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConsentsService } from './consents.service.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { ROLE_NAMES } from '../auth/roles.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import {
  canonicalPeer,
  verifyLoginPeer,
  LOGIN_PEER_HEADER,
} from 'shared/login-peer';

@Controller('users/consents')
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  private peer(request: Request): string {
    try {
      const header = request.headers[LOGIN_PEER_HEADER];
      return header === undefined
        ? canonicalPeer(request.socket?.remoteAddress)
        : verifyLoginPeer(
            typeof header === 'string' ? header : '',
            process.env.AUTH_PROXY_SECRET,
          );
    } catch {
      return canonicalPeer(request.socket?.remoteAddress);
    }
  }

  @Public()
  @Get('policies')
  getPolicies() {
    return this.consentsService.getPublicPolicies();
  }

  @Roles(...ROLE_NAMES)
  @Get('status')
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.consentsService.getConsentStatus(req.user.id);
  }

  @Roles(...ROLE_NAMES)
  @Get('history')
  getHistory(@Req() req: AuthenticatedRequest) {
    return this.consentsService.getConsentHistory(req.user.id, req.user.id);
  }

  @Roles(...ROLE_NAMES)
  @Get(':targetUserId/history')
  getTargetHistory(
    @Param('targetUserId', new ParseUUIDPipe()) targetUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consentsService.getConsentHistory(req.user.id, targetUserId);
  }

  @Roles(...ROLE_NAMES)
  @Post('agree')
  agreeConsents(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const peer = this.peer(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.consentsService.agreeConsents(req.user.id, body, peer, userAgent);
  }

  @Roles(...ROLE_NAMES)
  @Post('revoke')
  revokeConsent(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const peer = this.peer(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const type =
      body && typeof body === 'object' && 'type' in body
        ? (body as { type: unknown }).type
        : body;
    return this.consentsService.revokeConsent(
      req.user.id,
      req.user.id,
      type,
      peer,
      userAgent,
    );
  }

  @Roles(...ROLE_NAMES)
  @Post(':targetUserId/revoke')
  revokeTargetConsent(
    @Param('targetUserId', new ParseUUIDPipe()) targetUserId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const peer = this.peer(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const type =
      body && typeof body === 'object' && 'type' in body
        ? (body as { type: unknown }).type
        : body;
    return this.consentsService.revokeConsent(
      req.user.id,
      targetUserId,
      type,
      peer,
      userAgent,
    );
  }
}
