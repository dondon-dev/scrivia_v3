/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "bkgpqbmeznzfuph",
    "created": "2026-09-02 13:34:55.406Z",
    "updated": "2026-09-02 13:34:55.406Z",
    "name": "test_json_500000",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "peady2qv",
        "name": "data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 500000
        }
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("bkgpqbmeznzfuph");

  return dao.deleteCollection(collection);
})
