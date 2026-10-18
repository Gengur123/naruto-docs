// Builds the site and shows it: in a window that reads the built pages straight from dist/
// (no server, no port), or at an address for a browser. The built site is what makes the
// Search box work: one search over every page. It is a snapshot, so run this again after a
// ledger or a page changes.
//
//   npm run live                      serves the built site and prints the address of the
//                                     newest sprint under ledgers/sprints (highest leading
//                                     number), or of the sprints index when there is none
//   npm run live -- 03-save-format    that sprint
//   npm run live -- --dev             the dev server instead: pages follow edits as you save,
//                                     but the Search box does not work there
//   npm run live:window               no server: opens the built site in a Wails window
//                                     (scripts/wails-window, built once with Go). A link that
//                                     leaves the site opens in your default browser.
//   npm run live:window -- --window=electrobun  or --window=deno: the older windows, which
//                                     need the server and so also print an address
//   npm run live:stop                 stops the server
//   npm run window:check              builds the Wails window, has the page run one search
//                                     and click a link that leaves the site, prints what
//                                     happened, closes (add --window=electrobun for that one)
//
// The port is DANDORI_DOCS_PORT when it is set. Otherwise the system picks a free one, so
// two projects' docs never block each other. The address printed carries it, and
// `npm run live:stop` finds the server through Astro's own record, whatever the port.
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addressFor, host, newestSprint, parseArgs, portFrom, searchIndexFor, windowPathFor } from './live-args.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const astro = join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const dist = join(root, 'dist');
const title = 'Dandori sprints';
const cacheDir = join(process.env.LOCALAPPDATA ?? join(homedir(), '.cache'), 'dandori', 'docs-shell');

