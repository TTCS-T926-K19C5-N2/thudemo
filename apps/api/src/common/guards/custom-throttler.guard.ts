import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 1. Ưu tiên kiểm tra xem request có thông tin User (Account ID) không
    if (req.user && (req.user.id || req.user.sub)) {
      const userId = req.user.id || req.user.sub;
      return `user_${userId}`;
    }

    // 2. Nếu là khách chưa đăng nhập, dùng địa chỉ IP
    const ip =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      'unknown_ip';

    return `ip_${ip}`;
  }
}