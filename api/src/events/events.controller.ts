import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.events.create(body);
  }

  @Get()
  list() {
    return this.events.list();
  }

  @Get(':eventId')
  detail(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.detail(eventId);
  }
}
