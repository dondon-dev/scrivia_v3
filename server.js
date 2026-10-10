/**
 * Deployment entry point.
 *
 * The host runs `npm install` and `node server.js` from the repository root.
 * The API implementation lives in backend/server.js, which exports the Express
 * app WITHOUT binding a port; we import it here and listen on the host's port.
 *
 * The database path is resolved inside backend/config/db.js relative to that
 * file (backend/app.db), so the working directory does not matter.
 */
const app = require('./backend/server');

const PORT = process.env.APP_PORT || process.env.PORT || 3000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SCRIVIA API listening on port ${PORT}`);
});
