import { useState } from 'react';
import { getYouTubeThumbnail } from '../lib/youtube';

interface Props {
  videoId: string;
  initialTime?: number;
  autoPlay?: boolean;
}

export default function YouTubePlayer({ videoId, initialTime = 0, autoPlay = false }: Props) {
  const [isError, setIsError] = useState(false);
  const thumbnailUrl = getYouTubeThumbnail(`https://youtu.be/${videoId}`);

  const params = new URLSearchParams({
    autoplay: autoPlay ? '1' : '0',
    start: String(initialTime),
    rel: '0',
    modestbranding: '1',
    cc_load_policy: '1',
    iv_load_policy: '3',
  });

  const embedSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  const watchSrc = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-900">
      {!isError ? (
        <>
          {/* Poster / Play overlay */}
          {!autoPlay && (
            <a
              href={embedSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 z-20 block cursor-pointer"
            >
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="h-full w-full object-cover opacity-85"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-all hover:bg-black/25">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fire-500 shadow-lg transition-transform hover:scale-110">
                  <svg className="ml-1 h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </a>
          )}

          {/* Actual iframe */}
          <iframe
            src={embedSrc}
            className="aspect-video h-full w-full"
            title={`YouTube video: ${videoId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onError={() => setIsError(true)}
          />
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-red-400">⚠️ تعذر عرض الفيديو المدمج</p>
          <a
            href={watchSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-fire inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.5 6.2c-.3-3.3-3-6-6.3-6.2C16.1 0 12 0 12 0s-4.1 0-5.2.1C3.5.2.7 2.9.5 6.2c-.2 1.1-.1 6.8-.1 6.8s-.1 5.7.1 6.8c.3 3.3 3 6 6.3 6.2 1.1.1 5.2.1 5.2.1s4.1 0 5.2-.1c3.3-.3 6-3 6.3-6.3.1-1.1.1-6.8.1-6.8s.1-5.7-.1-6.8zM9.5 14.5V9l6 3.2-6 2.3z"/></svg>
            شاهد على يوتيوب
          </a>
        </div>
      )}
    </div>
  );
}