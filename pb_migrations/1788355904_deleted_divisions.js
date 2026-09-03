/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("cmps62yxo0n46hm");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "cmps62yxo0n46hm",
    "created": "2026-09-01 12:10:21.639Z",
    "updated": "2026-09-01 15:45:54.126Z",
    "name": "divisions",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "lraxawwt",
        "name": "division_code",
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
        "id": "d6fvhgpe",
        "name": "division_name",
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
        "id": "ues7agor",
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
