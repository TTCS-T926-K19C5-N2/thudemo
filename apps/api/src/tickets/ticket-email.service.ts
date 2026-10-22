import { Injectable, BadRequestException } from '@nestjs/common';
import { TicketDeliveryService } from './ticket-delivery.service.js';

export type EmailNotificationType = 'REMINDER' | 'RESCHEDULED';

export interface TicketReminderEmailPayload {
  orderId: string;
  ticketId: string;
  showtimeStart: Date;
  scheduleVersion: Date;
  location: string;
  previousStart?: Date | null;
  type: EmailNotificationType;
}

@Injectable()
export class TicketEmailService {
  constructor(private readonly deliveries: TicketDeliveryService) {}

  async sendReminder(payload: TicketReminderEmailPayload): Promise<void> {
    if (!payload.orderId || !payload.ticketId)
      throw new BadRequestException(
        'Thiếu định danh vé hoặc đơn cần nhắc lịch.',
      );
    await this.deliveries.enqueueNotification(
      payload.orderId,
      `reminder:${payload.ticketId}:${payload.type}:${payload.showtimeStart.toISOString()}:${payload.scheduleVersion.toISOString()}`,
      {
        kind: payload.type,
        ticketId: payload.ticketId,
        showtimeStart: payload.showtimeStart.toISOString(),
        location: payload.location,
      },
    );
  }
}
