import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './CompareView.css';
import { getBackendUrl, tunnelHeaders } from '../api/client';

export default function CompareView() {
  const [tests,  setTests]  = useState([]);
  const [testA,  setTestA]  = useState('');
  const [testB,  setTestB]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/benchmark`, { headers: { 'X-API-Key': 'demo-key-12345', ...tunnelHeaders() } })
      .then(r => r.json())
      .then(data => {
        const completed = data.filter(t => t.status === 'completed');
        setTests(completed);
        if (completed.length >= 2) {
          setTestA(completed[0].test_id);
          setTestB(completed[1].test_id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const a = tests.find(t => t.test_id === testA);
  const b = tests.find(t => t.test_id === testB);

  const chartData = a && b ? [
    { metric: 'Avg Latency (ms)', A: a.avg_response_time, B: b.avg_response_time },
    { metric: 'Max Latency (ms)', A: a.max_response_time, B: b.max_response_time },
    { metric: 'Req/s',            A: a.requests_per_sec,  B: b.requests_per_sec  },
    { metric: 'Error Rate (%)',   A: a.error_rate,         B: b.error_rate        },
  ] : [];

  const winner = (valA, valB, lowerBetter = true) => {
    if (valA == null || valB == null) return null;
    if (lowerBetter) return valA < valB ? 'A' : valA > valB ? 'B' : 'tie';
    return valA > valB ? 'A' : valA < valB ? 'B' : 'tie';
  };

  const rows = a && b ? [
    { label: 'Avg Latency',  a: `${a.avg_response_time} ms`, b: `${b.avg_response_time} ms`, win: winner(a.avg_response_time, b.avg_response_time) },
    { label: 'Max Latency',  a: `${a.max_response_time} ms`, b: `${b.max_response_time} ms`, win: winner(a.max_response_time, b.max_response_time) },
    { label: 'Throughput',   a: `${a.requests_per_sec} req/s`, b: `${b.requests_per_sec} req/s`, win: winner(a.requests_per_sec, b.requests_per_sec, false) },
    { label: 'Total Reqs',   a: a.total_requests, b: b.total_requests, win: winner(a.total_requests, b.total_requests, false) },
    { label: 'Error Rate',   a: `${a.error_rate}%`, b: `${b.error_rate}%`, win: winner(a.error_rate, b.error_rate) },
  ] : [];

  if (loading) return <div className="compare-loading">Loading tests...</div>;

  if (tests.length < 2) return (
    <div className="compare-empty fade-in">
      <h3>Not enough data</h3>
      <p>Run at least 2 completed tests to compare them.</p>
    </div>
  );

  return (
    <div className="compare-wrap fade-in">
      <div className="compare-selectors">
        <div className="selector-group">
          <label className="sel-label">Test A</label>
          <select className="sel-input" value={testA} onChange={e => setTestA(e.target.value)}>
            {tests.map(t => (
              <option key={t.test_id} value={t.test_id}>
                {truncate(t.api_url, 40)} — {formatTime(t.timestamp)}
              </option>
            ))}
          </select>
        </div>
        <div className="vs-badge">VS</div>
        <div className="selector-group">
          <label className="sel-label">Test B</label>
          <select className="sel-input" value={testB} onChange={e => setTestB(e.target.value)}>
            {tests.map(t => (
              <option key={t.test_id} value={t.test_id}>
                {truncate(t.api_url, 40)} — {formatTime(t.timestamp)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {a && b && (
        <>
          {/* Comparison table */}
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="col-a">Test A</th>
                  <th className="col-b">Test B</th>
                  <th>Winner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label}>
                    <td className="metric-name">{r.label}</td>
                    <td className={`col-a ${r.win === 'A' ? 'winner' : ''}`}>{r.a}</td>
                    <td className={`col-b ${r.win === 'B' ? 'winner' : ''}`}>{r.b}</td>
                    <td>
                      {r.win === 'tie' ? <span className="win-tie">Tie</span>
                        : r.win ? <span className={`win-badge win-${r.win}`}>Test {r.win}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bar chart comparison */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Side-by-Side Comparison</h3>
              <span className="chart-unit">grouped by metric</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="metric" stroke="#a1a1aa" tick={{ fontSize: 10, fill: '#a1a1aa', fontWeight: 600 }} />
                <YAxis stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={45} />
                <Tooltip
                  contentStyle={{ background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '0.5rem', fontSize: '0.82rem', backdropFilter: 'blur(16px)' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontSize: '0.82rem', color: '#a1a1aa' }} />
                <Bar dataKey="A" name="Test A" fill="#818cf8" radius={[4,4,0,0]} maxBarSize={50} />
                <Bar dataKey="B" name="Test B" fill="#34d399" radius={[4,4,0,0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : s; }
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
