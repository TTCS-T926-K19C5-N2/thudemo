import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConsentsService } from './consents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  CURRENT_POLICIES,
  PolicyType,
  ConsentStatus,
} from 'shared/policy-registry';

describe('ConsentsService', () => {
  let service: ConsentsService;
  let mockPrisma: any;
  let mockMailService: any;

  beforeEach(() => {
    mockPrisma = {
      userConsent: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      userConsentHistory: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockMailService = {
      ready: true,
      send: vi.fn().mockResolvedValue(undefined),
    };

    service = new ConsentsService(
      mockPrisma as unknown as PrismaService,
      mockMailService as unknown as MailService,
    );
  });

  describe('getConsentStatus', () => {
    it('detects when mandatory policies are missing and requires reconsent', async () => {
      mockPrisma.userConsent.findMany.mockResolvedValue([]);

      const status = await service.getConsentStatus('user-1');

      expect(status.needsReconsent).toBe(true);
      expect(status.pendingPolicies.length).toBeGreaterThanOrEqual(2);
      expect(
        status.pendingPolicies.some(
          (p) => p.type === PolicyType.TERMS_OF_SERVICE,
        ),
      ).toBe(true);
      expect(
        status.pendingPolicies.some((p) => p.type === PolicyType.PRIVACY_POLICY),
      ).toBe(true);
    });

    it('detects when a user has an outdated policy version and flags for reconsent', async () => {
      mockPrisma.userConsent.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          type: PolicyType.TERMS_OF_SERVICE,
          version: 'TERMS-OLD-v0.9',
          status: ConsentStatus.GRANTED,
          consentedAt: new Date('2026-01-01'),
          revokedAt: null,
        },
        {
          userId: 'user-1',
          type: PolicyType.PRIVACY_POLICY,
          version: CURRENT_POLICIES.PRIVACY_POLICY.version,
          status: ConsentStatus.GRANTED,
          consentedAt: new Date('2026-01-01'),
          revokedAt: null,
        },
      ]);

      const status = await service.getConsentStatus('user-1');

      expect(status.needsReconsent).toBe(true);
      expect(status.pendingPolicies).toHaveLength(1);
      expect(status.pendingPolicies[0].type).toBe(PolicyType.TERMS_OF_SERVICE);
      expect(status.pendingPolicies[0].currentVersion).toBe('TERMS-OLD-v0.9');
      expect(status.pendingPolicies[0].requiredVersion).toBe(
        CURRENT_POLICIES.TERMS_OF_SERVICE.version,
      );
    });

    it('reports no reconsent needed when all mandatory policies match active versions', async () => {
      mockPrisma.userConsent.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          type: PolicyType.TERMS_OF_SERVICE,
          version: CURRENT_POLICIES.TERMS_OF_SERVICE.version,
          status: ConsentStatus.GRANTED,
          consentedAt: new Date('2026-10-01'),
          revokedAt: null,
        },
        {
          userId: 'user-1',
          type: PolicyType.PRIVACY_POLICY,
          version: CURRENT_POLICIES.PRIVACY_POLICY.version,
          status: ConsentStatus.GRANTED,
          consentedAt: new Date('2026-10-01'),
          revokedAt: null,
        },
        {
          userId: 'user-1',
          type: PolicyType.MARKETING_EMAIL,
          version: CURRENT_POLICIES.MARKETING_EMAIL.version,
          status: ConsentStatus.REVOKED,
          consentedAt: new Date('2026-10-01'),
          revokedAt: new Date('2026-10-02'),
        },
      ]);

      const status = await service.getConsentStatus('user-1');

      expect(status.needsReconsent).toBe(false);
      expect(status.pendingPolicies).toHaveLength(0);
    });
  });

  describe('agreeConsents', () => {
    it('rejects invalid or empty policy lists', async () => {
      await expect(service.agreeConsents('user-1', null)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.agreeConsents('user-1', { policies: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown policy types', async () => {
      await expect(
        service.agreeConsents('user-1', {
          policies: [{ type: 'INVALID_TYPE', version: 'v1.0' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects outdated or mismatched versions when agreeing', async () => {
      await expect(
        service.agreeConsents('user-1', {
          policies: [
            {
              type: PolicyType.TERMS_OF_SERVICE,
              version: 'WRONG-VERSION',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('records consent and creates history audit log with peer IP', async () => {
      mockPrisma.userConsent.findMany.mockResolvedValue([]);

      await service.agreeConsents(
        'user-1',
        {
          policies: [
            {
              type: PolicyType.TERMS_OF_SERVICE,
              version: CURRENT_POLICIES.TERMS_OF_SERVICE.version,
            },
            {
              type: PolicyType.PRIVACY_POLICY,
              version: CURRENT_POLICIES.PRIVACY_POLICY.version,
            },
          ],
        },
        '192.168.1.50',
        'Mozilla/5.0 TestBrowser',
      );

      expect(mockPrisma.userConsent.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userConsentHistory.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userConsentHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: PolicyType.TERMS_OF_SERVICE,
          version: CURRENT_POLICIES.TERMS_OF_SERVICE.version,
          action: 'GRANTED',
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0 TestBrowser',
        }),
      });
    });
  });

  describe('revokeConsent', () => {
    it('prevents modifying or revoking another user consent (403 Forbidden)', async () => {
      await expect(
        service.revokeConsent(
          'user-victim',
          'user-attacker',
          PolicyType.MARKETING_EMAIL,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects revoking invalid policy types', async () => {
      await expect(
        service.revokeConsent('user-1', 'user-1', 'NOT_EXISTING'),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully revokes marketing email consent and appends audit log', async () => {
      mockPrisma.userConsent.findUnique.mockResolvedValue({
        userId: 'user-1',
        type: PolicyType.MARKETING_EMAIL,
        version: CURRENT_POLICIES.MARKETING_EMAIL.version,
        status: ConsentStatus.GRANTED,
      });

      mockPrisma.userConsent.upsert.mockResolvedValue({
        userId: 'user-1',
        type: PolicyType.MARKETING_EMAIL,
        version: CURRENT_POLICIES.MARKETING_EMAIL.version,
        status: ConsentStatus.REVOKED,
        revokedAt: new Date(),
      });

      const res = await service.revokeConsent(
        'user-1',
        'user-1',
        PolicyType.MARKETING_EMAIL,
        '10.0.0.1',
      );

      expect(res.status).toBe(ConsentStatus.REVOKED);
      expect(mockPrisma.userConsent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_type: {
              userId: 'user-1',
              type: PolicyType.MARKETING_EMAIL,
            },
          },
          update: expect.objectContaining({
            status: ConsentStatus.REVOKED,
          }),
        }),
      );
      expect(mockPrisma.userConsentHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: PolicyType.MARKETING_EMAIL,
          action: 'REVOKED',
          ipAddress: '10.0.0.1',
        }),
      });
    });
  });

  describe('getConsentHistory', () => {
    it('rejects viewing another user history (403 Forbidden)', async () => {
      await expect(
        service.getConsentHistory('user-victim', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns history ordered chronologically', async () => {
      const records = [
        {
          id: 'log-2',
          userId: 'user-1',
          type: PolicyType.MARKETING_EMAIL,
          version: 'MARKETING-v1.0',
          action: 'REVOKED',
          createdAt: new Date('2026-10-05'),
        },
        {
          id: 'log-1',
          userId: 'user-1',
          type: PolicyType.MARKETING_EMAIL,
          version: 'MARKETING-v1.0',
          action: 'GRANTED',
          createdAt: new Date('2026-10-01'),
        },
      ];
      mockPrisma.userConsentHistory.findMany.mockResolvedValue(records);

      const history = await service.getConsentHistory('user-1', 'user-1');

      expect(history).toEqual(records);
      expect(mockPrisma.userConsentHistory.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('Marketing Email Guard & Delivery', () => {
    it('returns false when user has revoked marketing consent', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.userConsent.findUnique.mockResolvedValue({
        status: ConsentStatus.REVOKED,
      });

      const allowed = await service.canSendMarketingEmail('user-1');

      expect(allowed).toBe(false);
    });

    it('returns false when user never granted marketing consent', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.userConsent.findUnique.mockResolvedValue(null);

      const allowed = await service.canSendMarketingEmail('user-1');

      expect(allowed).toBe(false);
    });

    it('returns true when user has GRANTED marketing consent', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.userConsent.findUnique.mockResolvedValue({
        status: ConsentStatus.GRANTED,
      });

      const allowed = await service.canSendMarketingEmail('user-1');

      expect(allowed).toBe(true);
    });

    it('refuses to send marketing email to a user who revoked consent', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.userConsent.findUnique.mockResolvedValue({
        status: ConsentStatus.REVOKED,
      });

      const result = await service.sendMarketingEmail(
        'buyer@example.com',
        'Khuyến mãi đặc biệt!',
        'Nội dung khuyến mãi',
      );

      expect(result.sent).toBe(false);
      expect(mockMailService.send).not.toHaveBeenCalled();
    });

    it('successfully sends marketing email to a user with active consent', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.userConsent.findUnique.mockResolvedValue({
        status: ConsentStatus.GRANTED,
      });

      const result = await service.sendMarketingEmail(
        'buyer@example.com',
        'Khuyến mãi đặc biệt!',
        'Nội dung khuyến mãi',
      );

      expect(result.sent).toBe(true);
      expect(mockMailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'buyer@example.com',
          subject: 'Khuyến mãi đặc biệt!',
          text: 'Nội dung khuyến mãi',
        }),
      );
    });
  });
});
