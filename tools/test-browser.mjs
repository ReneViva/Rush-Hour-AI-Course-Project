import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const chrome = process.env.RUSH_BROWSER_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const tmp = fileURLToPath(new URL('../.cache/tmp/', import.meta.url));
mkdirSync(tmp, { recursive: true });
const env = {
  ...process.env,
  TEMP: tmp,
  TMP: tmp,
  TMPDIR: tmp,
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? fileURLToPath(new URL('../.cache/browsers/', import.meta.url)),
  ...(chrome ? { RUSH_BROWSER_PATH: chrome } : {}),
};
const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
  cwd: project,
  env,
  stdio: 'inherit',
});
if (run.error) console.error(run.error);
process.exit(run.status ?? 1);
