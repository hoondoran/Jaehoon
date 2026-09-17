/* ============================================================
   roadplan.js — 도로(차량) 기준 방문 순서 계산
   ------------------------------------------------------------
   직선거리로 순서를 정하면 강·고속도로·산으로 막힌 구간을 무시해서
   실제 주행이 크게 늘어난다. (6일차 실측: 직선 14.0km → 도로 54.7km)

   그래서 OSRM 으로 도로 거리행렬을 받아 순서를 다시 풀고, 확정된 순서의
   실제 도로 형상까지 받아 둔다.

   런타임에 매번 부르지 않는다. 한 번 계산해 data/roads.js 로 저장해 두면
   그 뒤로는 오프라인에서도 도로 경로가 그대로 표시된다. (좌표와 같은 방식)

   OSRM 공개 데모 서버 제약
     · /table  좌표 100개 상한 → 45개씩 블록으로 나눠 채운다
     · /route  경유지 104개 확인됨
     · 데모 서버이므로 요청 간 간격을 둔다
   ============================================================ */
(function (global) {
'use strict';

var OSRM = 'https://router.project-osrm.org';
var CHUNK = 45;          // 블록 크기 (두 블록 합쳐도 100 이하)
var GAP_MS = 250;        // 요청 간 간격

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function coordStr(list) {
    return list.map(function (p) { return p.lng + ',' + p.lat; }).join(';');
}

/* ---------- 도로 거리행렬 ---------- */

/**
 * roadMatrix(pts, onProgress) → n×n 도로거리(m) 행렬
 * 좌표 100개 상한 때문에 블록 단위로 나눠 받는다.
 */
async function roadMatrix(pts, onProgress) {
    var n = pts.length;
    var M = [];
    for (var i = 0; i < n; i++) M.push(new Float64Array(n));

    var blocks = [];
    for (i = 0; i < n; i += CHUNK) {
        var idx = [];
        for (var j = i; j < Math.min(i + CHUNK, n); j++) idx.push(j);
        blocks.push(idx);
    }

    var total = blocks.length * blocks.length, done = 0;

    for (var a = 0; a < blocks.length; a++) {
        for (var b = 0; b < blocks.length; b++) {
            var A = blocks[a], B = blocks[b];
            var union, srcIdx, dstIdx;

            if (a === b) {
                union = A;
                srcIdx = A.map(function (_, k) { return k; });
                dstIdx = srcIdx;
            } else {
                union = A.concat(B);
                srcIdx = A.map(function (_, k) { return k; });
                dstIdx = B.map(function (_, k) { return A.length + k; });
            }

            var url = OSRM + '/table/v1/driving/' + coordStr(union.map(function (i2) { return pts[i2]; }))
                + '?annotations=distance'
                + '&sources=' + srcIdx.join(';')
                + '&destinations=' + dstIdx.join(';');

            var j2 = await fetch(url).then(function (r) { return r.json(); });
            if (j2.code !== 'Ok') throw new Error('OSRM table: ' + (j2.message || j2.code));

            for (var si = 0; si < A.length; si++) {
                for (var di = 0; di < B.length; di++) {
                    var v = j2.distances[si][di];
                    M[A[si]][B[di]] = (v === null || v === undefined) ? Infinity : v;
                }
            }
            done++;
            if (onProgress) onProgress(done, total);
            await sleep(GAP_MS);
        }
    }

    // 2-opt 는 구간을 뒤집으므로 대칭이어야 한다. 왕복 평균으로 맞춘다.
    for (i = 0; i < n; i++) {
        for (var k = i + 1; k < n; k++) {
            var s = (M[i][k] + M[k][i]) / 2;
            M[i][k] = s; M[k][i] = s;
        }
        M[i][i] = 0;
    }
    return M;
}

/* ---------- 행렬 기반 경로 ---------- */

function nnOrder(M, start) {
    var n = M.length, used = new Array(n).fill(false), order = [start];
    used[start] = true;
    for (var s = 1; s < n; s++) {
        var last = order[order.length - 1], bi = -1, bd = Infinity;
        for (var i = 0; i < n; i++) {
            if (!used[i] && M[last][i] < bd) { bd = M[last][i]; bi = i; }
        }
        if (bi < 0) { for (i = 0; i < n; i++) if (!used[i]) { bi = i; break; } }
        order.push(bi); used[bi] = true;
    }
    return order;
}

function twoOptM(M, order, maxPass) {
    var n = order.length;
    if (n < 4) return order;
    var improved = true, pass = 0;
    while (improved && pass++ < (maxPass || 40)) {
        improved = false;
        for (var i = 0; i < n - 2; i++) {
            for (var j = i + 2; j < n - 1; j++) {
                var before = M[order[i]][order[i + 1]] + M[order[j]][order[j + 1]];
                var after  = M[order[i]][order[j]]     + M[order[i + 1]][order[j + 1]];
                if (after + 1e-6 < before) {
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

function pathCost(M, order) {
    var s = 0;
    for (var i = 0; i + 1 < order.length; i++) s += M[order[i]][order[i + 1]];
    return s;
}

/* ---------- 확정 순서의 실제 도로 형상 ---------- */

async function routeGeometry(pts) {
    var url = OSRM + '/route/v1/driving/' + coordStr(pts)
        + '?overview=full&geometries=polyline&steps=false';
    var j = await fetch(url).then(function (r) { return r.json(); });
    if (j.code !== 'Ok') throw new Error('OSRM route: ' + (j.message || j.code));
    return {
        meters: j.routes[0].distance,
        seconds: j.routes[0].duration,
        geometry: j.routes[0].geometry
    };
}

/* ---------- polyline 디코더 (precision 5) ---------- */

function decodePolyline(str) {
    var idx = 0, lat = 0, lng = 0, out = [];
    while (idx < str.length) {
        var b, shift = 0, result = 0;
        do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
        shift = 0; result = 0;
        do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
        out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
}

/* ---------- 전체 계획 ---------- */

/**
 * planRoads(recs, days, opts)
 *   일차별로 도로 거리행렬을 받아 순서를 다시 풀고 형상까지 받아 온다.
 *   opts.onProgress(단계설명, 진행, 전체)
 * 반환: { "1": {order:[pnu...], meters, seconds, geometry, straightKm, roadKm}, ... }
 */
async function planRoads(recs, days, opts) {
    opts = opts || {};
    var out = {};
    var prevEnd = null;

    for (var d = 1; d <= days; d++) {
        var g = recs.filter(function (r) { return r.day === d && r.lat; })
                    .sort(function (a, b) { return a.seq - b.seq; });
        if (g.length < 2) continue;

        var pts = g.map(function (r) { return { lat: r.lat, lng: r.lng }; });

        if (opts.onProgress) opts.onProgress(d + '일차 도로거리 계산', d - 1, days);
        var M = await roadMatrix(pts, function (done, total) {
            if (opts.onProgress) {
                opts.onProgress(d + '일차 도로거리 ' + done + '/' + total, d - 1, days);
            }
        });

        // 전날 마지막 지점에서 가장 가까운 곳부터 시작
        var start = 0;
        if (prevEnd) {
            var bd = Infinity;
            for (var i = 0; i < pts.length; i++) {
                var dx = pts[i].lat - prevEnd.lat, dy = pts[i].lng - prevEnd.lng;
                var dd = dx * dx + dy * dy;
                if (dd < bd) { bd = dd; start = i; }
            }
        }

        var before = pathCost(M, g.map(function (_, i) { return i; }));   // 직선 순서의 도로거리
        var order = twoOptM(M, nnOrder(M, start), 60);
        var after = pathCost(M, order);

        if (opts.onProgress) opts.onProgress(d + '일차 경로 형상', d - 1, days);
        var geo = await routeGeometry(order.map(function (i2) { return pts[i2]; }));
        await sleep(GAP_MS);

        prevEnd = pts[order[order.length - 1]];

        out[d] = {
            order: order.map(function (i2) { return g[i2].pnu; }),
            meters: Math.round(geo.meters),
            seconds: Math.round(geo.seconds),
            geometry: geo.geometry,
            beforeM: Math.round(before),
            afterM: Math.round(after)
        };
        if (opts.onProgress) opts.onProgress(d + '일차 완료', d, days);
    }
    return out;
}

/** data/roads.js 형식으로 직렬화 */
function serialize(plan) {
    var lines = Object.keys(plan).sort(function (a, b) { return a - b; }).map(function (d) {
        var p = plan[d];
        return '"' + d + '":{'
            + 'meters:' + p.meters + ','
            + 'seconds:' + p.seconds + ','
            + 'order:[' + p.order.map(function (x) { return '"' + x + '"'; }).join(',') + '],'
            + 'geometry:"' + p.geometry.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}';
    });
    return '/* 자동 생성 — 도로(차량) 기준 일차별 방문 순서와 경로 형상\n'
        + ' * OSRM 으로 계산해 저장한 결과. 앱은 이 파일만 읽고 런타임에 호출하지 않는다.\n'
        + ' *   order    : 방문 순서대로의 PNU\n'
        + ' *   meters   : 실제 도로 주행거리\n'
        + ' *   seconds  : 주행 소요시간 (조사 시간 제외)\n'
        + ' *   geometry : encoded polyline (precision 5)\n'
        + ' * 페이지의 "도로 경로 계산" 버튼으로 재생성한다. */\n'
        + 'var ROAD_ROUTES = {\n' + lines.join(',\n') + '\n};\n';
}

global.RoadPlan = {
    planRoads: planRoads,
    serialize: serialize,
    decodePolyline: decodePolyline
};

})(window);
