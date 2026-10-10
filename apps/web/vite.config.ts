import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('apps/web'),plugins:[react()],server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:3000'}},build:{outDir:'dist',emptyOutDir:true}});
