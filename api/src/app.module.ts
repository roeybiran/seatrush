import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity, EventRowEntity, SeatEntity, ZoneEntity } from './events/entities';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { CreateEvents1794048735619 } from './migrations/1794048735619-create-events';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [EventEntity, ZoneEntity, EventRowEntity, SeatEntity],
      migrations: [CreateEvents1794048735619],
      synchronize: false,
      retryAttempts: 1,
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class AppModule {}
