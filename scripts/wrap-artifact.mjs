// Turns client/dist-demo/index.html into an artifact page body: the artifact
// host supplies <!doctype>/<html>/<head>/<body>, so keep only title, styles,
// scripts and the root node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist-demo');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const grab = (re) => [...html.matchAll(re)].map((m) => m[0]);
const styles = grab(/<style[\s\S]*?<\/style>/g);
const scripts = grab(/<script[\s\S]*?<\/script>/g);
const out = [
  '<title>Gachapets</title>',
  '<meta name="theme-color" content="#0d0b1a">',
  '<style>html,body{background:#0d0b1a;color:#f4efff}</style>',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
].join('\n');
fs.writeFileSync(path.join(dir, 'gachapets.html'), out);
console.log(`artifact page: ${(out.length / 1024 / 1024).toFixed(2)} MB, ${styles.length} style + ${scripts.length} script blocks`);
