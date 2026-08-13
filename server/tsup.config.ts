import { defineConfig } from 'tsup';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  // تُرك الحزم الخارجية كما هي في node_modules (لا تُضمَّن) — أسرع وأكثر أماناً
  external: [...Object.keys(pkg.dependencies)],
});
