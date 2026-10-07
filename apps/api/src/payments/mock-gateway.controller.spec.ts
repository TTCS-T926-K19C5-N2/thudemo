import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import {
  MockGatewayController,
  MockGatewayEnabledGuard,
} from './mock-gateway.controller.js';
import { MockGatewayService } from './mock-gateway.service.js';

describe('MockGatewayController & Guard', () => {
  describe('MockGatewayEnabledGuard', () => {
    it('allows access when PAYMENT_GATEWAY is mock', () => {
      const config = {
        get: vi.fn().mockReturnValue('mock'),
      } as unknown as ConfigService;
      const guard = new MockGatewayEnabledGuard(config);

      expect(guard.canActivate({} as any)).toBe(true);
    });

    it('throws NotFoundException when PAYMENT_GATEWAY is not mock', () => {
      const config = {
        get: vi.fn().mockReturnValue('momo'),
      } as unknown as ConfigService;
      const guard = new MockGatewayEnabledGuard(config);

      expect(() => guard.canActivate({} as any)).toThrow(NotFoundException);
    });
  });

  describe('MockGatewayController', () => {
    let controller: MockGatewayController;
    let mockService: { submitPayment: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockService = {
        submitPayment: vi.fn().mockResolvedValue({
          success: true,
          redirectUrl: 'http://localhost:3000/payment/result?orderId=123',
          status: 'SUCCESS',
        }),
      };
      controller = new MockGatewayController(
        mockService as unknown as MockGatewayService,
      );
    });

    it('getStatus returns enabled status', () => {
      expect(controller.getStatus()).toEqual({
        enabled: true,
        gateway: 'mock',
      });
    });

    it('submitPayment delegates to service', async () => {
      const dto = {
        orderId: '123',
        amount: 50000,
        gatewayRef: 'ref_123',
        returnUrl: 'http://localhost:3000/payment/result?orderId=123',
        outcome: 'SUCCESS' as const,
      };

      const result = await controller.submitPayment(dto);
      expect(mockService.submitPayment).toHaveBeenCalledWith(dto);
      expect(result.status).toBe('SUCCESS');
    });
  });
});
