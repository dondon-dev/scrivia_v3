/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("0dngztev985avxr");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "0dngztev985avxr",
    "created": "2026-09-01 13:50:01.152Z",
    "updated": "2026-09-01 13:50:01.152Z",
    "name": "payroll_number_counter",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "bmc9sktf",
        "name": "year",
        "type": "number",
        "required": true,
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
        "id": "2vsk7lta",
        "name": "month",
        "type": "number",
        "required": true,
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
        "id": "lynd3gux",
        "name": "last_number",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
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
