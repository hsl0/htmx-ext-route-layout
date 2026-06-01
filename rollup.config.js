import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

/** @type {import('rollup').OutputOptions} */
const commonOutputOptions = {
    format: 'iife',
    sourcemap: true,
    globals: {
        'htmx.org': 'htmx',
    },
};

/** @type {import('rollup').RollupOptions} */
export default {
    plugins: [
        typescript()
    ],
    input: 'src/index.ts',
    output: [
        {
            ...commonOutputOptions,
            file: 'dist/index.js',
        },
        {
            ...commonOutputOptions,
            plugins: [
                terser()
            ],
            compact: true,
            file: 'dist/index.min.js',
        }
    ],
    external: ['htmx.org'],
};
