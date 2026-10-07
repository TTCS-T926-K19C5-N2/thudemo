import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface.js';
import { MomoGateway } from './gateways/momo.gateway.js';
import { AccountantNotifier } from './accountant-notifier.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';

export const paymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  useFactory: (config: ConfigService, momoGateway: MomoGateway) => {
    const gatewayType = config
      .get<string>('PAYMENT_GATEWAY', 'momo')
      .toLowerCase();
    if (gatewayType === 'momo') {
      return momoGateway;
    }
    // Default fallback to MomoGateway for S-18; S-19 plugs MockGateway here
    return momoGateway;
  },
  inject: [ConfigService, MomoGateway],
};

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [PaymentsController],
  providers: [
    MomoGateway,
    paymentGatewayProvider,
    AccountantNotifier,
    PaymentsService,
  ],
  exports: [PaymentsService, PAYMENT_GATEWAY, AccountantNotifier],
})
export class PaymentsModule {}
