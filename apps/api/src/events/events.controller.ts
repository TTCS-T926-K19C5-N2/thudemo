import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { Roles, Public } from '../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Roles(Role.ORGANIZER)
  @Public()
  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.eventsService.create(req.user.id, body);
  }

  @Public()
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Roles(Role.ORGANIZER)
  @Post(':id/showtimes')
  addShowtime(@Request() req: any, @Param('id') eventId: string, @Body('startTime') startTime: string) {
    return this.eventsService.addShowtime(eventId, req.user.id, startTime);
  }
}
