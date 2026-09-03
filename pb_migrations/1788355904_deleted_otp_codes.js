/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("clz1yyu3y16nkul");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "clz1yyu3y16nkul",
    "created": "2026-09-01 12:08:35.514Z",
    "updated": "2026-09-01 15:45:54.139Z",
    "name": "otp_codes",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "zbzsfonk",
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
      },
      {
        "system": false,
        "id": "tvoiaqaq",
        "name": "code_hash",
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
        "id": "4rlykoa5",
        "name": "expires_at",
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
        "id": "t9kpuxln",
        "name": "used",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
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
