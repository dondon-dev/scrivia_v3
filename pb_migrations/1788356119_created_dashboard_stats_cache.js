/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "ybbtev4ggj61n8d",
    "created": "2026-09-02 13:35:19.371Z",
    "updated": "2026-09-02 13:35:19.371Z",
    "name": "dashboard_stats_cache",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "yy5kl4bb",
        "name": "total_employees",
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
        "id": "jeykxjr6",
        "name": "total_monthly_payroll",
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
        "id": "5ucxjd7f",
        "name": "pending_approvals",
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
        "id": "ogqnyz2j",
        "name": "active_loans",
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
        "id": "snxtsqhq",
        "name": "group_stats",
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
        "id": "uo0pivlm",
        "name": "ded_totals_by_code",
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
        "id": "f2ok28rc",
        "name": "recent_employees",
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
        "id": "gzoa8r4i",
        "name": "regcode",
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
        "id": "vd07oi1r",
        "name": "divcode",
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
  const collection = dao.findCollectionByNameOrId("ybbtev4ggj61n8d");

  return dao.deleteCollection(collection);
})
