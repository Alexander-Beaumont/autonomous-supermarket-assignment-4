import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeSchema, openDatabase } from './db.js';
import { createRunsRouter } from './routes/runs.js';

const db = openDatabase();
initializeSchema(db);

const app = express();
const PORT = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'autonomous-supermarket-api'
  });
});

app.use('/api/runs', createRunsRouter(db));

/* Serve the built React frontend */
app.use(express.static(frontendDist));

/* React SPA fallback */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(frontendDist, 'index.html'));
});

/* API / unknown route fallback */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);

  const status = /not found/i.test(error.message)
    ? 404
    : 500;

  res.status(status).json({
    error: error.message || 'Internal server error.'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Autonomous Supermarket listening on port ${PORT}`
  );
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
