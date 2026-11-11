import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
for (const [name, source, output] of [
    ['milsymbol', 'dist/milsymbol.js', 'milsymbol.min.js'],
    ['milstandard-e', 'milstandard.js', 'milstandard-e.js']
]) {
    const packageRoot = dirname(require.resolve(`${name}/package.json`));
    copyFileSync(resolve(packageRoot, source), resolve(root, 'js/library', output));
    copyFileSync(resolve(packageRoot, 'LICENSE'), resolve(root, 'js/library', `${name}.LICENSE.txt`));
}
