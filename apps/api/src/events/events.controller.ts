import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Roles('ORGANIZER')
  @Public()
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.eventsService.create(request.user.id, body);
  }

  @Public()
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }

  @Roles('ORGANIZER')
  @Get('mine')
  findMine(@Req() request: AuthenticatedRequest) {
    return this.eventsService.findMine(request.user.id);
  }

  @Roles('ORGANIZER')
  @Get(':id/manage')
  findOwned(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.eventsService.findOwned(id, request.user.id);
  }

  @Roles('ORGANIZER')
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.eventsService.update(id, request.user.id, body);
  }

  @Roles('ORGANIZER')
  @Post(':id/showtimes')
  addShowtime(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.eventsService.addShowtime(id, request.user.id, body);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }
}