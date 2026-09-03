/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "2wkqzyq9sfmg3i7",
    "created": "2026-09-02 13:34:55.349Z",
    "updated": "2026-09-02 13:34:55.349Z",
    "name": "test_json_1",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "udyyawjy",
        "name": "data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 1
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
  const collection = dao.findCollectionByNameOrId("2wkqzyq9sfmg3i7");

  return dao.deleteCollection(collection);
})
