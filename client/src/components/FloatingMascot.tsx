import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import DoctorCode from './DoctorCode';

const SWAP_MS = 5000;
const ROAMED_KEY = 'dr_code_mascot_roamed';

function hasRoamed(): boolean {
  try {
    return sessionStorage.getItem(ROAMED_KEY) === '1';
  } catch {
    return false;
  }
}

function markRoamed(): void {
  try {
    sessionStorage.setItem(ROAMED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default function FloatingMascot() {
  const { t } = useLang();
  const phrases = [t('mascot.p1'), t('mascot.p2'), t('mascot.p3'), t('mascot.p4'), t('mascot.p5'), t('mascot.p6'), t('mascot.p7'), t('mascot.p8'), t('mascot.p9'), t('mascot.p10'), t('mascot.p11'), t('mascot.p12')];
  // الافتار يلف في الموقع مرة واحدة فقط في الجلسة: بعد أول مرة (حتى مع إعادة التحميل)
  // لا يعود للتحرك مرة أخرى حتى تُغلق الجلسة.
  const [started] = useState(() => !hasRoamed());
  const [left, setLeft] = useState(false);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * phrases.length));

  useEffect(() => {
    if (!started) return;
    markRoamed();
    const id = setInterval(() => setIdx((p) => (p + 1) % phrases.length), SWAP_MS);
    return () => clearInterval(id);
  }, [started, phrases.length]);

  if (!started || left) return null;

  const phrase = phrases[idx] ?? phrases[0];

  return (
    <div className="fm" aria-hidden="true">
      <div
        className="fm-roamer fm-roam-once"
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.animationName === 'fmRoamRest') setLeft(true);
        }}
      >
        <div key={phrase} className="fm-bubble">
          <span className="fm-msg">{phrase}</span>
        </div>
        <div className="fm-mascot">
          <DoctorCode size="xs" />
        </div>
      </div>
    </div>
  );
}