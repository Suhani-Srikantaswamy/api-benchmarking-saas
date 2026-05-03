import React, { useState, useEffect, useMemo } from 'react';
import './ResultsHistory.css';

export default function ResultsHistory({ onCompare }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');  // all | completed | failed | pending
  const [sortBy,  setSortBy]  = useState('time'); // time | latency | errors

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
    if (search.trim())    list = list.filter(r => r.api_url?.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === 'latency') list.sort((a, b) => (a.avg_response_time ?? 0) - (b.avg_response_time ?? 0));
    if (sortBy === 'errors')  list.sort((a, b) => (b.error_rate ?? 0) - (a.error_rate ?? 0));
    return list;
  }, [results, filter, search, sortBy]);

  return (
    <div className="history-wrap fade-in">
      <div className="history-header">
        <div>
          <h2 className="history-title">Test History</h2>
          <p className="history-sub">{filtered.length} of {results.length} tests</p>
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
          placeholder="Search by URL..."
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

      {!loading && !error && results.length === 0 && (
        <div className="history-empty">
          <p className="empty-title">No tests recorded yet</p>
          <p className="empty-sub">Run your first load test from the Dashboard.</p>
        </div>
      )}

      {!loading && !error && results.length > 0 && filtered.length === 0 && (
        <div className="history-empty">
          <p className="empty-title">No results match your filter</p>
          <p className="empty-sub">Try changing the status filter or search term.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="results-table" aria-label="Benchmark results">
            <thead>
              <tr>
                <th>API URL</th>
                <th>Avg (ms)</th>
                <th>Req/s</th>
                <th>Requests</th>
                <th>Error Rate</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.test_id}>
                  <td className="url-cell" title={r.api_url}>{truncate(r.api_url, 42)}</td>
                  <td className="num-cell">{r.avg_response_time ?? '—'}</td>
                  <td className="num-cell">{r.requests_per_sec ?? '—'}</td>
                  <td className="num-cell">{r.total_requests ?? '—'}</td>
                  <td className={`num-cell ${r.error_rate > 5 ? 'err' : 'ok'}`}>
                    {r.error_rate != null ? `${r.error_rate}%` : '—'}
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
function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
