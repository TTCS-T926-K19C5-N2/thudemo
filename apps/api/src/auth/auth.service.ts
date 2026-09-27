import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service.js';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  async login(email: string, pass: string) {
    const isLocked = await this.redisService.isAccountLocked(email);
    if (isLocked) {
      const ttl = await this.redisService.getLockTTL(email);
      const minutes = Math.ceil(ttl / 60);
      throw new ForbiddenException(`Account is locked. Try again in ${minutes} minutes.`);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Intentionally same error to avoid email enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Please activate your account before logging in.');
    }

    const isMatch = await argon2.verify(user.password, pass);
    if (!isMatch) {
      const fails = await this.redisService.incrementLoginFailures(email);
      if (fails >= 5) {
        await this.redisService.lockAccount(email);
        await this.redisService.clearLoginFailures(email);
        throw new ForbiddenException('Account locked for 15 minutes due to too many failed attempts.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.redisService.clearLoginFailures(email);

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
