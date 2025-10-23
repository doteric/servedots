import { z } from 'zod';
import { createRoute } from '../../../features/routes.js';
import servedots, { AwsLambdaAdapter } from '../../../index.js';

export const route = createRoute({
  method: 'GET',
  path: '/hello',

  inputSchema: {
    queryParams: z.object({
      name: z.string(),
    }),
  },
  handler: (payload) => {
    return {
      statusCode: 200,
      body: {
        message: `Hello ${payload.input.queryParams.name}`,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    } as const;
  },
});

// Now the goal here is to export the route, but also use it as a handler, so that each lambda can be separated, BUT we're still able to easily locally test our implementation

// TODO: Add suport for passing also the context object

export const handler = () =>
  servedots({
    adapter: new AwsLambdaAdapter(),
    routes: [route],
    noRouting: true,
  }).handler;
