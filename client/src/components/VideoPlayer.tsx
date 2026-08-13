import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const apiQueue: Array<() => void> = [];
let apiLoaded = false;

function ensureYouTubeApi(cb: () => void) {
  apiQueue.push(cb);
  if (apiLoaded || (window.YT && window.YT.Player)) return;
  if (document.getElementById('yt-iframe-api')) return;
  apiLoaded = true;
  window.onYouTubeIframeAPIReady = () => {
    for (const fn of apiQueue.splice(0)) fn();
  };
  const tag = document.createElement('script');
  tag.id = 'yt-iframe-api';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

interface Props {
  videoType: 'youtube' | 'upload';
  videoUrl: string;
  onProgress?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  onComplete?: () => void;
}

export default function VideoPlayer({ videoType, videoUrl, onProgress, onDuration, onComplete }: Props) {
  const playerRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const maxWatched = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportedDuration = useRef(0);
  const propsRef = useRef({ onProgress, onDuration, onComplete, videoUrl, videoType });
  propsRef.current = { onProgress, onDuration, onComplete, videoUrl, videoType };

  // ===== رفع محلي =====
  useEffect(() => {
    if (videoType !== 'upload') return;
    const el = videoElRef.current;
    if (!el) return;
    const report = () => {
      if (!el) return;
      maxWatched.current = Math.max(maxWatched.current, el.currentTime || 0);
      propsRef.current.onProgress?.(Math.floor(maxWatched.current));
    };
    const onLoaded = () => {
      reportedDuration.current = el.duration || 0;
      propsRef.current.onDuration?.(Math.floor(el.duration || 0));
    };
    const onEnded = () => {
      maxWatched.current = Math.max(maxWatched.current, el.duration || 0);
      propsRef.current.onProgress?.(Math.floor(maxWatched.current));
      propsRef.current.onComplete?.();
    };
    el.addEventListener('timeupdate', report);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnded);
    timerRef.current = setInterval(report, 4000);
    return () => {
      el.removeEventListener('timeupdate', report);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnded);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [videoType, videoUrl]);

  // ===== يوتيوب =====
  useEffect(() => {
    if (videoType !== 'youtube') return;
    const id = extractYouTubeId(videoUrl);
    if (!id) return;

    let player: any = null;
    const build = () => {
      if (!window.YT?.Player) return;
      player = new window.YT.Player('yt-player', {
        videoId: id,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: any) => {
            const dur = e.target.getDuration?.() || 0;
            if (dur) {
              reportedDuration.current = dur;
              propsRef.current.onDuration?.(Math.floor(dur));
            }
          },
          onStateChange: (e: any) => {
            if (e.data === 1) {
              timerRef.current = setInterval(() => {
                if (!player) return;
                const t = player.getCurrentTime?.() || 0;
                maxWatched.current = Math.max(maxWatched.current, t);
                propsRef.current.onProgress?.(Math.floor(maxWatched.current));
              }, 4000);
            } else if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            if (e.data === 0) {
              const dur = player.getDuration?.() || reportedDuration.current;
              maxWatched.current = Math.max(maxWatched.current, dur);
              propsRef.current.onProgress?.(Math.floor(maxWatched.current));
              propsRef.current.onComplete?.();
            }
          },
        },
      });
    };

    // انتظار وجود عنصر الـ div قبل بناء المشغل
    const attempt = setInterval(() => {
      if (document.getElementById('yt-player')) {
        clearInterval(attempt);
        ensureYouTubeApi(build);
      }
    }, 50);
    setTimeout(() => clearInterval(attempt), 8000);

    return () => {
      clearInterval(attempt);
      if (timerRef.current) clearInterval(timerRef.current);
      if (player) {
        try {
          player.destroy();
        } catch {}
      }
      playerRef.current = null;
    };
  }, [videoType, videoUrl]);

  if (videoType === 'youtube') {
    const id = extractYouTubeId(videoUrl);
    if (!id) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-fire-500/30 bg-ink-900 text-gray-400">
          رابط يوتيوب غير صحيح
        </div>
      );
    }
    return (
      <div className="aspect-video overflow-hidden rounded-2xl border border-fire-500/30 shadow-2xl shadow-fire-950/40">
        <div id="yt-player" className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-fire-500/30 shadow-2xl shadow-fire-950/40">
      <video ref={videoElRef} src={videoUrl} controls preload="metadata" className="w-full rounded-2xl bg-black" />
    </div>
  );
}
