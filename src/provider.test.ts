import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeFetchProvider } from './provider';

describe('Provider Error Handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not attach errorText to ProviderError when response is not ok', async () => {
    // Setup a failed fetch response
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Sensitive Error Details',
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = makeFetchProvider('openrouter', 'test-api-key');

    try {
      await provider.complete('Hello');
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.name).toBe('ProviderError');
      expect(err.message).toBe('LLM provider returned 500');
      expect(err.meta).toBeDefined();
      expect(err.meta.status).toBe(500);
      expect(err.meta.errorText).toBeUndefined(); // Verify errorText is NOT present
    }
  });
});
