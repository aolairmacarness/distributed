import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

const root = import.meta.dirname;

// Map each @jobber/* path alias from tsconfig.base.json to its source file.
// Without this, Vite resolves the npm workspace package instead, whose
// entry points at build output.
const tsPaths: Record<string, string[]> = JSON.parse(
  readFileSync(join(root, 'tsconfig.base.json'), 'utf-8'),
).compilerOptions.paths;
const alias = Object.fromEntries(
  Object.entries(tsPaths).map(([name, [target]]) => [name, join(root, target)]),
);

/** Vitest config for one Nx project. Call from <project>/vitest.config.mts. */
export function projectConfig(projectDir: string) {
  const projectPath = relative(root, projectDir);
  return defineConfig({
    root: projectDir,
    cacheDir: join(root, 'node_modules/.vite', projectPath),
    resolve: { alias },
    plugins: [
      // SWC instead of esbuild: Nest DI needs emitted decorator metadata.
      swc.vite({
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'es6' },
      }),
    ],
    test: {
      name: projectPath.split('/').pop(),
      environment: 'node',
      include: ['src/**/*.{spec,test}.ts'],
      passWithNoTests: true,
    },
  });
}
