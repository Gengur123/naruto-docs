// What the .astro wrappers share while the site builds: the layout kernel as an engine,
// and whether a newer built module is served for the browser.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { layout_ascii, layout_json } from '../../lib/usagui-layout/kernel.js';
import { entryOf, layoutOf, layoutsOf } from './dd-annotate.js';

export const kernel = { layout_json };

// The layout of one struct, or { error }.
export const layoutAtBuild = (struct) => layoutOf(kernel, struct);

// The declared layout and the reordered one, or { error }.
export const layoutsAtBuild = (struct) => layoutsOf(kernel, struct);

// The plain-text byte map, for the page without JavaScript.
export const asciiAtBuild = (struct) => layout_ascii(JSON.stringify(entryOf(struct)));

// `npm run sync-layout` (dandori-skills repository) or a copy by hand puts the built
// module of tools/dandori/web at public/dandori/layout.js. When it is there the browser
// uses it; when it is not, the kernel above is used and no request is made for it.
export const ENGINE_URL = '/dandori/layout.js';
export const engineUrl = () => (existsSync(join(process.cwd(), 'public', 'dandori', 'layout.js')) ? ENGINE_URL : undefined);
