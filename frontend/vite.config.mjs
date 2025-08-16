import path from 'path';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr';

export default defineConfig(() => {
    return {
      root: path.resolve(__dirname, 'src'),
      publicDir: '../public',
      resolve: {
        alias: {
          '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
        }
      },
      base: '/',
      build: {
        outDir: '../../backend/app/views/',
        emptyOutDir: true,
        copyPublicDir: true,
        rollupOptions: {
          output: {
            entryFileNames: `assets/[name].js`,
            chunkFileNames: `assets/[name].js`,
            assetFileNames: (assetInfo) => {
              // Keep favicons at root level
              if (assetInfo.name === 'favicon.ico' || assetInfo.name === 'dark-favicon.ico') {
                return '[name][extname]';
              }
              return `assets/[name].[ext]`;
            }
          }
        }
      },
      plugins: [
        react(),
        svgr()
      ],
      server: {    
        open: false,
        port: 3000,
        host: true,
        },
      watch: {
        usePolling: true,
        pollInterval: 1000,
      }
    };
  });
