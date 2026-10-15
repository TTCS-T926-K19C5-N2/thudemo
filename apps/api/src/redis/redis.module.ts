import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL');
        if (url) {
          try {
            const parsed = new URL(url);
            if (
              !['redis:', 'rediss:'].includes(parsed.protocol) ||
              !parsed.hostname
            )
              throw new Error('Invalid Redis address');
          } catch {
            // URL parse errors may include the full credential-bearing input.
            throw new Error('Invalid REDIS_URL configuration');
          }
          return new Redis(url);
        }
        const host = configService.getOrThrow<string>('REDIS_HOST');
        const port = Number(configService.getOrThrow<string>('REDIS_PORT'));
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('Invalid REDIS_PORT');
        }
        return new Redis(port, host);
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
