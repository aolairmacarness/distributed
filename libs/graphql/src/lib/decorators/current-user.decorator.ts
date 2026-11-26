import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Returns the user that GqlAuthGuard attached to the request
 * (the gRPC `authenticate` response: `{ id, email }`).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest().user;
    }
    return GqlExecutionContext.create(context).getContext().req.user;
  },
);
