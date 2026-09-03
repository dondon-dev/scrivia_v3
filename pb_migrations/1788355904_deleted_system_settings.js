/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("o6dx1kcfukk5yfb");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "o6dx1kcfukk5yfb",
    "created": "2026-09-01 12:08:35.370Z",
    "updated": "2026-09-01 16:23:52.505Z",
    "name": "system_settings",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "s5x0fsob",
        "name": "key",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "anyq0xt8",
        "name": "value",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
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
