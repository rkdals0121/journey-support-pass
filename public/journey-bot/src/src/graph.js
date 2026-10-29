/* Original HAR graph: each node's outgoing links are stored sequentially. */
(function (root) {
  "use strict";
  class Heap {
    constructor() {
      this.a = [];
    }
    push(v) {
      let a = this.a,
        i = a.length;
      a.push(v);
      while (i) {
        let p = (i - 1) >> 1;
        if (a[p][0] <= v[0]) break;
        a[i] = a[p];
        i = p;
      }
      a[i] = v;
    }
    pop() {
      let a = this.a,
        res = a[0],
        v = a.pop();
      if (a.length) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
          let c = i * 2 + 1;
          if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++;
          if (a[c][0] >= v[0]) break;
          a[i] = a[c];
          i = c;
        }
        a[i] = v;
      }
      return res;
    }
  }
  class AirportGraph {
    constructor(data) {
      this.nodes = new Map(
        data.nodes.map((n) => [
          n[0],
          { id: n[0], lon: n[1], lat: n[2], building: n[3], type: n[4] },
        ]),
      );
      this.adj = new Map();
      for (const [a, b, d] of data.edges) {
        if (!this.adj.has(a)) this.adj.set(a, []);
        this.adj.get(a).push([b, d]);
        if (!this.adj.has(b)) this.adj.set(b, []);
        this.adj.get(b).push([a, d]);
      }
    }
    nearest(lon, lat, building) {
      let found = null,
        best = Infinity;
      for (const n of this.nodes.values()) {
        if (n.building !== building || ![1, 11, 21].includes(n.type)) continue;
        let d =
          ((n.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2 +
          (n.lat - lat) ** 2;
        if (d < best) {
          best = d;
          found = n;
        }
      }
      return found;
    }
    route(start, end, building, accessible = true) {
      if (!this.nodes.has(start) || !this.nodes.has(end)) return null;
      const dist = new Map([[start, 0]]),
        prev = new Map(),
        q = new Heap();
      q.push([0, start]);
      while (q.a.length) {
        let [d, id] = q.pop();
        if (d !== dist.get(id)) continue;
        if (id === end) {
          let path = [id];
          while (prev.has(path[0])) path.unshift(prev.get(path[0]));
          return {
            ids: path,
            coordinates: path.map((i) => {
              let n = this.nodes.get(i);
              return [n.lon, n.lat];
            }),
            distance: d,
          };
        }
        for (const [to, cost] of this.adj.get(id) || []) {
          let node = this.nodes.get(to);
          if (
            node.building !== building ||
            (accessible && [3, 4, 14, 24].includes(node.type))
          )
            continue;
          let nd = d + Math.max(0, cost);
          if (nd < (dist.get(to) ?? Infinity)) {
            dist.set(to, nd);
            prev.set(to, id);
            q.push([nd, to]);
          }
        }
      }
      return null;
    }
  }
  root.AirportGraph = AirportGraph;
  if (typeof module === "object") module.exports = AirportGraph;
})(typeof window === "object" ? window : globalThis);
