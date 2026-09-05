/// <reference path="../pb_data/types.d.ts" />
// The Regions & Divisions view (src/views/RegionsDivisions.tsx) persists a
// per-division features JSON and an Active/Inactive status. PocketBase drops
// keys it doesn't know about, so write them to a plain object or toggle a
// feature and the field silently disappears — add the two columns explicitly.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("divisions")

  if (!collection.schema.getFieldByName("features")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "divfeatures",
      "name": "features",
      "type": "json",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "maxSize": 1000000 }
    }))
  }

  if (!collection.schema.getFieldByName("status")) {
    collection.schema.addField(new SchemaField({
      "system": false,
      "id": "divstatus",
      "name": "status",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }))
  }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("divisions")
  collection.schema.removeField("divfeatures")
  collection.schema.removeField("divstatus")
  return dao.saveCollection(collection)
})