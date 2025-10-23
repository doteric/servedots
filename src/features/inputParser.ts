import type {
  RouteInputSchemaType,
  RouteResponseType,
  RouteType,
} from './routes.js';

const parseInput = <
  TInputSchema extends RouteInputSchemaType,
  TResponse extends RouteResponseType
>(
  route: RouteType<TInputSchema, TResponse>,
  request: {
    queryParams?: Record<string, string>;
    pathParams?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
  }
) => {
  // TODO: Better input parsing + erroring on invalid input

  return {
    queryParams: route.inputSchema.queryParams
      ? route.inputSchema.queryParams.parse(request.queryParams || {})
      : undefined,

    pathParams: route.inputSchema.pathParams
      ? route.inputSchema.pathParams.parse(request.pathParams || {})
      : undefined,

    headers: route.inputSchema.headers
      ? route.inputSchema.headers.parse(request.headers || {})
      : undefined,

    body: route.inputSchema.body
      ? route.inputSchema.body.parse(
          typeof request.body === 'string'
            ? JSON.parse(request.body)
            : request.body
        )
      : undefined,
  };
};

export default parseInput;
