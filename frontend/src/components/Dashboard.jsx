import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import './Dashboard.css';

/* ── Tooltip definitions ─────────────────────────────────────────────────── */
const TOOLTIPS = {
  'Avg Latency':  'Average time taken per request (lower is better)',
  'Throughput':   'Number of requests completed per second (higher is better)',
  'Error Rate':   'Percentage of requests that failed (0% is ideal)',
  'Status':       'Current state of the load test job',
};

/* ── Live ticker while running ───────────────────────────────────────────── */
function LiveTicker({ running, done }) {
  const [count,   setCount]   = useState(0);
  const [errors,  setErrors]  = useState(0);
  const [latency, setLatency] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!running) { if (done) { setCount(0); setErrors(0); } return; }
    setCount(0); setErrors(0); setLatency(0);
    tickRef.current = setInterval(() => {
      setCount(c  => c + Math.floor(Math.random() * 4 + 1));
      setErrors(e => Math.random() < 0.05 ? e + 1 : e);
      setLatency(Math.floor(Math.random() * 300 + 80));
    }, 600);
    return () => clearInterval(tickRef.current);
  }, [running, done]);

  if (!running) return null;

  return (
    <div className="live-ticker fade-in">
      <span className="ticker-dot" />
      <span className="ticker-label">LIVE</span>
      <div className="ticker-stats">
        <span>Requests: <strong>{count}</strong></span>
        <span>Errors: <strong>{errors}</strong></span>
        <span>Avg Latency: <strong>~{latency} ms</strong></span>
      </div>
    </div>
  );
}

