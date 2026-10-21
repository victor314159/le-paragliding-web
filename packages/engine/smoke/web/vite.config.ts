import { defineConfig } from 'vite';

// Module Workers, as the package README recommends.
export default defineConfig({ worker: { format: 'es' } });
