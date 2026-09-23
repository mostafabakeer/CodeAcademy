import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import DoctorCode from './DoctorCode';

const SWAP_MS = 5000;

export default function FloatingMascot() {
  const { t } = useLang();
  const phrases = [t('mascot.p1'), t('mascot.p2'), t('mascot.p3'), t('mascot.p4'), t('mascot.p5'), t('mascot.p6'), t('mascot.p7'), t('mascot.p8'), t('mascot.p9'), t('mascot.p10'), t('mascot.p11'), t('mascot.p12')];
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * phrases.length));

  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % phrases.length), SWAP_MS);
    return () => clearInterval(id);
  }, [phrases.length]);

  const phrase = phrases[idx] ?? phrases[0];

  return (
    <div className="fm" aria-hidden="true">
      <div className="fm-roamer">
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