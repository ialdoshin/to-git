#!/usr/bin/env node
// Проверяет правило security-режима: у каждого объявленного поля есть явные границы.
// Без зависимостей: node tools/lint-constraints.js mcp-request.json mcp-response.json

const fs = require("fs");

const RULES = {
  string: ["minLength", "maxLength"],
  integer: ["minimum", "maximum"],
  number: ["minimum", "maximum"],
  array: ["minItems", "maxItems", "items"],
  object: ["maxProperties"],
  boolean: [],
  null: []
};

function lintFile(file) {
  const root = JSON.parse(fs.readFileSync(file, "utf8"));
  const problems = [];
  const seenRefs = new Set();

  const resolve = (ref) => {
    if (!ref.startsWith("#/")) throw new Error(`${file}: внешний $ref не поддерживается: ${ref}`);
    return ref.slice(2).split("/").reduce((node, key) => node[key.replace(/~1/g, "/").replace(/~0/g, "~")], root);
  };

  // Схема значения поля: должна быть ограничена сама.
  function value(schema, at) {
    if (schema === true || schema === false) {
      problems.push(`${at}: булева схема без ограничений`);
      return;
    }
    if (schema.$ref) {
      if (!seenRefs.has(schema.$ref)) {
        seenRefs.add(schema.$ref);
        value(resolve(schema.$ref), schema.$ref);
      }
      return;
    }
    if ("const" in schema || "enum" in schema) return;
    if (!("type" in schema) && (schema.anyOf || schema.oneOf)) {
      (schema.anyOf || schema.oneOf).forEach((s, i) => value(s, `${at}/anyOf/${i}`));
      return;
    }
    if (typeof schema.type !== "string") {
      problems.push(`${at}: нет одного явного type, const или enum`);
      return;
    }
    const need = RULES[schema.type];
    if (!need) {
      problems.push(`${at}: неизвестный type ${schema.type}`);
      return;
    }
    for (const k of need) if (!(k in schema)) problems.push(`${at}: type ${schema.type} без ${k}`);
    if (schema.type === "object" && schema.additionalProperties !== false && !schema.propertyNames) {
      problems.push(`${at}: открытый object без propertyNames`);
    }
    if (schema.type === "array" && schema.items) value(schema.items, `${at}/items`);
    if (schema.propertyNames) value(schema.propertyNames, `${at}/propertyNames`);
    members(schema, at);
  }

  // Поля, объявленные внутри объекта и в условных ветках.
  function members(schema, at) {
    for (const [k, s] of Object.entries(schema.properties || {})) value(s, `${at}/properties/${k}`);
    if (schema.then) members(schema.then, `${at}/then`);
    if (schema.else) members(schema.else, `${at}/else`);
    for (const s of schema.allOf || []) members(s, `${at}/allOf`);
  }

  value(root, file);
  return problems;
}

const files = process.argv.slice(2);
let failed = false;
for (const f of files) {
  const problems = lintFile(f);
  if (problems.length) {
    failed = true;
    console.log(`${f}: ${problems.length} нарушений`);
    problems.forEach((p) => console.log(`  ${p}`));
  } else {
    console.log(`${f}: все объявленные поля ограничены`);
  }
}
process.exit(failed ? 1 : 0);
