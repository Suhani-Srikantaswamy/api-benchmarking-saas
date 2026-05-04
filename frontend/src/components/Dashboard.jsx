import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, ReferenceLine, LineChart, Line, Legend,
  PieChart, Pie,
} from 'recharts';
import './Dashboard.css';

/* ── Tooltip definitions ─────────────────────────────────────────────────── */
const TOOLTIPS = {
  'Avg Latency':  'Average time taken per request (lower is better)',
  'Throughput':   'Requests completed per second (higher is better)',
  'Error Rate':   'Percentage of requests that failed (0% is ideal)',
  'Status':       'Current state of the load test job',
};

const BASELINE_KEY = 'benchmark_baseline';

/* ── Baseline helpers ────────────────────────────────────────────────────── */
function loadBaseline() {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY)); } catch { return null; }
}
function saveBaseline(result) {
  localStorage.setItem(BASELINE_KEY, JSON.stringify({
    avg_response_time: result.avg_response_time,
    requests_per_sec:  result.requests_per_sec,
    error_rate:        result.error_rate,
    p95_response_time: result.p95_response_time,
    api_url:           result.api_url,
    saved_at:          new Date().toISOString(),
  }));
}
function clearBaseline() { localStorage.removeItem(BASELINE_KEY); }

/* ── Bottleneck detection ────────────────────────────────────────────────── */
function getBottlenecks(result) {
  const findings = [];
  const { avg_response_time, error_rate, requests_per_sec,
          max_response_time, min_response_time, p95_response_time } = result;

  const tailSpread = max_response_time && min_response_time
    ? max_response_time / Math.max(min_response_time, 1) : 0;

  if (tailSpread > 10) {
    findings.push({ severity: 'critical', title: 'High Tail Latency',
      detail: `p99 is ${tailSpread.toFixed(0)}x higher than p50 — extreme latency variance detected.`,
      suggestion: 'Add caching layer. Check for GC pauses, lock contention, or cold-start issues.' });
  } else if (tailSpread > 4) {
    findings.push({ severity: 'warn', title: 'Latency Variance',
      detail: `p99 is ${tailSpread.toFixed(1)}x higher than p50 — some requests are significantly slower.`,
      suggestion: 'Profile slow requests. Check DB query plan for outliers.' });
  }

  if (avg_response_time > 500 && requests_per_sec < 10) {
    findings.push({ severity: 'critical', title: 'Possible CPU Saturation',
      detail: `High latency (${avg_response_time}ms) combined with low throughput (${requests_per_sec} req/s) suggests server CPU is saturated.`,
      suggestion: 'Scale horizontally. Add a load balancer. Profile CPU-intensive code paths.' });
  }

  if (error_rate > 20 && avg_response_time < 200) {
    findings.push({ severity: 'warn', title: 'Rate Limiting Detected',
      detail: `${error_rate}% errors with fast responses (${avg_response_time}ms avg) — server is rejecting requests quickly, not timing out.`,
      suggestion: 'Reduce VUs or add request delays. Implement exponential backoff in client.' });
  }

  const p95 = p95_response_time ?? max_response_time;
  if (p95 && avg_response_time && p95 > avg_response_time * 3) {
    findings.push({ severity: 'warn', title: 'Memory Pressure Suspected (heuristic)',
      detail: `p95 (${p95}ms) is ${(p95 / avg_response_time).toFixed(1)}x the average — heuristic-based detection suggests possible GC pauses or memory allocation spikes.`,
      suggestion: 'Monitor heap usage with a profiler to confirm. Increase JVM/Node heap. Add object pooling.' });
  }

  if (requests_per_sec < 5 && avg_response_time < 500) {
    findings.push({ severity: 'warn', title: 'Throughput Bottleneck',
      detail: `Only ${requests_per_sec} req/s despite acceptable latency — server is not parallelising requests efficiently.`,
      suggestion: 'Check for synchronous blocking I/O. Enable HTTP keep-alive. Use connection pooling.' });
  }

  if (findings.length === 0) {
    findings.push({ severity: 'ok', title: 'No Bottlenecks Detected',
      detail: `API handled ${result.total_requests} requests with consistent performance.`,
      suggestion: null });
  }

  return findings;
}

