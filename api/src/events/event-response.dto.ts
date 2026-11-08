import { ApiProperty } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  venue!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  eventTime!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  dropTime!: Date;

  @ApiProperty({ type: 'integer' })
  rowCount!: number;

  @ApiProperty({ type: 'integer' })
  seatsPerRow!: number;
}

class ZoneResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  number!: number;

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Price in agorot.' })
  priceAgorot!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  startRow!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  endRow!: number;
}

class MapSeatResponseDto {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Numbered from 1.' })
  seatNumber!: number;

  @ApiProperty({ enum: ['available', 'held', 'sold'] })
  status!: 'available' | 'held' | 'sold';
}

class RowResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  rowIndex!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  zoneNumber!: number;

  @ApiProperty({ type: [MapSeatResponseDto] })
  seats!: MapSeatResponseDto[];
}

export class EventDetailResponseDto extends EventResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  serverTime!: Date;

  @ApiProperty({ type: [ZoneResponseDto] })
  zones!: ZoneResponseDto[];

  @ApiProperty({ type: [RowResponseDto] })
  rows!: RowResponseDto[];
}
