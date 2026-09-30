import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 등 하위 경로 배포 시: BASE_PATH=/willgrow-naesin/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  build: { outDir: 'dist' },
  test: { environment: 'node' },
});
