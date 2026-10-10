/**
 * Structured filter -> parameterized SQL compiler.
 *
 * The frontend builder no longer produces PocketBase filter strings. Each
 * query is sent as a JSON tree:
 *
 *   { op:'and'|'or', conditions:[ node|leaf ] }
 *   leaf = { col, op, val }
 *
 *   op ∈ eq neq gt gte lt lte in notin contains ncontains startswith
 *         endswith is
 *
 * Values are bound as parameters — never interpolated — so this is safe from
 * SQL injection. Column names are validated against the introspected schema.
 */
const { getTable } = require('../config/schema');
const { badRequest } = require('./http');

const AGGREGATE_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notin',
  'contains', 'ncontains', 'startswith', 'endswith', 'is']);

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function resolveColumn(table, wanted) {
  if (table.columns.has(wanted)) return wanted;
  // Timestamp aliases: the old adapter mapped created_at->created / updated_at->updated.
  if (wanted === 'created_at' && table.columns.has('created')) return 'created';
  if (wanted === 'updated_at' && table.columns.has('updated')) return 'updated';
  if (wanted === 'created' && table.columns.has('created_at')) return 'created_at';
  if (wanted === 'updated' && table.columns.has('updated_at')) return 'updated_at';
  return null;
}

/** Compile a filter tree. Returns { sql, params }. */
function compileFilter(tableName, filter) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);

  const params = [];

  function leaf(node) {
    const col = resolveColumn(table, node.col);
    if (!col) throw badRequest(`Unknown field "${node.col}" on ${tableName}`);
    const q = quoteIdent(col);
    const op = String(node.op || 'eq').toLowerCase();
    if (!AGGREGATE_OPS.has(op)) throw badRequest(`Unsupported filter op "${node.op}"`);

    const push = (v) => {
      params.push(v);
      return '?';
    };

    switch (op) {
      case 'eq':
        if (node.val === null) return `${q} IS NULL`;
        return `${q} = ${push(node.val)}`;
      case 'neq':
        if (node.val === null) return `${q} IS NOT NULL`;
        return `${q} != ${push(node.val)}`;
      case 'gt':
        return `${q} > ${push(node.val)}`;
      case 'gte':
        return `${q} >= ${push(node.val)}`;
      case 'lt':
        return `${q} < ${push(node.val)}`;
      case 'lte':
        return `${q} <= ${push(node.val)}`;
      case 'in': {
        const arr = Array.isArray(node.val) ? node.val : [node.val];
        if (arr.length === 0) return '1=0';
        return `${q} IN (${arr.map(push).join(', ')})`;
      }
      case 'notin': {
        const arr = Array.isArray(node.val) ? node.val : [node.val];
        if (arr.length === 0) return '1=1';
        return `${q} NOT IN (${arr.map(push).join(', ')})`;
      }
      case 'contains':
        return `${q} LIKE ${push(`%${node.val}%`)}`;
      case 'ncontains':
        return `${q} NOT LIKE ${push(`%${node.val}%`)}`;
      case 'startswith':
        return `${q} LIKE ${push(`${node.val}%`)}`;
      case 'endswith':
        return `${q} LIKE ${push(`%${node.val}`)}`;
      case 'is':
        if (node.val === null || node.val === undefined) {
          return `(${q} IS NULL OR ${q} = '')`;
        }
        return `(${q} IS NOT NULL AND ${q} != '')`;
      default:
        throw badRequest(`Unsupported filter op "${node.op}"`);
    }
  }

  function walk(node) {
    if (!node) return '1=1';
    const op = String(node.op || '').toLowerCase();
    if (op === 'and' || op === 'or') {
      const parts = (node.conditions || []).map(walk).filter(Boolean);
      if (parts.length === 0) return op === 'and' ? '1=1' : '1=0';
      return `(${parts.join(op === 'and' ? ' AND ' : ' OR ')})`;
    }
    return leaf(node);
  }

  const sql = filter ? walk(filter) : '1=1';
  return { sql: sql || '1=1', params };
}

/** Compile a PocketBase-style sort string ("-created,sort_order") to SQL. */
function compileSort(tableName, sort) {
  if (!sort) return '';
  const table = getTable(tableName);
  if (!table) return '';
  const parts = String(sort)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const raw of parts) {
    let dir = 'ASC';
    let field = raw;
    if (raw.startsWith('-')) {
      dir = 'DESC';
      field = raw.slice(1);
    } else if (raw.startsWith('+')) {
      field = raw.slice(1);
    }
    const col = resolveColumn(table, field);
    if (col) out.push(`${quoteIdent(col)} ${dir}`);
  }
  return out.length ? `ORDER BY ${out.join(', ')}` : '';
}

module.exports = { compileFilter, compileSort, resolveColumn };
