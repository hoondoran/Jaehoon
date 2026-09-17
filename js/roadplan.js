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

/* ============================================================
   도로 기준 일차 묶기 (정원 제약 k-medoids)
   ------------------------------------------------------------
   어떤 필지를 같은 날로 묶을지도 도로 기준이어야 한다. 직선으로 묶으면
   강 건너편·고속도로 반대편이 같은 날에 들어간다.

   전체 도로 행렬(1,043²)은 OSRM 호출이 576블록이라 과하다. 대신 중심을
   실제 필지(medoid)로 두면 필요한 것은 "모든 점 → 대표 10곳" 거리뿐이다.
   /table 에 sources=대표 10곳, destinations=90곳씩 넣으면 한 번에 100좌표
   상한을 지키면서 12번이면 1,043개를 다 채운다.
   ============================================================ */

/**
 * 정원. 기본은 정확 균등(105×3 + 104×7).
 *
 * slack 으로 여유를 줄 수 있으나 기본값은 0 이다. 여유를 주면 가까운 쌍부터
 * 정원까지 채우는 특성상 앞쪽 군집이 상한까지 차고 마지막이 굶는다.
 * (실측 slack 0.12: 하루 41~117필지로 쏠리고 총 주행 736km → 808km 로 악화)
 */
function capacitiesOf(n, k, slack) {
    if (!slack) {
        var base = Math.floor(n / k), rem = n - base * k, caps = [];
        for (var j = 0; j < k; j++) caps.push(base + (j < rem ? 1 : 0));
        return caps;
    }
    var cap = Math.ceil(n / k * (1 + slack)), c2 = [];
    for (j = 0; j < k; j++) c2.push(cap);
    return c2;
}

function haversine(a, b) {
    var R = 6371000, p = Math.PI / 180;
    var dLat = (b.lat - a.lat) * p, dLon = (b.lng - a.lng) * p;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
}

/** 모든 점 → 대표 medoid 들까지의 도로거리 D[n][k] */
async function distancesToMedoids(pts, medoids, onProgress) {
    var n = pts.length, k = medoids.length;
    var D = [];
    for (var i = 0; i < n; i++) D.push(new Float64Array(k));

    var per = 100 - k;                 // 좌표 100개 상한 (대표 k곳 + per곳)
    var calls = Math.ceil(n / per), c = 0;

    for (var s = 0; s < n; s += per) {
        var chunk = [];
        for (var t = s; t < Math.min(s + per, n); t++) chunk.push(t);

        var coords = medoids.map(function (mi) { return pts[mi]; })
                            .concat(chunk.map(function (i2) { return pts[i2]; }));
        var src = [], dst = [];
        for (i = 0; i < k; i++) src.push(i);
        for (i = 0; i < chunk.length; i++) dst.push(k + i);

        var url = OSRM + '/table/v1/driving/' + coordStr(coords)
            + '?annotations=distance&sources=' + src.join(';') + '&destinations=' + dst.join(';');

        var j2 = await fetch(url).then(function (r) { return r.json(); });
        if (j2.code !== 'Ok') throw new Error('OSRM table: ' + (j2.message || j2.code));

        for (var m = 0; m < k; m++) {
            for (var q = 0; q < chunk.length; q++) {
                var v = j2.distances[m][q];
                // 도로로 못 닿는 경우가 있으면 직선 × 1.4 로 근사해 배정은 되게 한다
                D[chunk[q]][m] = (v === null || v === undefined)
                    ? haversine(pts[chunk[q]], pts[medoids[m]]) * 1.4
                    : v;
            }
        }
        c++;
        if (onProgress) onProgress(c, calls);
        await sleep(GAP_MS);
    }
    return D;
}

/** D[n][k] 와 정원으로 배정 — 가까운 (점,군집) 쌍부터 자리를 준다 */
function assignWithCapacity(D, caps) {
    var n = D.length, k = caps.length;
    var pairs = [];
    for (var i = 0; i < n; i++) {
        for (var j = 0; j < k; j++) pairs.push({ i: i, j: j, d: D[i][j] });
    }
    pairs.sort(function (a, b) { return a.d - b.d; });

    var assign = new Array(n).fill(-1), used = new Array(k).fill(0), placed = 0;
    for (var p = 0; p < pairs.length && placed < n; p++) {
        var pr = pairs[p];
        if (assign[pr.i] !== -1 || used[pr.j] >= caps[pr.j]) continue;
        assign[pr.i] = pr.j; used[pr.j]++; placed++;
    }
    return assign;
}

/**
 * 교환 개선 — 정원을 지킨 채 두 점의 소속을 맞바꿔 도로거리 합을 줄인다.
 *
 * 가까운 쌍부터 자리를 주는 방식은 정원이 먼저 찬 군집 탓에 갈 곳 없는 점이
 * 마지막 군집으로 몰린다. (실측: 10일차가 세 읍에 걸쳐 주행 327km)
 * 자기 대표에서 먼 점만 후보로 삼아 전수 비교의 비용을 줄인다.
 */
function refineSwapRoad(D, assign) {
    var n = D.length;
    for (var pass = 0; pass < 10; pass++) {
        var far = [];
        for (var i = 0; i < n; i++) far.push({ i: i, d: D[i][assign[i]] });
        far.sort(function (a, b) { return b.d - a.d; });
        far = far.slice(0, Math.max(20, Math.floor(n * 0.3)));

        var swaps = 0;
        for (var a = 0; a < far.length; a++) {
            var ia = far[a].i, ca = assign[ia];
            var bestJ = -1, bestGain = 1e-6;
            for (var ib = 0; ib < n; ib++) {
                var cb = assign[ib];
                if (cb === ca) continue;
                var gain = (D[ia][ca] + D[ib][cb]) - (D[ia][cb] + D[ib][ca]);
                if (gain > bestGain) { bestGain = gain; bestJ = ib; }
            }
            if (bestJ >= 0) {
                var t = assign[ia]; assign[ia] = assign[bestJ]; assign[bestJ] = t;
                swaps++;
            }
        }
        if (!swaps) break;
    }
    return assign;
}

