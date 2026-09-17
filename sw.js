/* ============================================================
   sw.js — 서비스워커 (오프라인 지원)
   ------------------------------------------------------------
   현장에서 통신이 끊겨도 표준지 데이터·산정·검수는 그대로 쓸 수 있어야 한다.

   · 앱 셸(HTML/CSS/JS/데이터/아이콘) : 설치 시 미리 받아 두고 캐시 우선
   · index.html                      : 네트워크 우선 (갱신이 바로 반영되도록)
   · 카카오 지도 타일·SDK             : 런타임 캐시, 건수 상한을 두고 오래된 것부터 버림
   · 그 외 외부 요청                  : 네트워크 우선, 실패 시 캐시

   캐시 이름의 VERSION 을 올리면 옛 캐시는 activate 에서 정리된다.
   ============================================================ */

var VERSION = 'v4';
var SHELL_CACHE = 'gongsi-shell-' + VERSION;
var TILE_CACHE  = 'gongsi-tiles-' + VERSION;
var TILE_LIMIT  = 900;          // 타일 캐시 최대 건수

var SHELL = [
    './',
    './index.html',
    './css/style.css',
    './js/appraise.js',
    './js/kakao_base.js',
    './js/geocode.js',
    './js/app.js',
    './data/parcels.js',
    './data/coords.js',
    './data/shapes.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];

/* ---------- 설치 ---------- */

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(SHELL_CACHE).then(function (c) {
            // 외부 CDN 하나가 실패해도 설치 전체가 깨지지 않도록 개별 처리
            return Promise.all(SHELL.map(function (url) {
                return c.add(new Request(url, { cache: 'reload' })).catch(function (err) {
                    console.warn('[sw] 사전 캐시 실패:', url, err);
                });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

/* ---------- 활성화: 옛 버전 캐시 정리 ---------- */

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== SHELL_CACHE && k !== TILE_CACHE && k.indexOf('gongsi-') === 0) {
                    return caches.delete(k);
                }
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

/* ---------- 타일 캐시 상한 ---------- */

function trimCache(name, limit) {
    caches.open(name).then(function (c) {
        c.keys().then(function (keys) {
            if (keys.length <= limit) return;
            // 오래된 것부터 (keys 는 삽입 순서)
            for (var i = 0; i < keys.length - limit; i++) c.delete(keys[i]);
        });
    });
}

/* ---------- 요청 처리 ---------- */

function isTile(url) {
    return /(\.daumcdn\.net|dapi\.kakao\.com|map[0-9]*\.daum(cdn)?\.net)/.test(url);
}

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;

    var url = req.url;
    if (url.indexOf('chrome-extension') === 0) return;
    // 개발 서버의 저장 엔드포인트는 건드리지 않는다
    if (url.indexOf('__save-coords') > -1) return;

    /* 1) 지도 타일·SDK — 캐시 우선, 없으면 받아서 저장 */
    if (isTile(url)) {
        e.respondWith(
            caches.open(TILE_CACHE).then(function (c) {
                return c.match(req).then(function (hit) {
                    if (hit) return hit;
                    return fetch(req).then(function (res) {
                        // opaque 응답(cross-origin)도 그대로 저장해 둔다
                        if (res && (res.ok || res.type === 'opaque')) {
                            c.put(req, res.clone());
                            trimCache(TILE_CACHE, TILE_LIMIT);
                        }
                        return res;
                    }).catch(function () { return hit || Response.error(); });
                });
            })
        );
        return;
    }

    /* 2) 문서와 앱 코드 — 네트워크 우선, 실패하면 캐시.
          js/ · css/ 를 캐시 우선으로 두면 배포 후에도 한 번은 옛 코드가 실행된다.
          둘 다 수십 KB라 온라인에서는 지연이 거의 없고, 오프라인이면 캐시로 떨어진다.
          반면 data/ 는 크고 거의 바뀌지 않으므로 아래 3) 의 캐시 우선을 그대로 쓴다. */
    var sameOrigin = url.indexOf(self.registration.scope) === 0;
    var isAppCode = sameOrigin && /\/(js|css)\/[^/]+\.(js|css)($|\?)/.test(url);

    if (req.mode === 'navigate' || /\.html($|\?)/.test(url) || isAppCode) {
        e.respondWith(
            fetch(req).then(function (res) {
                var copy = res.clone();
                caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
                return res;
            }).catch(function () {
                return caches.match(req).then(function (hit) {
                    if (hit) return hit;
                    // 문서 요청이면 앱 셸로 떨어뜨린다 (앱 코드면 그냥 실패)
                    if (req.mode === 'navigate') {
                        return caches.match('./index.html').then(function (h2) {
                            return h2 || caches.match('./');
                        });
                    }
                    return Response.error();
                });
            })
        );
        return;
    }

    /* 3) 나머지 — 캐시 우선, 뒤에서 갱신 */
    e.respondWith(
        caches.match(req).then(function (hit) {
            var net = fetch(req).then(function (res) {
                if (res && res.ok) {
                    var copy = res.clone();
                    caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
                }
                return res;
            }).catch(function () { return hit; });
            return hit || net;
        })
    );
});

/* ---------- 페이지에서 보내는 메시지 ---------- */

self.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (e.data.type === 'CLEAR_TILES') caches.delete(TILE_CACHE);
});
