/* ============================================================
   location.js — 본건 입지도
   ------------------------------------------------------------
   보고서에 넣을 도면이라, 그릴 수 있는 것과 없는 것을 구분했다.

   그린 것 (전부 확인된 값)
     · 대상지 — 824-19/20/21 좌표에서 만든 개략 범위 (면적 2,201.4㎡ 에 맞춤)
     · 지하철역 — 카카오 로컬 카테고리 검색(SW8) 좌표
     · 도로 — 역 좌표를 지나는 선으로 테헤란로·강남대로 표기
     · 반경 — 강남역 중심 기하 원 (250m / 500m)
     · 주변 업무시설 — 평가자료 사례의 지오코딩 좌표

   그리지 않은 것
     · 지구단위계획구역 경계 — 경계 자료가 없어 선을 그으면 지어내는 셈이 된다.
       텍스트 주기로만 표시한다.
     · 도로 폭원 — 토지이용계획에서 확인 후 ROADS 의 width 에 넣으면 라벨에 붙는다.
   ============================================================ */
(function () {
'use strict';

/* ---------- 상수 ---------- */

var SITE = [
    { jibun: '824-19', lat: 37.4984296, lng: 127.0305579 },
    { jibun: '824-20', lat: 37.4986378, lng: 127.0308550 },
    { jibun: '824-21', lat: 37.4985226, lng: 127.0309202 }
];
var SITE_AREA = 2201.4;            // ㎡ (평가자료)
var SITE_CENTER = [37.49853, 127.03078];

var STATIONS = [
    { name: '강남역',   line: '2',   lat: 37.498086, lng: 127.028001, m: 229, color: '#00a84d', mark: '②' },
    { name: '강남역',   line: '신분당', lat: 37.496777, lng: 127.028185, m: 278, color: '#d31145', mark: '신' },
    { name: '역삼역',   line: '2',   lat: 37.500674, lng: 127.036469, m: 579, color: '#00a84d', mark: '②' },
    { name: '신논현역', line: '신분당', lat: 37.503616, lng: 127.024926, m: 761, color: '#d31145', mark: '신' },
    { name: '신논현역', line: '9',   lat: 37.504811, lng: 127.025492, m: 837, color: '#bdbdbd', mark: '⑨' }
];

/* 도로: 역 좌표를 지나도록 양쪽으로 늘린 직선.
   width 를 넣으면 라벨에 "(50m)" 처럼 붙는다 — 확인 전에는 비워 둔다. */
var ROADS = [
    { name: '테헤란로', width: '', color: '#ff9a3c',
      a: [37.498086, 127.028001], b: [37.500674, 127.036469], ext: 2.2,
      labelAt: 0.62 },
    { name: '강남대로', width: '', color: '#ff5a5a',
      a: [37.496777, 127.028185], b: [37.503616, 127.024926], ext: 1.5,
      labelAt: 0.18 }
];

var RADII = [
    { m: 250, label: '강남역 250m' },
    { m: 500, label: '강남역 500m' }
];
var RADIUS_FROM = [37.498086, 127.028001];   // 강남역 2호선

/* ---------- 지도 ---------- */

var map = L.map('map', {
    zoomControl: false, attributionControl: false,
    zoomSnap: 0, zoomDelta: 1, zoomAnimation: false
}).setView(SITE_CENTER, 16);

var kbase = null;
var gRoad = L.layerGroup().addTo(map);
var gRadius = L.layerGroup().addTo(map);
var gPoi = L.layerGroup().addTo(map);
var gSite = L.layerGroup().addTo(map);
var gLabel = L.layerGroup().addTo(map);

/* ---------- 유틸 ---------- */

function mPerDegLat() { return 110574; }
function mPerDegLng(lat) { return 111320 * Math.cos(lat * Math.PI / 180); }

function label(latlng, html, cls, dx, dy) {
    return L.marker(latlng, {
        icon: L.divIcon({
            className: 'plain',
            html: '<div class="lbl ' + cls + '">' + html + '</div>',
            iconSize: null, iconAnchor: [dx || 0, dy || 0]
        }),
        interactive: false
    });
}

/* ---------- 대상지 ----------
   필지 경계 자료가 없으므로, 3필지 좌표의 중심을 기준으로
   실제 대지면적(2,201.4㎡)과 같은 넓이의 사각형을 도로방향에 맞춰 그린다. */
function drawSite() {
    var lat0 = SITE_CENTER[0], lng0 = SITE_CENTER[1];
    // 세 점이 퍼진 방향(장변)을 구해 그 방향으로 긴 사각형을 만든다
    var pts = SITE.map(function (s) {
        return { x: (s.lng - lng0) * mPerDegLng(lat0), y: (s.lat - lat0) * mPerDegLat() };
    });
    var ang = Math.atan2(pts[2].y - pts[0].y, pts[2].x - pts[0].x);
    var ratio = 1.35;                                   // 장변/단변
    var w = Math.sqrt(SITE_AREA * ratio);               // 장변
    var h = SITE_AREA / w;                              // 단변
    var corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    var ring = corners.map(function (c) {
        var x = c[0] * Math.cos(ang) - c[1] * Math.sin(ang);
        var y = c[0] * Math.sin(ang) + c[1] * Math.cos(ang);
        return [lat0 + y / mPerDegLat(), lng0 + x / mPerDegLng(lat0)];
    });

    gSite.addLayer(L.polygon(ring, {
        color: '#ff2d2d', weight: 3, opacity: 1,
        fillColor: '#ff2d2d', fillOpacity: .42
    }));
    gLabel.addLayer(label([lat0 + 0.00042, lng0], '대상지', 'site', 22, 10));
}

/* ---------- 도로 ---------- */

function drawRoads() {
    ROADS.forEach(function (r) {
        var a = r.a, b = r.b, e = r.ext || 1;
        var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        var A = [mid[0] + (a[0] - mid[0]) * e, mid[1] + (a[1] - mid[1]) * e];
        var B = [mid[0] + (b[0] - mid[0]) * e, mid[1] + (b[1] - mid[1]) * e];

        gRoad.addLayer(L.polyline([A, B], { color: '#000', weight: 9, opacity: .35 }));
        gRoad.addLayer(L.polyline([A, B], { color: r.color, weight: 4.5, opacity: .95 }));

        var t = r.labelAt === undefined ? 0.5 : r.labelAt;
        var p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
        gLabel.addLayer(label(p, r.name + (r.width ? ' (' + r.width + ')' : ''), 'road', 40, 8));
    });
}

/* ---------- 지하철역 ---------- */

/** 화면 오른쪽에 붙은 라벨은 왼쪽으로 뒤집어 잘리지 않게 한다 */
function flipAt(latlng) {
    var p = map.latLngToContainerPoint(latlng);
    return p.x > map.getSize().x * 0.68;
}

function drawStations() {
    STATIONS.forEach(function (s) {
        gLabel.addLayer(L.circleMarker([s.lat, s.lng], {
            radius: 6, fillColor: s.color, fillOpacity: 1, color: '#fff', weight: 2
        }));
        var flip = flipAt([s.lat, s.lng]);
        var html = '<div class="st-badge' + (flip ? ' flip' : '') + '">'
                 + '<i style="background:' + s.color + '">' + s.mark + '</i>'
                 + '<span>' + s.name + ' · ' + s.m + 'm</span></div>';
        gLabel.addLayer(L.marker([s.lat, s.lng], {
            icon: L.divIcon({ className: 'plain', html: html, iconSize: null,
                              iconAnchor: [flip ? 10 : -10, 9] }),
            interactive: false
        }));
    });
}

/* ---------- 반경 ---------- */

function drawRadii() {
    RADII.forEach(function (r) {
        gRadius.addLayer(L.circle(RADIUS_FROM, {
            radius: r.m, color: '#fff', weight: 1.6, opacity: .85,
            dashArray: '7,6', fill: false
        }));
        // 원의 북동쪽 45° 지점에 라벨
        var d = r.m / Math.SQRT2;
        var p = [RADIUS_FROM[0] + d / mPerDegLat(), RADIUS_FROM[1] + d / mPerDegLng(RADIUS_FROM[0])];
        gRadius.addLayer(label(p, r.label, 'radius', 30, 7));
    });
}

/* ---------- 주변 업무시설 ----------
   평가자료의 비준·임대사례 중 본건 600m 이내만, 겹치지 않게 표기한다. */
function drawPoi() {
    var seen = {}, placed = [];
    var list = (typeof AFTER_ITEMS !== 'undefined' ? AFTER_ITEMS : [])
        .concat(typeof ITEMS !== 'undefined' ? ITEMS.filter(function (r) { return r.t === 'rent'; }) : []);

    list.forEach(function (r) {
        if (r.subject || !r.name || seen[r.name]) return;
        var c = (window.ADDR_COORDS || {})[r.addr];
        if (!c) return;
        var dy = (c[0] - SITE_CENTER[0]) * mPerDegLat();
        var dx = (c[1] - SITE_CENTER[1]) * mPerDegLng(SITE_CENTER[0]);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 600) return;

        var p = map.latLngToContainerPoint(c);
        var box = { x: p.x, y: p.y, w: r.name.length * 11 + 14, h: 16 };
        var hit = placed.some(function (o) {
            return box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y;
        });
        if (hit) return;
        placed.push(box);
        seen[r.name] = 1;

        gPoi.addLayer(L.circleMarker(c, {
            radius: 3.5, fillColor: '#ffd200', fillOpacity: 1, color: '#000', weight: 1
        }));
        var fl = flipAt(c);
        gPoi.addLayer(L.marker(c, {
            icon: L.divIcon({ className: 'plain',
                html: '<div class="lbl poi' + (fl ? ' flip' : '') + '">' + r.name + '</div>',
                iconSize: null, iconAnchor: [fl ? 7 : -7, 6] }),
            interactive: false
        }));
    });
}

/* ---------- 그리기 ---------- */

function redraw() {
    gRoad.clearLayers(); gRadius.clearLayers(); gPoi.clearLayers();
    gSite.clearLayers(); gLabel.clearLayers();
    drawRoads();
    if (showRadius) drawRadii();
    drawStations();
    if (showPoi) drawPoi();
    drawSite();
}

var showRadius = true, showPoi = true, mapType = 'HYBRID';

/* 대상지와 인접 3개 역이 모두 들어오도록 화면을 맞춘다.
   창 비율이 달라도 도면 구성이 깨지지 않게 매번 다시 계산한다. */
function fitFigure() {
    if (!kbase) return;
    map.invalidateSize(false);
    kbase.relayout();
    var s = map.getSize();
    if (!s.x || !s.y) return;

    var pts = [SITE_CENTER].concat(STATIONS.map(function (st) { return [st.lat, st.lng]; }));
    map.fitBounds(pts, { padding: [70, 90] });

    /* 카카오 레벨은 정수라 kakao_base 가 가까운 쪽으로 스냅한다.
       내림으로 붙으면 가장자리 역이 잘리므로, 전부 들어올 때까지 한 단계씩 넓힌다. */
    for (var i = 0; i < 3; i++) {
        var b = map.getBounds().pad(-0.06);     // 라벨이 걸칠 여유
        var allIn = pts.every(function (p) { return b.contains(p); });
        if (allIn) break;
        map.setZoom(kbase.zoomOf(kbase.levelOf(map.getZoom()) + 1), { animate: false });
    }
    redraw();
}

/* ---------- 초기화 ---------- */

document.getElementById('lg-note').innerHTML =
    '일반상업지역 · 테헤란로<br>지구단위계획구역';

KakaoBase.ready(function (err) {
    if (err) {
        document.getElementById('kakao-map').style.background = '#2a2f36';
        alert('카카오 지도를 불러오지 못했습니다: ' + err.message);
        return;
    }
    kbase = KakaoBase.init(map, { lat: SITE_CENTER[0], mapTypeId: mapType });
    fitFigure();
    setTimeout(fitFigure, 300);
    setTimeout(fitFigure, 1200);
});

map.on('moveend zoomend', redraw);

document.getElementById('b-type').onclick = function () {
    mapType = (mapType === 'HYBRID') ? 'ROADMAP' : 'HYBRID';
    if (kbase) kbase.setMapType(mapType);
    this.classList.toggle('on', mapType === 'HYBRID');
};
document.getElementById('b-radius').onclick = function () {
    showRadius = !showRadius; this.classList.toggle('on', showRadius); redraw();
};
document.getElementById('b-poi').onclick = function () {
    showPoi = !showPoi; this.classList.toggle('on', showPoi); redraw();
};
document.getElementById('b-cap').onclick = function () {
    document.body.classList.add('capture');
    setTimeout(function () { document.body.classList.remove('capture'); }, 8000);
};

window.addEventListener('resize', function () { setTimeout(fitFigure, 100); });

window.__loc = { map: map, redraw: redraw, fit: fitFigure,
                 kbase: function () { return kbase; },
                 setType: function (t) { mapType = t; if (kbase) kbase.setMapType(t); },
                 setCapture: function (on) { document.body.classList.toggle('capture', on); } };

})();