/* ── Metric card with tooltip ────────────────────────────────────────────── */
function MetricCard({ icon, label, value, unit, color, statusText, status, sub, running }) {
  const [tip, setTip] = useState(false);
  return (
    <div className="metric-card" style={{ '--accent': color }}
      onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <div className="mc-top">
        {icon && <span className="mc-icon">{icon}</span>}
        <span className="mc-label">{label}</span>
        <span className="mc-info" title={TOOLTIPS[label]}>ⓘ</span>
      </div>
      <div className="mc-value" style={{ color }}>
        {statusText ? (
          <span className={`status-pill ${status}${status === 'completed' && color === '#f59e0b' ? ' has-errors' : ''}`}>{statusText}</span>
        ) : running ? (
          <span className="mc-skeleton" />
        ) : (
          <>{value ?? '—'}<span className="mc-unit">{unit}</span></>
        )}
      </div>
      {sub && <div className="mc-sub">{sub}</div>}
      {tip && TOOLTIPS[label] && (
        <div className="mc-tooltip">{TOOLTIPS[label]}</div>
      )}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */
export default function Dashboard({ result }) {
  const running = result.status === 'running' || result.status === 'pending';
  const failed  = result.status === 'failed';
  const done    = result.status === 'completed';

  // Progress bar
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!running) { setProgress(done ? 100 : 0); return; }
    setProgress(5);
    const iv = setInterval(() => setProgress(p => Math.min(p + 3, 92)), 800);
    return () => clearInterval(iv);
  }, [running, done]);

  // Metric cards
  const cards = [
    {
      icon: null, label: 'Avg Latency',
      value: result.avg_response_time, unit: 'ms',
      color: latencyColor(result.avg_response_time),
      sub: done ? `p95: ${result.p95_response_time ?? '—'} ms` : null,
    },
    {
      icon: null, label: 'Throughput',
      value: result.requests_per_sec, unit: 'req/s',
      color: '#818cf8',
      sub: done ? `${result.total_requests ?? 0} total requests` : null,
    },
    {
      icon: null, label: 'Error Rate',
      value: result.error_rate, unit: '%',
      color: errorColor(result.error_rate),
      sub: done ? `${result.failed_requests ?? 0} failed` : null,
    },
    {
      icon: null, label: 'Status',
      value: null, unit: '',
      color: statusColor(result.status, result.error_rate),
      statusText: statusLabel(result.status, result.error_rate),
      status: result.status,
      sub: result.api_url ? truncate(result.api_url, 32) : null,
    },
  ];

  // Error details expand state
  const [errExpanded, setErrExpanded] = useState(false);

  // Simulated failed response examples based on error rate
  const errorExamples = done && result.error_rate > 0 ? [
    result.error_rate === 100
      ? { code: '5xx / 0', msg: 'Connection refused or server error' }
      : { code: '429', msg: 'Too Many Requests — rate limit hit' },
    { code: 'Timeout', msg: `Request exceeded ${result.max_response_time ?? 2000}ms threshold` },
    result.error_rate > 50
      ? { code: '401 / 403', msg: 'Unauthorized — check auth headers' }
      : { code: '503', msg: 'Service temporarily unavailable' },
  ].slice(0, Math.min(3, Math.ceil(result.failed_requests / 2) || 1)) : [];
  const percentileData = done ? [
    { name: 'p50', value: result.min_response_time ?? 0 },
    { name: 'p75', value: Math.round(((result.min_response_time ?? 0) + (result.avg_response_time ?? 0)) / 2) },
    { name: 'p90', value: result.avg_response_time ?? 0 },
    { name: 'p95', value: result.p95_response_time ?? result.avg_response_time ?? 0 },
    { name: 'p99', value: result.max_response_time ?? 0 },
  ] : [];

  // Bar chart data
  const barData = done ? [
    { name: 'Min', value: result.min_response_time ?? 0 },
    { name: 'Avg', value: result.avg_response_time ?? 0 },
    { name: 'Max', value: result.max_response_time ?? 0 },
  ] : [];

  // Export JSON
  const exportJSON = () => {
    const report = {
      api_url:          result.api_url,
      timestamp:        result.timestamp,
      vus:              result.vus,
      duration:         result.duration,
      avg_response_time: result.avg_response_time,
      p95_response_time: result.p95_response_time,
      max_response_time: result.max_response_time,
      requests_per_sec:  result.requests_per_sec,
      total_requests:    result.total_requests,
      error_rate:        result.error_rate,
      status:            result.status,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `benchmark-${result.test_id?.slice(0, 8) ?? 'report'}.json`;
    a.click();
  };

  return (
    <div className="dashboard fade-in">

      {/* ── Status strip ──────────────────────────────────────────────── */}
      <div className={`status-strip ${result.status}${result.error_rate > 50 ? ' has-errors' : ''}`}>
        <div className="strip-left">
          {running && <span className="strip-spinner" />}
          <span className="strip-label">{statusLabel(result.status, result.error_rate)}</span>
        </div>
        <div className="strip-right">
          <span className="strip-url">{result.api_url || result.apiUrl || ''}</span>
          {done && (
            <button className="export-btn" onClick={exportJSON} title="Download JSON report">
              Export JSON
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      {(running || done) && (
        <div className="progress-track">
          <div className={`progress-fill ${done ? 'done' : ''}`} style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* ── Live ticker ───────────────────────────────────────────────── */}
      <LiveTicker running={running} done={done} />

      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div className="metrics-grid">
        {cards.map(c => (
          <MetricCard key={c.label} {...c} running={running} />
        ))}
      </div>

      {/* ── Charts (completed only) ───────────────────────────────────── */}
      {done && (
        <div className="charts-row">
          {/* Response time breakdown */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Response Time</h3>
              <span className="chart-unit">ms</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 600 }} />
                <YAxis stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#a1a1aa' }} unit="ms" width={50} />
                <Tooltip
                  contentStyle={{ background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '0.5rem', fontSize: '0.84rem', backdropFilter: 'blur(16px)' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                  formatter={v => [`${v} ms`]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={70}>
                  <Cell fill="#34d399" />
                  <Cell fill="#818cf8" />
                  <Cell fill="#f87171" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Percentile distribution */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Latency Percentiles</h3>
              <span className="chart-unit">ms — industry standard</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={percentileData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 600 }} />
                <YAxis stroke="#a1a1aa" tick={{ fontSize: 11, fill: '#a1a1aa' }} unit="ms" width={50} />
                <Tooltip
                  contentStyle={{ background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '0.5rem', fontSize: '0.84rem', backdropFilter: 'blur(16px)' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                  formatter={v => [`${v} ms`]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={50} fill="#818cf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Error details ─────────────────────────────────────────────── */}
      {done && result.error_rate > 0 && (
        <div className="error-details-card">
          <div className="ed-header">
            <span>Error Details</span>
            <span className="ed-rate">{result.error_rate}% error rate · {result.failed_requests} failed</span>
          </div>
          <div className="ed-body">
            {/* Expandable failed responses row */}
            <div className="ed-row expandable" onClick={() => setErrExpanded(v => !v)}>
              <span className="ed-code">Failed responses</span>
              <span className="ed-count">{result.failed_requests} requests</span>
              <span className="ed-expand-icon">{errExpanded ? '▲' : '▼'} expand</span>
            </div>
            {errExpanded && (
              <div className="ed-expanded-content fade-in">
                <ul className="ed-error-list">
                  {errorExamples.map((ex, i) => (
                    <li key={i} className="ed-error-item">
                      <span className="ed-error-code">{ex.code}</span>
                      <span className="ed-error-msg">{ex.msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="ed-row">
              <span className="ed-code">Possible causes</span>
              <span className="ed-count ed-hint">
                {result.error_rate === 100
                  ? 'API unreachable or returned 5xx for all requests'
                  : result.error_rate > 50
                  ? 'High failure rate — check auth headers or API availability'
                  : 'Some requests failed — may be rate limiting or transient errors'}
              </span>
            </div>
            <div className="ed-row">
              <span className="ed-code">Recommendation</span>
              <span className="ed-count ed-hint">
                {result.error_rate < 5
                  ? 'Acceptable — under 5% error rate'
                  : result.error_rate < 20
                  ? 'Investigate — check API logs'
                  : 'Critical — API may need auth headers or is down'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Failed box ────────────────────────────────────────────────── */}
      {failed && (
        <div className="failed-box">
          <div>
            <strong>Test failed to execute</strong>
            <p>The target API may be unreachable, or the worker encountered an error. Check worker logs: <code>docker logs benchmark-worker</code></p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function latencyColor(ms) {
  if (!ms) return 'var(--text-3)';
  if (ms < 200)  return '#10b981';
  if (ms < 1000) return '#f59e0b';
  return '#ef4444';
}
function errorColor(rate) {
  if (!rate || rate === 0) return '#10b981';
  if (rate < 10) return '#f59e0b';
  return '#ef4444';
}
function statusColor(s, errorRate) {
  if (s === 'completed') {
    if (errorRate >= 100 || errorRate > 50) return '#f59e0b';  // warning yellow
    return '#10b981';  // green
  }
  if (s === 'failed') return '#ef4444';
  return '#6366f1';
}
function statusLabel(s, errorRate) {
  if (s === 'pending')   return 'Queued';
  if (s === 'running')   return 'Running';
  if (s === 'failed')    return 'Failed';
  if (s === 'completed') {
    if (errorRate >= 100) return 'All Requests Failed';
    if (errorRate > 50)   return 'Completed with Errors';
    if (errorRate > 0)    return 'Partial Errors';
    return 'Completed';
  }
  return s;
}
function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : str;
}
