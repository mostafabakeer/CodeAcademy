import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocal, setLocal } from '../lib/storage';
import { ar } from './ar';
import { en } from './en';

export type Lang = 'ar' | 'en';

const dictionaries = { ar, en } as const;

interface LanguageContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function lookup(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), dict);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = getLocal('lang');
    return saved === 'en' ? 'en' : 'ar';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    setLocal('lang', lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = dictionaries[lang];
    const t = (key: string, vars?: Record<string, string | number>): string => {
      let text = (lookup(dict, key) ?? key) as string;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      }
      return text;
    };
    return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t, setLang };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
