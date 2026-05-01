import React, { useState, useEffect, useRef, useCallback } from 'react';
import BenchmarkForm from './components/BenchmarkForm';
import Dashboard from './components/Dashboard';
import ResultsHistory from './components/ResultsHistory';
import CompareView from './components/CompareView';
import ErrorBoundary from './components/ErrorBoundary';
import Toast from './components/Toast';
import './App.css';

const API_KEY = 'demo-key-12345';

export default function App() {
  const [activeTest,     setActiveTest]     = useState(null);
  const [view,           setView]           = useState('home');
  const [backendStatus,  setBackendStatus]  = useState('checking');
  const [toast,          setToast]          = useState(null); // {msg, type}
  const eventSourceRef = useRef(null);

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
          showToast('Load test completed successfully.', 'success');
        }
        if (data.status === 'failed') {
          es.close();
          showToast('Load test failed. Check worker logs.', 'error');
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
    { id: 'home',    label: 'Dashboard' },
    { id: 'history', label: 'History'   },
    { id: 'compare', label: 'Compare'   },
  ];

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">B</div>
          <span className="logo-text">BenchmarkSaaS</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ id, label }) => (
            <button key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}>
              <span className="nav-dot" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`backend-badge ${backendStatus}`}>
            <span className="badge-dot" />
            <span>
              {backendStatus === 'ok'       && 'Backend Online'}
              {backendStatus === 'down'     && 'Backend Offline'}
              {backendStatus === 'checking' && 'Checking...'}
            </span>
          </div>
          <div className="sidebar-links">
            <a href="http://localhost:3001" target="_blank" rel="noreferrer">Grafana</a>
            <a href="http://localhost:9090" target="_blank" rel="noreferrer">Prometheus</a>
            <a href="http://localhost:16686" target="_blank" rel="noreferrer">Jaeger</a>
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
