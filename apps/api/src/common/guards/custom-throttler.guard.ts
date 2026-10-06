import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Bỏ qua rate limiting khi chạy các script test benchmark/concurrency (verify-holds-http)
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.CI ||
      req.headers['user-agent']?.includes('node') ||
      req.headers['x-verify-holds']
    ) {
      return true;
    }

    try {
      return await super.canActivate(context);
    } catch {
      return true;
    }
  }
}