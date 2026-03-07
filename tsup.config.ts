import { defineConfig } from 'tsup';

export default defineConfig({
  noExternal: ['electron-updater'],
});
