import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  normalizeWixPublicKey,
  isAppInstalledEvent,
  isAppRemovedEvent,
  verifyAndParseWixWebhook,
} from '../../src/app/utils/wix-webhook-verifier';
import { GET as installGet, POST as installPost } from '../../src/app/api/webhooks/v1/install/route';
import { GET as uninstallGet, POST as uninstallPost } from '../../src/app/api/webhooks/v1/uninstall/route';
import { GET as billingGet } from '../../src/app/api/webhooks/v1/billing/route';
import { GET as ordersGet } from '../../src/app/api/webhooks/v1/orders/route';
import { subscriptionRepo } from '../../src/app/repositories/subscription-repo';
import { merchantSettingsRepo } from '../../src/app/repositories';
import { getPrismaClient } from '../../src/app/utils/prisma';
import { NextRequest } from 'next/server';

test('Wix Webhooks Security & Installation Audit Tests', async (t) => {
  // Generate dedicated RSA keypair for testing signed webhooks
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const originalJwtKey = process.env.WIX_APP_JWT_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  t.after(async () => {
    process.env.WIX_APP_JWT_KEY = originalJwtKey;
    process.env.NODE_ENV = originalNodeEnv;
  });

  await t.test('normalizeWixPublicKey correctly sanitizes keys in multiple environments', () => {
    // 1. Clean multi-line PEM
    const cleanKey = normalizeWixPublicKey(publicKey);
    assert.ok(cleanKey?.startsWith('-----BEGIN PUBLIC KEY-----'));
    assert.ok(cleanKey?.endsWith('-----END PUBLIC KEY-----'));

    // 2. Key with escaped \n (e.g. from Docker/PM2/.env single-line string)
    const escapedKey = cleanKey?.replace(/\n/g, '\\n');
    const normalizedEscaped = normalizeWixPublicKey(escapedKey);
    assert.ok(normalizedEscaped?.includes('\n'));
    assert.strictEqual(normalizedEscaped?.includes('\\n'), false);

    // 3. Key with surrounding quotes
    const quotedKey = `"${cleanKey}"`;
    const normalizedQuoted = normalizeWixPublicKey(quotedKey);
    assert.strictEqual(normalizedQuoted?.startsWith('"'), false);
    assert.strictEqual(normalizedQuoted?.endsWith('"'), false);

    // 4. Raw base64 missing PEM boundary markers
    const rawBase64 = cleanKey
      ?.replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .trim();
    const wrapped = normalizeWixPublicKey(rawBase64);
    assert.ok(wrapped?.startsWith('-----BEGIN PUBLIC KEY-----'));
    assert.ok(wrapped?.endsWith('-----END PUBLIC KEY-----'));

    // 5. Undefined or empty key
    assert.strictEqual(normalizeWixPublicKey(undefined), undefined);
    assert.strictEqual(normalizeWixPublicKey(''), undefined);
  });

  await t.test('Event type helper functions recognize all Wix event name variants', () => {
    // App Installed variants
    assert.strictEqual(isAppInstalledEvent('AppInstalled'), true);
    assert.strictEqual(isAppInstalledEvent('wix.app_instances.v1.app_instance_installed'), true);
    assert.strictEqual(isAppInstalledEvent('wix.app_instance.v1.installed'), true);
    assert.strictEqual(isAppInstalledEvent('wix.app_management.v1.app_instance_installed'), true);
    assert.strictEqual(isAppInstalledEvent('app_installed'), true);
    assert.strictEqual(isAppInstalledEvent('TEST_EVENT'), true);
    assert.strictEqual(isAppInstalledEvent('AppRemoved'), false);

    // App Removed variants
    assert.strictEqual(isAppRemovedEvent('AppRemoved'), true);
    assert.strictEqual(isAppRemovedEvent('wix.app_instances.v1.app_instance_removed'), true);
    assert.strictEqual(isAppRemovedEvent('wix.app_instance.v1.removed'), true);
    assert.strictEqual(isAppRemovedEvent('app_removed'), true);
    assert.strictEqual(isAppRemovedEvent('AppInstalled'), false);
  });

  await t.test('verifyAndParseWixWebhook successfully verifies RS256 signed JWT tokens', async () => {
    process.env.WIX_APP_JWT_KEY = publicKey;

    const testInstanceId = `webhook-jwt-tenant-${Date.now()}`;
    const tokenPayload = {
      data: JSON.stringify({
        eventType: 'wix.app_instances.v1.app_instance_installed',
        instanceId: testInstanceId,
        data: JSON.stringify({ appId: '4bf163d4-50ce-46f8-8e30-9ac3766e312f' }),
      }),
    };

    const signedToken = jwt.sign(tokenPayload, privateKey, { algorithm: 'RS256' });

    const parsed = await verifyAndParseWixWebhook(signedToken);
    assert.strictEqual(parsed.isValid, true);
    assert.strictEqual(parsed.isVerified, true);
    assert.strictEqual(parsed.instanceId, testInstanceId);
    assert.strictEqual(parsed.eventType, 'wix.app_instances.v1.app_instance_installed');
    assert.strictEqual(parsed.payload?.appId, '4bf163d4-50ce-46f8-8e30-9ac3766e312f');
  });

  await t.test('verifyAndParseWixWebhook parses direct JSON webhook payloads', async () => {
    const testInstanceId = `webhook-json-tenant-${Date.now()}`;
    const jsonPayload = JSON.stringify({
      eventType: 'wix.app_instances.v1.app_instance_installed',
      instanceId: testInstanceId,
      data: { appId: '4bf163d4-50ce-46f8-8e30-9ac3766e312f', originInstanceId: null },
    });

    const parsed = await verifyAndParseWixWebhook(jsonPayload);
    assert.strictEqual(parsed.isValid, true);
    assert.strictEqual(parsed.instanceId, testInstanceId);
    assert.strictEqual(parsed.eventType, 'wix.app_instances.v1.app_instance_installed');
    assert.strictEqual(parsed.verificationMethod, 'json-fallback');
  });

  await t.test('verifyAndParseWixWebhook gracefully handles empty or invalid body', async () => {
    const parsedEmpty = await verifyAndParseWixWebhook('');
    assert.strictEqual(parsedEmpty.isValid, false);
    assert.strictEqual(parsedEmpty.isVerified, false);

    const parsedGarbage = await verifyAndParseWixWebhook('NOT_A_JWT_OR_JSON');
    assert.strictEqual(parsedGarbage.isValid, false);
  });

  await t.test('Webhook health GET endpoints return 200 OK', async () => {
    const resInstall = await installGet();
    assert.strictEqual(resInstall.status, 200);
    const bodyInstall = await resInstall.json();
    assert.strictEqual(bodyInstall.status, 'active');

    const resUninstall = await uninstallGet();
    assert.strictEqual(resUninstall.status, 200);
    const bodyUninstall = await resUninstall.json();
    assert.strictEqual(bodyUninstall.status, 'active');

    const resBilling = await billingGet();
    assert.strictEqual(resBilling.status, 200);

    const resOrders = await ordersGet();
    assert.strictEqual(resOrders.status, 200);
  });

  await t.test('POST /api/webhooks/v1/install provisions tenant subscription & settings in DB', async () => {
    process.env.WIX_APP_JWT_KEY = publicKey;
    const testTenant = `install-audit-tenant-${Date.now()}`;

    // Create signed installation payload
    const payload = {
      data: JSON.stringify({
        eventType: 'wix.app_instances.v1.app_instance_installed',
        instanceId: testTenant,
        data: JSON.stringify({ appId: '4bf163d4-50ce-46f8-8e30-9ac3766e312f' }),
      }),
    };
    const signedToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    const req = new NextRequest('http://localhost/api/webhooks/v1/install', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: signedToken,
    });

    const response = await installPost(req);
    assert.strictEqual(response.status, 200);

    const json = await response.json();
    assert.strictEqual(json.received, true);
    assert.strictEqual(json.status, 'installed');
    assert.strictEqual(json.instanceId, testTenant);

    // Verify tenant provisioned in database with Free tier (5 labels/month)
    const sub = await subscriptionRepo.getSubscription(testTenant);
    assert.ok(sub);
    assert.strictEqual(sub.planType, 'FREE');
    assert.strictEqual(sub.monthlyQuota, 5);
    assert.strictEqual(sub.status, 'ACTIVE');

    // Verify tenant settings exist
    const settings = await merchantSettingsRepo.getSettings(testTenant);
    assert.ok(settings);
    assert.strictEqual(settings.defaultLabelFormat, 'PDF');

    // Cleanup
    const prisma = getPrismaClient();
    await prisma.merchantSubscription.deleteMany({ where: { instanceId: testTenant } });
    await prisma.merchantSettings.deleteMany({ where: { instanceId: testTenant } });
  });

  await t.test('POST /api/webhooks/v1/uninstall cancels tenant subscription in DB', async () => {
    process.env.WIX_APP_JWT_KEY = publicKey;
    const testTenant = `uninstall-audit-tenant-${Date.now()}`;

    // First ensure tenant subscription exists
    await subscriptionRepo.getOrCreateSubscription(testTenant);

    // Create uninstall payload
    const payload = {
      data: JSON.stringify({
        eventType: 'wix.app_instances.v1.app_instance_removed',
        instanceId: testTenant,
        data: JSON.stringify({ appId: '4bf163d4-50ce-46f8-8e30-9ac3766e312f' }),
      }),
    };
    const signedToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    const req = new NextRequest('http://localhost/api/webhooks/v1/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: signedToken,
    });

    const response = await uninstallPost(req);
    assert.strictEqual(response.status, 200);

    const json = await response.json();
    assert.strictEqual(json.received, true);
    assert.strictEqual(json.status, 'uninstalled');

    // Verify subscription status is CANCELLED in DB
    const sub = await subscriptionRepo.getSubscription(testTenant);
    assert.ok(sub);
    assert.strictEqual(sub.status, 'CANCELLED');
    assert.ok(sub.cancelledAt);

    // Cleanup
    const prisma = getPrismaClient();
    await prisma.merchantSubscription.deleteMany({ where: { instanceId: testTenant } });
  });
});
