/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ca_employees")

  const newFields = [
    {
      name: "category",
      type: "text",
      options: { min: null, max: null, pattern: "" },
    },
    {
      name: "stacode",
      type: "text",
      options: { min: null, max: null, pattern: "" },
    },
  ]

  const existingNames = new Set(collection.schema.map((f) => f.name))
  for (const f of newFields) {
    if (existingNames.has(f.name)) continue
    collection.schema.push(new SchemaField({
      system: false,
      id: `caemp_${f.name}`,
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
  const collection = dao.findCollectionByNameOrId("ca_employees")
  const toRemove = collection.schema.filter((f) => ["category", "stacode"].includes(f.name))
  for (const f of toRemove) {
    collection.schema.remove(f.id)
  }
  return dao.saveCollection(collection)
})
