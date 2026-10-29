(async () => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    root = $("easyRoot");
  let data,
    graph,
    b = 1,
    current = null,
    group = null,
    kind = null,
    destination = null,
    page = "home",
    more = false,
    voice = false,
    paused = false;
  let homeMapToken = 0;
  let trail = [],
    mapReturn = "home",
    checkpointConfirmed = false,
    finalGoal = null,
    matchedRobot = null,
    matchBusy = false,
    matchToken = 0,
    flowStage = null,
    flowPaused = false;
  function invalidateMatch() {
    matchedRobot = null;
    matchToken++;
    matchBusy = false;
  }
  const POSITION_KEY = "journey-user-checkpoint-v1";
  function savePosition() {
    try {
      localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({
          b,
          current: current?.id,
          checkpoint: destination?.id,
          confirmed: checkpointConfirmed,
          goal: finalGoal?.id,
        }),
      );
    } catch {}
  }
  function goBack() {
    if (matchBusy) {
      matchToken++;
      matchBusy = false;
    }
    if (trail.length) {
      const p = trail.pop();
      go(p, false);
    }
  }
  const groups = [
    ["flight", "탑승 시설", "체크인 · 출국장 · 탑승구", "↗"],
    ["shop", "편의시설", "편의점 · 약국 · 환전 · 로밍", "＋"],
    ["rest", "휴식·식사", "푸드코트 · 화장실 · 유아시설", "☕"],
  ];
  const kinds = [
    ["checkin", "체크인카운터", "flight", (p) => p.category === 10010215],
    [
      "priority",
      "교통약자 우대출구",
      "flight",
      (p) => /교통약자 우대/.test(p.name),
    ],
    [
      "exit",
      "출국장",
      "flight",
      (p) => p.category === 10010217 && !/교통약자/.test(p.name),
    ],
    ["gate", "탑승구", "flight", (p) => p.category === 10010216],
    ["refund", "텍스리펀드", "flight", (p) => p.category === 88],
    ["desk", "안내데스크", "flight", (p) => p.category === 57],
    [
      "store",
      "편의점",
      "shop",
      (p) => /^(GS25|CU\s*|세븐일레븐)$/.test(p.name),
    ],
    [
      "pharmacy",
      "약국",
      "shop",
      (p) => p.category === 104 || /약국/.test(p.name),
    ],
    ["exchange", "환전소", "shop", (p) => /환전소/.test(p.name)],
    ["roaming", "로밍센터", "shop", (p) => p.category === 86],
    [
      "food",
      "대표 푸드코트존",
      "rest",
      (p) => /푸드코트|food\s*court/i.test(p.name),
    ],
    ["toilet", "화장실", "rest", (p) => p.category === 112],
    ["baby", "영유아휴게실", "rest", (p) => p.category === 19],
    ["play", "어린이놀이방", "rest", (p) => /어린이놀이/.test(p.name)],
  ];
  function el(t, c, txt) {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function btn(txt, fn, c = "e-button") {
    const e = el("button", c, txt);
    e.type = "button";
    e.onclick = fn;
    return e;
  }
  function status(txt) {
    $("easyStatus").textContent = txt;
  }
  function speak() {
    if (!("speechSynthesis" in window)) {
      status(
        "이 브라우저에서는 음성 읽기를 지원하지 않아요. 화면의 글자로 안내할게요.",
      );
      return;
    }
    if (voice) {
      speechSynthesis.cancel();
      voice = false;
      return;
    }
    const u = new SpeechSynthesisUtterance($("easyContent").innerText);
    u.lang = "ko-KR";
    u.rate = 0.85;
    u.onend = () => (voice = false);
    speechSynthesis.cancel();
    voice = true;
    speechSynthesis.speak(u);
  }
  root.innerHTML = `<header class="e-header"><button class="e-brand" id="goHome"><span class="e-logo">✳</span><span>저니봇<small>공항 동행 지도</small></span></button><div class="e-tools"><button id="readAloud">◖ 음성</button><button id="largeText" aria-pressed="false">가+ 글자</button><button id="motion" aria-pressed="false">모션 끄기</button></div></header><main class="e-main"><nav class="e-page-nav" aria-label="페이지 이동"><button id="pageBack">← 뒤로</button><span id="pageLabel"></span></nav><div class="e-context"><span>인천국제공항 · 3층 안내</span><span class="e-version">쉬운 안내 v1.0 · 시제품</span></div><div id="easyContent" tabindex="-1"></div><div id="easyStatus" role="status" aria-live="polite"></div><footer class="e-footer"><span>한 번에 하나씩, 필요한 안내만.</span><button id="settings">위치 변경</button><button id="mapExplore">전체 지도</button></footer><p class="e-demo">시연 모드 · 실제 로봇·GPS 미연결</p></main>`;
  $("goHome").onclick = () => {
    trail = [];
    go("home", false);
  };
  $("pageBack").onclick = goBack;
  $("readAloud").onclick = speak;
  $("largeText").onclick = (e) => {
    const on = document.body.classList.toggle("large-easy");
    e.currentTarget.setAttribute("aria-pressed", on);
    e.currentTarget.textContent = on ? "가− 글자" : "가+ 글자";
  };
  $("motion").onclick = (e) => {
    paused = document.body.classList.toggle("motion-off");
    e.currentTarget.setAttribute("aria-pressed", paused);
    e.currentTarget.textContent = paused ? "모션 켜기" : "모션 끄기";
  };
  $("settings").onclick = () => go("location");
  $("mapExplore").onclick = () => openMap(false);
  window.easySelectFacility = (p) => {
    destination = p;
    checkpointConfirmed = false;
    invalidateMatch();
    savePosition();
    window.journeyMap.hide();
    $("advancedMap").hidden = true;
    root.hidden = false;
    document.body.classList.remove("map-mode");
    go("detail");
  };
  const back = btn(
    "← 뒤로",
    () => {
      closeFlow(false);
    },
    "e-map-back",
  );
  document.body.append(back);
  const cap = el("div", "e-map-caption");
  cap.id = "simpleMapCaption";
  cap.setAttribute("role", "status");
  document.body.append(cap);
  function go(p, push = true) {
    if (push && page !== p) trail.push(page);
    page = p;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    voice = false;
    render();
    $("easyContent").focus({ preventScroll: true });
    root.scrollTo(0, 0);
  }
  function hero(title, desc) {
    const h = el("div", "e-hero");
    const copy = el("div");
    copy.append(
      el("div", "e-kicker", "YOUR AIRPORT COMPANION"),
      el("h1", "", title),
      el("p", "e-desc", desc),
    );
    const art = el("div", "e-robot");
    const im = el("img");
    im.src = "assets/journey-robot.svg";
    im.alt = "웃으며 안내하는 저니봇";
    art.append(im, el("span", "e-robot-label", "제가 안내해 드릴게요"));
    h.append(copy, art);
    return h;
  }
  function steps(n) {
    const bar = el("ol", "e-steps");
    ["시설 찾기", "만날 곳 설정", "로봇 매칭", "만나기", "목적지 안내"].forEach(
      (t, i) => {
        const li = el("li", i + 1 === n ? "current" : "", `${i + 1}  ${t}`);
        if (i + 1 === n) li.setAttribute("aria-current", "step");
        bar.append(li);
      },
    );
    return bar;
  }
  function node(p) {
    const n = graph.nodes.get(p.node);
    return n && n.building === b ? n : graph.nearest(p.lon, p.lat, b);
  }
  function route(p) {
    if (current.area && p.area && current.area !== p.area) return null;
    return graph.route(node(current).id, node(p).id, b, true);
  }
  function near(p) {
    return Math.hypot(
      (current.lon - p.lon) * 88000,
      (current.lat - p.lat) * 111000,
    );
  }
  function locationLine() {
    const row = el("div", "e-location");
    row.append(
      el(
        "span",
        "",
        `⌖ ${b === 3 ? "탑승동" : "제" + b + "터미널"} 3층 · ${current.name} 앞`,
      ),
      btn("위치 변경", () => go("location"), "e-link"),
    );
    return row;
  }

  function facilitySearch(role) {
    const wrap = el("section", "e-search-card");
    const isUser = role === "user",
      isGoal = role === "goal";
    const title = isUser ? "내 위치" : isGoal ? "최종 목적지" : "만날 곳";
    const selected = isUser ? current : isGoal ? finalGoal : destination;
    wrap.append(
      el(
        "div",
        "e-input-kicker",
        isUser
          ? "01 · 지금 계신 곳"
          : isGoal
            ? "03 · 만난 뒤 함께 갈 곳"
            : "02 · 로봇과 만날 곳",
      ),
      el("h2", "", title),
    );
    const chosen = el(
      "div",
      "e-selected-place" + (isUser ? " user-place" : " checkpoint-place"),
    );
    chosen.append(
      el("b", "", selected ? selected.name + " 앞" : "시설 선택"),
      el(
        "span",
        "",
        selected
          ? (selected.area === "AIR" ? "탑승구역" : "일반구역") + " · 3층"
          : "이름으로 검색하세요",
      ),
    );
    wrap.append(chosen);
    const label = el(
      "label",
      "",
      isUser ? "근처 시설 검색" : isGoal ? "목적지 검색" : "만날 곳 검색",
    );
    label.htmlFor = isUser
      ? "userPlaceInput"
      : isGoal
        ? "goalInput"
        : "checkpointInput";
    const input = el("input", "e-facility-input");
    input.id = label.htmlFor;
    input.type = "search";
    input.placeholder = isUser
      ? "예: 탑승구 27, CU, 약국"
      : isGoal
        ? "예: 탑승구 29, 약국, 화장실"
        : "예: 안내데스크, 약국, 탑승구 28";
    input.autocomplete = "off";
    const hint = el(
      "p",
      "e-input-hint",
      isUser
        ? "시설을 선택해 주세요."
        : isGoal
          ? "시설명을 입력하세요."
          : "가까운 시설부터 표시해요.",
    );
    const list = el("div", "e-autocomplete");
    list.id = role + "FacilityResults";
    input.setAttribute("aria-controls", list.id);
    const count = el("p", "e-search-count");
    count.setAttribute("role", "status");
    function update() {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren();
      if (!q) {
        count.textContent = "";
        return;
      }
      const norm = (t) => t.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
      const nq = norm(q),
        matchingKinds = kinds.filter((k) => norm(k[1]).includes(nq));
      function relevance(p) {
        const n = norm(p.name);
        if (n === nq) return 0;
        if (n.startsWith(nq)) return 1;
        if (
          p.name
            .toLowerCase()
            .split(/[\s()[\]·&]+/)
            .some((word) => norm(word).startsWith(nq))
        )
          return 2;
        if (n.includes(nq)) return 3;
        return 4;
      }
      let matches = data.pois.filter(
        (p) =>
          p.building === b &&
          (isGoal
            ? norm(p.name).includes(nq) || matchingKinds.some((k) => k[3](p))
            : p.name.toLowerCase().includes(q) ||
              (p.description || "").toLowerCase().includes(q) ||
              matchingKinds.some((k) => k[3](p))),
      );
      matches.sort(
        isGoal
          ? (a, z) =>
              relevance(a) - relevance(z) ||
              a.name.localeCompare(z.name, "ko", { numeric: true }) ||
              String(a.id).localeCompare(String(z.id))
          : (a, z) =>
              Number(a.area !== current.area) -
                Number(z.area !== current.area) || near(a) - near(z),
      );
      count.textContent = matches.length
        ? isGoal
          ? "추천 시설 " +
            matches.length +
            "곳 · 이름 일치도순으로 최대 8곳 표시"
          : "검색 결과 " + matches.length + "곳 · 가까운 순서로 최대 8곳 표시"
        : "검색 결과가 없어요. 다른 시설 이름을 입력해 주세요.";
      matches.slice(0, 8).forEach((p) => {
        const row = btn(
          "",
          () => {
            invalidateMatch();
            if (isUser) {
              current = p;
              checkpointConfirmed = false;
            } else if (isGoal) {
              finalGoal = p;
            } else {
              destination = p;
              checkpointConfirmed = false;
            }
            savePosition();
            render();
            (isUser
              ? $("checkpointInput")
              : isGoal
                ? $("startMatching")
                : $("confirmCheckpoint")
            )?.focus({ preventScroll: true });
            status(
              (isUser
                ? "내 위치를 "
                : isGoal
                  ? "최종 목적지를 "
                  : "만날 곳 후보를 ") +
                p.name +
                " 앞으로 선택했어요.",
            );
          },
          "e-facility-option",
        );
        const copy = el("span"),
          name = el("b");
        const at = p.name.toLowerCase().indexOf(q);
        if (isGoal && at >= 0) {
          name.append(
            document.createTextNode(p.name.slice(0, at)),
            el("mark", "", p.name.slice(at, at + q.length)),
            document.createTextNode(p.name.slice(at + q.length)),
          );
        } else name.textContent = p.name;
        copy.append(
          name,
          el(
            "small",
            "",
            (p.area === "AIR" ? "탑승구역" : "일반구역") +
              " · " +
              (p.description || "3층").replace(/\n/g, " ").slice(0, 70),
          ),
        );
        row.append(copy, el("span", "", isUser ? "내 위치로 선택" : "선택"));
        list.append(row);
      });
    }
    input.oninput = update;
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        list.querySelector("button")?.focus();
      }
      if (e.key === "Escape") {
        input.value = "";
        update();
      }
    };
    wrap.append(label, input, hint, count, list);
    if (!isUser && !isGoal && destination) {
      const confirm = btn(
        checkpointConfirmed ? "설정 완료 ✓" : "만날 곳 확정",
        () => {
          checkpointConfirmed = true;
          savePosition();
          render();
          status(destination.name + " 앞을 만날 곳으로 설정했어요.");
        },
        "e-primary",
      );
      confirm.id = "confirmCheckpoint";
      confirm.disabled = checkpointConfirmed;
      wrap.append(confirm);
    }
    return wrap;
  }
  function terminalSelect() {
    const row = el("div", "e-terminal-row");
    const label = el("label", "", "이용 중인 터미널");
    label.htmlFor = "mainTerminal";
    const sel = el("select");
    sel.id = "mainTerminal";
    [
      [1, "제1터미널"],
      [2, "제2터미널"],
      [3, "탑승동"],
    ].forEach(([id, t]) => {
      const o = el("option", "", t);
      o.value = id;
      o.selected = b === id;
      sel.append(o);
    });
    sel.onchange = () => {
      b = +sel.value;
      current = data.pois.find(
        (p) => p.building === b && p.category === 10010216,
      );
      destination = null;
      finalGoal = null;
      checkpointConfirmed = false;
      invalidateMatch();
      savePosition();
      render();
    };
    row.append(label, sel, el("span", "", "3층 · 현재 위치 직접 설정"));
    return row;
  }

  function render() {
    root.dataset.page = page;
    const box = $("easyContent");
    const live = $("advancedMap");
    if (box.contains(live)) {
      document.body.append(live);
      live.hidden = true;
    }
    document.body.classList.remove("home-map");
    box.replaceChildren();
    status("");
    $("pageBack").disabled = !trail.length;
    $("pageLabel").textContent =
      {
        home: "내 위치 · 만날 곳",
        location: "내 위치 설정",
        kinds: "시설 종류 선택",
        results: "근처 시설 찾기",
        detail: "만날 곳 · 목적지 확인",
        matching: "로봇 매칭",
      }[page] || "";
    if (!data) {
      box.append(el("h1", "", "안내를 준비하고 있어요"));
      return;
    }
    if (page === "home") {
      box.append(hero("어디로 갈까요?", "위치를 고르고 저니봇을 불러요."));
      const slot = el("section", "home-map-slot");
      slot.id = "homeMapSlot";
      slot.setAttribute("aria-label", "내 주변 공항 지도");
      const tag = el("span", "home-map-tag", "내 주변 지도");
      const expand = btn(
        "⛶ 크게 보기",
        () => openMap(false),
        "home-map-expand",
      );
      slot.append(tag, expand);
      box.append(slot, terminalSelect());
      const forms = el("div", "e-location-checkpoint");
      forms.append(facilitySearch("user"), facilitySearch("checkpoint"));
      box.append(forms);
      const actions = el("div", "e-home-actions");
      const next = btn("로봇 호출", () => go("detail"), "e-primary");
      next.disabled = !destination || !checkpointConfirmed;
      actions.append(
        next,
        btn("지도 크게 보기", () => openMap(false)),
      );
      box.append(actions);
      box.append(el("h2", "e-secondary-title", "시설 찾기"));
      const grid = el("div", "e-choices e-compact-choices");
      groups.forEach(([id, t, d, i]) => {
        const c = btn(
          "",
          () => {
            group = id;
            go("kinds");
          },
          "e-choice",
        );
        c.append(
          el("span", "e-choice-icon", i),
          el("h2", "", t),
          el("p", "", d),
          el("span", "e-choice-arrow", "→"),
        );
        grid.append(c);
      });
      box.append(grid);
      mountHomeMap();
    } else if (page === "location") {
      box.append(
        hero(
          "내 위치",
          "가까운 시설을 골라 주세요.",
        ),
      );
      const form = el("div", "e-form");
      const l = el("label", "", "터미널");
      const sel = el("select");
      sel.setAttribute("aria-label", "현재 터미널");
      [
        [1, "제1터미널"],
        [2, "제2터미널"],
        [3, "탑승동"],
      ].forEach(([id, t]) => {
        const o = el("option", "", t);
        o.value = id;
        o.selected = id === b;
        sel.append(o);
      });
      sel.onchange = () => {
        b = +sel.value;
        current = data.pois.find(
          (p) => p.building === b && p.category === 10010216,
        );
        destination = null;
        finalGoal = null;
        checkpointConfirmed = false;
        invalidateMatch();
        savePosition();
        render();
      };
      l.append(sel);
      form.append(l);
      const label = el("label", "", "가까운 표지판");
      const ps = el("select");
      ps.setAttribute("aria-label", "가까운 표지판");
      data.pois
        .filter(
          (p) => p.building === b && [10010216, 10010215].includes(p.category),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))
        .forEach((p) => {
          const o = el("option", "", p.name);
          o.value = p.id;
          o.selected = p.id === current.id;
          ps.append(o);
        });
      ps.onchange = () => {
        current = data.pois.find((p) => String(p.id) === ps.value);
        checkpointConfirmed = false;
        invalidateMatch();
        savePosition();
      };
      label.append(ps);
      form.append(
        label,
        btn(
          "위치 저장",
          () => {
            savePosition();
            goBack();
          },
          "e-primary",
        ),
      );
      box.append(
        form,
        el(
          "p",
          "e-muted",
          "선택한 시설 앞을 내 위치로 사용해요.",
        ),
      );
    } else if (page === "kinds") {
      box.append(
        steps(1),
        hero("시설 선택", ""),
      );
      const grid = el("div", "e-kind-grid");
      kinds
        .filter((k) => k[2] === group)
        .forEach((k) =>
          grid.append(
            btn(
              k[1] + "  →",
              () => {
                kind = k;
                more = false;
                go("results");
              },
              "e-kind",
            ),
          ),
        );
      box.append(grid, btn("← 뒤로", goBack, "e-back"));
    } else if (page === "results") {
      box.append(
        steps(2),
        hero(
          kind[1] + "을 찾아볼게요",
          "같은 구역부터 찾아요.",
        ),
        locationLine(),
      );
      if (kind[0] === "toilet")
        box.append(
          el(
            "p",
            "e-warning",
            "일반 화장실 위치예요. 장애인 설비는 현장 확인이 필요해요.",
          ),
        );
      const arr = data.pois
        .filter((p) => p.building === b && kind[3](p))
        .map((p) => ({ p, r: route(p), d: near(p) }))
        .sort(
          (a, z) =>
            Number(!a.r) - Number(!z.r) ||
            (a.r?.distance ?? a.d) - (z.r?.distance ?? z.d),
        );
      if (!arr.length) {
        box.append(
          el(
            "div",
            "e-empty",
            kind[0] === "food"
              ? "푸드코트 구역 정보는 준비 중이에요."
              : "이 구역에 등록된 시설이 없어요.",
          ),
        );
      } else {
        const list = el("div", "e-result-list");
        arr.slice(0, more ? arr.length : 3).forEach(({ p, r }) => {
          const c = btn(
            "",
            () => {
              destination = p;
              checkpointConfirmed = false;
              invalidateMatch();
              savePosition();
              go("detail");
            },
            "e-place",
          );
          const text = el("div");
          text.append(
            el("h2", "", p.name),
            el(
              "p",
              "",
              `${p.area === "AIR" ? "탑승구역" : "일반구역"} · ${r ? "이동 경로 약 " + Math.round(r.distance) + "m" : "경로 확인 필요"}`,
            ),
          );
          c.append(text, el("span", "", "확인 →"));
          list.append(c);
        });
        box.append(list);
        if (arr.length > 3)
          box.append(
            btn(
              more ? "3곳만 보기" : "더 보기",
              () => {
                more = !more;
                render();
              },
              "e-back",
            ),
          );
      }
      box.append(btn("← 뒤로", goBack, "e-back"));
    } else if (page === "detail") {
      const r = route(destination);
      box.append(
        steps(2),
        hero("어디로 안내할까요?", "만난 뒤 목적지로 안내해요."),
      );
      const panel = el("div", "e-destination");
      panel.append(
        el("p", "e-muted", "내 위치"),
        el("h2", "", current.name + " 앞"),
        el("div", "e-route-arrow", "↓"),
        el("p", "e-muted", "만날 곳"),
        el("h2", "", destination.name + " 앞"),
        el(
          "p",
          "e-distance",
          r
            ? "내 위치 → 만날 곳 약 " + Math.round(r.distance) + "m"
            : "만날 곳까지 연결 경로 확인 필요",
        ),
      );
      if (!checkpointConfirmed)
        panel.append(
          btn(
            "만날 곳으로 설정",
            () => {
              checkpointConfirmed = true;
              savePosition();
              render();
            },
            "e-primary",
          ),
        );
      box.append(panel, facilitySearch("goal"));
      const g = finalGoal ? between(destination, finalGoal) : null;
      if (finalGoal)
        box.append(
          el(
            "p",
            g && g.distance > 0 ? "e-muted" : "e-warning",
            g && g.distance > 0
              ? "만날 곳 → 목적지 약 " +
                  Math.round(g.distance) +
                  "m · 같은 층 이동"
              : "이동 가능한 다른 목적지를 골라 주세요.",
          ),
        );
      const next = btn(
        "로봇 매칭",
        () => {
          invalidateMatch();
          go("matching");
        },
        "e-primary",
      );
      next.id = "startMatching";
      next.disabled = !checkpointConfirmed || !r || !g || g.distance < 1;
      box.append(
        next,
        el(
          "p",
          "e-muted",
          "계단 제외 · 통행 조건은 현장 확인 필요",
        ),
      );
    } else if (page === "matching") {
      box.append(
        steps(3),
        hero(
          matchedRobot ? "저니봇 연결 완료" : "로봇 연결",
          "만날 곳에서 기다려 주세요.",
        ),
      );
      const card = el("section", "e-match-card");
      const im = el("img");
      im.src = "assets/journey-robot.svg";
      im.alt = "매칭할 저니봇";
      card.append(im);
      const copy = el("div");
      copy.append(
        el("span", "e-demo-pill", "로봇 매칭 시연"),
        el(
          "h2",
          "",
          matchedRobot
            ? "저니봇 J-01"
            : matchBusy
              ? "연결 중…"
              : "저니봇 J-01",
        ),
      );
      if (matchedRobot) {
        copy.append(
          el("p", "", matchedRobot.poi.name + " 부근에서 출발"),
          el(
            "p",
            "",
            destination.name +
              " 앞까지 약 " +
              Math.round(matchedRobot.path.distance) +
              "m",
          ),
          el(
            "p",
            "e-muted",
            "만날 곳: " +
              destination.name +
              " 앞 · 이후 목적지: " +
              finalGoal.name,
          ),
        );
        card.append(copy);
        box.append(card, btn("로봇 호출", startApproach, "e-primary"));
      } else {
        copy.append(
          el(
            "p",
            "e-muted",
            "같은 구역의 로봇을 찾아요.",
          ),
        );
        card.append(copy);
        box.append(card);
        const match = btn(
          matchBusy ? "매칭 중…" : "로봇 찾기",
          matchRobot,
          "e-primary",
        );
        match.disabled = matchBusy;
        box.append(match);
      }
    }
  }
  function between(a, z) {
    if (a.area && z.area && a.area !== z.area) return null;
    return graph.route(node(a).id, node(z).id, b, true);
  }
  async function matchRobot() {
    if (matchBusy) return;
    matchBusy = true;
    const token = ++matchToken;
    render();
    await new Promise((r) => setTimeout(r, 1100));
    if (token !== matchToken || page !== "matching") return;
    const candidates = data.pois
      .filter(
        (p) =>
          p.building === b &&
          p.area === destination.area &&
          p.id !== destination.id &&
          p.id !== current.id,
      )
      .map((p) => ({
        p,
        d: Math.hypot(p.lon - current.lon, p.lat - current.lat),
      }))
      .sort((a, z) => a.d - z.d)
      .slice(0, 90);
    const options = candidates
      .map(({ p }) => ({ poi: p, path: between(p, destination) }))
      .filter(
        (x) =>
          x.path &&
          x.path.distance >= 35 &&
          x.path.distance <= 650 &&
          node(x.poi).id !== node(current).id,
      )
      .sort(
        (a, z) =>
          Math.abs(a.path.distance - 180) - Math.abs(z.path.distance - 180),
      );
    matchBusy = false;
    if (!options.length) {
      render();
      status(
        "이 만날 곳으로 이동 가능한 시연 로봇을 찾지 못했어요. 뒤로 돌아가 다른 만날 곳를 선택해 주세요.",
      );
      return;
    }
    matchedRobot = options[0];
    render();
    status("시연 로봇 저니봇 J-01이 매칭됐어요.");
  }
  const flowPanel = el("section", "e-flow-panel");
  flowPanel.id = "robotFlowPanel";
  flowPanel.hidden = true;
  flowPanel.setAttribute("aria-label", "로봇 동행 진행 상태");
  document.body.append(flowPanel);
  function flowControls(stage) {
    flowPanel.replaceChildren();
    flowPanel.dataset.stage = stage;
    const head = el("div", "e-flow-head");
    const im = el("img");
    im.src = "assets/journey-robot.svg";
    im.alt = "저니봇 J-01";
    const copy = el("div");
    copy.setAttribute("aria-live", "polite");
    copy.append(
      el("span", "e-demo-pill", "J-01 · 이동 시연"),
      el(
        "h2",
        "",
        {
          approach: "저니봇이 오고 있어요",
          arrived: "저니봇이 만날 곳에 도착했어요",
          met: "저니봇과 만났어요",
          guide: "목적지로 안내 중",
          complete: "목적지에 도착했어요",
        }[stage],
      ),
    );
    head.append(im, copy);
    flowPanel.append(head);
    const sub = el(
      "p",
      "e-flow-sub",
      stage === "approach" || stage === "arrived"
        ? "만날 곳: " + destination.name + " 앞"
        : "함께 갈 곳: " + finalGoal.name + " 앞",
    );
    flowPanel.append(sub);
    if (stage === "approach" || stage === "guide") {
      const track = el("div", "e-flow-track");
      const fill = el("i");
      fill.id = "flowFill";
      track.append(fill);
      const progress = el("p", "e-flow-metric");
      progress.id = "flowMetric";
      progress.setAttribute("role", "status");
      progress.setAttribute("aria-live", "off");
      flowPanel.append(track, progress);
      const pause = btn(
        "일시정지",
        () => {
          flowPaused = window.journeyMap.pauseService();
          pause.textContent = flowPaused ? "계속 이동" : "일시정지";
          flowPanel.classList.toggle("flow-paused", flowPaused);
        },
        "e-button",
      );
      flowPanel.append(pause);
      if (stage === "approach")
        flowPanel.append(
          el(
            "p",
            "e-flow-note",
            "파랑: 내 위치 · 주황: 만날 곳",
          ),
        );
    } else if (stage === "arrived") {
      flowPanel.append(
        el(
          "p",
          "e-flow-note",
          "로봇을 만나면 확인해 주세요.",
        ),
        btn("로봇을 만났어요", confirmMeeting, "e-primary"),
      );
    } else if (stage === "met") {
      flowPanel.append(btn("안내 시작", startGuidance, "e-primary"));
    } else if (stage === "complete") {
      flowPanel.append(
        el("p", "e-flow-note", finalGoal.name + " 앞까지 동행을 마쳤어요."),
        btn("처음으로", () => closeFlow(true), "e-primary"),
      );
    }
    const steps = el("div", "e-flow-stages");
    ["매칭 완료", "로봇 오는 중", "만날 곳 만남", "목적지 안내"].forEach(
      (t, i) =>
        steps.append(
          el(
            "span",
            i ===
              { approach: 1, arrived: 2, met: 2, guide: 3, complete: 3 }[stage]
              ? "active"
              : "",
            t,
          ),
        ),
    );
    flowPanel.append(steps);
  }
  async function startApproach() {
    if (!matchedRobot) return;
    await openMap(false);
    flowStage = "approach";
    window.robotFlowActive = true;
    flowPanel.hidden = false;
    document.body.classList.add("robot-flow");
    $("simpleMapCaption").hidden = true;
    flowControls("approach");
    window.journeyMap.animateService({
      user: current,
      robot: matchedRobot.poi,
      checkpoint: destination,
      goal: null,
      path: matchedRobot.path,
      guide: false,
      onProgress: updateFlow,
      onDone: () => {
        flowStage = "arrived";
        flowControls("arrived");
      },
    });
  }
  function updateFlow({ fraction, remaining }) {
    const f = $("flowFill"),
      m = $("flowMetric");
    if (f) f.style.width = Math.round(fraction * 100) + "%";
    if (m)
      m.textContent =
        "남은 거리 약 " + remaining + "m · " + Math.round(fraction * 100) + "%";
  }
  function confirmMeeting() {
    flowStage = "met";
    window.journeyMap.serviceScene({
      user: destination,
      robot: destination,
      checkpoint: destination,
      goal: finalGoal,
      path: null,
    });
    flowControls("met");
  }
  function startGuidance() {
    const path = between(destination, finalGoal);
    if (!path) return;
    flowStage = "guide";
    flowPaused = false;
    flowControls("guide");
    window.journeyMap.animateService({
      user: destination,
      robot: destination,
      checkpoint: destination,
      goal: finalGoal,
      path,
      guide: true,
      onProgress: updateFlow,
      onDone: () => {
        flowStage = "complete";
        flowControls("complete");
      },
    });
  }
  function closeFlow(home = false) {
    window.journeyMap.hide();
    flowStage = null;
    window.robotFlowActive = false;
    flowPanel.hidden = true;
    document.body.classList.remove("robot-flow");
    $("simpleMapCaption").hidden = false;
    $("advancedMap").hidden = true;
    root.hidden = false;
    document.body.classList.remove("map-mode");
    if (home) {
      current = finalGoal || current;
      destination = null;
      finalGoal = null;
      checkpointConfirmed = false;
      invalidateMatch();
      savePosition();
      trail = [];
      go("home", false);
    } else go(mapReturn, false);
  }
  async function mountHomeMap() {
    const token = ++homeMapToken,
      slot = $("homeMapSlot");
    if (!slot) return;
    const live = $("advancedMap");
    slot.prepend(live);
    live.hidden = false;
    document.body.classList.add("home-map");
    window.easyMapMode = true;
    await window.journeyMap.show(b, null, null);
    if (token !== homeMapToken || page !== "home" || root.hidden) return;
    await window.journeyMap.showPositions(
      current,
      checkpointConfirmed ? destination : null,
    );
    window.journeyMap.resize();
    window.journeyMap.focusNearby(current);
  }
  async function openMap(withRoute, simulate = false) {
    if (!data) return;
    mapReturn = page;
    document.body.classList.remove("home-map");
    document.body.append($("advancedMap"));
    window.easyMapMode = true;
    root.hidden = true;
    $("advancedMap").hidden = false;
    document.body.classList.add("map-mode");
    $("building").disabled = true;
    back.focus();
    await window.journeyMap.show(
      b,
      withRoute ? current : null,
      withRoute ? destination : null,
    );
    $("simpleMapCaption").textContent = withRoute
      ? current.name +
        " → " +
        destination.name +
        " · 약 " +
        Math.round(route(destination).distance) +
        "m"
      : "내 위치: " +
        current.name +
        (checkpointConfirmed && destination
          ? " · 만날 곳: " + destination.name
          : "") +
        " · 시설 " +
        data.pois.filter((p) => p.building === b).length +
        "곳";
    if (!withRoute)
      await window.journeyMap.showPositions(
        current,
        checkpointConfirmed ? destination : null,
      );
    if (simulate) window.journeyMap.meet(current, destination);
  }
  try {
    data = await (await fetch("data/airport.json")).json();
    graph = new AirportGraph(data);
    current = data.pois.find((p) => p.building === 1 && p.name === "탑승구 27");
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (saved && [1, 2, 3].includes(saved.b)) {
        const found = data.pois.find(
          (p) => p.building === saved.b && p.id === saved.current,
        );
        if (found) {
          b = saved.b;
          current = found;
          destination =
            data.pois.find(
              (p) => p.building === b && p.id === saved.checkpoint,
            ) || null;
          checkpointConfirmed = !!destination && !!saved.confirmed;
          finalGoal =
            data.pois.find((p) => p.building === b && p.id === saved.goal) ||
            null;
        }
      }
    } catch {}
    render();
  } catch {
    root.textContent =
      "안내 자료를 불러오지 못했어요. 페이지를 새로고침해 주세요.";
  }
})();
