/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy")

  collection.listRule = ""
  collection.viewRule = ""

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy")

  collection.listRule = null
  collection.viewRule = null

  return dao.saveCollection(collection)
})
