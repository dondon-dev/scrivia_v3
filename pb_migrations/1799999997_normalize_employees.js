/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vl57ay30r5ghesy");

  // Fields to remove (duplicates that map to the canonical field)
  // Canonical fields to keep: first_name, last_name, middle_name, employee_number,
  // basic_salary, region_id, division_id, stacode, department, position, status
  const fieldsToRemove = [
    "fname",        // → first_name
    "lname",        // → last_name
    "mi",           // → middle_name
    "empno",        // → employee_number
    "basic",        // → basic_salary
    "regcode",      // → region_id (or division.regcode)
    "divcode",      // → division_id (or division.divcode)
    "poscode",      // → position (code)
    "grade",        // salary grade
    "step",         // salary step
    "pera",         // allowance
    "ontop",        // allowance
    "long",         // longevity pay
    "dedlnr",       // GSIS personal share
    "dedmed",       // PhilHealth
    "dedtax",       // Withholding tax
    "dedpag",       // Pag-IBIG
    "netpay",       // computed net pay
    "govtlnr",      // GSIS loan
    "govtmed",      // PhilHealth loan
    "govtpag",      // Pag-IBIG loan
    "tin",          // TIN
    "gsis_id",      // GSIS ID
    "hdmf_id",      // Pag-IBIG ID
    "phic_id",      // PhilHealth ID
    "sex",          // sex
    "civilstat",    // civil status
    "birthdate",    // birth date
    "hiredate",     // hire date
    "taxcode",      // tax code
    "paymode",      // pay mode
    "account",      // bank account
    "banker",       // bank name
    "distcode",     // district code
  ];

  // Remove duplicate fields from schema
  collection.schema = collection.schema.filter(f => !fieldsToRemove.includes(f.name));

  // Ensure canonical fields have proper names and types
  const canonicalUpdates = {
    "first_name": { "name": "first_name", "required": true },
    "last_name": { "name": "last_name", "required": true },
    "middle_name": { "name": "middle_name", "required": false },
    "employee_number": { "name": "employee_number", "required": true, "unique": true },
    "basic_salary": { "name": "basic_salary", "type": "number" },
    "position": { "name": "position", "required": true },
    "department": { "name": "department" },
    "status": { "name": "status" },
    "stacode": { "name": "stacode" },
  };

  for (const field of collection.schema) {
    if (canonicalUpdates[field.name]) {
      Object.assign(field, canonicalUpdates[field.name]);
    }
  }

  // Add region_id and division_id as proper relation fields (if not present)
  const hasRegionId = collection.schema.some(f => f.name === "region_id");
  if (!hasRegionId) {
    collection.schema.push({
      "system": false,
      "id": "region_id",
      "name": "region_id",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "un4yjy6pwxq32ot", // regions
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": 1,
        "displayFields": ["region_name"]
      }
    });
  }

  const hasDivisionId = collection.schema.some(f => f.name === "division_id");
  if (!hasDivisionId) {
    collection.schema.push({
      "system": false,
      "id": "division_id",
      "name": "division_id",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "cmps62yxo0n46hm", // divisions
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": 1,
        "displayFields": ["division_name"]
      }
    });
  }

  // Add payroll_group_id as relation
  const hasPayrollGroup = collection.schema.some(f => f.name === "payroll_group_id");
  if (!hasPayrollGroup) {
    collection.schema.push({
      "system": false,
      "id": "payroll_group_id",
      "name": "payroll_group_id",
      "type": "relation",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": {
        "collectionId": "acchgj5r79ufe8q", // payroll_groups
        "cascadeDelete": false,
        "minSelect": null,
        "maxSelect": 1,
        "displayFields": ["group_name"]
      }
    });
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vl57ay30r5ghesy");

  // Restore removed fields (down migration)
  const restoredFields = [
    {
      "system": false, "id": "fname", "name": "fname", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "lname", "name": "lname", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "mi", "name": "mi", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "empno", "name": "empno", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "basic", "name": "basic", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "regcode", "name": "regcode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "divcode", "name": "divcode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "poscode", "name": "poscode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "grade", "name": "grade", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "step", "name": "step", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "pera", "name": "pera", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "ontop", "name": "ontop", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "long", "name": "long", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "dedlnr", "name": "dedlnr", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "dedmed", "name": "dedmed", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "dedtax", "name": "dedtax", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "dedpag", "name": "dedpag", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "netpay", "name": "netpay", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "govtlnr", "name": "govtlnr", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "govtmed", "name": "govtmed", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "govtpag", "name": "govtpag", "type": "number", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    },
    {
      "system": false, "id": "tin", "name": "tin", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "gsis_id", "name": "gsis_id", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "hdmf_id", "name": "hdmf_id", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "phic_id", "name": "phic_id", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "sex", "name": "sex", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "civilstat", "name": "civilstat", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "birthdate", "name": "birthdate", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "hiredate", "name": "hiredate", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "taxcode", "name": "taxcode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "paymode", "name": "paymode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "account", "name": "account", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "banker", "name": "banker", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
    {
      "system": false, "id": "distcode", "name": "distcode", "type": "text", "required": false, "presentable": false, "unique": false,
      "options": { "min": null, "max": null, "pattern": "" }
    },
  ];

  // Remove the added relation fields
  collection.schema = collection.schema.filter(f =>
    !["region_id", "division_id", "payroll_group_id"].includes(f.name)
  );

  // Restore original fields
  for (const field of restoredFields) {
    if (!collection.schema.some(f => f.name === field.name)) {
      collection.schema.push(field);
    }
  }

  return dao.saveCollection(collection);
});