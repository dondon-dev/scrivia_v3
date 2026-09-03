/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ohtno3i2k092sd3")

  // remove
  collection.schema.removeField("rr1tyzqy")

  // remove
  collection.schema.removeField("pmffiycp")

  // remove
  collection.schema.removeField("aqyg09rb")

  // remove
  collection.schema.removeField("s415xovf")

  // remove
  collection.schema.removeField("bf08b7rm")

  // remove
  collection.schema.removeField("mg4mkkb3")

  // remove
  collection.schema.removeField("xsbwiqxa")

  // remove
  collection.schema.removeField("5oycjkno")

  // remove
  collection.schema.removeField("nxc4uqh4")

  // remove
  collection.schema.removeField("bxe8pcjl")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "zw5bge3l",
    "name": "session_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "j8qegmem",
    "name": "session_label",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "b7p8hxcz",
    "name": "status",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tszqg1wd",
    "name": "files_uploaded",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tcxkzwlx",
    "name": "error_log",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ae2z9nrz",
    "name": "per_file",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ve59mo54",
    "name": "performed_by",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "jizawqks",
    "name": "user_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "hfboz3mn",
    "name": "category",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2097152
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "hbwqmvae",
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
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ztuz4sgp",
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
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2m7csr9u",
    "name": "created_at",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "koxbktnj",
    "name": "completed_at",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2dncvlle",
    "name": "started_by",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ohtno3i2k092sd3")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "rr1tyzqy",
    "name": "session_id",
    "type": "text",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pmffiycp",
    "name": "status",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "aqyg09rb",
    "name": "files_uploaded",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "s415xovf",
    "name": "error_log",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "bf08b7rm",
    "name": "per_file",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mg4mkkb3",
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
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xsbwiqxa",
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
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "5oycjkno",
    "name": "created_at",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "nxc4uqh4",
    "name": "completed_at",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "bxe8pcjl",
    "name": "started_by",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // remove
  collection.schema.removeField("zw5bge3l")

  // remove
  collection.schema.removeField("j8qegmem")

  // remove
  collection.schema.removeField("b7p8hxcz")

  // remove
  collection.schema.removeField("tszqg1wd")

  // remove
  collection.schema.removeField("tcxkzwlx")

  // remove
  collection.schema.removeField("ae2z9nrz")

  // remove
  collection.schema.removeField("ve59mo54")

  // remove
  collection.schema.removeField("jizawqks")

  // remove
  collection.schema.removeField("hfboz3mn")

  // remove
  collection.schema.removeField("hbwqmvae")

  // remove
  collection.schema.removeField("ztuz4sgp")

  // remove
  collection.schema.removeField("2m7csr9u")

  // remove
  collection.schema.removeField("koxbktnj")

  // remove
  collection.schema.removeField("2dncvlle")

  return dao.saveCollection(collection)
})
