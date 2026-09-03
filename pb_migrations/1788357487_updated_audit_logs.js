/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("e1f7zn924yb58dk")

  // remove
  collection.schema.removeField("48gvxino")

  // remove
  collection.schema.removeField("1jeeo3p8")

  // remove
  collection.schema.removeField("7omcaahl")

  // remove
  collection.schema.removeField("hke8zy0u")

  // remove
  collection.schema.removeField("aywy6t00")

  // remove
  collection.schema.removeField("ack43kkv")

  // remove
  collection.schema.removeField("9bwthruh")

  // remove
  collection.schema.removeField("wvn4ogm6")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "jhdsqszv",
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
    "id": "yfsgegas",
    "name": "user_email",
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
    "id": "lalhle2l",
    "name": "action",
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
    "id": "ubgva4yb",
    "name": "table_name",
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
    "id": "x2txvjdu",
    "name": "record_type",
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
    "id": "sjqhxw3d",
    "name": "record_id",
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
    "id": "evninczc",
    "name": "old_data",
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
    "id": "b2o4s96c",
    "name": "new_data",
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
    "id": "l6j6b628",
    "name": "ip_address",
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
    "id": "m4wjqunr",
    "name": "user_agent",
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
    "id": "n5lmawv6",
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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("e1f7zn924yb58dk")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "48gvxino",
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
    "id": "1jeeo3p8",
    "name": "action",
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
    "id": "7omcaahl",
    "name": "table_name",
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
    "id": "hke8zy0u",
    "name": "record_id",
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
    "id": "aywy6t00",
    "name": "old_data",
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
    "id": "ack43kkv",
    "name": "new_data",
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
    "id": "9bwthruh",
    "name": "ip_address",
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
    "id": "wvn4ogm6",
    "name": "user_agent",
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
  collection.schema.removeField("jhdsqszv")

  // remove
  collection.schema.removeField("yfsgegas")

  // remove
  collection.schema.removeField("lalhle2l")

  // remove
  collection.schema.removeField("ubgva4yb")

  // remove
  collection.schema.removeField("x2txvjdu")

  // remove
  collection.schema.removeField("sjqhxw3d")

  // remove
  collection.schema.removeField("evninczc")

  // remove
  collection.schema.removeField("b2o4s96c")

  // remove
  collection.schema.removeField("l6j6b628")

  // remove
  collection.schema.removeField("m4wjqunr")

  // remove
  collection.schema.removeField("n5lmawv6")

  return dao.saveCollection(collection)
})
