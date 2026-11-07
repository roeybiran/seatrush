import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { EventDetailResponseDto, EventResponseDto } from './event-response.dto';
import { CreateEventDto } from './create-event.dto';
import { EventsService } from './events.service';
import { CreateEventPipe } from './create-event.pipe';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an event and its seats' })
  @ApiCreatedResponse({ description: 'Created event and seat map.', type: EventDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid event details, dimensions, or zone ranges.' })
  create(@Body(CreateEventPipe) body: CreateEventDto): Promise<EventDetailResponseDto> {
    return this.events.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List events' })
  @ApiOkResponse({ description: 'Events ordered by event time.', type: [EventResponseDto] })
  list(): Promise<EventResponseDto[]> {
    return this.events.list();
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get an event and its seat map' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Event and seat map.', type: EventDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid event ID.' })
  @ApiNotFoundResponse({ description: 'Event not found.' })
  detail(@Param('eventId', ParseUUIDPipe) eventId: string): Promise<EventDetailResponseDto> {
    return this.events.detail(eventId);
  }
}
