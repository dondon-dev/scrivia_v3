/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "wqu2du590ok244h",
    "created": "2026-09-01 12:08:35.076Z",
    "updated": "2026-09-01 12:08:35.076Z",
    "name": "role_permissions",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "4ttlvglv",
        "name": "role",
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
        "id": "lazzvgpy",
        "name": "permission",
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
        "id": "svrkmzfh",
        "name": "granted",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("wqu2du590ok244h");

  return dao.deleteCollection(collection);
})
