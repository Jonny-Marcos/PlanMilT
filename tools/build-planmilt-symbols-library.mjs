import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const license = paths => paths.map(path => `${path}\n${read(path)}`).join('\n\n');
const notices = license([
    'LICENSE',
    'js/library/simbologia/LICENCE.txt',
    'js/library/milsymbol.LICENSE.txt',
    'js/library/tactical-graphics.LICENSE.txt'
]);

const contents = [
    "import * as milsymbolImport from 'milsymbol';",
    "import * as tacticalGraphics from '@zaes/tactical-graphics';",
    read('js/library/simbologia/chunk-vendors.4e5d8119.js'),
    read('js/library/simbologia/planmilt-generator.js'),
    read('js/features/brazilian-symbol-catalog.js'),
    read('js/features/tactical-graphics-catalog.js'),
    read('tools/planmilt-symbols-library-entry.js')
].join('\n');

await build({
    absWorkingDir: root,
    stdin: {
        contents,
        resolveDir: root,
        sourcefile: 'planmilt-symbols-library.js',
        loader: 'js'
    },
    outfile: 'js/library/planmilt-symbols.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'inline',
    logOverride: { 'duplicate-object-key': 'silent' },
    banner: { js: `/*! PlanMilT Symbols static library. Third-party licenses:\n${notices}\n*/` }
});
