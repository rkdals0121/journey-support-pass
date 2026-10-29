/* Standalone map: no service screens, matching flow, navigation UI or host styles. */
(async function () {
  "use strict";
  const CHANNEL = "journey-airport-map";
  const E = window.WebNavigation.engine;
  const fmt = new E.GeoJSON();
  const status = document.getElementById("status");
  const colors = {
    user: "#187fe7",
    robot: "#15966d",
    checkpoint: "#ec8b25",
    destination: "#7654c0",
  };
  const labels = {
    user: "내 위치",
    robot: "로봇",
    checkpoint: "만날 곳",
    destination: "목적지",
  };
  const centers = {
    1: [126.45086444914341, 37.449246767788374],
    2: [126.43432119708092, 37.46787123222204],
    3: [126.44474934786558, 37.45615949682604],
  };
  const parentOrigin = window.location.origin;
  let checkpoints = [], pendingCheckpoint = null;
  let data,
    graph,
    map,
    view,
    ready = false,
    pendingFit = false,
    selected = null;
  let state = { building: 1, markers: {}, route: null, fit: true, checkpointSelection: true, showCheckpoints: true };
  const meetingSource = new E.VectorSource();
  const geometryLayers = new Map();
  const pois = new E.VectorSource(),
    markers = new E.VectorSource(),
    routes = new E.VectorSource();

  function emit(type, payload = {}) {
    const message = { channel: CHANNEL, version: 1, type, ...payload };
    if (window.parent !== window)
      window.parent.postMessage(message, parentOrigin);
    window.dispatchEvent(
      new CustomEvent("airport-map:" + type, { detail: payload }),
    );
  }
  function fail(error) {
    emit("error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  function badge(symbol, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect x="2" y="2" width="32" height="32" rx="10" fill="${color}" stroke="white" stroke-width="3"/><text x="18" y="24" text-anchor="middle" font-size="18" font-family="Arial" fill="white">${symbol}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function publicPoi(p) {
    return {
      id: p.id,
      name: p.name,
      building: p.building,
      floor: "3F",
      lon: p.lon,
      lat: p.lat,
      category: p.category,
      area: p.area,
      description: p.description || "",
      open: p.open || "",
      close: p.close || "",
    };
  }
  function normalize(value) {
    return String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  }
  function search(query, limit = 20) {
    const q = normalize(query);
    if (!q) return [];
    const rank = (p) => {
      const name = normalize(p.name);
      return name === q ? 0 : name.startsWith(q) ? 1 : 2;
    };
    return data.pois
      .filter(
        (p) => p.building === state.building && normalize(p.name).includes(q),
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          a.name.localeCompare(b.name, "ko", { numeric: true }),
      )
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)))
      .map(publicPoi);
  }
  function resolve(location) {
    if (!location || typeof location !== "object")
      throw new Error("위치 형식이 잘못됐습니다.");
    if (location.checkpointId !== undefined) {
      const p = checkpoints.find(p => p.id === location.checkpointId && p.building === state.building);
      if (!p) throw new Error("현재 터미널의 등록된 만날 곳을 선택해 주세요.");
      return {lon:p.lon,lat:p.lat,label:location.label || p.name,checkpoint:p};
    }
    if (location.poiId !== undefined) {
      const p = data.pois.find(
        (p) =>
          String(p.id) === String(location.poiId) &&
          p.building === state.building,
      );
      if (!p) throw new Error("현재 터미널의 시설 ID를 찾지 못했습니다.");
      return {
        lon: p.lon,
        lat: p.lat,
        label: location.label || p.name,
        poi: p,
      };
    }
    const { lon, lat } = location;
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    )
      throw new Error("위도·경도 값이 잘못됐습니다.");
    return { lon, lat, label: location.label || "" };
  }
  function nodeFor(point) {
    const original = graph.nodes.get(point.checkpoint?.node ?? point.poi?.node);
    if (original && original.building === state.building) return original;
    const n = graph.nearest(point.lon, point.lat, state.building);
    if (
      !n ||
      Math.hypot((n.lon - point.lon) * 88000, (n.lat - point.lat) * 111000) > 80
    )
      throw new Error("위치에서 연결 가능한 통로를 찾지 못했습니다.");
    return n;
  }
  function computeRoute(route) {
    const a = resolve(route.start),
      b = resolve(route.end);
    const aArea=a.checkpoint?.area || a.poi?.area, bArea=b.checkpoint?.area || b.poi?.area;
    if (aArea && bArea && aArea !== bArea) return null;
    return graph.route(nodeFor(a).id, nodeFor(b).id, state.building, true);
  }
  function markerStyle(kind, label) {
    return new E.Style({
      image: new E.Icon({
        src:
          kind === "robot"
            ? "assets/journey-robot.svg"
            : badge(
                { user: "●", checkpoint: "⚑", destination: "◆" }[kind] || "●",
                colors[kind],
              ),
        width: kind === "robot" ? 48 : 34,
        height: kind === "robot" ? 48 : 34,
      }),
      text: new E.Text({
        text: label || labels[kind],
        font: "600 12px Arial,sans-serif",
        fill: new E.Fill({ color: colors[kind] }),
        stroke: new E.Stroke({ color: "#fff", width: 5 }),
        offsetY: -28,
      }),
      zIndex: 1000,
    });
  }
  function publicCheckpoint(p) { return {...p, floor:"3F"}; }
  function drawCheckpoints() {
    meetingSource.clear();
    const points=checkpoints.filter(p=>p.building===state.building);
    const controls=document.getElementById("checkpoint-options");controls.replaceChildren();
    const chosen=pendingCheckpoint?.id || state.markers.checkpoint?.checkpointId;
    for (const p of points) {
      if (state.showCheckpoints) {
        const f=new E.Feature({geometry:new E.Point(E.fromLonLat([p.lon,p.lat])),checkpointId:p.id});
        f.setStyle(new E.Style({image:new E.Icon({src:badge(String(p.number),p.id===chosen?"#db851f":"#195b43"),width:40,height:40}),zIndex:p.id===chosen?2000:1000}));meetingSource.addFeature(f);
      }
      const button=document.createElement("button");button.type="button";button.textContent=p.number+"번 입구";button.setAttribute("aria-pressed",String(p.id===chosen));button.onclick=()=>selectCheckpoint(p.id);controls.append(button);
    }
    const hint=document.getElementById("checkpoint-hint");
    hint.hidden=!state.checkpointSelection;
    if (!points.length) hint.textContent="이 구역에는 등록된 만날 곳이 없어요";
    else if (pendingCheckpoint) hint.textContent=pendingCheckpoint.number+"번 입구 앞 · 여기서 만날까요?";
    else hint.textContent="초록색 입구 번호를 눌러주세요";
    document.getElementById("checkpoint-panel").hidden=!state.checkpointSelection;
    document.getElementById("checkpoint-confirm").disabled=!pendingCheckpoint;
  }
  function selectCheckpoint(id) {
    if(!state.checkpointSelection)return;
    const p=checkpoints.find(p=>p.id===id&&p.building===state.building);if(!p)return;
    pendingCheckpoint=p;drawCheckpoints();
    emit("checkpoint-select",{location:publicCheckpoint(p)});
  }
  function confirmCheckpoint() {
    if(!state.checkpointSelection || !pendingCheckpoint)return;
    const p=pendingCheckpoint;
    setState({markers:{...state.markers,checkpoint:{checkpointId:p.id}},route:null,fit:false});
    document.getElementById("checkpoint-hint").textContent=p.number+"번 입구 만날 곳으로 설정했어요";
    emit("checkpoint-change",{location:publicCheckpoint(p)});
  }
  function redrawMarkers() {
    markers.clear();
    for (const kind of Object.keys(colors)) {
      const location = state.markers[kind];
      if (!location) continue;
      const p = resolve(location),
        f = new E.Feature({
          geometry: new E.Point(E.fromLonLat([p.lon, p.lat])),
        });
      f.setStyle(markerStyle(kind, location.label || labels[kind]));
      markers.addFeature(f);
    }
  }
  function redrawRoute() {
    routes.clear();
    if (!state.route) { emit("route-result", {route:null}); return; }
    const result = computeRoute(state.route);
    if (result && result.coordinates.length > 1) {
      const f = fmt.readFeatures(
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: result.coordinates },
        },
        { featureProjection: "EPSG:3857" },
      )[0];
      f.setStyle([
        new E.Style({ stroke: new E.Stroke({ color: "white", width: 8 }) }),
        new E.Style({ stroke: new E.Stroke({ color: "#15966d", width: 4 }) }),
      ]);
      routes.addFeature(f);
    }
    emit("route-result", {
      route: result
        ? { distance: result.distance, coordinates: result.coordinates }
        : null,
    });
  }
  function drawPois() {
    if (!ready || !map.getSize()) return;
    const extent = view.calculateExtent(map.getSize()),
      detailed = view.getZoom() >= 19.5;
    pois.clear();
    for (const p of data.pois) {
      if (p.building !== state.building) continue;
      const xy = E.fromLonLat([p.lon, p.lat]);
      if (
        xy[0] < extent[0] ||
        xy[0] > extent[2] ||
        xy[1] < extent[1] ||
        xy[1] > extent[3]
      )
        continue;
      const f = new E.Feature({ geometry: new E.Point(xy), poiId: p.id });
      const focused = String(selected) === String(p.id);
      f.setStyle(
        new E.Style({
          image: new E.Icon({
            src: p.icon || badge("i", "#3689ac"),
            width: focused ? 34 : 26,
            height: focused ? 34 : 26,
          }),
          text: new E.Text({
            text: detailed || focused ? p.name : "",
            font: "11px Arial,sans-serif",
            fill: new E.Fill({ color: focused ? "#087ba6" : "#354b41" }),
            stroke: new E.Stroke({ color: "white", width: 3 }),
            offsetY: 23,
          }),
          zIndex: focused ? 10 : 1,
        }),
      );
      pois.addFeature(f);
    }
    document.getElementById("map").dataset.visiblePois = String(
      pois.getFeatures().length,
    );
  }
  function fit() {
    const size = map.getSize();
    if (!size || size[0] < 1 || size[1] < 1) {
      pendingFit = true;
      return;
    }
    pendingFit = false;
    const extents = [];
    if (state.showCheckpoints && meetingSource.getFeatures().length) extents.push(meetingSource.getExtent());
    if (markers.getFeatures().length) extents.push(markers.getExtent());
    if (routes.getFeatures().length) extents.push(routes.getExtent());
    view.cancelAnimations();
    if (extents.length) {
      const e = [
        Math.min(...extents.map((x) => x[0])),
        Math.min(...extents.map((x) => x[1])),
        Math.max(...extents.map((x) => x[2])),
        Math.max(...extents.map((x) => x[3])),
      ];
      view.fit(e, { padding: [55, 65, 65, 45], maxZoom: 19, duration: 0 });
    } else {
      view.setCenter(E.fromLonLat(centers[state.building]));
      view.setZoom(state.building === 2 ? 17.5 : 18);
    }
    drawPois();
  }
  function setState(next = {}) {
    if (!ready) throw new Error("지도가 아직 준비되지 않았습니다.");
    const previous = state;
    const building = next.building ?? state.building;
    if (![1, 2, 3].includes(building))
      throw new Error("지원하지 않는 터미널입니다.");
    const changed = building !== state.building;
    const merged = {
      building,
      markers:
        next.markers !== undefined
          ? next.markers
          : changed
            ? {}
            : state.markers,
      route:
        next.route !== undefined ? next.route : changed ? null : state.route,
      fit: next.fit !== false,
      checkpointSelection: next.checkpointSelection ?? state.checkpointSelection,
      showCheckpoints: next.showCheckpoints ?? state.showCheckpoints,
      selectedPoiId: next.selectedPoiId ?? null,
    };
    state = merged;
    try {
      for (const x of Object.values(state.markers || {})) if (x) resolve(x);
      if(state.markers?.checkpoint && !state.markers.checkpoint.checkpointId) throw new Error("만날 곳은 { checkpointId: 등록된ID }로 전달해 주세요.");
      if (state.route) {
        computeRoute(state.route);
      }
    } catch (error) {
      state = previous;
      throw error;
    }
    state.markers = state.markers || {};
    selected = state.selectedPoiId;
    if(changed || !state.checkpointSelection || (next.markers !== undefined && next.markers?.checkpoint?.checkpointId !== pendingCheckpoint?.id)) pendingCheckpoint=null;
    drawCheckpoints();
    geometryLayers.forEach((layer, id) =>
      layer.setVisible(id === state.building),
    );
    redrawMarkers();
    redrawRoute();
    document.getElementById("checkpoint-hint").hidden = !state.checkpointSelection;
    if (state.fit) fit();
    else drawPois();
    return { building: state.building, floor: "3F" };
  }
  function onMessage(event) {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    const m = event.data;
    if (!m || m.channel !== CHANNEL || m.version !== 1) return;
    try {
      if (m.type === "ping" && ready)
        emit("ready", {
          building: state.building,
          floor: "3F",
          facilityCount: data.pois.length,
          checkpoints:checkpoints.filter(p=>p.building===state.building).map(publicCheckpoint),
        });
      if (!ready) return;
      if (m.type === "set-state") setState(m.state);
      if (m.type === "fit") fit();
      if(m.type === "get-checkpoints") emit("checkpoints-result",{requestId:m.requestId,checkpoints:checkpoints.filter(p=>p.building===state.building).map(publicCheckpoint)});
      if (m.type === "search")
        emit("search-result", {
          requestId: m.requestId,
          results: search(m.query, m.limit),
        });
    } catch (error) {
      fail(error);
    }
  }
  window.addEventListener("message", onMessage);
  try {
    data = await (await fetch("data/airport.json")).json();
    checkpoints=await (await fetch("data/checkpoints.json")).json();
    graph = new window.AirportGraph(data);
    const buildingParam = Number(
      new URLSearchParams(location.search).get("building"),
    );
    if ([1, 2, 3].includes(buildingParam)) state.building = buildingParam;
    if (new URLSearchParams(location.search).get("mode") === "facility") {state.checkpointSelection=false;state.showCheckpoints=false;}
    view = new E.View({
      center: E.fromLonLat(centers[state.building]),
      zoom: 18,
      minZoom: 15,
      maxZoom: 23,
      rotation: (35.2 * Math.PI) / 180,
    });
    map = new E.Map({ target: "map", view, controls: [], layers: [] });
    const geos = await Promise.all(
      [1, 2, 3].map(async (id) => ({
        id,
        geo: await (await fetch("data/building-" + id + "-3f.geojson")).json(),
      })),
    );
    for (const { id, geo } of geos) {
      const layer = new E.VectorLayer({
        source: new E.VectorSource({
          features: fmt.readFeatures(geo, { featureProjection: "EPSG:3857" }),
        }),
        style: (f) => {
          const p = f.getProperties();
          return new E.Style({
            stroke: new E.Stroke({
              color: p.stroke || "#cacaca",
              width: p["stroke-width"] || 1,
            }),
            fill: new E.Fill({ color: p.fill || "rgba(0,0,0,0)" }),
          });
        },
      });
      layer.setVisible(id === state.building);
      geometryLayers.set(id, layer);
      map.addLayer(layer);
    }
    for (const [source, z] of [
      [pois, 10],
      [routes, 20],
      [markers, 30],
      [meetingSource, 40],
    ]) {
      const layer = new E.VectorLayer({ source });
      layer.setZIndex(z);
      map.addLayer(layer);
    }
    ready = true;
    status.hidden = true;
    map.updateSize();
    drawCheckpoints();
    fit();
    document.getElementById("checkpoint-confirm").onclick=confirmCheckpoint;
    map.on("moveend", drawPois);
    map.on("singleclick", (event) => {
      let p;
      map.forEachFeatureAtPixel(
        event.pixel,
        (f) => {
          if (f.get("poiId") !== undefined) {
            p = data.pois.find((x) => String(x.id) === String(f.get("poiId")));
            return true;
          }
        },
        { hitTolerance: 12 },
      );
      const xy = event.coordinate,
        lon = ((xy[0] / 6378137) * 180) / Math.PI,
        lat = ((2 * Math.atan(Math.exp(xy[1] / 6378137)) - Math.PI / 2) * 180) / Math.PI;
      const location = { lon, lat };
      if (state.checkpointSelection) {
        let id;
        map.forEachFeatureAtPixel(event.pixel,f=>{if(f.get("checkpointId")){id=f.get("checkpointId");return true}},{hitTolerance:12,layerFilter:l=>l.getSource()===meetingSource});
        if(id)selectCheckpoint(id);
        else document.getElementById("checkpoint-hint").textContent="초록색 입구 번호를 눌러주세요";
        return;
      }
      emit("map-click", { location });
      if (p && !state.checkpointSelection) {
        selected = p.id;
        drawPois();
        emit("facility-click", { facility: publicPoi(p) });
      }
    });
    new ResizeObserver(() => {
      map.updateSize();
      if (pendingFit) fit();
      else drawPois();
    }).observe(document.getElementById("map"));
    document.getElementById("zoom-in").onclick = () =>
      view.animate({ zoom: Math.min(23, view.getZoom() + 1), duration: 180 });
    document.getElementById("zoom-out").onclick = () =>
      view.animate({ zoom: Math.max(15, view.getZoom() - 1), duration: 180 });
    document.getElementById("fit").onclick = fit;
    window.AirportMap = {
      setState,
      fit,
      search,
      getCheckpoints:()=>checkpoints.filter(p=>p.building===state.building).map(publicCheckpoint),
      getState: () => ({
        building: state.building,
        markers: state.markers,
        route: state.route,
        checkpointSelection: state.checkpointSelection,
        showCheckpoints: state.showCheckpoints,
      }),
    };
    emit("ready", {
      building: state.building,
      floor: "3F",
      facilityCount: data.pois.length,
      checkpoints:checkpoints.filter(p=>p.building===state.building).map(publicCheckpoint),
    });
  } catch (error) {
    status.hidden = false;
    status.textContent = "지도를 불러오지 못했습니다.";
    fail(error);
    console.error(error);
  }
})();
