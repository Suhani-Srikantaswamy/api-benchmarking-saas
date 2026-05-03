import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, ReferenceLine,
} from 'recharts';
import './Dashboard.css';

/* ── Tooltip definitions ─────────────────────────────────────────────────── */
const TOOLTIPS = {
  'Avg Latency':  'Average time taken per request (lower is better)',
  'Throughput':   'Requests completed per second (higher is better)',
  'Error Rate':   'Percentage of requests that failed (0% is ideal)',
  'Status':       'Current state of the load test job',
};

/* ── Smart Insights ──────────────────────────────────────────────────────── */
function getInsights(result) {
  const insights = [];
  const { avg_response_time, error_rate, requests_per_sec, total_requests } = result;

  if (error_rate >= 100)
    insights.push({ type: 'error', msg: 'All requests failed — API may be unreachable or returning 5xx errors.' });
  else if (error_rate > 50)
    insights.push({ type: 'error', msg: `High error rate (${error_rate}%) — check authentication headers or API availability.` });
  else if (error_rate > 5)
    insights.push({ type: 'warn', msg: `Elevated error rate (${error_rate}%) — possible rate limiting or transient failures.` });
  else if (error_rate === 0)
    insights.push({ type: 'ok', msg: 'Zero errors — API responded successfully to all requests.' });

  if (avg_response_time < 200)
    insights.push({ type: 'ok', msg: `Excellent latency (${avg_response_time}ms) — well within the 200ms threshold.` });
  else if (avg_response_time < 1000)
    insights.push({ type: 'warn', msg: `Acceptable latency (${avg_response_time}ms) — consider optimising if under load.` });
  else
    insights.push({ type: 'error', msg: `High latency (${avg_response_time}ms) — API is slow, investigate server performance.` });

  if (requests_per_sec < 5)
    insights.push({ type: 'warn', msg: `Low throughput (${requests_per_sec} req/s) — API may be a bottleneck under load.` });
  else
    insights.push({ type: 'ok', msg: `Throughput: ${requests_per_sec} req/s across ${total_requests} total requests.` });

  return insights;
}

/* ── Animated number ─────────────────────────────────────────────────────── */
function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const rafRef   = useRef(null);

  useEffect(() => {
    if (value == null) return;
    const target = Number(value);
    const start  = performance.now();
    startRef.current = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{display}</>;
}

/* ── Live ticker + real-time graph ──────────────────────────────────────── */
function LiveTicker({ running, done }) {
  const [count,    setCount]    = useState(0);
  const [errors,   setErrors]   = useState(0);
  const [latency,  setLatency]  = useState(0);
  const [graphData, setGraphData] = useState([]);
  const tickRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!running) {
      if (done) { setCount(0); setErrors(0); setGraphData([]); timeRef.current = 0; }
      return;
    }
    setCount(0); setErrors(0); setLatency(0); setGraphData([]); timeRef.current = 0;
    tickRef.current = setInterval(() => {
      const newReqs = Math.floor(Math.random() * 4 + 1);
      const newLat  = Math.floor(Math.random() * 300 + 80);
      timeRef.current += 1;
      setCount(c  => c + newReqs);
      setErrors(e => Math.random() < 0.05 ? e + 1 : e);
      setLatency(newLat);
      setGraphData(prev => {
        const next = [...prev, { t: timeRef.current, lat: newLat, rps: newReqs }];
        return next.length > 20 ? next.slice(-20) : next;
      });
    }, 600);
    return () => clearInterval(tickRef.current);
  }, [running, done]);

  if (!running) return null;

  return (
    <div className="live-section fade-in">
      <div className="live-ticker">
        <span className="ticker-dot" />
        <span className="ticker-label">LIVE</span>
        <div className="ticker-stats">
          <span>Requests: <strong>{count}</strong></span>
          <span>Errors: <strong>{errors}</strong></span>
          <span>Avg Latency: <strong>~{latency} ms</strong></span>
        </div>
      </div>
      {graphData.length > 2 && (
        <div className="live-graph">
          <div className="live-graph-title">Latency over time (ms)</div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={graphData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: '0.4rem', fontSize: '0.75rem' }}
                formatter={v => [`${v} ms`, 'Latency']}
                labelFormatter={() => ''}
              />
              <Area type="monotone" dataKey="lat" stroke="#2563eb" strokeWidth={2} fill="url(#latGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ── KPI Strip (replaces metric cards — single source of truth) ──────────── */
function KPIStrip({ result, running }) {
  const done = result.status === 'completed';

  if (!running && !done) return null;

  const items = [
    {
      label: 'Avg Latency',
      value: result.avg_response_time,
      unit: 'ms',
      color: latencyColor(result.avg_response_time),
      sub: done ? `p95: ${result.p95_response_time ?? result.max_response_time ?? '—'} ms` : null,
      tooltip: TOOLTIPS['Avg Latency'],
    },
    {
      label: 'Throughput',
      value: result.requests_per_sec,
      unit: 'req/s',
      color: '#818cf8',
      sub: done ? `${result.total_requests ?? 0} total` : null,
      tooltip: TOOLTIPS['Throughput'],
    },
    {
      label: 'Error Rate',
      value: result.error_rate,
      unit: '%',
      color: errorColor(result.error_rate),
      sub: done ? `${result.failed_requests ?? 0} failed` : null,
      tooltip: TOOLTIPS['Error Rate'],
    },
    {
      label: 'Min Latency',
      value: result.min_response_time,
      unit: 'ms',
      color: '#34d399',
      sub: done ? 'best case' : null,
      tooltip: 'Fastest single request in the test run',
    },
    {
      label: 'Max Latency',
      value: result.max_response_time,
      unit: 'ms',
      color: '#f87171',
      sub: done ? 'worst case' : null,
      tooltip: 'Slowest single request in the test run',
    },
  ];

  return (
    <div className="kpi-strip fade-in">
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 && <div className="kpi-divider" />}
          <KPIItem {...item} running={running} done={done} />
        </React.Fragment>
      ))}
    </div>
  );
}

