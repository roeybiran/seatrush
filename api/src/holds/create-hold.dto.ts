import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsObject, Min, ValidateNested } from 'class-validator';

class SeatCoordinateDto {
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @IsInt()
  @Min(0)
  seatNumber!: number;
}

export class CreateHoldDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique((seat: SeatCoordinateDto | null) => `${seat?.rowIndex}:${seat?.seatNumber}`)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SeatCoordinateDto)
  seats!: SeatCoordinateDto[];
}
