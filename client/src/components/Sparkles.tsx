import { type CSSProperties } from 'react';

type SparkCfg = {
  x: string;
  s: number;
  dur: number;
  delay: number;
  rise: number;
  drift: number;
  tw: number;
};

type EmberCfg = {
  x: string;
  y: string;
  s: number;
  dur: number;
  delay: number;
  fx: number;
  fy: number;
};

const sparks: SparkCfg[] = [
  { x: '4%', s: 4, dur: 2.1, delay: 0.0, rise: 300, drift: 18, tw: 0.7 },
  { x: '11%', s: 3, dur: 1.8, delay: 0.4, rise: 240, drift: -14, tw: 0.9 },
  { x: '18%', s: 6, dur: 2.4, delay: 0.9, rise: 340, drift: 30, tw: 0.6 },
  { x: '26%', s: 4, dur: 1.9, delay: 0.2, rise: 280, drift: 20, tw: 1.0 },
  { x: '33%', s: 3, dur: 1.7, delay: 1.1, rise: 220, drift: -20, tw: 0.8 },
  { x: '41%', s: 5, dur: 2.2, delay: 0.6, rise: 320, drift: 26, tw: 0.7 },
  { x: '48%', s: 4, dur: 2.0, delay: 1.3, rise: 260, drift: -28, tw: 0.9 },
  { x: '55%', s: 6, dur: 2.5, delay: 0.1, rise: 360, drift: 34, tw: 0.6 },
  { x: '62%', s: 3, dur: 1.8, delay: 0.7, rise: 230, drift: 16, tw: 1.1 },
  { x: '69%', s: 5, dur: 2.3, delay: 1.0, rise: 310, drift: -22, tw: 0.8 },
  { x: '76%', s: 4, dur: 1.9, delay: 0.3, rise: 270, drift: 24, tw: 0.7 },
  { x: '83%', s: 3, dur: 1.6, delay: 1.2, rise: 210, drift: -16, tw: 0.9 },
  { x: '90%', s: 5, dur: 2.1, delay: 0.5, rise: 300, drift: 20, tw: 0.6 },
  { x: '96%', s: 4, dur: 1.8, delay: 0.8, rise: 250, drift: 18, tw: 1.0 },
];

const embers: EmberCfg[] = [
  { x: '8%', y: '5%', s: 5, dur: 2.9, delay: 0.4, fx: 40, fy: -300 },
  { x: '22%', y: '10%', s: 4, dur: 2.5, delay: 1.0, fx: -28, fy: -260 },
  { x: '37%', y: '4%', s: 6, dur: 3.2, delay: 0.1, fx: 22, fy: -340 },
  { x: '52%', y: '8%', s: 5, dur: 2.7, delay: 0.7, fx: -38, fy: -280 },
  { x: '66%', y: '6%', s: 4, dur: 2.4, delay: 1.2, fx: 30, fy: -250 },
  { x: '80%', y: '11%', s: 5, dur: 2.8, delay: 0.5, fx: -24, fy: -320 },
  { x: '92%', y: '7%', s: 4, dur: 2.6, delay: 0.9, fx: 20, fy: -270 },
];

const sparkStyle = (s: SparkCfg): CSSProperties =>
  ({
    '--x': s.x,
    '--s': `${s.s}px`,
    '--dur': `${s.dur}s`,
    '--delay': `${s.delay}s`,
    '--rise': `-${s.rise}px`,
    '--drift': `${s.drift}px`,
    '--tw': `${s.tw}s`,
  }) as CSSProperties;

const emberStyle = (e: EmberCfg): CSSProperties =>
  ({
    '--x': e.x,
    '--y': e.y,
    '--s': `${e.s}px`,
    '--dur': `${e.dur}s`,
    '--delay': `${e.delay}s`,
    '--fx': `${e.fx}px`,
    '--fy': `-${e.fy}px`,
  }) as CSSProperties;

export default function Sparkles({ behind = false }: { behind?: boolean }) {
  return (
    <div className={`spark-field${behind ? ' behind' : ''}`} aria-hidden="true">
      {sparks.map((s, i) => (
        <span key={i} className="spark" style={sparkStyle(s)} />
      ))}
      {embers.map((e, i) => (
        <span key={i} className="ember" style={emberStyle(e)} />
      ))}
    </div>
  );
}