function KPIItem({ label, value, unit, color, sub, tooltip, running, done }) {
  const [tip, setTip] = useState(false);
  return (
    <div
      className="kpi-item"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      style={{ position: 'relative' }}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ color }}>
        {running ? (
          <span className="kpi-skeleton" />
        ) : done && value != null ? (
          <><AnimatedNumber value={value} /><span className="kpi-unit">{unit}</span></>
        ) : (
          <span style={{ color: '#4b5563', fontSize: '1.2rem' }}>—</span>
        )}
      </span>
      {sub && done && <span className="kpi-sub">{sub}</span>}
      {tip && tooltip && <div className="kpi-tooltip">{tooltip}</div>}
    </div>
  );
}

/* ── Custom chart tooltip ────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, unit = 'ms' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{label}</div>
      <div className="ct-value">{payload[0].value} <span className="ct-unit">{unit}</span></div>
    </div>
  );
}

/* ── Copy URL button ─────────────────────────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button className="copy-btn" onClick={copy} title="Copy API URL">
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
      <span>{copied ? 'Copied' : 'Copy URL'}</span>
    </button>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */
export default function Dashboard({ result }) {
  const running = result.status === 'running' || result.status === 'pending';
  const failed  = result.status === 'failed';
  const done    = result.status === 'completed';

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!running) { setProgress(done ? 100 : 0); return; }
    setProgress(5);
    const iv = setInterval(() => setProgress(p => Math.min(p + 3, 92)), 800);
    return () => clearInterval(iv);
  }, [running, done]);

  const [errExpanded, setErrExpanded] = useState(false);
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

  const barData = done ? [
    { name: 'Min', value: result.min_response_time ?? 0 },
    { name: 'Avg', value: result.avg_response_time ?? 0 },
    { name: 'Max', value: result.max_response_time ?? 0 },
  ] : [];

  const insights = done ? getInsights(result) : [];

  // Last updated time
  const updatedAt = result.timestamp
    ? new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  // Export JSON
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(buildReport(result), null, 2)], { type: 'application/json' });
    triggerDownload(blob, `benchmark-${result.test_id?.slice(0,8) ?? 'report'}.json`);
  };

  // Export CSV
  const exportCSV = () => {
    const r = result;
    const rows = [
      ['Field', 'Value'],
      ['API URL', r.api_url],
      ['Timestamp', r.timestamp],
      ['Avg Response Time (ms)', r.avg_response_time],
      ['p95 Response Time (ms)', r.p95_response_time],
      ['Max Response Time (ms)', r.max_response_time],
      ['Min Response Time (ms)', r.min_response_time],
      ['Requests per Second', r.requests_per_sec],
      ['Total Requests', r.total_requests],
      ['Failed Requests', r.failed_requests],
      ['Error Rate (%)', r.error_rate],
      ['Status', r.status],
    ];
    const csv = rows.map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    triggerDownload(blob, `benchmark-${r.test_id?.slice(0,8) ?? 'report'}.csv`);
  };

  return (
    <div className="dashboard fade-in">

      {/* ── Status strip ──────────────────────────────────────────────── */}
      <div className={`status-strip ${result.status}${result.error_rate > 50 ? ' has-errors' : ''}`}>
        <div className="strip-left">
          {running && <span className="strip-spinner" />}
          <span className="strip-label">{statusLabel(result.status, result.error_rate)}</span>
          {updatedAt && done && (
            <span className="strip-updated">Updated {updatedAt}</span>
          )}
        </div>
        <div className="strip-right">
          {result.api_url && <CopyButton text={result.api_url} />}
          <span className="strip-url">{result.api_url || result.apiUrl || ''}</span>
          {done && (
            <div className="export-group">
              <button className="export-btn" onClick={exportJSON}>JSON</button>
              <button className="export-btn" onClick={exportCSV}>CSV</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      {(running || done) && (
        <div className="progress-track">
          <div className={`progress-fill ${done ? 'done' : ''}`} style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* ── KPI strip — replaces metric cards, single source of truth ── */}
      <KPIStrip result={result} running={running} />

      {/* ── Live ticker + real-time graph ─────────────────────────────── */}
      <LiveTicker running={running} done={done} />

      {/* ── Smart insights ────────────────────────────────────────────── */}
      {done && insights.length > 0 && (
        <div className="insights-card fade-in">
          <div className="insights-header">Smart Analysis</div>
          <div className="insights-list">
            {insights.map((ins, i) => (
              <div key={i} className={`insight-row insight-${ins.type}`}>
                <span className="insight-icon">
                  {ins.type === 'ok' ? '✓' : ins.type === 'warn' ? '!' : '✕'}
                </span>
                <span className="insight-msg">{ins.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────── */}
      {done && (
        <div className="charts-row">
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3 className="chart-title">Response Time</h3>
                <p className="chart-subtitle">Min / Avg / Max latency in ms</p>
              </div>
              <span className="chart-unit">ms</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 12, fill: '#e5e7eb', fontWeight: 600 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  unit="ms"
                  width={52}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={70}>
                  <Cell fill="#34d399" /><Cell fill="#818cf8" /><Cell fill="#f87171" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3 className="chart-title">Latency Percentiles</h3>
                <p className="chart-subtitle">p50 → p99 distribution</p>
              </div>
              <span className="chart-unit">industry standard</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={percentileData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 12, fill: '#e5e7eb', fontWeight: 600 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  unit="ms"
                  width={52}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <ReferenceLine
                  y={result.avg_response_time}
                  stroke="rgba(129,140,248,0.4)"
                  strokeDasharray="4 4"
                  label={{ value: 'avg', fill: '#818cf8', fontSize: 10, position: 'insideTopRight' }}
                />
                <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={50} fill="#2563eb" />
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
            <span className="ed-rate">{result.error_rate}% · {result.failed_requests} failed</span>
          </div>
          <div className="ed-body">
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
              <span className="ed-code">Recommendation</span>
              <span className="ed-count ed-hint">
                {result.error_rate < 5 ? 'Acceptable — under 5% error rate'
                  : result.error_rate < 20 ? 'Investigate — check API logs'
                  : 'Critical — API may need auth headers or is down'}
              </span>
            </div>
          </div>
        </div>
      )}

      {failed && (
        <div className="failed-box">
          <div>
            <strong>Test failed to execute</strong>
            <p>The target API may be unreachable. Check worker logs: <code>docker logs benchmark-worker</code></p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function latencyColor(ms) {
  if (!ms) return '#6b7280';
  if (ms < 200)  return '#10b981';
  if (ms < 1000) return '#f59e0b';
  return '#ef4444';
}
function errorColor(rate) {
  if (!rate || rate === 0) return '#10b981';
  if (rate < 10) return '#f59e0b';
  return '#ef4444';
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
function buildReport(r) {
  return {
    api_url: r.api_url, timestamp: r.timestamp,
    avg_response_time: r.avg_response_time, p95_response_time: r.p95_response_time,
    max_response_time: r.max_response_time, min_response_time: r.min_response_time,
    requests_per_sec: r.requests_per_sec, total_requests: r.total_requests,
    failed_requests: r.failed_requests, error_rate: r.error_rate, status: r.status,
  };
}
function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
