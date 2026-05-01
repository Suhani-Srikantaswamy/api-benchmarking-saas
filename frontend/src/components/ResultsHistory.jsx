import React, { useState, useEffect } from 'react';
import './ResultsHistory.css';

export default function ResultsHistory({ onCompare }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

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

  return (
    <div className="history-wrap fade-in">
      <div className="history-header">
        <div>
          <h2 className="history-title">Test History</h2>
          <p className="history-sub">{results.length} test{results.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <button className="refresh-btn" onClick={fetchResults} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        {results.length >= 2 && onCompare && (
          <button className="refresh-btn compare-btn" onClick={onCompare}>
            Compare
          </button>
        )}
      </div>

      {error && <div className="history-error">{error}</div>}

      {!loading && !error && results.length === 0 && (
        <div className="history-empty">
          <p>No tests recorded yet.</p>
          <p>Run your first load test from the Dashboard.</p>
        </div>
      )}

      {results.length > 0 && (
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
              {results.map((r) => (
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
