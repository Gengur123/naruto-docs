// The choices `npm run live` makes before it starts anything: which sprint's page to open,
// which port to use, which window, and what address or path that gives. Kept apart from
// live.mjs so a test can run it without a server.

export const host = '127.0.0.1';

// A sprint name is digits, a dash, then lower-case words joined by dashes: 03-save-format.
// This is the same rule `dandori sprint new` applies.
export function isSprintName(name) {
  return /^[0-9]{2,}-[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

// The port from DANDORI_DOCS_PORT, or null when it is unset or empty: then live.mjs asks the
// system for a free port, so two projects' docs never fight over one. Anything else that is
// not a whole number from 1 to 65535 is an error, not a silent fallback.
export function portFrom(env) {
  const raw = (env.DANDORI_DOCS_PORT ?? '').trim();
  if (raw === '') return null;
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(`DANDORI_DOCS_PORT must be a whole number from 1 to 65535, got "${raw}"`);
  }
  return Number(raw);
}

// The newest sprint is the one with the highest leading number (10-x is newer than 9-x).
// Two names with the same number are told apart by plain text order. `files` are the file
// names found under ledgers/sprints; anything that is not `<sprint name>.json` is ignored.
// Returns null when there is none.
export function newestSprint(files) {
  const names = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter(isSprintName);
  let best = null;
  for (const name of names) {
    if (best === null) {
      best = name;
      continue;
    }
    const a = BigInt(name.slice(0, name.indexOf('-')));
    const b = BigInt(best.slice(0, best.indexOf('-')));
    if (a > b || (a === b && name > best)) best = name;
  }
  return best;
}

const usage = 'npm run live -- [<nn-name>] [--window | --window=wails | --window=electrobun | --window=deno] [--dev] [--stop] [--check]';
export const shells = ['wails', 'electrobun', 'deno'];

// '[<sprint name>] [--window[=wails|electrobun|deno]] [--dev] [--stop] [--check]', in any order.
// Returns { sprint, window, shell, dev, stop, check }. sprint is null when the caller named none.
// shell is which window to open: 'auto' takes Wails when Go is on PATH (or the window is
// already built), then Electrobun, then Deno Desktop. The Wails window reads the built site
// from dist/ with no server; the other two need the server. dev asks for the dev server
// (pages follow edits, no search) in place of the built site. stop only stops a server
// started earlier. check runs the window's own check and closes it.
export function parseArgs(argv) {
  let sprint = null;
  let window = false;
  let shell = 'auto';
  let dev = false;
  let stop = false;
  let check = false;
  for (const arg of argv) {
    if (arg === '--window') {
      window = true;
    } else if (arg.startsWith('--window=') && shells.includes(arg.slice('--window='.length))) {
      window = true;
      shell = arg.slice('--window='.length);
    } else if (arg === '--dev') {
      dev = true;
    } else if (arg === '--stop') {
      stop = true;
    } else if (arg === '--check') {
      check = true;
    } else if (arg.startsWith('-')) {
      throw new Error('unknown option ' + arg + '; usage: ' + usage);
    } else if (sprint !== null) {
      throw new Error('only one sprint name is taken, got "' + sprint + '" and "' + arg + '"');
    } else if (!isSprintName(arg)) {
      throw new Error('"' + arg + '" is not a sprint name; use a number, a dash and lower-case words, like 03-save-format');
    } else {
      sprint = arg;
    }
  }
  return { sprint, window, shell, dev, stop, check };
}

// The page the Wails window opens, as a path inside dist/: the sprint's page, or the site's
// front page when there is no sprint yet.
export function windowPathFor(sprint) {
  return sprint === null ? '/' : `/sprints/${sprint}/`;
}

// The page to wait for and print. With a sprint, that sprint's page. With none, the sprints
// index that `dandori sprint render` writes for agents, which answers even before the first
// sprint exists.
export function addressFor(port, sprint) {
  return sprint === null
    ? `http://${host}:${port}/llms/index.md`
    : `http://${host}:${port}/sprints/${sprint}/`;
}

// The file the built site must serve for the Search box to work. The dev server does not
// have it, so a 200 here also proves the answer comes from the built site and not from a dev
// server left running on the same port.
export function searchIndexFor(port) {
  return 'http://' + host + ':' + port + '/pagefind/pagefind-entry.json';
}
