import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class BestAvailableDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  count!: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    nullable: true,
    description: 'Zero-based zone number.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  zoneNumber?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    nullable: true,
    description: 'Maximum price per seat in agorot.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPriceAgorot?: number;
}
