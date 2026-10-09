import { Module } from '@nestjs/common';
import { ScannerController } from './scanner.controller.js';
import { ScannerService } from './scanner.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ScannerController],
  providers: [ScannerService, ScannerCryptoService],
  exports: [ScannerService, ScannerCryptoService],
})
export class ScannerModule {}
