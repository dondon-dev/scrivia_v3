/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("duys1h751g7z9aq");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "duys1h751g7z9aq",
    "created": "2026-09-02 13:34:55.370Z",
    "updated": "2026-09-02 13:34:55.370Z",
    "name": "test_json_100",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "cwbbiaie",
        "name": "data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 100
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
})
