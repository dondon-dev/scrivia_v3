/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  // Resolve by NAME (not a hardcoded collection id) so this applies to
  // whichever `deductions` collection is live, regardless of its generated id.
  const collection = dao.findCollectionByNameOrId("deductions")

  // Add all DEDFILE columns so the deductions table carries the full
  // masterfile payload (not just the basic 8 fields). These mirror the
  // payroll_deductions columns and enable the Deductions view to display
  // effectivity, termination, type, agency, loan details, etc.
  const dedfileFields = [
    { name: "stacode",            type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "effmm",              type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "effyy",              type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "termm",              type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "teryy",              type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "type",               type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "agency",             type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "policyno",           type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "policydate",         type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "status",             type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "principal",          type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "interest",           type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "charges",            type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "proceeds",           type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "absno",              type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "underhr",            type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "undermin",           type: "number",  options: { min: null, max: null, noDecimal: false } },
    { name: "oldcode",            type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "hiredate",           type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "birthdate",          type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "gsis_bpn",           type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "qs",                 type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "paydate",            type: "text",    options: { min: null, max: null, pattern: "" } },
    { name: "editor",             type: "text",    options: { min: null, max: null, pattern: "" } },
  ]

  const existingNames = new Set(collection.schema.map((f) => f.name))
  for (const f of dedfileFields) {
    if (existingNames.has(f.name)) continue
    collection.schema.push(new SchemaField({
      system: false,
      id: `dedf_${f.name}`,
      name: f.name,
      type: f.type,
      required: false,
      presentable: false,
      unique: false,
      options: f.options,
    }))
  }

  return dao.saveCollection(collection)
}, (db) => {
  // Rollback: remove the added fields
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("deductions")
  const fieldNames = [
    "stacode", "effmm", "effyy", "termm", "teryy", "type", "agency",
    "policyno", "policydate", "status", "principal", "interest", "charges",
    "proceeds", "absno", "underhr", "undermin", "oldcode", "hiredate",
    "birthdate", "gsis_bpn", "qs", "paydate", "editor",
  ]
  const toRemove = collection.schema.filter((f) => fieldNames.includes(f.name))
  for (const f of toRemove) {
    collection.schema.remove(f.id)
  }
  return dao.saveCollection(collection)
})
