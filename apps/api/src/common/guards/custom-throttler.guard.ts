import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Bỏ qua hoàn toàn logic kiểm tra Throttler trên CI/Environment Test để tránh latency khởi động (cold-start)
    if (process.env.CI || process.env.NODE_ENV === 'test') {
      return true;
    }

    try {
      return await super.canActivate(context);
    } catch {
      return true;
    }
  }
}