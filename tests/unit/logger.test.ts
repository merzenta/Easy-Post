import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { redactSensitiveData, AppLogger, RotatingLogManager, createTenantLogger } from '../../src/app/utils/logger';
import { withRequestLogging, logActionRequest, parseAndDecodeRequestBody } from '../../src/app/utils/request-logger';

const TEST_LOG_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'test-logs');

function cleanupTestLogs() {
  if (fs.existsSync(TEST_LOG_DIR)) {
    fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
  }
}

test('Security Redaction & Masking Protocol', async (t) => {
  await t.test('redacts direct sensitive credential fields with [REDACTED]', () => {
    const payload = {
      apiKey: 'secret-key-12345',
      apiPassword: 'super-password-67890',
      pacApiKey: 'pac-key-999',
      authorization: 'Bearer token123',
      creditCard: '4111111111111111',
      publicInfo: 'Sydney Warehouse',
    };

    const cleaned = redactSensitiveData(payload);
    assert.strictEqual(cleaned.apiKey, '[REDACTED]');
    assert.strictEqual(cleaned.apiPassword, '[REDACTED]');
    assert.strictEqual(cleaned.pacApiKey, '[REDACTED]');
    assert.strictEqual(cleaned.authorization, '[REDACTED]');
    assert.strictEqual(cleaned.creditCard, '[REDACTED]');
    assert.strictEqual(cleaned.publicInfo, 'Sydney Warehouse');
  });

  await t.test('partially masks 10-digit Australia Post account numbers', () => {
    const payload = {
      accountNumber: '1000928345',
      shortNumber: '123',
    };

    const cleaned = redactSensitiveData(payload);
    assert.strictEqual(cleaned.accountNumber, '******8345');
  });

  await t.test('recursively redacts nested objects and arrays', () => {
    const nested = {
      user: {
        profile: {
          secret: 'should-be-hidden',
        },
      },
      requests: [{ headers: { authorization: 'Basic dXNlcjpwYXNz' } }, { action: 'getRates', harmless: true }],
    };

    const cleaned = redactSensitiveData(nested);
    assert.strictEqual(cleaned.user.profile.secret, '[REDACTED]');
    assert.strictEqual(cleaned.requests[0].headers.authorization, '[REDACTED]');
    assert.strictEqual(cleaned.requests[1].harmless, true);
  });
});

