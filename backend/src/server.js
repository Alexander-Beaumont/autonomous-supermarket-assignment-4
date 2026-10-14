import express from 'express';
import cors from 'cors';
import { initializeSchema, openDatabase } from './db.js';
import { createRunsRouter } from './routes/runs.js';

const db = openDatabase();
initializeSchema(db);

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin:true }));
app.use(express.json({ limit:'1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status:'ok', service:'autonomous-supermarket-api' });
});
app.use('/api/runs', createRunsRouter(db));

app.use((req, res) => {
  res.status(404).json({ error:'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  const status = /not found/i.test(error.message) ? 404 : 500;
  res.status(status).json({ error:error.message || 'Internal server error.' });
});

const server = app.listen(PORT, () => {
  console.log(`Autonomous Supermarket API listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
