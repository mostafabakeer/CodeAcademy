import { lazy, Suspense, useEffect, useState } from 'react';
import { useLang } from '../i18n';

const ReactCodeMirror = lazy(() =>
  import('@uiw/react-codemirror').then((m) => ({ default: m.default }))
);

const langLoaders: Record<string, () => Promise<any>> = {
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  python: async () => (await import('@codemirror/lang-python')).python(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  language: string;
  height?: string;
}

export default function CodeEditor({ value, onChange, language, height = '60vh' }: Props) {
  const { t } = useLang();
  const [extensions, setExtensions] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    const loader = langLoaders[language] ?? langLoaders.javascript;
    loader()
      .then((ext) => {
        if (alive) setExtensions([ext]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [language]);

  return (
    <Suspense
      fallback={
        <div style={{ height }} className="flex items-center justify-center rounded-xl border border-ink-600 bg-ink-900 text-gray-400">
          {t('common.loadingEditor')}
        </div>
      }
    >
      <div style={{ height }} className="overflow-hidden rounded-xl border border-ink-600 shadow-inner">
        <ReactCodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme="dark"
          height={height}
          basicSetup={{
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            autocompletion: true,
          }}
          style={{ fontSize: 14 }}
        />
      </div>
    </Suspense>
  );
}
