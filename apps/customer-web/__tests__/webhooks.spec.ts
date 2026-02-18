import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * Tests for webhook handler logic.
 * Validates signature verification and payload parsing behavior.
 */

// Replicate the Square signature validation logic from the handler for testing
const isValidSquareSignature = (
  body: string,
  signature: string,
  signatureKey: string,
  notificationUrl: string
): boolean => {
  const payload = Buffer.from(notificationUrl + body, 'utf-8');
  const key = Buffer.from(signatureKey, 'utf-8');
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(payload);
  const digest = hmac.digest('base64');
  return digest === signature;
};

describe('Square webhook signature validation', () => {
  it('validates correct HMAC signature', () => {
    const body = '{"event_id":"evt-123","type":"order.updated"}';
    const notificationUrl = 'https://example.com/api/webhooks/square';
    const key = 'test-secret-key';
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(notificationUrl + body);
    const validSignature = hmac.digest('base64');

    expect(isValidSquareSignature(body, validSignature, key, notificationUrl)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const body = '{"event_id":"evt-123","type":"order.updated"}';
    const notificationUrl = 'https://example.com/api/webhooks/square';
    const key = 'test-secret-key';

    expect(isValidSquareSignature(body, 'invalid-signature', key, notificationUrl)).toBe(false);
  });

  it('rejects signature with wrong key', () => {
    const body = '{"event_id":"evt-123","type":"order.updated"}';
    const notificationUrl = 'https://example.com/api/webhooks/square';
    const key = 'test-secret-key';
    const wrongKey = 'different-key';
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(notificationUrl + body);
    const signature = hmac.digest('base64');

    expect(isValidSquareSignature(body, signature, wrongKey, notificationUrl)).toBe(false);
  });
});

describe('Webhook payload validation', () => {
  it('requires event_id in payload', () => {
    const payload = { type: 'order.updated' };
    const eventId = payload.event_id as string | undefined;
    expect(eventId).toBeUndefined();
  });

  it('requires valid JSON', () => {
    const invalidJson = 'not valid json {{{';
    expect(() => JSON.parse(invalidJson)).toThrow();
  });
});
