import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://iishyfishyy.github.io',
  base: '/mermaid-mcp-live',
  output: 'static',
  integrations: [sitemap()],
});
