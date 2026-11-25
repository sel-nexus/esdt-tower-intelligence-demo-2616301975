/** Configure the local static workshop and its unit test runner. */
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'WORKSHOP_');
  const port = Number(env.WORKSHOP_PREVIEW_PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WORKSHOP_PREVIEW_PORT must be a valid TCP port.');
  }
  return {
    plugins: [react()],
    preview: { port, strictPort: true },
    test: { include: ['tests/**/*.test.{js,jsx}'] },
  };
});
