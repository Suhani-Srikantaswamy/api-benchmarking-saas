import React, { useState } from 'react';
import './BenchmarkForm.css';

const PRESETS = [
  { label: 'Light',  vus: 10, duration: '10s', desc: '10 VUs · 10s' },
  { label: 'Medium', vus: 20, duration: '15s', desc: '20 VUs · 15s' },
  { label: 'Stress', vus: 50, duration: '20s', desc: '50 VUs · 20s' },
];

const DEMO_URLS = [
  { label: 'httpbin.org',     url: 'https://httpbin.org/get' },
  { label: 'jsonplaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'api.github.com',  url: 'https://api.github.com' },
];

const AUTH_MODES = [
  { id: 'none',   label: 'None',         desc: 'Public API — no auth needed' },
  { id: 'bearer', label: 'Bearer Token',  desc: 'Authorization: Bearer ...' },
  { id: 'apikey', label: 'API Key',       desc: 'X-API-Key: ...' },
  { id: 'custom', label: 'Custom JSON',   desc: 'Raw header object' },
];

function validateUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

/** Build headers object from auth mode + value */
function buildHeaders(authMode, authValue, customJson) {
  if (authMode === 'bearer' && authValue.trim()) {
    return { Authorization: `Bearer ${authValue.trim()}` };
  }
  if (authMode === 'apikey' && authValue.trim()) {
    return { 'X-API-Key': authValue.trim() };
  }
  if (authMode === 'custom' && customJson.trim()) {
    return JSON.parse(customJson.trim()); // caller must catch
  }
  return {};
}

export default function BenchmarkForm({ onTestStart, disabled }) {
  const [apiUrl,     setApiUrl]     = useState('');
  const [vus,        setVus]        = useState(10);
  const [duration,   setDuration]   = useState('10s');
  const [method,     setMethod]     = useState('GET');
  const [authMode,   setAuthMode]   = useState('none');
  const [authValue,  setAuthValue]  = useState('');
  const [customJson, setCustomJson] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const urlValid   = apiUrl.trim() && validateUrl(apiUrl.trim());
  const urlInvalid = apiUrl.trim() && !urlValid;

  const applyPreset = ({ vus: v, duration: d }) => { setVus(v); setDuration(d); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!urlValid) { setError('Please enter a valid URL'); return; }

    let parsedHeaders = {};
    try {
      parsedHeaders = buildHeaders(authMode, authValue, customJson);
    } catch {
      setError('Custom JSON is not valid. Example: {"Authorization":"Bearer token"}');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-key-12345' },
        body: JSON.stringify({ apiUrl, vus: Number(vus), duration, method, headers: parsedHeaders }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.errors ? data.errors.map(e => e.msg).join(', ') : (data.error || 'Failed'));
        return;
      }
      onTestStart({ testId: data.testId, apiUrl, vus, duration });
    } catch {
      setError('Network error — is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-card fade-in">
      <div className="form-header">
        <h2 className="form-title">Configure Load Test</h2>
        <p className="form-subtitle">Test any public or authenticated API endpoint</p>
      </div>

      <form onSubmit={handleSubmit} className="form-body">

        {/* ── URL ─────────────────────────────────────────────────────── */}
        <div className="field">
          <label className="field-label" htmlFor="apiUrl">
            API Endpoint URL
            {urlValid   && <span className="url-badge valid">✓ Valid</span>}
            {urlInvalid && <span className="url-badge invalid">✗ Invalid</span>}
          </label>
          <input
            id="apiUrl" type="text"
            className={`input ${urlInvalid ? 'input-error' : ''}`}
            value={apiUrl} onChange={e => setApiUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            disabled={disabled || loading} autoComplete="off"
          />
          <div className="quick-urls">
            {DEMO_URLS.map(({ label, url }) => (
              <button key={url} type="button" className="chip"
                onClick={() => setApiUrl(url)} disabled={disabled || loading}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Presets ─────────────────────────────────────────────────── */}
        <div className="field">
          <label className="field-label">Test Preset</label>
          <div className="preset-row">
            {PRESETS.map(p => (
              <button key={p.label} type="button"
                className={`preset-btn ${vus === p.vus && duration === p.duration ? 'active' : ''}`}
                onClick={() => applyPreset(p)} disabled={disabled || loading}>
                <span className="preset-name">{p.label}</span>
                <span className="preset-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Method + VUs + Duration ──────────────────────────────────── */}
        <div className="fields-row">
          <div className="field">
            <label className="field-label" htmlFor="method">Method</label>
            <select id="method" className="input" value={method}
              onChange={e => setMethod(e.target.value)} disabled={disabled || loading}>
              {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="vus">Virtual Users</label>
            <input id="vus" type="number" className="input" min="1" max="100"
              value={vus} onChange={e => setVus(e.target.value)} disabled={disabled || loading} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="duration">Duration</label>
            <select id="duration" className="input" value={duration}
              onChange={e => setDuration(e.target.value)} disabled={disabled || loading}>
              <option value="10s">10 seconds</option>
              <option value="30s">30 seconds</option>
              <option value="1m">1 minute</option>
              <option value="2m">2 minutes</option>
            </select>
          </div>
        </div>

        {/* ── Authentication ───────────────────────────────────────────── */}
        <div className="field">
          <label className="field-label">Authentication</label>
          <div className="auth-tabs">
            {AUTH_MODES.map(m => (
              <button key={m.id} type="button"
                className={`auth-tab ${authMode === m.id ? 'active' : ''}`}
                onClick={() => { setAuthMode(m.id); setAuthValue(''); setCustomJson(''); }}
                disabled={disabled || loading}
                title={m.desc}>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Bearer token input */}
          {authMode === 'bearer' && (
            <div className="auth-input-wrap fade-in">
              <span className="auth-prefix">Bearer</span>
              <input
                type="text" className="input auth-input"
                value={authValue} onChange={e => setAuthValue(e.target.value)}
                placeholder="YOUR_TOKEN_HERE"
                disabled={disabled || loading}
              />
            </div>
          )}

          {/* API Key input */}
          {authMode === 'apikey' && (
            <div className="auth-input-wrap fade-in">
              <span className="auth-prefix">X-API-Key</span>
              <input
                type="text" className="input auth-input"
                value={authValue} onChange={e => setAuthValue(e.target.value)}
                placeholder="YOUR_API_KEY_HERE"
                disabled={disabled || loading}
              />
            </div>
          )}

          {/* Custom JSON */}
          {authMode === 'custom' && (
            <div className="fade-in" style={{ marginTop: '0.5rem' }}>
              <textarea
                className="input textarea-mono"
                value={customJson} onChange={e => setCustomJson(e.target.value)}
                placeholder={'{"Authorization":"Bearer token","X-Custom":"value"}'}
                rows={3} disabled={disabled || loading} spellCheck={false}
              />
            </div>
          )}

          {/* Preview of what will be sent */}
          {authMode !== 'none' && (authValue.trim() || customJson.trim()) && (
            <div className="auth-preview">
              <span className="auth-preview-label">Will send:</span>
              <code className="auth-preview-code">
                {authMode === 'bearer' && `Authorization: Bearer ${authValue}`}
                {authMode === 'apikey' && `X-API-Key: ${authValue}`}
                {authMode === 'custom' && customJson}
              </code>
            </div>
          )}
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && <div className="form-error" role="alert">{error}</div>}

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <button type="submit" className="run-btn"
          disabled={disabled || loading || !urlValid}>
          {loading ? (
            <><span className="btn-spinner" /><span>Running...</span></>
          ) : (
            <span>Run Load Test</span>
          )}
        </button>
      </form>
    </div>
  );
}
