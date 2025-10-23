import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { createRoute } from '../features/routes.js';
import { PlainNodejsAdapter } from '../adapters/plainNodejs.js';
import http from 'node:http';
import url from 'node:url';

describe('PlainNodejsAdapter', () => {
  let adapter: PlainNodejsAdapter;
  let server: http.Server;
  const port = 3099; // Use a different port to avoid conflicts

  const testRoute = createRoute({
    method: 'GET',
    path: '/test',
    inputSchema: {
      queryParams: z.object({
        message: z.string().optional(),
      }),
    },
    handler: (payload) => {
      return {
        statusCode: 200,
        body: {
          message: payload.input.queryParams?.message || 'Hello from test!',
          timestamp: new Date('2024-01-01T00:00:00.000Z').toISOString(), // Fixed for testing
        },
        headers: {
          'X-Test-Header': 'adapter-test',
        },
      } as const;
    },
  });

  const postRoute = createRoute({
    method: 'POST',
    path: '/data',
    inputSchema: {
      body: z.object({
        name: z.string(),
        value: z.number(),
      }),
    },
    handler: (payload) => {
      return {
        statusCode: 201,
        body: {
          received: payload.input.body,
          processed: true,
        },
      } as const;
    },
  });

  beforeAll(async () => {
    adapter = new PlainNodejsAdapter();
    // We'll create our own test server since adapter no longer has createServer
    server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);

        // Parse request body
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

        const context = { req, res, parsedUrl, body };
        const servedotsRequest = adapter.transformRequest(context);

        const routes = [testRoute, postRoute];
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

        const { default: parseInput } = await import(
          '../features/inputParser.js'
        );
        const input = parseInput(route as any, servedotsRequest);
        const routeOutput = await (route as any).handler({ input });
        const httpResponse = adapter.transformResponse(routeOutput);

        res.writeHead(httpResponse.statusCode, httpResponse.headers);
        res.end(httpResponse.body);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(port, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const makeRequest = (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method: options.method || 'GET',
          headers: options.headers || {},
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              body,
            });
          });
        }
      );

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  };

  it('should handle GET requests with query parameters', async () => {
    const response = await makeRequest('/test?message=CustomMessage');

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-test-header']).toBe('adapter-test');
    expect(response.headers['content-type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      message: 'CustomMessage',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
  });

  it('should handle GET requests without query parameters', async () => {
    const response = await makeRequest('/test');

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-test-header']).toBe('adapter-test');

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      message: 'Hello from test!',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
  });

  it('should handle POST requests with JSON body', async () => {
    const requestBody = {
      name: 'test-item',
      value: 42,
    };

    const response = await makeRequest('/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['content-type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      received: requestBody,
      processed: true,
    });
  });

  it('should return 404 for non-existent routes', async () => {
    const response = await makeRequest('/nonexistent');

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      error: 'Route not found',
      method: 'GET',
      path: '/nonexistent',
    });
  });

  it('should handle server errors gracefully', async () => {
    const errorRoute = createRoute({
      method: 'GET',
      path: '/error',
      inputSchema: {},
      handler: () => {
        throw new Error('Test error');
      },
    });

    // Create a temporary server for this test
    const errorAdapter = new PlainNodejsAdapter();
    const errorServer = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);
        const context = { req, res, parsedUrl, body: null };
        const servedotsRequest = errorAdapter.transformRequest(context);

        const route = [errorRoute].find(
          (r) =>
            r.method === servedotsRequest.method &&
            r.path === servedotsRequest.path
        );

        if (!route) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Route not found' }));
          return;
        }

        const { default: parseInput } = await import(
          '../features/inputParser.js'
        );
        const input = parseInput(route as any, servedotsRequest);
        const routeOutput = await (route as any).handler({ input });
        const httpResponse = errorAdapter.transformResponse(routeOutput);

        res.writeHead(httpResponse.statusCode, httpResponse.headers);
        res.end(httpResponse.body);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      }
    });

    const errorPort = 3098;
    await new Promise<void>((resolve, reject) => {
      errorServer.listen(errorPort, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      const response = await new Promise<{
        statusCode: number;
        headers: http.IncomingHttpHeaders;
        body: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: errorPort,
            path: '/error',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 0,
                headers: res.headers,
                body,
              });
            });
          }
        );

        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers['content-type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Internal server error',
        message: 'Test error',
      });
    } finally {
      await new Promise<void>((resolve) => {
        errorServer.close(() => resolve());
      });
    }
  });

  it('should transform HTTP requests correctly', () => {
    const mockReq = {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
    } as http.IncomingMessage;

    const mockParsedUrl = url.parse(
      '/test?param1=value1&param2=value2a&param2=value2b',
      true
    );

    const context = {
      req: mockReq,
      res: {} as http.ServerResponse,
      parsedUrl: mockParsedUrl,
      body: { test: 'data' },
    };

    const result = adapter.transformRequest(context);

    expect(result).toEqual({
      method: 'GET',
      path: '/test',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      queryParams: {
        param1: 'value1',
        param2: 'value2a', // First value from the URL
      },
      pathParams: {},
      body: { test: 'data' },
      rawRequest: context,
    });
  });
});
