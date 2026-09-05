/// <reference path="../pb_data/types.d.ts" />
// Add the engine's undeducted/government-share columns to payroll_entries.
// The payroll engine (payrollSync.ts) writes these on every run; without them
// PocketBase silently drops the keys, so entry.undeducted_amount never
// persisted and the Register / payroll views always showed 0 Undeducted even
// when undeducted_obligations rows existed.
migrate((db) => {
  const dao = new Dao(db)
  const pe = dao.findCollectionByNameOrId("payroll_entries")

  const addNumber = (id, name) => {
    if (pe.schema.getFieldByName(name)) return
    pe.schema.addField(new SchemaField({
      "system": false,
      "id": id,
      "name": name,
      "type": "number",
      "required": false,
      "presentable": false,
      "unique": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    }))
  }

  addNumber("pe_undeducted_amount", "undeducted_amount")
  addNumber("pe_govtlnr", "govtlnr")
  addNumber("pe_govtecc", "govtecc")
  addNumber("pe_govtmed", "govtmed")
  addNumber("pe_govtpag", "govtpag")

  return dao.saveCollection(pe)
}, (db) => {
  const dao = new Dao(db)
  const pe = dao.findCollectionByNameOrId("payroll_entries")
  for (const id of ["pe_undeducted_amount", "pe_govtlnr", "pe_govtecc", "pe_govtmed", "pe_govtpag"]) {
    try { pe.schema.removeField(id) } catch (_) { /* already gone */ }
  }
  return dao.saveCollection(pe)
})
