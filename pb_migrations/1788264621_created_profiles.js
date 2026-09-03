/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "fs4o3ofvd8z5avy",
    "created": "2026-09-01 12:10:21.610Z",
    "updated": "2026-09-01 12:10:21.610Z",
    "name": "profiles",
    "type": "auth",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "sofsfwte",
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
        "id": "x2hikwpp",
        "name": "last_name",
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
        "id": "pwmemwpv",
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
        "id": "zp5flewa",
        "name": "status",
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
    "options": {
      "allowEmailAuth": false,
      "allowOAuth2Auth": false,
      "allowUsernameAuth": false,
      "exceptEmailDomains": null,
      "manageRule": null,
      "minPasswordLength": 0,
      "onlyEmailDomains": null,
      "onlyVerified": false,
      "requireEmail": false
    }
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy");

  return dao.deleteCollection(collection);
})
