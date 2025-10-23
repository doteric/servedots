/**
 * Below is actually mostly vibe-coded and should be re-visited with an actual proper implementation
 * The code is awful due to being vibe-coded, but it hmmm, let's say it works...
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RouteType, RouteInputSchemaType } from './routes.js';
import type { ZodSchema } from 'zod';
import * as path from 'node:path';

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
  };
}

interface OpenApiOperation {
  summary: string;
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
}

interface OpenApiRequestBody {
  required: boolean;
  content: {
    'application/json': {
      schema: Record<string, unknown>;
    };
  };
}

interface OpenApiResponse {
  description: string;
  content: {
    'application/json': {
      schema: Record<string, unknown>;
    };
  };
}

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
}

// Convert HTTP method to lowercase for OpenAPI spec
const normalizeMethod = (method: string): string => method.toLowerCase();

// Convert Zod schema to JSON schema for OpenAPI
const convertZodToJsonSchema = (zodSchema: ZodSchema, name?: string) => {
  try {
    return zodToJsonSchema(zodSchema, name);
  } catch (error) {
    console.warn(`Failed to convert Zod schema to JSON schema:`, error);
    return { type: 'object' };
  }
};

// TypeScript type to JSON schema converter using ts-morph and ts-json-schema-generator
interface TypeAnalysisOptions {
  tsConfigPath?: string;
}

// Helper to check if a type is clearly a Date object based on its properties
const isClearlyDateObject = (schema: Record<string, unknown>): boolean => {
  const dateMethodKeys = [
    'toISOString',
    'toJSON',
    'getTime',
    'toString',
    'toUTCString',
    'toDateString',
    'toTimeString',
  ];

  if (
    schema &&
    typeof schema === 'object' &&
    schema.type === 'object' &&
    schema.properties &&
    typeof schema.properties === 'object'
  ) {
    const keys = Object.keys(schema.properties);
    // If it has many common Date methods, assume it's a Date
    const score = dateMethodKeys.filter((key) => keys.includes(key)).length;
    return score >= 3;
  }

  return false;
};

// Generate JSON schema from a runtime value
const generateSchemaFromValue = (value: unknown): Record<string, unknown> => {
  if (value === null) {
    return { type: 'null' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: {} };
    }
    return {
      type: 'array',
      items: generateSchemaFromValue(value[0]),
    };
  }

  const type = typeof value;

  switch (type) {
    case 'string':
      // Check if it looks like a date
      if (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
      ) {
        return { type: 'string', format: 'date-time' };
      }
      return { type: 'string' };

    case 'number':
      return { type: 'number' };

    case 'boolean':
      return { type: 'boolean' };

    case 'object':
      if (value && typeof value === 'object') {
        // Handle Date objects specifically
        if (value instanceof Date) {
          return { type: 'string', format: 'date-time' };
        }

        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, val] of Object.entries(value)) {
          properties[key] = generateSchemaFromValue(val);
          required.push(key);
        }

        return {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        };
      }
      return { type: 'object' };

    default:
      return { type: 'object' };
  }
};

// Simple date-time transformation for runtime schemas
const replaceDateWithDateTime = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(replaceDateWithDateTime);
  }

  if (schema && typeof schema === 'object') {
    const objectSchema = schema as Record<string, unknown>;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(objectSchema)) {
      result[key] = replaceDateWithDateTime(value);
    }
    return result;
  }

  return schema;
};

// Convert TypeScript type to JSON schema
const convertTypeScriptTypeToJsonSchema = (
  type: any
): Record<string, unknown> => {
  try {
    const typeText = type.getText();
    console.log(`🔍 Converting TS type: ${typeText}`);

    // Handle literal types
    if (type.isStringLiteral()) {
      return { type: 'string', const: type.getLiteralValue() };
    }
    if (type.isNumberLiteral()) {
      return { type: 'number', const: type.getLiteralValue() };
    }
    if (type.isBooleanLiteral()) {
      return { type: 'boolean', const: type.getLiteralValue() };
    }

    // Handle primitive types
    if (type.isString()) {
      return { type: 'string' };
    }
    if (type.isNumber()) {
      return { type: 'number' };
    }
    if (type.isBoolean()) {
      return { type: 'boolean' };
    }

    // Handle Date objects
    if (typeText.includes('Date') || typeText === 'Date') {
      return { type: 'string', format: 'date-time' };
    }

    // Handle arrays
    if (type.isArray()) {
      const elementType = type.getArrayElementType();
      return {
        type: 'array',
        items: convertTypeScriptTypeToJsonSchema(elementType),
      };
    }

    // Handle objects
    if (type.isObject()) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      const props = type.getProperties();
      for (const prop of props) {
        const propName = prop.getName();
        // Get property type from the type checker
        const propType = prop.getValueDeclaration()?.getType?.() || type;

        properties[propName] = convertTypeScriptTypeToJsonSchema(propType);
        required.push(propName);
      }

      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };
    }

    // Fallback for unknown types
    console.warn(`⚠️ Unknown type: ${typeText}, using object fallback`);
    return { type: 'object' };
  } catch (error) {
    console.warn(`⚠️ Error converting type:`, error);
    return { type: 'object' };
  }
};

// Enhanced response type analysis using TypeScript static analysis
export const analyzeHandlerReturnType = async (
  route: RouteType<RouteInputSchemaType, any>,
  options: TypeAnalysisOptions = {}
): Promise<Record<string, unknown>> => {
  console.log(
    `🔍 Analyzing handler return type for ${route.method} ${route.path}`
  );

  try {
    // Import ts-morph for TypeScript analysis
    const { Project, Node, SyntaxKind } = await import('ts-morph');

    // Create unique temp directory and files for this specific route

    const routeId = `${route.method.toLowerCase()}_${route.path.replace(
      /[^a-zA-Z0-9]/g,
      '_'
    )}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`📝 Analyzing handler for ${route.method} ${route.path}`);

    // Since runtime functions lose TypeScript type information,
    // we'll use a hybrid approach: run the handler with different inputs
    // to discover different response shapes, then infer the types
    console.log(
      `🧪 Using intelligent runtime analysis to discover response types...`
    );
    console.log(`📋 Route details: ${route.method} ${route.path}`);
    console.log(`📝 Input schema:`, JSON.stringify(route.inputSchema, null, 2));

    const discoveredResponses = new Map<number, unknown>();

    // Test with different inputs that might trigger different code paths
    const testInputs = [
      // Normal case
      { name: 'test' },
      // Error cases - common patterns that might trigger different responses
      { name: 'not_allowed' },
      { name: 'forbidden' },
      { name: 'admin' },
      { name: 'error' },
      { name: '' },
      { name: 'null' },
      { name: 'undefined' },
    ];

    for (const testBody of testInputs) {
      try {
        const mockInput = {
          input: {
            queryParams: route.inputSchema.queryParams
              ? { name: testBody.name }
              : undefined,
            pathParams: route.inputSchema.pathParams ? {} : undefined,
            headers: route.inputSchema.headers ? {} : undefined,
            body: route.inputSchema.body ? testBody : undefined,
          },
        };

        console.log(`🔍 Testing with input: ${JSON.stringify(testBody)}`);
        let result = route.handler(mockInput as any);

        // Handle async handlers
        if (result && typeof result === 'object' && 'then' in result) {
          result = await result;
        }

        console.log(`📊 Result:`, JSON.stringify(result, null, 2));

        // Extract status code and store unique responses
        let statusCode = 200;
        if (result && typeof result === 'object' && 'statusCode' in result) {
          statusCode = result.statusCode as number;
          console.log(`🔢 Extracted status code: ${statusCode}`);
        } else {
          console.log(`⚠️ No statusCode found in result, defaulting to 200`);
        }

        // Store this response if we haven't seen this status code yet
        if (!discoveredResponses.has(statusCode)) {
          discoveredResponses.set(statusCode, result);
          console.log(
            `✅ Discovered new response type for status ${statusCode}`
          );
          console.log(`🏷️ Response details:`, JSON.stringify(result, null, 2));
        } else {
          console.log(
            `ℹ️ Already have response for status ${statusCode}, skipping`
          );
        }
      } catch (testError) {
        console.warn(`⚠️ Test input failed:`, testError);
      }
    }

    console.log(
      `🎭 Discovered ${discoveredResponses.size} different response types`
    );

    if (discoveredResponses.size > 1) {
      // Multiple response types found - create union members
      const unionMembers = Array.from(discoveredResponses.entries()).map(
        ([statusCode, response]) => {
          console.log(
            `🔍 Processing discovered response for status ${statusCode}:`,
            JSON.stringify(response, null, 2)
          );

          // Extract the body from the response if it has the RouteResponseType structure
          let bodyToSchema = response;
          if (response && typeof response === 'object' && 'body' in response) {
            bodyToSchema = (response as any).body;
            console.log(
              `📦 Extracted body for schema generation:`,
              JSON.stringify(bodyToSchema, null, 2)
            );
          }

          const schema = generateSchemaFromValue(bodyToSchema);
          console.log(
            `📊 Generated schema for status ${statusCode}:`,
            JSON.stringify(schema, null, 2)
          );
          return { statusCode, schema };
        }
      );

      return {
        type: 'object',
        description: 'Multiple response types discovered',
        _unionMembers: unionMembers,
      };
    } else if (discoveredResponses.size === 1) {
      // Single response type
      const [statusCode, response] = Array.from(
        discoveredResponses.entries()
      )[0];

      console.log(
        `🔍 Processing single discovered response for status ${statusCode}:`,
        JSON.stringify(response, null, 2)
      );

      // Extract the body from the response if it has the RouteResponseType structure
      let bodyToSchema = response;
      if (response && typeof response === 'object' && 'body' in response) {
        bodyToSchema = (response as any).body;
        console.log(
          `📦 Extracted body for schema generation:`,
          JSON.stringify(bodyToSchema, null, 2)
        );
      }

      const schema = generateSchemaFromValue(bodyToSchema);
      console.log(
        `📊 Generated schema for single response:`,
        JSON.stringify(schema, null, 2)
      );

      return {
        type: 'object',
        description: 'Single response type',
        _singleResponse: { statusCode, schema },
      };
    } else {
      throw new Error('No valid responses discovered');
    }
  } catch (tsError) {
    console.warn(`⚠️ TypeScript analysis failed:`, tsError);

    // Fallback: try simple runtime analysis as last resort
    try {
      console.log(`🔄 Falling back to runtime analysis...`);
      const mockInput = {
        input: {
          queryParams: route.inputSchema.queryParams ? {} : undefined,
          pathParams: route.inputSchema.pathParams ? {} : undefined,
          headers: route.inputSchema.headers ? {} : undefined,
          body: route.inputSchema.body ? {} : undefined,
        },
      };

      const result = route.handler(mockInput as any);
      let actualResult = result;

      if (result && typeof result === 'object' && 'then' in result) {
        actualResult = await result;
      }

      return generateSchemaFromValue(actualResult);
    } catch (fallbackError) {
      console.warn(`⚠️ Fallback runtime analysis also failed:`, fallbackError);

      // If all methods failed, return a basic fallback
      console.warn(
        `❌ All analysis methods failed for ${route.method} ${route.path}, using basic fallback`
      );
      return {
        type: 'object',
        description: `Response schema could not be determined for ${route.method} ${route.path}`,
      };
    }
  }
};

// OpenAPI parameter interface
interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  schema: Record<string, unknown>;
}

// Generate parameter objects for OpenAPI spec
const generateParameters = (
  inputSchema: RouteInputSchemaType,
  path: string
): OpenApiParameter[] => {
  const parameters: OpenApiParameter[] = [];

  // Query parameters
  if (inputSchema.queryParams) {
    const querySchema = convertZodToJsonSchema(inputSchema.queryParams);
    if (
      querySchema &&
      typeof querySchema === 'object' &&
      'properties' in querySchema &&
      querySchema.properties &&
      typeof querySchema.properties === 'object'
    ) {
      Object.entries(querySchema.properties).forEach(([name, schema]) => {
        const isRequired =
          'required' in querySchema &&
          Array.isArray(querySchema.required) &&
          querySchema.required.includes(name);

        parameters.push({
          name,
          in: 'query',
          required: isRequired,
          schema: schema as Record<string, unknown>,
        });
      });
    }
  }

  // Path parameters - extract from path pattern like /users/{id}
  const pathParamMatches = path.match(/{([^}]+)}/g);
  if (pathParamMatches && inputSchema.pathParams) {
    const pathSchema = convertZodToJsonSchema(inputSchema.pathParams);
    if (
      pathSchema &&
      typeof pathSchema === 'object' &&
      'properties' in pathSchema &&
      pathSchema.properties &&
      typeof pathSchema.properties === 'object'
    ) {
      pathParamMatches.forEach((match) => {
        const paramName = match.slice(1, -1); // Remove { }
        const paramSchema = (pathSchema.properties as Record<string, unknown>)[
          paramName
        ];
        if (paramSchema) {
          parameters.push({
            name: paramName,
            in: 'path',
            required: true,
            schema: paramSchema as Record<string, unknown>,
          });
        }
      });
    }
  }

  // Header parameters
  if (inputSchema.headers) {
    const headerSchema = convertZodToJsonSchema(inputSchema.headers);
    if (
      headerSchema &&
      typeof headerSchema === 'object' &&
      'properties' in headerSchema &&
      headerSchema.properties &&
      typeof headerSchema.properties === 'object'
    ) {
      Object.entries(headerSchema.properties).forEach(([name, schema]) => {
        const isRequired =
          'required' in headerSchema &&
          Array.isArray(headerSchema.required) &&
          headerSchema.required.includes(name);

        parameters.push({
          name,
          in: 'header',
          required: isRequired,
          schema: schema as Record<string, unknown>,
        });
      });
    }
  }

  return parameters;
};

// Generate request body for OpenAPI spec
const generateRequestBody = (inputSchema: RouteInputSchemaType) => {
  if (!inputSchema.body) return undefined;

  const bodySchema = convertZodToJsonSchema(inputSchema.body);

  return {
    required: true,
    content: {
      'application/json': {
        schema: bodySchema,
      },
    },
  };
};

// Generate response schema from handler return type using TypeScript analysis
const generateResponseSchema = async (
  route: RouteType<RouteInputSchemaType, any>,
  options: TypeAnalysisOptions = {}
): Promise<Record<string, OpenApiResponse>> => {
  // Analyze the return type
  const responseSchema = await analyzeHandlerReturnType(route, options);

  console.log(
    `🔍 Processing response schema for ${route.method} ${route.path}:`,
    JSON.stringify(responseSchema, null, 2)
  );

  const responses: Record<string, OpenApiResponse> = {};

  // Check if we have union members from TypeScript analysis
  const unionMembers = (responseSchema as any)?._unionMembers;
  if (unionMembers && Array.isArray(unionMembers)) {
    console.log(`🎭 Processing ${unionMembers.length} union type members`);

    for (const member of unionMembers) {
      let statusCode = member.statusCode || 200;
      let actualSchema = member.schema;

      // Extract body schema if this has RouteResponseType structure
      if (
        actualSchema &&
        typeof actualSchema === 'object' &&
        'properties' in actualSchema &&
        actualSchema.properties &&
        typeof actualSchema.properties === 'object'
      ) {
        const properties = actualSchema.properties as Record<string, unknown>;

        if ('statusCode' in properties && 'body' in properties) {
          console.log(`✅ Found RouteResponseType structure in union member`);

          // Extract status code from the literal type
          const statusCodeProperty = properties.statusCode;
          if (
            statusCodeProperty &&
            typeof statusCodeProperty === 'object' &&
            'const' in statusCodeProperty
          ) {
            statusCode = statusCodeProperty.const as number;
            console.log(`📊 Extracted status code from union: ${statusCode}`);
          }

          // Extract body schema
          const bodyProperty = properties.body;
          if (bodyProperty && typeof bodyProperty === 'object') {
            actualSchema = bodyProperty as Record<string, unknown>;
            console.log(`📦 Extracted body schema from union member`);
          }
        }
      }

      let description = 'Response';
      if (statusCode >= 400) {
        description = statusCode >= 500 ? 'Server Error' : 'Client Error';
      } else if (statusCode >= 300) {
        description = 'Redirection';
      } else if (statusCode >= 200) {
        description = 'Success';
      }

      responses[String(statusCode)] = {
        description,
        content: {
          'application/json': {
            schema: actualSchema,
          },
        },
      };

      console.log(
        `📊 Generated response for union member ${statusCode}: ${description}`
      );
    }

    return responses;
  }

  // Check if we have a single response from runtime analysis
  const singleResponse = (responseSchema as any)?._singleResponse;
  if (singleResponse) {
    console.log(`🎯 Processing single response structure`);
    return {
      [String(singleResponse.statusCode || 200)]: {
        description: 'Response',
        content: {
          'application/json': {
            schema: singleResponse.schema,
          },
        },
      },
    };
  }

  // Fallback to single response logic
  let actualSchema = responseSchema;
  let statusCode = '200';

  if (
    responseSchema &&
    typeof responseSchema === 'object' &&
    'properties' in responseSchema &&
    responseSchema.properties &&
    typeof responseSchema.properties === 'object'
  ) {
    const properties = responseSchema.properties as Record<string, unknown>;

    console.log(`📋 Found properties:`, Object.keys(properties));

    // If it has statusCode and body properties, extract the body schema and status code
    if ('statusCode' in properties && 'body' in properties) {
      console.log(
        `✅ Found RouteResponseType structure with statusCode and body`
      );

      // Extract status code if it's a literal value
      const statusCodeProperty = properties.statusCode;
      if (
        statusCodeProperty &&
        typeof statusCodeProperty === 'object' &&
        'const' in statusCodeProperty
      ) {
        statusCode = String(statusCodeProperty.const);
        console.log(`📊 Extracted status code: ${statusCode}`);
      }

      // Extract body schema - this is what should be in the response content
      const bodyProperty = properties.body;
      if (bodyProperty && typeof bodyProperty === 'object') {
        actualSchema = bodyProperty as Record<string, unknown>;
        console.log(
          `📦 Extracted body schema:`,
          JSON.stringify(actualSchema, null, 2)
        );
      }
    } else {
      console.log(`ℹ️ Plain object response (no statusCode/body structure)`);
    }
  }

  return {
    [statusCode]: {
      description: 'Response',
      content: {
        'application/json': {
          schema: actualSchema,
        },
      },
    },
  };
};

export const generateOpenApiSpec = async (
  routes: RouteType<RouteInputSchemaType, any>[],
  options: OpenApiOptions & TypeAnalysisOptions = {}
): Promise<OpenApiSpec> => {
  const spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: {
      title: options.title || 'ServeDotsAPI',
      version: options.version || '1.0.0',
      description:
        options.description || 'API generated by Servedots framework',
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  // Process each route
  for (const route of routes) {
    const path = route.path;
    const method = normalizeMethod(route.method);

    // Initialize path object if it doesn't exist
    if (!spec.paths[path]) {
      spec.paths[path] = {};
    }

    // Generate parameters
    const parameters = generateParameters(route.inputSchema, path);

    // Generate request body
    const requestBody = generateRequestBody(route.inputSchema);

    // Generate responses with type analysis
    const responses = await generateResponseSchema(route, options);

    // Create operation object
    const operation: OpenApiOperation = {
      summary: `${route.method} ${path}`,
      operationId: `${method}${path.replace(/[{}\/]/g, '_')}`,
      responses,
    };

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (requestBody) {
      operation.requestBody = requestBody;
    }

    spec.paths[path][method] = operation;
  }

  return spec;
};
