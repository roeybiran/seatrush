import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity, SeatEntity } from './entities';
import { CreateSeatRushSchema1794048735619 } from './migrations/001-create-seatrush-schema';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [EventEntity, SeatEntity],
      migrations: [CreateSeatRushSchema1794048735619],
      synchronize: false,
      retryAttempts: 1,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
