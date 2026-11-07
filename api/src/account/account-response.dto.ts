import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from '../holds/hold-response.dto';

class OrderEventResponseDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  venue!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  eventTime!: Date;
}

export class AccountOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ type: OrderEventResponseDto })
  event!: OrderEventResponseDto;
}
