import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Adapter from './_adapterTemplate.js';

export class AwsLambdaAdapter extends Adapter {
  transformRequest(
    event: APIGatewayProxyEvent
  ): ReturnType<Adapter['transformRequest']> {
    // Filter out undefined values to match Record<string, string> type
    const headers: Record<string, string> = {};
    if (event.headers) {
      Object.entries(event.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          headers[key] = value;
        }
      });
    }

    const queryParams: Record<string, string> = {};
    if (event.queryStringParameters) {
      Object.entries(event.queryStringParameters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = value;
        }
      });
    }

    const pathParams: Record<string, string> = {};
    if (event.pathParameters) {
      Object.entries(event.pathParameters).forEach(([key, value]) => {
        if (value !== undefined) {
          pathParams[key] = value;
        }
      });
    }

    return {
      method: event.httpMethod,
      path: event.path,

      headers,
      queryParams,
      pathParams,
      body: event.body,

      rawRequest: event,
    };
  }

  transformResponse(
    servedotsResponse: Parameters<Adapter['transformResponse']>[0]
  ): APIGatewayProxyResult {
    return {
      statusCode: servedotsResponse.statusCode,
      headers: servedotsResponse.headers || {},
      body:
        typeof servedotsResponse.body === 'string'
          ? servedotsResponse.body
          : JSON.stringify(servedotsResponse.body),
    };
  }
}
