/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "f7hzqzoe9okya7r",
    "created": "2026-09-02 13:31:45.140Z",
    "updated": "2026-09-02 13:31:45.140Z",
    "name": "payroll_number_counter",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "hppr75h0",
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
        "id": "0oboxd2g",
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
        "id": "j6ukjroa",
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
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("f7hzqzoe9okya7r");

  return dao.deleteCollection(collection);
})
