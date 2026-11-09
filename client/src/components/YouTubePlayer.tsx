import { useEffect, useRef, useState, useCallback } from 'react';
import { useLang } from '../i18n';
import { extractYouTubeId, getYouTubeThumbnail } from '../lib/youtube';

interface YouTubePlayerProps {
  videoId: string;
  initialTime?: number;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onDuration?: (duration: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  onProgress?: (seconds: number) => void;
  playbackRate?: number;
  muted?: boolean;
  autoPlay?: boolean;
}

export default function YouTubePlayer({
  videoId,
  initialTime = 0,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onError,
  onDuration,
  onTimeUpdate,
  onProgress,
  playbackRate = 1,
  muted = false,
  autoPlay = false,
}: YouTubePlayerProps) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showPoster, setShowPoster] = useState(!autoPlay);
  const [apiReady, setApiReady] = useState(false);

  const YT_EMBED_URL = `https://www.youtube-nocookie.com/embed/${videoId}`;

  // Build player vars
  const buildPlayerVars = () => {
    const params = new URLSearchParams({
      autoplay: autoPlay ? '1' : '0',
      start: String(initialTime || 0),
      enablejsapi: '1',
      modestbranding: '1',
      rel: '0',
      playsinline: '1',
      cc_load_policy: '1',
      iv_load_policy: '1',
    });
    return `${YT_EMBED_URL}?${params.toString()}`;
  };

  const iframeSrc = buildPlayerVars();

  // Handle play/pause via postMessage when iframe is ready
  useEffect(() => {
    if (!iframeRef.current) return;

    const handleMessage = (event: MessageEvent) => {
      // Accept messages from YouTube
      if (!event.origin.includes('youtube.com') && !event.origin.includes('youtu.be')) return;

      switch (event.data?.event) {
        case 'onStateChange':
          const state = event.data?.state;
          if (state === 'playing') {
            setIsPlaying(true);
            setHasStarted(true);
            setShowPoster(false);
            onPlay?.();
          } else if (state === 'paused' || state === 'ended') {
            setIsPlaying(false);
            if (state === 'ended') onEnded?.();
            onPause?.();
          }
          break;
        case 'onReady':
          setApiReady(true);
          onReady?.();
          // Seek to initial time if needed
          if (initialTime > 0) {
            setTimeout(() => {
              iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'seekTo', args: [initialTime, true] }),
                '*'
              );
            }, 500);
          }
          break;
        case 'onError':
          onError?.(event.data?.args?.[0]?.toString() || 'Unknown error');
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal that API is ready
    setTimeout(() => {
      setApiReady(true);
      onReady?.();
    }, 500);

    return () => window.removeEventListener('message', handleMessage);
  }, [autoPlay, initialTime, onReady, onPlay, onPause, onEnded, onError]);

  // Apply rate/mute changes
  useEffect(() => {
    if (iframeRef.current && apiReady) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [playbackRate] }),
        '*'
      );
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [muted ? 0 : 100] }),
        '*'
      );
    }
  }, [playbackRate, muted, apiReady]);

  // Click to play
  const handleClick = () => {
    if (!hasStarted) {
      setHasStarted(true);
      setShowPoster(false);
      autoPlay && iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      );
    }
  };

  // Get thumbnail for poster
  const thumbnailUrl = getYouTubeThumbnail(`https://youtu.be/${videoId}`);

  return (
    <div
      ref={containerRef}
      className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900 cursor-pointer"
      onClick={handleClick}
    >
      {showPoster && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <img
            src={thumbnailUrl || ''}
            alt="Video thumbnail"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-fire-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <svg className="h-10 w-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </div>
      )}

      {!showPoster && (
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className="w-full h-full"
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}

      {!apiReady && !showPoster && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/60">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}
    </div>
  );
}