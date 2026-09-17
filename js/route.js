/* ============================================================
   route.js — 현장조사 일차 배정 · 동선 계획
   ------------------------------------------------------------
   1,043필지를 10일로 나눈다. 단순히 개수만 맞춰 자르면 하루 안에
   군 전역을 돌아다니게 되므로, 아래 순서로 동선을 줄인다.

     ① 균형 k-means  — 지리적으로 뭉치되 하루 물량이 비슷하도록 군집
     ② 일차 순서     — 군집 중심 10개를 TSP 로 풀어, N일차와 N+1일차가
                        서로 인접하게 번호를 매긴다 (숙소·출퇴근 이동 절감)
     ③ 하루 경로     — 각 일차 안에서 최근접 이웃 + 2-opt 로 방문 순서 결정

   거리는 달성군 중심 기준 등거리 투영(미터)의 직선거리다.
   실제 도로거리는 아니지만 순서를 정하는 데는 충분하고, 외부 API 없이 돈다.

   결과: 각 레코드에 day(1~10), seq(그날 몇 번째), 그리고
         Route.days() 로 일차별 요약(필지수·직선 이동거리·중심좌표)을 준다.
   ============================================================ */
(function (global) {
'use strict';

var R_EARTH = 6378137;

/* ---------- 투영 ---------- */

function projectAll(recs) {
    var n = recs.length, i, sumLat = 0, sumLng = 0;
    for (i = 0; i < n; i++) { sumLat += recs[i].lat; sumLng += recs[i].lng; }
    var lat0 = sumLat / n, lng0 = sumLng / n;
    var cos0 = Math.cos(lat0 * Math.PI / 180);
    var pts = new Array(n);
    for (i = 0; i < n; i++) {
        pts[i] = {
            x: (recs[i].lng - lng0) * Math.PI / 180 * R_EARTH * cos0,
            y: (recs[i].lat - lat0) * Math.PI / 180 * R_EARTH,
            i: i
        };
    }
    return pts;
}

function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
function dist(a, b) { return Math.sqrt(d2(a, b)); }

/* ---------- ① 균형 k-means ---------- */

/** k-means++ 초기 중심 — 결정적으로 돌도록 난수 대신 최대거리 선택 */
function initCentroids(pts, k) {
    var c = [{ x: pts[0].x, y: pts[0].y }];
    // 첫 중심은 전체 무게중심에서 가장 먼 점
    var cx = 0, cy = 0, i, j;
    for (i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= pts.length; cy /= pts.length;
    var far = pts[0], fd = -1;
    for (i = 0; i < pts.length; i++) {
        var dd = d2(pts[i], { x: cx, y: cy });
        if (dd > fd) { fd = dd; far = pts[i]; }
    }
    c[0] = { x: far.x, y: far.y };

    // 이후 중심은 기존 중심들로부터 가장 먼 점 (k-means++ 의 결정적 변형)
    while (c.length < k) {
        var best = null, bestD = -1;
        for (i = 0; i < pts.length; i++) {
            var m = Infinity;
            for (j = 0; j < c.length; j++) m = Math.min(m, d2(pts[i], c[j]));
            if (m > bestD) { bestD = m; best = pts[i]; }
        }
        c.push({ x: best.x, y: best.y });
    }
    return c;
}

/** 각 군집의 정원. n=1043, k=10 이면 105×3 + 104×7 */
function capacities(n, k) {
    var base = Math.floor(n / k), rem = n - base * k, caps = [];
    for (var j = 0; j < k; j++) caps.push(base + (j < rem ? 1 : 0));
    return caps;
}

/**
 * 정원 제약 k-means.
 *
 * 보통의 k-means 는 "가장 가까운 중심"에 무조건 붙이므로 군집 크기가 크게 갈린다
 * (실측: 하루 151필지 vs 81필지). 하루 물량이 고르게 나와야 계획으로 쓸 수 있으니
 * 배정 단계에서 정원을 지킨다.
 *
 * 배정: (점, 군집) 쌍을 거리 오름차순으로 훑으며, 점이 아직 미배정이고
 *       군집에 자리가 남았으면 붙인다. 가까운 쌍부터 자리를 가져간다.
 */
function kmeansBalanced(pts, k, iters) {
    var n = pts.length;
    var c = initCentroids(pts, k);
    var caps = capacities(n, k);
    var assign = new Array(n).fill(-1);
    var pairs = new Array(n * k);

    for (var it = 0; it < iters; it++) {
        var p = 0;
        for (var i = 0; i < n; i++) {
            for (var j = 0; j < k; j++) {
                pairs[p++] = { i: i, j: j, d: d2(pts[i], c[j]) };
            }
        }
        pairs.sort(function (a, b) { return a.d - b.d; });

        var next = new Array(n).fill(-1);
        var used = new Array(k).fill(0);
        var placed = 0;
        for (p = 0; p < pairs.length && placed < n; p++) {
            var pr = pairs[p];
            if (next[pr.i] !== -1 || used[pr.j] >= caps[pr.j]) continue;
            next[pr.i] = pr.j; used[pr.j]++; placed++;
        }

        var changed = false;
        for (i = 0; i < n; i++) { if (assign[i] !== next[i]) changed = true; assign[i] = next[i]; }

        // 중심 갱신
        var sx = new Array(k).fill(0), sy = new Array(k).fill(0), cnt = new Array(k).fill(0);
        for (i = 0; i < n; i++) { sx[assign[i]] += pts[i].x; sy[assign[i]] += pts[i].y; cnt[assign[i]]++; }
        for (j = 0; j < k; j++) if (cnt[j]) { c[j].x = sx[j] / cnt[j]; c[j].y = sy[j] / cnt[j]; }

        if (!changed) break;
    }
    refineBySwap(pts, k, assign, c);
    return { assign: assign, centroids: c };
}

/**
 * 교환 개선.
 *
 * 정원을 지키며 가까운 쌍부터 배정하면, 주변 군집이 먼저 차 버린 점은 엉뚱하게
 * 먼 군집으로 밀려난다(실측: 3일차 반경 10km — 군 전체를 하루에 도는 꼴).
 * 서로 다른 군집의 두 점을 맞바꾸면 정원은 그대로면서 거리 합이 줄어들 수 있다.
 *
 * 전수 비교는 n² 이라 비싸므로, 자기 중심에서 먼 점(상위 25%)만 후보로 삼는다.
 * 실제로 문제가 되는 것도 그 점들이다.
 */
function refineBySwap(pts, k, assign, c) {
    var n = pts.length;
    for (var pass = 0; pass < 12; pass++) {
        // 자기 중심에서 먼 순으로 후보 추리기
        var far = [];
        for (var i = 0; i < n; i++) far.push({ i: i, d: dist(pts[i], c[assign[i]]) });
        far.sort(function (a, b) { return b.d - a.d; });
        far = far.slice(0, Math.max(20, Math.floor(n * 0.25)));

        var swaps = 0;
        for (var a = 0; a < far.length; a++) {
            var ia = far[a].i, ca = assign[ia];
            var bestJ = -1, bestGain = -1e-6;
            for (var ib = 0; ib < n; ib++) {
                var cb = assign[ib];
                if (cb === ca) continue;
                var before = dist(pts[ia], c[ca]) + dist(pts[ib], c[cb]);
                var after  = dist(pts[ia], c[cb]) + dist(pts[ib], c[ca]);
                var gain = before - after;
                if (gain > bestGain) { bestGain = gain; bestJ = ib; }
            }
            if (bestJ >= 0) {
                var t = assign[ia]; assign[ia] = assign[bestJ]; assign[bestJ] = t;
                swaps++;
            }
        }
        if (!swaps) break;

        // 중심 갱신 (정원은 교환이라 그대로)
        var sx = new Array(k).fill(0), sy = new Array(k).fill(0), cnt = new Array(k).fill(0);
        for (i = 0; i < n; i++) { sx[assign[i]] += pts[i].x; sy[assign[i]] += pts[i].y; cnt[assign[i]]++; }
        for (var j = 0; j < k; j++) if (cnt[j]) { c[j].x = sx[j] / cnt[j]; c[j].y = sy[j] / cnt[j]; }
    }
}

/* ---------- 경로 (최근접 이웃 + 2-opt) ---------- */

function nearestNeighbour(nodes, startIdx) {
    var n = nodes.length;
    if (n <= 1) return nodes.map(function (_, i) { return i; });
    var used = new Array(n).fill(false);
    var order = [startIdx];
    used[startIdx] = true;
    for (var s = 1; s < n; s++) {
        var last = nodes[order[order.length - 1]];
        var bi = -1, bd = Infinity;
        for (var i = 0; i < n; i++) {
            if (used[i]) continue;
            var dd = d2(last, nodes[i]);
            if (dd < bd) { bd = dd; bi = i; }
        }
        order.push(bi); used[bi] = true;
    }
    return order;
}

/** 교차 구간을 뒤집어 총 이동거리를 줄인다 (열린 경로) */
function twoOpt(nodes, order, maxPass) {
    var n = order.length;
    if (n < 4) return order;
    var improved = true, pass = 0;
    while (improved && pass++ < (maxPass || 30)) {
        improved = false;
        for (var i = 0; i < n - 2; i++) {
            for (var j = i + 2; j < n - 1; j++) {
                var a = nodes[order[i]], b = nodes[order[i + 1]];
                var c = nodes[order[j]], d = nodes[order[j + 1]];
                var before = dist(a, b) + dist(c, d);
                var after  = dist(a, c) + dist(b, d);
                if (after + 1e-9 < before) {
                    // i+1 … j 구간 뒤집기
                    for (var lo = i + 1, hi = j; lo < hi; lo++, hi--) {
                        var t = order[lo]; order[lo] = order[hi]; order[hi] = t;
                    }
                    improved = true;
                }
            }
        }
    }
    return order;
}

function routeLength(nodes, order) {
    var s = 0;
    for (var i = 0; i + 1 < order.length; i++) s += dist(nodes[order[i]], nodes[order[i + 1]]);
    return s;
}

/* ---------- 계획 ---------- */

/**
 * plan(recs, k)
 *   좌표가 있는 레코드에 day(1~k), seq(1~n) 를 채운다.
 *   좌표가 없으면 day = null.
 * 반환: 일차별 요약 배열
 */
function plan(recs, k) {
    k = k || 10;
    var geo = recs.filter(function (r) { return r.lat && r.lng; });
    recs.forEach(function (r) { r.day = null; r.seq = null; });
    if (geo.length < k) return [];

    var pts = projectAll(geo);
    var km = kmeansBalanced(pts, k, 40);
    var assign = km.assign;

    /* ② 일차 순서 — 군집 중심들을 TSP 로 풀어 인접하게 번호 매김.
          서쪽 아래에서 시작해 훑고 올라오도록 시작점을 정한다. */
    var cents = km.centroids.map(function (c, i) { return { x: c.x, y: c.y, i: i }; });
    var start = 0, bs = Infinity;
    for (var i = 0; i < cents.length; i++) {
        var s = cents[i].x + cents[i].y;        // 남서쪽일수록 작다
        if (s < bs) { bs = s; start = i; }
    }
    var cOrder = twoOpt(cents, nearestNeighbour(cents, start), 50);
    var dayOf = new Array(k);
    for (i = 0; i < cOrder.length; i++) dayOf[cents[cOrder[i]].i] = i + 1;

    /* ③ 하루 경로 */
    var buckets = {};
    for (i = 0; i < assign.length; i++) {
        var day = dayOf[assign[i]];
        (buckets[day] || (buckets[day] = [])).push(pts[i]);
    }

    var summary = [];
    var prevEnd = null;
    for (var d = 1; d <= k; d++) {
        var nodes = buckets[d] || [];
        if (!nodes.length) continue;

        // 전날 마지막 지점에서 가장 가까운 필지부터 시작 (날 사이 이동도 줄인다)
        var si = 0;
        if (prevEnd) {
            var bd = Infinity;
            for (i = 0; i < nodes.length; i++) {
                var dd = d2(prevEnd, nodes[i]);
                if (dd < bd) { bd = dd; si = i; }
            }
        }
        var order = twoOpt(nodes, nearestNeighbour(nodes, si), 40);

        for (i = 0; i < order.length; i++) {
            var rec = geo[nodes[order[i]].i];
            rec.day = d;
            rec.seq = i + 1;
        }
        prevEnd = nodes[order[order.length - 1]];

        var len = routeLength(nodes, order);
        var latSum = 0, lngSum = 0, area = 0, prices = [];
        for (i = 0; i < nodes.length; i++) {
            var rr = geo[nodes[i].i];
            latSum += rr.lat; lngSum += rr.lng; area += rr.area;
            if (rr.price > 0) prices.push(rr.price);
        }
        prices.sort(function (a, b) { return a - b; });
        summary.push({
            day: d,
            n: nodes.length,
            meters: len,
            km: len / 1000,
            lat: latSum / nodes.length,
            lng: lngSum / nodes.length,
            area: area,
            medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : 0
        });
    }
    return summary;
}

/** 특정 일차의 방문 순서대로 [[lat,lng], ...] */
function pathOf(recs, day) {
    return recs.filter(function (r) { return r.day === day && r.seq; })
        .sort(function (a, b) { return a.seq - b.seq; })
        .map(function (r) { return [r.lat, r.lng]; });
}

global.Route = { plan: plan, pathOf: pathOf };

})(window);
