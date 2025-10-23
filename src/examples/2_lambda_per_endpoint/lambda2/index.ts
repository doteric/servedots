import { z } from 'zod';
import { createRoute } from '../../../features/routes.js';
import servedots, { AwsLambdaAdapter } from '../../../index.js';

export const route = createRoute({
  method: 'POST',
  path: '/second_lambda',
  inputSchema: {
    body: z.object({
      name: z.string(),
    }),
  },
  handler: (payload) => {
    if (payload.input.body.name === 'not_allowed') {
      return {
        statusCode: 403,
        body: {
          message: 'Forbidden name',
        },
      } as const;
    }

    return {
      statusCode: 200,
      body: {
        message: `Hello ${payload.input.body.name}!`,
        timestamp: new Date(),
      },
    } as const;
  },
});

// The goal here is to export the route, but also use it as a handler, so that each lambda can be separated, BUT we're still able to easily locally test our implementation

export const handler = () =>
  servedots({
    adapter: new AwsLambdaAdapter(),
    routes: [route],
    noRouting: true,
  }).handler;
