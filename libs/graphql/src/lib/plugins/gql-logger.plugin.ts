import {
  ApolloServerPlugin,
  BaseContext,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';

export class GqlLoggingPlugin implements ApolloServerPlugin {
  private readonly logger = new Logger(GqlLoggingPlugin.name);

  async requestDidStart(
    requestContext: GraphQLRequestContext<BaseContext>,
  ): Promise<void | GraphQLRequestListener<BaseContext>> {
    const { request } = requestContext;
    const start = Date.now();
    const requestId = uuidv4();

    // Headers (session cookie) and variables (passwords, payloads) are
    // deliberately not logged.
    this.logger.log({
      requestId,
      operationName: request.operationName,
      query: request.query,
    });

    return {
      willSendResponse: async (responseContext) => {
        const duration = Date.now() - start;

        this.logger.log({
          requestId,
          operationName: request.operationName,
          statusCode: responseContext.response?.http?.status || 200,
          duration: `${duration}ms`,
        });
      },
    };
  }
}
