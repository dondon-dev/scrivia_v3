// Filter compat for older deployed bundles: pb.ts's gt/gte/lt/lte interpolated
// string values WITHOUT quotes, producing filters like
//   filter=created_at >= 2026-08-31T16:00:00.000Z
// PocketBase's filter parser requires quoted literals and 400s on these.
// (Current source quotes them; this shim keeps stale bundles working.)
// Rewrites any *_at <op> <unquoted ISO datetime> in the filter query param to
// the quoted form before the request reaches the CRUD handler.

routerUse((next) => {
  return (c) => {
    try {
      const u = c.request().URL;
      const rq = u.RawQuery;
      if (rq && rq.indexOf("filter=") !== -1 && rq.indexOf("_at") !== -1) {
        const fixed = rq.replace(
          /((?:^|&)(?:filter(?:%5B\d%5D)?%3D)[^&]*?)([A-Za-z_]*_at)((?:%20|\+|%2B)(?:%3E%3D|%3C%3D|%3E|%3C|%3D|%21%3D)(?:%20|\+|%2B))(\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}(?:%2E|\.)\d+Z?)(?=%27|&|$)/g,
          "$1$2$3%27$4%27"
        );
        if (fixed !== rq) u.RawQuery = fixed;
      }
    } catch (_) {}
    return next(c);
  };
});
