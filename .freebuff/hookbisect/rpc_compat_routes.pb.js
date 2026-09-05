// Compat routes for bundles that call the RPC endpoints with POST.
// The custom Go server (pocketbase/main.go) only registers GET /api/permissions
// and GET /api/employees/query, but the deployed frontend bundle issues POST
// requests to both (pb.ts's rpc() always POSTs) → 404 "Not Found".
// Registering both methods on the same path keeps old GET clients and new POST
// clients working against the same data.
//
// Response shapes match the frontend consumers:
//  - /api/permissions  → bare array of { role, permission, granted }
//  - /api/employees/query → { rows, total, page, pageSize } (useServerPagination)
//    (also includes data/meta for older GET consumers)
//
// v0.22 JSVM notes:
//  - request body/query come from $apis.requestInfo(c) (c.request().body() panics)
//  - Dao.countRecords does not exist here — count via findRecordsByFilter + length

function countByFilter(collection, filter) {
  try {
    return $app.dao().findRecordsByFilter(collection, filter, "", 1000000, 0).length;
  } catch (_) {
    return 0;
  }
}

function bodyOf(c) {
  try {
    const info = $apis.requestInfo(c);
    return info && info.data ? info.data : {};
  } catch (_) {
    return {};
  }
}

function permissionList() {
  const dao = $app.dao();
  let records = [];
  try {
    records = dao.findRecordsByFilter("role_permissions", "", "-created", 500, 0);
  } catch (_) {
    records = [];
  }
  const result = [];
  for (const r of records) {
    result.push({
      role: r.get("role"),
      permission: r.get("permission"),
      granted: r.getBool("granted"),
    });
  }
  return result;
}

routerAdd("GET", "/api/permissions", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });
  return c.json(200, permissionList());
});

routerAdd("POST", "/api/permissions", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });
  return c.json(200, permissionList());
});

routerAdd("POST", "/api/permissions/upsert", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile || profile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can manage permissions" });
  }

  const body = bodyOf(c);
  const p_role = body && body.p_role;
  const p_permission = body && body.p_permission;
  const p_granted = body ? body.p_granted : undefined;
  if (!p_role || !p_permission || p_granted === undefined) {
    return c.json(400, { error: "p_role, p_permission, p_granted required" });
  }

  const dao = $app.dao();
  const existing = dao.findFirstRecordByFilter(
    "role_permissions",
    "role = {:role} && permission = {:permission}",
    { role: p_role, permission: p_permission }
  );

  if (existing) {
    existing.set("granted", !!p_granted);
    dao.saveRecord(existing);
  } else {
    const col = dao.findCollectionByNameOrId("role_permissions");
    const rec = new Record(col);
    rec.set("role", p_role);
    rec.set("permission", p_permission);
    rec.set("granted", !!p_granted);
    dao.saveRecord(rec);
  }

  return c.json(200, { success: true });
});

routerAdd("POST", "/api/permissions/delete", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile || profile.get("role") !== "super_admin") {
    return c.json(403, { error: "Only super_admin can manage permissions" });
  }

  const body = bodyOf(c);
  const p_role = body && body.p_role;
  const p_permission = body && body.p_permission;
  if (!p_role || !p_permission) {
    return c.json(400, { error: "p_role, p_permission required" });
  }

  const dao = $app.dao();
  const existing = dao.findFirstRecordByFilter(
    "role_permissions",
    "role = {:role} && permission = {:permission}",
    { role: p_role, permission: p_permission }
  );
  if (existing) dao.deleteRecord(existing);

  return c.json(200, { success: true });
});

routerAdd("POST", "/api/employees/query", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });

  const profile = $app.dao().findFirstRecordByData("profiles", "email", authRecord.email());
  if (!profile) return c.json(404, { error: "Profile not found" });

  const dao = $app.dao();

  // Accept params from either JSON body (rpc() POSTs) or query string.
  const body = bodyOf(c);
  const q = c.queryParams();
  const p = (k) => {
    if (body && body[k] !== undefined && body[k] !== null && body[k] !== "") return body[k];
    try { const v = q.get(k); if (v !== "") return v; } catch (_) {}
    return null;
  };

  const page = Math.max(0, parseInt(p("p_page") ?? "0", 10) || 0);
  const pageSize = Math.min(200, Math.max(1, parseInt(p("p_page_size") ?? "25", 10) || 25));
  const search = (p("p_search") ?? "").toString().trim();
  const stacodeMin = p("p_stacode_min");
  const stacodeMax = p("p_stacode_max");
  const scopeColumn = p("p_scope_column");
  const scopeValue = p("p_scope_value");
  const regcode = p("p_regcode");
  const divcodes = p("p_divcodes");

  const role = profile.get("role");
  const isSuperAdmin = role === "super_admin";

  let filter = "status = 'Active'";
  if (scopeColumn === "stacode" && scopeValue) {
    filter += ` && stacode = "${scopeValue}"`;
  } else if (scopeColumn === "empno" && scopeValue) {
    filter += ` && (empno = "${scopeValue}" || employee_number = "${scopeValue}")`;
  }
  if (regcode) filter += ` && regcode = "${regcode}"`;
  if (divcodes) {
    const list = Array.isArray(divcodes) ? divcodes : String(divcodes).split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 1) filter += ` && divcode = "${list[0]}"`;
    else if (list.length > 1) {
      const ors = list.map((d) => `divcode = "${d}"`).join(" || ");
      filter += ` && (${ors})`;
    }
  }
  if (search) {
    const term = search.replace(/"/g, '\\"');
    filter += ` && (fname ~ "${term}" || lname ~ "${term}" || last_name ~ "${term}" || first_name ~ "${term}" || empno ~ "${term}" || employee_number ~ "${term}" || stacode ~ "${term}")`;
  }

  let rows = [];
  try {
    rows = dao.findRecordsByFilter("employees", filter, "empno", pageSize, page * pageSize);
  } catch (err) {
    return c.json(400, { error: "Query failed", detail: String(err) });
  }
  const total = countByFilter("employees", filter);

  const data = rows.map((r) => ({
    id: r.id,
    empno: r.get("empno"),
    employee_number: r.get("employee_number"),
    fname: r.get("fname"),
    lname: r.get("lname"),
    first_name: r.get("first_name"),
    last_name: r.get("last_name"),
    mi: r.get("mi"),
    poscode: r.get("poscode"),
    position: r.get("position"),
    department: r.get("department"),
    stacode: r.get("stacode"),
    regcode: r.get("regcode"),
    divcode: r.get("divcode"),
    basic: r.get("basic"),
    basic_salary: r.get("basic_salary"),
    status: r.get("status"),
  }));

  return c.json(200, {
    rows: data,
    total: total,
    page: page,
    pageSize: pageSize,
    // legacy shape for older GET consumers
    data: data,
    meta: { total: total, limit: pageSize, offset: page * pageSize },
  });
});
