import { Controller, Get } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccountOrderResponseDto } from './account-response.dto';
import { Username } from '../holds/username.decorator';
import { UsernamePipe } from '../holds/username.pipe';
import { AccountService } from './account.service';

@ApiTags('Account')
@ApiHeader({
  name: 'X-Username',
  required: true,
  description: 'Fan username; trimmed and case-sensitive.',
})
@Controller('my-tickets')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'List the fan’s orders and tickets' })
  @ApiOkResponse({
    description: 'Orders ordered by event time.',
    type: [AccountOrderResponseDto],
  })
  @ApiBadRequestResponse({ description: 'Missing or blank username.' })
  orders(
    @Username(UsernamePipe) username: string,
  ): Promise<AccountOrderResponseDto[]> {
    return this.account.orders(username);
  }
}
