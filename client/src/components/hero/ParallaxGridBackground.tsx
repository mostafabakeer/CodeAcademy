import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

export default function ParallaxGridBackground() {
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      targetRef.current.x = (e.clientX - centerX) / (rect.width / 2);
      targetRef.current.y = (e.clientY - centerY) / (rect.height / 2);
    };

    const tick = () => {
      const lerp = 0.06;
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * lerp;
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * lerp;

      const el = gridRef.current;
      if (el) {
        const moveX = currentRef.current.x * 30;
        const moveY = currentRef.current.y * 30;
        el.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={gridRef}
      className="parallax-grid"
      aria-hidden="true"
    />
  );
}