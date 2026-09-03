/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "0qp9b9zk2ogkjh6",
    "created": "2026-09-02 13:34:55.434Z",
    "updated": "2026-09-02 13:34:55.434Z",
    "name": "test_json_2097152",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "6ibgmhzl",
        "name": "data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2097152
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
  const collection = dao.findCollectionByNameOrId("0qp9b9zk2ogkjh6");

  return dao.deleteCollection(collection);
})
