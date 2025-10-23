import http from 'node:http';
import url from 'node:url';
import { z } from 'zod';
import { createRoute } from '../../features/routes.js';
import {
  PlainNodejsAdapter,
  type HttpRequestContext,
} from '../../adapters/plainNodejs.js';

// Create some example routes
const helloRoute = createRoute({
  method: 'GET',
  path: '/hello',
  inputSchema: {
    queryParams: z.object({
      name: z.string().optional(),
    }),
  },
  handler: (payload) => {
    const name = payload.input.queryParams?.name || 'World';
    return {
      statusCode: 200,
      body: {
        message: `Hello ${name}!`,
        timestamp: new Date().toISOString(),
      },
      headers: {
        'X-Custom-Header': 'plain-nodejs-adapter',
      },
    } as const;
  },
});

const createUserRoute = createRoute({
  method: 'POST',
  path: '/users',
  inputSchema: {
    body: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
  },
  handler: (payload) => {
    return {
      statusCode: 201,
      body: {
        id: Math.floor(Math.random() * 1000),
        name: payload.input.body.name,
        email: payload.input.body.email,
        created: true,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    } as const;
  },
});

const getUserRoute = createRoute({
  method: 'GET',
  path: '/users/123',
  inputSchema: {},
  handler: () => {
    return {
      statusCode: 200,
      body: {
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
      },
    } as const;
  },
});

// TODO: Remove this later and use built-in serve function?
// Create and start the server
async function startServer() {
  const adapter = new PlainNodejsAdapter();
  const routes = [helloRoute, createUserRoute, getUserRoute];

  const server = http.createServer(
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);

        // Parse request body for POST/PUT/PATCH requests
        let body = null;
        if (
          req.method === 'POST' ||
          req.method === 'PUT' ||
          req.method === 'PATCH'
        ) {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const bodyBuffer = Buffer.concat(chunks);
          const bodyString = bodyBuffer.toString();

          if (req.headers['content-type']?.includes('application/json')) {
            try {
              body = JSON.parse(bodyString);
            } catch {
              body = bodyString;
            }
          } else {
            body = bodyString;
          }
        }

        // Create context for the adapter
        const context: HttpRequestContext = {
          req,
          res,
          parsedUrl,
          body,
        };

        // Transform HTTP request using the adapter
        const servedotsRequest = adapter.transformRequest(context);

        // Find matching route manually (since we want to handle transformation ourselves)
        const route = routes.find(
          (r) =>
            r.method === servedotsRequest.method &&
            r.path === servedotsRequest.path
        );

        if (!route) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Route not found',
              method: servedotsRequest.method,
              path: servedotsRequest.path,
            })
          );
          return;
        }

        // Parse and validate input using servedots input parser
        const { default: parseInput } = await import(
          '../../features/inputParser.js'
        );
        const input = parseInput(route as any, {
          queryParams: servedotsRequest.queryParams,
          pathParams: servedotsRequest.pathParams,
          headers: servedotsRequest.headers,
          body: servedotsRequest.body,
        });

        // Call handler to get raw output
        const routeOutput = await (route as any).handler({ input });

        // Transform response using the adapter
        const httpResponse = adapter.transformResponse(routeOutput);

        // Send HTTP response
        res.writeHead(httpResponse.statusCode, httpResponse.headers);
        res.end(httpResponse.body);
      } catch (error: unknown) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      }
    }
  );

  const port = 3001;
  server.listen(port, () => {
    console.log(`🚀 Plain Node.js Server running on http://localhost:${port}`);
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
      console.log('🛑 Server stopped');
      process.exit(0);
    });
  });

  return server;
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export { startServer, helloRoute, createUserRoute, getUserRoute };
