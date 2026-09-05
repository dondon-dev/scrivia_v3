routerAdd("GET", "/api/nourl", function (c) {
  return c.json(200, { ok: true });
});

routerAdd("GET", "/api/withurl", function (c) {
  const rq = c.request().URL.RawQuery;
  return c.json(200, { rawq: String(rq) });
});
