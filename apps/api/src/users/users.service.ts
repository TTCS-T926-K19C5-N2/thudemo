import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createStaff(email: string, pass: string) {
    if (pass.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const hashedPassword = await argon2.hash(pass);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        isEmailVerified: true,
        isActive: true,
        userRoles: {
          create: { role: { connect: { name: 'STAFF' } } },
        },
      },
    });

    return { message: 'Staff account created successfully', id: user.id };
  }

  async disableAccount(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Account disabled successfully' };
  }
}
