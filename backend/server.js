/**
 * Express API server — drop-in backend for the SCRIVIA payroll app.
 *
 * Architecture:
 *   React frontend  ->  Express (this file + routes/)  ->  SQLite (app.db)
 *
 * app.db is the EXISTING PocketBase database (same schema, same rows). Nothing
 * here creates, migrates or deletes tables — it is a new API in front of the
 * data that is already there.
 */
const express = require('express');
const cors = require('cors');

const { DB_PATH } = require('./config/db');
const { listCollections } = require('./config/schema');
const { errorHandler, notFoundHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth.routes');
const rpcRoutes = require('./routes/rpc.routes');
const collectionRoutes = require('./routes/collection.routes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.get('/', (_req, res) => res.send('API Running'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', db: DB_PATH, collections: listCollections().length }));

// Order matters: named auth + RPC routes are registered before the generic
// collection router so `/api/employees/query` is not read as collection "employees".
app.use('/api', authRoutes);
app.use('/api', rpcRoutes);
// Generic record CRUD lives under /api/db to avoid colliding with RPC names
// such as `employees/query` (both would otherwise match /api/:collection/query).
app.use('/api/db', collectionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.APP_PORT || process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Using database: ${DB_PATH} (${listCollections().length} collections)`);
  });
}

module.exports = app;
