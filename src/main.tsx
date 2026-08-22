import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { PermissionProvider } from '@/lib/permissions';
import { OrgProvider } from '@/lib/org';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <OrgProvider>
          <PermissionProvider>
            <App />
          </PermissionProvider>
        </OrgProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
