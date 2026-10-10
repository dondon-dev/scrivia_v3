/**
 * Generic collection REST controller. Mirrors PocketBase's
 * /api/collections/:collection/records endpoints, backed by app.db.
 */
const svc = require('../services/collection.service');
const { getTable } = require('../config/schema');
const { badRequest, notFound } = require('../lib/http');

function ensureTable(name) {
  const table = getTable(name);
  if (!table) throw notFound(`Collection "${name}" not found`);
  return table;
}

async function query(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const b = req.body || {};

  if (b.count) {
    const total = svc.countRows(collection, b.filter);
    return res.json({ data: total, total });
  }

  const limit = b.limit == null ? 500 : Number(b.limit);
  const offset = b.offset == null ? 0 : Number(b.offset);

  let rows = svc.selectRows(collection, {
    filter: b.filter,
    sort: b.sort,
    fields: b.fields,
    limit: b.single ? 1 : limit,
    offset,
  });

  if (b.single || b.maybeSingle) {
    return res.json({ data: rows[0] || null });
  }

  const total = b.noCount ? rows.length : svc.countRows(collection, b.filter);
  return res.json({ data: rows, total, page: b.page, perPage: limit });
}

async function list(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const rows = svc.selectRows(collection, {
    sort: req.query.sort,
    limit: req.query.limit ? Number(req.query.limit) : 500,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  return res.json({ data: rows, total: rows.length });
}

async function getOne(req, res) {
  const { collection, id } = req.params;
  ensureTable(collection);
  const row = svc.getById(collection, id);
  if (!row) throw notFound(`Record ${id} not found`);
  return res.json(row);
}

async function create(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const body = req.body;
  if (Array.isArray(body)) {
    const created = body.map((item) => svc.insertOne(collection, item));
    return res.status(201).json(created);
  }
  if (!body || typeof body !== 'object') throw badRequest('Invalid payload');
  const created = svc.insertOne(collection, body);
  return res.status(201).json(created);
}

async function update(req, res) {
  const { collection, id } = req.params;
  ensureTable(collection);
  const updated = svc.updateById(collection, id, req.body || {});
  return res.json(updated);
}

async function updateByFilter(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const { filter, data } = req.body || {};
  if (!filter) throw badRequest('filter is required');
  const updated = svc.updateByFilter(collection, filter, data || {});
  return res.json(updated);
}

async function upsert(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const body = req.body;
  if (Array.isArray(body)) {
    const result = body.map((item) => svc.upsertOne(collection, item));
    return res.json(result);
  }
  if (!body || typeof body !== 'object') throw badRequest('Invalid payload');
  return res.json(svc.upsertOne(collection, body));
}

async function remove(req, res) {
  const { collection, id } = req.params;
  ensureTable(collection);
  const changes = svc.deleteById(collection, id);
  return res.json({ deleted: changes });
}

async function removeByFilter(req, res) {
  const { collection } = req.params;
  ensureTable(collection);
  const filter = (req.body && req.body.filter) || null;
  if (!filter) throw badRequest('filter is required for bulk delete');
  const deleted = svc.deleteByFilter(collection, filter);
  return res.json({ deleted, count: deleted });
}

module.exports = {
  query,
  list,
  getOne,
  create,
  update,
  updateByFilter,
  upsert,
  remove,
  removeByFilter,
};
