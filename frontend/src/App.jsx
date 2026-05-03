import React, { useState, useEffect, useRef, useCallback } from 'react';
import BenchmarkForm from './components/BenchmarkForm';
import Dashboard from './components/Dashboard';
import ResultsHistory from './components/ResultsHistory';
import CompareView from './components/CompareView';
import ErrorBoundary from './components/ErrorBoundary';
import Toast from './components/Toast';
import './App.css';

const API_KEY = 'demo-key-12345';

/* ── SVG icons ───────────────────────────────────────────────────────────── */
const Icons = {
  Dashboard: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  History: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
    </svg>
  ),
  Compare: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Collapse: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  Expand: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Grafana: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  Prometheus: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Jaeger: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
      <line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>
    </svg>
  ),
};

/* ── Service health check ────────────────────────────────────────────────── */
const SERVICES = [
  { id: 'grafana',    label: 'Grafana',    url: 'http://localhost:3001', checkUrl: 'http://localhost:3001/api/health', Icon: Icons.Grafana },
  { id: 'prometheus', label: 'Prometheus', url: 'http://localhost:9090', checkUrl: 'http://localhost:9090/-/healthy',  Icon: Icons.Prometheus },
  { id: 'jaeger',     label: 'Jaeger',     url: 'http://localhost:16686', checkUrl: 'http://localhost:16686/',         Icon: Icons.Jaeger },
];

function useServiceStatus() {
  const [statuses, setStatuses] = useState({ grafana: 'checking', prometheus: 'checking', jaeger: 'checking' });

  useEffect(() => {
    const check = async () => {
      const results = await Promise.allSettled(
        SERVICES.map(s =>
          fetch(s.checkUrl, { mode: 'no-cors', signal: AbortSignal.timeout(3000) })
        )
      );
      const next = {};
      results.forEach((r, i) => {
        // no-cors fetch resolves with opaque response (type='opaque') if server is up
        // it rejects only if the server is completely unreachable
        next[SERVICES[i].id] = r.status === 'fulfilled' ? 'ok' : 'down';
      });
      setStatuses(next);
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  return statuses;
}

export default function App() {
  const [activeTest,    setActiveTest]    = useState(null);
  const [view,          setView]          = useState('home');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [toast,         setToast]         = useState(null);
  const [collapsed,     setCollapsed]     = useState(false);
  const eventSourceRef = useRef(null);
  const serviceStatuses = useServiceStatus();

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Backend health ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () =>
      fetch('/health')
        .then(r => setBackendStatus(r.ok ? 'ok' : 'down'))
        .catch(() => setBackendStatus('down'));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  // ── SSE real-time updates ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTest?.testId) return;
    if (activeTest.status === 'completed' || activeTest.status === 'failed') return;

    eventSourceRef.current?.close();
    const es = new EventSource(`/api/events/${activeTest.testId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.error) return;
        setActiveTest(prev => ({ ...prev, ...data }));
        if (data.status === 'completed') {
          es.close();
          const errRate = data.error_rate ?? 0;
          if (errRate >= 100)     showToast('All requests failed — check API availability.', 'error');
          else if (errRate > 50)  showToast(`Test completed with ${errRate}% error rate — API may need auth.`, 'error');
          else if (errRate > 5)   showToast(`Test completed — ${errRate}% error rate detected.`, 'info');
          else                    showToast('Load test completed successfully.', 'success');
        }
        if (data.status === 'failed') {
          es.close();
          showToast('Load test failed to execute. Check worker logs.', 'error');
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      const iv = setInterval(async () => {
        try {
          const r = await fetch(`/api/benchmark/${activeTest.testId}`, {
            headers: { 'X-API-Key': API_KEY },
          });
          if (r.ok) {
            const d = await r.json();
            setActiveTest(d);
            if (d.status === 'completed') {
              clearInterval(iv);
              showToast('Load test completed.', 'success');
            }
            if (d.status === 'failed') {
              clearInterval(iv);
              showToast('Load test failed.', 'error');
            }
          }
        } catch {}
      }, 2000);
    };

    return () => es.close();
  }, [activeTest?.testId, showToast]);

  const handleTestStart = (testData) => {
    setActiveTest({ ...testData, status: 'pending' });
    setView('home');
    showToast('Load test queued.', 'info');
  };

  const navItems = [
    { id: 'home',    label: 'Dashboard', Icon: Icons.Dashboard },
    { id: 'history', label: 'History',   Icon: Icons.History   },
    { id: 'compare', label: 'Compare',   Icon: Icons.Compare   },
  ];

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">B</div>
          {!collapsed && <span className="logo-text">BenchmarkSaaS</span>}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Icons.Expand /> : <Icons.Collapse />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ id, label, Icon }) => (
            <button key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
              title={collapsed ? label : undefined}>
              <span className="nav-icon"><Icon /></span>
              {!collapsed && <span className="nav-label">{label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`backend-badge ${backendStatus}`} title="API backend health">
            <span className="badge-dot" />
            {!collapsed && (
              <span>
                {backendStatus === 'ok'       && 'Backend Online'}
                {backendStatus === 'down'     && 'Backend Offline'}
                {backendStatus === 'checking' && 'Checking...'}
              </span>
            )}
          </div>

          <div className="sidebar-services">
            {SERVICES.map(({ id, label, url, Icon }) => (
              <a
                key={id}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={`service-link status-${serviceStatuses[id]}`}
                title={`${label} — ${serviceStatuses[id] === 'ok' ? 'Running' : serviceStatuses[id] === 'down' ? 'Unreachable' : 'Checking...'}`}
              >
                <span className="service-dot" />
                <span className="service-icon"><Icon /></span>
                {!collapsed && <span className="service-label">{label}</span>}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            {view === 'home'    && 'Load Test Dashboard'}
            {view === 'history' && 'Test History'}
            {view === 'compare' && 'Compare Tests'}
          </div>
          <div className="topbar-right">
            {backendStatus === 'down' && (
              <span className="topbar-alert">Backend unreachable</span>
            )}
            <span className="topbar-version">v3.0</span>
          </div>
        </header>

        <main className="page-content">
          <ErrorBoundary>
            {view === 'home' && (
              <div className="home-layout">
                <BenchmarkForm
                  onTestStart={handleTestStart}
                  disabled={backendStatus === 'down'}
                />
                {activeTest && <Dashboard result={activeTest} />}
              </div>
            )}
            {view === 'history' && <ResultsHistory onCompare={() => setView('compare')} />}
            {view === 'compare' && <CompareView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
