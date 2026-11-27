/* 선데이프리다이빙 PWA — Service Worker
   · HTML · JS · CSS 는 항상 네트워크 우선 (새 버전이 바로 반영되도록)
   · 오프라인일 때만 캐시로 대체
   · 아이콘·이미지는 캐시 우선
*/
const VERSION = "1.4.4";
const CACHE_NAME = "sunday-freediving-" + VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/brand-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

// 새 서비스워커는 기다리지 않고 바로 활성화합니다.
self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () { /* 일부 파일이 없어도 설치는 계속 */ });
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME && key.indexOf("sunday-freediving-") === 0) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 앱 셸(HTML · JS · CSS · 설정 파일)인지 판별
function isFreshAsset(url) {
  const path = url.pathname;
  if (path.endsWith("/")) return true;
  return /\.(html|js|css|webmanifest)$/i.test(path);
}

function putInCache(request, response) {
  if (!response || response.status !== 200) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(request, copy).catch(function () { /* ignore */ });
  });
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Supabase, CDN 등 외부 요청은 서비스워커가 가로채지 않습니다.
  if (url.origin !== self.location.origin) return;

  // 1) 페이지 이동 · HTML · JS · CSS → 네트워크 우선 (캐시를 거치지 않고 새로 받아옴)
  if (request.mode === "navigate" || isFreshAsset(url)) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).then(function (response) {
        putInCache(request, response);
        if (request.mode === "navigate") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put("./index.html", copy).catch(function () { /* ignore */ });
          }).catch(function () { /* ignore */ });
        }
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          return caches.match("./index.html").then(function (shell) {
            return shell || caches.match("./");
          });
        });
      })
    );
    return;
  }

  // 2) 아이콘 · 이미지 등 나머지 파일 → 캐시 우선 + 뒤에서 조용히 갱신
  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request).then(function (response) {
        putInCache(request, response);
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

// 페이지에서 새 버전으로 바로 전환을 요청할 때
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
