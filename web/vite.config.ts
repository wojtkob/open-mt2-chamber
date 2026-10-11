/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build/dev configuration for the open-mt2 visual client (React SPA).
 *
 * The SPA never talks to the game/auth servers directly (there is no TCP in the
 * browser): every request goes to the web client bridge over HTTP, which the
 * Vite dev server proxies to `WEB_BRIDGE_URL` (default `http://127.0.0.1:8080`,
 * the bridge's default listen address). When the SPA is served by the bridge
 * itself (the built `web/dist` layout, or `npm run web`) everything is already
 * same-origin and no proxy is involved.
 *
 * `@` aliases the repository's `src/` tree so the SPA can import the exact
 * types the bridge serializes over the wire (`src/webclient/contract.ts`).
 */
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('../src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.WEB_BRIDGE_URL ?? 'http://127.0.0.1:8080',
                changeOrigin: true,
                ws: false,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: ['src/test/setup.ts'],
        restoreMocks: true,
    },
});
