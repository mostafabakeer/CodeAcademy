import { useState, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { useLang } from '../i18n';

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
  onProgress,
  playbackRate = 1,
  muted = false,
  autoPlay = false,
}: YouTubePlayerProps) {
  const { t } = useLang();
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const handleReady = useCallback(() => {
    setLoading(false);
    onReady?.();
  }, [onReady]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-900 shadow-2xl group">
      {/* Loading Spinner */}
      {loading && !hasStarted && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-900/60 pointer-events-none">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}

      {/* Actual Player */}
      <div className="absolute inset-0 h-full w-full">
        <ReactPlayer
          url={url}
          width="100%"
          height="100%"
          playing={autoPlay || hasStarted}
          controls={true}
          muted={muted}
          playbackRate={playbackRate}
          onReady={handleReady}
          onStart={() => {
            setHasStarted(true);
            onPlay?.();
          }}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onError={() => onError?.(t('video.error'))}
          onDuration={onDuration}
          onProgress={(state: { playedSeconds: number }) => onProgress?.(Math.floor(state.playedSeconds))}
          config={{
            youtube: {
              playerVars: {
                start: Math.floor(initialTime),
                modestbranding: 1,
                rel: 0,
              }
            }
          }}
        />
      </div>
    </div>
  );
}
