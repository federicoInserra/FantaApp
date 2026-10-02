import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of ['index.html', 'styles.css', 'src', 'manifest.webmanifest', 'sw.js', 'icons']) {
  await cp(new URL(asset, root), new URL(asset, output), { recursive: true });
}
console.log('Static app prepared in dist/');
