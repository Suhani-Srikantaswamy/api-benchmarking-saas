import React, { useState, useEffect, useMemo } from 'react';
import './ResultsHistory.css';

/* ── Skeleton row ────────────────────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <tr className="skeleton-row">
      <td><span className="skel skel-url" /></td>
      <td><span className="skel skel-num" /></td>
      <td><span className="skel skel-num" /></td>
      <td><span className="skel skel-num" /></td>
      <td><span className="skel skel-num" /></td>
      <td><span className="skel skel-analysis" /></td>
      <td><span className="skel skel-badge" /></td>
      <td><span className="skel skel-time" /></td>
    </tr>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({ filtered }) {
  if (filtered) {
    return (
      <div className="history-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p className="empty-title">No results match your filter</p>
        <p className="empty-sub">Try changing the status filter or search term.</p>
      </div>
    );
  }
  return (
    <div className="history-empty history-empty-first">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      </div>
      <p className="empty-title">No tests run yet</p>
      <p className="empty-sub">Head to the Dashboard, enter an API URL and click <strong>Run Load Test</strong> to get started.</p>
      <div className="empty-steps">
        <div className="empty-step"><span className="step-num">1</span><span>Enter an API endpoint URL</span></div>
        <div className="empty-step"><span className="step-num">2</span><span>Choose VUs and duration</span></div>
        <div className="empty-step"><span className="step-num">3</span><span>View live results here</span></div>
      </div>
    </div>
  );
}

export default function ResultsHistory({ onCompare }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [sortBy,  setSortBy]  = useState('time');

  const fetchResults = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/benchmark', { headers: { 'X-API-Key': 'demo-key-12345' } });
      if (!r.ok) throw new Error('Failed');
      setResults(await r.json());
      setError('');
    } catch {
      setError('Could not load history. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResults(); }, []);

  const filtered = useMemo(() => {
    let list = [...results];
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search.trim())    list = list.filter(r =>
      r.api_url?.toLowerCase().includes(search.toLowerCase()) ||
      r.test_name?.toLowerCase().includes(search.toLowerCase())
    );
    if (sortBy === 'latency') list.sort((a, b) => (a.avg_response_time ?? 0) - (b.avg_response_time ?? 0));
    if (sortBy === 'errors')  list.sort((a, b) => (b.error_rate ?? 0) - (a.error_rate ?? 0));
    return list;
  }, [results, filter, search, sortBy]);

  return (
    <div className="history-wrap fade-in">
      <div className="history-header">
        <div>
          <h2 className="history-title">Test History</h2>
          <p className="history-sub">
            {loading ? 'Loading…' : `${filtered.length} of ${results.length} tests`}
          </p>
        </div>
        <div className="history-actions">
          <button className="refresh-btn" onClick={fetchResults} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {results.length >= 2 && onCompare && (
            <button className="refresh-btn compare-btn" onClick={onCompare}>Compare</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <input
          className="filter-search"
          type="text"
          placeholder="Search by URL or test name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {['all','completed','failed','pending'].map(f => (
            <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="time">Sort: Latest</option>
          <option value="latency">Sort: Latency</option>
          <option value="errors">Sort: Error Rate</option>
        </select>
      </div>

      {error && <div className="history-error">{error}</div>}

      {/* Skeleton loading */}
      {loading && (
        <div className="table-wrap">
          <table className="results-table" aria-label="Loading benchmark results">
            <thead>
              <tr>
                <th>API URL</th><th>Avg (ms)</th><th>Req/s</th>
                <th>Requests</th><th>Error Rate</th><th>AI Summary</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty states */}
      {!loading && !error && results.length === 0 && <EmptyState filtered={false} />}
      {!loading && !error && results.length > 0 && filtered.length === 0 && <EmptyState filtered={true} />}

      {/* Results table */}
      {!loading && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="results-table" aria-label="Benchmark results">
            <thead>
              <tr>
                <th>Test / URL</th>
                <th>Avg (ms)</th>
                <th>Req/s</th>
                <th>Requests</th>
                <th>Error Rate</th>
                <th>AI Summary</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.test_id}>
                  <td className="url-cell" title={r.api_url}>
                    {r.test_name && <span className="test-name-badge">{r.test_name}</span>}
                    {truncate(r.api_url, 38)}
                  </td>
                  <td className="num-cell">{r.avg_response_time ?? '—'}</td>
                  <td className="num-cell">{r.requests_per_sec ?? '—'}</td>
                  <td className="num-cell">{r.total_requests ?? '—'}</td>
                  <td className={`num-cell ${r.error_rate > 5 ? 'err' : 'ok'}`}>
                    {r.error_rate != null ? `${r.error_rate}%` : '—'}
                  </td>
                  <td className="analysis-cell" title={previewAnalysis(r.nl_analysis)}>
                    <span className={`analysis-pill ${r.nl_analysis ? 'has-analysis' : 'no-analysis'}`}>
                      {r.nl_analysis ? previewAnalysis(r.nl_analysis) : 'No summary'}
                    </span>
                  </td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td className="time-cell">{formatTime(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : s; }
function previewAnalysis(raw) {
  if (!raw) return 'No summary';
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return truncate(raw, 52); }
  }
  const text = data.summary || data.diagnosis || data.message || data.title || '';
  if (text) return truncate(String(text), 52);
  if (Array.isArray(data.suggestions) && data.suggestions.length) return truncate(String(data.suggestions[0]), 52);
  if (Array.isArray(data.findings) && data.findings.length) return truncate(String(data.findings[0]), 52);
  return 'AI summary available';
}
function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
