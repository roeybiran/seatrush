import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Username = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>().headers[
      'x-username'
    ],
);
