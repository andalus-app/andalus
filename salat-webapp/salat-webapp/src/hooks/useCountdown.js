import { useState, useEffect } from 'react';
import { getNextPrayer } from '../utils/prayerUtils';

export function useCountdown(prayerTimes) {
  const [state, setState] = useState({ nextPrayer: null, secondsUntil: 0, nextTime: '' });

  useEffect(() => {
    if (!prayerTimes) return;
    const tick = () => {
      const r = getNextPrayer(prayerTimes, new Date());
      if (r) setState({ nextPrayer: r.name, secondsUntil: r.secondsUntil, nextTime: r.time });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [prayerTimes]);

  return state;
}
