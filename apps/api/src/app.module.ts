import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { EventsModule } from './events/events.module.js';
import { ShowtimesModule } from './showtimes/showtimes.module.js';
import { HoldsModule } from './holds/holds.module.js';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
    }),
    // Cấu hình Throttler (Rate Limiting)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60.000ms = 1 phút
        limit: 60,  // Mặc định 60 request / phút cho toàn hệ thống
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    EventsModule,
    ShowtimesModule,
    HoldsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Đăng ký CustomThrottlerGuard làm Global Guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}