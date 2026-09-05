/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("plantilla_positions")

  const psiPopFields = [
    { name: "level",              type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "category",           type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "stacode",            type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "item_number",        type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "salary_step",        type: "number", options: { min: null, max: null, noDecimal: false } },
    { name: "authorized_salary",  type: "number", options: { min: null, max: null, noDecimal: false } },
    { name: "actual_salary",      type: "number", options: { min: null, max: null, noDecimal: false } },
    { name: "area",               type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "type",               type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "ppa_attribution",    type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "sex",                type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "birth_date",         type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "date_of_birth",      type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "tin",                type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "appointment_date",   type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "original_appointment_date", type: "text", options: { min: null, max: null, pattern: "" } },
    { name: "last_promotion_date", type: "text",  options: { min: null, max: null, pattern: "" } },
    { name: "civil_service_eligibility", type: "text", options: { min: null, max: null, pattern: "" } },
    { name: "employment_status",  type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "appointment_type",   type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "occupation_code",    type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "personnel_category", type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "position_status",    type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "school_id",          type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "school_name",        type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "school_type",        type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "office_assignment",  type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "organizational_unit", type: "text",  options: { min: null, max: null, pattern: "" } },
    { name: "department",         type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "bureau",             type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "fiscal_year",        type: "number", options: { min: null, max: null, noDecimal: false } },
    { name: "source_pdf",         type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "import_batch_id",    type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "approval_status",    type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "employee_id",        type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "imported_by",        type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "education",          type: "text",   options: { min: null, max: null, pattern: "" } },
    { name: "eligibility",        type: "text",   options: { min: null, max: null, pattern: "" } },
  ]

  const existingNames = new Set(collection.schema.map((f) => f.name))
  for (const f of psiPopFields) {
    if (existingNames.has(f.name)) continue
    collection.schema.push(new SchemaField({
      system: false,
      id: `pltp_${f.name}`,
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
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("plantilla_positions")
  const fieldNames = [
    "level", "category", "stacode", "item_number", "salary_step",
    "authorized_salary", "actual_salary", "area", "type", "ppa_attribution",
    "sex", "birth_date", "date_of_birth", "tin", "appointment_date",
    "original_appointment_date", "last_promotion_date", "civil_service_eligibility",
    "employment_status", "appointment_type", "occupation_code", "personnel_category",
    "position_status", "school_id", "school_name", "school_type",
    "office_assignment", "organizational_unit", "department", "bureau",
    "fiscal_year", "source_pdf", "import_batch_id", "approval_status",
    "employee_id", "imported_by", "education", "eligibility",
  ]
  const toRemove = collection.schema.filter((f) => fieldNames.includes(f.name))
  for (const f of toRemove) {
    collection.schema.remove(f.id)
  }
  return dao.saveCollection(collection)
})