test('Persistent Disk Logger & Dedicated Stream Separation', async (t) => {
  cleanupTestLogs();

  const manager = new RotatingLogManager(TEST_LOG_DIR, 5); // 5 MB threshold
  const testLogger = new AppLogger({ logDir: TEST_LOG_DIR }, manager);

  await t.test('writes info, warn, and error entries to app-combined.log in NDJSON format', async () => {
    testLogger.info('TEST_INFO_ACTION', 'Informational message', { count: 1 });
    testLogger.warn('TEST_WARN_ACTION', 'Warning message', { warningCode: 'W1' });
    testLogger.error('TEST_ERROR_ACTION', 'Error occurred', new Error('Simulated failure'), { retry: false });

    await testLogger.flush();

    const combinedFile = path.join(TEST_LOG_DIR, 'app-combined.log');
    assert.ok(fs.existsSync(combinedFile));

    const content = fs.readFileSync(combinedFile, 'utf8').trim().split('\n');
    assert.strictEqual(content.length >= 3, true);

    const firstEntry = JSON.parse(content[0]);
    assert.strictEqual(firstEntry.action, 'TEST_INFO_ACTION');
    assert.strictEqual(firstEntry.level, 'info');
    assert.strictEqual(firstEntry.context.count, 1);
  });

  await t.test('isolates errors to app-error.log', async () => {
    const errorFile = path.join(TEST_LOG_DIR, 'app-error.log');
    assert.ok(fs.existsSync(errorFile));

    const content = fs.readFileSync(errorFile, 'utf8').trim().split('\n');
    assert.strictEqual(content.length >= 1, true);

    const errEntry = JSON.parse(content[0]);
    assert.strictEqual(errEntry.action, 'TEST_ERROR_ACTION');
    assert.strictEqual(errEntry.level, 'error');
    assert.strictEqual(errEntry.error.message, 'Simulated failure');
  });

  await t.test('writes rate queries specifically to spi-rates.log', async () => {
    testLogger.rateAudit('RATE_CALCULATED_AUDIT', {
      postcode: '3000',
      totalWeightKg: 1.5,
      returnedServices: ['7D55'],
    });

    await testLogger.flush();

    const spiFile = path.join(TEST_LOG_DIR, 'spi-rates.log');
    assert.ok(fs.existsSync(spiFile));

    const content = fs.readFileSync(spiFile, 'utf8').trim().split('\n');
    assert.strictEqual(content.length >= 1, true);

    const spiEntry = JSON.parse(content[0]);
    assert.strictEqual(spiEntry.action, 'RATE_CALCULATED_AUDIT');
    assert.strictEqual(spiEntry.context.postcode, '3000');
  });

  await t.test('writes legal & financial audit events to audit.log', async () => {
    testLogger.audit('ORDER_MANIFESTED_LEGAL', 'Committed order to Australia Post manifest', {
      manifestOrderId: 'AP-ORDER-101',
      totalCost: 154.2,
    });

    await testLogger.flush();

    const auditFile = path.join(TEST_LOG_DIR, 'audit.log');
    assert.ok(fs.existsSync(auditFile));

    const content = fs.readFileSync(auditFile, 'utf8').trim().split('\n');
    assert.strictEqual(content.length >= 1, true);

    const auditEntry = JSON.parse(content[0]);
    assert.strictEqual(auditEntry.action, 'ORDER_MANIFESTED_LEGAL');
    assert.strictEqual(auditEntry.context.manifestOrderId, 'AP-ORDER-101');
  });

  await t.test('writes request data specifically to separate requests.log', async () => {
    testLogger.logRequest({
      correlationId: 'req-test-12345',
      instanceId: 'tenant-test-888',
      method: 'POST',
      path: '/api/shipping-rates/v1/getRates',
      url: 'https://example.com/api/shipping-rates/v1/getRates?instanceId=tenant-test-888',
      query: { instanceId: 'tenant-test-888' },
      headers: {
        authorization: 'Bearer secret-jwt-token',
        cookie: 'session=xyz123',
        'content-type': 'application/json',
      },
      ip: '203.0.113.195',
      userAgent: 'Mozilla/5.0 TestBrowser',
      body: {
        apiKey: 'super-secret-auspost-key',
        shippingDestination: { postalCode: '3000', country: 'AU' },
        accountNumber: '1234567890',
      },
      statusCode: 200,
      durationMs: 45,
    });

    await testLogger.flush();

    const requestsFile = path.join(TEST_LOG_DIR, 'requests.log');
    assert.ok(fs.existsSync(requestsFile));

    const content = fs.readFileSync(requestsFile, 'utf8').trim().split('\n');
    assert.strictEqual(content.length >= 1, true);

    const reqEntry = JSON.parse(content[0]);
    assert.strictEqual(reqEntry.method, 'POST');
    assert.strictEqual(reqEntry.path, '/api/shipping-rates/v1/getRates');
    assert.strictEqual(reqEntry.statusCode, 200);
    assert.strictEqual(reqEntry.durationMs, 45);
    assert.strictEqual(reqEntry.ip, '203.0.113.195');

    // Security verification: sensitive headers and body must be redacted
    assert.strictEqual(reqEntry.headers.authorization, '[REDACTED]');
    assert.strictEqual(reqEntry.headers.cookie, '[REDACTED]');
    assert.strictEqual(reqEntry.body.apiKey, '[REDACTED]');
    assert.strictEqual(reqEntry.body.accountNumber, '******7890');
    assert.strictEqual(reqEntry.body.shippingDestination.postalCode, '3000');
  });
});

