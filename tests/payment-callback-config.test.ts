import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('callback secret configuration', () => {
  it.each([undefined, '', 'too-short'])('fails startup for unsafe secret %s', async (secret) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost/test');
    vi.stubEnv('BFF_API_KEY', 'test-api-key');
    vi.stubEnv('SERVICE_NAME', 'order-service');
    vi.stubEnv('PAYMENT_CALLBACK_SECRET', secret);
    vi.resetModules();
    await expect(import('../src/config/environment')).rejects.toThrow('PAYMENT_CALLBACK_SECRET');
  });

  it('loads a dedicated strong callback secret', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost/test');
    vi.stubEnv('BFF_API_KEY', 'test-api-key');
    vi.stubEnv('SERVICE_NAME', 'order-service');
    vi.stubEnv('PAYMENT_CALLBACK_SECRET', 'test-callback-secret-at-least-32-bytes');
    vi.resetModules();
    const { environment } = await import('../src/config/environment');
    expect(environment.paymentCallbackSecret).toBe('test-callback-secret-at-least-32-bytes');
  });
});