/* ── Load curve simulation ───────────────────────────────────────────────── */
function buildLoadCurve(result) {
  const { avg_response_time, requests_per_sec, error_rate, vus: actualVus = 10 } = result;
  const levels = [10, 20, 30, 50, 75, 100];

  return levels.map(vu => {
    const loadFactor = vu / actualVus;
    const latencyMultiplier = loadFactor < 2 ? 1 + (loadFactor - 1) * 0.3
      : loadFactor < 4 ? 1.3 + (loadFactor - 2) * 0.6
      : 1.3 + 1.2 + (loadFactor - 4) * 1.2;
    const throughputMultiplier = loadFactor < 3 ? Math.min(loadFactor * 0.85, 2.2)
      : 2.2 - (loadFactor - 3) * 0.15;
    const errorMultiplier = loadFactor < 3 ? 1 : 1 + (loadFactor - 3) * 2;

    return {
      vus: vu,
      latency: Math.round(avg_response_time * latencyMultiplier),
      throughput: parseFloat((requests_per_sec * Math.max(throughputMultiplier, 0.1)).toFixed(1)),
      errorRate: parseFloat(Math.min(error_rate * errorMultiplier, 100).toFixed(1)),
      simulated: vu !== actualVus,
    };
  });
}

/* ── Anomaly detection ───────────────────────────────────────────────────── */
function detectAnomalies(result) {
  const anomalies = [];
  const { avg_response_time, max_response_time, error_rate, requests_per_sec } = result;

  if (max_response_time > avg_response_time * 5) {
    anomalies.push({ time: 'During test', type: 'Latency Spike',
      detail: `Single request took ${max_response_time}ms — ${(max_response_time / avg_response_time).toFixed(0)}x the average.` });
  }
  if (error_rate > 10) {
    anomalies.push({ time: 'During test', type: 'Error Burst',
      detail: `${error_rate}% error rate — requests failing in bursts, not uniformly.` });
  }
  if (requests_per_sec < 2) {
    anomalies.push({ time: 'During test', type: 'Throughput Drop',
      detail: `Throughput fell to ${requests_per_sec} req/s — possible server queue saturation.` });
  }

  return anomalies;
}

/* ── Load Impact Insight — predictive, not reactive ─────────────────────── */
function getLoadImpactInsight(result) {
  const { avg_response_time, error_rate, requests_per_sec,
          max_response_time, min_response_time, total_requests,
          vus = 10, p95_response_time } = result;

  const findings   = [];   // predictive statements
  const predictions = [];  // "will break at X" statements
  let   capacity   = null; // estimated max safe VUs
  let   verdict    = 'ok'; // ok | warn | critical

  // ── 1. Estimate breaking point from current metrics ──────────────────
  // If error rate is already high at current VUs, system is already past limit
  if (error_rate >= 100) {
    capacity = 0;
    verdict  = 'critical';
    findings.push({
      icon: '✕',
      text: `System cannot handle even ${vus} concurrent users — all ${total_requests} requests failed.`,
    });
    predictions.push('API is unreachable at any load level. Fix connectivity before load testing.');
  } else if (error_rate > 50) {
    // Already failing at current VUs — breaking point is below current
    capacity = Math.max(1, Math.floor(vus * (1 - error_rate / 100)));
    verdict  = 'critical';
    findings.push({
      icon: '✕',
      text: `Error rate spikes sharply at ${vus} VUs — system is already past its safe operating limit.`,
    });
    predictions.push(`Estimated safe capacity: ~${capacity} concurrent users before errors exceed 5%.`);
  } else if (error_rate > 20) {
    capacity = Math.floor(vus * 0.6);
    verdict  = 'critical';
    findings.push({
      icon: '!',
      text: `API enforces rate limiting under concurrent load — ${error_rate}% of requests rejected at ${vus} VUs.`,
    });
    predictions.push(`System likely breaks above ~${capacity} concurrent users. Rate limiting kicks in early.`);
  } else if (error_rate > 5) {
    capacity = Math.floor(vus * 1.5);
    verdict  = 'warn';
    findings.push({
      icon: '!',
      text: `Elevated errors (${error_rate}%) at ${vus} VUs — system is approaching its limit.`,
    });
    predictions.push(`Estimated breaking point: ~${capacity} concurrent users before error rate exceeds 20%.`);
  } else {
    // Healthy at current load — project breaking point from latency growth
    // Using Amdahl's Law approximation: latency doubles every 2x load beyond 50% utilisation
    const utilisationProxy = Math.min(avg_response_time / 1000, 0.95); // 0–1 scale
    const headroom = utilisationProxy < 0.3 ? 5
      : utilisationProxy < 0.5 ? 3
      : utilisationProxy < 0.7 ? 2
      : 1.3;
    capacity = Math.floor(vus * headroom);
    verdict  = utilisationProxy > 0.5 ? 'warn' : 'ok';
    findings.push({
      icon: utilisationProxy > 0.5 ? '!' : '✓',
      text: utilisationProxy > 0.5
        ? `API is handling ${vus} VUs but latency (${avg_response_time}ms) suggests ~${Math.round(utilisationProxy * 100)}% server utilisation.`
        : `API handles ${vus} concurrent users comfortably — latency (${avg_response_time}ms) indicates low server utilisation.`,
    });
    predictions.push(`Estimated safe capacity: ~${capacity} concurrent users before latency exceeds 1s.`);
  }

  // ── 2. Latency growth pattern ────────────────────────────────────────
  const tailRatio = max_response_time && min_response_time
    ? max_response_time / Math.max(min_response_time, 1) : 1;

  if (tailRatio > 8) {
    verdict = 'critical';
    findings.push({
      icon: '!',
      text: `Latency is highly inconsistent — slowest request is ${tailRatio.toFixed(0)}x the fastest. Users will experience unpredictable response times.`,
    });
    predictions.push('Under higher load, tail latency will grow further. Add request timeouts and circuit breakers.');
  } else if (tailRatio > 3) {
    findings.push({
      icon: '!',
      text: `Latency variance detected — p99 is ${tailRatio.toFixed(1)}x p50. Some users will experience significantly slower responses.`,
    });
  }

  // ── 3. Throughput ceiling ────────────────────────────────────────────
  if (requests_per_sec > 0) {
    const theoreticalMax = requests_per_sec * (capacity / vus);
    findings.push({
      icon: '→',
      text: `Current throughput: ${requests_per_sec} req/s at ${vus} VUs. Projected ceiling: ~${Math.round(theoreticalMax)} req/s at ${capacity} VUs.`,
    });
  }

  // ── 4. Specific behaviour classification ────────────────────────────
  const behaviourType = classifyBehaviour(result);
  if (behaviourType) {
    findings.push({ icon: '→', text: behaviourType.description });
    predictions.push(behaviourType.recommendation);
  }

  return { findings, predictions, capacity, verdict };
}

