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
const fs = require('fs');
const path = require('path');

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

// Optional static SPA (backend/public) — serves the built React app and the API
// from the same origin. Mounted before the API routes; /api/* still hits the
// JSON handlers while every other GET falls back to index.html for SPA routing.
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR) && fs.statSync(PUBLIC_DIR).isDirectory()) {
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    if (path.extname(req.path)) return next();
    if (!req.accepts('html')) return next();
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

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

// Bind unconditionally. Hostinger serves this app with Phusion Passenger,
// which loads the startup file through its own bootstrap, so
// `require.main === module` is never true there — guarding on it means the
// process never listens and the deployment fails. Local importers/smoke tests
// that only want the app object can set SKIP_LISTEN=1.
if (process.env.SKIP_LISTEN !== '1') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Using database: ${DB_PATH} (${listCollections().length} collections)`);
  });
}

module.exports = app;
