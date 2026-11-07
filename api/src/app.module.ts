import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DatabaseModule } from './db/database.module';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { HoldsController } from './holds/holds.controller';
import { HoldsService } from './holds/holds.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController, HoldsController],
  providers: [
    EventsService,
    HoldsService,
    { provide: APP_PIPE, useFactory: () => new ValidationPipe({ transform: true }) },
  ],
})
export class AppModule {}
