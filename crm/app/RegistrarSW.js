'use client';
import { useEffect } from 'react';

// Registra o service worker (app abre sem sinal). Em desenvolvimento não registra, para não cachear código velho.
export default function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
