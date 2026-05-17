/**
 * API Client for communicating with the benchmark backend
 * Uses environment variable VITE_BACKEND_URL to determine backend location
 */

const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
};

// LocalTunnel requires this header to bypass its interstitial page for programmatic requests
export const tunnelHeaders = () =>
  import.meta.env.VITE_BACKEND_URL?.includes('loca.lt')
    ? { 'bypass-tunnel-reminder': 'true' }
    : {};

export { getBackendUrl };

export const apiClient = {
  async runBenchmark(payload, apiKey = 'demo-key-12345') {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/benchmark/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...tunnelHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async getBenchmarkResult(testId, apiKey = 'demo-key-12345') {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/benchmark/${testId}`, {
      headers: { 'X-API-Key': apiKey, ...tunnelHeaders() },
    });
    return response.json();
  },

  async getHistory(apiKey = 'demo-key-12345') {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/benchmark/history`, {
      headers: { 'X-API-Key': apiKey, ...tunnelHeaders() },
    });
    return response.json();
  },

  async compareResults(testId1, testId2, apiKey = 'demo-key-12345') {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/benchmark/compare/${testId1}/${testId2}`, {
      headers: { 'X-API-Key': apiKey, ...tunnelHeaders() },
    });
    return response.json();
  },

  getBackendUrl,
};

export default apiClient;
