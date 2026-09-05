/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("pay_periods");

  // Dedupe existing pay_periods: keep the newest row per (year, month, regcode, divcode)
  // so the unique index below can be created. Duplicates are user-visible as repeated
  // periods in the Payroll screen and make the period list / data fetches slower.
  const rows = dao.findRecordsByFilter(
    "pay_periods",
    "1=1",
    "-created",
    0,
    100000,
  );
  const seen = {};
  const toDelete = [];
  for (const row of rows) {
    const key = [
      row.get("year"),
      row.get("month"),
      row.get("regcode") || "",
      row.get("divcode") || "",
    ].join("|");
    if (seen[key]) {
      toDelete.push(row.getId());
    } else {
      seen[key] = true;
    }
  }
  for (const id of toDelete) {
    try {
      dao.deleteRecordById(collection, id);
    } catch (_) {
      // ignore individual failures
    }
  }

  // Unique index matching the intended schema: one period per division per month.
  collection.indexes = collection.indexes || [];
  if (!collection.indexes.some((ix) => ix.includes("idx_pp_period"))) {
    collection.indexes.push(
      "CREATE UNIQUE INDEX idx_pp_period ON pay_periods(year, month, COALESCE(regcode,''), COALESCE(divcode,''))",
    );
  }
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("pay_periods");
  collection.indexes = (collection.indexes || []).filter(
    (ix) => !ix.includes("idx_pp_period"),
  );
  return dao.saveCollection(collection);
})
