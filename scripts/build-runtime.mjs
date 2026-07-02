// Собирает runtime игры в public/runtime.js (встраивается при экспорте)
import { build } from 'esbuild';

await build({
  entryPoints: ['src/runtime/standalone.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  outfile: 'public/runtime.js',
  target: 'es2020',
});

console.log('runtime.js собран');
