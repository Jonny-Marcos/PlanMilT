import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('@zaes/tactical-graphics/package.json'));
const outputDirectory = resolve(projectRoot, 'js/library');

mkdirSync(outputDirectory, { recursive: true });

await build({
    absWorkingDir: projectRoot,
    entryPoints: ['tools/tactical-graphics-entry.js'],
    outfile: 'js/library/tactical-graphics.min.js',
    bundle: true,
    minify: true,
    legalComments: 'none',
    platform: 'browser',
    target: ['es2020']
});

copyFileSync(
    resolve(packageRoot, 'LICENSE'),
    resolve(outputDirectory, 'tactical-graphics.LICENSE.txt')
);
