import { type NextRequest } from 'next/server';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { logger } from './logger';
import { wixAppClient } from './wix-sdk.app';

export interface ParsedWixWebhook<T = any> {
  isValid: boolean;
  isVerified: boolean;
  eventType: string;
  instanceId: string;
  payload: T;
  identity?: any;
  error?: string;
  verificationMethod: 'wix-sdk' | 'rs256' | 'hmac' | 'json-fallback' | 'unverified';
}

/**
 * Normalizes and cleans the Wix RSA public key.
 * Handles escaped newlines (\n), surrounding quotes, and ensures valid PEM boundaries.
 */
export function normalizeWixPublicKey(key?: string): string | undefined {
  if (!key) return undefined;
  let formatted = key.trim();

  // Strip enclosing quotes if present (e.g. from environment variable files)
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1).trim();
  }

  // Replace literal '\n' escape sequences with actual newlines
  if (formatted.includes('\\n')) {
    formatted = formatted.replace(/\\n/g, '\n');
  }

  // Ensure standard PEM public key boundary markers
  if (!formatted.includes('-----BEGIN PUBLIC KEY-----')) {
    formatted = `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
  }

  return formatted.trim();
}

/**
 * Helper to identify if an eventType corresponds to App Installed
 */
export function isAppInstalledEvent(eventType: string): boolean {
  const normalized = (eventType || '').toLowerCase().trim();
  return (
    normalized === 'appinstalled' ||
    normalized === 'appinstanceinstalled' ||
    normalized === 'wix.app_instances.v1.app_instance_installed' ||
    normalized === 'wix.app_instance.v1.installed' ||
    normalized === 'wix.app_management.v1.app_instance_installed' ||
    normalized === 'app_installed' ||
    normalized === 'test_event' ||
    normalized.includes('installed')
  );
}

/**
 * Helper to identify if an eventType corresponds to App Removed / Uninstalled
 */
export function isAppRemovedEvent(eventType: string): boolean {
  const normalized = (eventType || '').toLowerCase().trim();
  return (
    normalized === 'appremoved' ||
    normalized === 'appinstanceremoved' ||
    normalized === 'wix.app_instances.v1.app_instance_removed' ||
    normalized === 'wix.app_instance.v1.removed' ||
    normalized === 'wix.app_management.v1.app_instance_removed' ||
    normalized === 'app_removed' ||
    normalized.includes('removed') ||
    normalized.includes('uninstalled')
  );
}

/**
 * Verifies and parses an incoming Wix webhook request.
 * Supports:
 * 1. Official Wix SDK parseJWT
 * 2. Fallback jsonwebtoken RS256 verification with sanitized public key
 * 3. Fallback HMAC-SHA256 verification with WIX_APP_SECRET
 * 4. Fallback direct JSON parsing (for test payloads / Dev Center test triggers / internal mocks)
 */
export async function verifyAndParseWixWebhook<T = any>(
  request: NextRequest | Request | string,
): Promise<ParsedWixWebhook<T>> {
  let bodyText = '';

  if (typeof request === 'string') {
    bodyText = request;
  } else if (typeof request.text === 'function') {
    try {
      if (typeof (request as any).clone === 'function') {
        const cloned = (request as any).clone();
        bodyText = await cloned.text();
      } else {
        bodyText = await request.text();
      }
    } catch (err) {
      logger.warn('WEBHOOK_STREAM', 'Failed to read request body stream', { error: String(err) });
    }
  }

  const trimmed = (bodyText || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      isVerified: false,
      eventType: '',
      instanceId: '',
      payload: {} as T,
      error: 'Empty request body',
      verificationMethod: 'unverified',
    };
  }

  // Strategy 1: Attempt official Wix SDK parseJWT if it looks like a JWT (3 parts separated by dots)
  const isJwt = trimmed.split('.').length === 3;
  if (isJwt) {
    try {
      const sdkResult = await wixAppClient.webhooks.parseJWT(trimmed);
      if (sdkResult && sdkResult.instanceId) {
        return {
          isValid: true,
          isVerified: true,
          eventType: sdkResult.eventType || '',
          instanceId: sdkResult.instanceId,
          payload: (sdkResult.payload || {}) as T,
          identity: sdkResult.identity,
          verificationMethod: 'wix-sdk',
        };
      }
    } catch (sdkErr: any) {
      logger.warn('WEBHOOK_PARSE_FALLBACK', 'Wix SDK parseJWT threw, attempting direct RS256 fallback', {
        error: sdkErr?.message,
      });
    }

    // Strategy 2: Direct RS256 verification using jsonwebtoken with normalized public key
    const publicKey = normalizeWixPublicKey(process.env.WIX_APP_JWT_KEY);
    if (publicKey) {
      try {
        const verified = jwt.verify(trimmed, publicKey, { algorithms: ['RS256'] }) as JwtPayload;
        let eventData: any = verified;

        if (typeof verified.data === 'string') {
          try {
            eventData = JSON.parse(verified.data);
          } catch {
            eventData = { raw: verified.data };
          }
        }

        let innerPayload: any = eventData?.data;
        if (typeof innerPayload === 'string') {
          try {
            innerPayload = JSON.parse(innerPayload);
          } catch {
            // keep as string
          }
        }

        const instanceId =
          eventData?.instanceId ||
          verified?.instanceId ||
          verified?.metadata?.instanceId ||
          innerPayload?.instanceId ||
          '';

        const eventType =
          eventData?.eventType || verified?.eventType || verified?.metadata?.eventType || innerPayload?.eventType || '';

        return {
          isValid: true,
          isVerified: true,
          eventType,
          instanceId,
          payload: (innerPayload || eventData || {}) as T,
          identity: eventData?.identity,
          verificationMethod: 'rs256',
        };
      } catch (jwtErr: any) {
        logger.warn('WEBHOOK_RS256_FAILED', 'RS256 verification failed', { error: jwtErr?.message });
      }
    }

    // Strategy 3: HMAC verification with WIX_APP_SECRET
    const appSecret = process.env.WIX_APP_SECRET;
    if (appSecret) {
      try {
        const verifiedHmac = jwt.verify(trimmed, appSecret, { algorithms: ['HS256'] }) as JwtPayload;
        const instanceId = verifiedHmac.instanceId || (verifiedHmac.data && verifiedHmac.data.instanceId) || '';
        const eventType = verifiedHmac.eventType || (verifiedHmac.data && verifiedHmac.data.eventType) || '';
        return {
          isValid: true,
          isVerified: true,
          eventType,
          instanceId,
          payload: (verifiedHmac.data || verifiedHmac) as T,
          verificationMethod: 'hmac',
        };
      } catch {
        // Continue to unverified decode
      }
    }

    // Strategy 4: Decode JWT without signature check (for Dev Center test tokens or testing)
    try {
      const decoded = jwt.decode(trimmed, { complete: true }) as any;
      if (decoded && decoded.payload) {
        let payloadObj = decoded.payload;
        if (typeof payloadObj.data === 'string') {
          try {
            payloadObj = JSON.parse(payloadObj.data);
          } catch {
            // keep
          }
        }

        const instanceId =
          payloadObj?.instanceId || decoded.payload?.instanceId || decoded.payload?.data?.instanceId || '';

        const eventType = payloadObj?.eventType || decoded.payload?.eventType || decoded.payload?.data?.eventType || '';

        let innerPayload = payloadObj?.data || payloadObj;
        if (typeof innerPayload === 'string') {
          try {
            innerPayload = JSON.parse(innerPayload);
          } catch {
            // keep
          }
        }

        return {
          isValid: true,
          isVerified: false,
          eventType,
          instanceId,
          payload: innerPayload as T,
          error: 'Decoded without cryptographic signature verification',
          verificationMethod: 'unverified',
        };
      }
    } catch {
      // Continue to JSON parsing
    }
  }

  // Strategy 5: Parse as Direct JSON or JSON wrapping JWT
  try {
    const jsonBody = JSON.parse(trimmed);

    // Check if JSON has a nested JWT string in `data`
    if (typeof jsonBody?.data === 'string' && jsonBody.data.split('.').length === 3) {
      return verifyAndParseWixWebhook(jsonBody.data);
    }

    const instanceId =
      jsonBody?.instanceId ||
      jsonBody?.instance_id ||
      jsonBody?.metadata?.instanceId ||
      jsonBody?.data?.instanceId ||
      '';

    const eventType =
      jsonBody?.eventType || jsonBody?.event || jsonBody?.metadata?.eventType || jsonBody?.data?.eventType || '';

    const payload = jsonBody?.data || jsonBody?.payload || jsonBody;

    return {
      isValid: true,
      isVerified: false, // direct JSON has no cryptographic signature
      eventType,
      instanceId,
      payload: payload as T,
      verificationMethod: 'json-fallback',
    };
  } catch (parseErr: any) {
    logger.error('WEBHOOK_JSON_PARSE', 'Unable to parse request body as JWT or JSON', parseErr);
    return {
      isValid: false,
      isVerified: false,
      eventType: '',
      instanceId: '',
      payload: {} as T,
      error: `Payload parsing failed: ${parseErr?.message}`,
      verificationMethod: 'unverified',
    };
  }
}
