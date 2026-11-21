import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Scrolls to #id after navigation (used when a notification is clicked).
export function useHashScroll(ready: boolean) {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [ready, hash, key]);
}
