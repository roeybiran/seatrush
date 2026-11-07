import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class UsernamePipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Provide a username in the X-Username header.');
    }
    return value.trim();
  }
}
