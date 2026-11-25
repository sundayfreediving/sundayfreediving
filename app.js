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

  function getClientToken() {
    var tok = lsGet("sfd.clientToken", "");
    if (!tok || typeof tok !== "string") {
      tok = "tok-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      lsSet("sfd.clientToken", tok);
    }
    return tok;
  }

  // ---------- 설정 값 ----------
  var DEFAULT_PREFS = {
    pb: 150,
    tableType: "co2",
    muted: false,
    nickname: "",
    bio: "",
    avatar: "",
    co2: { rounds: 8, holdPct: 50, restStart: 120, stepSec: 15, customRows: null },
    o2: { rounds: 8, holdPct: 50, restStart: 120, stepSec: 15, customRows: null }
  };
  var prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));

  function sanitizeCustomRows(raw) {
    if (!Array.isArray(raw) || !raw.length) return null;
    var out = raw.slice(0, 20).map(function (r) {
      return {
        hold: clamp(parseInt(r && r.hold, 10) || 60, 5, 900),
        rest: clamp(parseInt(r && r.rest, 10) || 60, 5, 900)
      };
    });
    return out.length ? out : null;
  }

  function loadPrefs() {
    var saved = lsGet("sfd.prefs", null);
    if (saved && typeof saved === "object") {
      prefs.pb = typeof saved.pb === "number" ? saved.pb : prefs.pb;
      prefs.tableType = saved.tableType === "o2" ? "o2" : "co2";
      prefs.muted = !!saved.muted;
      prefs.nickname = typeof saved.nickname === "string" ? saved.nickname : "";
      if (prefs.nickname === "관리자") prefs.nickname = "";
      prefs.bio = typeof saved.bio === "string" ? saved.bio : "";
      prefs.avatar = typeof saved.avatar === "string" ? saved.avatar : "";
      ["co2", "o2"].forEach(function (k) {
        if (saved[k] && typeof saved[k] === "object") {
          var custom = sanitizeCustomRows(saved[k].customRows);
          prefs[k] = {
            rounds: custom ? custom.length : clamp(parseInt(saved[k].rounds, 10) || 8, 3, 12),
            holdPct: clamp(parseInt(saved[k].holdPct, 10) || 50, 30, 90),
            restStart: clamp(parseInt(saved[k].restStart, 10) || 120, 30, 300),
            stepSec: clamp(parseInt(saved[k].stepSec, 10) || 15, 0, 45),
            customRows: custom
          };
        }
      });
    }
  }

  function savePrefs() { lsSet("sfd.prefs", prefs); }

  // ---------- 상태 ----------
  var DISCIPLINES = [
    { code: "STA", name: "Static Apnea", unit: "time", bench: 300, hex: true, depth: false },
    { code: "DYN", name: "Dynamic with Fins", unit: "m", bench: 150, hex: true, depth: false },
    { code: "DNF", name: "Dynamic No Fins", unit: "m", bench: 100, hex: true, depth: false },
    { code: "CWT", name: "Constant Weight", unit: "m", bench: 60, hex: true, depth: true },
    { code: "CNF", name: "Constant No Fins", unit: "m", bench: 45, hex: true, depth: true },
    { code: "FIM", name: "Free Immersion", unit: "m", bench: 60, hex: true, depth: true }
  ];

  var HEX_DISCIPLINES = DISCIPLINES.filter(function (d) { return d.hex; });

  var state = {
    tab: "home",
    tableType: "co2",
    pb: 150,
    isAdmin: false,
    adminPin: "",
    adminEmail: "",
    history: [],
    logbook: [],
    logFilter: "ALL",
    pbInputOpen: true,
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
      author_token: row.author_token || "",
      avatar_url: row.avatar_url || "",
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
      var res = await sb.rpc("admin_upsert_schedule", {
        p_pin: state.adminPin,
        p_id: id || null,
        p_title: payload.title,
        p_class_date: payload.class_date,
        p_start_time: payload.start_time,
        p_end_time: payload.end_time || null,
        p_location: payload.location,
        p_level: payload.level,
        p_capacity: payload.capacity,
        p_notes: payload.notes || null
      });
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
      var res = await sb.rpc("admin_delete_schedule", {
        p_pin: state.adminPin,
        p_id: id
      });
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
    var data = Object.assign({ author_token: getClientToken() }, payload);
    if (useCloud()) {
      var res = await sb.from("buddy_posts").insert(data).select().single();
      if (res.error) throw res.error;
      await refreshPosts();
      return res.data;
    }
    var row = mapPost(Object.assign({ id: uid(), created_at: new Date().toISOString() }, data));
    state.posts.unshift(row);
    saveLocalPosts();
    renderPosts();
    return row;
  }

  async function updatePostRecord(id, payload) {
    var tok = getClientToken();
    var target = state.posts.filter(function (p) { return p.id === id; })[0];
    var isMine = !!(target && target.author_token && target.author_token === tok);
    if (!isMine && !state.isAdmin) {
      throw new Error("본인이 작성한 글만 수정할 수 있어요.");
    }
    if (useCloud()) {
      var res;
      if (isMine) {
        res = await sb.rpc("update_buddy_post", {
          p_id: id,
          p_token: tok,
          p_content: payload.content,
          p_tag_date: payload.tag_date || null,
          p_tag_pool: payload.tag_pool || null
        });
      } else {
        res = await sb.rpc("admin_update_buddy_post", {
          p_pin: state.adminPin,
          p_id: id,
          p_content: payload.content,
          p_tag_date: payload.tag_date || null,
          p_tag_pool: payload.tag_pool || null
        });
      }
      if (res.error) throw res.error;
      await refreshPosts();
      return;
    }
    target.content = payload.content;
    target.tag_date = payload.tag_date || "";
    target.tag_pool = payload.tag_pool || "";
    saveLocalPosts();
    renderPosts();
  }

  async function deletePostRecord(id) {
    if (!state.isAdmin) throw new Error("관리자만 삭제할 수 있어요.");
    if (useCloud()) {
      var res = await sb.rpc("admin_delete_buddy_post", {
        p_pin: state.adminPin,
        p_id: id
      });
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

  async function syncProfileAvatarToPosts(avatarUrl) {
    var tok = getClientToken();
    var val = avatarUrl || "";
    if (useCloud()) {
      if (tok) {
        await sb.rpc("sync_my_avatar", { p_token: tok, p_avatar_url: val });
      }
      if (state.isAdmin && state.adminPin) {
        await sb.rpc("admin_sync_brand_avatar", { p_pin: state.adminPin, p_avatar_url: val });
      }
      await refreshPosts();
      return;
    }
    var changed = false;
    state.posts.forEach(function (p) {
      if ((tok && p.author_token === tok) || (state.isAdmin && p.nickname === "선데이프리다이빙")) {
        p.avatar_url = val;
        changed = true;
      }
    });
    if (changed) {
      saveLocalPosts();
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
    if (!state.isAdmin) throw new Error("관리자만 삭제할 수 있어요.");
    if (useCloud()) {
      var res = await sb.rpc("admin_delete_buddy_comment", {
        p_pin: state.adminPin,
        p_id: id
      });
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
    lsSet("sfd.seeded", true);
    if (!Array.isArray(lsGet("sfd.schedules", null))) lsSet("sfd.schedules", []);
    if (!Array.isArray(lsGet("sfd.posts", null))) lsSet("sfd.posts", []);
    if (!Array.isArray(lsGet("sfd.comments", null))) lsSet("sfd.comments", []);
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
    if (s.customRows && s.customRows.length) {
      return s.customRows.map(function (r, i) {
        return { round: i + 1, hold: r.hold, rest: r.rest };
      });
    }
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
    var isCustom = !!(s.customRows && s.customRows.length);
    var roundCount = isCustom ? s.customRows.length : s.rounds;
    roundsOutEl.textContent = roundCount;
    holdPctOutEl.textContent = s.holdPct + "%";
    restOutEl.textContent = fmt(s.restStart);
    stepOutEl.textContent = s.stepSec + "초";
    stepLabelEl.innerHTML = state.tableType === "co2"
      ? '라운드마다 휴식 <em>감소</em>'
      : '라운드마다 숨참기 <em>증가</em>';

    var resetCustomBtn = $("#resetCustomTableBtn");
    if (resetCustomBtn) resetCustomBtn.hidden = !isCustom;

    var table = buildTable();
    var hold0 = table[0].hold;
    var holdLast = table[table.length - 1].hold;
    var rest0 = table[0].rest;
    var restLast = table[table.length - 1].rest;

    tableTitleEl.textContent = (state.tableType === "co2" ? "CO2" : "O2") + " · " + roundCount + " 라운드" + (isCustom ? " (직접 설정)" : "");
    tableSubEl.textContent = isCustom
      ? "라운드별 시간 직접 설정됨 · 누르면 언제든 수정"
      : (state.tableType === "co2"
        ? "숨참기 " + fmt(hold0) + " 고정 · 휴식 " + fmt(rest0) + " → " + fmt(restLast)
        : "휴식 " + fmt(rest0) + " 고정 · 숨참기 " + fmt(hold0) + " → " + fmt(holdLast));

    var total = 0;
    var rowsHtml = '<div class="table-row head"><span>#</span><span>숨참기</span><span>휴식</span></div>';
    table.forEach(function (r, i) {
      total += r.hold + r.rest;
      rowsHtml += '<div class="table-row' + (i % 2 ? " alt" : "") + (i === table.length - 1 ? " final" : "") + '">'
        + '<span class="rnd">' + r.round + '</span>'
        + '<button type="button" class="cell-btn hold" data-idx="' + i + '" data-field="hold" aria-label="' + r.round + '라운드 숨참기 시간 수정">' + fmt(r.hold) + '</button>'
        + '<button type="button" class="cell-btn rest" data-idx="' + i + '" data-field="rest" aria-label="' + r.round + '라운드 휴식 시간 수정">' + fmt(r.rest) + '</button>'
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
        + '<p class="history-sub">' + when + ' · PB ' + fmt(h.pb || 0) + ' · 총 Apnea Training ' + fmt(h.holds || 0) + '</p>'
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
  var ringKnobEl = $("#ringKnob");
  var ringWrapEl = $("#timerRingWrap");
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

  function unlockSpeech() {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  function speak(text, rate) {
    if (timer.muted || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate || 0.88;
      u.pitch = 0.96;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  var wakeLock = null;

  function requestWake() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) {
      timerNoteEl.textContent = "Wake lock not supported";
      return;
    }
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      timerNoteEl.textContent = "Screen stays awake";
      lock.addEventListener("release", function () { wakeLock = null; });
    }).catch(function () {
      timerNoteEl.textContent = "Wake lock unavailable";
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
    unlockSpeech();

    timer.phases = buildPhases(table);
    timer.mode = state.tableType;
    timer.totalRounds = table.length;
    timer.idx = 0;
    timer.completedHolds = 0;
    timer.holdTotal = 0;
    timer.finished = false;
    timer.paused = false;
    timer.lastBeep = -1;
    timer.lastSpoken = -1;
    timer.lastShown = -1;
    timer.remaining = timer.phases[0].sec;
    timer.phaseEnd = Date.now() + timer.remaining * 1000;
    timer.lastTick = 0;
    timer.running = true;

    timerModeEl.textContent = state.tableType === "co2" ? "CO2 TABLE" : "O2 TABLE";
    timerScreen.hidden = false;
    document.body.classList.add("is-locked");
    timerScreen.classList.remove("is-hold", "is-paused");
    phaseBadgeEl.textContent = timer.phases[0].kind === "hold" ? "HOLD" : "PREPARATION";
    timerHintEl.textContent = timer.phases[0].kind === "hold" ? "Relax · Stay calm" : "Breathe slowly · Official Top";
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
      timerHintEl.textContent = "Paused in background. Press play to resume.";
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
    timer.lastSpoken = -1;

    if (timer.idx >= timer.phases.length) {
      if (!skipped) {
        speak(ph && ph.kind === "hold" ? "Breath. Session complete." : "Session complete.");
      }
      finishTimer();
      return;
    }

    var next = timer.phases[timer.idx];
    timer.remaining = next.sec;
    timer.phaseEnd = Date.now() + next.sec * 1000;
    timer.lastShown = -1;

    cancelAnimationFrame(timer.raf);

    timerScreen.classList.toggle("is-hold", next.kind === "hold");
    phaseBadgeEl.textContent = next.kind === "hold" ? "HOLD" : "PREPARATION";
    timerHintEl.textContent = next.kind === "hold" ? "Relax · Stay calm" : "Breathe slowly · Official Top";
    cue(next.kind === "hold" ? "hold" : "rest");
    if (!skipped) {
      if (next.kind === "hold") speak("Official top", 0.88);
      else if (ph && ph.kind === "hold") speak("Breath", 0.88);
    }
    updateTimerUI(true);

    timer.raf = requestAnimationFrame(frame);
  }

  function checkBeep(rem) {
    var sec = Math.ceil(rem);
    if (sec <= 0 || sec === timer.lastSpoken) return;
    var ph = timer.phases[timer.idx];
    if (!ph) return;
    var line = "";
    if (ph.kind === "breathe") {
      if (sec === 120) line = "Two minutes to official top";
      else if (sec === 90) line = "One minute thirty";
      else if (sec === 60) line = "One minute";
      else if (sec === 30) line = "Thirty seconds";
      else if (sec === 20) line = "Twenty seconds";
      else if (sec === 10) line = "Ten seconds";
      else if (sec >= 1 && sec <= 5) line = String(sec);
    } else if (ph.kind === "hold") {
      if (sec === 30) line = "Thirty seconds";
      else if (sec === 20) line = "Twenty seconds";
      else if (sec === 10) line = "Ten seconds";
      else if (sec >= 1 && sec <= 5) line = String(sec);
    }
    if (line) {
      timer.lastSpoken = sec;
      speak(line, sec <= 5 ? 0.85 : 0.88);
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
    var elapsedFrac = 1 - frac;
    ringEl.style.strokeDashoffset = String(RING_C * frac);
    if (ringKnobEl) {
      var theta = 2 * Math.PI * elapsedFrac;
      ringKnobEl.setAttribute("cx", (160 + RING_R * Math.cos(theta)).toFixed(2));
      ringKnobEl.setAttribute("cy", (160 + RING_R * Math.sin(theta)).toFixed(2));
    }
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
      ? "Next · " + (next.kind === "hold" ? "Hold " : "Preparation ") + fmt(next.sec)
      : "Final Round";
    updateTimerProgress(timer.remaining);
  }

  function setToggleIcon(running) {
    setUse(timerToggleEl, running ? "i-pause" : "i-play");
    timerToggleEl.setAttribute("aria-label", running ? "Pause" : "Play");
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
    if (ph) timerHintEl.textContent = ph.kind === "hold" ? "Relax · Stay calm" : "Breathe slowly · Official Top";
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
    phaseBadgeEl.textContent = "COMPLETE";
    timerTimeEl.textContent = "0:00";
    timerHintEl.textContent = "Session complete · Saved";
    timerRoundEl.textContent = timer.totalRounds + " / " + timer.totalRounds;
    timerNextEl.textContent = "Total Hold " + fmt(timer.holdTotal);
    ringEl.style.strokeDashoffset = "0";
    setToggleIcon(false);
    timerToggleEl.setAttribute("aria-label", "Restart");
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
    timer.lastSpoken = -1;
    timer.lastShown = -1;
    timer.lastTick = 0;
    var first = timer.phases[0];
    if (!first) return;
    timer.remaining = first.sec;
    timer.phaseEnd = Date.now() + first.sec * 1000;
    timerScreen.classList.remove("is-paused");
    timerScreen.classList.toggle("is-hold", first.kind === "hold");
    phaseBadgeEl.textContent = first.kind === "hold" ? "HOLD" : "PREPARATION";
    timerHintEl.textContent = first.kind === "hold" ? "Relax · Stay calm" : "Breathe slowly · Official Top";
    timerTimeEl.textContent = fmt(first.sec);
    timer.lastShown = Math.ceil(first.sec);
    ringEl.style.strokeDashoffset = String(RING_C);
    if (ringKnobEl) {
      ringKnobEl.setAttribute("cx", String(160 + RING_R));
      ringKnobEl.setAttribute("cy", "160");
    }
    timerRoundEl.textContent = first.round + " / " + timer.totalRounds;
    timerNextEl.textContent = timer.phases[1] ? "Next · " + (timer.phases[1].kind === "hold" ? "Hold " : "Preparation ") + fmt(timer.phases[1].sec) : "Final Round";
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
      var isToday = key === todayKey();
      var cls = "cal-cell";
      if (dow === 0 || dow === 6) cls += " is-sun-sat";
      if (isToday) cls += " is-today";
      if (key === state.selected) cls += " is-selected";
      if (counts[key]) cls += " has-events";
      var label = (m + 1) + "월 " + dayNum + "일 " + WEEK[dow] + "요일" + (isToday ? " 오늘" : "") + (counts[key] ? ", 수업 " + counts[key] + "개" : "");
      var todayTag = isToday ? '<span class="cal-today-tag">오늘</span>' : "";
      var dots = "";
      if (levelsByDate[key]) {
        dots = '<span class="cal-dots">' + levelsByDate[key].slice(0, 3).map(function (lv) {
          return '<i style="background:' + (LEVEL_COLORS[lv] || LEVEL_COLORS["기타"]) + '"></i>';
        }).join("") + '</span>';
      }
      html += '<button type="button" class="' + cls + '" data-key="' + key + '" '
        + 'aria-pressed="' + (key === state.selected) + '" aria-label="' + label + '">' + dayNum + todayTag + dots + '</button>';
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
      return '<article class="event-card" data-id="' + esc(s.id) + '" style="--lv:' + color + (state.isAdmin ? ';cursor:pointer' : '') + '">'
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
    var adminTopBtn = $("#adminOpenBtn");
    if (adminTopBtn) adminTopBtn.classList.toggle("is-admin", !!state.isAdmin);
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
      + (isEdit ? '<button type="button" class="btn-ghost" id="evDelete" style="color:var(--danger,#c0392b)">삭제</button>' : '')
      + '<button type="button" class="btn-primary" id="evSave">' + (isEdit ? "저장" : "추가") + '</button>'
      + '</div>'
      + '<p class="sheet-note">추가한 일정은 앱을 여는 모든 수강생에게 바로 보입니다.</p>'
    );

    if (isEdit && $("#evDelete")) {
      $("#evDelete").addEventListener("click", async function () {
        if (!window.confirm("'" + item.title + "' 수업을 삭제할까요?")) return;
        var delBtn = $("#evDelete");
        delBtn.disabled = true;
        try {
          await deleteScheduleRecord(item.id);
          closeSheet();
          toast("수업을 삭제했어요.");
        } catch (err) {
          console.error(err);
          toast("삭제하지 못했어요: " + (err.message || "오류"));
          delBtn.disabled = false;
        }
      });
    }

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
  var postPoolCustomEl = $("#postPoolCustom");

  function avatarClass(nick) {
    var sum = 0;
    for (var i = 0; i < nick.length; i++) sum += nick.charCodeAt(i);
    return sum % 4 === 0 ? "" : " v" + ((sum % 4) + 1);
  }

  function renderPosts() {
    var myTok = getClientToken();
    var posts = state.posts.slice().sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    $("#postCount").textContent = posts.length ? posts.length + "개" : "";
    $("#feedEmpty").hidden = posts.length > 0;

    postListEl.innerHTML = posts.map(function (p) {
      var comments = state.comments.filter(function (c) { return c.post_id === p.id; });
      var open = !!state.openComments[p.id];
      var nick = p.nickname || "익명";
      var isMine = !!(p.author_token && p.author_token === myTok);
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

      var actionBtns = "";
      if (isMine || state.isAdmin) {
        actionBtns = '<div class="post-actions">'
          + '<button type="button" class="post-edit" data-act="edit-post" data-id="' + esc(p.id) + '" aria-label="글 수정">수정</button>'
          + (state.isAdmin
            ? '<button type="button" class="post-del" data-act="del-post" data-id="' + esc(p.id) + '" aria-label="글 삭제"><svg><use href="#i-trash"/></svg></button>'
            : "")
          + '</div>';
      }

      var avatarHtml = p.avatar_url
        ? '<button type="button" class="avatar avatar-photo" data-act="view-avatar" data-id="' + esc(p.id) + '" aria-label="프로필 사진 크게 보기"><img src="' + esc(p.avatar_url) + '" alt=""></button>'
        : '<span class="avatar' + avatarClass(nick) + '">' + esc(nick.slice(0, 1)) + '</span>';

      return '<article class="post" data-post="' + esc(p.id) + '">'
        + '<div class="post-top">'
        + avatarHtml
        + '<div class="post-who">'
        + '<p class="post-name">' + esc(nick) + '</p>'
        + '<p class="post-time">' + esc(timeAgo(p.created_at)) + '</p>'
        + '</div>'
        + actionBtns
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

  function openPostEditSheet(post) {
    var isMine = !!(post && post.author_token && post.author_token === getClientToken());
    if (!post || (!isMine && !state.isAdmin)) {
      toast("본인이 작성한 글만 수정할 수 있어요.");
      return;
    }
    var presetPools = ["", "K26", "잠실", "딥스테이션", "보홀"];
    var isCustomPool = !!(post.tag_pool && presetPools.indexOf(post.tag_pool) < 0);
    var poolSel = isCustomPool ? "기타" : (post.tag_pool || "");

    openSheet(isMine ? "내 글 수정" : "글 수정 (관리자)",
      '<div class="form-row"><label for="editPostContent">내용</label>'
      + '<textarea id="editPostContent" maxlength="120">' + esc(post.content) + '</textarea></div>'
      + '<div class="form-grid">'
      + '<div class="form-row"><label for="editPostDate">날짜 (선택)</label><input id="editPostDate" type="date" value="' + esc(post.tag_date || "") + '"></div>'
      + '<div class="form-row"><label for="editPostPool">장소 (선택)</label>'
      + '<select id="editPostPool">'
      + '<option value=""' + (poolSel === "" ? " selected" : "") + '>장소 없음</option>'
      + '<option value="K26"' + (poolSel === "K26" ? " selected" : "") + '>K26</option>'
      + '<option value="잠실"' + (poolSel === "잠실" ? " selected" : "") + '>잠실</option>'
      + '<option value="딥스테이션"' + (poolSel === "딥스테이션" ? " selected" : "") + '>딥스테이션</option>'
      + '<option value="보홀"' + (poolSel === "보홀" ? " selected" : "") + '>보홀</option>'
      + '<option value="기타"' + (poolSel === "기타" ? " selected" : "") + '>기타 (직접 입력)</option>'
      + '</select></div>'
      + '</div>'
      + '<div class="form-row" id="editPostPoolCustomRow"' + (isCustomPool ? "" : " hidden") + '>'
      + '<label for="editPostPoolCustom">장소 직접 입력</label>'
      + '<input id="editPostPoolCustom" type="text" maxlength="20" placeholder="예: 성남종합운동장" value="' + esc(isCustomPool ? post.tag_pool : "") + '">'
      + '</div>'
      + '<div class="form-actions"><button type="button" class="btn-primary" id="editPostSave" style="flex:1">저장</button></div>'
    );

    var selEl = $("#editPostPool");
    var customRow = $("#editPostPoolCustomRow");
    var customInput = $("#editPostPoolCustom");
    selEl.addEventListener("change", function () {
      var show = selEl.value === "기타";
      customRow.hidden = !show;
      if (show) customInput.focus();
    });

    $("#editPostSave").addEventListener("click", async function () {
      var content = $("#editPostContent").value.trim();
      if (!content) { toast("내용을 입력해 주세요."); return; }
      var poolVal = selEl.value;
      if (poolVal === "기타") {
        poolVal = customInput.value.trim();
        if (!poolVal) { toast("장소를 직접 입력해 주세요."); customInput.focus(); return; }
      }
      var btn = $("#editPostSave");
      btn.disabled = true;
      try {
        await updatePostRecord(post.id, {
          content: content,
          tag_date: $("#editPostDate").value || null,
          tag_pool: poolVal || null
        });
        closeSheet();
        toast("글을 수정했어요.");
      } catch (err) {
        console.error(err);
        toast("수정하지 못했어요: " + (err.message || "오류"));
        btn.disabled = false;
      }
    });
  }

  // ---------- 관리자 ----------
  function setAdminSession(on, pin) {
    state.isAdmin = !!on;
    state.adminPin = on ? String(pin || "") : "";
    state.adminEmail = on ? ADMIN_EMAIL : "";
    if (!useCloud()) {
      lsSet("sfd.admin", !!on);
    } else {
      try {
        if (on) sessionStorage.setItem("sfd.adminPin", state.adminPin);
        else sessionStorage.removeItem("sfd.adminPin");
      } catch (e) { /* ignore */ }
    }
    renderScheduleChrome();
    renderPosts();
    if (on && prefs.avatar) {
      syncProfileAvatarToPosts(prefs.avatar).catch(function () {});
    }
  }

  function adminSheetHtml() {
    if (state.isAdmin) {
      var who = useCloud() ? "클라우드 관리자 모드" : "로컬 체험 모드";
      return '<div class="admin-state"><span class="dot"></span><p><strong>관리자 모드</strong><br>'
        + who + '</p></div>'
        + '<div class="admin-menu">'
        + '<button type="button" id="adminAddClass"><svg><use href="#i-plus"/></svg>수업일정 추가</button>'
        + '<button type="button" id="adminGotoClasses"><svg><use href="#i-calendar"/></svg>수업일정 보기</button>'
        + '<button type="button" class="danger" id="adminLogout"><svg><use href="#i-lock"/></svg>관리자 잠금</button>'
        + '</div>'
        + '<p class="sheet-note">수업일정 추가·수정·삭제와 버디 글·댓글 삭제는 관리자만 할 수 있어요.</p>';
    }

    var modeNotice = useCloud()
      ? '수업일정 수정이나 버디 글 삭제를 하려면 <strong>관리자 번호</strong>를 입력하세요.'
      : '<span class="preview-pill">로컬 체험 모드</span><br>Supabase 연결 전에는 이 기기에만 저장됩니다. <strong>관리자 번호</strong>를 입력하면 관리 화면을 쓸 수 있어요.';

    return '<p class="sheet-text">' + modeNotice + '</p>'
      + '<input class="pin-input" id="adminPin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" aria-label="관리자 번호">'
      + '<div class="form-actions"><button type="button" class="btn-primary" id="adminPinBtn" style="flex:1">관리자 모드 켜기</button></div>';
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
      $("#adminLogout").addEventListener("click", function () {
        setAdminSession(false, "");
        closeSheet();
        toast("관리자 모드를 잠갔어요.");
      });
      return;
    }

    var pinBtn = $("#adminPinBtn");
    var pinInput = $("#adminPin");
    async function tryPin() {
      var pin = String(pinInput.value || "").trim();
      if (!pin) { toast("관리자 번호를 입력해 주세요."); return; }

      if (useCloud()) {
        pinBtn.disabled = true;
        pinBtn.textContent = "확인 중…";
        try {
          if (!sb) await ensureCloud();
          var res = await sb.rpc("verify_admin_pin", { p_pin: pin });
          if (res.error) throw res.error;
          if (res.data === true) {
            setAdminSession(true, pin);
            closeSheet();
            toast("관리자 모드로 전환했어요.");
          } else {
            pinInput.value = "";
            toast("관리자 번호가 맞지 않아요.");
            pinBtn.disabled = false;
            pinBtn.textContent = "관리자 모드 켜기";
          }
        } catch (err) {
          console.error(err);
          toast("확인하지 못했어요: " + (err.message || "오류"));
          pinBtn.disabled = false;
          pinBtn.textContent = "관리자 모드 켜기";
        }
        return;
      }

      if (pin === LOCAL_PIN) {
        setAdminSession(true, pin);
        closeSheet();
        toast("관리자 모드로 전환했어요.");
      } else {
        pinInput.value = "";
        toast("관리자 번호가 맞지 않아요.");
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
    if (["home", "breath", "schedule", "buddy"].indexOf(name) < 0) name = "home";
    state.tab = name;
    var adminTopBtn = $("#adminOpenBtn");
    if (adminTopBtn) adminTopBtn.hidden = (name !== "schedule");
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

  // ---------- 홈 · 로그북 & 6각형 그래프 ----------
  function findDisc(code) {
    for (var i = 0; i < DISCIPLINES.length; i++) {
      if (DISCIPLINES[i].code === code) return DISCIPLINES[i];
    }
    return DISCIPLINES[0];
  }

  function formatDiscVal(code, val) {
    var d = findDisc(code);
    if (val === null || val === undefined || isNaN(val)) return "-";
    if (d.unit === "time") return fmt(val);
    return (Math.round(val * 10) / 10) + "m";
  }

  function formatDiscDelta(code, delta) {
    var d = findDisc(code);
    if (delta === 0) return "유지";
    var sign = delta > 0 ? "+" : "-";
    var abs = Math.abs(delta);
    if (d.unit === "time") return sign + fmtLong(abs);
    return sign + (Math.round(abs * 10) / 10) + "m";
  }

  function getDiscEntries(code) {
    return state.logbook.filter(function (e) { return e.disc === code; })
      .sort(function (a, b) {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function getDiscStats(code) {
    var list = getDiscEntries(code);
    if (!list.length) return { pb: null, latest: null, prev: null, delta: null, count: 0 };
    var pb = list[0].value;
    for (var i = 1; i < list.length; i++) {
      if (list[i].value > pb) pb = list[i].value;
    }
    var latest = list[0].value;
    var prev = list.length > 1 ? list[1].value : null;
    var delta = prev !== null ? Math.round((latest - prev) * 10) / 10 : null;
    return { pb: pb, latest: latest, prev: prev, delta: delta, count: list.length };
  }

  function saveLogbook() {
    lsSet("sfd.logbook", state.logbook);
  }

  function renderRadarChart() {
    var svg = $("#radarSvg");
    if (!svg) return;
    var cx = 160;
    var cy = 143;
    var R = 92;
    var n = HEX_DISCIPLINES.length; // 6
    var html = "";

    // Concentric hexagon grid (25%, 50%, 75%, 100%)
    [0.25, 0.5, 0.75, 1].forEach(function (ratio) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var ang = (-Math.PI / 2) + (2 * Math.PI * i / n);
        pts.push((cx + R * ratio * Math.cos(ang)).toFixed(1) + "," + (cy + R * ratio * Math.sin(ang)).toFixed(1));
      }
      html += '<polygon points="' + pts.join(" ") + '" fill="none" stroke="var(--line-strong)" stroke-width="1" />';
    });

    // Axes lines
    for (var i = 0; i < n; i++) {
      var ang = (-Math.PI / 2) + (2 * Math.PI * i / n);
      var x2 = (cx + R * Math.cos(ang)).toFixed(1);
      var y2 = (cy + R * Math.sin(ang)).toFixed(1);
      html += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--line)" stroke-width="1" />';
    }

    // Data polygon & vertex points
    var dataPts = [];
    var dotsHtml = "";
    var labelsHtml = "";

    HEX_DISCIPLINES.forEach(function (d, idx) {
      var st = getDiscStats(d.code);
      var val = st.pb || 0;
      var maxScale = Math.max(d.bench, val || 0);
      var norm = val > 0 ? clamp(val / maxScale, 0.08, 1) : 0.04;
      var ang = (-Math.PI / 2) + (2 * Math.PI * idx / n);
      var px = cx + R * norm * Math.cos(ang);
      var py = cy + R * norm * Math.sin(ang);
      dataPts.push(px.toFixed(1) + "," + py.toFixed(1));

      if (val > 0) {
        dotsHtml += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4.2" fill="#f6b81d" stroke="var(--surface)" stroke-width="1.6" />';
      }

      var lx = cx + (R + 24) * Math.cos(ang);
      var ly = cy + (R + 22) * Math.sin(ang);
      var anchor = "middle";
      if (Math.cos(ang) > 0.25) anchor = "start";
      else if (Math.cos(ang) < -0.25) anchor = "end";
      var dyOffset = Math.sin(ang) < -0.5 ? -3 : (Math.sin(ang) > 0.5 ? 6 : 2);

      labelsHtml += '<text x="' + lx.toFixed(1) + '" y="' + (ly + dyOffset).toFixed(1) + '" text-anchor="' + anchor + '" fill="var(--ink)" font-size="11.5" font-weight="800">' + d.code + '</text>';
      labelsHtml += '<text x="' + lx.toFixed(1) + '" y="' + (ly + dyOffset + 13).toFixed(1) + '" text-anchor="' + anchor + '" fill="' + (val > 0 ? "#f6b81d" : "var(--ink-3)") + '" font-size="10.5" font-weight="700">' + (val > 0 ? formatDiscVal(d.code, val) : "-") + '</text>';
    });

    html += '<polygon points="' + dataPts.join(" ") + '" fill="rgba(246, 184, 29, 0.22)" stroke="#f6b81d" stroke-width="2.2" stroke-linejoin="round" />';
    html += dotsHtml + labelsHtml;
    svg.innerHTML = html;
  }

  function renderDisciplineRows() {
    var wrap = $("#disciplineRows");
    if (!wrap) return;
    wrap.innerHTML = DISCIPLINES.map(function (d) {
      var st = getDiscStats(d.code);
      var pbText = st.pb !== null ? "최고 " + formatDiscVal(d.code, st.pb) : "기록 없음";
      var deltaHtml = "";
      if (st.delta !== null && st.delta !== 0) {
        deltaHtml = '<span class="disc-delta ' + (st.delta > 0 ? "up" : "down") + '">'
          + (st.delta > 0 ? "▲ " : "▼ ") + formatDiscDelta(d.code, st.delta) + '</span>';
      }
      var inputHtml = d.unit === "time"
        ? '<input class="disc-num disc-num-sm" type="text" inputmode="numeric" maxlength="2" placeholder="분" data-disc-min="' + d.code + '" aria-label="' + d.code + ' 분">'
          + '<span class="disc-unit">:</span>'
          + '<input class="disc-num disc-num-sm" type="text" inputmode="numeric" maxlength="2" placeholder="초" data-disc-sec="' + d.code + '" aria-label="' + d.code + ' 초">'
        : '<input class="disc-num" type="text" inputmode="decimal" maxlength="6" placeholder="0" data-disc-num="' + d.code + '" aria-label="' + d.code + ' 기록">'
          + '<span class="disc-unit">m</span>';

      return '<div class="disc-row">'
        + '<div class="disc-left">'
        +   '<span class="disc-badge' + (d.hex ? " is-core" : "") + '">' + d.code + '</span>'
        +   '<div class="disc-info">'
        +     '<span class="disc-name">' + d.name + '</span>'
        +     '<span class="disc-pb">' + pbText + deltaHtml + '</span>'
        +   '</div>'
        + '</div>'
        + '<div class="disc-input-wrap">'
        +   inputHtml
        +   '<button type="button" class="disc-save-btn" data-disc-save="' + d.code + '">저장</button>'
        + '</div>'
        + '</div>';
    }).join("");
  }

  function renderLogbook() {
    var filterWrap = $("#logFilterRow");
    var listWrap = $("#logbookList");
    var emptyEl = $("#logbookEmpty");
    var countEl = $("#logCount");
    if (!filterWrap || !listWrap) return;

    var filters = [{ code: "ALL", label: "전체" }, { code: "LOG", label: "로그" }].concat(DISCIPLINES.map(function (d) {
      return { code: d.code, label: d.code };
    }));
    filterWrap.innerHTML = filters.map(function (f) {
      var on = state.logFilter === f.code;
      return '<button type="button" class="log-filter-pill' + (on ? " is-active" : "") + '" data-log-filter="' + f.code + '">' + f.label + '</button>';
    }).join("");

    // Compute per-entry delta vs previous record of the same discipline
    var byDisc = {};
    var sortedAsc = state.logbook.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    var deltaMap = {};
    sortedAsc.forEach(function (entry) {
      if (entry.disc === "LOG" || entry.value === null || entry.value === undefined) return;
      if (byDisc[entry.disc] !== undefined) {
        deltaMap[entry.id] = Math.round((entry.value - byDisc[entry.disc]) * 10) / 10;
      } else {
        deltaMap[entry.id] = null;
      }
      byDisc[entry.disc] = entry.value;
    });

    var shown = state.logbook.filter(function (e) {
      return state.logFilter === "ALL" || e.disc === state.logFilter;
    }).sort(function (a, b) {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (countEl) countEl.textContent = shown.length + "건";
    if (emptyEl) emptyEl.hidden = shown.length > 0;

    listWrap.innerHTML = shown.map(function (e) {
      if (e.disc === "LOG") {
        var logTitle = esc(e.memo || "프리다이빙 로그");
        var logSub = e.date + (e.place ? " · " + esc(e.place) : "");
        return '<div class="log-item">'
          + '<div class="log-item-left">'
          +   '<span class="disc-badge">로그</span>'
          +   '<div class="log-item-main">'
          +     '<div class="log-item-top"><span class="log-val" style="font-size:14px;font-weight:650">' + logTitle + '</span></div>'
          +     '<span class="log-item-sub">' + logSub + '</span>'
          +   '</div>'
          + '</div>'
          + '<button type="button" class="log-del-btn" data-log-del="' + esc(e.id) + '" aria-label="기록 삭제">×</button>'
          + '</div>';
      }
      var delta = deltaMap[e.id];
      var deltaBadge = '<span class="log-delta-pill same">첫 기록</span>';
      if (delta !== null) {
        if (delta > 0) deltaBadge = '<span class="log-delta-pill up">▲ ' + formatDiscDelta(e.disc, delta) + '</span>';
        else if (delta < 0) deltaBadge = '<span class="log-delta-pill down">▼ ' + formatDiscDelta(e.disc, delta) + '</span>';
        else deltaBadge = '<span class="log-delta-pill same">유지</span>';
      }
      var sub = e.date + (e.memo ? " · " + esc(e.memo) : "");
      return '<div class="log-item">'
        + '<div class="log-item-left">'
        +   '<span class="disc-badge is-core">' + e.disc + '</span>'
        +   '<div class="log-item-main">'
        +     '<div class="log-item-top"><span class="log-val">' + formatDiscVal(e.disc, e.value) + '</span>' + deltaBadge + '</div>'
        +     '<span class="log-item-sub">' + sub + '</span>'
        +   '</div>'
        + '</div>'
        + '<button type="button" class="log-del-btn" data-log-del="' + esc(e.id) + '" aria-label="기록 삭제">×</button>'
        + '</div>';
    }).join("");
  }

  function renderHome() {
    var totalEl = $("#kpiTotalLogs");
    var staEl = $("#kpiBestSta");
    var depthEl = $("#kpiBestDepth");
    if (totalEl) totalEl.textContent = state.logbook.length + "회";
    var staStats = getDiscStats("STA");
    if (staEl) staEl.textContent = staStats.pb !== null ? formatDiscVal("STA", staStats.pb) : "-";
    var bestDepth = 0;
    DISCIPLINES.forEach(function (d) {
      if (d.depth) {
        var st = getDiscStats(d.code);
        if (st.pb !== null && st.pb > bestDepth) bestDepth = st.pb;
      }
    });
    if (depthEl) depthEl.textContent = bestDepth > 0 ? bestDepth + "m" : "-";

    renderRadarChart();
    renderDisciplineRows();
    renderLogbook();
  }

  // ---------- 이벤트 바인딩 ----------
  function bindUI() {
    $$(".tabbar .tab").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
    });

    // 홈 · 로그북
    var homeSeg = $("#homeSeg");
    var homePaneLogbook = $("#homePaneLogbook");
    var homePaneRecords = $("#homePaneRecords");
    if (homeSeg && homePaneLogbook && homePaneRecords) {
      homeSeg.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-home-pane]");
        if (!btn) return;
        var pane = btn.getAttribute("data-home-pane");
        $$("[data-home-pane]", homeSeg).forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        homePaneLogbook.hidden = (pane !== "logbook");
        homePaneRecords.hidden = (pane !== "records");
      });
    }

    var freeLogSaveBtn = $("#freeLogSaveBtn");
    if (freeLogSaveBtn) {
      freeLogSaveBtn.addEventListener("click", function () {
        var fDate = $("#freeLogDate");
        var fPlace = $("#freeLogPlace");
        var fText = $("#freeLogText");
        var text = fText ? fText.value.trim() : "";
        var place = fPlace ? fPlace.value.trim() : "";
        if (!text && !place) {
          toast("장소나 로그 내용을 입력해 주세요.");
          return;
        }
        state.logbook.push({
          id: uid(),
          disc: "LOG",
          value: null,
          date: (fDate && fDate.value) ? fDate.value : todayKey(),
          place: place,
          memo: text || place,
          createdAt: Date.now()
        });
        saveLogbook();
        if (fPlace) fPlace.value = "";
        if (fText) fText.value = "";
        renderHome();
        toast("로그북에 저장했어요!");
      });
    }

    var discWrap = $("#disciplineRows");
    if (discWrap) {
      discWrap.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-disc-save]");
        if (!btn) return;
        var code = btn.getAttribute("data-disc-save");
        var d = findDisc(code);
        var val = null;
        if (d.unit === "time") {
          var minEl = discWrap.querySelector('[data-disc-min="' + code + '"]');
          var secEl = discWrap.querySelector('[data-disc-sec="' + code + '"]');
          var mins = parseInt((minEl && minEl.value || "0").trim(), 10) || 0;
          var secs = parseInt((secEl && secEl.value || "0").trim(), 10) || 0;
          if (mins < 0 || secs < 0 || secs > 59 || (mins === 0 && secs === 0)) {
            toast("분과 초를 올바르게 입력해 주세요.");
            return;
          }
          val = mins * 60 + secs;
          if (minEl) minEl.value = "";
          if (secEl) secEl.value = "";
        } else {
          var numEl = discWrap.querySelector('[data-disc-num="' + code + '"]');
          var raw = (numEl && numEl.value || "").trim().replace(/,/g, ".");
          var num = parseFloat(raw);
          if (isNaN(num) || num <= 0) {
            toast("0보다 큰 숫자를 입력해 주세요.");
            return;
          }
          val = Math.round(num * 10) / 10;
          if (numEl) numEl.value = "";
        }
        var dateEl = $("#logDateInput");
        var memoEl = $("#logMemoInput");
        var dateVal = (dateEl && dateEl.value) ? dateEl.value : todayKey();
        var memoVal = memoEl ? memoEl.value.trim() : "";
        state.logbook.push({
          id: uid(),
          disc: code,
          value: val,
          date: dateVal,
          memo: memoVal,
          createdAt: Date.now()
        });
        saveLogbook();
        if (memoEl) memoEl.value = "";
        renderHome();
        toast(code + " " + formatDiscVal(code, val) + " 기록했어요!");
      });
    }

    var filterWrap = $("#logFilterRow");
    if (filterWrap) {
      filterWrap.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-log-filter]");
        if (!btn) return;
        state.logFilter = btn.getAttribute("data-log-filter");
        renderLogbook();
      });
    }

    var logListWrap = $("#logbookList");
    if (logListWrap) {
      logListWrap.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-log-del]");
        if (!btn) return;
        var id = btn.getAttribute("data-log-del");
        state.logbook = state.logbook.filter(function (e) { return e.id !== id; });
        saveLogbook();
        renderHome();
        toast("기록을 삭제했어요.");
      });
    }

    // PB
    $("#pbEditBtn").addEventListener("click", function () {
      var isOpen = pbEditRowEl.classList.contains("is-open");
      if (isOpen) {
        pbEditRowEl.classList.remove("is-open");
        return;
      }
      pbEditRowEl.classList.add("is-open");
      pbInputEl.value = fmt(prefs.pb);
      setTimeout(function () { pbInputEl.focus(); pbInputEl.select(); }, 90);
    });
    $("#pbCancelBtn").addEventListener("click", function () {
      pbEditRowEl.classList.remove("is-open");
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
      pbEditRowEl.classList.remove("is-open");
      renderBreath();
      toast("PB를 " + fmt(val) + "로 저장했어요.");
    });

    // 설정 접기/펼치기
    var settingsToggleBtn = $("#settingsToggleBtn");
    var settingsCollapsible = $("#settingsCollapsible");
    if (settingsToggleBtn && settingsCollapsible) {
      settingsToggleBtn.addEventListener("click", function () {
        var open = !settingsCollapsible.classList.contains("is-open");
        settingsCollapsible.classList.toggle("is-open", open);
        settingsToggleBtn.textContent = open ? "접기" : "설정";
        settingsToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
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
        if (key === "rounds") {
          var nextRounds = clamp((s.customRows ? s.customRows.length : s.rounds) + delta, 3, 15);
          s.rounds = nextRounds;
          if (s.customRows && s.customRows.length) {
            if (nextRounds < s.customRows.length) {
              s.customRows = s.customRows.slice(0, nextRounds);
            } else {
              while (s.customRows.length < nextRounds) {
                var last = s.customRows[s.customRows.length - 1];
                s.customRows.push({ hold: last.hold, rest: last.rest });
              }
            }
          }
        } else {
          s.customRows = null;
          if (key === "holdPct") s.holdPct = clamp(s.holdPct + delta, 30, 90);
          if (key === "restStart") s.restStart = clamp(s.restStart + delta, 30, 300);
          if (key === "stepSec") s.stepSec = clamp(s.stepSec + delta, state.tableType === "co2" ? 0 : 5, 45);
        }
        savePrefs();
        renderBreath();
      });
    });

    // 테이블 숫자 직접 클릭해서 수정
    tablePreviewEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".cell-btn");
      if (!btn || tablePreviewEl.querySelector(".cell-input")) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      var field = btn.getAttribute("data-field");
      var table = buildTable();
      if (!table[idx]) return;
      var curSec = table[idx][field];

      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.className = "cell-input";
      input.value = fmt(curSec);
      input.setAttribute("aria-label", (idx + 1) + "라운드 " + (field === "hold" ? "Apnea Training" : "휴식") + " 시간");
      btn.replaceWith(input);
      input.focus();
      input.select();

      var done = false;
      function commit(save) {
        if (done) return;
        done = true;
        if (save) {
          var parsed = parseTimeInput(input.value);
          if (parsed === null || parsed < 5 || parsed > 900) {
            toast("5초 ~ 15분 사이로 입력해 주세요. 예: 1:30 또는 90");
          } else {
            var s = currentSettings();
            if (!s.customRows || !s.customRows.length) {
              s.customRows = table.map(function (r) { return { hold: r.hold, rest: r.rest }; });
            }
            s.customRows[idx][field] = clamp(parsed, 5, 900);
            s.rounds = s.customRows.length;
            savePrefs();
          }
        }
        renderBreath();
      }

      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
        else if (ev.key === "Escape") { ev.preventDefault(); commit(false); }
      });
      input.addEventListener("blur", function () { commit(true); });
    });

    var resetCustomBtn = $("#resetCustomTableBtn");
    if (resetCustomBtn) {
      resetCustomBtn.addEventListener("click", function () {
        var s = currentSettings();
        s.customRows = null;
        s.rounds = clamp(s.rounds, 3, 12);
        savePrefs();
        renderBreath();
        toast("자동 계산 테이블로 초기화했어요.");
      });
    }

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

    if (ringWrapEl) {
      var ringDragging = false;
      function scrubRingFromPointer(e) {
        if (timer.finished) return;
        var ph = timer.phases[timer.idx];
        if (!ph || !ph.sec) return;
        var rect = ringWrapEl.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        var dist = Math.hypot(dx, dy);
        if (!ringDragging && dist < rect.width * 0.18) return;
        var angle = Math.atan2(dx, -dy);
        if (angle < 0) angle += 2 * Math.PI;
        var elapsedFrac = clamp(angle / (2 * Math.PI), 0, 0.995);
        var newRem = Math.max(0.5, ph.sec * (1 - elapsedFrac));
        timer.remaining = newRem;
        timer.phaseEnd = Date.now() + newRem * 1000;
        timer.lastBeep = -1;
        timer.lastSpoken = -1;
        timer.lastShown = -1;
        updateTimerUI(true);
      }
      ringWrapEl.addEventListener("pointerdown", function (e) {
        if (timer.finished) return;
        var rect = ringWrapEl.getBoundingClientRect();
        var dist = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
        if (dist < rect.width * 0.18) return;
        ringDragging = true;
        if (ringWrapEl.setPointerCapture) ringWrapEl.setPointerCapture(e.pointerId);
        scrubRingFromPointer(e);
      });
      ringWrapEl.addEventListener("pointermove", function (e) {
        if (!ringDragging) return;
        scrubRingFromPointer(e);
      });
      function stopRingDrag() { ringDragging = false; }
      ringWrapEl.addEventListener("pointerup", stopRingDrag);
      ringWrapEl.addEventListener("pointercancel", stopRingDrag);
    }
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
      var key = cell.getAttribute("data-key");
      var wasSelected = state.selected === key;
      state.selected = key;
      renderCalendar();
      renderDay();
      if (state.isAdmin && wasSelected) {
        var list = eventsOn(key);
        if (list.length === 1) openScheduleForm(list[0]);
        else if (list.length === 0) openScheduleForm(null);
      }
    });
    addScheduleBtn.addEventListener("click", function () { openScheduleForm(null); });
    dayListEl.addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn) {
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
        return;
      }
      if (!state.isAdmin) return;
      var card = e.target.closest(".event-card[data-id]");
      if (!card) return;
      var cardId = card.getAttribute("data-id");
      var cardItem = state.schedules.filter(function (s) { return s.id === cardId; })[0];
      if (cardItem) openScheduleForm(cardItem);
    });

    // 프로필 만들기
    var profileCollapsibleEl = $("#profileCollapsible");
    var profileCardEl = $("#profileCard");
    var profileFabBtn = $("#profileFabBtn");
    var profileNickEl = $("#profileNickname");
    var profileBioEl = $("#profileBio");
    var profileAvatarPreviewEl = $("#profileAvatarPreview");
    var profilePhotoInputEl = $("#profilePhotoInput");
    var profilePhotoClearBtn = $("#profilePhotoClearBtn");
    var profileBodyEl = $("#profileBody");
    var profileToggleBtn = $("#profileToggleBtn");
    var profileExpanded = false;

    function renderProfileCard() {
      if (!profileNickEl) return;
      profileNickEl.value = prefs.nickname || "";
      profileBioEl.value = prefs.bio || "";
      if (prefs.avatar) {
        profileAvatarPreviewEl.innerHTML = '<img src="' + esc(prefs.avatar) + '" alt="내 프로필 사진">';
        profilePhotoClearBtn.hidden = false;
      } else {
        profileAvatarPreviewEl.textContent = "+";
        profilePhotoClearBtn.hidden = true;
      }
      if (profileCollapsibleEl) profileCollapsibleEl.classList.toggle("is-open", profileExpanded);
      if (profileCardEl) profileCardEl.hidden = false;
      if (profileBodyEl) profileBodyEl.hidden = false;
      if (profileToggleBtn) profileToggleBtn.textContent = "접기";
      if (profileFabBtn) {
        profileFabBtn.textContent = "프로필 만들기";
        profileFabBtn.classList.toggle("is-open", profileExpanded);
        profileFabBtn.setAttribute("aria-expanded", profileExpanded ? "true" : "false");
        profileFabBtn.title = profileExpanded ? "프로필 닫기" : "프로필 만들기";
      }
      if (!postNicknameEl.value.trim() && prefs.nickname) {
        postNicknameEl.value = prefs.nickname;
      }
    }
    renderProfileCard();

    if (profileFabBtn) {
      profileFabBtn.addEventListener("click", function () {
        profileExpanded = !profileExpanded;
        renderProfileCard();
      });
    }

    profileToggleBtn.addEventListener("click", function () {
      profileExpanded = false;
      renderProfileCard();
    });

    function openPhotoCropSheet(img) {
      var viewSize = 220;
      var baseScale = Math.max(viewSize / img.width, viewSize / img.height);
      var zoom = 1;
      var offsetX = 0;
      var offsetY = 0;

      openSheet("프로필 사진 조절",
        '<div class="crop-wrap">'
        + '<div class="crop-viewport" id="cropViewport"><img id="cropImg" alt="자르기 미리보기"></div>'
        + '<p class="crop-hint">사진을 드래그해 위치를 맞추고 슬라이더로 크기를 조절하세요.</p>'
        + '<div class="crop-zoom-row"><span>작게</span><input type="range" id="cropZoom" min="1" max="3" step="0.02" value="1"><span>크게</span></div>'
        + '</div>'
        + '<div class="form-actions">'
        + '<button type="button" class="btn-ghost" id="cropCancelBtn">취소</button>'
        + '<button type="button" class="btn-primary" id="cropApplyBtn" style="flex:1">이대로 저장</button>'
        + '</div>'
      );

      var vp = $("#cropViewport");
      var cropImg = $("#cropImg");
      var zoomEl = $("#cropZoom");
      cropImg.src = img.src;
      cropImg.style.width = img.width + "px";
      cropImg.style.height = img.height + "px";

      function clampOffsets() {
        var s = baseScale * zoom;
        var maxX = Math.max(0, (img.width * s - viewSize) / 2);
        var maxY = Math.max(0, (img.height * s - viewSize) / 2);
        offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
        offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
      }

      function renderCrop() {
        clampOffsets();
        var s = baseScale * zoom;
        cropImg.style.transform = "translate(-50%, -50%) translate(" + offsetX + "px, " + offsetY + "px) scale(" + s + ")";
      }
      renderCrop();

      zoomEl.addEventListener("input", function () {
        zoom = parseFloat(zoomEl.value) || 1;
        renderCrop();
      });

      var dragging = false;
      var startX = 0;
      var startY = 0;
      var origX = 0;
      var origY = 0;

      vp.addEventListener("pointerdown", function (e) {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = offsetX;
        origY = offsetY;
        if (vp.setPointerCapture) vp.setPointerCapture(e.pointerId);
      });
      vp.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        offsetX = origX + (e.clientX - startX);
        offsetY = origY + (e.clientY - startY);
        renderCrop();
      });
      function endDrag() { dragging = false; }
      vp.addEventListener("pointerup", endDrag);
      vp.addEventListener("pointercancel", endDrag);

      $("#cropCancelBtn").addEventListener("click", closeSheet);
      $("#cropApplyBtn").addEventListener("click", function () {
        var outSize = 240;
        var canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        var ctx = canvas.getContext("2d");
        var s = baseScale * zoom;
        var ratio = outSize / viewSize;
        ctx.fillStyle = "#14171d";
        ctx.fillRect(0, 0, outSize, outSize);
        ctx.save();
        ctx.translate(outSize / 2 + offsetX * ratio, outSize / 2 + offsetY * ratio);
        ctx.scale(s * ratio, s * ratio);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
        prefs.avatar = canvas.toDataURL("image/jpeg", 0.85);
        savePrefs();
        renderProfileCard();
        closeSheet();
        toast("프로필 사진을 등록했어요.");
        syncProfileAvatarToPosts(prefs.avatar).catch(function () {});
      });
    }

    profilePhotoInputEl.addEventListener("change", function () {
      var file = profilePhotoInputEl.files && profilePhotoInputEl.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          openPhotoCropSheet(img);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      profilePhotoInputEl.value = "";
    });

    profilePhotoClearBtn.addEventListener("click", function () {
      prefs.avatar = "";
      savePrefs();
      renderProfileCard();
      toast("프로필 사진을 지웠어요.");
      syncProfileAvatarToPosts("").catch(function () {});
    });

    $("#profileSaveBtn").addEventListener("click", function () {
      var nick = profileNickEl.value.trim();
      var bio = profileBioEl.value.trim();
      prefs.nickname = nick;
      prefs.bio = bio;
      savePrefs();
      postNicknameEl.value = nick;
      profileExpanded = false;
      renderProfileCard();
      toast("프로필을 저장했어요.");
      syncProfileAvatarToPosts(prefs.avatar || "").catch(function () {});
    });

    // 버디 작성
    postNicknameEl.value = prefs.nickname || "";
    postPoolEl.addEventListener("change", function () {
      var isCustom = postPoolEl.value === "기타";
      postPoolCustomEl.hidden = !isCustom;
      if (isCustom) {
        postPoolCustomEl.focus();
      } else {
        postPoolCustomEl.value = "";
      }
    });
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
      var poolVal = postPoolEl.value;
      if (poolVal === "기타") {
        poolVal = postPoolCustomEl.value.trim();
        if (!poolVal) {
          toast("장소를 직접 입력해 주세요.");
          postPoolCustomEl.focus();
          return;
        }
      }
      var nick = postNicknameEl.value.trim() || prefs.nickname || "익명";
      prefs.nickname = nick === "익명" ? prefs.nickname : nick;
      savePrefs();

      var payload = {
        nickname: nick,
        content: content,
        tag_date: postDateEl.value || null,
        tag_pool: poolVal || null,
        avatar_url: prefs.avatar || null
      };

      var btn = postFormEl.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await addPostRecord(payload);
        postContentEl.value = "";
        postContentEl.style.height = "auto";
        postDateEl.value = "";
        postPoolEl.value = "";
        postPoolCustomEl.value = "";
        postPoolCustomEl.hidden = true;
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

      if (act === "view-avatar") {
        var post = state.posts.filter(function (p) { return p.id === id; })[0];
        if (post && post.avatar_url) {
          $("#lightboxImg").src = post.avatar_url;
          $("#lightboxName").textContent = post.nickname || "익명";
          $("#photoLightbox").hidden = false;
        }
        return;
      }

      if (act === "edit-post") {
        var target = state.posts.filter(function (p) { return p.id === id; })[0];
        if (target) openPostEditSheet(target);
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

    $("#photoLightbox").addEventListener("click", function (e) {
      if (e.target.id === "photoLightbox" || e.target.closest("#lightboxClose")) {
        $("#photoLightbox").hidden = true;
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
    state.logbook = lsGet("sfd.logbook", []);
    state.isAdmin = !cloudConfigured() ? lsGet("sfd.admin", false) === true : false;
    state.viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.selected = todayKey();
    var logDateEl = $("#logDateInput");
    if (logDateEl) logDateEl.value = todayKey();
    var freeLogDateEl = $("#freeLogDate");
    if (freeLogDateEl) freeLogDateEl.value = todayKey();

    bindUI();
    renderHome();
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
      var savedPin = "";
      try { savedPin = sessionStorage.getItem("sfd.adminPin") || ""; } catch (e) { /* ignore */ }
      if (savedPin && sb) {
        var pinCheck = await sb.rpc("verify_admin_pin", { p_pin: savedPin });
        if (!pinCheck.error && pinCheck.data === true) {
          state.isAdmin = true;
          state.adminPin = savedPin;
          if (prefs.avatar) {
            await sb.rpc("admin_sync_brand_avatar", { p_pin: savedPin, p_avatar_url: prefs.avatar }).catch(function () {});
          }
        }
      }
      await Promise.all([refreshSchedules(), refreshPosts()]);
    } catch (err) {
      console.error(err);
      toast("데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    initLicenseVault();
    renderScheduleChrome();
  }

  var LICENSE_KEY = "sfd.licensePhoto";

  function loadLicensePhoto() {
    try {
      return localStorage.getItem(LICENSE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function renderLicenseVault() {
    var imgData = loadLicensePhoto();
    var statusEl = $("#licenseStatusText");
    var openBtn = $("#licenseOpenBtn");
    var replaceBtn = $("#licenseReplaceBtn");
    var deleteBtn = $("#licenseDeleteBtn");
    if (!openBtn) return;
    if (imgData) {
      if (statusEl) statusEl.textContent = "저장됨 · 누르면 바로 크게 열려요";
      openBtn.textContent = "자격증 보기";
      if (replaceBtn) replaceBtn.hidden = false;
      if (deleteBtn) deleteBtn.hidden = false;
    } else {
      if (statusEl) statusEl.textContent = "사진 올려 두면 입장할 때 바로 꺼내 봐요";
      openBtn.textContent = "자격증 등록";
      if (replaceBtn) replaceBtn.hidden = true;
      if (deleteBtn) deleteBtn.hidden = true;
    }
  }

  function saveResizedLicense(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var maxSide = 1600;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        var out = canvas.toDataURL("image/jpeg", 0.88);
        try {
          localStorage.setItem(LICENSE_KEY, out);
          renderLicenseVault();
          toast("자격증 사진이 저장됐어요");
        } catch (err) {
          toast("이미지 용량이 커서 저장에 실패했어요");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function initLicenseVault() {
    renderLicenseVault();
    var openBtn = $("#licenseOpenBtn");
    var replaceBtn = $("#licenseReplaceBtn");
    var deleteBtn = $("#licenseDeleteBtn");
    var fileInput = $("#licenseFileInput");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        var imgData = loadLicensePhoto();
        if (imgData) {
          $("#lightboxImg").src = imgData;
          $("#lightboxName").textContent = "자격증";
          $("#photoLightbox").hidden = false;
        } else if (fileInput) {
          fileInput.click();
        }
      });
    }
    if (replaceBtn && fileInput) {
      replaceBtn.addEventListener("click", function () {
        fileInput.click();
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        try { localStorage.removeItem(LICENSE_KEY); } catch (e) { /* ignore */ }
        renderLicenseVault();
        toast("자격증 사진을 지웠어요");
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) {
          saveResizedLicense(fileInput.files[0]);
          fileInput.value = "";
        }
      });
    }
  }

  // Android / Galaxy PWA 원탭 설치 버튼
  var deferredInstallPrompt = null;
  var installAppBtn = $("#installAppBtn");
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installAppBtn) installAppBtn.hidden = false;
  });
  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    if (installAppBtn) installAppBtn.hidden = true;
  });
  if (installAppBtn) {
    installAppBtn.addEventListener("click", function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function () {
        deferredInstallPrompt = null;
        installAppBtn.hidden = true;
      });
    });
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
