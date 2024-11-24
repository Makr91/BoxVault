import path from 'path';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr';
//import { visualizer } from 'rollup-plugin-visualizer';
//visualizer({ emitFile: true, filename: 'stats.html' })
export default defineConfig(() => {
    return {
      root: path.resolve(__dirname, 'src'),
      resolve: {
        alias: {
          '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
        }
      },
      base: '/',
      build: {
        outDir: '../../backend/app/views/',
        emptyOutDir: true,
        rollupOptions: {
          output: {
            entryFileNames: `assets/[name].js`,
            chunkFileNames: `assets/[name].js`,
            assetFileNames: `assets/[name].[ext]`
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
  