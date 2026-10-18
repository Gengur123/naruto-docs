// For pages of this site: when no built module of tools/dandori/web is served at the URL
// the component was given, the layout kernel that ships with the site does the editing.
// Both are the same MoonBit layout code; `npm test` compares their answers when both exist.
import { setEngineLoader } from './dd-engine.js';

setEngineLoader(() => import('../../lib/usagui-layout/kernel.js'));
