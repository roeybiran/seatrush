import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class BestAvailableDto {
  @IsInt()
  @Min(1)
  @Max(4)
  count!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  zoneNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxPriceAgorot?: number;
}
