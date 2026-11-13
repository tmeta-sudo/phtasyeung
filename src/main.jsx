import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import { usePath } from './ui.jsx';
import { setupPwa } from './pwa.js';
import { applyTheme } from './theme.jsx';
import { installErrorReporting, reportError } from './errorReport.js';

applyTheme();
setupPwa();
installErrorReporting();

const Admin = lazy(() => import('./App.jsx'));
const Portal = lazy(() => import('./portal/Portal.jsx'));
const Landing = lazy(() => import('./landing/Landing.jsx'));
const Magic = lazy(() => import('./TelegramLogin.jsx').then((m) => ({ default: m.MagicLogin })));

const authHint = () => { try { return localStorage.getItem('py-authed') === '1'; } catch { return false; } };

function Root() {
  const path = usePath();
  // First-time visitors see the landing page instantly; signed-in users go straight to the app.
  if (path === '/' && !authHint()) {
    return <Suspense fallback={<div className="boot"><span className="spinner" /></div>}><LandingGate /></Suspense>;
  }
  const portal = path.match(/^\/p\/([\w-]{10,})/);
  return (
    <Suspense fallback={<div className="boot"><span className="spinner" /></div>}>
      {portal ? <Portal token={portal[1]} /> : path === '/auth/magic' ? <Magic /> : <Admin />}
    </Suspense>
  );
}

/** Shows the landing page, and switches to the app if the visitor turns out to be signed in. */
function LandingGate() {
  const [authed, setAuthed] = React.useState(false);
  React.useEffect(() => {
    fetch('/api/auth/state', { credentials: 'same-origin' }).then((r) => r.json()).then((a) => {
      if (a.authed) { try { localStorage.setItem('py-authed', '1'); } catch { /* ignore */ } setAuthed(true); }
    }).catch(() => {});
  }, []);
  return authed ? <Admin /> : <Landing />;
}

/** A crash in one screen shows a friendly message instead of a blank page, and is reported. */
class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { reportError(error, info?.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <span className="crash-icon">⚠️</span>
          <h1>មានបញ្ហាបន្តិចបន្តួច</h1>
          <p>ទំព័រនេះមិនអាចបង្ហាញបានទេ។ ទិន្នន័យរបស់អ្នកនៅសុវត្ថិភាព។ ក្រុមការងារបានទទួលដំណឹងរួចហើយ។</p>
          <button className="btn primary" onClick={() => location.reload()}>ផ្ទុកឡើងវិញ</button>
          <button className="btn ghost" onClick={() => { location.href = '/'; }}>ទៅទំព័រដើម</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(<Boundary><Root /></Boundary>);
