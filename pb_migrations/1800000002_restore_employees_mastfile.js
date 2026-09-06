/// <reference path="../pb_data/types.d.ts" />
// Restore the full MASTFILE.DBF field set on the hardcoded `employees`
// PocketBase collection. A previous normalize migration stripped the masterfile
// columns, so Smart Import MASTFILE writes failed validation and records were
// skipped (data loss). This migration re-adds every missing column as
// optional (non-required, non-unique) so the sync can never be rejected.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("vl57ay30r5ghesy");

  const has = (name) => collection.schema.some((f) => f.name === name);

  const textField = (id, name) => ({
    system: false, id, name, type: "text", required: false,
    presentable: false, unique: false,
    options: { min: null, max: null, pattern: "" },
  });
  const numField = (id, name) => ({
    system: false, id, name, type: "number", required: false,
    presentable: false, unique: false,
    options: { min: null, max: null, noDecimal: false },
  });

  // [fieldName, kind] — hardcoded to match src/lib/employeeMasterfile.ts
  const missing = [
    ["empname", "text"], ["appel", "text"],
    ["trans", "num"], ["aca", "num"], ["rata", "num"],
    ["clothing", "num"], ["cashallow", "num"],
    ["govtecc", "num"],
    ["pagcode", "text"], ["attend", "text"], ["updcode", "text"], ["editor", "text"],
    ["gsis_pn", "text"], ["pib", "text"],
    ["update", "text"], ["paydate", "text"],
    ["hire_date", "text"],
    ["mid_bonus", "num"], ["mid_cash", "num"],
    ["end_bonus", "num"], ["end_cash", "num"],
    ["add_bonus", "num"], ["taxref", "num"], ["special", "num"], ["over_wheld", "num"],
    ["exposcode", "text"],
    ["exgrade", "num"], ["exstep", "num"],
    ["exbasic", "num"], ["exlnr", "num"], ["exmed", "num"], ["expag", "num"], ["extax", "num"],
    ["exglnr", "num"], ["exgmed", "num"], ["exgpag", "num"], ["exgecc", "num"],
    ["saldiff", "num"], ["lnrdiff", "num"], ["meddiff", "num"], ["pagdiff", "num"], ["taxdiff", "num"],
    ["glnrdiff", "num"], ["gmeddiff", "num"], ["gpagdiff", "num"], ["geccdiff", "num"],
    ["depname1", "text"], ["depname2", "text"], ["depname3", "text"], ["depname4", "text"],
    ["depdate1", "text"], ["depdate2", "text"], ["depdate3", "text"], ["depdate4", "text"],
    ["division_id", "text"], ["category", "text"],
    ["hourly_rate", "num"], ["sss_number", "text"],
    ["philhealth_number", "text"], ["pagibig_number", "text"],
    ["bank_name", "text"], ["bank_account", "text"], ["tax_status", "text"],
    ["hazard_pay", "num"], ["salary_differential", "num"],
    ["other_compensation", "num"], ["other_earnings", "num"],
  ];

  for (const [name, kind] of missing) {
    if (!has(name)) {
      collection.schema.push(
        kind === "num" ? numField(name, name) : textField(name, name)
      );
    }
  }

  // Employee Records must always be readable/writable by the app (RLS is
  // enforced in code via division scoping, not by blocking the sync).
  collection.listRule = "";
  collection.viewRule = "";
  collection.createRule = "";
  collection.updateRule = "";
  collection.deleteRule = "";

  return dao.saveCollection(collection);
}, (db) => {
  // Down migration: keep the restored columns (dropping them would re-introduce
  // data loss). No-op by design.
  return null;
});
