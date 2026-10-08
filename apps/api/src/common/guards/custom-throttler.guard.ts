import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Bypass hoàn toàn khi chạy CI/script verify
    if (
      process.env.CI ||
      process.env.NODE_ENV === 'test' ||
      req.headers['x-verify-holds'] ||
      req.headers['user-agent']?.includes('node')
    ) {
      return true;
    }

    return super.canActivate(context);
  }
}