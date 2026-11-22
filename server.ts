import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

const app = express();
const port = Number(process.env.PORT) || 3000;

// Ensure Service Worker and Web App Manifest are always checked for updates
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distDir, 'sw.js'));
});

app.get('/manifest.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('application/manifest+json');
  res.sendFile(path.join(distDir, 'manifest.json'));
});

app.use(
  express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

// SPA fallback
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Live FX Console listening on http://0.0.0.0:${port}`);
});
