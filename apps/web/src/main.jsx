import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Package,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Truck,
  Check,
  Clock3,
  Search,
  ShieldCheck,
  X,
  Plus,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import './style.css';

const labels = {
  created: 'Label created',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delayed: 'Delayed',
};
const transitions = {
  created: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['out_for_delivery', 'delayed'],
  out_for_delivery: ['delivered', 'delayed'],
  delayed: ['in_transit'],
  delivered: [],
};
const demoId = 'PF-A1B2C3D4E5F60708';
const date = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
async function api(path, { token, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const content = await response
    .json()
    .catch(() => ({ error: 'The service is temporarily unavailable' }));
  if (!response.ok) throw new Error(content.error || 'Request failed');
  return content;
}
function Badge({ status }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {labels[status]}
    </span>
  );
}
function App() {
  const [view, setView] = useState('track');
  const [tracking, setTracking] = useState('');
  const [shipment, setShipment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [rows, setRows] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [operatorError, setOperatorError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  async function track(id = tracking) {
    const normalized = id.trim().toUpperCase();
    if (!/^PF-[A-F0-9]{16}$/.test(normalized)) {
      setError('Enter a tracking number in the format PF-A1B2C3D4E5F60708.');
      return;
    }
    setBusy(true);
    setError('');
    setShipment(null);
    setTracking(normalized);
    try {
      setShipment(await api(`/shipments/${normalized}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadRows(auth = token) {
    const data = await api('/shipments', { token: auth });
    setRows(data.shipments);
  }
  async function login(e) {
    e.preventDefault();
    setSaveBusy(true);
    setOperatorError('');
    try {
      await loadRows(tokenDraft);
      setToken(tokenDraft);
      setTokenDraft('');
    } catch (e) {
      setOperatorError(e.message);
    } finally {
      setSaveBusy(false);
    }
  }
  async function create(e) {
    e.preventDefault();
    setSaveBusy(true);
    setOperatorError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api('/shipments', { token, method: 'POST', body: JSON.stringify(body) });
      await loadRows();
      setCreateOpen(false);
      setShipment(result);
      setTracking(result.trackingNumber);
    } catch (e) {
      setOperatorError(e.message);
    } finally {
      setSaveBusy(false);
    }
  }
  async function update(e) {
    e.preventDefault();
    setSaveBusy(true);
    setOperatorError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api(`/shipments/${shipment.trackingNumber}/events`, {
        token,
        method: 'POST',
        body: JSON.stringify({ ...data, expectedVersion: shipment.version }),
      });
      setShipment(result);
      await loadRows();
    } catch (e) {
      setOperatorError(e.message);
      await track(shipment.trackingNumber);
    } finally {
      setSaveBusy(false);
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setView('track');
          }}
        >
          <span className="brand-mark">
            <Package size={25} />
          </span>
          ParcelFlow<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR DELIVERY WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === 'track' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('track')}
          >
            <Search size={19} />
            Track a parcel
            <ArrowUpRight size={16} />
          </button>
          <button
            className={view === 'operations' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('operations')}
          >
            <Package size={19} />
            Operations<span className="nav-small">OPS</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <ShieldCheck size={23} />
          </div>
          <strong>A little more visibility.</strong>
          <p>
            Every scan tells a story.
            <br />
            Follow yours, all the way home.
          </p>
          <span>From first mile to last.</span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">PF</span>
          <div>
            <strong>Demo workspace</strong>
            <small>Synthetic demo shipments</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            <strong>{view === 'track' ? 'Tracking' : 'Operations'}</strong>
          </div>
          <span className="demo-pill">
            <span />
            Demo environment
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">DELIVERY, WITHOUT THE GUESSWORK</div>
              <h1>{view === 'track' ? 'Every step, in view.' : 'Keep things moving.'}</h1>
              <p>
                {view === 'track'
                  ? 'A clear picture of where your parcel is, and how it got there.'
                  : 'Create shipments, record scans and follow your delivery activity.'}
              </p>
            </div>
            <span className="heading-icon">
              <Package size={34} strokeWidth={1.4} />
            </span>
          </div>
          {view === 'track' ? (
            <>
              <section className="search-card" aria-labelledby="track-title">
                <div className="search-copy">
                  <span className="section-kicker">LET’S FIND YOUR PARCEL</span>
                  <h2 id="track-title">
                    One number.
                    <br />
                    The whole journey.
                  </h2>
                  <p>Enter your tracking number to see the latest scan and delivery history.</p>
                </div>
                <div className="search-area">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      track();
                    }}
                  >
                    <label htmlFor="tracking">Tracking number</label>
                    <div className="tracking-input">
                      <Package size={21} />
                      <input
                        id="tracking"
                        placeholder="e.g. PF-A1B2C3D4E5F60708"
                        value={tracking}
                        onChange={(e) => setTracking(e.target.value)}
                        autoComplete="off"
                        maxLength={19}
                      />
                      <button className="primary" disabled={busy}>
                        {busy ? 'Finding…' : 'Track parcel'}
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </form>
                  <div className="try-demo">
                    Just exploring?{' '}
                    <button onClick={() => track(demoId)} disabled={busy}>
                      Try a sample shipment <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              </section>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              {!shipment && !busy && (
                <section className="intro-grid">
                  <article>
                    <span className="feature-icon">
                      <MapPin size={22} />
                    </span>
                    <h3>Know where it stands</h3>
                    <p>See the most recent shipment status and the location of its latest scan.</p>
                  </article>
                  <article>
                    <span className="feature-icon">
                      <Clock3 size={22} />
                    </span>
                    <h3>See the full journey</h3>
                    <p>
                      A chronological timeline connects every milestone, from pickup to delivery.
                    </p>
                  </article>
                  <article>
                    <span className="feature-icon">
                      <ShieldCheck size={22} />
                    </span>
                    <h3>Only what you need</h3>
                    <p>
                      Tracking shows city-level updates. Private operator references stay private.
                    </p>
                  </article>
                </section>
              )}
            </>
          ) : !token ? (
            <section className="login-card">
              <span className="feature-icon">
                <ShieldCheck size={25} />
              </span>
              <h2>Operator access</h2>
              <p>
                Use your operator token to create shipments and record new scans. Your token stays
                in memory for this session.
              </p>
              <form onSubmit={login}>
                <label htmlFor="operator-token">Operator token</label>
                <input
                  id="operator-token"
                  type="password"
                  autoComplete="off"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  required
                />
                <button className="primary" disabled={saveBusy}>
                  {saveBusy ? 'Checking…' : 'Open operations'}
                  <ArrowRight size={17} />
                </button>
              </form>
            </section>
          ) : (
            <>
              <section className="stats">
                <div>
                  <span>Recent shipments</span>
                  <strong>{rows.length}</strong>
                  <small>Showing up to 100</small>
                </div>
                <div>
                  <span>On the move</span>
                  <strong>
                    {
                      rows.filter((r) =>
                        ['picked_up', 'in_transit', 'out_for_delivery'].includes(r.status),
                      ).length
                    }
                  </strong>
                  <small>In the delivery network</small>
                </div>
                <div>
                  <span>Delivered</span>
                  <strong>{rows.filter((r) => r.status === 'delivered').length}</strong>
                  <small>Journey complete</small>
                </div>
                <div>
                  <span>Needs attention</span>
                  <strong>{rows.filter((r) => r.status === 'delayed').length}</strong>
                  <small>Delayed shipments</small>
                </div>
              </section>
              <section className="shipments-card">
                <div className="section-header">
                  <div>
                    <h2>Recent shipments</h2>
                    <p>Select a parcel to view its history or add a scan.</p>
                  </div>
                  <div className="toolbar">
                    <button
                      className="icon-button"
                      aria-label="Refresh shipments"
                      onClick={async () => {
                        try {
                          await loadRows();
                          setOperatorError('');
                        } catch (e) {
                          setOperatorError(e.message);
                        }
                      }}
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setToken('');
                        setRows([]);
                        setShipment(null);
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                    <button className="primary" onClick={() => setCreateOpen(true)}>
                      <Plus size={17} />
                      New shipment
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tracking number</th>
                        <th>Route</th>
                        <th>Service</th>
                        <th>Status</th>
                        <th aria-label="Open" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.trackingNumber}>
                          <td>
                            <button className="table-link" onClick={() => track(r.trackingNumber)}>
                              {r.trackingNumber}
                            </button>
                            <small>{date(r.createdAt)}</small>
                          </td>
                          <td>
                            {r.origin}
                            <span className="route-arrow">→</span>
                            {r.destination}
                          </td>
                          <td className="service">{r.service}</td>
                          <td>
                            <Badge status={r.status} />
                          </td>
                          <td>
                            <button
                              aria-label={`View ${r.trackingNumber}`}
                              className="icon-button"
                              onClick={() => track(r.trackingNumber)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && (
                    <p className="empty">No shipments yet. Create your first one.</p>
                  )}
                </div>
              </section>
            </>
          )}
          {operatorError && view === 'operations' && (
            <div role="alert" className="error">
              {operatorError}
            </div>
          )}
          {error && view === 'operations' && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {busy && (
            <div className="loading" role="status">
              Finding your parcel…
            </div>
          )}
          {shipment && (
            <section className="detail-grid" aria-label="Shipment details">
              <article className="journey-card">
                <div className="section-header">
                  <div>
                    <span className="section-kicker">SHIPMENT OVERVIEW</span>
                    <h2 className="tracking-title">{shipment.trackingNumber}</h2>
                  </div>
                  <Badge status={shipment.status} />
                </div>
                <div className="route">
                  <div>
                    <span className="route-node" />
                    <small>FROM</small>
                    <strong>{shipment.origin}</strong>
                  </div>
                  <div className="route-line">
                    <Truck size={24} />
                  </div>
                  <div>
                    <span className="route-node destination" />
                    <small>TO</small>
                    <strong>{shipment.destination}</strong>
                  </div>
                </div>
                <div className="shipment-meta">
                  <div>
                    <small>Service</small>
                    <strong className="service">{shipment.service} delivery</strong>
                  </div>
                  <div>
                    <small>Last updated</small>
                    <strong>{date(shipment.updatedAt)}</strong>
                  </div>
                  <div>
                    <small>Recorded scans</small>
                    <strong>
                      {shipment.events.length}{' '}
                      {shipment.events.length === 1 ? 'milestone' : 'milestones'}
                    </strong>
                  </div>
                </div>
                <div className="journey-note">
                  <ShieldCheck size={19} />
                  <p>
                    Updates reflect recorded scans. A new scan appears after you refresh tracking.
                  </p>
                </div>
                {view === 'operations' && token && transitions[shipment.status].length > 0 && (
                  <form
                    className="scan-form"
                    onSubmit={update}
                    key={`${shipment.trackingNumber}-${shipment.version}`}
                  >
                    <h3>Record a new scan</h3>
                    <label htmlFor="scan-status">Next status</label>
                    <select id="scan-status" name="status">
                      {transitions[shipment.status].map((s) => (
                        <option key={s} value={s}>
                          {labels[s]}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="scan-location">Scan city</label>
                    <input
                      id="scan-location"
                      name="location"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={
                        shipment.status === 'created' ? shipment.origin : shipment.destination
                      }
                    />
                    <button className="primary" disabled={saveBusy}>
                      Save scan
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </article>
              <article className="timeline-card">
                <div className="timeline-header">
                  <h2>The journey so far</h2>
                  <span>
                    {shipment.events.length} {shipment.events.length === 1 ? 'update' : 'updates'}
                  </span>
                </div>
                <ol className="timeline">
                  {[...shipment.events].reverse().map((event, i) => (
                    <li key={event.version} className={i === 0 ? 'latest' : ''}>
                      <span className="timeline-dot">
                        {i === 0 ? <Truck size={15} /> : <Check size={13} />}
                      </span>
                      <div>
                        <strong>{labels[event.status]}</strong>
                        <span>
                          <MapPin size={12} />
                          {event.location}
                        </span>
                        <time>{date(event.createdAt)}</time>
                      </div>
                      {i === 0 && <span className="latest-label">LATEST</span>}
                    </li>
                  ))}
                </ol>
              </article>
            </section>
          )}
          <footer>
            <span>Thoughtfully tracked. Simply delivered.</span>
            <span>
              ParcelFlow <span className="footer-dot">•</span> Demo data · no live carrier
              connection
            </span>
          </footer>
        </main>
      </div>
      {createOpen && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="section-header">
              <h2 id="create-title">Create a shipment</h2>
              <button
                className="icon-button"
                aria-label="Close new shipment"
                onClick={() => setCreateOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>Use synthetic city-level data for this demo.</p>
            <form onSubmit={create}>
              <label htmlFor="origin">Origin city</label>
              <input id="origin" name="origin" required minLength={2} maxLength={80} autoFocus />
              <label htmlFor="destination">Destination city</label>
              <input id="destination" name="destination" required minLength={2} maxLength={80} />
              <label htmlFor="service">Delivery service</label>
              <select id="service" name="service">
                <option value="standard">Standard</option>
                <option value="express">Express</option>
              </select>
              <label htmlFor="reference">Internal reference (optional)</label>
              <input id="reference" name="reference" maxLength={80} />
              {operatorError && (
                <p className="error" role="alert">
                  {operatorError}
                </p>
              )}
              <button className="primary" disabled={saveBusy}>
                {saveBusy ? 'Creating…' : 'Create shipment'}
                <Plus size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
