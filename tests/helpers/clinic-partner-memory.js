const assert = require("node:assert/strict");
function database() {
  const values = new Map();
  let queue = Promise.resolve();
  const snapshot = (path) => ({
    id: path.split("/").at(-1),
    exists: values.has(path),
    data: () => structuredClone(values.get(path)),
  });
  function collection(
    path,
    filters = [],
    maximum = Infinity,
    sortField = null,
    direction = "asc",
    cursor = null,
  ) {
    return {
      doc: (key) => doc(path + "/" + key),
      where: (key, op, value) => {
        assert.equal(op, "==");
        return collection(
          path,
          [...filters, [key, value]],
          maximum,
          sortField,
          direction,
          cursor,
        );
      },
      limit: (n) => collection(path, filters, n, sortField, direction, cursor),
      orderBy: (field, dir) =>
        collection(path, filters, maximum, field, dir, cursor),
      startAfter: (document) =>
        collection(path, filters, maximum, sortField, direction, document.id),
      async get() {
        let keys = [...values.keys()].filter(
          (k) =>
            k.startsWith(path + "/") &&
            k.split("/").length === path.split("/").length + 1 &&
            filters.every(([key, value]) => values.get(k)[key] === value),
        );
        if (sortField)
          keys.sort((a, b) => {
            const by = String(values.get(a)[sortField]).localeCompare(
              String(values.get(b)[sortField]),
            );
            const order = by || a.localeCompare(b);
            return direction === "desc" ? -order : order;
          });
        if (cursor)
          keys = keys.slice(
            keys.findIndex((k) => k.split("/").at(-1) === cursor) + 1,
          );
        const docs = keys.slice(0, maximum).map(snapshot);
        return { docs, size: docs.length };
      },
    };
  }
  function doc(path) {
    return {
      path,
      id: path.split("/").at(-1),
      collection: (sub) => collection(path + "/" + sub),
      async get() {
        return snapshot(path);
      },
      async set(value, options) {
        values.set(
          path,
          structuredClone(
            options?.merge ? { ...values.get(path), ...value } : value,
          ),
        );
      },
    };
  }
  return {
    values,
    collection,
    getAll: async (...refs) => refs.map((r) => snapshot(r.path)),
    runTransaction(fn) {
      const run = async () => {
        const writes = [],
          tx = {
            get: async (r) => snapshot(r.path),
            set: (r, v, options) =>
              writes.push(() =>
                values.set(
                  r.path,
                  structuredClone(
                    options?.merge ? { ...values.get(r.path), ...v } : v,
                  ),
                ),
              ),
            update: (r, v) =>
              writes.push(() => {
                assert.ok(values.has(r.path));
                values.set(
                  r.path,
                  structuredClone({ ...values.get(r.path), ...v }),
                );
              }),
          };
        const result = await fn(tx);
        writes.forEach((write) => write());
        return result;
      };
      const result = queue.then(run, run);
      queue = result.catch(() => {});
      return result;
    },
  };
}
module.exports = { database };