/** 군집의 기하 중앙값에 가장 가까운 실제 점 (다음 라운드의 대표) */
function pickMedoid(pts, members) {
    var lat = 0, lng = 0, i;
    for (i = 0; i < members.length; i++) { lat += pts[members[i]].lat; lng += pts[members[i]].lng; }
    var c = { lat: lat / members.length, lng: lng / members.length };
    var best = members[0], bd = Infinity;
    for (i = 0; i < members.length; i++) {
        var d = haversine(pts[members[i]], c);
        if (d < bd) { bd = d; best = members[i]; }
    }
    return best;
}

/**
 * clusterByRoad(pts, k, seedMedoids, opts) → assign[]
 * 정원을 지키면서 도로거리 기준으로 k개 군집을 만든다.
 */
async function clusterByRoad(pts, k, seedMedoids, opts) {
    opts = opts || {};
    var n = pts.length;
    var caps = capacitiesOf(n, k, opts.slack || 0);
    var medoids = seedMedoids.slice();
    var assign = null;

    for (var it = 0; it < (opts.iters || 6); it++) {
        if (opts.onProgress) opts.onProgress('도로 군집 ' + (it + 1) + '회차', it, opts.iters || 6);

        var D = await distancesToMedoids(pts, medoids, function (c, total) {
            if (opts.onProgress) {
                opts.onProgress('도로 군집 ' + (it + 1) + '회차 ' + c + '/' + total, it, opts.iters || 6);
            }
        });

        var next = refineSwapRoad(D, assignWithCapacity(D, caps));
        var same = assign && next.every(function (v, i) { return v === assign[i]; });
        assign = next;
        if (same) break;

        // 대표 갱신
        var groups = [];
        for (var j = 0; j < k; j++) groups.push([]);
        for (var i = 0; i < n; i++) groups[assign[i]].push(i);
        for (j = 0; j < k; j++) if (groups[j].length) medoids[j] = pickMedoid(pts, groups[j]);
    }
    return { assign: assign, medoids: medoids };
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

/**
 * planAllByRoad(recs, k, opts)
 *   ① 도로 기준으로 일차를 묶고 (정원 제약 k-medoids)
 *   ② 대표 10곳을 도로거리 TSP 로 풀어 일차 번호를 인접하게 매기고
 *   ③ 각 일차 안의 방문 순서를 도로 기준으로 풀어 형상까지 받는다.
 *
 * recs 의 day/seq 를 직접 갱신하고 ROAD_ROUTES 형식을 반환한다.
 */
async function planAllByRoad(recs, k, opts) {
    opts = opts || {};
    var geo = recs.filter(function (r) { return r.lat && r.lng; });
    if (geo.length < k) return {};
    var pts = geo.map(function (r) { return { lat: r.lat, lng: r.lng }; });

    /* ① 씨앗 대표: 기존(직선) 일차의 중심에 가장 가까운 실제 필지 */
    var seed = [];
    for (var d = 1; d <= k; d++) {
        var idx = [];
        for (var i = 0; i < geo.length; i++) if (geo[i].day === d) idx.push(i);
        if (!idx.length) {
            // 직선 계획이 없으면 서로 멀리 떨어진 점으로 시작
            var far = 0, fd = -1;
            for (i = 0; i < pts.length; i++) {
                var m = Infinity;
                for (var s2 = 0; s2 < seed.length; s2++) m = Math.min(m, haversine(pts[i], pts[seed[s2]]));
                if (seed.length === 0) m = i;
                if (m > fd) { fd = m; far = i; }
            }
            seed.push(far);
        } else {
            seed.push(pickMedoid(pts, idx));
        }
    }

    var cl = await clusterByRoad(pts, k, seed, {
        iters: opts.iters || 6,
        onProgress: opts.onProgress
    });

    /* ② 일차 번호 — 대표 10곳 사이의 도로거리로 순회 순서 결정 */
    if (opts.onProgress) opts.onProgress('일차 순서 계산', 0, 1);
    var medPts = cl.medoids.map(function (mi) { return pts[mi]; });
    var Dm = await roadMatrix(medPts);
    // 남서쪽에서 시작
    var start = 0, bs = Infinity;
    for (i = 0; i < medPts.length; i++) {
        var sc = medPts[i].lat + medPts[i].lng;
        if (sc < bs) { bs = sc; start = i; }
    }
    var cOrder = twoOptM(Dm, nnOrder(Dm, start), 50);
    var dayOf = new Array(k);
    for (i = 0; i < cOrder.length; i++) dayOf[cOrder[i]] = i + 1;

    // 배정 반영
    recs.forEach(function (r) { r.day = null; r.seq = null; });
    for (i = 0; i < geo.length; i++) geo[i].day = dayOf[cl.assign[i]];

    /* ③ 일차별 방문 순서 + 형상 */
    return await planRoads(recs, k, opts);
}

global.RoadPlan = {
    planRoads: planRoads,
    planAllByRoad: planAllByRoad,
    serialize: serialize,
    decodePolyline: decodePolyline
};

})(window);
