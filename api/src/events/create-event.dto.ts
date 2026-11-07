import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateZoneDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 2147483647,
    description: 'Price in agorot.',
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priceAgorot!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Inclusive zero-based first row.',
  })
  @IsInt()
  @Min(0)
  startRow!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Inclusive zero-based last row.',
  })
  @IsInt()
  @Min(0)
  endRow!: number;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Opening Night' })
  @IsString()
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;

  @ApiProperty({ example: 'Main Hall' })
  @IsString()
  @Matches(/\S/, { message: 'venue must not be blank' })
  venue!: string;

  @ApiProperty({ format: 'date-time', example: '2099-07-01T20:00:00Z' })
  @IsDateString({ strict: true })
  eventTime!: string;

  @ApiProperty({ format: 'date-time', example: '2099-06-01T10:00:00Z' })
  @IsDateString({ strict: true })
  dropTime!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 702 })
  @IsInt()
  @Min(1)
  @Max(702)
  rowCount!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  seatsPerRow!: number;

  @ApiProperty({
    type: [CreateZoneDto],
    minItems: 1,
    description:
      'Ranges must cover each row exactly once. Zone numbers follow array order.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateZoneDto)
  zones!: CreateZoneDto[];
}
