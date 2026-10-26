/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import type { ServerResponse } from 'node:http';
import { type ProxyOptions, defineConfig } from 'vite';

// When the gateway is not running, answer /api/status with an explicit "offline" body
// instead of a proxy 500, so the app shows "Gateway offline" without a console error.
const gateway: ProxyOptions = {
  target: 'http://127.0.0.1:8440',
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (_err, req, res) => {
      const r = res as ServerResponse;
      if (r.headersSent) return;
      const isStatus = (req.url ?? '').startsWith('/api/status');
      r.writeHead(isStatus ? 200 : 502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      r.end(JSON.stringify({ gateway: 'offline', error: 'Gateway offline: start it with pnpm gateway' }));
    });
  },
};

export default defineConfig({
  plugins: [iwsdkDev()],
  server: {
    host: '0.0.0.0',
    port: 8091,
    open: false,
    // the gateway (packages/server) holds MODEL_API_KEY; the browser only talks to /api
    proxy: { '/api': gateway },
  },
  preview: { proxy: { '/api': gateway } },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
