import './globals.css';
import AppProvider from './AppProvider.js';
import { Shell } from './ui.js';
import RegistrarSW from './RegistrarSW.js';

export const metadata = {
  title: 'Micro CRM',
  description: 'Registro de visitas de campo',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Micro CRM', statusBarStyle: 'default' },
  icons: { icon: '/icone-192.png', apple: '/icone-180.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#181c22' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
        <RegistrarSW />
      </body>
    </html>
  );
}
