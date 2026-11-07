import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateHoldDto } from './create-hold.dto';
import { HoldsService } from './holds.service';
import { UsernamePipe } from './username.pipe';
import { Username } from './username.decorator';

@Controller('events/:eventId/holds')
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Username(UsernamePipe) username: string,
    @Body() body: CreateHoldDto,
  ) {
    return this.holds.create(eventId, username, body);
  }

  @Delete(':holdId')
  release(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @Username(UsernamePipe) username: string,
  ) {
    return this.holds.release(eventId, holdId, username);
  }
}
