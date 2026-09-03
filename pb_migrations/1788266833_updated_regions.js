/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("un4yjy6pwxq32ot")

  collection.listRule = ""
  collection.viewRule = ""

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("un4yjy6pwxq32ot")

  collection.listRule = null
  collection.viewRule = null

  return dao.saveCollection(collection)
})
