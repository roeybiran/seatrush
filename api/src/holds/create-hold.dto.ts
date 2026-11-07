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
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  seatNumber!: number;
}

export class CreateHoldDto {
  @ApiProperty({
    type: [SeatCoordinateDto],
    minItems: 1,
    maxItems: 4,
    description: 'Distinct zero-based seat coordinates.',
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
