import type { FC } from 'react';
import { motion } from 'motion/react';

/**
 * مكونات Skeleton للعرض أثناء التحميل — تمنع "وميض" التخطيط (layout shift)
 * وتحسن تجربة المستخدم بإظهار هيكل الصفحة قبل وصول البيانات.
 */

interface SkeletonProps {
  className?: string;
  animation?: 'pulse' | 'wave' | 'none';
}

const ANIMATION_CLASSES: Record<'pulse' | 'wave' | 'none', string> = {
  pulse: 'animate-pulse',
  wave: 'animate-shimmer',
  none: '',
};

/** Skeleton أساسي — مستطيل رمادي متحرك */
export const Skeleton: FC<SkeletonProps> = ({ className = '', animation = 'pulse' }) => (
  <motion.div
    className={`${ANIMATION_CLASSES[animation]} bg-ink-800 rounded-lg ${className}`}
    initial={{ opacity: 0.4 }}
    animate={{ opacity: [0.4, 0.8, 0.4] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
  />
);

/** Skeleton للنصوص — عدة أسطر بأطوال متفاوتة */
interface TextSkeletonProps {
  lines?: number;
  className?: string;
  lineHeight?: number;
  maxWidth?: string;
}

export const TextSkeleton: FC<TextSkeletonProps> = ({
  lines = 3,
  className = '',
  lineHeight = 1.5,
  maxWidth = '100%',
}) => (
  <div className={className} style={{ maxWidth }}>
    {Array.from({ length: lines }, (_, i) => (
      <motion.div
        key={i}
        className="bg-ink-800 rounded h-4 mb-2"
        style={{
          width: i === lines - 1 ? '60%' : '100%',
          height: `calc(${lineHeight}rem - 0.5rem)`,
        }}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

/** Skeleton للبطاقات (Card) — صورة + عنوان + نص */
interface CardSkeletonProps {
  className?: string;
  hasImage?: boolean;
  imageAspectRatio?: string;
  textLines?: number;
}

export const CardSkeleton: FC<CardSkeletonProps> = ({
  className = '',
  hasImage = true,
  imageAspectRatio = '16/9',
  textLines = 3,
}) => (
  <div className={`card-fire rounded-2xl p-5 ${className}`}>
    {hasImage && (
      <div
        className="relative mb-4 rounded-xl overflow-hidden bg-ink-800"
        style={{ aspectRatio: imageAspectRatio }}
      >
        <Skeleton className="absolute inset-0" animation="wave" />
      </div>
    )}
    <Skeleton className="h-6 w-3/4 mb-2" />
    <Skeleton className="h-5 w-1/2 mb-3" />
    <TextSkeleton lines={textLines} />
  </div>
);

/** Skeleton للجداول — صفوف بيانات مع خلايا */
interface TableSkeletonProps {
  columns: number;
  rows?: number;
  className?: string;
}

export const TableSkeleton: FC<TableSkeletonProps> = ({
  columns = 4,
  rows = 5,
  className = '',
}) => (
  <div className={className}>
    {/* Header skeleton */}
    <div className="grid gap-4 px-4 py-3 text-sm font-bold text-gray-400" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" animation="pulse" />
      ))}
    </div>
    {/* Rows skeleton */}
    <div className="divide-y divide-ink-800">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-4 w-full"
              animation={colIndex === 0 ? 'wave' : 'pulse'}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** Skeleton للقوائم (List) — عناصر متسلسلة */
interface ListSkeletonProps {
  items?: number;
  className?: string;
  itemHeight?: string;
  hasAvatar?: boolean;
  hasAction?: boolean;
}

export const ListSkeleton: FC<ListSkeletonProps> = ({
  items = 5,
  className = '',
  itemHeight = 'h-16',
  hasAvatar = true,
  hasAction = false,
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: items }, (_, i) => (
      <motion.div
        key={i}
        className={`flex items-center gap-4 ${itemHeight} p-3 rounded-xl bg-ink-900/50`}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: i * 0.05 }}
      >
        {hasAvatar && (
          <Skeleton className="h-12 w-12 rounded-full shrink-0" animation="wave" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        {hasAction && <Skeleton className="h-8 w-20 shrink-0" />}
      </motion.div>
    ))}
  </div>
);

/** Skeleton للصور — مع نسبة أبعاد محددة */
interface ImageSkeletonProps {
  className?: string;
  aspectRatio?: string;
  rounded?: boolean;
}

export const ImageSkeleton: FC<ImageSkeletonProps> = ({
  className = '',
  aspectRatio = '16/9',
  rounded = true,
}) => (
  <div
    className={`relative overflow-hidden bg-ink-800 ${rounded ? 'rounded-xl' : ''} ${className}`}
    style={{ aspectRatio }}
  >
    <Skeleton className="absolute inset-0" animation="wave" />
  </div>
);

/** Skeleton للأزرار أثناء التحميل */
interface ButtonSkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export const ButtonSkeleton: FC<ButtonSkeletonProps> = ({
  className = '',
  width = 'w-full',
  height = 'h-10',
}) => (
  <Skeleton className={`${width} ${height} rounded-xl ${className}`} animation="pulse" />
);

/** Skeleton للـ Avatar */
interface AvatarSkeletonProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

export const AvatarSkeleton: FC<AvatarSkeletonProps> = ({
  size = 'md',
  className = '',
}) => (
  <Skeleton className={`${SIZE_CLASSES[size] || SIZE_CLASSES.md} rounded-full ${className}`} animation="wave" />
);

/** Skeleton للإحصائيات (Stats) — أرقام كبيرة مع تسميات */
interface StatsSkeletonProps {
  count?: number;
  className?: string;
}

export const StatsSkeleton: FC<StatsSkeletonProps> = ({
  count = 4,
  className = '',
}) => (
  <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
    {Array.from({ length: count }, (_, i) => (
      <motion.div
        key={i}
        className="card-fire rounded-2xl p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: i * 0.05 }}
      >
        <Skeleton className="h-10 w-24 mb-2" animation="wave" />
        <Skeleton className="h-4 w-3/4" />
      </motion.div>
    ))}
  </div>
);

/** PageSkeleton — هيكل صفحة كامل أثناء التحميل */
interface PageSkeletonProps {
  hasHeader?: boolean;
  hasSidebar?: boolean;
  contentType?: 'cards' | 'list' | 'table' | 'stats';
  className?: string;
}

export const PageSkeleton: FC<PageSkeletonProps> = ({
  hasHeader = true,
  hasSidebar = false,
  contentType = 'cards',
  className = '',
}) => (
  <div className={`space-y-6 ${className}`}>
    {hasHeader && (
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2 ml-auto">
          <ButtonSkeleton width="w-24" />
          <ButtonSkeleton width="w-24" />
        </div>
      </div>
    )}
    <div className={hasSidebar ? 'flex gap-6' : ''}>
      {hasSidebar && (
        <aside className="w-64 shrink-0 space-y-3">
          <ListSkeleton items={6} hasAvatar={false} hasAction={false} />
        </aside>
      )}
      <main className={hasSidebar ? 'flex-1' : ''}>
        {contentType === 'cards' && <CardSkeleton />}
        {contentType === 'list' && <ListSkeleton items={8} />}
        {contentType === 'table' && <TableSkeleton columns={4} rows={6} />}
        {contentType === 'stats' && <StatsSkeleton count={4} />}
      </main>
    </div>
  </div>
);

export default Skeleton;