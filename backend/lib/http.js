/** Small typed error used across controllers/services. */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function badRequest(message, code) {
  return new HttpError(400, message, code);
}

function unauthorized(message = 'Unauthorized') {
  return new HttpError(401, message);
}

function forbidden(message = 'Forbidden') {
  return new HttpError(403, message);
}

function notFound(message = 'Not found') {
  return new HttpError(404, message);
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound };
