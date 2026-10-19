import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/roles.decorator.js';
import {
  MockGatewayService,
  MockGatewaySubmitDto,
} from './mock-gateway.service.js';

@Injectable()
export class MockGatewayEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const isMock =
      this.config.get<string>('PAYMENT_GATEWAY', 'momo').toLowerCase() ===
      'mock';
    if (!isMock) {
      throw new NotFoundException(
        'Cổng thanh toán giả lập không được kích hoạt trên hệ thống.',
      );
    }
    return true;
  }
}

@Controller('mock-gateway')
@UseGuards(MockGatewayEnabledGuard)
@Public()
export class MockGatewayController {
  constructor(private readonly mockGatewayService: MockGatewayService) {}

  @Get('status')
  getStatus() {
    return {
      enabled: true,
      gateway: 'mock',
    };
  }

  @Post('submit')
  @HttpCode(200)
  submitPayment(@Body() body: MockGatewaySubmitDto) {
    return this.mockGatewayService.submitPayment(body);
  }
}
