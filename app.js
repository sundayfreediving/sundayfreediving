/* =========================================================
   선데이프리다이빙 PWA — app.js
   ---------------------------------------------------------
   · 로컬 체험 모드 : Supabase 설정이 비어 있을 때 (localStorage)
   · 클라우드 모드 : config.js에 Supabase URL/ANON KEY 입력 시
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.SFD_CONFIG || {};
  var ADMIN_EMAIL = String(CFG.ADMIN_EMAIL || "sundayfreediving@gmail.com").toLowerCase();
  var LOCAL_PIN = String(CFG.LOCAL_ADMIN_PIN || "0619");
  var WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  var RING_R = 142;
  var RING_C = 2 * Math.PI * RING_R;

  var LEVEL_COLORS = {
    "AIDA1": "#4a90c2",
    "AIDA2": "#0d8797",
    "AIDA3": "#0b6b8f",
    "AIDA4": "#5a3f80",
    "트레이닝": "#e8964e",
    "자율연습": "#4f9169",
    "투어": "#b26a92",
    "기타": "#78899a"
  };

  // ---------- 짧은 유틸 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + pad2(sec % 60);
  }

  function fmtLong(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m && s) return m + "분 " + s + "초";
    if (m) return m + "분";
    return s + "초";
  }

  function parseTimeInput(str) {
    if (!str) return null;
    var t = String(str).trim().replace(/\s/g, "");
    var mm;
    if (t.indexOf(":") >= 0) {
      mm = t.split(":");
      if (mm.length !== 2) return null;
      var m = parseInt(mm[0], 10);
      var s = parseInt(mm[1], 10);
      if (isNaN(m) || isNaN(s) || s > 59) return null;
      return m * 60 + s;
    }
    if (!/^\d+$/.test(t)) return null;
    return parseInt(t, 10);
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function keyToDate(key) {
    var p = String(key).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function todayKey() { return dateKey(new Date()); }

  function isoDateKey(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : dateKey(d);
  }

  function shortDate(key) {
    if (!key) return "";
    var d = keyToDate(key);
    return (d.getMonth() + 1) + "/" + d.getDate() + " (" + WEEK[d.getDay()] + ")";
  }

  function longDate(key) {
    var d = keyToDate(key);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + WEEK[d.getDay()] + "요일";
  }

  function timeAgo(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return Math.floor(diff / 60) + "분 전";
    if (diff < 86400) return Math.floor(diff / 3600) + "시간 전";
    if (diff < 172800) return "어제";
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  // ---------- 설정 값 ----------
  var DEFAULT_PREFS = {
    pb: 150,
    tableType: "co2",
    muted: false,
    nickname: "",
    co2: { rounds: 8, holdPct: 50, restStart: 120, stepSec: 15 },
    o2: { rounds: 8, holdPct: 50, restStart: 120, stepSec: 15 }
  };
  var prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));

  function loadPrefs() {
    var saved = lsGet("sfd.prefs", null);
    if (saved && typeof saved === "object") {
      prefs.pb = typeof saved.pb === "number" ? saved.pb : prefs.pb;
      prefs.tableType = saved.tableType === "o2" ? "o2" : "co2";
      prefs.muted = !!saved.muted;
      prefs.nickname = typeof saved.nickname === "string" ? saved.nickname : "";
      ["co2", "o2"].forEach(function (k) {
        if (saved[k] && typeof saved[k] === "object") {
          prefs[k] = {
            rounds: clamp(parseInt(saved[k].rounds, 10) || 8, 3, 12),
            holdPct: clamp(parseInt(saved[k].holdPct, 10) || 50, 30, 90),
            restStart: clamp(parseInt(saved[k].restStart, 10) || 120, 30, 300),
            stepSec: clamp(parseInt(saved[k].stepSec, 10) || 15, 0, 45)
          };
        }
      });
    }
  }

  function savePrefs() { lsSet("sfd.prefs", prefs); }

  // ---------- 상태 ----------
  var state = {
    tab: "breath",
    tableType: "co2",
    pb: 150,
    isAdmin: false,
    adminEmail: "",
    history: [],
    schedules: [],
    posts: [],
    comments: [],
    viewMonth: null,
    selected: todayKey(),
    openComments: {},
    cloudFailed: false,
    cloudReady: false,
    busy: false
  };

  // ---------- Supabase ----------
  var sb = null;

  function cloudConfigured() {
    return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  }

  function useCloud() {
    return cloudConfigured() && !state.cloudFailed;
  }

  var cloudPromise = null;

  function ensureCloud() {
    if (!cloudConfigured()) return Promise.resolve(false);
    if (cloudPromise) return cloudPromise;

    cloudPromise = new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) { resolve(); return; }
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("supabase-cdn")); };
      document.head.appendChild(s);
    }).then(function () {
      if (!window.supabase || !window.supabase.createClient) throw new Error("supabase-missing");
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      state.cloudReady = true;
      return sb.auth.getSession();
    }).then(function (res) {
      applySession(res && res.data ? res.data.session : null);
      sb.auth.onAuthStateChange(function (event, session) { applySession(session); });
      return true;
    }).catch(function (err) {
      console.warn("[SFD] Supabase 연결 실패:", err);
      state.cloudFailed = true;
      state.cloudReady = false;
      cloudPromise = null;
      return false;
    });

    return cloudPromise;
  }

  function applySession(session) {
    var email = session && session.user ? String(session.user.email || "") : "";
    var admin = email.toLowerCase() === ADMIN_EMAIL;
    state.adminEmail = email;
    if (admin !== state.isAdmin) {
      state.isAdmin = admin;
      renderScheduleChrome();
      renderPosts();
    }
  }

  function mapSchedule(row) {
    return {
      id: row.id,
      title: row.title || "",
      class_date: String(row.class_date || row.date || "").slice(0, 10),
      start_time: String(row.start_time || "").slice(0, 5),
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : "",
      location: row.location || "",
      level: row.level || "",
      capacity: row.capacity === null || row.capacity === undefined ? null : parseInt(row.capacity, 10),
      notes: row.notes || ""
    };
  }

  function mapPost(row) {
    return {
      id: row.id,
      nickname: row.nickname || "익명",
      content: row.content || "",
      tag_date: row.tag_date ? String(row.tag_date).slice(0, 10) : "",
      tag_pool: row.tag_pool || "",
      created_at: row.created_at || new Date().toISOString()
    };
  }

  function mapComment(row) {
    return {
      id: row.id,
      post_id: row.post_id,
      nickname: row.nickname || "익명",
      content: row.content || "",
      created_at: row.created_at || new Date().toISOString()
    };
  }

  function sortSchedules(list) {
    return list.sort(function (a, b) {
      if (a.class_date === b.class_date) return String(a.start_time).localeCompare(String(b.start_time));
      return String(a.class_date).localeCompare(String(b.class_date));
    });
  }

  function localSchedules() {
    var list = lsGet("sfd.schedules", null);
    if (!Array.isArray(list)) return [];
    return sortSchedules(list.map(mapSchedule));
  }

  function saveLocalSchedules() {
    lsSet("sfd.schedules", state.schedules);
  }

  function localPosts() {
    var list = lsGet("sfd.posts", []);
    return Array.isArray(list) ? list.map(mapPost) : [];
  }

  function localComments() {
    var list = lsGet("sfd.comments", []);
    return Array.isArray(list) ? list.map(mapComment) : [];
  }

  function saveLocalPosts() { lsSet("sfd.posts", state.posts); }
  function saveLocalComments() { lsSet("sfd.comments", state.comments); }

  async function refreshSchedules() {
    if (useCloud()) {
      if (!state.cloudReady) await ensureCloud();
      if (useCloud() && sb) {
        var res = await sb.from("schedules").select("*")
          .order("class_date", { ascending: true })
          .order("start_time", { ascending: true });
        if (res.error) throw res.error;
        state.schedules = (res.data || []).map(mapSchedule);
      } else {
        state.schedules = localSchedules();
      }
    } else {
      state.schedules = localSchedules();
    }
    sortSchedules(state.schedules);
    renderCalendar();
    renderDay();
  }

  async function refreshPosts() {
    if (useCloud()) {
      if (!state.cloudReady) await ensureCloud();
      if (useCloud() && sb) {
        var postsRes = await sb.from("buddy_posts").select("*").order("created_at", { ascending: false });
        if (postsRes.error) throw postsRes.error;
        state.posts = (postsRes.data || []).map(mapPost);

        var commentsRes = await sb.from("buddy_comments").select("*").order("created_at", { ascending: true });
        if (commentsRes.error) throw commentsRes.error;
        state.comments = (commentsRes.data || []).map(mapComment);
      } else {
        state.posts = localPosts();
        state.comments = localComments();
      }
    } else {
      state.posts = localPosts();
      state.comments = localComments();
    }
    renderPosts();
  }

  async function saveScheduleRecord(payload, id) {
    if (useCloud()) {
      if (!sb) throw new Error("클라우드 연결이 준비되지 않았어요.");
      var res;
      if (id) {
        res = await sb.from("schedules").update(payload).eq("id", id);
      } else {
        res = await sb.from("schedules").insert(payload);
      }
      if (res.error) throw res.error;
    } else {
      if (id) {
        var found = null;
        state.schedules.forEach(function (s) { if (s.id === id) found = s; });
        if (found) {
          Object.keys(payload).forEach(function (k) { found[k] = payload[k]; });
        }
      } else {
        var row = mapSchedule(Object.assign({ id: uid() }, payload));
        state.schedules.push(row);
      }
      sortSchedules(state.schedules);
      saveLocalSchedules();
    }
    await refreshSchedules();
  }

  async function deleteScheduleRecord(id) {
    if (useCloud()) {
      var res = await sb.from("schedules").delete().eq("id", id);
      if (res.error) throw res.error;
      await refreshSchedules();
    } else {
      state.schedules = state.schedules.filter(function (s) { return s.id !== id; });
      saveLocalSchedules();
      renderCalendar();
      renderDay();
    }
  }

  async function addPostRecord(payload) {
    if (useCloud()) {
      var res = await sb.from("buddy_posts").insert(payload).select().single();
      if (res.error) throw res.error;
      await refreshPosts();
      return res.data;
    }
    var row = mapPost(Object.assign({ id: uid(), created_at: new Date().toISOString() }, payload));
    state.posts.unshift(row);
    saveLocalPosts();
    renderPosts();
    return row;
  }

  async function deletePostRecord(id) {
    if (useCloud()) {
      var res = await sb.from("buddy_posts").delete().eq("id", id);
      if (res.error) throw res.error;
      await refreshPosts();
    } else {
      state.posts = state.posts.filter(function (p) { return p.id !== id; });
      state.comments = state.comments.filter(function (c) { return c.post_id !== id; });
      saveLocalPosts();
      saveLocalComments();
      renderPosts();
    }
  }

  async function addCommentRecord(payload) {
    if (useCloud()) {
      var res = await sb.from("buddy_comments").insert(payload).select().single();
      if (res.error) throw res.error;
      await refreshPosts();
      return res.data;
    }
    var row = mapComment(Object.assign({ id: uid(), created_at: new Date().toISOString() }, payload));
    state.comments.push(row);
    saveLocalComments();
    renderPosts();
    return row;
  }

  async function deleteCommentRecord(id) {
    if (useCloud()) {
      var res = await sb.from("buddy_comments").delete().eq("id", id);
      if (res.error) throw res.error;
      await refreshPosts();
    } else {
      state.comments = state.comments.filter(function (c) { return c.id !== id; });
      saveLocalComments();
      renderPosts();
    }
  }

  // ---------- 샘플 데이터 ----------
  function seedIfNeeded() {
    var seeded = lsGet("sfd.seeded", false);
    var hasSchedules = lsGet("sfd.schedules", null);
    var hasPosts = lsGet("sfd.posts", null);
    if (seeded && hasSchedules && hasPosts) return;

    if (!hasSchedules) {
      var base = startOfToday();
      function d(n) { return dateKey(addDays(base, n)); }
      var samples = [
        {
          id: uid(), title: "자율연습 (버디 환영)", class_date: d(0), start_time: "19:00", end_time: "21:00",
          location: "K26", level: "자율연습", capacity: 8,
          notes: "오늘 저녁 풀 세션 · 버디 페어로 진행합니다."
        },
        {
          id: uid(), title: "AIDA2 코스 1일차", class_date: d(1), start_time: "19:00", end_time: "22:00",
          location: "K26", level: "AIDA2", capacity: 4,
          notes: "이론 40분 + 풀 세션. 교재, 수영복, 수건 지참."
        },
        {
          id: uid(), title: "AIDA3 딥다이브", class_date: d(2), start_time: "10:00", end_time: "17:00",
          location: "딥스테이션", level: "AIDA3", capacity: 6,
          notes: "08:00 잠실 출발 · 차량 2대 · 장비 대여 가능."
        },
        {
          id: uid(), title: "자율연습 (버디 환영)", class_date: d(4), start_time: "19:00", end_time: "21:00",
          location: "K26", level: "자율연습", capacity: 8,
          notes: "버디 페어로 진행합니다. 입장비는 개별 결제."
        },
        {
          id: uid(), title: "AIDA2 코스 2일차", class_date: d(5), start_time: "09:00", end_time: "18:00",
          location: "잠실", level: "AIDA2", capacity: 4,
          notes: "이론 시험 포함. 09:00까지 입장 완료."
        },
        {
          id: uid(), title: "AIDA1 체험 클래스", class_date: d(-1), start_time: "19:00", end_time: "21:00",
          location: "K26", level: "AIDA1", capacity: 6,
          notes: "첫 프리다이빙 · 장비 대여 포함."
        },
        {
          id: uid(), title: "딥 트레이닝 데이", class_date: d(9), start_time: "10:00", end_time: "16:00",
          location: "딥스테이션", level: "트레이닝", capacity: 6,
          notes: "FIM · CNF 자율 트레이닝. 버디 필수."
        },
        {
          id: uid(), title: "AIDA3 코스 1일차", class_date: d(12), start_time: "19:00", end_time: "22:00",
          location: "K26", level: "AIDA3", capacity: 4,
          notes: "이론 + 스태틱 세션."
        },
        {
          id: uid(), title: "AIDA4 코스", class_date: d(21), start_time: "08:00", end_time: "18:00",
          location: "딥스테이션", level: "AIDA4", capacity: 3,
          notes: "예약 확정 · 서약서 제출 완료."
        },
        {
          id: uid(), title: "보홀 투어 (5박 6일)", class_date: d(40), start_time: "00:00", end_time: "23:59",
          location: "보홀", level: "투어", capacity: 8,
          notes: "상세 일정과 항공권은 개별 안내드립니다."
        }
      ];
      lsSet("sfd.schedules", samples);
    }

    if (!hasPosts) {
      var now = Date.now();
      function ago(h) { return new Date(now - h * 3600 * 1000).toISOString(); }
      var p1 = uid(), p2 = uid(), p3 = uid(), p4 = uid();
      var posts = [
        {
          id: p1, nickname: "물개", content: "이번 주말 K26에서 AIDA2 연습하실 분 계신가요? 버디 구해요 🌊",
          tag_date: dateKey(addDays(startOfToday(), 2)), tag_pool: "K26", created_at: ago(2)
        },
        {
          id: p2, nickname: "하프물범", content: "딥스테이션 같이 가실 분! 차량 여유 있어요. 08:00 잠실 출발.",
          tag_date: dateKey(addDays(startOfToday(), 4)), tag_pool: "딥스테이션", created_at: ago(5)
        },
        {
          id: p3, nickname: "프리다이버K", content: "잠실 평일 저녁 자율연습 같이 하실 분 구합니다. 초보도 환영이에요.",
          tag_date: "", tag_pool: "잠실", created_at: ago(27)
        },
        {
          id: p4, nickname: "숨참기장인", content: "오늘 O2 테이블 8라운드 같이 돌리실 분? 2:00 휴식으로 천천히 갑니다.",
          tag_date: "", tag_pool: "", created_at: ago(50)
        }
      ];
      var comments = [
        { id: uid(), post_id: p1, nickname: "물개", content: "토요일 오전 좋아요! 10시 어때요?", created_at: ago(1.5) },
        { id: uid(), post_id: p1, nickname: "프리다이버K", content: "저도 끼워주세요 🙌", created_at: ago(1) },
        { id: uid(), post_id: p2, nickname: "하프물범", content: "2자리 남았습니다!", created_at: ago(4) },
        { id: uid(), post_id: p3, nickname: "숨참기장인", content: "수요일 저녁 가능해요.", created_at: ago(20) },
        { id: uid(), post_id: p4, nickname: "물개", content: "O2는 아직 무리라 CO2로 같이 해요 ㅎㅎ", created_at: ago(45) }
      ];
      lsSet("sfd.posts", posts);
      lsSet("sfd.comments", comments);
    }

    lsSet("sfd.seeded", true);
  }

  // ---------- 토스트 / 시트 ----------
  var toastEl = $("#toast");
  var toastTimer = null;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-show"); }, 2300);
  }

  var sheetEl = $("#sheet");
  var sheetBodyEl = $("#sheetBody");
  var sheetTitleEl = $("#sheetTitle");
  var backdropEl = $("#sheetBackdrop");
  var sheetHideTimer = null;

  function openSheet(title, html) {
    clearTimeout(sheetHideTimer);
    sheetTitleEl.textContent = title;
    sheetBodyEl.innerHTML = html;
    sheetBodyEl.scrollTop = 0;
    sheetEl.hidden = false;
    backdropEl.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(function () {
      sheetEl.classList.add("is-open");
      backdropEl.classList.add("is-open");
    });
  }

  function closeSheet() {
    sheetEl.classList.remove("is-open");
    backdropEl.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    clearTimeout(sheetHideTimer);
    sheetHideTimer = setTimeout(function () {
      sheetEl.hidden = true;
      backdropEl.hidden = true;
      sheetBodyEl.innerHTML = "";
    }, 380);
  }

  // ---------- 숨참기 : 테이블 ----------
  var pbValueEl = $("#pbValue");
  var pbInputEl = $("#pbInput");
  var pbEditRowEl = $("#pbEditRow");
  var tablePreviewEl = $("#tablePreview");
  var tableTitleEl = $("#tableTitle");
  var tableSubEl = $("#tableSub");
  var tableTotalEl = $("#tableTotal");
  var stepLabelEl = $("#stepLabel");
  var roundsOutEl = $("#roundsOut");
  var holdPctOutEl = $("#holdPctOut");
  var restOutEl = $("#restOut");
  var stepOutEl = $("#stepOut");

  function currentSettings() { return prefs[state.tableType]; }

  function buildTable() {
    var s = currentSettings();
    var hold0 = Math.max(5, Math.round(prefs.pb * s.holdPct / 100));
    var rows = [];
    for (var i = 0; i < s.rounds; i++) {
      var hold = state.tableType === "co2" ? hold0 : hold0 + s.stepSec * i;
      var rest = state.tableType === "co2"
        ? Math.max(10, s.restStart - s.stepSec * i)
        : s.restStart;
      rows.push({ round: i + 1, hold: hold, rest: rest });
    }
    return rows;
  }

  function renderBreath() {
    pbValueEl.textContent = fmt(prefs.pb);
    pbInputEl.value = fmt(prefs.pb);

    var s = currentSettings();
    roundsOutEl.textContent = s.rounds;
    holdPctOutEl.textContent = s.holdPct + "%";
    restOutEl.textContent = fmt(s.restStart);
    stepOutEl.textContent = state.tableType === "co2" ? (s.stepSec + "초") : (s.stepSec + "초");
    stepLabelEl.innerHTML = state.tableType === "co2"
      ? '라운드마다 휴식 <em>감소</em>'
      : '라운드마다 숨참기 <em>증가</em>';

    var table = buildTable();
    var hold0 = table[0].hold;
    var holdLast = table[table.length - 1].hold;
    var rest0 = table[0].rest;
    var restLast = table[table.length - 1].rest;

    tableTitleEl.textContent = (state.tableType === "co2" ? "CO2" : "O2") + " · " + s.rounds + " 라운드";
    tableSubEl.textContent = state.tableType === "co2"
      ? "숨참기 " + fmt(hold0) + " 고정 · 휴식 " + fmt(rest0) + " → " + fmt(restLast)
      : "휴식 " + fmt(rest0) + " 고정 · 숨참기 " + fmt(hold0) + " → " + fmt(holdLast);

    var total = 0;
    var rowsHtml = '<div class="table-row head"><span>#</span><span>숨참기</span><span>휴식</span></div>';
    table.forEach(function (r, i) {
      total += r.hold + r.rest;
      rowsHtml += '<div class="table-row' + (i % 2 ? " alt" : "") + (i === table.length - 1 ? " final" : "") + '">'
        + '<span class="rnd">' + r.round + '</span>'
        + '<span class="hold">' + fmt(r.hold) + '</span>'
        + '<span class="rest">' + fmt(r.rest) + '</span>'
        + '</div>';
    });
    tablePreviewEl.innerHTML = rowsHtml;
    tableTotalEl.textContent = "총 " + Math.ceil(total / 60) + "분";

    $$("#tableSeg .seg-btn").forEach(function (b) {
      var on = b.getAttribute("data-type") === state.tableType;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });

    renderHistory();
  }

  function renderHistory() {
    var list = $("#historyList");
    var empty = $("#historyEmpty");
    var count = $("#historyCount");
    state.history = lsGet("sfd.history", []);
    if (!Array.isArray(state.history)) state.history = [];
    state.history.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

    count.textContent = state.history.length ? state.history.length + "회" : "";
    empty.hidden = state.history.length > 0;

    list.innerHTML = state.history.map(function (h) {
      var d = new Date(h.at);
      var when = isNaN(d.getTime()) ? "" : (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      var done = h.rounds >= h.totalRounds;
      return '<div class="history-item">'
        + '<span class="history-badge ' + (h.type === "o2" ? "o2" : "") + '">' + (h.type === "o2" ? "O2" : "CO2") + '</span>'
        + '<div class="history-main">'
        + '<p class="history-title">' + (done ? h.rounds + "라운드 완주" : h.rounds + " / " + h.totalRounds + " 라운드") + '</p>'
        + '<p class="history-sub">' + when + ' · PB ' + fmt(h.pb || 0) + ' · 총 숨참기 ' + fmt(h.holds || 0) + '</p>'
        + '</div>'
        + '<button class="history-del" type="button" data-hid="' + esc(h.id) + '" aria-label="기록 삭제"><svg><use href="#i-trash"/></svg></button>'
        + '</div>';
    }).join("");
  }

  function saveHistoryRecord() {
    var entry = {
      id: uid(),
      at: new Date().toISOString(),
      type: timer.mode,
      pb: prefs.pb,
      rounds: timer.completedHolds,
      totalRounds: timer.totalRounds,
      holds: timer.holdTotal
    };
    state.history = lsGet("sfd.history", []);
    if (!Array.isArray(state.history)) state.history = [];
    state.history.unshift(entry);
    if (state.history.length > 40) state.history = state.history.slice(0, 40);
    lsSet("sfd.history", state.history);
    renderHistory();
  }

  // ---------- 숨참기 : 타이머 ----------
  var timerScreen = $("#timerScreen");
  var timerTimeEl = $("#timerTime");
  var phaseBadgeEl = $("#phaseBadge");
  var timerHintEl = $("#timerHint");
  var timerRoundEl = $("#timerRound");
  var timerNextEl = $("#timerNext");
  var timerModeEl = $("#timerMode");
  var ringEl = $("#ringProgress");
  var timerToggleEl = $("#timerToggle");
  var timerNoteEl = $("#timerNote");
  var timerMuteEl = $("#timerMute");

  var timer = {
    phases: [],
    idx: 0,
    remaining: 0,
    phaseEnd: 0,
    lastTick: 0,
    running: false,
    paused: false,
    finished: false,
    raf: null,
    lastShown: -1,
    lastBeep: -1,
    mode: "co2",
    totalRounds: 0,
    completedHolds: 0,
    holdTotal: 0,
    muted: false
  };

  ringEl.style.strokeDasharray = String(RING_C);
  ringEl.style.strokeDashoffset = String(RING_C);

  var actx = null;

  function ensureAudio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === "suspended") { actx.resume(); }
    return actx;
  }

  function beep(freq, dur, at, vol, type) {
    if (!actx) return;
    try {
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      var t0 = actx.currentTime + (at || 0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  function cue(kind) {
    if (timer.muted) return;
    if (!ensureAudio()) return;
    if (kind === "hold") {
      beep(523, 0.16, 0, 0.16, "triangle");
      beep(784, 0.24, 0.18, 0.14, "triangle");
    } else if (kind === "rest") {
      beep(784, 0.14, 0, 0.13, "triangle");
      beep(523, 0.22, 0.16, 0.11, "triangle");
    } else if (kind === "finish") {
      beep(523, 0.2, 0, 0.14);
      beep(659, 0.2, 0.22, 0.14);
      beep(784, 0.28, 0.44, 0.15);
      beep(1046, 0.5, 0.76, 0.12);
    } else if (kind === "tick") {
      beep(1046, 0.06, 0, 0.07, "square");
    }
  }

  var wakeLock = null;

  function requestWake() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) {
      timerNoteEl.textContent = "이 브라우저는 화면 켜짐 유지를 지원하지 않아요";
      return;
    }
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      timerNoteEl.textContent = "화면이 켜진 상태로 유지됩니다";
      lock.addEventListener("release", function () { wakeLock = null; });
    }).catch(function () {
      timerNoteEl.textContent = "화면 자동 잠금을 막지 못했어요";
    });
  }

  function releaseWake() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* ignore */ }
      wakeLock = null;
    }
  }

  function setUse(btn, iconId) {
    var use = btn.querySelector("use");
    if (use) use.setAttribute("href", "#" + iconId);
  }

  function buildPhases(table) {
    var out = [];
    table.forEach(function (r) {
      if (r.rest > 0) out.push({ kind: "breathe", sec: r.rest, round: r.round });
      out.push({ kind: "hold", sec: r.hold, round: r.round });
    });
    return out;
  }

  function startTimer() {
    var table = buildTable();
    if (!table.length) return;
    ensureAudio();

    timer.phases = buildPhases(table);
    timer.mode = state.tableType;
    timer.totalRounds = table.length;
    timer.idx = 0;
    timer.completedHolds = 0;
    timer.holdTotal = 0;
    timer.finished = false;
    timer.paused = false;
    timer.lastBeep = -1;
    timer.lastShown = -1;
    timer.remaining = timer.phases[0].sec;
    timer.phaseEnd = Date.now() + timer.remaining * 1000;
    timer.lastTick = 0;
    timer.running = true;

    timerModeEl.textContent = state.tableType === "co2" ? "CO2 TABLE" : "O2 TABLE";
    timerScreen.hidden = false;
    document.body.classList.add("is-locked");
    timerScreen.classList.remove("is-hold", "is-paused");
    phaseBadgeEl.textContent = timer.phases[0].kind === "hold" ? "숨참기" : "휴식";
    updateTimerUI(true);
    cue(timer.phases[0].kind === "hold" ? "hold" : "rest");
    setToggleIcon(true);
    requestWake();
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(frame);
  }

  function frame() {
    if (!timer.running) return;
    var now = Date.now();

    // 화면이 꺼지거나 앱이 백그라운드로 갔다 오면 시간이 크게 건너뛴다.
    // 그대로 진행시키면 하지 않은 라운드가 완료로 기록되므로, 멈추고 알린다.
    if (timer.lastTick && now - timer.lastTick > 4000) {
      timer.remaining = Math.max(0, (timer.phaseEnd - now) / 1000);
      pauseTimer();
      timerHintEl.textContent = "화면이 꺼져 잠시 멈췄어요. 재생을 누르면 이어서 진행합니다.";
      return;
    }
    timer.lastTick = now;

    var rem = (timer.phaseEnd - now) / 1000;

    if (rem <= 0) {
      advancePhase(now, false);
      return;
    }

    timer.remaining = rem;
    updateTimerProgress(rem);
    checkBeep(rem);
    timer.raf = requestAnimationFrame(frame);
  }

  function advancePhase(now, skipped) {
    var ph = timer.phases[timer.idx];
    if (ph && ph.kind === "hold" && !skipped) {
      timer.completedHolds += 1;
      timer.holdTotal += ph.sec;
    }

    timer.idx += 1;
    timer.lastBeep = -1;

    if (timer.idx >= timer.phases.length) {
      finishTimer();
      return;
    }

    var next = timer.phases[timer.idx];
    timer.remaining = next.sec;
    timer.phaseEnd = Date.now() + next.sec * 1000;
    timer.lastShown = -1;

    cancelAnimationFrame(timer.raf);

    timerScreen.classList.toggle("is-hold", next.kind === "hold");
    phaseBadgeEl.textContent = next.kind === "hold" ? "숨참기" : "휴식";
    timerHintEl.textContent = next.kind === "hold" ? "편하게, 힘 빼고 버티세요" : "천천히 숨을 고르세요";
    cue(next.kind === "hold" ? "hold" : "rest");
    updateTimerUI(true);

    timer.raf = requestAnimationFrame(frame);
  }

  function checkBeep(rem) {
    var sec = Math.ceil(rem);
    if (sec <= 3 && sec > 0 && sec !== timer.lastBeep) {
      timer.lastBeep = sec;
      cue("tick");
    }
  }

  function updateTimerProgress(rem) {
    var sec = Math.ceil(rem);
    if (sec !== timer.lastShown) {
      timer.lastShown = sec;
      timerTimeEl.textContent = fmt(sec);
    }
    var ph = timer.phases[timer.idx];
    var frac = ph ? clamp(rem / ph.sec, 0, 1) : 0;
    ringEl.style.strokeDashoffset = String(RING_C * (1 - frac));
  }

  function updateTimerUI(force) {
    var ph = timer.phases[timer.idx];
    if (!ph) return;
    if (force) {
      timerTimeEl.textContent = fmt(timer.remaining);
      timer.lastShown = Math.ceil(timer.remaining);
    }
    var next = timer.phases[timer.idx + 1];
    timerRoundEl.textContent = ph.round + " / " + timer.totalRounds;
    timerScreen.classList.toggle("is-hold", ph.kind === "hold");
    timerNextEl.textContent = next
      ? "다음 · " + (next.kind === "hold" ? "숨참기 " : "휴식 ") + fmt(next.sec)
      : "마지막 라운드";
    updateTimerProgress(timer.remaining);
  }

  function setToggleIcon(running) {
    setUse(timerToggleEl, running ? "i-pause" : "i-play");
    timerToggleEl.setAttribute("aria-label", running ? "일시정지" : "재생");
  }

  function pauseTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, (timer.phaseEnd - Date.now()) / 1000);
    timer.running = false;
    timer.paused = true;
    timer.lastTick = 0;
    cancelAnimationFrame(timer.raf);
    timerScreen.classList.add("is-paused");
    setToggleIcon(false);
    releaseWake();
  }

  function resumeTimer() {
    if (timer.running || timer.finished) return;
    timer.running = true;
    timer.paused = false;
    timer.lastTick = 0;
    timer.phaseEnd = Date.now() + timer.remaining * 1000;
    timerScreen.classList.remove("is-paused");
    var ph = timer.phases[timer.idx];
    if (ph) timerHintEl.textContent = ph.kind === "hold" ? "편하게, 힘 빼고 버티세요" : "천천히 숨을 고르세요";
    setToggleIcon(true);
    requestWake();
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(frame);
  }

  function finishTimer() {
    timer.running = false;
    timer.finished = true;
    cancelAnimationFrame(timer.raf);
    releaseWake();
    timer.remaining = 0;
    timerScreen.classList.remove("is-hold", "is-paused");
    phaseBadgeEl.textContent = "완료";
    timerTimeEl.textContent = "0:00";
    timerHintEl.textContent = "수고했어요. 기록에 저장했어요.";
    timerRoundEl.textContent = timer.totalRounds + " / " + timer.totalRounds;
    timerNextEl.textContent = "총 숨참기 " + fmt(timer.holdTotal);
    ringEl.style.strokeDashoffset = String(RING_C);
    setToggleIcon(false);
    timerToggleEl.setAttribute("aria-label", "다시 시작");
    cue("finish");
    saveHistoryRecord();
  }

  function resetTimer() {
    cancelAnimationFrame(timer.raf);
    releaseWake();
    timer.running = false;
    timer.paused = false;
    timer.finished = false;
    timer.idx = 0;
    timer.completedHolds = 0;
    timer.holdTotal = 0;
    timer.lastBeep = -1;
    timer.lastShown = -1;
    timer.lastTick = 0;
    var first = timer.phases[0];
    if (!first) return;
    timer.remaining = first.sec;
    timer.phaseEnd = Date.now() + first.sec * 1000;
    timerScreen.classList.remove("is-paused");
    timerScreen.classList.toggle("is-hold", first.kind === "hold");
    phaseBadgeEl.textContent = first.kind === "hold" ? "숨참기" : "휴식";
    timerHintEl.textContent = first.kind === "hold" ? "편하게, 힘 빼고 버티세요" : "천천히 숨을 고르세요";
    timerTimeEl.textContent = fmt(first.sec);
    timer.lastShown = Math.ceil(first.sec);
    ringEl.style.strokeDashoffset = "0";
    timerRoundEl.textContent = first.round + " / " + timer.totalRounds;
    timerNextEl.textContent = timer.phases[1] ? "다음 · " + (timer.phases[1].kind === "hold" ? "숨참기 " : "휴식 ") + fmt(timer.phases[1].sec) : "마지막 라운드";
    setToggleIcon(false);
  }

  function closeTimer() {
    cancelAnimationFrame(timer.raf);
    releaseWake();
    timer.running = false;
    timer.paused = false;
    timer.finished = false;
    timerScreen.hidden = true;
    document.body.classList.remove("is-locked");
  }

  function toggleMute() {
    timer.muted = !timer.muted;
    prefs.muted = timer.muted;
    savePrefs();
    setUse(timerMuteEl, timer.muted ? "i-mute" : "i-volume");
    timerMuteEl.setAttribute("aria-label", timer.muted ? "소리 켜기" : "소리 끄기");
    toast(timer.muted ? "소리를 껐어요" : "소리를 켰어요");
  }

  // ---------- 캘린더 ----------
  var calGridEl = $("#calGrid");
  var calMonthLabelEl = $("#calMonthLabel");
  var dayLabelEl = $("#dayLabel");
  var dayCountEl = $("#dayCount");
  var dayListEl = $("#dayList");
  var dayEmptyEl = $("#dayEmpty");
  var addScheduleBtn = $("#addScheduleBtn");

  function eventsOn(key) {
    return state.schedules.filter(function (s) { return s.class_date === key; });
  }

  function renderCalendar() {
    var y = state.viewMonth.getFullYear();
    var m = state.viewMonth.getMonth();
    calMonthLabelEl.textContent = y + "년 " + (m + 1) + "월";

    var first = new Date(y, m, 1);
    var offset = first.getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var cells = Math.ceil((offset + days) / 7) * 7;
    var counts = {};
    var levelsByDate = {};
    state.schedules.forEach(function (s) {
      if (!s.class_date) return;
      counts[s.class_date] = (counts[s.class_date] || 0) + 1;
      if (!levelsByDate[s.class_date]) levelsByDate[s.class_date] = [];
      levelsByDate[s.class_date].push(s.level || "기타");
    });

    var html = "";
    for (var i = 0; i < cells; i++) {
      var dayNum = i - offset + 1;
      if (dayNum < 1 || dayNum > days) {
        html += '<span class="cal-cell is-out" aria-hidden="true"></span>';
        continue;
      }
      var dt = new Date(y, m, dayNum);
      var key = dateKey(dt);
      var dow = dt.getDay();
      var cls = "cal-cell";
      if (dow === 0 || dow === 6) cls += " is-sun-sat";
      if (key === todayKey()) cls += " is-today";
      if (key === state.selected) cls += " is-selected";
      if (counts[key]) cls += " has-events";
      var label = (m + 1) + "월 " + dayNum + "일 " + WEEK[dow] + "요일" + (counts[key] ? ", 수업 " + counts[key] + "개" : "");
      var dots = "";
      if (levelsByDate[key]) {
        dots = '<span class="cal-dots">' + levelsByDate[key].slice(0, 3).map(function (lv) {
          return '<i style="background:' + (LEVEL_COLORS[lv] || LEVEL_COLORS["기타"]) + '"></i>';
        }).join("") + '</span>';
      }
      html += '<button type="button" class="' + cls + '" data-key="' + key + '" '
        + 'aria-pressed="' + (key === state.selected) + '" aria-label="' + label + '">' + dayNum + dots + '</button>';
    }
    calGridEl.innerHTML = html;
  }

  function renderDay() {
    var key = state.selected;
    if (!key) key = todayKey();
    var list = eventsOn(key);
    dayLabelEl.textContent = longDate(key);
    dayCountEl.textContent = list.length ? list.length + "개 수업" : "";
    dayEmptyEl.hidden = list.length > 0;

    dayListEl.innerHTML = list.map(function (s) {
      var color = LEVEL_COLORS[s.level] || LEVEL_COLORS["기타"];
      var time = s.start_time || "";
      if (s.end_time) time += " – " + s.end_time;
      var actions = state.isAdmin
        ? '<div class="event-actions">'
          + '<button type="button" data-act="edit" data-id="' + esc(s.id) + '" aria-label="수업 수정"><svg><use href="#i-edit"/></svg></button>'
          + '<button type="button" class="del" data-act="del" data-id="' + esc(s.id) + '" aria-label="수업 삭제"><svg><use href="#i-trash"/></svg></button>'
          + '</div>'
        : "";
      return '<article class="event-card" style="--lv:' + color + '">'
        + '<div class="event-top">'
        + '<h3 class="event-title">' + esc(s.title) + '</h3>'
        + actions
        + '</div>'
        + '<div class="event-meta">'
        + '<span class="mi"><svg><use href="#i-clock"/></svg>' + esc(time || "시간 미정") + '</span>'
        + (s.location ? '<span class="mi"><svg><use href="#i-pin"/></svg>' + esc(s.location) + '</span>' : '')
        + (s.level ? '<span class="chip">' + esc(s.level) + '</span>' : '')
        + (s.capacity !== null && !isNaN(s.capacity) ? '<span class="mi">정원 ' + s.capacity + '명</span>' : '')
        + '</div>'
        + (s.notes ? '<p class="event-notes">' + esc(s.notes) + '</p>' : '')
        + '</article>';
    }).join("");
  }

  function renderScheduleChrome() {
    addScheduleBtn.hidden = !state.isAdmin;
    renderDay();
  }

  function shiftMonth(delta) {
    var cur = state.viewMonth;
    var next = new Date(cur.getFullYear(), cur.getMonth() + delta, 1);
    state.viewMonth = next;
    var today = new Date();
    if (next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth()) {
      state.selected = todayKey();
    } else {
      state.selected = dateKey(next);
    }
    renderCalendar();
    renderDay();
  }

  // ---------- 수업 폼 ----------
  var LOCATIONS = ["K26", "잠실", "딥스테이션", "보홀", "기타"];
  var LEVELS = ["AIDA1", "AIDA2", "AIDA3", "AIDA4", "트레이닝", "자율연습", "투어", "기타"];

  function openScheduleForm(item) {
    if (!state.isAdmin) { toast("관리자만 수업을 관리할 수 있어요."); return; }
    var isEdit = !!item;
    var s = item || {
      title: "", class_date: state.selected, start_time: "19:00", end_time: "21:00",
      location: "K26", level: "AIDA2", capacity: 6, notes: ""
    };

    var locOptions = LOCATIONS.map(function (v) {
      return '<option value="' + v + '"' + (s.location === v ? " selected" : "") + '>' + v + '</option>';
    }).join("");
    var lvOptions = LEVELS.map(function (v) {
      return '<option value="' + v + '"' + (s.level === v ? " selected" : "") + '>' + v + "</option>";
    }).join("");

    openSheet(isEdit ? "수업 수정" : "수업 추가",
      '<div class="form-row"><label for="evTitle">수업 이름</label>'
      + '<input id="evTitle" type="text" maxlength="40" placeholder="예: AIDA2 코스 1일차" value="' + esc(s.title) + '"></div>'
      + '<div class="form-grid">'
      + '<div class="form-row"><label for="evDate">날짜</label><input id="evDate" type="date" value="' + esc(s.class_date) + '"></div>'
      + '<div class="form-row"><label for="evLevel">과정</label><select id="evLevel">' + lvOptions + '</select></div>'
      + '</div>'
      + '<div class="form-grid">'
      + '<div class="form-row"><label for="evStart">시작</label><input id="evStart" type="time" value="' + esc(s.start_time) + '"></div>'
      + '<div class="form-row"><label for="evEnd">종료</label><input id="evEnd" type="time" value="' + esc(s.end_time) + '"></div>'
      + '</div>'
      + '<div class="form-grid">'
      + '<div class="form-row"><label for="evLocation">장소</label><select id="evLocation">' + locOptions + '</select></div>'
      + '<div class="form-row"><label for="evCapacity">정원 (명)</label><input id="evCapacity" type="number" min="0" max="99" inputmode="numeric" value="' + (s.capacity === null || s.capacity === undefined ? "" : s.capacity) + '"></div>'
      + '</div>'
      + '<div class="form-row"><label for="evNotes">메모 (선택)</label><textarea id="evNotes" maxlength="300" placeholder="준비물, 집합 시간 등">' + esc(s.notes || "") + '</textarea></div>'
      + '<div class="form-actions">'
      + '<button type="button" class="btn-primary" id="evSave">' + (isEdit ? "저장" : "추가") + '</button>'
      + '</div>'
      + '<p class="sheet-note">추가한 일정은 앱을 여는 모든 수강생에게 바로 보입니다.</p>'
    );

    $("#evSave").addEventListener("click", async function () {
      var title = $("#evTitle").value.trim();
      var date = $("#evDate").value;
      var start = $("#evStart").value;
      var end = $("#evEnd").value;
      if (!title) { toast("수업 이름을 입력해 주세요."); return; }
      if (!date) { toast("날짜를 선택해 주세요."); return; }
      if (!start) { toast("시작 시간을 입력해 주세요."); return; }

      var capacityVal = $("#evCapacity").value.trim();
      var payload = {
        title: title,
        class_date: date,
        start_time: start,
        end_time: end || null,
        location: $("#evLocation").value,
        level: $("#evLevel").value,
        capacity: capacityVal === "" ? null : clamp(parseInt(capacityVal, 10) || 0, 0, 99),
        notes: $("#evNotes").value.trim()
      };

      var btn = $("#evSave");
      btn.disabled = true;
      try {
        await saveScheduleRecord(payload, isEdit ? item.id : null);
        closeSheet();
        state.selected = date;
        state.viewMonth = new Date(keyToDate(date).getFullYear(), keyToDate(date).getMonth(), 1);
        renderCalendar();
        renderDay();
        toast(isEdit ? "수업을 수정했어요." : "수업을 추가했어요.");
      } catch (err) {
        console.error(err);
        toast("저장하지 못했어요: " + (err.message || "알 수 없는 오류"));
        btn.disabled = false;
      }
    });
  }

  // ---------- 버디 ----------
  var postListEl = $("#postList");
  var postFormEl = $("#postForm");
  var postContentEl = $("#postContent");
  var postNicknameEl = $("#postNickname");
  var postDateEl = $("#postDate");
  var postPoolEl = $("#postPool");

  function avatarClass(nick) {
    var sum = 0;
    for (var i = 0; i < nick.length; i++) sum += nick.charCodeAt(i);
    return sum % 4 === 0 ? "" : " v" + ((sum % 4) + 1);
  }

  function renderPosts() {
    var posts = state.posts.slice().sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    $("#postCount").textContent = posts.length ? posts.length + "개" : "";
    $("#feedEmpty").hidden = posts.length > 0;

    postListEl.innerHTML = posts.map(function (p) {
      var comments = state.comments.filter(function (c) { return c.post_id === p.id; });
      var open = !!state.openComments[p.id];
      var nick = p.nickname || "익명";
      var tags = "";
      if (p.tag_date) {
        tags += '<span class="post-tag"><svg><use href="#i-calendar"/></svg>' + esc(shortDate(p.tag_date)) + '</span>';
      }
      if (p.tag_pool) {
        tags += '<span class="post-tag"><svg><use href="#i-pin"/></svg>' + esc(p.tag_pool) + '</span>';
      }

      var commentsHtml = "";
      if (open) {
        var listHtml = comments.length
          ? comments.map(function (c) {
            return '<div class="comment">'
              + '<span class="comment-name">' + esc(c.nickname || "익명") + '</span>'
              + '<span class="comment-text">' + esc(c.content) + '</span>'
              + (state.isAdmin
                ? '<button type="button" class="comment-del" data-act="del-comment" data-id="' + esc(c.id) + '" aria-label="댓글 삭제"><svg><use href="#i-close"/></svg></button>'
                : "")
              + '</div>';
          }).join("")
          : '<p class="comment-empty">첫 댓글을 남겨보세요.</p>';

        commentsHtml = '<div class="comments" data-comments="' + esc(p.id) + '">'
          + listHtml
          + '<form class="comment-form" data-post="' + esc(p.id) + '">'
          + '<input class="name" type="text" maxlength="12" placeholder="닉네임" value="' + esc(prefs.nickname || "") + '" aria-label="닉네임">'
          + '<input class="text" type="text" maxlength="80" placeholder="댓글 달기" aria-label="댓글" required>'
          + '<button type="submit" aria-label="댓글 등록"><svg><use href="#i-send"/></svg></button>'
          + '</form>'
          + '</div>';
      }

      return '<article class="post" data-post="' + esc(p.id) + '">'
        + '<div class="post-top">'
        + '<span class="avatar' + avatarClass(nick) + '">' + esc(nick.slice(0, 1)) + '</span>'
        + '<div class="post-who">'
        + '<p class="post-name">' + esc(nick) + '</p>'
        + '<p class="post-time">' + esc(timeAgo(p.created_at)) + '</p>'
        + '</div>'
        + (state.isAdmin
          ? '<button type="button" class="post-del" data-act="del-post" data-id="' + esc(p.id) + '" aria-label="글 삭제"><svg><use href="#i-trash"/></svg></button>'
          : "")
        + '</div>'
        + '<p class="post-body">' + esc(p.content) + '</p>'
        + (tags ? '<div class="post-tags">' + tags + '</div>' : '')
        + '<div class="post-foot">'
        + '<button type="button" class="comment-toggle' + (open ? " is-open" : "") + '" data-act="toggle" data-id="' + esc(p.id) + '">'
        + '<svg><use href="#i-comment"/></svg>댓글 ' + comments.length + '</button>'
        + '<span class="post-date">' + esc(shortDate(isoDateKey(p.created_at))) + '</span>'
        + '</div>'
        + commentsHtml
        + '</article>';
    }).join("");
  }

  // ---------- 관리자 ----------
  function setAdminLocal(on) {
    state.isAdmin = on;
    state.adminEmail = on ? ADMIN_EMAIL : "";
    lsSet("sfd.admin", on);
    renderScheduleChrome();
    renderPosts();
  }

  function adminSheetHtml() {
    if (state.isAdmin) {
      var who = useCloud() ? esc(state.adminEmail || ADMIN_EMAIL) : "로컬 체험 모드";
      return '<div class="admin-state"><span class="dot"></span><p><strong>관리자 모드</strong><br>'
        + who + '</p></div>'
        + '<div class="admin-menu">'
        + '<button type="button" id="adminAddClass"><svg><use href="#i-plus"/></svg>수업일정 추가</button>'
        + '<button type="button" id="adminGotoClasses"><svg><use href="#i-calendar"/></svg>수업일정 보기</button>'
        + '<button type="button" class="danger" id="adminLogout"><svg><use href="#i-lock"/></svg>관리자 로그아웃</button>'
        + '</div>'
        + '<p class="sheet-note">수업일정 수정은 관리자에게만 표시됩니다. 버디 글·댓글은 관리자도 삭제할 수 있어요.</p>';
    }

    if (useCloud()) {
      return '<p class="sheet-text">수업일정을 관리하려면 관리자 계정으로 로그인하세요.</p>'
        + '<div class="form-row"><label for="adminEmail">이메일</label><input id="adminEmail" type="email" autocomplete="username" value="' + esc(CFG.ADMIN_EMAIL || "") + '"></div>'
        + '<div class="form-row"><label for="adminPw">비밀번호</label><input id="adminPw" type="password" autocomplete="current-password"></div>'
        + '<button type="button" class="btn-primary" id="adminLoginBtn" style="width:100%">로그인</button>'
        + '<p class="sheet-note">관리자 계정(' + esc(ADMIN_EMAIL) + ')만 수업일정을 수정할 수 있어요.</p>';
    }

    return '<p class="sheet-text"><span class="preview-pill">로컬 체험 모드</span><br>'
      + 'Supabase를 연결하기 전에는 일정과 버디 글이 <strong>이 기기에만</strong> 저장됩니다. '
      + '관리자 화면을 미리 보려면 체험용 PIN을 입력하세요.</p>'
      + '<input class="pin-input" id="adminPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" aria-label="관리자 PIN">'
      + '<div class="form-actions"><button type="button" class="btn-primary" id="adminPinBtn" style="flex:1">관리자 모드 켜기</button></div>'
      + '<p class="sheet-note">체험용 PIN은 <strong>' + esc(LOCAL_PIN) + '</strong>입니다. 실제 배포 시에는 Supabase 이메일 로그인으로 바뀝니다.</p>';
  }

  function openAdminSheet() {
    openSheet(state.isAdmin ? "관리자" : "관리자 설정", adminSheetHtml());

    if (state.isAdmin) {
      $("#adminAddClass").addEventListener("click", function () {
        closeSheet();
        setTab("schedule");
        setTimeout(function () { openScheduleForm(null); }, 320);
      });
      $("#adminGotoClasses").addEventListener("click", function () {
        closeSheet();
        setTab("schedule");
      });
      $("#adminLogout").addEventListener("click", async function () {
        if (useCloud() && sb) {
          try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
        } else {
          setAdminLocal(false);
        }
        setAdminLocal(false);
        closeSheet();
        toast("관리자 모드에서 나왔어요.");
      });
      return;
    }

    if (useCloud()) {
      var loginBtn = $("#adminLoginBtn");
      if (loginBtn) {
        loginBtn.addEventListener("click", async function () {
          var email = $("#adminEmail").value.trim();
          var pw = $("#adminPw").value;
          if (!email || !pw) { toast("이메일과 비밀번호를 입력해 주세요."); return; }
          loginBtn.disabled = true;
          loginBtn.textContent = "로그인 중…";
          try {
            if (!sb) await ensureCloud();
            var res = await sb.auth.signInWithPassword({ email: email, password: pw });
            if (res.error) throw res.error;
            var user = res.data && res.data.user ? res.data.user : null;
            if (!user || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
              await sb.auth.signOut();
              throw new Error("관리자 계정이 아니에요.");
            }
            applySession(res.data.session);
            closeSheet();
            toast("관리자로 로그인했어요.");
          } catch (err) {
            console.error(err);
            toast(err.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 맞지 않아요." : (err.message || "로그인에 실패했어요."));
            loginBtn.disabled = false;
            loginBtn.textContent = "로그인";
          }
        });
      }
      return;
    }

    var pinBtn = $("#adminPinBtn");
    var pinInput = $("#adminPin");
    function tryPin() {
      if (String(pinInput.value).trim() === LOCAL_PIN) {
        setAdminLocal(true);
        closeSheet();
        toast("관리자 모드로 전환했어요. (로컬 체험)");
      } else {
        pinInput.value = "";
        toast("PIN이 맞지 않아요.");
      }
    }
    if (pinBtn) pinBtn.addEventListener("click", tryPin);
    if (pinInput) {
      pinInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); tryPin(); }
      });
      setTimeout(function () { pinInput.focus(); }, 420);
    }
  }

  // ---------- 탭 ----------
  function setTab(name) {
    if (["breath", "schedule", "buddy"].indexOf(name) < 0) name = "breath";
    state.tab = name;
    $$(".view").forEach(function (v) {
      v.classList.toggle("is-active", v.getAttribute("data-view") === name);
    });
    $$(".tabbar .tab").forEach(function (b) {
      var on = b.getAttribute("data-tab") === name;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- 이벤트 바인딩 ----------
  function bindUI() {
    $$(".tabbar .tab").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
    });

    // PB
    $("#pbEditBtn").addEventListener("click", function () {
      pbEditRowEl.hidden = false;
      pbInputEl.value = fmt(prefs.pb);
      setTimeout(function () { pbInputEl.focus(); pbInputEl.select(); }, 60);
    });
    $("#pbCancelBtn").addEventListener("click", function () {
      pbEditRowEl.hidden = true;
      pbInputEl.value = fmt(prefs.pb);
    });
    $("#pbSaveBtn").addEventListener("click", function () {
      var val = parseTimeInput(pbInputEl.value);
      if (val === null || val < 20 || val > 900) {
        toast("PB는 20초 ~ 15분 사이로 입력해 주세요. 예: 2:30");
        return;
      }
      prefs.pb = val;
      savePrefs();
      pbEditRowEl.hidden = true;
      renderBreath();
      toast("PB를 " + fmt(val) + "로 저장했어요.");
    });
    pbInputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); $("#pbSaveBtn").click(); }
    });

    // 세그먼트
    $$("#tableSeg .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.tableType = b.getAttribute("data-type");
        prefs.tableType = state.tableType;
        savePrefs();
        renderBreath();
      });
    });

    // 스텝퍼
    $$("[data-stepper]").forEach(function (group) {
      group.addEventListener("click", function (e) {
        var btn = e.target.closest(".step-btn");
        if (!btn) return;
        var key = group.getAttribute("data-stepper");
        var delta = parseInt(btn.getAttribute("data-step"), 10);
        var s = currentSettings();
        if (key === "rounds") s.rounds = clamp(s.rounds + delta, 3, 12);
        if (key === "holdPct") s.holdPct = clamp(s.holdPct + delta, 30, 90);
        if (key === "restStart") s.restStart = clamp(s.restStart + delta, 30, 300);
        if (key === "stepSec") s.stepSec = clamp(s.stepSec + delta, state.tableType === "co2" ? 0 : 5, 45);
        savePrefs();
        renderBreath();
      });
    });

    // 타이머
    $("#startBtn").addEventListener("click", function () {
      startTimer();
    });
    $("#timerClose").addEventListener("click", closeTimer);
    $("#timerToggle").addEventListener("click", function () {
      if (timer.finished) { startTimer(); return; }
      if (timer.running) pauseTimer();
      else resumeTimer();
    });
    $("#timerReset").addEventListener("click", resetTimer);
    $("#timerSkip").addEventListener("click", function () {
      if (timer.finished) return;
      if (!timer.running && !timer.paused) { toast("먼저 재생해 주세요."); return; }
      cancelAnimationFrame(timer.raf);
      timer.remaining = Math.max(0, timer.remaining);
      timer.phaseEnd = Date.now();
      advancePhase(Date.now(), true);
    });
    $("#timerMute").addEventListener("click", toggleMute);
    timer.muted = !!prefs.muted;
    setUse(timerMuteEl, timer.muted ? "i-mute" : "i-volume");

    // 기록
    $("#historyList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-hid]");
      if (!btn) return;
      var id = btn.getAttribute("data-hid");
      if (!window.confirm("이 기록을 삭제할까요?")) return;
      var list = lsGet("sfd.history", []);
      list = Array.isArray(list) ? list.filter(function (h) { return h.id !== id; }) : [];
      lsSet("sfd.history", list);
      renderHistory();
    });
    $("#clearHistoryBtn").addEventListener("click", function () {
      if (!state.history.length) { toast("삭제할 기록이 없어요."); return; }
      if (!window.confirm("훈련 기록을 모두 삭제할까요?")) return;
      lsSet("sfd.history", []);
      renderHistory();
      toast("기록을 모두 지웠어요.");
    });

    // 캘린더
    $("#prevMonth").addEventListener("click", function () { shiftMonth(-1); });
    $("#nextMonth").addEventListener("click", function () { shiftMonth(1); });
    $("#todayBtn").addEventListener("click", function () {
      var t = new Date();
      state.viewMonth = new Date(t.getFullYear(), t.getMonth(), 1);
      state.selected = todayKey();
      renderCalendar();
      renderDay();
    });
    calGridEl.addEventListener("click", function (e) {
      var cell = e.target.closest("[data-key]");
      if (!cell) return;
      state.selected = cell.getAttribute("data-key");
      renderCalendar();
      renderDay();
    });
    addScheduleBtn.addEventListener("click", function () { openScheduleForm(null); });
    dayListEl.addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = state.schedules.filter(function (s) { return s.id === id; })[0];
      if (!item) return;
      if (btn.getAttribute("data-act") === "edit") {
        openScheduleForm(item);
      } else {
        if (!window.confirm("'" + item.title + "' 수업을 삭제할까요?")) return;
        try {
          await deleteScheduleRecord(id);
          toast("수업을 삭제했어요.");
        } catch (err) {
          console.error(err);
          toast("삭제하지 못했어요: " + (err.message || "오류"));
        }
      }
    });

    // 버디 작성
    postNicknameEl.value = prefs.nickname || "";
    postContentEl.addEventListener("input", function () {
      postContentEl.style.height = "auto";
      postContentEl.style.height = Math.min(postContentEl.scrollHeight, 120) + "px";
    });
    postContentEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        postFormEl.requestSubmit ? postFormEl.requestSubmit() : postFormEl.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
    postFormEl.addEventListener("submit", async function (e) {
      e.preventDefault();
      var content = postContentEl.value.trim();
      if (!content) { toast("한 줄 내용을 입력해 주세요."); return; }
      var nick = postNicknameEl.value.trim() || "익명";
      prefs.nickname = nick;
      savePrefs();

      var payload = {
        nickname: nick,
        content: content,
        tag_date: postDateEl.value || null,
        tag_pool: postPoolEl.value || null
      };

      var btn = postFormEl.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await addPostRecord(payload);
        postContentEl.value = "";
        postContentEl.style.height = "auto";
        postDateEl.value = "";
        postPoolEl.value = "";
        renderPosts();
        toast("버디 글을 올렸어요.");
      } catch (err) {
        console.error(err);
        toast("글을 올리지 못했어요: " + (err.message || "오류"));
      } finally {
        btn.disabled = false;
      }
    });

    // 버디 피드
    postListEl.addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id");

      if (act === "toggle") {
        state.openComments[id] = !state.openComments[id];
        renderPosts();
        return;
      }

      if (act === "del-post") {
        if (!window.confirm("이 글을 삭제할까요?")) return;
        try { await deletePostRecord(id); toast("글을 삭제했어요."); }
        catch (err) { toast("삭제하지 못했어요: " + (err.message || "오류")); }
        return;
      }

      if (act === "del-comment") {
        if (!window.confirm("이 댓글을 삭제할까요?")) return;
        try { await deleteCommentRecord(id); toast("댓글을 삭제했어요."); }
        catch (err) { toast("삭제하지 못했어요: " + (err.message || "오류")); }
      }
    });

    postListEl.addEventListener("submit", async function (e) {
      var form = e.target.closest(".comment-form");
      if (!form) return;
      e.preventDefault();
      var postId = form.getAttribute("data-post");
      var nameInput = form.querySelector("input.name");
      var textInput = form.querySelector("input.text");
      var nickname = (nameInput.value || "").trim() || "익명";
      var text = (textInput.value || "").trim();
      if (!text) { toast("댓글을 입력해 주세요."); return; }

      prefs.nickname = nickname;
      savePrefs();
      var submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        await addCommentRecord({ post_id: postId, nickname: nickname, content: text });
        state.openComments[postId] = true;
        renderPosts();
      } catch (err) {
        console.error(err);
        toast("댓글을 남기지 못했어요: " + (err.message || "오류"));
        submitBtn.disabled = false;
      }
    });

    $("#refreshPostsBtn").addEventListener("click", async function () {
      try {
        await refreshPosts();
        toast("새로 불러왔어요.");
      } catch (err) {
        toast("불러오지 못했어요: " + (err.message || "오류"));
      }
    });

    // 관리자
    $("#adminOpenBtn").addEventListener("click", openAdminSheet);
    $("#sheetClose").addEventListener("click", closeSheet);
    backdropEl.addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!sheetEl.hidden) closeSheet();
      }
    });

    // 화면 복귀 시 화면 켜짐 유지 재요청
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && timer.running) requestWake();
    });
  }

  // ---------- 시작 ----------
  async function boot() {
    loadPrefs();
    prefs.muted = !!prefs.muted;
    state.pb = prefs.pb;
    state.tableType = prefs.tableType;
    state.history = lsGet("sfd.history", []);
    state.isAdmin = !cloudConfigured() ? lsGet("sfd.admin", false) === true : false;
    state.viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.selected = todayKey();

    bindUI();
    renderBreath();
    renderScheduleChrome();
    renderPosts();

    var params = new URLSearchParams(window.location.search);
    var tabParam = params.get("tab");
    if (tabParam) setTab(tabParam);

    if (!cloudConfigured()) {
      $("#modePill").hidden = false;
      seedIfNeeded();
      await refreshSchedules().catch(function (e) { console.warn(e); });
      await refreshPosts().catch(function (e) { console.warn(e); });
      renderScheduleChrome();
      return;
    }

    var ok = await ensureCloud();
    if (!ok || !useCloud()) {
      // 클라우드 연결 실패 → 로컬 체험 모드로 계속 사용
      $("#modePill").hidden = false;
      state.isAdmin = lsGet("sfd.admin", false) === true;
      seedIfNeeded();
      await refreshSchedules().catch(function () {});
      await refreshPosts().catch(function () {});
      renderScheduleChrome();
      toast("클라우드에 연결하지 못해 체험 모드로 열었어요.");
      return;
    }

    $("#modePill").hidden = true;
    try {
      await Promise.all([refreshSchedules(), refreshPosts()]);
    } catch (err) {
      console.error(err);
      toast("데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    renderScheduleChrome();
  }

  // 서비스 워커 등록 (https 또는 localhost에서만)
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function (err) {
        console.warn("[SFD] 서비스 워커 등록 실패:", err);
      });
    });
  }

  boot();
})();
