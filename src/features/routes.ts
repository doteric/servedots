import { z, type ZodSchema } from 'zod';

export interface RouteInputSchemaType {
  queryParams?: ZodSchema;
  pathParams?: ZodSchema;
  headers?: ZodSchema;
  body?: ZodSchema;
}

export type InferZodSchema<T> = T extends ZodSchema ? z.infer<T> : undefined;

export interface RouteResponseType {
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface RouteType<
  TInputSchema extends RouteInputSchemaType,
  TResponse extends RouteResponseType
> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  inputSchema: TInputSchema;
  handler: (payload: {
    input: {
      queryParams: InferZodSchema<TInputSchema['queryParams']>;
      pathParams: InferZodSchema<TInputSchema['pathParams']>;
      headers: InferZodSchema<TInputSchema['headers']>;
      body: InferZodSchema<TInputSchema['body']>;
    };
  }) => Promise<TResponse> | TResponse;
}

export const createRoute = <
  TInputSchema extends RouteInputSchemaType,
  TResponse extends RouteResponseType
>(
  route: RouteType<TInputSchema, TResponse>
): RouteType<TInputSchema, TResponse> => {
  return route;
};
