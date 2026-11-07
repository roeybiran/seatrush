import { Controller, Get } from '@nestjs/common';
import { Username } from '../holds/username.decorator';
import { UsernamePipe } from '../holds/username.pipe';
import { AccountService } from './account.service';

@Controller('my-account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  orders(@Username(UsernamePipe) username: string) {
    return this.account.orders(username);
  }
}
