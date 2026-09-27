import { FC } from 'react';

interface SpinnerProps {
  className?: string;
}

export const Spinner: FC<SpinnerProps> = ({ className = '' }) => {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
};

export default Spinner;