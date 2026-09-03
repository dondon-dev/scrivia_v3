/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "7etu546l2nf8y5y",
    "created": "2026-09-02 13:35:19.403Z",
    "updated": "2026-09-02 13:35:19.403Z",
    "name": "security_settings",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "9nohxxuv",
        "name": "setting_key",
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
        "id": "htm5eewj",
        "name": "setting_value",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2097152
        }
      },
      {
        "system": false,
        "id": "xn0kqlal",
        "name": "description",
        "type": "text",
        "required": false,
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
        "id": "e63r40zj",
        "name": "updated_by",
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
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("7etu546l2nf8y5y");

  return dao.deleteCollection(collection);
})
