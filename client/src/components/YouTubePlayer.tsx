import { useState } from 'react';
import { getYouTubeThumbnail } from '../lib/youtube';

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
  autoPlay = false,
}: YouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const thumbnailUrl = getYouTubeThumbnail(`https://youtu.be/${videoId}`);

  const params = new URLSearchParams({
    autoplay: isPlaying ? '1' : '0',
    start: String(Math.floor(initialTime)),
    rel: '0',
    modestbranding: '1',
    cc_load_policy: '1',
    iv_load_policy: '3',
    playsinline: '1',
  });

  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-900 shadow-2xl">
      {!isPlaying ? (
        <div
          onClick={() => setIsPlaying(true)}
          className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/40 transition-all hover:bg-black/25"
        >
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="absolute inset-0 h-full w-full object-cover opacity-85"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-fire-500 shadow-lg transition-transform hover:scale-110">
              <svg className="ml-1 h-10 w-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          src={embedUrl}
          className="absolute inset-0 h-full w-full border-0"
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}
    </div>
  );
}
