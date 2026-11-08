import { ApiProperty } from '@nestjs/swagger';

export class PricedSeatResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0, description: '0 is row A.' })
  rowIndex!: number;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Numbered from 1.' })
  seatNumber!: number;

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Price in agorot.' })
  priceAgorot!: number;
}

export class HoldResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: [PricedSeatResponseDto] })
  seats!: PricedSeatResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  serverTime!: Date;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  holdId!: string;

  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: [PricedSeatResponseDto] })
  seats!: PricedSeatResponseDto[];

  @ApiProperty({ type: 'integer', minimum: 0, description: 'Total in agorot.' })
  totalAgorot!: number;
}

export class ReleaseHoldResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['released'] })
  status!: string;
}
