import type {
  RouteType,
  RouteInputSchemaType,
  RouteResponseType,
} from './features/routes.js';
import { createNodejsServer } from './features/nodejsServer.js';
import { generateOpenApiSpec } from './features/openApiGenerator.js';
import Adapter from './adapters/_adapterTemplate.js';
import parseInput from './features/inputParser.js';

interface ServedotsConfig {
  routes: RouteType<RouteInputSchemaType, RouteResponseType>[];

  /**
   * Adapter instance to use for transforming requests and responses
   * You can use own of the built-in adapters or create your own by extending the Adapter class
   */
  adapter: InstanceType<typeof Adapter>;

  // TODO: Generally I would like almost everything to be heavily customizable, so that this package is easy to maintain

  /** OpenAPI configuration */
  openApi?: {
    title?: string;
    version?: string;
    description?: string;
    /** Pre-generate OpenAPI spec at server startup for better performance */
    preGenerate?: boolean;
  };

  /**
   * Disable routing functionality (useful for single endpoint lambdas)
   */
  noRouting?: boolean;
}

/**
 * TODO: Better jsdocs to be added
 * @returns
 */
const servedots = (config: ServedotsConfig) => {
  const routes = config.routes;

  return {
    serve: (port = 3000) => {
      // Pass OpenAPI options to server for dynamic advanced spec generation
      const { server, refreshOpenApiCache } = createNodejsServer(
        routes,
        port,
        config.openApi
      );

      // Return server with additional methods
      return Object.assign(server, {
        refreshOpenApiCache,
      });
    },

    handler: async (request: unknown) => {
      // Adapter
      const servedotsRequest = config.adapter.transformRequest(request);

      // Router
      const route = config.noRouting
        ? config.routes[0]
        : routes.find(
            (r) =>
              // TODO: Improve path matching (path params etc.)
              r.method === servedotsRequest.method &&
              r.path === servedotsRequest.path
          );
      if (!route) {
        throw new Error(
          `No route found for ${servedotsRequest.method} ${servedotsRequest.path}`
        );
      }

      // Input parser
      const input = parseInput(route, servedotsRequest);

      // Actual handler function
      const output = await route.handler({ input });

      // Response transformer
      return config.adapter.transformResponse(output);
    },

    generateOpenApiSpec: async (options?: {
      tsConfigPath?: string;
      sourceFilePath?: string;
    }) => {
      // Advanced TypeScript type analysis version
      return generateOpenApiSpec(routes, { ...config.openApi, ...options });
    },
  };
};

export default servedots;
