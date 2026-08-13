import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocal, removeLocal, setLocal } from '../lib/storage';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = getLocal(key);
    if (saved === null) return initialValue;
    try {
      return JSON.parse(saved) as T;
    } catch {
      return saved as T;
    }
  });

  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  useEffect(() => {
    const current = getLocal(key);
    if (current === null) {
      setValue(initialRef.current);
    }
  }, [key]);

  const setStored = useCallback(
    (next: T) => {
      setValue(next);
      if (next === null || next === undefined) {
        removeLocal(key);
      } else if (typeof next === 'string') {
        setLocal(key, next);
      } else {
        setLocal(key, JSON.stringify(next));
      }
    },
    [key],
  );

  return [value, setStored];
}
