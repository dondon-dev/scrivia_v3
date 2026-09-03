/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("3mwerpmhvbhaj0g");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "3mwerpmhvbhaj0g",
    "created": "2026-09-02 13:32:42.055Z",
    "updated": "2026-09-02 13:32:42.071Z",
    "name": "test_collection",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "12jqemce",
        "name": "first_name",
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
        "id": "rutl84yw",
        "name": "age",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "xbr8smcx",
        "name": "email",
        "type": "text",
        "required": true,
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
