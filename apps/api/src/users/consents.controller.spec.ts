import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsentsController } from './consents.controller.js';
import { ConsentsService } from './consents.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';

describe('ConsentsController', () => {
  let controller: ConsentsController;
  let service: any;

  beforeEach(() => {
    service = {
      getPublicPolicies: vi.fn().mockReturnValue({}),
      getConsentStatus: vi.fn().mockResolvedValue({}),
      getConsentHistory: vi.fn().mockResolvedValue([]),
      agreeConsents: vi.fn().mockResolvedValue({}),
      revokeConsent: vi.fn().mockResolvedValue({}),
    };

    controller = new ConsentsController(service as unknown as ConsentsService);
  });

  const mockReq = (userId = 'user-123') =>
    ({
      user: { id: userId, email: 'test@example.com', roles: ['BUYER'] },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    }) as unknown as AuthenticatedRequest;

  it('delegates getPolicies to service', () => {
    controller.getPolicies();
    expect(service.getPublicPolicies).toHaveBeenCalled();
  });

  it('delegates getStatus to service with authenticated user id', async () => {
    const req = mockReq('buyer-abc');
    await controller.getStatus(req);
    expect(service.getConsentStatus).toHaveBeenCalledWith('buyer-abc');
  });

  it('delegates getHistory to service with authenticated user id', async () => {
    const req = mockReq('buyer-abc');
    await controller.getHistory(req);
    expect(service.getConsentHistory).toHaveBeenCalledWith('buyer-abc', 'buyer-abc');
  });

  it('delegates getTargetHistory with operator and target user ids', async () => {
    const req = mockReq('operator-id');
    await controller.getTargetHistory('target-id', req);
    expect(service.getConsentHistory).toHaveBeenCalledWith('operator-id', 'target-id');
  });

  it('delegates agreeConsents with user id and peer', async () => {
    const req = mockReq('user-xyz');
    const body = { policies: [{ type: 'TERMS_OF_SERVICE', version: 'TERMS-v1.0' }] };
    await controller.agreeConsents(body, req);
    expect(service.agreeConsents).toHaveBeenCalledWith(
      'user-xyz',
      body,
      '127.0.0.1',
      undefined,
    );
  });

  it('delegates revokeConsent with user id, type, and peer', async () => {
    const req = mockReq('user-xyz');
    const body = { type: 'MARKETING_EMAIL' };
    await controller.revokeConsent(body, req);
    expect(service.revokeConsent).toHaveBeenCalledWith(
      'user-xyz',
      'user-xyz',
      'MARKETING_EMAIL',
      '127.0.0.1',
      undefined,
    );
  });

  it('delegates revokeTargetConsent with target user id', async () => {
    const req = mockReq('operator-xyz');
    const body = { type: 'MARKETING_EMAIL' };
    await controller.revokeTargetConsent('other-user', body, req);
    expect(service.revokeConsent).toHaveBeenCalledWith(
      'operator-xyz',
      'other-user',
      'MARKETING_EMAIL',
      '127.0.0.1',
      undefined,
    );
  });
});
