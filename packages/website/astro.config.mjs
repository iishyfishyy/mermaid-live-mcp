import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://iishyfishyy.github.io',
  base: '/mermaid-live-mcp',
  output: 'static',
  integrations: [sitemap()],
});