let port, sprint, args;
try {
  port = portFrom(process.env);
  args = parseArgs(process.argv.slice(2));
  const ledgers = join(root, 'ledgers', 'sprints');
  sprint = args.sprint ?? newestSprint(existsSync(ledgers) ? readdirSync(ledgers) : []);
  if (!args.stop && sprint !== null && !existsSync(join(root, 'src', 'content', 'docs', 'sprints', sprint, 'index.mdx'))) {
    throw new Error(`no page for sprint ${sprint}; run \`dandori sprint render ${sprint}\` first`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

function runAstro(...words) {
  return spawnSync(process.execPath, [astro, ...words], { cwd: root, encoding: 'utf8', env });
}

// A server started earlier by this script, of either kind, on any port: Astro keeps its own
// record of a --background server. Both commands succeed when there is nothing to stop.
function stopServers() {
  runAstro('preview', 'stop');
  runAstro('dev', 'stop');
}

async function answers(address) {
  try {
    const res = await fetch(address, { signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function ready(addresses, seconds) {
  for (let i = 0; i < seconds; i++) {
    const all = await Promise.all(addresses.map(answers));
    if (all.every(Boolean)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// A port nothing listens on now: the system's pick for port 0.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, host, () => {
      const picked = probe.address().port;
      probe.close(() => resolve(picked));
    });
  });
}

function hashOf(files, extra = '') {
  const h = createHash('sha256');
  for (const f of files) h.update(readFileSync(f));
  h.update(extra);
  return h.digest('hex').slice(0, 8);
}

// The Wails window: scripts/wails-window, built once with Go into the cache and named after
// a hash of its sources and the Go version. The build never downloads (GOPROXY=off): the
// Wails module pinned in go.mod must already be in the Go module cache. Returns { exe } or
// { why }.
function wailsWindow() {
  const project = join(root, 'scripts', 'wails-window');
  const sources = ['main.go', 'go.mod', 'go.sum'].map((f) => join(project, f));
  if (!sources.every(existsSync)) return { why: 'scripts/wails-window is missing' };
  const go = spawnSync('go', ['version'], { encoding: 'utf8' });
  const sha = hashOf(sources, go.status === 0 ? go.stdout.trim() : '');
  const exe = join(cacheDir, `DocsWindow-${sha}${process.platform === 'win32' ? '.exe' : ''}`);
  if (existsSync(exe)) return { exe };
  if (go.status !== 0) return { why: 'go is not on PATH and the window has not been built yet' };
  mkdirSync(cacheDir, { recursive: true });
  const ldflags = process.platform === 'win32' ? '-s -w -H windowsgui' : '-s -w';
  console.log('Building the docs window once (Go, with Wails v3 from the module cache; nothing is downloaded)...');
  const started = Date.now();
  const built = spawnSync('go', ['build', '-ldflags', ldflags, '-o', exe, '.'], {
    cwd: project, encoding: 'utf8',
    env: { ...process.env, GOPROXY: 'off', GOFLAGS: '-mod=mod', GOTOOLCHAIN: 'local' },
  });
  if (built.status !== 0 || !existsSync(exe)) {
    const log = join(cacheDir, 'build.log');
    writeFileSync(log, `${built.stdout ?? ''}${built.stderr ?? ''}`);
    return { why: `the Go build failed (see ${log})` };
  }
  const mb = (statSync(exe).size / 1048576).toFixed(1);
  console.log(`Built ${exe} in ${((Date.now() - started) / 1000).toFixed(1)} s (${mb} MB).`);
  return { exe };
}

function hasWails() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0
    || (existsSync(cacheDir) && readdirSync(cacheDir).some((f) => f.startsWith('DocsWindow-')));
}

if (args.stop) {
  stopServers();
  console.log('Stopped the docs server. A window that is open stays open until you close it.');
  process.exit(0);
}

// Which window, decided before anything starts: only the Wails window needs no server.
const electrobunCli = join(root, 'node_modules', 'electrobun', 'bin', 'electrobun.cjs');
let shell = args.shell;
if ((args.window || args.check) && shell === 'auto') {
  shell = hasWails() ? 'wails' : existsSync(electrobunCli) ? 'electrobun' : 'deno';
}
if (args.check && shell === 'deno') {
  console.error('The check covers the Wails and Electrobun windows only.');
  process.exit(2);
}
const windowOnly = (args.window || args.check) && shell === 'wails';
if ((windowOnly || args.check) && args.dev) {
  console.error('The window shows the built site; run it without --dev.');
  process.exit(2);
}

// 1. The build, then the server unless the Wails window is all that was asked for. The
// Wails window leaves a server that is already running alone.
if (!args.dev) {
  const built = runAstro('build');
  if (built.status !== 0) {
    console.error(built.stdout, built.stderr);
    console.error('the site did not build, so nothing was shown');
    process.exit(1);
  }
}
let url = null;
if (windowOnly) {
  console.log(`Built site in ${dist}. The window reads it from there: no server, no port.`);
} else {
  stopServers();
  if (port === null) port = await freePort();
  url = addressFor(port, sprint);
  const kind = args.dev ? 'dev' : 'preview';
  const started = runAstro(kind, '--background', '--host', host, '--port', String(port));
  if (started.status !== 0) {
    console.error(started.stdout, started.stderr);
    console.error(`${kind} server did not start on port ${port}`);
    process.exit(1);
  }
  const mustAnswer = args.dev ? [url] : [url, searchIndexFor(port)];
  if (!(await ready(mustAnswer, 90))) {
    console.error(`server started but ${mustAnswer.join(' and ')} did not answer 200 within 90 s; stop it with: npm run live:stop`);
    process.exit(1);
  }
  console.log(`${sprint === null ? 'Sprints index (no sprint yet)' : 'Sprint page'}: ${url}`);
  console.log(process.env.DANDORI_DOCS_PORT
    ? `Port ${port}, from DANDORI_DOCS_PORT.`
    : `Port ${port}, a free one picked by the system (set DANDORI_DOCS_PORT to fix the port).`);
  console.log(args.dev
    ? 'Dev server: pages follow edits. The Search box does not work here; run without --dev for search.'
    : 'Built site: the Search box (Ctrl+K, or /) searches every page. Run this again after a ledger or page changes.');
  console.log('Stop the server with: npm run live:stop');
}

// 2. Optional window.
function openWails() {
  const found = wailsWindow();
  if (!found.exe) return found.why;
  const log = openSync(join(cacheDir, 'window.log'), 'a');
  spawn(found.exe, [dist, title, windowPathFor(sprint)], {
    detached: true, cwd: cacheDir, stdio: ['ignore', log, log],
  }).unref();
  return null;
}

function findLauncher(dir, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && (e.name === 'launcher' || e.name === 'launcher.exe')) return join(dir, e.name);
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const found = findLauncher(join(dir, e.name), depth + 1);
    if (found) return found;
  }
  return null;
}

// The Electrobun window: scripts/window, built once with the `electrobun` package of this
// site. Returns the launcher's path, or a line saying why there is none.
function electrobunLauncher() {
  const project = join(root, 'scripts', 'window');
  const sources = ['electrobun.config.ts', 'package.json', join('src', 'bun', 'index.ts')].map((f) => join(project, f));
  if (!existsSync(electrobunCli)) return { why: 'the site has no `electrobun` package (npm install adds it)' };
  if (!sources.every(existsSync)) return { why: 'scripts/window is missing' };
  const sha = hashOf([...sources, join(root, 'node_modules', 'electrobun', 'package.json')]);
  const out = join(project, 'build');
  const stamp = join(out, 'stamp.txt');
  let launcher = findLauncher(out);
  if (!launcher || !existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== sha) {
    const store = process.env.HUTCH_HOME || '.hutch in your home folder';
    console.log(`Building the Electrobun window. The first build downloads Hutch, Electrobun and Bun (about 250 MB) into ${store}.`);
    mkdirSync(out, { recursive: true });
    const log = join(project, 'build.log');
    const fd = openSync(log, 'w');
    const built = spawnSync(process.execPath, [electrobunCli, 'build', '--env=dev'], { cwd: project, env, stdio: ['ignore', fd, fd] });
    launcher = findLauncher(out);
    if (built.status !== 0 || !launcher) return { why: `the Electrobun build failed (see ${log})` };
    writeFileSync(stamp, sha + '\n');
  }
  return { launcher, project };
}

function openElectrobun() {
  const found = electrobunLauncher();
  if (!found.launcher) return found.why;
  const log = openSync(join(found.project, 'window.log'), 'a');
  spawn(found.launcher, [], {
    detached: true, cwd: dirname(found.launcher), stdio: ['ignore', log, log],
    env: { ...process.env, DANDORI_DOCS_URL: url, DANDORI_DOCS_TITLE: title },
  }).unref();
  return null;
}

function openDeno() {
  const deno = spawnSync('deno', ['--version'], { encoding: 'utf8' });
  if (deno.status !== 0) return 'deno is not on PATH';
  const shellSrc = join(root, 'scripts', 'shell.ts');
  const sha = hashOf([shellSrc]);
  const dir = cacheDir;
  const leaf = `DocsShell-${sha}`;
  // Deno 2.9 writes a folder named after the output with the program inside it; earlier
  // builds wrote the program itself. Look in both places.
  const name = `${leaf}${process.platform === 'win32' ? '.exe' : ''}`;
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  const built = () => [join(dir, name), join(dir, leaf, name)].find(isFile) ?? null;
  mkdirSync(dir, { recursive: true });
  let exe = built();
  if (!exe) {
    const made = spawnSync('deno', ['desktop', '--no-config', '--no-prompt', '-o', join(dir, leaf), shellSrc], { stdio: 'inherit' });
    exe = built();
    if (made.status !== 0 || !exe) return 'the deno desktop build failed';
  }
  // Send the window's output to a file so this command can return while the window stays open.
  const log = openSync(join(dir, 'shell.log'), 'a');
  spawn(exe, [url, title], { detached: true, env: { ...process.env, DANDORI_DOCS_PORT: String(port) }, stdio: ['ignore', log, log] }).unref();
  return null;
}

// The Wails window proves itself: the page runs one Pagefind search and clicks a link that
// leaves the site; the window logs the hand-over to the browser instead of opening it.
function checkWails() {
  const found = wailsWindow();
  if (!found.exe) {
    console.error(`No Wails window: ${found.why}.`);
    return 1;
  }
  const path = windowPathFor(sprint);
  const ran = spawnSync(found.exe, [dist, title, path], {
    cwd: cacheDir, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, DANDORI_WINDOW_SELF_CHECK: '1' },
  });
  const lines = `${ran.stdout ?? ''}\n${ran.stderr ?? ''}`.split(/\r?\n/)
    .filter((l) => l.startsWith('self-check') || l.startsWith('would open'));
  console.log(`Wails window on dist${path} (no server)`);
  for (const l of lines) console.log(`  ${l}`);
  if (lines.length === 0) console.error('The Wails window gave no self-check line.');
  return ran.status === 0 && lines.length > 0 ? 0 : 1;
}

// The Electrobun window's check: the page runs one search and tries to leave the site.
function checkElectrobun() {
  const found = electrobunLauncher();
  if (!found.launcher) {
    console.error(`No Electrobun window: ${found.why}.`);
    return 1;
  }
  const ran = spawnSync(found.launcher, [], {
    cwd: dirname(found.launcher), encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DANDORI_DOCS_URL: url, DANDORI_DOCS_TITLE: title, DANDORI_WINDOW_SELF_CHECK: '1' },
  });
  const line = `${ran.stdout ?? ''}\n${ran.stderr ?? ''}`.split(/\r?\n/).find((l) => l.startsWith('self-check'));
  if (!line) {
    console.error('The Electrobun window gave no self-check line.');
    return 1;
  }
  const refused = line.startsWith('self-check refused by the window');
  const seen = new URLSearchParams(line.slice(line.indexOf(': ') + 2));
  const sections = (seen.get('sections') ?? '').split(',').filter(Boolean);
  console.log(`Electrobun window on ${url}`);
  console.log(`  page title: ${seen.get('title')}`);
  console.log(`  search box on the page: ${seen.get('searchBox')}`);
  console.log(`  search "${seen.get('query')}" inside the window: ${seen.get('hits')} pages in ${sections.length} sections (${sections.join(', ')})`);
  console.log(`  a link that leaves the site: ${refused ? 'refused by the window and handed to the browser handler' : 'NOT refused by the window'}`);
  if (seen.get('error')) console.log(`  error in the page: ${seen.get('error')}`);
  return refused && sections.length >= 3 && !seen.get('error') ? 0 : 1;
}

if (args.check) {
  const status = shell === 'wails' ? checkWails() : checkElectrobun();
  if (!windowOnly) stopServers();
  const after = windowOnly ? 'window closed' : 'server stopped';
  console.log(status === 0 ? `window check: ok (${after})` : `window check: FAIL (${after})`);
  process.exit(status);
}

if (args.window) {
  // With no window named, an Electrobun failure falls back to Deno Desktop on the same server.
  const order = args.shell === 'auto' && shell === 'electrobun' ? ['electrobun', 'deno'] : [shell];
  const open = { wails: openWails, electrobun: openElectrobun, deno: openDeno };
  const names = { wails: 'Wails window', electrobun: 'Electrobun window', deno: 'Deno Desktop window' };
  let opened = null;
  for (const name of order) {
    const why = open[name]();
    if (why === null) {
      opened = name;
      break;
    }
    console.error(`No ${names[name]}: ${why}.`);
  }
  if (opened) {
    console.log(`Opened a ${names[opened]}.${opened === 'deno' ? '' : ' A link that leaves the site opens in your default browser.'}`);
  } else {
    console.error(windowOnly
      ? 'No window was opened. Run `npm run live` for an address to use in a browser.'
      : 'No window was opened. Use the address above in a browser.');
  }
}
