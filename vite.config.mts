import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { notBundle } from 'vite-plugin-electron/plugin'
import electron from 'vite-plugin-electron/simple'

const root = resolve('.')
const alias = { '@app': resolve(root, 'src/app') }

const startElectron = async ({
  startup,
}: {
  startup: (
    argv?: string[],
    options?: import('node:child_process').SpawnOptions,
  ) => Promise<boolean>
}): Promise<void> => {
  await startup(['.'], { cwd: root })
}

const electronVite = (outDir: string) => ({
  root,
  plugins: [notBundle({})],
  resolve: { alias },
  build: {
    outDir: resolve(root, outDir),
    emptyOutDir: true,
  },
})

export default defineConfig({
  root: resolve(root, 'src/app/code/electron-browser'),
  base: './',
  publicDir: false,
  plugins: [
    electron({
      main: {
        entry: resolve(root, 'src/app/code/electron-main/index.ts'),
        onstart: startElectron,
        vite: electronVite('out/main'),
      },
      preload: {
        input: resolve(root, 'src/app/base/parts/sandbox/electron-browser/preload.ts'),
        onstart: startElectron,
        vite: electronVite('out/preload'),
      },
    }),
  ],
  resolve: { alias },
  build: {
    outDir: resolve(root, 'out/renderer'),
    emptyOutDir: true,
  },
})
