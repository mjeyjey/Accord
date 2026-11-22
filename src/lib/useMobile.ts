import { useEffect, useState } from 'react';

export const useMobile = (max = 600) => {
  const q = `(max-width:${max}px)`;
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
};