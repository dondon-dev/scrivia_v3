/// <reference path="../pb_data/types.d.ts" />
// Plantilla Allocation List persistence — one record per division + school
// level. The `rows` JSON column holds the full working sheet (all the 1)-(19)
// Annex R-I columns) so the UI can round-trip every encoded employee exactly,
// and `months` captures the current-year funding multiplier used in the
// (17)/(19) computations.
migrate((db) => {
  const dao = new Dao(db)
  try {
    dao.findCollectionByNameOrId("pal_lists")
    return null // already exists
  } catch (_) { /* fall through and create */ }

  const collection = new Collection({
    "id": "pal_lists",
    "created": "2026-09-05 00:00:00.000Z",
    "updated": "2026-09-05 00:00:00.000Z",
    "name": "pal_lists",
    "type": "base",
    "system": false,
    "schema": [
      { "id": "pl_regcode", "name": "regcode", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_divcode", "name": "divcode", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_region_name", "name": "region_name", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_division_name", "name": "division_name", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_agency", "name": "agency", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_education", "name": "education", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_level", "name": "level", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_months", "name": "months", "type": "number", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": 1, "max": 24, "noDecimal": false } },
      { "id": "pl_rows", "name": "rows", "type": "json", "system": false, "required": false, "presentable": false, "unique": false, "options": { "maxSize": 2000000 } },
      { "id": "pl_status", "name": "status", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_created_by", "name": "created_by", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "pl_updated_by", "name": "updated_by", "type": "text", "system": false, "required": false, "presentable": false, "unique": false, "options": { "min": null, "max": null, "pattern": "" } },
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_pal_list_scope ON pal_lists (regcode, divcode, level)"
    ],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  })

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  try {
    const collection = dao.findCollectionByNameOrId("pal_lists")
    return dao.deleteCollection(collection)
  } catch (_) {
    return null
  }
})