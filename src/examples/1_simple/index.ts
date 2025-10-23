import { z } from 'zod';
import servedots, { createRoute, PlainNodejsAdapter } from '../../index.js';

const api = servedots({
  adapter: new PlainNodejsAdapter(),
  openApi: {
    title: 'Simple Servedots API',
    version: '1.0.0',
    description:
      'A simple example demonstrating Servedots with OpenAPI generation',
    // Pre-generate OpenAPI spec at startup for better performance
    preGenerate: true,
  },
  routes: [
    createRoute({
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
    }),
    createRoute({
      method: 'POST',
      path: '/world',
      inputSchema: {
        body: z.object({
          name: z.string(),
          otherBodyParam: z.string().optional(),
        }),
      },
      handler: async (payload) => {
        // TODO: In some cases I want to continue some processing after returning, but I guess that can simply be done via some async function triggered before returning without an await
        return {
          statusCode: 200,
          body: {
            message: `Hello ${payload.input.body.name} (${
              payload.input.body.otherBodyParam || 'Not defined'
            })`,
            someDifferentField: false,
            example: 12345,
          },
        } as const;
      },
    }),
  ],
});

// Start the server
console.info('\n🎯 API created successfully!');
const server = api.serve(3000);
console.info('\n⏹️  Press Ctrl+C to stop the server');
