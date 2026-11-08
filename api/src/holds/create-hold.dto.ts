import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';

class SeatCoordinateDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Zero-based row index: 0 is row A, nearest the stage.',
  })
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Seat number from 1, left to right (B7 has seatNumber 7).',
  })
  @IsInt()
  @Min(1)
  seatNumber!: number;
}

export class CreateHoldDto {
  @ApiProperty({
    type: [SeatCoordinateDto],
    minItems: 1,
    maxItems: 4,
    description: 'Distinct seats, e.g. B7 is { rowIndex: 1, seatNumber: 7 }.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique(
    (seat: SeatCoordinateDto | null) => `${seat?.rowIndex}:${seat?.seatNumber}`,
  )
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SeatCoordinateDto)
  seats!: SeatCoordinateDto[];
}
