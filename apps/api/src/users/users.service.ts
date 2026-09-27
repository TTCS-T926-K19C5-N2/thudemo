import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async register(email: string, pass: string) {
    if (pass.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // Do not reveal that email exists, just return success
      this.logger.log(`Registration attempt for existing email: ${email}`);
      return { message: 'If the email is valid, you will receive instructions.' };
    }

    const hashedPassword = await argon2.hash(pass);
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hours

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        activationToken,
        activationExpires: expires,
        isEmailVerified: false,
      },
    });

    // Mock sending email
    this.logger.log(`[MOCK EMAIL] To: ${email}`);
    this.logger.log(`[MOCK EMAIL] Subject: Activate your account`);
    this.logger.log(`[MOCK EMAIL] Link: http://localhost:3000/auth/activate?token=${activationToken}`);

    return { message: 'If the email is valid, you will receive instructions.' };
  }

  async activate(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { activationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid activation token');
    }

    if (user.activationExpires && user.activationExpires < new Date()) {
      throw new BadRequestException('Activation link expired. Please request a new one.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        activationToken: null,
        activationExpires: null,
      },
    });

    return { message: 'Account activated successfully.' };
  }

  async resendActivation(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    
    // Do not reveal email existence
    if (!user || user.isEmailVerified) {
      return { message: 'If the email is valid and unverified, you will receive a new link.' };
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        activationToken,
        activationExpires: expires,
      },
    });

    this.logger.log(`[MOCK EMAIL] To: ${email}`);
    this.logger.log(`[MOCK EMAIL] Subject: New Activation Link`);
    this.logger.log(`[MOCK EMAIL] Link: http://localhost:3000/auth/activate?token=${activationToken}`);

    return { message: 'If the email is valid and unverified, you will receive a new link.' };
  }
}
