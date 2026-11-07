import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DatabaseModule } from './db/database.module';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    { provide: APP_PIPE, useFactory: () => new ValidationPipe({ transform: true }) },
  ],
})
export class AppModule {}
