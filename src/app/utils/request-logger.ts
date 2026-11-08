import { NextRequest, NextResponse } from 'next/server';
import { logger, RequestLogEntry } from './logger';

export interface RequestLoggingOptions {
  moduleName?: string;
  logBody?: boolean;
  maxBodyLength?: number;
}

/**
 * Intelligently decodes request bodies:
 * - If the body is a signed JWT token (Wix SPI and webhooks: xxx.yyy.zzz), decodes the base64url payload to clean JSON.
 * - If the body is standard JSON, parses it into an object.
 * - If the parsed JSON contains a nested JWT string (e.g. { data: "xxx.yyy.zzz" }), decodes that as well.
 * - Extracts instanceId from decoded payload whenever available.
 */
export function parseAndDecodeRequestBody(text: string, maxBodyLength = 50000): { body: any; instanceId?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { body: undefined };

  // 1. Direct JWT token (Wix sends text/plain with 3 dot-separated base64url parts)
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
      const parsedJwt = JSON.parse(payloadStr);

      const instanceId =
        parsedJwt?.data?.metadata?.instanceId ||
        parsedJwt?.metadata?.instanceId ||
        parsedJwt?.data?.instanceId ||
        parsedJwt?.instanceId;

      return {
        body: parsedJwt,
        instanceId,
      };
    } catch {
      // Continue to next parsing strategy
    }
  }

  // 2. Direct JSON or JSON wrapping a JWT
  try {
    const parsed = JSON.parse(trimmed);

    // If it has a nested JWT string in `data` (common in some webhook wrappers)
    if (typeof parsed?.data === 'string' && parsed.data.split('.').length === 3) {
      try {
        const innerPayloadStr = Buffer.from(parsed.data.split('.')[1], 'base64url').toString('utf8');
        parsed.data = JSON.parse(innerPayloadStr);
      } catch {
        // Keep as string
      }
    }

    const instanceId =
      parsed?.metadata?.instanceId ||
      parsed?.data?.metadata?.instanceId ||
      parsed?.instanceId ||
      parsed?.data?.instanceId;

    return {
      body: parsed,
      instanceId,
    };
  } catch {
    // 3. Fallback to raw text truncated to maxBodyLength
    return {
      body: trimmed.slice(0, maxBodyLength),
    };
  }
}

/**
 * Universal higher-order wrapper for Next.js App Router Route Handlers.
 * Intercepts incoming requests, extracts payload, query params, headers,
 * measures processing duration, and persists audit logs to `logs/requests.log`.
 */
export function withRequestLogging<T extends (request?: any, context?: any) => Promise<Response | NextResponse>>(
  handler: T,
  options: RequestLoggingOptions = {},
): T {
  const wrapped = async (request?: Request | NextRequest, context?: any): Promise<Response> => {
    const startTime = Date.now();

    // Defensive handling when called in unit tests without arguments: handler()
    const rawUrl = request?.url || 'http://localhost/api';
    let urlObj: URL;
    try {
      urlObj = new URL(rawUrl);
    } catch {
      urlObj = new URL('http://localhost/api');
    }

    const method = (request?.method || 'GET').toUpperCase();
    const path = urlObj.pathname;
    const url = rawUrl;

    // Extract query parameters
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((val, key) => {
      query[key] = val;
    });

    // Extract headers
    const headers: Record<string, string> = {};
    if (request?.headers) {
      try {
        request.headers.forEach((val, key) => {
          headers[key.toLowerCase()] = val;
        });
      } catch {
        // Handle plain objects or unconventional headers mocks
        if (typeof (request.headers as any).entries === 'function') {
          for (const [key, val] of (request.headers as any).entries()) {
            headers[key.toLowerCase()] = String(val);
          }
        }
      }
    }

    const ip =
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-real-ip'] ||
      headers['cf-connecting-ip'] ||
      undefined;

    const userAgent = headers['user-agent'] || undefined;
    const correlationId =
      headers['x-correlation-id'] ||
      headers['x-request-id'] ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let instanceId: string | undefined = query['instanceId'] || headers['x-wix-instance-id'];

    // Safely parse request body without consuming stream
    let body: any = undefined;
    const shouldReadBody = options.logBody !== false && !['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (shouldReadBody && request && typeof request.clone === 'function') {
      try {
        const cloned = request.clone();
        const text = await cloned.text();
        if (text) {
          (request as any).__rawBody = text;
          const parsed = parseAndDecodeRequestBody(text, options.maxBodyLength || 50000);
          body = parsed.body;
          if (!instanceId && parsed.instanceId) {
            instanceId = parsed.instanceId;
          }
        }
      } catch {
        // Clone or body reading failure falls back gracefully
      }
    }

    let response: Response;
    try {
      response = await handler(request, context);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isRedirect = err?.digest?.startsWith('NEXT_REDIRECT');

      if (isRedirect) {
        logger.logRequest({
          correlationId,
          instanceId,
          method,
          path,
          url,
          query: Object.keys(query).length > 0 ? query : undefined,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          ip,
          userAgent,
          body,
          statusCode: 307,
          durationMs,
          context: options.moduleName ? { module: options.moduleName, redirect: true } : undefined,
        });
        throw err;
      }

      const errorMsg = err?.message || String(err);

      logger.logRequest({
        correlationId,
        instanceId,
        method,
        path,
        url,
        query: Object.keys(query).length > 0 ? query : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        ip,
        userAgent,
        body,
        statusCode: err?.status || err?.statusCode || 500,
        durationMs,
        error: errorMsg,
        context: options.moduleName ? { module: options.moduleName } : undefined,
      });

      throw err;
    }

    const durationMs = Date.now() - startTime;
    const statusCode = response.status;

    logger.logRequest({
      correlationId,
      instanceId,
      method,
      path,
      url,
      query: Object.keys(query).length > 0 ? query : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      ip,
      userAgent,
      body,
      statusCode,
      durationMs,
      context: options.moduleName ? { module: options.moduleName } : undefined,
    });

    // Attach correlation header to response if headers are mutable
    try {
      response.headers.set('x-correlation-id', correlationId);
    } catch {
      // In immutable responses, return as-is
    }

    return response;
  };

  return wrapped as T;
}

/**
 * Log server action invocations from Wix Dashboard into `requests.log`
 */
export function logActionRequest(
  actionName: string,
  params: Record<string, any>,
  result?: any,
  durationMs?: number,
  instanceId?: string,
  error?: any,
): void {
  const correlationId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  logger.logRequest({
    correlationId,
    instanceId,
    method: 'ACTION',
    path: `/actions/${actionName}`,
    url: `action://${actionName}`,
    body: params,
    statusCode: error ? error?.status || 500 : 200,
    durationMs: durationMs || 0,
    error: error ? error.message || String(error) : undefined,
    responseSummary: result ? { success: true } : undefined,
  });
}
