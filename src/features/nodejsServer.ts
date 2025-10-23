import http from 'node:http';
import url from 'node:url';
import type {
  RouteType,
  RouteInputSchemaType,
  RouteResponseType,
} from './routes.js';
import type { OpenApiSpec, OpenApiOptions } from './openApiGenerator.js';
import { generateOpenApiSpec } from './openApiGenerator.js';
import parseInput from './inputParser.js';

// Match route based on method and path
const matchRoute = (
  routes: RouteType<RouteInputSchemaType, RouteResponseType>[],
  method: string,
  path: string
) => {
  return routes.find((route) => {
    return route.method === method && route.path === path;
  });
};

export const createNodejsServer = (
  routes: RouteType<RouteInputSchemaType, RouteResponseType>[],
  port = 3000,
  openApiOptions?: OpenApiOptions & {
    tsConfigPath?: string;
    preGenerate?: boolean;
  }
) => {
  // Cache for the generated OpenAPI spec
  let cachedOpenApiSpec: OpenApiSpec | null = null;
  let isGenerating = false;

  // Function to refresh the OpenAPI spec cache
  const refreshOpenApiCache = async (): Promise<void> => {
    if (!openApiOptions || isGenerating) return;

    try {
      isGenerating = true;
      console.log('🔄 Refreshing OpenAPI spec cache...');
      cachedOpenApiSpec = await generateOpenApiSpec(routes, openApiOptions);
      isGenerating = false;
      console.log('✅ OpenAPI spec cache refreshed');
    } catch (error) {
      isGenerating = false;
      console.error('❌ Failed to refresh OpenAPI spec cache:', error);
      throw error;
    }
  };

  const server = http.createServer(
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);
        const method = req.method || 'GET';
        const path = parsedUrl.pathname || '';

        // Parse request body for POST/PUT/PATCH requests
        let body = null;
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
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

        // Special route for OpenAPI spec with caching
        if (method === 'GET' && path === '/openapi.json' && openApiOptions) {
          try {
            // Return cached spec if available
            if (cachedOpenApiSpec) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(cachedOpenApiSpec, null, 2));
              return;
            }

            // If already generating, wait and retry
            if (isGenerating) {
              // Simple wait and retry mechanism
              const checkCache = () => {
                if (cachedOpenApiSpec) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(cachedOpenApiSpec, null, 2));
                } else if (isGenerating) {
                  setTimeout(checkCache, 100);
                } else {
                  // Generation failed, return error
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(
                    JSON.stringify({
                      error: 'Failed to generate OpenAPI spec',
                      message: 'Spec generation failed',
                    })
                  );
                }
              };
              setTimeout(checkCache, 100);
              return;
            }

            // Generate spec for the first time
            isGenerating = true;
            console.log('🔄 Generating advanced OpenAPI spec (first time)...');

            const openApiSpec = await generateOpenApiSpec(
              routes,
              openApiOptions
            );
            cachedOpenApiSpec = openApiSpec;
            isGenerating = false;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(openApiSpec, null, 2));
            console.log('✅ Advanced OpenAPI spec generated and cached');
            return;
          } catch (error) {
            isGenerating = false;
            console.error(
              '❌ Failed to generate advanced OpenAPI spec:',
              error
            );
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: 'Failed to generate OpenAPI spec',
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              })
            );
            return;
          }
        }

        // Find matching route
        const route = matchRoute(routes, method, path);

        if (!route) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Route not found' }));
          return;
        }

        // Parse and validate input
        const queryParams: Record<string, string> = {};
        if (parsedUrl.query) {
          Object.entries(parsedUrl.query).forEach(([key, value]) => {
            if (typeof value === 'string') {
              queryParams[key] = value;
            } else if (Array.isArray(value)) {
              queryParams[key] = value[0] || '';
            }
          });
        }

        const input = parseInput(route, {
          queryParams,
          pathParams: {}, // TODO: Extract path params
          headers: req.headers as Record<string, string>,
          body,
        });

        // Call handler
        const result = await route.handler({ input });

        // Handle response based on RouteResponseType structure
        if (
          result &&
          typeof result === 'object' &&
          'statusCode' in result &&
          'body' in result
        ) {
          // RouteResponseType format: { statusCode, body, headers? }
          const statusCode = result.statusCode as number;
          const body = result.body;
          const headers = (result.headers as Record<string, string>) || {};

          // Set default content type and merge with custom headers
          const responseHeaders = {
            'Content-Type': 'application/json',
            ...headers,
          };

          res.writeHead(statusCode, responseHeaders);
          // TODO: Other body types than json should be supported also
          res.end(JSON.stringify(body));
        } else {
          // Plain object response - use default 200 status
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }
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

  server.listen(port, async () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log('📋 Available routes:');
    routes.forEach((route) => {
      console.log(`  ${route.method} ${route.path}`);
    });
    if (openApiOptions) {
      console.log(
        '  GET /openapi.json (Advanced OpenAPI spec with type analysis)'
      );

      // Pre-generate OpenAPI spec if requested
      if (openApiOptions.preGenerate && !cachedOpenApiSpec && !isGenerating) {
        console.log('🔄 Pre-generating OpenAPI spec at startup...');
        try {
          isGenerating = true;
          cachedOpenApiSpec = await generateOpenApiSpec(routes, openApiOptions);
          isGenerating = false;
          console.log('✅ OpenAPI spec pre-generated and cached');
        } catch (error) {
          isGenerating = false;
          console.warn('⚠️ Failed to pre-generate OpenAPI spec:', error);
          console.log('📝 Spec will be generated on first request');
        }
      }
    }
  });

  return {
    server,
    refreshOpenApiCache,
  };
};
