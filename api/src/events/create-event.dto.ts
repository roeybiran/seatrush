import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsDateString, IsInt, IsObject, IsString, Matches, Max, Min, ValidateNested,
} from 'class-validator';

class CreateZoneDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priceAgorot!: number;

  @IsInt()
  @Min(0)
  startRow!: number;

  @IsInt()
  @Min(0)
  endRow!: number;
}

export class CreateEventDto {
  @IsString()
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;

  @IsString()
  @Matches(/\S/, { message: 'venue must not be blank' })
  venue!: string;

  @IsDateString({ strict: true })
  eventTime!: string;

  @IsDateString({ strict: true })
  dropTime!: string;

  @IsInt()
  @Min(1)
  @Max(702)
  rowCount!: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  seatsPerRow!: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateZoneDto)
  zones!: CreateZoneDto[];
}
