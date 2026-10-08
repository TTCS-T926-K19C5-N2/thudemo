import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { HoldsModule } from './holds/holds.module.js';
import { MonitoringModule } from './monitoring/monitoring.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { WebhookSecurityFilter } from './payments/webhook-security.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SeatsModule } from './seats/seats.module.js';
import { ShowtimesModule } from './showtimes/showtimes.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    EventsModule,
    ShowtimesModule,
    HoldsModule,
    SeatsModule,
    OrdersModule,
    PaymentsModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: WebhookSecurityFilter,
    },
  ],
})
export class AppModule {}