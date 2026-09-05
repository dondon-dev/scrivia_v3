/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy");

  // Add all missing UserProfile fields from types/auth.ts
  const newFields = [
    {
      "system": false,
      "id": "mobile_number",
      "name": "mobile_number",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "username",
      "name": "username",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": true,
      "options": { "min": null, "max": null, "pattern": "^[a-zA-Z0-9_]{3,}$" }
    },
    {
      "system": false,
      "id": "region_id",
      "name": "region_id",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "division_id",
      "name": "division_id",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "assigned_stacode",
      "name": "assigned_stacode",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "^\\d{1,4}$" }
    },
    {
      "system": false,
      "id": "office_assignment",
      "name": "office_assignment",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "position_designation",
      "name": "position_designation",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "employee_number",
      "name": "employee_number",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": true,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "rejection_reason",
      "name": "rejection_reason",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "approved_by",
      "name": "approved_by",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "approved_at",
      "name": "approved_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "rejected_by",
      "name": "rejected_by",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "rejected_at",
      "name": "rejected_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "disabled_by",
      "name": "disabled_by",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "disabled_at",
      "name": "disabled_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "mfa_enabled",
      "name": "mfa_enabled",
      "type": "bool",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "failed_login_attempts",
      "name": "failed_login_attempts",
      "type": "number",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": 0, "max": null, "noDecimal": true }
    },
    {
      "system": false,
      "id": "locked_until",
      "name": "locked_until",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "last_login_at",
      "name": "last_login_at",
      "type": "date",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
    {
      "system": false,
      "id": "last_login_ip",
      "name": "last_login_ip",
      "type": "text",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false,
      "id": "email_verified",
      "name": "email_verified",
      "type": "bool",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {}
    },
  ];

  for (const field of newFields) {
    // Check if field already exists
    const exists = collection.schema.some(f => f.name === field.name);
    if (!exists) {
      collection.schema.push(field);
    }
  }

  // Also fix auth options - enable email auth and require email
  collection.options.allowEmailAuth = true;
  collection.options.requireEmail = true;
  collection.options.minPasswordLength = 8;
  collection.options.onlyVerified = true;

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("fs4o3ofvd8z5avy");

  // Remove the added fields
  const fieldsToRemove = [
    "mobile_number", "username", "region_id", "division_id",
    "assigned_stacode", "office_assignment", "position_designation",
    "employee_number", "rejection_reason", "approved_by", "approved_at",
    "rejected_by", "rejected_at", "disabled_by", "disabled_at",
    "mfa_enabled", "failed_login_attempts", "locked_until",
    "last_login_at", "last_login_ip", "email_verified"
  ];

  collection.schema = collection.schema.filter(f => !fieldsToRemove.includes(f.name));

  // Restore original auth options
  collection.options.allowEmailAuth = false;
  collection.options.requireEmail = false;
  collection.options.minPasswordLength = 0;
  collection.options.onlyVerified = false;

  return dao.saveCollection(collection);
});