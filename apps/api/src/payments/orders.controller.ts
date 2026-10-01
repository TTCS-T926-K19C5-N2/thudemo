import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { Public } from '../auth/decorators/roles.decorator.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * SCRUM-33 (S-22): Kiểm tra trạng thái đơn hàng (Server-authoritative)
   * Phục vụ polling mỗi 2s từ client
   */
  @Public()
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.paymentsService.getOrderStatus(id);
  }

  /**
   * Tạo đơn hàng mới
   */
  @Public()
  @Post()
  async create(@Body() body: { eventId?: string; amount?: number }) {
    return this.paymentsService.createOrder(body);
  }

  /**
   * Lấy danh sách lịch sử đơn hàng (AC3)
   */
  @Public()
  @Get()
  async listOrders() {
    return this.paymentsService.findMine();
  }
}