test('HTTP Request Middleware & Route Handler Interception', async (t) => {
  await t.test('withRequestLogging intercepts HTTP GET and records in requests.log', async () => {
    const handler = withRequestLogging(
      async (req) => {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      { moduleName: 'test/handler' },
    );

    const mockRequest = new Request('http://localhost/api/test?foo=bar', {
      method: 'GET',
      headers: {
        'User-Agent': 'TestRunner/1.0',
        'X-Forwarded-For': '198.51.100.1',
      },
    });

    const response = await handler(mockRequest);
    assert.strictEqual(response.status, 200);
    assert.ok(response.headers.get('x-correlation-id'));
  });

  await t.test('withRequestLogging logs 500 status and rethrows on handler error', async () => {
    const failingHandler = withRequestLogging(
      async (_req: Request) => {
        throw new Error('Database connection failed');
      },
      { moduleName: 'test/fail' },
    );

    const mockRequest = new Request('http://localhost/api/failing', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await assert.rejects(async () => {
      await failingHandler(mockRequest);
    }, /Database connection failed/);
  });

  await t.test('parseAndDecodeRequestBody decodes Wix signed JWTs to structured JSON', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        data: {
          request: {
            lineItems: [{ name: 'Blue Mug', quantity: 2 }],
            shippingDestination: { city: 'Sydney', country: 'AU' },
          },
          metadata: { instanceId: 'wix-instance-jwt-999', currency: 'AUD' },
        },
        iss: 'wix.com',
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.dummySignature`;

    const result = parseAndDecodeRequestBody(token);
    assert.strictEqual(typeof result.body, 'object');
    assert.strictEqual(result.body.data.request.lineItems[0].name, 'Blue Mug');
    assert.strictEqual(result.instanceId, 'wix-instance-jwt-999');
  });

  await t.test('parseAndDecodeRequestBody parses standard JSON bodies', () => {
    const jsonStr = JSON.stringify({
      request: { lineItems: [{ id: '1' }] },
      metadata: { instanceId: 'inst-json-123' },
    });

    const result = parseAndDecodeRequestBody(jsonStr);
    assert.strictEqual(typeof result.body, 'object');
    assert.strictEqual(result.instanceId, 'inst-json-123');
  });
});

test('Tenant Scoping & Correlation ID Tracing', async (t) => {
  const manager = new RotatingLogManager(TEST_LOG_DIR, 5);
  const baseLogger = new AppLogger({ logDir: TEST_LOG_DIR }, manager);
  const tenantLogger = createTenantLogger(
    'tenant-wix-999',
    'trace-custom-correlation-101',
    undefined,
    undefined,
    baseLogger,
  );

  await t.test('attaches instanceId and correlationId to every emitted log entry', async () => {
    tenantLogger.info('TENANT_ACTION', 'Scoped tenant operation', { param: 'test' });
    await tenantLogger.flush();

    const combinedFile = path.join(TEST_LOG_DIR, 'app-combined.log');
    const lines = fs.readFileSync(combinedFile, 'utf8').trim().split('\n');
    const lastLine = JSON.parse(lines[lines.length - 1]);

    assert.strictEqual(lastLine.instanceId, 'tenant-wix-999');
    assert.strictEqual(lastLine.correlationId, 'trace-custom-correlation-101');
    assert.strictEqual(lastLine.action, 'TENANT_ACTION');
  });
});

test('Log Rotation & Gzip Compression', async (t) => {
  const rotateLogDir = path.join(TEST_LOG_DIR, 'rotation-test');
  if (fs.existsSync(rotateLogDir)) {
    fs.rmSync(rotateLogDir, { recursive: true, force: true });
  }

  // Create manager with a tiny 1KB size threshold to force rotation
  const tinyManager = new RotatingLogManager(rotateLogDir, 0.001); // ~1KB
  const tinyLogger = new AppLogger({ logDir: rotateLogDir }, tinyManager);

  await t.test('triggers rotation and produces compressed .log.gz archive when size threshold is passed', async () => {
    // Generate ~3KB of log data
    for (let i = 0; i < 20; i++) {
      tinyLogger.info('LARGE_PAYLOAD_EVENT', 'Repetitive payload for size testing', {
        index: i,
        filler: 'A'.repeat(150),
      });
    }

    await tinyLogger.flush();

    const archiveDir = path.join(rotateLogDir, 'archive');
    assert.ok(fs.existsSync(archiveDir));

    const gzFiles = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.log.gz'));
    assert.ok(gzFiles.length >= 1, 'Expected at least one rotated .log.gz file');

    // Decompress and verify content
    const gzPath = path.join(archiveDir, gzFiles[0]);
    const compressedBuffer = fs.readFileSync(gzPath);
    const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf8');

    assert.ok(decompressed.includes('LARGE_PAYLOAD_EVENT'));
  });

  // Clean up
  cleanupTestLogs();
});
