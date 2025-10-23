import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import servedots from '../actual.js';
import { createRoute } from '../features/routes.js';
import { AwsLambdaAdapter } from '../adapters/awsLambda.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

describe('servedots().handler with AWS Lambda adapter', () => {
  const testRoute = createRoute({
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
          timestamp: new Date('2024-01-01T00:00:00.000Z').toISOString(), // Fixed timestamp for testing
          environment: 'test',
        },
        headers: {
          'X-Custom-Header': 'test-value',
        },
      } as const;
    },
  });

  const api = servedots({
    adapter: new AwsLambdaAdapter(),
    routes: [testRoute],
  });

  it('should handle AWS Lambda event and return correct APIGatewayProxyResult', async () => {
    // Mock AWS Lambda event
    const mockEvent: APIGatewayProxyEvent = {
      httpMethod: 'GET',
      path: '/hello',
      pathParameters: null,
      queryStringParameters: {
        name: 'World',
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent',
      },
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      body: null,
      isBase64Encoded: false,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        path: '/hello',
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: 1640995200000,
        resourceId: 'test-resource',
        resourcePath: '/hello',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
      },
      resource: '/hello',
    };

    const result = await api.handler(mockEvent);

    // Verify the result matches AWS Lambda's APIGatewayProxyResult format
    expect(result).toEqual({
      statusCode: 200,
      headers: {
        'X-Custom-Header': 'test-value',
      },
      body: JSON.stringify({
        message: 'Hello World',
        timestamp: '2024-01-01T00:00:00.000Z',
        environment: 'test',
      }),
    });
  });

  it('should handle route with body data', async () => {
    const postRoute = createRoute({
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
            id: 123,
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

    const postApi = servedots({
      adapter: new AwsLambdaAdapter(),
      routes: [postRoute],
    });

    const mockPostEvent: APIGatewayProxyEvent = {
      httpMethod: 'POST',
      path: '/users',
      pathParameters: null,
      queryStringParameters: null,
      headers: {
        'Content-Type': 'application/json',
      },
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
      }),
      isBase64Encoded: false,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        path: '/users',
        stage: 'test',
        requestId: 'test-request-id-2',
        requestTimeEpoch: 1640995200000,
        resourceId: 'test-resource',
        resourcePath: '/users',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
      },
      resource: '/users',
    };

    const result = await postApi.handler(mockPostEvent);

    expect(result).toEqual({
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
        created: true,
      }),
    });
  });

  it('should throw error for non-existent route', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      httpMethod: 'GET',
      path: '/non-existent',
      pathParameters: null,
      queryStringParameters: null,
      headers: {},
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      body: null,
      isBase64Encoded: false,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        path: '/non-existent',
        stage: 'test',
        requestId: 'test-request-id-3',
        requestTimeEpoch: 1640995200000,
        resourceId: 'test-resource',
        resourcePath: '/non-existent',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
      },
      resource: '/non-existent',
    };

    await expect(api.handler(mockEvent)).rejects.toThrow(
      'No route found for GET /non-existent'
    );
  });

  it('should handle async handlers correctly', async () => {
    const asyncRoute = createRoute({
      method: 'GET',
      path: '/async',
      inputSchema: {
        queryParams: z.object({
          delay: z.string().optional(),
        }),
      },
      handler: async (payload) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        return {
          statusCode: 200,
          body: {
            message: 'Async operation completed',
            delay: payload.input.queryParams?.delay || '0',
            async: true,
          },
        } as const;
      },
    });

    const asyncApi = servedots({
      adapter: new AwsLambdaAdapter(),
      routes: [asyncRoute],
    });

    const mockAsyncEvent: APIGatewayProxyEvent = {
      httpMethod: 'GET',
      path: '/async',
      pathParameters: null,
      queryStringParameters: {
        delay: '100',
      },
      headers: {},
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      body: null,
      isBase64Encoded: false,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        path: '/async',
        stage: 'test',
        requestId: 'test-request-id-4',
        requestTimeEpoch: 1640995200000,
        resourceId: 'test-resource',
        resourcePath: '/async',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
      },
      resource: '/async',
    };

    const result = await asyncApi.handler(mockAsyncEvent);

    expect(result).toEqual({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({
        message: 'Async operation completed',
        delay: '100',
        async: true,
      }),
    });
  });
});
