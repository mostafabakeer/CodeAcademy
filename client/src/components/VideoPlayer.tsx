import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLang } from '../i18n';

interface VideoPlayerProps {
  // Interface 1: Direct video source
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  resumeAt?: number;
  
  // Interface 2: LessonPlayer style (videoType + videoUrl)
  videoType?: 'youtube' | 'upload';
  videoUrl?: string;
  initialTime?: number;
  onProgress?: (seconds: number) => void;
  onDuration?: (duration: number) => void;
}

function getVideoSrc(props: VideoPlayerProps): string {
  if (props.src) return props.src;
  if (props.videoUrl) return props.videoUrl;
  return '';
}

function getResumeTime(props: VideoPlayerProps): number {
  if (props.resumeAt !== undefined) return props.resumeAt;
  if (props.initialTime !== undefined) return props.initialTime;
  return 0;
}

export default function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onError,
  resumeAt = 0,
  videoType,
  videoUrl,
  initialTime,
  onProgress,
  onDuration,
}: VideoPlayerProps) {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout>>();

  const effectiveSrc = getVideoSrc({ src, videoUrl });
  const effectiveResumeAt = getResumeTime({ resumeAt, initialTime });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      onDurationChange?.(video.duration);
      onDuration?.(video.duration);
      if (effectiveResumeAt > 0 && effectiveResumeAt < video.duration) {
        video.currentTime = effectiveResumeAt;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
      onProgress?.(video.currentTime);
    };

    const handleCanPlay = () => {
      setLoading(false);
    };

    const handleWaiting = () => {
      setLoading(true);
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setLoading(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handleError = () => {
      const err = new Error(t('video.error') || 'Video playback error');
      setError(err.message);
      setLoading(false);
      onError?.(err);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    if (autoPlay) {
      video.play().catch(() => {
        /* autoplay prevented */
      });
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [autoPlay, onTimeUpdate, onDurationChange, onDuration, onEnded, onError, onProgress, effectiveResumeAt, t]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(seconds, video.duration));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (!videoRef.current?.paused) setShowControls(false);
    }, 3000);
  };

  if (error) {
    return (
      <div className="relative aspect-video rounded-2xl bg-ink-900/50 flex items-center justify-center">
        <div className="text-center p-4">
          <p className="text-fire-400 font-semibold">⚠️ {error}</p>
          <p className="text-gray-400 text-sm mt-1">{t('video.unavailable')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => {
        if (!videoRef.current?.paused) setShowControls(false);
      }}
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        poster={poster}
        playsInline
        className="absolute inset-0 w-full h-full object-contain"
        preload="metadata"
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-900/80 z-10">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
            <div className="absolute inset-0 m-auto h-6 w-6 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent z-10 flex flex-col justify-end p-4"
          >
            <div className="flex items-center gap-3 text-white">
              <button
                onClick={togglePlay}
                className="btn-ghost-fire rounded-lg p-2"
                aria-label={isPlaying ? t('video.pause') : t('video.play')}
              >
                {isPlaying ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-fire-500"
                aria-label={t('video.seek')}
              />
              <span className="text-sm font-mono tabular-nums w-20 text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.playbackRate = video.playbackRate === 1 ? 1.5 : video.playbackRate === 1.5 ? 2 : 1;
                }}
                className="btn-ghost-fire rounded-lg px-2 py-1 text-xs font-bold"
              >
                {videoRef.current?.playbackRate || 1}x
              </button>
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.requestFullscreen();
                }}
                className="btn-ghost-fire rounded-lg p-2"
                aria-label={t('video.fullscreen')}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}