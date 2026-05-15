import { useState } from 'react';
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
  { id: 'none',   label: 'None',        desc: 'Public API — no auth needed' },
  { id: 'bearer', label: 'Bearer Token', desc: 'Authorization: Bearer ...' },
  { id: 'apikey', label: 'API Key',      desc: 'X-API-Key: ...' },
  { id: 'custom', label: 'Custom JSON',  desc: 'Raw header object' },
];

const TEMPLATES_KEY = 'benchmark_templates';

function validateUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

function buildHeaders(authMode, authValue, customJson) {
  if (authMode === 'bearer' && authValue.trim())
    return { Authorization: `Bearer ${authValue.trim()}` };
  if (authMode === 'apikey' && authValue.trim())
    return { 'X-API-Key': authValue.trim() };
  if (authMode === 'custom' && customJson.trim())
    return JSON.parse(customJson.trim());
  return {};
}

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch { return []; }
}
function saveTemplates(list) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
}

/* ── Chevron icon ────────────────────────────────────────────────────────── */
function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

export default function BenchmarkForm({ onTestStart, disabled }) {
  const [apiUrl,     setApiUrl]     = useState('');
  const [testName,   setTestName]   = useState('');
  const [vus,        setVus]        = useState(10);
  const [duration,   setDuration]   = useState('10s');
  const [method,     setMethod]     = useState('GET');
  const [authMode,   setAuthMode]   = useState('none');
  const [authValue,  setAuthValue]  = useState('');
  const [customJson, setCustomJson] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rampUp,       setRampUp]       = useState('');
  const [timeout,      setTimeout_]     = useState('');
  const [payload,      setPayload]      = useState('');

  // Templates
  const [templates,     setTemplates]     = useState(loadTemplates);
  const [templateName,  setTemplateName]  = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const urlValid   = apiUrl.trim() && validateUrl(apiUrl.trim());
  const urlInvalid = apiUrl.trim() && !urlValid;

  const applyPreset = ({ vus: v, duration: d }) => { setVus(v); setDuration(d); };

  // ── Apply a saved template ────────────────────────────────────────────────
  const applyTemplate = (t) => {
    setApiUrl(t.apiUrl || '');
    setTestName(t.testName || '');
    setVus(t.vus || 10);
    setDuration(t.duration || '10s');
    setMethod(t.method || 'GET');
    setAuthMode(t.authMode || 'none');
    setAuthValue(t.authValue || '');
    setCustomJson(t.customJson || '');
    setRampUp(t.rampUp || '');
    setTimeout_(t.timeout || '');
    setPayload(t.payload || '');
    setShowTemplates(false);
  };

  // ── Save current config as template ──────────────────────────────────────
  const saveTemplate = () => {
    const name = templateName.trim() || `Template ${templates.length + 1}`;
    const t = { id: Date.now(), name, apiUrl, testName, vus, duration, method, authMode, authValue, customJson, rampUp, timeout, payload };
    const updated = [...templates, t];
    setTemplates(updated);
    saveTemplates(updated);
    setTemplateName('');
  };

  // ── Delete template ───────────────────────────────────────────────────────
  const deleteTemplate = (id) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  };

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

    // Merge payload body if provided
    let body = undefined;
    if (payload.trim()) {
      try { body = JSON.parse(payload.trim()); } catch {
        setError('Payload body is not valid JSON.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-key-12345' },
        body: JSON.stringify({
          apiUrl, vus: Number(vus), duration, method,
          headers: parsedHeaders,
          ...(body ? { body } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.errors ? data.errors.map(e => e.msg).join(', ') : (data.error || 'Failed'));
        return;
      }
      onTestStart({ testId: data.testId, apiUrl, testName: testName.trim() || null, vus, duration });
    } catch {
      setError('Network error — is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-card fade-in">
      <div className="form-header">
        <div className="form-header-row">
          <div>
            <h2 className="form-title">Configure Load Test</h2>
            <p className="form-subtitle">Test any public or authenticated API endpoint</p>
          </div>
          <button
            type="button"
            className="templates-toggle"
            onClick={() => setShowTemplates(v => !v)}
            title="Saved templates"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Templates
            {templates.length > 0 && <span className="template-count">{templates.length}</span>}
          </button>
        </div>

        {/* ── Templates panel ─────────────────────────────────────────── */}
        {showTemplates && (
          <div className="templates-panel fade-in">
            {templates.length === 0 ? (
              <p className="templates-empty">No saved templates yet. Fill in the form and save below.</p>
            ) : (
              <div className="templates-list">
                {templates.map(t => (
                  <div key={t.id} className="template-row">
                    <button type="button" className="template-apply" onClick={() => applyTemplate(t)}>
                      <span className="template-name">{t.name}</span>
                      <span className="template-meta">{t.method} · {t.vus} VUs · {t.duration}</span>
                    </button>
                    <button type="button" className="template-delete" onClick={() => deleteTemplate(t.id)} title="Delete template">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="template-save-row">
              <input
                type="text"
                className="input template-name-input"
                placeholder="Template name (optional)"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
              />
              <button type="button" className="template-save-btn" onClick={saveTemplate}>
                Save current
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="form-body">

        {/* ── URL ─────────────────────────────────────────────────────── */}
        <div className="field">
          <label className="field-label" htmlFor="apiUrl">
            API Endpoint URL
            {urlValid   && <span className="url-badge valid">Valid</span>}
            {urlInvalid && <span className="url-badge invalid">Invalid</span>}
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

        {/* ── Test Name ───────────────────────────────────────────────── */}
        <div className="field">
          <label className="field-label" htmlFor="testName">
            Test Name
            <span className="optional-tag">optional</span>
          </label>
          <input
            id="testName" type="text"
            className="input"
            value={testName} onChange={e => setTestName(e.target.value)}
            placeholder="e.g. Login API stress test"
            disabled={disabled || loading} autoComplete="off"
            maxLength={60}
          />
          <span className="field-hint">Label this test for easy identification in history</span>
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
            {Number(vus) > 50 && (
              <span className="field-hint field-hint-warn">
                High VU count — target API may rate-limit or reject requests above 50 VUs.
              </span>
            )}
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

          {authMode === 'bearer' && (
            <div className="auth-input-wrap fade-in">
              <span className="auth-prefix">Bearer</span>
              <input type="text" className="input auth-input"
                value={authValue} onChange={e => setAuthValue(e.target.value)}
                placeholder="YOUR_TOKEN_HERE" disabled={disabled || loading} />
            </div>
          )}

          {authMode === 'apikey' && (
            <div className="auth-input-wrap fade-in">
              <span className="auth-prefix">X-API-Key</span>
              <input type="text" className="input auth-input"
                value={authValue} onChange={e => setAuthValue(e.target.value)}
                placeholder="YOUR_API_KEY_HERE" disabled={disabled || loading} />
            </div>
          )}

          {authMode === 'custom' && (
            <div className="fade-in" style={{ marginTop: '0.5rem' }}>
              <textarea className="input textarea-mono"
                value={customJson} onChange={e => setCustomJson(e.target.value)}
                placeholder={'{"Authorization":"Bearer token","X-Custom":"value"}'}
                rows={3} disabled={disabled || loading} spellCheck={false} />
            </div>
          )}

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

        {/* ── Advanced Settings (collapsible) ─────────────────────────── */}
        <div className="advanced-section">
          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(v => !v)}
          >
            <span>Advanced Settings</span>
            <span className="advanced-tag">optional</span>
            <ChevronIcon open={showAdvanced} />
          </button>

          {showAdvanced && (
            <div className="advanced-body fade-in">
              <div className="fields-row">
                <div className="field">
                  <label className="field-label" htmlFor="rampUp">
                    Ramp-up Time
                    <span className="optional-tag">e.g. 5s</span>
                  </label>
                  <input id="rampUp" type="text" className="input"
                    value={rampUp} onChange={e => setRampUp(e.target.value)}
                    placeholder="5s" disabled={disabled || loading} />
                  <span className="field-hint">Gradually increase VUs over this period</span>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="timeout">
                    Request Timeout
                    <span className="optional-tag">e.g. 5000</span>
                  </label>
                  <input id="timeout" type="number" className="input"
                    value={timeout} onChange={e => setTimeout_(e.target.value)}
                    placeholder="5000" min="100" max="60000" disabled={disabled || loading} />
                  <span className="field-hint">Max ms per request before timeout</span>
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="payload">
                  Request Body (JSON)
                  <span className="optional-tag">POST / PUT / PATCH</span>
                </label>
                <textarea id="payload" className="input textarea-mono"
                  value={payload} onChange={e => setPayload(e.target.value)}
                  placeholder={'{"key":"value"}'}
                  rows={3} disabled={disabled || loading} spellCheck={false} />
                <span className="field-hint">Sent as JSON body for POST/PUT/PATCH requests</span>
              </div>
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
