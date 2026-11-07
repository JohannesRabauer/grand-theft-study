// Starts a headless Edge/Chrome with its own temp profile and guarantees it is gone afterwards: close() kills the
// exact process tree by PID and deletes the profile folder. On Windows the PID that spawn() returns is only a launcher
// that exits at once, so the real browser root is found by its unique --user-data-dir (and killed with taskkill /T).
// Elsewhere the browser runs in its own process group, which is killed.
// close() also runs on SIGINT/SIGTERM and on process exit, so a crash or Ctrl+C does not leave browsers behind.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(existsSync);

export function launchBrowser(profilePrefix, extraArgs = []) {
  if (!exePath) { console.error('no Edge or Chrome found'); process.exit(2); }
  const port = 9300 + Math.floor(Math.random() * 500);
  const userDataDir = mkdtempSync(join(tmpdir(), profilePrefix));
  const win = process.platform === 'win32';
  const proc = spawn(exePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, '--no-first-run', ...extraArgs, 'about:blank'],
    { stdio: 'ignore', detached: !win });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (win) {
      const find = `(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${userDataDir}') -and $_.CommandLine -notmatch '--type=' }).ProcessId`;
      const roots = spawnSync('powershell', ['-NoProfile', '-Command', find], { encoding: 'utf8' }).stdout.split(/\s+/).filter(Boolean);
      for (const pid of [String(proc.pid), ...roots]) spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
    } else if (proc.pid) {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* profile still locked: harmless temp data */ }
  };
  process.on('exit', close);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { close(); process.exit(130); });
  return { port, proc, userDataDir, close };
}
