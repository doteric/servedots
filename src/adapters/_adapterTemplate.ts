import type {
  RouteInputSchemaType,
  RouteResponseType,
  RouteType,
} from '../features/routes.js';

interface ServedotsRequest {
  method: string;
  path: string;

  headers: Record<string, string>;
  queryParams: Record<string, string>;
  pathParams: Record<string, string>;
  body: unknown;

  rawRequest: unknown;
}

// This is an adapter template
abstract class Adapter {
  abstract transformRequest(request: unknown): ServedotsRequest;

  abstract transformResponse(
    servedotsResponse: Awaited<
      ReturnType<RouteType<RouteInputSchemaType, RouteResponseType>['handler']>
    >
  ): unknown;
}

export default Adapter;
