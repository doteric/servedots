import http from 'node:http';
import url from 'node:url';
import Adapter from './_adapterTemplate.js';

interface HttpRequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  parsedUrl: url.UrlWithParsedQuery;
  body: unknown;
}

interface PlainNodejsResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class PlainNodejsAdapter extends Adapter {
  transformRequest(
    context: HttpRequestContext
  ): ReturnType<Adapter['transformRequest']> {
    const { req, parsedUrl, body } = context;
    const method = req.method || 'GET';
    const path = parsedUrl.pathname || '';

    // Parse query parameters
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

    // Filter headers to ensure they are strings
    const headers: Record<string, string> = {};
    if (req.headers) {
      Object.entries(req.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers[key] = value;
        } else if (Array.isArray(value)) {
          headers[key] = value[0] || '';
        }
      });
    }

    return {
      method,
      path,
      headers,
      queryParams,
      pathParams: {}, // TODO: Extract path params for dynamic routes
      body,
      rawRequest: context,
    };
  }

  transformResponse(
    servedotsResponse: Parameters<Adapter['transformResponse']>[0]
  ): PlainNodejsResponse {
    // Handle response based on RouteResponseType structure
    if (
      servedotsResponse &&
      typeof servedotsResponse === 'object' &&
      'statusCode' in servedotsResponse &&
      'body' in servedotsResponse
    ) {
      // RouteResponseType format: { statusCode, body, headers? }
      const statusCode = servedotsResponse.statusCode as number;
      const body = servedotsResponse.body;
      const headers =
        (servedotsResponse.headers as Record<string, string>) || {};

      // Set default content type and merge with custom headers
      const responseHeaders = {
        'Content-Type': 'application/json',
        ...headers,
      };

      return {
        statusCode,
        headers: responseHeaders,
        body: JSON.stringify(body),
      };
    } else {
      // Plain object response - use default 200 status
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(servedotsResponse),
      };
    }
  }
}

export type { HttpRequestContext, PlainNodejsResponse };
