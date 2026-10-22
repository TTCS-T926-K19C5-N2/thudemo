import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShowtimesModule } from './showtimes.module.js';
import { HoldsModule } from '../holds/holds.module.js';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { SeatEventsService } from './seat-events.service.js';

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    { provide: 'REDIS_CLIENT', useValue: {} },
  ],
  exports: [PrismaService, 'REDIS_CLIENT'],
})
class IsolatedStores {}

it('wires showtime, hold and cancellation modules to one seat event publisher', async () => {
  // Compile the real modules; database operations are covered by AppModule E2E.
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ DATABASE_URL: 'postgresql://fixture@127.0.0.1:1/isolated' })],
      }),
      IsolatedStores,
      ShowtimesModule,
      HoldsModule,
      LifecycleModule,
    ],
  }).compile();
  try {
    const publishers = module.get(SeatEventsService, { each: true });
    expect(publishers).toHaveLength(1);
  } finally {
    await module.close();
  }
});