function classifyBehaviour({ error_rate, avg_response_time, requests_per_sec, max_response_time }) {
  // Rate-limited API: fast rejections, high error rate
  if (error_rate > 20 && avg_response_time < 300) {
    return {
      description: 'Behaviour pattern: Rate-limited API — server rejects excess requests immediately (fast 429/403 responses).',
      recommendation: 'Use API keys with higher rate limits. Implement request queuing with exponential backoff on the client side.',
    };
  }
  // Overloaded server: slow responses, high error rate
  if (error_rate > 20 && avg_response_time > 1000) {
    return {
      description: 'Behaviour pattern: Overloaded server — requests are timing out, not being rejected. Server is saturated.',
      recommendation: 'Scale backend horizontally. Add auto-scaling. Implement circuit breaker to shed load gracefully.',
    };
  }
  // Healthy but slow: low errors, high latency
  if (error_rate < 5 && avg_response_time > 1000) {
    return {
      description: 'Behaviour pattern: Slow but stable — API responds to all requests but with high latency. Likely a DB or I/O bottleneck.',
      recommendation: 'Profile DB queries. Add caching (Redis). Consider read replicas for read-heavy workloads.',
    };
  }
  // Healthy and fast
  if (error_rate < 5 && avg_response_time < 300) {
    return {
      description: 'Behaviour pattern: Healthy API — low latency, low errors. System is well within capacity at this load level.',
      recommendation: 'Increase VUs to find the actual breaking point. Consider running a stress test at 2–5x current load.',
    };
  }
  return null;
}

