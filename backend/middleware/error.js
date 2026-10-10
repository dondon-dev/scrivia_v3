/** Centralized error handler producing the JSON shape the frontend expects. */
function errorHandler(err, _req, res, _next) {
  const status = err && err.status ? err.status : 500;
  const message = (err && err.message) || 'Internal server error';
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[api-error]', err);
  }
  res.status(status).json({
    code: status,
    message,
    error: message,
    data: {},
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    code: 404,
    message: `Route not found: ${req.method} ${req.path}`,
    data: {},
  });
}

module.exports = { errorHandler, notFoundHandler };
