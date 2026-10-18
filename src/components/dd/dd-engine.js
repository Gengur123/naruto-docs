// Where the components get the layout code in the browser.
//
// The engine is the built MoonBit module of tools/dandori/web (or the layout kernel that
// ships with the site): an object with `layout_json(text)`. A page gives it one of three ways:
//
//   setEngine(module)                 the page already holds the module (a standalone file)
//   setEngineLoader(() => import(..)) the page knows how to fetch it (the Astro wrapper)
//   <dd-struct-showcase engine="/dandori/layout.js">   a URL of the built module
//
// A URL on the element is tried first, then the loader. Without any of them, or when all
// fail, the components keep showing the numbers they were given and editing stays off.

let fixed;
let loader;
const byUrl = new Map();

export function setEngine(engine) {
  fixed = engine;
}

export function setEngineLoader(load) {
  loader = load;
}

function usable(engine) {
  if (!engine || typeof engine.layout_json !== 'function') throw new Error('the layout module has no layout_json');
  return engine;
}

// Imports a built module that the site serves as a plain file. The text is fetched and
// imported from memory, because a development server (Vite) rewrites an import of a URL
// and then refuses to serve a file from its public folder as source.
async function importFrom(url) {
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`${url}: ${answer.status}`);
  const held = URL.createObjectURL(new Blob([await answer.text()], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ held);
  } finally {
    URL.revokeObjectURL(held);
  }
}

// Resolves with the engine, or rejects with why there is none.
export async function getEngine(url) {
  if (fixed) return usable(fixed);
  if (url) {
    if (!byUrl.has(url)) byUrl.set(url, importFrom(url).then(usable));
    try {
      return await byUrl.get(url);
    } catch (error) {
      if (!loader) throw error;
    }
  }
  if (loader) return usable(await loader());
  throw new Error('no layout module was given');
}