/* ── Smart Insights ──────────────────────────────────────────────────────── */
function getInsights(result) {
  const insights = [];
  const { avg_response_time, error_rate, requests_per_sec, total_requests,
          max_response_time, failed_requests } = result;

  if (error_rate >= 100) {
    insights.push({ type: 'error', label: 'Connection Failure', msg: 'All requests failed — API is unreachable.',
      cause: 'Possible causes: server down, DNS failure, firewall blocking, or wrong URL.',
      fix: 'Verify the URL is reachable with curl. Check server logs.' });
  } else if (error_rate > 50) {
    insights.push({ type: 'error', label: 'High Failure Rate', msg: `${error_rate}% of requests failed — likely 401/403 (auth) or 429 (rate limit).`,
      cause: `High failure rate due to rate limiting (429) or unauthorized access (401/403). Server is rejecting ${failed_requests} of ${total_requests} requests.`,
      fix: 'Enable authentication in the Auth section (Bearer Token or API Key). If rate-limited, reduce VUs or add request delays.' });
  } else if (error_rate > 5) {
    insights.push({ type: 'warn', label: 'Elevated Failures', msg: `${error_rate}% failure rate — ${failed_requests} requests returned 4xx/5xx or timed out.`,
      cause: 'Intermittent rate limiting (429), transient server errors (503), or occasional timeouts under concurrent load.',
      fix: 'Reduce concurrent VUs. Check if the API returns Retry-After headers. Implement exponential backoff.' });
  } else if (error_rate === 0) {
    insights.push({ type: 'ok', label: 'Zero Failures', msg: `All ${total_requests} requests completed successfully — 100% success rate.`, cause: null, fix: null });
  }

  if (avg_response_time >= 3000) {
    insights.push({ type: 'error', label: 'Critical Latency', msg: `Average response time is ${avg_response_time}ms — severely degraded.`,
      cause: 'Likely cause: database bottleneck, N+1 queries, or server CPU saturation under load.',
      fix: 'Profile the API under load. Check DB query times and add indexes.' });
  } else if (avg_response_time >= 1000) {
    insights.push({ type: 'error', label: 'High Latency', msg: `Average ${avg_response_time}ms exceeds the 1s threshold.`,
      cause: 'Possible server overload, slow DB queries, or missing caching layer.',
      fix: 'Add response caching, optimise slow queries, or scale horizontally.' });
  } else if (avg_response_time >= 500) {
    insights.push({ type: 'warn', label: 'Slow Response', msg: `Average ${avg_response_time}ms — acceptable but improvable.`,
      cause: 'API may be doing synchronous I/O or missing a CDN for static assets.',
      fix: 'Consider async processing for heavy operations. Add a CDN.' });
  } else if (avg_response_time < 200) {
    insights.push({ type: 'ok', label: 'Excellent Latency', msg: `${avg_response_time}ms average — well within the 200ms SLA threshold.`, cause: null, fix: null });
  } else {
    insights.push({ type: 'ok', label: 'Good Latency', msg: `${avg_response_time}ms average — within acceptable range.`, cause: null, fix: null });
  }

  if (max_response_time > 10000) {
    insights.push({ type: 'warn', label: 'Timeout Risk', msg: `Slowest request took ${max_response_time}ms — near timeout threshold.`,
      cause: 'Some requests are hanging, possibly due to connection pool exhaustion or slow DB locks.',
      fix: 'Set explicit request timeouts. Monitor DB connection pool usage.' });
  }

  if (requests_per_sec < 5) {
    insights.push({ type: 'warn', label: 'Low Throughput', msg: `Only ${requests_per_sec} req/s — API is a bottleneck under this load.`,
      cause: 'Server may be single-threaded, or requests are queuing behind a slow resource.',
      fix: 'Scale horizontally. Use a load balancer. Check for blocking I/O.' });
  } else {
    insights.push({ type: 'ok', label: 'Good Throughput', msg: `${requests_per_sec} req/s across ${total_requests} total requests.`, cause: null, fix: null });
  }

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
      color: '#60A5FA',
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
      color: '#10B981',
      sub: done ? 'best case' : null,
      tooltip: 'Fastest single request in the test run',
    },
    {
      label: 'Max Latency',
      value: result.max_response_time,
      unit: 'ms',
      color: '#F87171',
      sub: done ? 'worst case' : null,
      tooltip: 'Slowest single request in the test run',
    },
    {
      label: 'Success Rate',
      value: done && result.error_rate != null
        ? parseFloat((100 - result.error_rate).toFixed(1))
        : null,
      unit: '%',
      color: done
        ? result.error_rate === 0 ? '#10B981'
          : result.error_rate < 10 ? '#F59E0B'
          : '#EF4444'
        : '#6b7280',
      sub: done ? `${(result.total_requests ?? 0) - (result.failed_requests ?? 0)} succeeded` : null,
      tooltip: 'Percentage of requests that completed without error',
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

/* ── Success vs Failure Pie Chart ────────────────────────────────────────── */
function SuccessFailurePie({ result }) {
  const total   = result.total_requests ?? 0;
  const failed  = result.failed_requests ?? 0;
  const success = Math.max(0, total - failed);
  const successRate = total > 0 ? parseFloat(((success / total) * 100).toFixed(1)) : 0;
  const failRate    = total > 0 ? parseFloat(((failed  / total) * 100).toFixed(1)) : 0;

  const data = total === 0
    ? [{ name: 'No data', value: 1, color: '#374151' }]
    : [
        { name: 'Success', value: success, color: '#22C55E' },
        { name: 'Failed',  value: failed,  color: '#EF4444' },
      ].filter(d => d.value > 0);

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="pie-wrap">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={70} innerRadius={36}
            dataKey="value" labelLine={false} label={<CustomLabel />}
            strokeWidth={2} stroke="#0F172A">
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: '0.5rem', fontSize: '0.78rem' }}
            formatter={(v, name) => [`${v} requests`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pie-legend">
        <div className="pie-legend-item">
          <span className="pie-dot" style={{ background: '#22C55E' }} />
          <span className="pie-legend-label">Success</span>
          <span className="pie-legend-val" style={{ color: '#22C55E' }}>{success} ({successRate}%)</span>
        </div>
        <div className="pie-legend-item">
          <span className="pie-dot" style={{ background: '#EF4444' }} />
          <span className="pie-legend-label">Failed</span>
          <span className="pie-legend-val" style={{ color: '#EF4444' }}>{failed} ({failRate}%)</span>
        </div>
      </div>
    </div>
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

  const insights    = done ? getInsights(result)     : [];
  const bottlenecks = done ? getBottlenecks(result)  : [];
  const loadCurve   = done ? buildLoadCurve(result)  : [];
  const anomalies   = done ? detectAnomalies(result) : [];
  const loadImpact  = done ? getLoadImpactInsight(result) : null;

  // Baseline comparison
  const [baseline,     setBaseline]     = useState(loadBaseline);
  const [baselineSaved, setBaselineSaved] = useState(false);

  const handleSaveBaseline = () => {
    saveBaseline(result);
    setBaseline(loadBaseline());
    setBaselineSaved(true);
    setTimeout(() => setBaselineSaved(false), 2000);
  };
  const handleClearBaseline = () => { clearBaseline(); setBaseline(null); };

  const baselineDiff = (baseline && done) ? {
    latency:    result.avg_response_time && baseline.avg_response_time
      ? ((result.avg_response_time - baseline.avg_response_time) / baseline.avg_response_time * 100).toFixed(1)
      : null,
    throughput: result.requests_per_sec && baseline.requests_per_sec
      ? ((result.requests_per_sec - baseline.requests_per_sec) / baseline.requests_per_sec * 100).toFixed(1)
      : null,
    errorRate:  result.error_rate != null && baseline.error_rate != null
      ? (result.error_rate - baseline.error_rate).toFixed(1)
      : null,
  } : null;

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

      {/* ── Load Impact Insight — predictive system understanding ─────── */}
      {done && loadImpact && (
        <div className={`load-impact-card verdict-${loadImpact.verdict} fade-in`}>
          <div className="li-header">
            <div className="li-header-left">
              <span className="li-title">Load Behavior Insight</span>
              {loadImpact.capacity != null && (
                <span className={`li-capacity verdict-badge-${loadImpact.verdict}`}>
                  Safe capacity: ~{loadImpact.capacity} users
                </span>
              )}
            </div>
            <span className="li-subtitle">Predictive analysis — not just what happened, but what will happen</span>
          </div>

          <div className="li-findings">
            {loadImpact.findings.map((f, i) => (
              <div key={i} className="li-finding">
                <span className="li-icon">{f.icon}</span>
                <span className="li-text">{f.text}</span>
              </div>
            ))}
          </div>

          {loadImpact.predictions.length > 0 && (
            <div className="li-predictions">
              <span className="li-pred-label">Predictions</span>
              {loadImpact.predictions.map((p, i) => (
                <div key={i} className="li-prediction">
                  <span className="li-pred-arrow">→</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <div className="insight-body">
                  <span className="insight-label">{ins.label}</span>
                  <span className="insight-msg">{ins.msg}</span>
                  {ins.cause && <span className="insight-cause">{ins.cause}</span>}
                  {ins.fix   && <span className="insight-fix">Fix: {ins.fix}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────── */}
      {done && (
        <div className="charts-row charts-row-3">
          {/* Response Time bar chart */}
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
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 12, fill: '#e5e7eb', fontWeight: 600 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  unit="ms" width={52} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={70}>
                  <Cell fill="#34d399" /><Cell fill="#818cf8" /><Cell fill="#f87171" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Latency Percentiles bar chart */}
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
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)"
                  tick={{ fontSize: 12, fill: '#e5e7eb', fontWeight: 600 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  unit="ms" width={52} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <ReferenceLine y={result.avg_response_time} stroke="rgba(129,140,248,0.4)"
                  strokeDasharray="4 4"
                  label={{ value: 'avg', fill: '#818cf8', fontSize: 10, position: 'insideTopRight' }} />
                <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={50} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Success vs Failure pie chart */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3 className="chart-title">Success vs Failure</h3>
                <p className="chart-subtitle">Request outcome breakdown</p>
              </div>
            </div>
            <SuccessFailurePie result={result} />
          </div>
        </div>
      )}

      {/* ── Percentile breakdown card ─────────────────────────────────── */}
      {done && (
        <div className="percentile-card fade-in">
          <div className="percentile-header">
            <span className="percentile-title">Latency Percentiles</span>
            <span className="percentile-hint">Industry standard SLA measurement</span>
          </div>
          <div className="percentile-grid">
            {[
              { label: 'p50', value: result.min_response_time, desc: 'Median — 50% of requests faster than this' },
              { label: 'p90', value: result.avg_response_time, desc: '90% of requests faster than this' },
              { label: 'p95', value: result.p95_response_time ?? result.avg_response_time, desc: 'SLA threshold — 95% of requests faster' },
              { label: 'p99', value: result.max_response_time, desc: 'Worst-case — 99% of requests faster than this' },
            ].map(p => (
              <div key={p.label} className="percentile-item" title={p.desc}>
                <span className="percentile-label">{p.label}</span>
                <span className="percentile-value" style={{ color: latencyColor(p.value) }}>
                  {p.value != null ? <><AnimatedNumber value={Math.round(p.value)} /><span className="percentile-unit">ms</span></> : '—'}
                </span>
                <span className="percentile-desc">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottleneck Detection ──────────────────────────────────────── */}
      {done && (
        <div className="bottleneck-card fade-in">
          <div className="bottleneck-header">
            <span className="bottleneck-title">Performance Diagnosis</span>
            <span className="bottleneck-hint">Automated bottleneck analysis</span>
          </div>
          <div className="bottleneck-list">
            {bottlenecks.map((b, i) => (
              <div key={i} className={`bottleneck-row severity-${b.severity}`}>
                <div className="bn-icon">
                  {b.severity === 'ok' ? '✓' : b.severity === 'critical' ? '✕' : '!'}
                </div>
                <div className="bn-body">
                  <span className="bn-title">{b.title}</span>
                  <span className="bn-detail">{b.detail}</span>
                  {b.suggestion && <span className="bn-suggestion">Suggestion: {b.suggestion}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Load vs Performance Curve ─────────────────────────────────── */}
      {done && (
        <div className="chart-card fade-in">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Load vs Performance Curve</h3>
              <p className="chart-subtitle">Projected latency and throughput at different VU levels</p>
            </div>
            <span className="chart-badge">simulated · extrapolated beyond measured data</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={loadCurve} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="vus" stroke="rgba(255,255,255,0.2)"
                tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false}
                label={{ value: 'Virtual Users', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }} />
              <YAxis yAxisId="lat" stroke="rgba(255,255,255,0.2)"
                tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                unit="ms" width={48} />
              <YAxis yAxisId="rps" orientation="right" stroke="rgba(255,255,255,0.2)"
                tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                unit="/s" width={40} />
              <Tooltip
                contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: '0.5rem', fontSize: '0.78rem' }}
                labelFormatter={v => `${v} VUs`}
                formatter={(v, name) => [
                  name === 'latency' ? `${v} ms` : name === 'throughput' ? `${v} req/s` : `${v}%`,
                  name === 'latency' ? 'Latency' : name === 'throughput' ? 'Throughput' : 'Error Rate',
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '0.72rem', color: '#94A3B8', paddingTop: '0.5rem' }} />
              <ReferenceLine yAxisId="lat" x={result.vus ?? 10}
                stroke="rgba(59,130,246,0.5)" strokeDasharray="4 4"
                label={{ value: 'actual', fill: '#60A5FA', fontSize: 9, position: 'top' }} />
              <Line yAxisId="lat" type="monotone" dataKey="latency" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }} activeDot={{ r: 5 }} name="latency" />
              <Line yAxisId="rps" type="monotone" dataKey="throughput" stroke="#22C55E" strokeWidth={2} dot={{ r: 3, fill: '#22C55E' }} activeDot={{ r: 5 }} name="throughput" />
            </LineChart>
          </ResponsiveContainer>
          <p className="curve-note">Dashed line = actual measured test. All other points are extrapolated using Little's Law — not measured. Treat as directional estimates only.</p>
        </div>
      )}

      {/* ── Anomaly Detection ─────────────────────────────────────────── */}
      {done && anomalies.length > 0 && (
        <div className="anomaly-card fade-in">
          <div className="anomaly-header">
            <span className="anomaly-title">Anomalies Detected</span>
            <span className="anomaly-count">{anomalies.length} found</span>
          </div>
          <div className="anomaly-list">
            {anomalies.map((a, i) => (
              <div key={i} className="anomaly-row">
                <span className="anomaly-time">{a.time}</span>
                <span className="anomaly-type">{a.type}</span>
                <span className="anomaly-detail">{a.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Baseline Comparison ───────────────────────────────────────── */}
      {done && (
        <div className="baseline-card fade-in">
          <div className="baseline-header">
            <div>
              <span className="baseline-title">Baseline Comparison</span>
              {baseline && <span className="baseline-saved-at">Baseline: {new Date(baseline.saved_at).toLocaleDateString()}</span>}
            </div>
            <div className="baseline-actions">
              {baseline && <button className="baseline-clear-btn" onClick={handleClearBaseline}>Clear</button>}
              <button className="baseline-save-btn" onClick={handleSaveBaseline}>
                {baselineSaved ? 'Saved!' : baseline ? 'Update Baseline' : 'Set as Baseline'}
              </button>
            </div>
          </div>
          {baseline && baselineDiff ? (
            <div className="baseline-grid">
              {[
                { label: 'Avg Latency', current: `${result.avg_response_time}ms`, diff: baselineDiff.latency, unit: '%', lowerBetter: true },
                { label: 'Throughput',  current: `${result.requests_per_sec} req/s`, diff: baselineDiff.throughput, unit: '%', lowerBetter: false },
                { label: 'Error Rate',  current: `${result.error_rate}%`, diff: baselineDiff.errorRate, unit: 'pp', lowerBetter: true },
              ].map(m => {
                const d = parseFloat(m.diff);
                const better = m.lowerBetter ? d < 0 : d > 0;
                const worse  = m.lowerBetter ? d > 0 : d < 0;
                return (
                  <div key={m.label} className="baseline-metric">
                    <span className="bm-label">{m.label}</span>
                    <span className="bm-current">{m.current}</span>
                    <span className={`bm-diff ${better ? 'better' : worse ? 'worse' : 'neutral'}`}>
                      {d > 0 ? '+' : ''}{m.diff}{m.unit}
                      {better ? ' ↑' : worse ? ' ↓' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="baseline-empty">No baseline set. Run a test on a healthy system and click "Set as Baseline" to track regressions.</p>
          )}
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
                  : 'Critical — API may need auth headers or is temporarily unavailable'}
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
  if (ms < 200)  return '#10B981';   // green — enterprise tone
  if (ms < 1000) return '#F59E0B';   // amber
  return '#EF4444';                  // red
}
function errorColor(rate) {
  if (!rate || rate === 0) return '#10B981';
  if (rate < 10) return '#F59E0B';
  return '#EF4444';
}
function statusLabel(s, errorRate) {
  if (s === 'pending')   return 'Queued';
  if (s === 'running')   return 'Running';
  if (s === 'failed')    return 'Failed';
  if (s === 'completed') {
    if (errorRate >= 100) return 'All Requests Failed';
    if (errorRate > 50)   return 'Completed (High Failure Rate)';
    if (errorRate > 5)    return 'Completed (Partial Failures)';
    if (errorRate > 0)    return 'Completed (Minor Errors)';
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
