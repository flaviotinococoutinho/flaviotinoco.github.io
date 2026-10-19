/**
 * `astro build`, but strict: Astro's content loaders only LOG render failures of a
 * Markdown entry ("[ERROR] [glob-loader] Error rendering …") and still exit 0 with an
 * empty page body — a silent loss of the whole text. This wrapper streams the build
 * output unchanged and fails if any [ERROR] line appears. `--force` discards the
 * content-layer cache so a previously cached failure is re-reported.
 */
import { spawn } from 'node:child_process';

const child = spawn('pnpm', ['exec', 'astro', 'build', '--force', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

const errors = [];
const watch = (stream, sink) => {
  let buffer = '';
  stream.on('data', (chunk) => {
    sink.write(chunk);
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line.includes('[ERROR]')) errors.push(line);
  });
};
watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);

child.on('close', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (errors.length > 0) {
    console.error(`\nastro-build-strict: ${errors.length} error line(s) in a "successful" build:`);
    for (const e of errors) console.error(`  ${e.trim()}`);
    process.exit(1);
  }
});
