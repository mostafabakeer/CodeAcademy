import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface KenBurnsSpotlightProps {
  baseImage: string;
  highlightImage?: string;
  alt: string;
  className?: string;
}

export default function KenBurnsSpotlight({
  baseImage,
  highlightImage,
  alt,
  className = '',
}: KenBurnsSpotlightProps) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const cursorRef = useRef({ x: -9999, y: -9999 });
  const targetRef = useRef({ x: -9999, y: -9999 });
  const [isHovering, setIsHovering] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  const baseImgRef = useRef<HTMLImageElement>(null);
  const highlightImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const baseImg = new Image();
    let loadedCount = 1;

    const checkLoaded = () => {
      loadedCount--;
      if (loadedCount === 0) {
        setImagesLoaded(true);
      }
    };

    baseImg.onload = checkLoaded;
    baseImg.src = baseImage;
    baseImgRef.current = baseImg;

    if (highlightImage) {
      loadedCount++;
      const highlightImg = new Image();
      highlightImg.onload = checkLoaded;
      highlightImg.src = highlightImage;
      highlightImgRef.current = highlightImg;
    }
  }, [baseImage, highlightImage]);

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  const handleMouseMove = (e: MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    targetRef.current.x = e.clientX - rect.left;
    targetRef.current.y = e.clientY - rect.top;
  };

  useEffect(() => {
    if (reducedMotion || !imagesLoaded || !highlightImage || !highlightImgRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    const tick = () => {
      const lerp = 0.1;
      cursorRef.current.x += (targetRef.current.x - cursorRef.current.x) * lerp;
      cursorRef.current.y += (targetRef.current.y - cursorRef.current.y) * lerp;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Only draw highlight image when hovering - the base image is rendered by motion.img
      if (isHovering && cursorRef.current.x > 0 && cursorRef.current.y > 0) {
        // Draw the highlight image
        ctx.drawImage(highlightImgRef.current!, 0, 0, width, height);

        // Create spotlight mask to reveal highlight image
        const radius = 260;
        const gradient = ctx.createRadialGradient(
          cursorRef.current.x,
          cursorRef.current.y,
          0,
          cursorRef.current.x,
          cursorRef.current.y,
          radius
        );
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(0.3, 'rgba(0,0,0,0.8)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }
      // When not hovering or no highlight image: canvas stays transparent (shows motion.img underneath)

      rafRef.current = requestAnimationFrame(tick);
    };

    resizeCanvas();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', resizeCanvas);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion, imagesLoaded, isHovering, highlightImage]);

  if (!imagesLoaded) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-3xl ${className}`}
        aria-hidden="true"
      >
        <img
          src={baseImage}
          alt={alt}
          className="ken-burns-img"
          fetchPriority="high"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-3xl ${className}`}
      aria-hidden="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Base image rendered by motion.img with Ken Burns animation */}
      <motion.img
        src={baseImage}
        alt={alt}
        className="ken-burns-img"
        initial={{ scale: reducedMotion ? 1 : 1.12 }}
        animate={{ scale: 1 }}
        transition={{ duration: reducedMotion ? 0 : 2.4, ease: [0.22, 1, 0.36, 1] }}
        fetchPriority="high"
        decoding="async"
      />
      {/* Canvas ONLY draws highlight image with spotlight mask when hovering */}
      <canvas
        ref={canvasRef}
        className="spotlight-canvas"
        aria-hidden="true"
      />
    </div>
  );
}