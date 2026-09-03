/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ka9ux9ggzrdk57l")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "bq63cgqq",
    "name": "region_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ka9ux9ggzrdk57l")

  // remove
  collection.schema.removeField("bq63cgqq")

  return dao.saveCollection(collection)
})
