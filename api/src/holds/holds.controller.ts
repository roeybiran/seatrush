import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { HoldResponseDto, OrderResponseDto, ReleaseHoldResponseDto } from './hold-response.dto';
import { BestAvailableDto } from './best-available.dto';
import { CreateHoldDto } from './create-hold.dto';
import { HoldsService } from './holds.service';
import { UsernamePipe } from './username.pipe';
import { Username } from './username.decorator';

@ApiTags('Holds and checkout')
@ApiHeader({ name: 'X-Username', required: true, description: 'Fan username; trimmed and case-sensitive.' })
@ApiParam({ name: 'eventId', format: 'uuid' })
@Controller('events/:eventId/holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  @ApiOperation({ summary: 'Hold selected seats' })
  @ApiCreatedResponse({ description: 'Seats held.', type: HoldResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid username, event ID, or seat coordinates.' })
  @ApiNotFoundResponse({ description: 'Event not found.' })
  @ApiConflictResponse({ description: 'Drop not open, seats unavailable, or fan limit exceeded. Codes: DROP_NOT_OPEN, SEATS_UNAVAILABLE, SEAT_LIMIT.' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Username(UsernamePipe) username: string,
    @Body() body: CreateHoldDto,
  ): Promise<HoldResponseDto> {
    return this.holds.create(eventId, username, body);
  }

  @Post('best-available')
  @ApiOperation({ summary: 'Hold the best available consecutive seats' })
  @ApiCreatedResponse({ description: 'Seats held.', type: HoldResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid username, event ID, or search parameters.' })
  @ApiNotFoundResponse({ description: 'Event not found.' })
  @ApiConflictResponse({ description: 'Drop not open, no matching block, or fan limit exceeded. Codes: DROP_NOT_OPEN, NO_SEATS_AVAILABLE, SEAT_LIMIT.' })
  bestAvailable(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Username(UsernamePipe) username: string,
    @Body() body: BestAvailableDto,
  ): Promise<HoldResponseDto> {
    return this.holds.bestAvailable(eventId, username, body);
  }

  @Post(':holdId/checkout')
  @ApiOperation({ summary: 'Checkout a hold or retrieve its existing order' })
  @ApiParam({ name: 'holdId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Order created or returned from an earlier checkout.', type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid username, event ID, or hold ID.' })
  @ApiForbiddenResponse({ description: 'The hold belongs to another fan.' })
  @ApiNotFoundResponse({ description: 'Event or hold not found.' })
  @ApiConflictResponse({ description: 'Hold is expired or has no seats. Code: HOLD_INACTIVE.' })
  checkout(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @Username(UsernamePipe) username: string,
  ): Promise<OrderResponseDto> {
    return this.holds.checkout(eventId, holdId, username);
  }

  @Delete(':holdId')
  @ApiOperation({ summary: 'Release an active hold' })
  @ApiParam({ name: 'holdId', format: 'uuid' })
  @ApiOkResponse({ description: 'Hold released.', type: ReleaseHoldResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid username, event ID, or hold ID.' })
  @ApiForbiddenResponse({ description: 'The hold belongs to another fan.' })
  @ApiNotFoundResponse({ description: 'Event or hold not found.' })
  @ApiConflictResponse({ description: 'Hold is expired or checked out. Code: HOLD_INACTIVE.' })
  release(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @Username(UsernamePipe) username: string,
  ): Promise<ReleaseHoldResponseDto> {
    return this.holds.release(eventId, holdId, username);
  }
}
