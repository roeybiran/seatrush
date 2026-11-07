import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateEventDto } from './create-event.dto';
import { EventsService } from './events.service';
import { CreateEventPipe } from './create-event.pipe';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@Body(CreateEventPipe) body: CreateEventDto) {
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
