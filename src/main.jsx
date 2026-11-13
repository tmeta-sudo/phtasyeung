import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { usePath } from './ui.jsx';
import { setupPwa } from './pwa.js';
import { applyTheme } from './theme.jsx';

applyTheme();
setupPwa();

const Admin = lazy(() => import('./App.jsx'));
const Portal = lazy(() => import('./portal/Portal.jsx'));
const Magic = lazy(() => import('./TelegramLogin.jsx').then((m) => ({ default: m.MagicLogin })));

function Root() {
  const path = usePath();
  const portal = path.match(/^\/p\/([\w-]{10,})/);
  return (
    <Suspense fallback={<div className="boot"><span className="spinner" /></div>}>
      {portal ? <Portal token={portal[1]} /> : path === '/auth/magic' ? <Magic /> : <Admin />}
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
