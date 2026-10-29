(async function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    E = WebNavigation.engine,
    rotation = (35.2 * Math.PI) / 180,
    KEY = "airport-actual-3f-v2";
  let mapReady = false;
  let serviceFrame = null,
    servicePaused = false,
    serviceActive = false,
    serviceResetClock = null;
  let data,
    map,
    view,
    graph,
    building = 1,
    tab = "search",
    category = null,
    area = "ALL",
    query = "",
    selected = null,
    placing = null,
    limit = 60,
    tripFrame = null,
    tripRunning = false,
    robotPath = null,
    positionByBuilding = {},
    routeSelection = { start: null, end: null },
    poiFeatures = new Map(),
    buildingSources = new Map(),
    styleCache = new Map();
  const colors = {
      user: "#187fe7",
      robot: "#15966d",
      checkpoint: "#ec8b25",
      start: "#187fe7",
      end: "#7654c0",
    },
    roleNames = {
      user: "내 위치",
      robot: "저니봇",
      checkpoint: "체크포인트",
      start: "출발지",
      end: "도착지",
    },
    centers = {
      1: [126.45086444914341, 37.449246767788374],
      2: [126.43432119708092, 37.46787123222204],
      3: [126.44474934786558, 37.45615949682604],
    };
  const fmt = new E.GeoJSON(),
    markerSource = new E.VectorSource(),
    routeSource = new E.VectorSource(),
    poiSource = new E.VectorSource();
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function toast(t) {
    $("toast").textContent = t;
    $("toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("toast").classList.remove("show"), 3000);
  }
  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ building, positions: positionByBuilding }),
      );
    } catch {}
  }
  function iconData(symbol, color = "#199bda", size = 24) {
    return (
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="${color}" stroke="white" stroke-width="2"/><text x="16" y="22" font-size="17" font-family="Arial,sans-serif" font-weight="bold" text-anchor="middle" fill="white">${symbol}</text></svg>`,
      )
    );
  }
  function fallback(p) {
    if (p.category === 10010216) return iconData("↗", "#427d9b");
    if (/화장실/.test(p.name)) return iconData("WC", "#5b86b4");
    if (/약국|의료|AED/.test(p.name)) return iconData("+", "#df7372");
    if (/카페|커피|식당|식음/.test(p.name)) return iconData("☕", "#98785b");
    return iconData("i", "#3689ac");
  }
  const iconFor = (p) => p.icon || fallback(p);
  function categoryIds(c) {
    return [c.id, ...c.children.flatMap(categoryIds)];
  }
  function catFor(p) {
    for (const c of data.categories) {
      if (categoryIds(c).includes(p.category)) return c.name;
    }
    return p.category === 10010216 ? "탑승구" : "공항시설";
  }
  function currentPois() {
    return data.pois.filter((p) => p.building === building);
  }
  function matchingPois() {
    let ids = category ? categoryIds(category) : null;
    return currentPois().filter(
      (p) =>
        (!ids || ids.includes(p.category)) &&
        (area === "ALL" || p.area === area) &&
        (!query ||
          (p.name + " " + p.description + " " + p.items)
            .toLowerCase()
            .includes(query)),
    );
  }
  function poiPoint(p) {
    let n = graph.nodes.get(p.node);
    if (!n || n.building !== building)
      n = graph.nearest(p.lon, p.lat, building);
    return {
      node: n.id,
      lon: n.lon,
      lat: n.lat,
      label: p.name + " 앞",
      poi: p.id,
    };
  }
  function defaults() {
    const list = currentPois(),
      gate = (n) => list.find((p) => p.name === "탑승구 " + n);
    let gates =
      building === 1
        ? [27, 30, 28]
        : building === 2
          ? [241, 245, 242]
          : [127, 130, 128];
    let chosen = gates.map((n, i) => gate(n) || list[i]);
    let ps = {
      user: poiPoint(chosen[0]),
      robot: poiPoint(chosen[1]),
      checkpoint: poiPoint(chosen[2]),
    };
    if (!graph.route(ps.robot.node, ps.checkpoint.node, building)) {
      ps.robot = { ...ps.user };
      ps.robot.label = "시연 로봇 대기 지점";
    }
    return ps;
  }
  function positions() {
    let p = positionByBuilding[building];
    if (
      !p ||
      !["user", "robot", "checkpoint"].every(
        (r) =>
          graph.nodes.has(p[r]?.node) &&
          graph.nodes.get(p[r].node).building === building,
      )
    ) {
      p = defaults();
      positionByBuilding[building] = p;
    }
    return p;
  }
  function renderCategories() {
    const box = $("categories");
    box.replaceChildren();
    data.categories.forEach((c) => {
      const b = el(
        "button",
        "category" + (category?.id === c.id ? " active" : ""),
      );
      if (c.icon) {
        const im = el("img");
        im.src = c.icon;
        im.alt = "";
        b.append(im);
      }
      b.append(document.createTextNode(c.name));
      b.onclick = () => {
        category = category?.id === c.id ? null : c;
        limit = 60;
        renderCategories();
        renderResults();
        refreshPois();
      };
      box.append(b);
    });
  }
  function renderResults() {
    const box = $("results");
    box.replaceChildren();
    const arr = matchingPois();
    $("resultsTitle").textContent =
      data.buildings.find((b) => b.id === building).name + " · 3층";
    $("resultCount").textContent = arr.length + "개 시설";
    $("results").dataset.total = arr.length;
    if (!arr.length) {
      box.append(
        el(
          "p",
          "empty",
          "검색 결과가 없습니다.\n검색어나 시설 분류를 바꿔보세요.",
        ),
      );
      return;
    }
    arr.slice(0, limit).forEach((p) => {
      const b = el("button", "result" + (selected === p.id ? " active" : "")),
        im = el("img", "result-icon");
      im.src = iconFor(p);
      im.alt = "";
      const copy = el("span", "copy");
      copy.append(
        el("b", "", p.name),
        el(
          "small",
          "",
          catFor(p) +
            " · " +
            (p.area === "AIR"
              ? "탑승구역"
              : p.area === "LAND"
                ? "일반구역"
                : "공항시설"),
        ),
      );
      b.append(im, copy, el("span", "arrow", "›"));
      b.onclick = () =>
        placing ? setRole(placing, poiPoint(p)) : selectPoi(p.id, true);
      box.append(b);
    });
    if (arr.length > limit) {
      const more = el(
        "button",
        "more",
        "시설 더 보기 (" + (arr.length - limit) + "개)",
      );
      more.onclick = () => {
        limit += 60;
        renderResults();
      };
      box.append(more);
    }
  }
  function timeText(v) {
    return v && v.length === 4 ? v.slice(0, 2) + ":" + v.slice(2) : "";
  }
  function selectPoi(id, move) {
    const p = data.pois.find((p) => p.id === id);
    if (!p) return;
    selected = id;
    const box = $("detail");
    box.replaceChildren();
    box.hidden = false;
    const close = el("button", "close", "×");
    close.setAttribute("aria-label", "시설 정보 닫기");
    close.onclick = () => {
      selected = null;
      box.hidden = true;
      refreshPois();
    };
    box.append(
      close,
      el("span", "category-label", catFor(p)),
      el("h2", "", p.name),
    );
    let desc =
      p.description ||
      data.buildings.find((b) => b.id === p.building).name + " 3층";
    if (p.items && p.items !== ".") desc += "\n" + p.items;
    if (p.open && p.close && p.open !== p.close)
      desc += "\n운영시간 " + timeText(p.open) + "–" + timeText(p.close);
    box.append(
      el("p", "", desc),
      el(
        "div",
        "coords",
        "시설 좌표 " + p.lat.toFixed(6) + ", " + p.lon.toFixed(6),
      ),
    );
    const actions = el("div", "detail-actions");
    if (window.easyMapMode && window.easySelectFacility) {
      const b = el("button", "primary", "여기로 안내받기");
      b.onclick = () => window.easySelectFacility(p);
      actions.append(b);
    }
    const buttons = window.easyMapMode
      ? []
      : tab === "route"
        ? [
            ["start", "출발지로 지정"],
            ["end", "도착지로 지정"],
          ]
        : [
            ["user", "내 위치"],
            ["robot", "로봇 위치"],
            ["checkpoint", "여기서 만나기"],
          ];
    buttons.forEach(([role, title]) => {
      const b = el("button", "", title);
      b.onclick = () => setRole(role, poiPoint(p));
      actions.append(b);
    });
    box.append(actions);
    if (move) {
      view.animate({
        center: E.fromLonLat([p.lon, p.lat]),
        zoom: Math.max(view.getZoom(), 20),
        duration: 500,
      });
    }
    renderResults();
    refreshPois();
  }
  function setTab(t) {
    if (tripRunning && t !== "robot") stopRobot(false);
    tab = t;
    cancelPlace();
    $("searchPanel").hidden = t !== "search";
    $("routePanel").hidden = t !== "route";
    $("robotPanel").hidden = t !== "robot";
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    $("legend").hidden = t !== "robot";
    $("detail").hidden = true;
    selected = null;
    renderRows();
    drawRoles();
    if (t === "robot") drawRobotRoutes();
    else if (t === "route") showRoute(false);
    else routeSource.clear();
  }
  function row(role, p) {
    const div = el("div", "point-row");
    const pin = el("span", "pin");
    pin.style.background = colors[role];
    const copy = el("div", "copy");
    copy.append(
      el("label", "", roleNames[role]),
      el("b", "", p?.label || "지도를 눌러 선택"),
    );
    if (p)
      copy.append(el("small", "", p.lat.toFixed(5) + ", " + p.lon.toFixed(5)));
    const button = el("button", "", p ? "변경" : "선택");
    button.setAttribute("aria-label", roleNames[role] + " 선택");
    button.onclick = () => startPlace(role);
    div.append(pin, copy, button);
    return div;
  }
  function renderRows() {
    const pp = positions();
    $("robotRows").replaceChildren(
      ...["user", "robot", "checkpoint"].map((r) => row(r, pp[r])),
    );
    $("routeRows").replaceChildren(
      ...["start", "end"].map((r) => row(r, routeSelection[r])),
    );
  }
  function setRole(role, p) {
    stopRobot(false);
    if (["start", "end"].includes(role)) {
      routeSelection[role] = p;
      setTab("route");
    } else {
      positions()[role] = p;
      persist();
      setTab("robot");
    }
    cancelPlace();
    $("detail").hidden = true;
    renderRows();
    drawRoles();
    if (tab === "robot") drawRobotRoutes();
    else showRoute(false);
    toast(roleNames[role] + "를 지정했습니다.");
  }
  function startPlace(role) {
    stopRobot(false);
    placing = role;
    $("placeBanner").hidden = false;
    $("placeText").textContent =
      roleNames[role] + "로 지정할 지도 위 시설 또는 통로를 선택하세요.";
    $("detail").hidden = true;
    map.getViewport().style.cursor = "crosshair";
  }
  function cancelPlace() {
    placing = null;
    $("placeBanner").hidden = true;
    if (map) map.getViewport().style.cursor = "";
  }
  function markerStyle(role, label) {
    const c = colors[role],
      symbol = { user: "●", robot: "▣", checkpoint: "⚑", start: "S", end: "E" }[
        role
      ];
    return new E.Style({
      image: new E.Icon({
        src:
          role === "robot"
            ? "assets/journey-robot.svg"
            : iconData(symbol, c, 36),
        width: role === "robot" ? 52 : 36,
        height: role === "robot" ? 52 : 36,
        anchor: [0.5, 0.5],
      }),
      text: new E.Text({
        text: label || roleNames[role],
        font: "600 12px Arial,sans-serif",
        fill: new E.Fill({ color: c }),
        stroke: new E.Stroke({ color: "white", width: 4 }),
        offsetY: -30,
        padding: [4, 6, 4, 6],
        backgroundFill: new E.Fill({ color: "rgba(255,255,255,.95)" }),
        backgroundStroke: new E.Stroke({ color: "#dce5ea", width: 1 }),
      }),
      zIndex: 1000,
    });
  }
  function pointFeature(p, role) {
    const f = new E.Feature({
      geometry: new E.Point(E.fromLonLat([p.lon, p.lat])),
      role,
    });
    f.setId(role);
    f.setStyle(markerStyle(role));
    return f;
  }
  function drawRoles() {
    markerSource.clear();
    if (tab === "robot") {
      const pp = positions();
      ["user", "robot", "checkpoint"].forEach((r) =>
        markerSource.addFeature(pointFeature(pp[r], r)),
      );
    }
    if (tab === "route")
      for (const r of ["start", "end"])
        if (routeSelection[r])
          markerSource.addFeature(pointFeature(routeSelection[r], r));
  }
  function addLine(path, color, dashed) {
    if (!path || path.coordinates.length < 2) return;
    const fs = fmt.readFeatures(
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: path.coordinates },
      },
      { featureProjection: "EPSG:3857" },
    );
    fs[0].setStyle([
      new E.Style({ stroke: new E.Stroke({ color: "#fff", width: 8 }) }),
      new E.Style({
        stroke: new E.Stroke({
          color,
          width: 4,
          lineDash: dashed ? [7, 8] : undefined,
        }),
      }),
    ]);
    routeSource.addFeatures(fs);
  }
  function drawRobotRoutes() {
    routeSource.clear();
    const pp = positions(),
      r = graph.route(pp.robot.node, pp.checkpoint.node, building, true),
      u = graph.route(pp.user.node, pp.checkpoint.node, building, true);
    addLine(u, colors.user, true);
    addLine(r, colors.robot, false);
    robotPath = r;
    $("callRobot").disabled = !r || tripRunning;
    $("robotResult").textContent = r
      ? "로봇 → 체크포인트 약 " +
        Math.round(r.distance) +
        "m\n" +
        (u
          ? "이용자 → 체크포인트 약 " + Math.round(u.distance) + "m"
          : "이용자 경로가 연결되지 않습니다. 같은 구역의 위치를 선택하세요.")
      : "이 위치 사이에는 확보된 3층 경로가 없습니다.\n같은 구역의 다른 시설을 선택해 주세요.";
    return r;
  }
  function showRoute(message = true) {
    routeSource.clear();
    const { start, end } = routeSelection;
    if (!start || !end) {
      $("routeResult").textContent = "";
      if (message) toast("출발지와 도착지를 먼저 선택해 주세요.");
      return;
    }
    const r = graph.route(
      start.node,
      end.node,
      building,
      $("accessible").checked,
    );
    $("routeResult").textContent = r
      ? "이동 거리 약 " +
        Math.round(r.distance) +
        "m\n원본 경로 연결 정보로 계산한 3층 내 경로입니다."
      : "연결되는 3층 경로를 찾지 못했습니다.\n같은 구역의 다른 위치를 선택해 주세요.";
    addLine(r, colors.user, false);
    if (r && message) {
      view.fit(routeSource.getExtent(), {
        padding: [110, 90, 120, 70],
        duration: 600,
        maxZoom: 21,
      });
    }
    drawRoles();
  }
  function stopRobot(notify = true) {
    stopService();
    if (tripFrame) cancelAnimationFrame(tripFrame);
    tripFrame = null;
    tripRunning = false;
    $("journey").hidden = true;
    $("callRobot").disabled = !robotPath;
    if (notify) toast("로봇 이동 시연을 종료했습니다.");
    if (map) drawRoles();
  }
  function runRobot() {
    stopRobot(false);
    const r = drawRobotRoutes();
    if (!r) return;
    cancelPlace();
    $("detail").hidden = true;
    $("journey").hidden = false;
    $("journeyTitle").textContent = "저니봇이 이동 중입니다";
    $("journeyText").textContent = positions().checkpoint.label + "에서 만나요";
    $("callRobot").disabled = true;
    tripRunning = true;
    const coords = r.coordinates.map((c) => E.fromLonLat(c)),
      lengths = coords
        .slice(1)
        .map((p, i) => Math.hypot(p[0] - coords[i][0], p[1] - coords[i][1])),
      total = lengths.reduce((a, b) => a + b, 0),
      duration = total === 0 ? 0 : Math.min(18000, Math.max(7000, total * 20));
    let start;
    drawRoles();
    let robot = markerSource.getFeatureById("robot");
    if (coords.length > 1)
      view.fit(routeSource.getExtent(), {
        padding: [110, 90, 170, 70],
        duration: 500,
        maxZoom: 20.8,
      });
    function step(t) {
      if (start === undefined) start = t;
      let f = duration ? Math.min(1, (t - start) / duration) : 1,
        d = total * f,
        p = coords[0];
      for (let i = 0; i < lengths.length; i++) {
        if (d <= lengths[i] && lengths[i] > 0) {
          let q = d / lengths[i];
          p = [
            coords[i][0] + (coords[i + 1][0] - coords[i][0]) * q,
            coords[i][1] + (coords[i + 1][1] - coords[i][1]) * q,
          ];
          break;
        }
        d -= lengths[i];
        p = coords[i + 1];
      }
      robot.getGeometry().setCoordinates(p);
      $("progress").style.width = f * 100 + "%";
      $("journeyProgress").textContent =
        "이동 시연 " + Math.round(f * 100) + "% · 실제 로봇 연결 없음";
      if (f < 1) tripFrame = requestAnimationFrame(step);
      else {
        tripFrame = null;
        tripRunning = false;
        positions().robot = { ...positions().checkpoint };
        persist();
        renderRows();
        $("journeyTitle").textContent = "체크포인트에 도착했습니다";
        $("callRobot").disabled = false;
        $("robotResult").textContent =
          "로봇이 " + positions().checkpoint.label + "에 도착했습니다.";
        toast("저니봇 도착! 체크포인트에서 만나세요.");
      }
    }
    tripFrame = requestAnimationFrame(step);
  }
  function fit() {
    view.setRotation(rotation);
    view.animate({
      center: E.fromLonLat(centers[building]),
      zoom: building === 2 ? 17.4 : building === 3 ? 18.1 : 18,
      duration: 450,
    });
  }
  function changeBuilding(id) {
    stopRobot(false);
    cancelPlace();
    building = id;
    selected = null;
    query = "";
    $("search").value = "";
    category = null;
    area = "ALL";
    routeSelection = { start: null, end: null };
    $("detail").hidden = true;
    routeSource.clear();
    renderCategories();
    renderResults();
    renderRows();
    drawRoles();
    if (tab === "robot") drawRobotRoutes();
    document
      .querySelectorAll("[data-area]")
      .forEach((b) => b.classList.toggle("active", b.dataset.area === "ALL"));
    persist();
    fit();
    refreshPois();
  }
  function stylePoi(p, focused) {
    const detailed = !window.easyMapMode || focused || view.getZoom() >= 19.5;
    const key = p.id + "-" + focused + "-" + detailed;
    if (styleCache.has(key)) return styleCache.get(key);
    const s = new E.Style({
      image: new E.Icon({
        src: iconFor(p),
        width: focused ? 26 : 20,
        height: focused ? 26 : 20,
      }),
      text: new E.Text({
        text: detailed ? p.name : "",
        font: focused ? "600 13px Arial,sans-serif" : "11px Arial,sans-serif",
        fill: new E.Fill({ color: focused ? "#077bbb" : "#35414b" }),
        stroke: new E.Stroke({ color: "#fff", width: 3 }),
        offsetY: 24,
      }),
      zIndex: focused ? 1000 : 1,
    });
    styleCache.set(key, s);
    return s;
  }
  function refreshPois() {
    if (!map) return;
    const extent = view.calculateExtent(map.getSize()),
      ids = category ? categoryIds(category) : null,
      zoom = view.getZoom();
    let candidates = data.pois.filter(
      (p) =>
        p.building === building &&
        (window.easyMapMode || p.shown) &&
        (!ids || ids.includes(p.category)) &&
        (area === "ALL" || p.area === area),
    );
    const inView = candidates
      .filter((p) => {
        let xy = E.fromLonLat([p.lon, p.lat]);
        return (
          xy[0] >= extent[0] &&
          xy[0] <= extent[2] &&
          xy[1] >= extent[1] &&
          xy[1] <= extent[3]
        );
      })
      .sort(
        (a, b) =>
          (a.id === selected ? -100 : a.level) -
          (b.id === selected ? -100 : b.level),
      );
    let displayed = [],
      pixels = [];
    for (const p of inView) {
      const px = map.getPixelFromCoordinate(E.fromLonLat([p.lon, p.lat]));
      if (!px) continue;
      if (
        !window.easyMapMode &&
        zoom < 20 &&
        p.id !== selected &&
        !ids &&
        pixels.some((q) => Math.hypot(q[0] - px[0], q[1] - px[1]) < 46)
      )
        continue;
      pixels.push(px);
      displayed.push(p);
    }
    poiSource.clear();
    for (const p of displayed) {
      let f = poiFeatures.get(p.id);
      if (!f) {
        f = new E.Feature({
          geometry: new E.Point(E.fromLonLat([p.lon, p.lat])),
          poiId: p.id,
        });
        f.setId(p.id);
        poiFeatures.set(p.id, f);
      }
      f.setStyle(stylePoi(p, selected === p.id));
      poiSource.addFeature(f);
    }
    $("map").dataset.visiblePois = displayed.length;
    const mPerPx = view.getResolution() * Math.cos((37.45 * Math.PI) / 180);
    $("scale").textContent = "100px ≈ " + Math.round(mPerPx * 100) + "m";
  }
  function bind() {
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
    $("robotToggle").onclick = () => setTab("robot");
    $("building").onchange = (e) => changeBuilding(Number(e.target.value));
    $("search").oninput = (e) => {
      query = e.target.value.trim().toLowerCase();
      limit = 60;
      if (tab !== "search") {
        const role = placing;
        setTab("search");
        if (role) startPlace(role);
      }
      renderResults();
    };
    $("clear").onclick = () => {
      $("search").value = "";
      query = "";
      renderResults();
      $("search").focus();
    };
    $("allCats").onclick = () => {
      category = null;
      renderCategories();
      renderResults();
      refreshPois();
    };
    $("zoomIn").onclick = () =>
      view.animate({ zoom: Math.min(23, view.getZoom() + 1), duration: 250 });
    $("zoomOut").onclick = () =>
      view.animate({ zoom: Math.max(15, view.getZoom() - 1), duration: 250 });
    $("fit").onclick = fit;
    $("rotate").onclick = () => view.animate({ rotation, duration: 300 });
    $("cancelPlace").onclick = cancelPlace;
    $("callRobot").onclick = runRobot;
    $("stopRobot").onclick = () => stopRobot();
    $("resetPositions").onclick = () => {
      stopRobot(false);
      positionByBuilding[building] = defaults();
      persist();
      renderRows();
      drawRoles();
      drawRobotRoutes();
      toast("시연 위치를 초기화했습니다.");
    };
    $("findRoute").onclick = () => showRoute();
    $("accessible").onchange = () => showRoute(false);
    document.querySelectorAll("[data-area]").forEach(
      (b) =>
        (b.onclick = () => {
          area = b.dataset.area;
          document
            .querySelectorAll("[data-area]")
            .forEach((x) => x.classList.toggle("active", x === b));
          refreshPois();
          renderResults();
        }),
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        cancelPlace();
        $("detail").hidden = true;
      }
    });
    map.on("singleclick", (evt) => {
      if (window.robotFlowActive) return;
      let p;
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          if (f.get("poiId")) {
            p = data.pois.find((p) => p.id === f.get("poiId"));
            return true;
          }
        },
        { hitTolerance: 5 },
      );
      if (placing) {
        if (p) {
          if (p.building !== building) {
            toast("현재 선택한 터미널의 시설을 선택하세요.");
            return;
          }
          setRole(placing, poiPoint(p));
        } else {
          const xy = evt.coordinate,
            lon = ((xy[0] / 6378137) * 180) / Math.PI,
            lat =
              ((2 * Math.atan(Math.exp(xy[1] / 6378137)) - Math.PI / 2) * 180) /
              Math.PI;
          const n = graph.nearest(lon, lat, building),
            nxy = E.fromLonLat([n.lon, n.lat]);
          if (
            Math.hypot(nxy[0] - xy[0], nxy[1] - xy[1]) *
              Math.cos((lat * Math.PI) / 180) >
            40
          ) {
            toast("도면 안의 통로 가까이를 눌러주세요.");
            return;
          }
          setRole(placing, {
            node: n.id,
            lon: n.lon,
            lat: n.lat,
            label: "직접 지정한 통로",
          });
        }
        return;
      }
      if (p) {
        if (p.building !== building) {
          changeBuilding(p.building);
          $("building").value = building;
        }
        selectPoi(p.id, false);
      } else {
        $("detail").hidden = true;
        selected = null;
        refreshPois();
      }
    });
    map.on("pointermove", (evt) => {
      if (placing) return;
      map.getViewport().style.cursor = map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: (l) => l === poiLayer,
      })
        ? "pointer"
        : "";
    });
    map.on("moveend", refreshPois);
  }
  function stopService() {
    if (serviceFrame) cancelAnimationFrame(serviceFrame);
    serviceFrame = null;
    serviceActive = false;
    servicePaused = false;
    serviceResetClock = null;
  }
  function serviceScene({
    user,
    robot,
    checkpoint,
    goal,
    path,
    guide = false,
  }) {
    stopRobot(false);
    setTab("search");
    $("detail").hidden = true;
    markerSource.clear();
    routeSource.clear();
    const cp = poiPoint(checkpoint),
      u = poiPoint(user),
      rb = poiPoint(robot),
      g = goal ? poiPoint(goal) : null;
    markerSource.addFeature(pointFeature(u, "user"));
    markerSource.addFeature(pointFeature(rb, "robot"));
    markerSource.addFeature(pointFeature(cp, "checkpoint"));
    if (g) {
      const f = pointFeature(g, "end");
      f.setStyle(markerStyle("end", "도착지"));
      markerSource.addFeature(f);
    }
    addLine(path, "#15966d", false);
    if (!guide) {
      const walk = graph.route(u.node, cp.node, building, true);
      addLine(walk, "#187fe7", true);
    }
    const a = markerSource.getExtent(),
      r = routeSource.getFeatures().length ? routeSource.getExtent() : a;
    const ext = [
      Math.min(a[0], r[0]),
      Math.min(a[1], r[1]),
      Math.max(a[2], r[2]),
      Math.max(a[3], r[3]),
    ];
    const panel = document.getElementById("robotFlowPanel"),
      bottom = Math.min(
        (panel?.getBoundingClientRect().height || 340) + 40,
        map.getSize()[1] * 0.65,
      );
    view.cancelAnimations();
    view.fit(ext, { padding: [100, 70, bottom, 70], duration: 0, maxZoom: 20 });
    refreshPois();
  }
  function animateService(options) {
    const { path, onProgress, onDone, guide } = options;
    serviceScene(options);
    serviceActive = true;
    servicePaused = false;
    const coords = path.coordinates.map((c) => E.fromLonLat(c));
    const lengths = coords
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - coords[i][0], p[1] - coords[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    const duration = Math.min(24000, Math.max(12000, path.distance * 45));
    let elapsed = 0,
      last = null,
      previousPct = -1;
    serviceResetClock = () => {
      last = null;
    };
    const rb = markerSource.getFeatureById("robot"),
      user = markerSource.getFeatureById("user");
    function at(f) {
      let left = total * f;
      for (let i = 0; i < lengths.length; i++) {
        if (left <= lengths[i] && lengths[i] > 0) {
          const t = left / lengths[i];
          return [
            coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
            coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
          ];
        }
        left -= lengths[i];
      }
      return coords[coords.length - 1];
    }
    function frame(t) {
      if (!serviceActive) return;
      if (last !== null && !servicePaused) elapsed += t - last;
      last = t;
      const f = Math.min(1, elapsed / duration);
      rb.getGeometry().setCoordinates(at(f));
      if (guide)
        user
          .getGeometry()
          .setCoordinates(
            at(Math.max(0, f - 0.025) * (f === 1 ? 1 / 0.975 : 1)),
          );
      const pct = Math.floor(f * 100);
      if (pct !== previousPct) {
        previousPct = pct;
        onProgress?.({
          fraction: f,
          remaining: Math.max(0, Math.round(path.distance * (1 - f))),
          paused: servicePaused,
        });
      }
      if (f < 1) {
        serviceFrame = requestAnimationFrame(frame);
      } else {
        serviceFrame = null;
        serviceActive = false;
        if (guide) user.getGeometry().setCoordinates(at(1));
        onDone?.();
      }
    }
    serviceFrame = requestAnimationFrame(frame);
  }
  window.journeyMap = {
    show: async function (id, startPoi, endPoi) {
      while (!mapReady || !map || !graph)
        await new Promise((r) => setTimeout(r, 100));
      changeBuilding(id);
      $("building").value = id;
      map.updateSize();
      if (startPoi && endPoi) {
        routeSelection = { start: poiPoint(startPoi), end: poiPoint(endPoi) };
        setTab("route");
        selected = endPoi.id;
        showRoute();
        refreshPois();
      } else {
        setTab("search");
        refreshPois();
      }
    },
    showPositions: async function (userPoi, checkpointPoi) {
      setTab("search");
      markerSource.clear();
      const u = poiPoint(userPoi);
      markerSource.addFeature(pointFeature(u, "user"));
      if (checkpointPoi) {
        const c = poiPoint(checkpointPoi);
        markerSource.addFeature(pointFeature(c, "checkpoint"));
      }
      view.fit(markerSource.getExtent(), {
        padding: [150, 110, 190, 110],
        duration: 450,
        maxZoom: 20,
      });
      refreshPois();
    },
    focusNearby: function (poi) {
      view.cancelAnimations();
      view.setZoom(18.6);
      const size=map.getSize();
      view.centerOn(E.fromLonLat([poi.lon,poi.lat]),size,[size[0]*.5,size[1]*.35]);
      refreshPois();
    },
    resize: function () {
      map?.updateSize();
    },
    serviceScene,
    animateService,
    pauseService: function () {
      servicePaused = !servicePaused;
      serviceResetClock?.();
      return servicePaused;
    },
    stopService,
    hide: function () {
      stopRobot(false);
    },
    meet: function (startPoi, endPoi) {
      positions().user = poiPoint(startPoi);
      positions().robot = poiPoint(startPoi);
      positions().checkpoint = poiPoint(endPoi);
      setTab("robot");
      runRobot();
    },
  };
  let poiLayer;
  try {
    data = await (await fetch("data/airport.json")).json();
    graph = new AirportGraph(data);
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && [1, 2, 3].includes(s.building)) {
        building = s.building;
        positionByBuilding = s.positions || {};
      }
    } catch {}
    view = new E.View({
      center: E.fromLonLat(centers[building]),
      zoom: 18,
      minZoom: 15,
      maxZoom: 23,
      rotation,
    });
    map = new E.Map({ target: "map", view, controls: [], layers: [] });
    const geos = await Promise.all(
      [1, 2, 3].map(async (b) => [
        b,
        await (await fetch("data/building-" + b + "-3f.geojson")).json(),
      ]),
    );
    let count = 0;
    for (const [b, g] of geos) {
      let fs = fmt.readFeatures(g, { featureProjection: "EPSG:3857" });
      count += fs.length;
      const src = new E.VectorSource({ features: fs });
      buildingSources.set(b, src);
      const layer = new E.VectorLayer({
        source: src,
        renderBuffer: 1000,
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
      layer.setZIndex(1);
      map.addLayer(layer);
    }
    poiLayer = new E.VectorLayer({ source: poiSource, renderBuffer: 150 });
    poiLayer.setZIndex(10);
    map.addLayer(poiLayer);
    const rl = new E.VectorLayer({ source: routeSource });
    rl.setZIndex(20);
    map.addLayer(rl);
    const ml = new E.VectorLayer({ source: markerSource });
    ml.setZIndex(30);
    map.addLayer(ml);
    mapReady = true;
    $("map").dataset.source = "original-har-geojson";
    $("map").dataset.buildings = "3";
    $("map").dataset.features = count;
    $("building").value = building;
    bind();
    renderCategories();
    renderResults();
    renderRows();
    $("loading").hidden = true;
    map.updateSize();
    fit();
    setTab("robot");
    refreshPois();
    window.addEventListener("resize", () => map.updateSize());
    new ResizeObserver(() => map.updateSize()).observe($("map"));
  } catch (e) {
    console.error(e);
    $("loading").replaceChildren(
      el("b", "", "지도를 불러오지 못했습니다."),
      el("span", "", "페이지를 새로고침해 주세요."),
    );
  }
})();
