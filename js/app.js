/* ============================================================
   app.js — 공시지가 산정 GIS · 지도 / UI
   ============================================================ */
(function () {
'use strict';

var A = window.Appraise;
var fmtWon = A.fmtWon, fmtPct = A.fmtPct, fmtArea = A.fmtArea, fmtShort = A.fmtShort;

/* ============================================================
   1. 데이터
   ============================================================ */
var REGION = window.PARCEL_REGION || '';
var recs = A.buildRecords(window.PARCEL_FIELDS, window.PARCEL_ROWS);
A.computeBalance(recs);

var TH = { resid: 0.5, gap: 3, chg: 10, z: 2 };
A.applyAudit(recs, TH);

var geoStat = window.Geo.hydrate(recs);

/* 메모 (localStorage) */
var MEMO_KEY = 'gongsi.memo.v1';
var memos = (function () {
    try { return JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); } catch (e) { return {}; }
})();
function saveMemo(key, text) {
    if (text) memos[key] = text; else delete memos[key];
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); } catch (e) {}
}

/* ============================================================
   2. 지표 정의 · 색상 스케일
   ------------------------------------------------------------
   순차형(크기): 단일 blue 램프 light→dark · 5분위
   발산형(부호): blue ↔ red, 중립 회색 midpoint · 대칭 구간
   ============================================================ */
var SEQ = ['#9ec5f4', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
var DIV = ['#1c5cab', '#6da7ec', '#cbd5e0', '#e87b7b', '#b32a2a'];
var NO_VAL = '#cbd5e0';

var METRICS = {
    price: { label: '공시지가 (원/㎡)', type: 'seq', unit: '원',
             get: function (r) { return r.price; }, fmt: function (v) { return fmtShort(v); } },
    chg:   { label: '전년 대비 증감률 (%)', type: 'div',
             get: function (r) { return r.prev > 0 ? r.calcChg : null; }, fmt: function (v) { return v.toFixed(1) + '%'; } },
    mkt:   { label: '시가수준 (원/㎡)', type: 'seq', unit: '원',
             get: function (r) { return r.mkt; }, fmt: function (v) { return fmtShort(v); } },
    r27:   { label: "'27 반영률 (%)", type: 'seq',
             get: function (r) { return r.r27 || null; }, fmt: function (v) { return v.toFixed(2) + '%'; } },
    gap:   { label: 'A·B조 격차율 (%)', type: 'div',
             get: function (r) { return r.singleGroup ? null : r.calcGap; }, fmt: function (v) { return v.toFixed(2) + '%'; } },
    resid: { label: '산정 오차 (%)', type: 'div',
             get: function (r) { return r.calcPrice > 0 ? r.residPct : null; }, fmt: function (v) { return v.toFixed(3) + '%'; } },
    zdev:  { label: '균형성 편차 (σ)', type: 'div',
             get: function (r) { return r.zdev || null; }, fmt: function (v) { return v.toFixed(2) + 'σ'; } }
};

var scale = { breaks: [], colors: SEQ, type: 'seq' };

function buildScale(list, metric) {
    var m = METRICS[metric], vals = [], i, v;
    for (i = 0; i < list.length; i++) {
        v = m.get(list[i]);
        if (v !== null && v !== undefined && isFinite(v)) vals.push(v);
    }
    vals.sort(function (a, b) { return a - b; });
    if (!vals.length) { scale = { breaks: [], colors: SEQ, type: m.type, metric: metric }; return; }

    if (m.type === 'seq') {
        scale = {
            type: 'seq', metric: metric, colors: SEQ,
            breaks: [A.quantile(vals, .2), A.quantile(vals, .4), A.quantile(vals, .6), A.quantile(vals, .8)],
            lo: vals[0], hi: vals[vals.length - 1]
        };
    } else {
        // 발산형: |v| 의 상위 분위로 대칭 구간을 잡아 극단값에 눌리지 않게 한다
        var abs = vals.map(Math.abs).sort(function (a, b) { return a - b; });
        var b2 = A.quantile(abs, .90) || 1;
        var b1 = A.quantile(abs, .60) || b2 / 3;
        if (b1 >= b2) b1 = b2 / 2;
        scale = { type: 'div', metric: metric, colors: DIV, breaks: [-b2, -b1, b1, b2],
                  lo: vals[0], hi: vals[vals.length - 1] };
    }
}

function colorOf(r) {
    var v = METRICS[scale.metric].get(r);
    if (v === null || v === undefined || !isFinite(v)) return NO_VAL;
    var b = scale.breaks;
    for (var i = 0; i < b.length; i++) if (v < b[i]) return scale.colors[i];
    return scale.colors[b.length];
}

/* 마커 크기는 면적과 무관하게 일정하다 — 크기는 아무 값도 encoding 하지 않고,
   색(선택한 지표)만 읽으면 되도록 한다. 줌에 따라 시인성만 조절. */
function radiusOf(r) {
    var z = map.getZoom();
    var base = z <= 11 ? 3.6 : (z <= 14 ? 4.4 : 5.2);
    return (selected && selected.key === r.key) ? base + 3 : base;
}

/* ============================================================
   3. 지도
   ============================================================ */
/* 배경지도는 카카오. Leaflet 은 그 위의 투명한 오버레이로만 쓴다.
   카카오 레벨은 정수인데 대응하는 Leaflet 줌은 정수가 아니므로(kakao_base.js 참고)
   zoomSnap:0 으로 두고 kakao_base 가 허용 격자에 스냅시킨다.
   두 지도가 어긋나 보이지 않도록 줌 애니메이션은 끈다. */
var map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    zoomSnap: 0,
    zoomDelta: 1,
    zoomAnimation: false,
    attributionControl: false
}).setView([35.72, 128.45], 12);   // 대구 달성군 일원

var kbase = null;   // 카카오 배경지도 컨트롤러 (KakaoBase.init 결과)

var markerLayer = L.layerGroup().addTo(map);
var labelLayer = L.layerGroup().addTo(map);
var heatLayer = null, heatOn = false;

/* ============================================================
   4. 상태
   ============================================================ */
var state = {
    eup: new Set(), use: new Set(), jimok: '', zone: '',
    q: '', flaggedOnly: false, noGeoOnly: false,
    metric: 'price', showLabel: true, listCap: 200
};
var selected = null;
var filtered = [];
var byKey = {};
recs.forEach(function (r) { byKey[r.key] = r; });

/* ============================================================
   5. 필터
   ============================================================ */
function uniq(field) {
    var m = {};
    recs.forEach(function (r) { var v = r[field]; if (v) m[v] = (m[v] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })
        .map(function (k) { return { v: k, n: m[k] }; });
}

/** 읍·면 단위 (예: "화원읍 천내리" → "화원읍") */
function eupOf(r) { return (r.dong || '').split(' ')[0] || '기타'; }

function applyFilter() {
    var q = state.q.trim().toLowerCase();
    filtered = recs.filter(function (r) {
        if (state.eup.size && !state.eup.has(eupOf(r))) return false;
        if (state.use.size && !state.use.has(r.use || '미상')) return false;
        if (state.jimok && r.jimok !== state.jimok) return false;
        if (state.zone && r.zone1 !== state.zone) return false;
        if (state.flaggedOnly && !r.flagged) return false;
        if (state.noGeoOnly && r.lat) return false;
        if (q) {
            var hay = (r.loc + ' ' + r.road + ' ' + r.pnu + ' ' + r.dong).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        return true;
    });
    buildScale(filtered, state.metric);
    renderAll();
}

/* ============================================================
   6. 렌더 — 지도
   ============================================================ */
function renderMarkers() {
    markerLayer.clearLayers();
    var withGeo = filtered.filter(function (r) { return r.lat; });

    withGeo.forEach(function (r) {
        var isSel = selected && selected.key === r.key;
        var m = L.circleMarker([r.lat, r.lng], {
            radius: radiusOf(r),
            fillColor: colorOf(r),
            fillOpacity: .9,
            color: isSel ? '#111' : '#fff',     // 겹치는 마커 분리용 표면 링
            weight: 2,
            opacity: 1
        });
        m.on('click', function () { select(r, false); });
        m.bindTooltip(tipHtml(r), { direction: 'top', offset: [0, -4] });
        markerLayer.addLayer(m);
    });

    renderLabels(withGeo);
    renderShape();
    if (heatOn) renderHeat();
}

/* ---------- 요약 라벨 ----------
   소재지 / 단가 / 용도지역 · 이용상황을 한 장에 담고, 클릭하면 산정 패널이 열린다.
   1,043개를 전부 띄우면 못 읽으므로 화면 좌표에서 겹치는 것은 버린다.
   우선순위: 선택 필지 → 검수 대상 → 지가 높은 순.                                */

var LBL_W = 152, LBL_H = 58, LBL_OFF = 13, LBL_MAX = 260, LBL_PAD = 3;

function labelHtml(r, isSel) {
    var c = colorOf(r);
    var flag = '';
    if (r.flagged) {
        var ic = r.auditLevel === 'critical' ? '⛔' : (r.auditLevel === 'serious' ? '🔺' : '⚠');
        flag = '<span class="sl-flag ' + r.auditLevel + '">' + ic + '</span>';
    }
    return '<div class="sum-label' + (isSel ? ' sel' : '') + '" style="border-left-color:' + c + ';">'
        + flag
        + '<div class="sl-loc">' + esc(r.jibun || r.loc) + '</div>'
        + '<div class="sl-price" style="color:' + c + ';">' + fmtWon(r.price)
        + '<span>원/㎡</span></div>'
        + '<div class="sl-meta">' + esc(r.zone1 || '-') + ' · ' + esc(r.use || '-') + '</div>'
        + '</div>';
}

function overlaps(b, list) {
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (b.x < o.x + o.w + LBL_PAD && b.x + b.w + LBL_PAD > o.x &&
            b.y < o.y + o.h + LBL_PAD && b.y + b.h + LBL_PAD > o.y) return true;
    }
    return false;
}

function renderLabels(withGeo) {
    labelLayer.clearLayers();
    if (!state.showLabel) return;
    if (!withGeo) withGeo = filtered.filter(function (r) { return r.lat; });

    var size = map.getSize();
    if (!size.x || !size.y) return;

    var order = withGeo.slice().sort(function (a, b) {
        var as = (selected && selected.key === a.key) ? 2 : (a.flagged ? 1 : 0);
        var bs = (selected && selected.key === b.key) ? 2 : (b.flagged ? 1 : 0);
        if (as !== bs) return bs - as;
        return b.price - a.price;
    });

    var placed = [];
    for (var i = 0; i < order.length && placed.length < LBL_MAX; i++) {
        var r = order[i];
        var p = map.latLngToContainerPoint([r.lat, r.lng]);
        if (p.x < -LBL_W || p.x > size.x + LBL_W || p.y < -LBL_H || p.y > size.y + LBL_H) continue;

        var box = { x: p.x - LBL_W / 2, y: p.y - LBL_H - LBL_OFF, w: LBL_W, h: LBL_H };
        if (overlaps(box, placed)) continue;
        placed.push(box);

        var isSel = !!(selected && selected.key === r.key);
        var mk = L.marker([r.lat, r.lng], {
            icon: L.divIcon({
                className: 'pin-wrap', html: labelHtml(r, isSel),
                iconSize: [LBL_W, LBL_H], iconAnchor: [LBL_W / 2, LBL_H + LBL_OFF]
            }),
            interactive: true, keyboard: false,
            zIndexOffset: isSel ? 1000 : 0
        });
        mk.on('click', (function (rec) {
            return function () { select(rec, false); };
        })(r));
        labelLayer.addLayer(mk);
    }
    lastLabelCount = placed.length;
}
var lastLabelCount = 0;

function tipHtml(r) {
    var flag = r.flagged ? ' <b style="color:#d03b3b">🚩' + r.flags.length + '</b>' : '';
    return '<b>' + esc(r.loc) + '</b>' + flag + '<br>'
        + esc(r.jimok) + ' · ' + fmtArea(r.area) + ' · ' + esc(r.use) + '<br>'
        + '<b>' + fmtWon(r.price) + '</b> 원/㎡ (' + fmtPct(r.calcChg, 1) + ')';
}

/* ---------- 필지 외곽선 ----------
   카카오 SDK 는 Polygon(그리기)은 제공하지만 필지 경계 좌표 자체는 주지 않는다.
   (services 에 Geocoder·Places 뿐, 지적 데이터 API 없음)
   그래서 경계는 data/shapes.js 의 PARCEL_SHAPES 에서 받아 쓴다.
     PARCEL_SHAPES = { "<PNU>": [[위도,경도], [위도,경도], ...] }
   데이터가 없으면 아무것도 그리지 않고 원형 마커만 남는다.               */

var shapeOverlays = [];

function clearShapes() {
    for (var i = 0; i < shapeOverlays.length; i++) shapeOverlays[i].setMap(null);
    shapeOverlays = [];
}

function hasShapes() {
    return !!(window.PARCEL_SHAPES && Object.keys(window.PARCEL_SHAPES).length);
}

function renderShape() {
    clearShapes();
    if (!kbase || !hasShapes()) return;
    var km = kbase.kakaoMap, bounds = map.getBounds();

    var targets = [];
    if (selected && selected.lat) targets.push(selected);
    // 충분히 확대했으면 화면 안 필지도 함께 (너무 많으면 건너뜀)
    if (map.getZoom() >= 15.9) {
        for (var i = 0; i < filtered.length && targets.length < 300; i++) {
            var r = filtered[i];
            if (!r.lat || (selected && r.key === selected.key)) continue;
            if (bounds.contains([r.lat, r.lng])) targets.push(r);
        }
    }

    targets.forEach(function (r) {
        var ring = window.PARCEL_SHAPES[r.pnu];
        if (!ring || ring.length < 3) return;
        var path = ring.map(function (pt) { return new kakao.maps.LatLng(pt[0], pt[1]); });
        var isSel = !!(selected && selected.key === r.key);
        var c = colorOf(r);
        var poly = new kakao.maps.Polygon({
            map: km, path: path,
            strokeWeight: isSel ? 4 : 2,
            strokeColor: isSel ? '#111111' : c,
            strokeOpacity: isSel ? 1 : 0.9,
            strokeStyle: 'solid',
            fillColor: c,
            fillOpacity: isSel ? 0.38 : 0.16
        });
        kakao.maps.event.addListener(poly, 'click', function () { select(r, false); });
        shapeOverlays.push(poly);
    });
}

function renderHeat() {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    var pts = filtered.filter(function (r) { return r.lat && r.price > 0; });
    if (!pts.length) return;
    var max = Math.max.apply(null, pts.map(function (r) { return Math.log(r.price); }));
    var min = Math.min.apply(null, pts.map(function (r) { return Math.log(r.price); }));
    var span = (max - min) || 1;
    heatLayer = L.heatLayer(pts.map(function (r) {
        return [r.lat, r.lng, (Math.log(r.price) - min) / span];
    }), { radius: 26, blur: 20, maxZoom: 17, minOpacity: .28 }).addTo(map);
}

/* ============================================================
   7. 렌더 — 목록 / 범례 / 카운터
   ============================================================ */
function renderList() {
    var el = document.getElementById('list-container');
    if (!filtered.length) {
        el.innerHTML = '<div class="empty-state">조건에 맞는 표준지가 없습니다.<br>필터를 조정해 보세요.</div>';
        return;
    }
    var show = filtered.slice(0, state.listCap);
    var h = show.map(function (r) {
        var tagCls = r.calcChg > 0 ? 'up' : (r.calcChg < 0 ? 'down' : 'flat');
        var flag = '';
        if (r.flagged) {
            var ic = r.auditLevel === 'critical' ? '⛔' : (r.auditLevel === 'serious' ? '🔺' : '⚠');
            flag = '<span class="flagdot ' + r.auditLevel + '">' + ic + ' 검수 ' + r.flags.length + '</span>';
        }
        return '<div class="list-item' + (selected && selected.key === r.key ? ' sel' : '') + '" data-k="' + r.key + '">'
            + '<div class="li-top"><span class="name">' + esc(r.loc) + '</span>'
            + '<span class="price">' + fmtWon(r.price) + '</span></div>'
            + '<div class="meta">' + esc(r.jimok) + ' · ' + fmtArea(r.area) + ' · ' + esc(r.use)
            + (r.zone1 ? ' · ' + esc(r.zone1) : '') + '</div>'
            + '<div class="li-bot"><span class="tag ' + tagCls + '">' + fmtPct(r.calcChg, 1) + '</span>'
            + '<span class="tag">반영률 ' + (r.r27 ? r.r27.toFixed(2) + '%' : '-') + '</span>'
            + flag
            + (r.lat ? '' : '<span class="nogeo">📍 좌표 없음</span>')
            + '</div></div>';
    }).join('');

    if (filtered.length > show.length) {
        h += '<div class="empty-state" style="padding:16px;">'
           + (filtered.length - show.length).toLocaleString('ko-KR') + '건 더 있음 · '
           + '<a href="#" id="more-link" style="color:var(--brand-500);font-weight:700;">더 보기</a></div>';
    }
    el.innerHTML = h;

    el.querySelectorAll('.list-item').forEach(function (n) {
        n.onclick = function () { select(byKey[n.dataset.k], true); };
    });
    var more = document.getElementById('more-link');
    if (more) more.onclick = function (e) { e.preventDefault(); state.listCap += 300; renderList(); };
}

function renderLegend() {
    var m = METRICS[scale.metric], b = scale.breaks, c = scale.colors;
    document.getElementById('lg-title').textContent = m.label;
    var rows = [], i;
    function sw(col, lab) {
        return '<div class="lg-row"><span class="lg-sw" style="background:' + col + '"></span>'
             + '<span class="lg-lab">' + lab + '</span></div>';
    }
    if (!b.length) {
        rows.push(sw(NO_VAL, '값 없음'));
    } else {
        rows.push(sw(c[0], '< ' + m.fmt(b[0])));
        for (i = 1; i < b.length; i++) rows.push(sw(c[i], m.fmt(b[i - 1]) + ' ~ ' + m.fmt(b[i])));
        rows.push(sw(c[b.length], '≥ ' + m.fmt(b[b.length - 1])));
        rows.push(sw(NO_VAL, '값 없음 / 단수조'));
    }
    document.getElementById('lg-rows').innerHTML = rows.join('');
    document.getElementById('lg-note').textContent =
        (scale.type === 'seq' ? '5분위 구간' : '0 기준 대칭 구간')
        + ' · 마커 크기는 모두 동일 (면적 무관)'
        + (hasShapes() ? '' : ' · 라벨 클릭 = 세부정보');
}

function renderCounts() {
    document.getElementById('cnt-shown').textContent = filtered.length.toLocaleString('ko-KR');
    document.getElementById('cnt-total').textContent = recs.length.toLocaleString('ko-KR');
}

function renderAll() {
    renderCounts();
    renderMarkers();
    renderList();
    renderLegend();
    renderStats();
    renderAudit();
}

/* ============================================================
   8. 선택 + 산정 패널
   ============================================================ */
var sim = null;   // 시뮬레이터 상태

function select(r, pan) {
    if (!r) return;
    selected = r;
    sim = { pa: r.pa, pb: r.pb, mkt: r.mkt };
    if (pan && r.lat) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17), { animate: true });
    show('calc-float', true);
    renderMarkers();
    renderList();
    renderCalc();
    if (window.innerWidth <= 820) closePanel();
}

function renderCalc() {
    var el = document.getElementById('calc-body');
    var r = selected;
    if (!r) {
        el.innerHTML = '<div class="calc-empty">지도의 필지 또는 좌측 목록에서<br>표준지를 선택하세요.</div>';
        return;
    }

    /* --- 시뮬레이션 값 --- */
    var sPrice = A.decidePrice(sim.pa, sim.pb);
    var sRatio = A.ratio(sPrice, sim.mkt);
    var sChg = A.changeRate(sPrice, r.prev);
    var sGap = A.gapRate(sim.pa, sim.pb);
    var changed = sPrice !== r.price;

    function dl(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }

    var h = '';
    h += '<div class="calc-title">' + esc(r.loc) + '</div>'
       + '<div class="calc-sub">' + esc(REGION) + (r.road ? ' · ' + esc(r.road) : '')
       + '<br>PNU ' + esc(r.pnu) + (r.lat ? '' : ' · <b style="color:#b8552a">좌표 미확보</b>') + '</div>';

    h += '<dl class="kv">'
       + dl('지목 / 면적', esc(r.jimok) + ' · ' + fmtArea(r.area))
       + dl('용도지역', esc(r.zone1 || '-') + (r.zone2 ? ' · ' + esc(r.zone2) : ''))
       + dl('이용상황', esc(r.use || '-'))
       + dl('도로 · 형상', esc(r.rface || '-') + ' · ' + esc(r.shape || '-') + ' · ' + esc(r.hgt || '-'))
       + dl('주위환경', esc(r.env || '-'))
       + dl('위치', esc(r.pos1 || '') + ' ' + esc(r.pos2 || ''))
       + (r.dist1 || r.fac || r.etcd
            ? dl('공법상 제한', esc([r.dist1, r.fac, r.etcd].filter(Boolean).join(' / ')))
            : '')
       + '</dl>';

    /* --- 산정 수식 --- */
    h += '<div class="sec"><div class="sec-h">① 평가액 → 결정 공시지가</div><div class="formula">'
       + frow('A조 평가액', r.singleGroup && !(r.pa > 0) ? '—' : fmtWon(sim.pa) + ' 원')
       + frow('B조 평가액', r.singleGroup && !(r.pb > 0) ? '—' : fmtWon(sim.pb) + ' 원')
       + (r.singleGroup ? frow('단수조', '교차검증 불가') : frow('격차율 (A−B)/A', sGap.toFixed(2) + '%'))
       + '<div class="fres"><span class="flab">결정 공시지가 <span style="font-weight:500;color:var(--ink-3)">'
       + (r.singleGroup ? '(단수조 · 유효숫자 반올림)' : '(평균 · 유효숫자 반올림)') + '</span></span>'
       + '<span class="fval">' + fmtWon(sPrice) + '원'
       + (changed ? '<span class="fdelta" style="color:' + (sPrice > r.price ? '#b32a2a' : '#1c5cab') + '">'
                    + fmtPct((sPrice / r.price - 1) * 100, 2) + '</span>' : '')
       + '</span></div></div>';

    h += sliderRow('sim-pa', 'A조 평가액', sim.pa, r.pa, r.pa > 0);
    h += sliderRow('sim-pb', 'B조 평가액', sim.pb, r.pb, r.pb > 0);
    h += '</div>';

    /* --- 반영률 --- */
    h += '<div class="sec"><div class="sec-h">② 공시지가 ÷ 시가수준 → 반영률</div><div class="formula">'
       + frow('시가수준', fmtWon(sim.mkt) + ' 원'
            + (r.mkta > 0 && r.mktb > 0 ? ' <span style="color:var(--ink-4);font-weight:500">(A '
              + fmtShort(r.mkta) + ' / B ' + fmtShort(r.mktb) + ')</span>' : ''))
       + frow('전년 시가수준', fmtWon(r.pmkt) + ' 원 · ' + fmtPct(r.calcMchg, 1))
       + '<div class="fres"><span class="flab">\'27 반영률</span>'
       + '<span class="fval">' + (sRatio ? sRatio.toFixed(2) + '%' : '-')
       + '<span class="fdelta" style="color:var(--ink-3)">\'26 ' + (r.r26 ? r.r26.toFixed(2) + '%' : '-') + '</span>'
       + '</span></div></div>'
       + sliderRow('sim-mkt', '시가수준', sim.mkt, r.mkt, r.mkt > 0)
       + '<div class="hint">반영률은 입력값이 아니라 <b>공시지가 ÷ 시가수준</b>의 결과값입니다. '
       + '목표 반영률 ' + (r.r27 ? r.r27.toFixed(2) : '—') + '% 를 맞추려면 공시지가는 '
       + fmtWon(A.priceFromRatio(sim.mkt, r.r27)) + '원이어야 합니다.</div>'
       + '</div>';

    /* --- 전년 대비 --- */
    h += '<div class="sec"><div class="sec-h">③ 전년 대비</div><div class="formula">'
       + frow('\'26 공시지가', fmtWon(r.prev) + ' 원')
       + frow('\'27 공시지가', fmtWon(sPrice) + ' 원')
       + '<div class="fres"><span class="flab">증감률</span><span class="fval" style="color:'
       + (sChg > 0 ? '#b32a2a' : (sChg < 0 ? '#1c5cab' : 'var(--ink-2)')) + '">'
       + fmtPct(sChg, 1) + '</span></div></div></div>';

    /* --- 검증 --- */
    h += '<div class="sec"><div class="sec-h">④ 검증</div>' + checksHtml(r) + '</div>';

    /* --- 인근 비교 --- */
    h += '<div class="sec"><div class="sec-h">⑤ 인근 유사 표준지 비교</div>' + neighborHtml(r) + '</div>';

    /* --- 메모 --- */
    h += '<div class="sec"><div class="sec-h">⑥ 현장조사 메모</div>'
       + '<textarea class="memo" id="memo-box" placeholder="현장 확인 사항, 산정 근거, 이의신청 대응 메모…">'
       + esc(memos[r.key] || '') + '</textarea>'
       + '<div class="btn-line"><button id="btn-memo-save" class="primary">메모 저장</button>'
       + '<button id="btn-sim-reset">시뮬레이터 초기화</button>'
       + '<button id="btn-copy">필지 요약 복사</button></div></div>';

    el.innerHTML = h;
    wireCalc(r);
}

function frow(lab, val) {
    return '<div class="frow"><span class="flab">' + lab + '</span><span class="fval">' + val + '</span></div>';
}

function sliderRow(id, lab, val, base, enabled) {
    if (!enabled) return '';
    var lo = Math.round(base * .85), hi = Math.round(base * 1.15);
    var step = Math.max(1, Math.round(base / 2000));
    return '<div class="slider-row"><div class="sl-top"><span>' + lab + ' 조정</span>'
        + '<b id="' + id + '-v">' + fmtWon(val) + ' 원 ('
        + fmtPct((val / base - 1) * 100, 1) + ')</b></div>'
        + '<input type="range" id="' + id + '" min="' + lo + '" max="' + hi + '" step="' + step
        + '" value="' + val + '" data-base="' + base + '"></div>';
}

function checksHtml(r) {
    var out = [];
    function chk(level, text) {
        var ic = level === 'pass' ? '✓' : (level === 'critical' ? '⛔' : (level === 'serious' ? '🔺' : '⚠'));
        out.push('<div class="chk ' + level + '"><span class="ic">' + ic + '</span><span>' + text + '</span></div>');
    }
    if (!r.flags.length || (r.flags.length === 1 && r.flags[0].code === 'SINGLE')) {
        chk('pass', '<b>산정 정합성 이상 없음</b> — A·B조 평균, 반영률, 전년 대비, 균형성 모두 허용 범위 내');
    }
    r.flags.forEach(function (f) { chk(f.level === 'warning' && f.code === 'SINGLE' ? 'warning' : f.level, f.text); });
    return out.join('');
}

function haversine(a, b, c, d) {
    var R = 6371000, p = Math.PI / 180;
    var dLat = (c - a) * p, dLon = (d - b) * p;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
}

function neighborHtml(r) {
    var pool, mode;
    if (r.lat) {
        pool = recs.filter(function (o) {
            return o.key !== r.key && o.lat && o.use === r.use;
        }).map(function (o) {
            return { o: o, d: haversine(r.lat, r.lng, o.lat, o.lng) };
        }).sort(function (x, y) { return x.d - y.d; }).slice(0, 6);
        mode = '동일 이용상황 · 최근접 6필지';
    } else {
        pool = recs.filter(function (o) { return o.key !== r.key && o.groupKey === r.groupKey; })
            .map(function (o) { return { o: o, d: null }; })
            .sort(function (x, y) { return Math.abs(x.o.price - r.price) - Math.abs(y.o.price - r.price); })
            .slice(0, 6);
        mode = r.dong + ' · ' + r.use + ' (좌표 없어 지가 근접순)';
    }
    if (!pool.length) return '<div class="hint">비교 가능한 인근 표준지가 없습니다.</div>';

    var rows = '<tr class="me"><td>' + esc(r.jibun || r.loc) + ' <b>(본건)</b></td><td>'
             + fmtWon(r.price) + '</td><td>' + fmtPct(r.calcChg, 1) + '</td><td>'
             + (r.r27 ? r.r27.toFixed(1) : '-') + '</td><td>-</td></tr>';
    pool.forEach(function (x) {
        rows += '<tr data-k="' + x.o.key + '"><td>' + esc(x.o.jibun || x.o.loc) + '</td><td>'
              + fmtWon(x.o.price) + '</td><td>' + fmtPct(x.o.calcChg, 1) + '</td><td>'
              + (x.o.r27 ? x.o.r27.toFixed(1) : '-') + '</td><td>'
              + (x.d === null ? '-' : (x.d < 1000 ? Math.round(x.d) + 'm' : (x.d / 1000).toFixed(1) + 'km'))
              + '</td></tr>';
    });
    return '<div class="hint" style="margin:0 0 2px">' + esc(mode) + '</div>'
        + '<table class="cmp"><thead><tr><th>소재지</th><th>공시지가</th><th>증감</th><th>반영률</th><th>거리</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>';
}

function wireCalc(r) {
    [['sim-pa', 'pa'], ['sim-pb', 'pb'], ['sim-mkt', 'mkt']].forEach(function (p) {
        var el = document.getElementById(p[0]);
        if (!el) return;
        el.oninput = function () {
            sim[p[1]] = +el.value;
            var base = +el.dataset.base;
            document.getElementById(p[0] + '-v').textContent =
                fmtWon(+el.value) + ' 원 (' + fmtPct((+el.value / base - 1) * 100, 1) + ')';
            updateSimOut();
        };
    });
    var mb = document.getElementById('btn-memo-save');
    if (mb) mb.onclick = function () {
        saveMemo(r.key, document.getElementById('memo-box').value.trim());
        mb.textContent = '저장됨 ✓';
        setTimeout(function () { mb.textContent = '메모 저장'; }, 1400);
    };
    var rb = document.getElementById('btn-sim-reset');
    if (rb) rb.onclick = function () { sim = { pa: r.pa, pb: r.pb, mkt: r.mkt }; renderCalc(); };
    var cb = document.getElementById('btn-copy');
    if (cb) cb.onclick = function () { copySummary(r, cb); };
    document.querySelectorAll('#calc-body .cmp tbody tr[data-k]').forEach(function (n) {
        n.onclick = function () { select(byKey[n.dataset.k], true); };
    });
}

/** 슬라이더 조작 시 수식 블록만 다시 계산 (전체 리렌더 대신 부분 갱신) */
function updateSimOut() {
    var r = selected;
    var sPrice = A.decidePrice(sim.pa, sim.pb);
    var sRatio = A.ratio(sPrice, sim.mkt);
    var sChg = A.changeRate(sPrice, r.prev);
    var sGap = A.gapRate(sim.pa, sim.pb);
    var boxes = document.querySelectorAll('#calc-body .formula');
    if (boxes.length < 3) return;

    // ① 결정 공시지가
    var f1 = boxes[0].querySelectorAll('.frow .fval');
    if (f1[0] && r.pa > 0) f1[0].textContent = fmtWon(sim.pa) + ' 원';
    if (f1[1] && r.pb > 0) f1[1].textContent = fmtWon(sim.pb) + ' 원';
    if (f1[2] && !r.singleGroup) f1[2].textContent = sGap.toFixed(2) + '%';
    boxes[0].querySelector('.fres .fval').innerHTML = fmtWon(sPrice) + '원'
        + (sPrice !== r.price ? '<span class="fdelta" style="color:'
            + (sPrice > r.price ? '#b32a2a' : '#1c5cab') + '">'
            + fmtPct((sPrice / r.price - 1) * 100, 2) + '</span>' : '');

    // ② 반영률
    boxes[1].querySelectorAll('.frow .fval')[0].innerHTML = fmtWon(sim.mkt) + ' 원';
    boxes[1].querySelector('.fres .fval').innerHTML = (sRatio ? sRatio.toFixed(2) + '%' : '-')
        + '<span class="fdelta" style="color:var(--ink-3)">\'26 ' + (r.r26 ? r.r26.toFixed(2) + '%' : '-') + '</span>';

    // ③ 증감률
    boxes[2].querySelectorAll('.frow .fval')[1].textContent = fmtWon(sPrice) + ' 원';
    var t = boxes[2].querySelector('.fres .fval');
    t.textContent = fmtPct(sChg, 1);
    t.style.color = sChg > 0 ? '#b32a2a' : (sChg < 0 ? '#1c5cab' : 'var(--ink-2)');
}

function copySummary(r, btn) {
    var lines = [
        '[' + REGION + ' ' + r.loc + ']',
        'PNU ' + r.pnu,
        '지목/면적: ' + r.jimok + ' ' + fmtArea(r.area) + ' · ' + (r.zone1 || '-') + ' · ' + (r.use || '-'),
        "'27 공시지가: " + fmtWon(r.price) + '원/㎡ (전년 ' + fmtWon(r.prev) + ', ' + fmtPct(r.calcChg, 1) + ')',
        'A조 ' + fmtWon(r.pa) + ' / B조 ' + fmtWon(r.pb) + ' → 결정 ' + fmtWon(r.calcPrice)
            + (r.singleGroup ? ' (단수조)' : ' (격차 ' + r.calcGap.toFixed(2) + '%)'),
        '시가수준 ' + fmtWon(r.mkt) + ' · 반영률 ' + (r.r27 ? r.r27.toFixed(2) + '%' : '-')
            + " ('26 " + (r.r26 ? r.r26.toFixed(2) + '%' : '-') + ')',
        '검수: ' + (r.flags.length ? r.flags.map(function (f) { return f.text; }).join(' / ') : '이상 없음')
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(function () {
        btn.textContent = '복사됨 ✓';
        setTimeout(function () { btn.textContent = '필지 요약 복사'; }, 1400);
    });
}

/* ============================================================
   9. 통계 패널
   ============================================================ */
function renderStats() {
    var s = A.summarize(filtered);
    var el = document.getElementById('stats-body');
    function tile(lab, val, sub) {
        return '<div class="tile"><div class="t-lab">' + lab + '</div><div class="t-val">' + val
             + '</div><div class="t-sub">' + (sub || '') + '</div></div>';
    }
    var h = '<div class="tiles">'
        + tile('필지 수', s.n.toLocaleString('ko-KR'), '좌표 ' + s.geo.toLocaleString('ko-KR') + '건')
        + tile('검수 대상', s.flagged.toLocaleString('ko-KR'), s.n ? (100 * s.flagged / s.n).toFixed(1) + '%' : '')
        + tile('중위 공시지가', fmtShort(s.median) + '원', 'Q1 ' + fmtShort(s.q1) + ' · Q3 ' + fmtShort(s.q3))
        + tile('면적가중 평균', fmtShort(s.wAvg) + '원', '총 ' + fmtShort(s.areaSum) + '㎡')
        + tile('중위 증감률', fmtPct(s.chgMedian, 1), '평균 ' + fmtPct(s.chgMean, 2))
        + tile('중위 반영률', s.ratioMedian.toFixed(2) + '%', "'27 기준")
        + '</div>';

    h += '<div class="sec"><div class="sec-h">공시지가 분포 (로그 구간)</div>';
    var hist = A.histogram(s.prices, 22);
    var mx = Math.max.apply(null, hist.bins.concat([1]));
    h += '<div class="hist">' + hist.bins.map(function (b) {
        return '<div class="hb" style="height:' + Math.max(2, 100 * b / mx) + '%" title="' + b + '건"></div>';
    }).join('') + '</div>';
    h += '<div class="hist-axis"><span>' + fmtShort(hist.min) + '원</span><span>'
       + fmtShort(hist.max) + '원</span></div></div>';

    /* 읍·면별 요약 */
    var g = {};
    filtered.forEach(function (r) {
        var k = eupOf(r);
        (g[k] || (g[k] = [])).push(r);
    });
    var keys = Object.keys(g).sort();
    h += '<div class="sec"><div class="sec-h">읍·면별 요약</div>'
       + '<table class="cmp"><thead><tr><th>읍·면</th><th>필지</th><th>중위지가</th><th>중위증감</th><th>검수</th></tr></thead><tbody>';
    keys.forEach(function (k) {
        var t = A.summarize(g[k]);
        h += '<tr><td>' + esc(k) + '</td><td>' + t.n + '</td><td>' + fmtShort(t.median)
           + '</td><td>' + fmtPct(t.chgMedian, 1) + '</td><td>' + t.flagged + '</td></tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="btn-line"><button id="btn-csv" class="primary">⬇ 현재 필터 CSV 내보내기</button></div>';
    el.innerHTML = h;
    document.getElementById('btn-csv').onclick = function () { exportCsv(filtered, '공시지가_필터'); };
}

/* ============================================================
   10. 검수 패널
   ============================================================ */
function renderAudit() {
    var list = filtered.filter(function (r) { return r.flagged; })
        .sort(function (a, b) { return b.auditScore - a.auditScore; });
    document.getElementById('audit-count').textContent = list.length.toLocaleString('ko-KR') + '건';
    var el = document.getElementById('audit-list');
    if (!list.length) {
        el.innerHTML = '<div class="hint">현재 임계값에서 검수 대상이 없습니다.</div>';
        return;
    }
    el.innerHTML = list.slice(0, 120).map(function (r) {
        return '<div class="audit-item" data-k="' + r.key + '">'
            + '<div class="a-top"><span class="a-name">' + esc(r.loc) + '</span>'
            + '<span class="a-score">' + r.auditScore + '점</span></div>'
            + '<div class="a-reasons">' + r.flags.map(function (f) {
                  return '· ' + esc(f.text);
              }).join('<br>') + '</div></div>';
    }).join('') + (list.length > 120 ? '<div class="hint">상위 120건만 표시 (전체 ' + list.length + '건)</div>' : '');
    el.querySelectorAll('.audit-item').forEach(function (n) {
        n.onclick = function () { select(byKey[n.dataset.k], true); };
    });
}

/* ============================================================
   11. CSV
   ============================================================ */
function exportCsv(list, name) {
    var cols = [
        ['소재지', function (r) { return r.loc; }],
        ['PNU', function (r) { return r.pnu; }],
        ['도로명주소', function (r) { return r.road; }],
        ['위도', function (r) { return r.lat || ''; }],
        ['경도', function (r) { return r.lng || ''; }],
        ['지목', function (r) { return r.jimok; }],
        ['면적', function (r) { return r.area; }],
        ['용도지역', function (r) { return r.zone1; }],
        ['이용상황', function (r) { return r.use; }],
        ["'27공시지가", function (r) { return r.price; }],
        ["'26공시지가", function (r) { return r.prev; }],
        ['증감률', function (r) { return r.calcChg; }],
        ['A조', function (r) { return r.pa; }],
        ['B조', function (r) { return r.pb; }],
        ['결정가격(재산정)', function (r) { return r.calcPrice; }],
        ['격차율', function (r) { return r.singleGroup ? '' : r.calcGap; }],
        ['시가수준', function (r) { return r.mkt; }],
        ["'27반영률", function (r) { return r.r27; }],
        ["'26반영률", function (r) { return r.r26; }],
        ['균형성편차σ', function (r) { return r.zdev; }],
        ['검수점수', function (r) { return r.auditScore; }],
        ['검수사유', function (r) { return r.flags.map(function (f) { return f.text; }).join(' | '); }],
        ['메모', function (r) { return memos[r.key] || ''; }]
    ];
    var q = function (v) {
        v = (v === null || v === undefined) ? '' : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var csv = cols.map(function (c) { return c[0]; }).join(',') + '\n'
        + list.map(function (r) {
            return cols.map(function (c) { return q(c[1](r)); }).join(',');
        }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ============================================================
   12. 지오코딩 UI
   ============================================================ */
function setStatus(cls, msg) {
    var el = document.getElementById('geo-status');
    el.className = 'sync-status ' + cls;
    el.textContent = msg;
}

function geoSummary() {
    var n = recs.filter(function (r) { return r.lat; }).length;
    if (n === recs.length) setStatus('ok', '✓ 좌표 ' + n.toLocaleString('ko-KR') + '건 전부 확보');
    else if (n === 0) setStatus('pending', '좌표 0건 — [📍 좌표 변환]을 한 번 실행하세요 (약 2~4분)');
    else setStatus('pending', '좌표 ' + n.toLocaleString('ko-KR') + ' / '
        + recs.length.toLocaleString('ko-KR') + '건 · 미확보 '
        + (recs.length - n).toLocaleString('ko-KR') + '건');
}

function wireGeo() {
    var bRun = document.getElementById('btn-geo-run');
    var bStop = document.getElementById('btn-geo-stop');
    var bExp = document.getElementById('btn-geo-export');
    var prog = document.getElementById('geo-progress');
    var bar = prog.querySelector('i');

    bRun.onclick = function () {
        bRun.disabled = true; bStop.disabled = false; prog.classList.add('on');
        window.Geo.run({
            records: recs, region: REGION,
            onProgress: function (done, total) {
                bar.style.width = (100 * done / total) + '%';
                setStatus('pending', '📍 변환 중 ' + done.toLocaleString('ko-KR') + ' / '
                    + total.toLocaleString('ko-KR'));
                if (done % 40 === 0) { applyFilter(); }
            },
            onDone: function (s) {
                bRun.disabled = false; bStop.disabled = true; prog.classList.remove('on');
                applyFilter();
                geoSummary();
                if (s.ok) {
                    setStatus('ok', '✓ ' + s.ok + '건 변환' + (s.fail ? ' · 실패 ' + s.fail + '건' : '')
                        + ' — [⬇ coords.js 저장]으로 data/coords.js를 교체하세요');
                    fitToData();
                }
            },
            onError: function (err) {
                bRun.disabled = false; bStop.disabled = true; prog.classList.remove('on');
                setStatus('err', '⚠ ' + err.message);
            }
        });
    };
    bStop.onclick = function () { window.Geo.stop(); };

    /* 좌표 CSV 가져오기 — 카카오 키를 못 쓰는 환경의 대체 경로 */
    var file = document.getElementById('geo-file');
    document.getElementById('btn-geo-import').onclick = function () { file.click(); };
    file.onchange = function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
            var res = window.Geo.importCsv(String(fr.result), recs);
            file.value = '';
            applyFilter();
            if (res.matched) {
                setStatus('ok', '✓ CSV에서 ' + res.matched.toLocaleString('ko-KR') + '건 좌표 적용'
                    + (res.unmatched ? ' · PNU 불일치 ' + res.unmatched + '건' : ''));
                fitToData();
            } else {
                setStatus('err', '⚠ 적용된 좌표가 없습니다 (읽은 행 ' + res.rows
                    + '건). PNU·위도·경도 열을 확인하세요.');
            }
        };
        fr.readAsText(f, 'utf-8');
    };
    bExp.onclick = function () {
        var n = recs.filter(function (r) { return r.lat; }).length;
        if (!n) { setStatus('err', '⚠ 저장할 좌표가 없습니다. 먼저 좌표 변환을 실행하세요.'); return; }
        setStatus('pending', '💾 저장 중…');
        // 로컬 개발서버면 data/coords.js 를 바로 덮어쓰고, 아니면 다운로드로 넘어간다
        window.Geo.saveToServer(recs).then(function (bytes) {
            setStatus('ok', '✓ data/coords.js 저장됨 (' + n.toLocaleString('ko-KR') + '건, '
                + Math.round(bytes / 1024) + 'KB) — 커밋하면 배포본에 반영됩니다');
        }).catch(function () {
            window.Geo.download(recs);
            setStatus('ok', '⬇ coords.js 내려받음 (' + n.toLocaleString('ko-KR')
                + '건) — data/ 폴더에 덮어쓰세요');
        });
    };
}

/* 지도 컨테이너가 아직 0×0 인 동안 fitBounds 를 호출하면 최대 줌으로 튄다.
   요청을 보류했다가 실제 크기가 잡히면(ResizeObserver) 그때 맞춘다. */
var pendingFit = false;

function fitToData() {
    pendingFit = true;
    tryFit();
    // 탭이 백그라운드이거나 레이아웃이 늦게 잡히면 컨테이너가 한동안 0×0 으로 읽힌다.
    // requestAnimationFrame 은 숨은 탭에서 멈추므로 타이머로 최대 10초간 재시도한다.
    var tries = 0;
    (function retry() {
        if (!pendingFit || tries++ > 100) return;
        tryFit();
        if (pendingFit) setTimeout(retry, 100);
    })();
}

function tryFit() {
    if (!pendingFit) return;
    map.invalidateSize(false);
    var s = map.getSize();
    if (!s.x || !s.y) return;              // 레이아웃 전 — 다음 기회에
    var pts = recs.filter(function (r) { return r.lat; }).map(function (r) { return [r.lat, r.lng]; });
    if (!pts.length) { pendingFit = false; return; }
    map.fitBounds(pts, { padding: [40, 40] });
    pendingFit = false;
}

if (window.ResizeObserver) {
    new ResizeObserver(function () {
        map.invalidateSize(false);
        tryFit();
    }).observe(document.getElementById('map'));
}

/* ============================================================
   13. UI 배선
   ============================================================ */
function esc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chipRow(containerId, items, setRef) {
    var el = document.getElementById(containerId);
    el.innerHTML = items.map(function (it) {
        return '<span class="chip" data-v="' + esc(it.v) + '">' + esc(it.v)
             + '<span class="cnt">' + it.n + '</span></span>';
    }).join('');
    el.querySelectorAll('.chip').forEach(function (n) {
        n.onclick = function () {
            var v = n.dataset.v;
            if (setRef.has(v)) { setRef.delete(v); n.classList.remove('active'); }
            else { setRef.add(v); n.classList.add('active'); }
            state.listCap = 200;
            applyFilter();
        };
    });
}

function fillSelect(id, items, placeholder) {
    var el = document.getElementById(id);
    el.innerHTML = '<option value="">' + placeholder + '</option>'
        + items.map(function (it) {
            return '<option value="' + esc(it.v) + '">' + esc(it.v) + ' (' + it.n + ')</option>';
        }).join('');
}

function show(id, on) {
    var el = document.getElementById(id);
    el.classList.toggle('visible', on === undefined ? !el.classList.contains('visible') : on);
    var btn = { 'calc-float': 'btn-calc', 'audit-float': 'btn-audit', 'stats-float': 'btn-stats' }[id];
    if (btn) document.getElementById(btn).classList.toggle('on', el.classList.contains('visible'));
    // 패널은 한 번에 하나만
    if (el.classList.contains('visible')) {
        ['calc-float', 'audit-float', 'stats-float'].forEach(function (o) {
            if (o !== id) show(o, false);
        });
    }
}

function closePanel() {
    document.getElementById('side-panel').classList.remove('open');
    document.getElementById('panel-overlay').classList.remove('on');
}

/* ============================================================
   13-a. 카카오 배경지도
   ============================================================ */
function initBaseMap() {
    var ctl = document.getElementById('basemap-ctl');

    KakaoBase.ready(function (err) {
        if (err) {
            // 배경지도가 없어도 마커·산정·검수는 그대로 쓸 수 있어야 한다
            document.getElementById('kakao-map').style.background = '#e8edf2';
            ctl.style.display = 'none';
            setStatus('err', '⚠ ' + err.message);
            return;
        }

        // 줌 범위(카카오 레벨 1~14)는 kakao_base 가 보정 후 직접 반영한다
        kbase = KakaoBase.init(map, { lat: 35.72, mapTypeId: 'ROADMAP' });

        ctl.querySelectorAll('button[data-type]').forEach(function (b) {
            b.onclick = function () {
                ctl.querySelectorAll('button[data-type]').forEach(function (o) {
                    o.classList.toggle('on', o === b);
                });
                kbase.setMapType(b.dataset.type);
            };
        });
        var bd = document.getElementById('btn-district');
        bd.onclick = function () { bd.classList.toggle('on', kbase.setDistrict(!kbase.districtOn())); };
    });
}

function init() {
    document.getElementById('hdr-region').textContent = REGION + ' 표준지 · 공시지가 검토 GIS';

    /* 읍·면 칩 */
    var eupMap = {};
    recs.forEach(function (r) { var k = eupOf(r); eupMap[k] = (eupMap[k] || 0) + 1; });
    chipRow('f-eup', Object.keys(eupMap).sort().map(function (k) { return { v: k, n: eupMap[k] }; }), state.eup);
    chipRow('f-use', uniq('use').slice(0, 12), state.use);
    fillSelect('f-jimok', uniq('jimok'), '지목 전체');
    fillSelect('f-zone', uniq('zone1'), '용도지역 전체');

    document.getElementById('f-jimok').onchange = function () { state.jimok = this.value; state.listCap = 200; applyFilter(); };
    document.getElementById('f-zone').onchange = function () { state.zone = this.value; state.listCap = 200; applyFilter(); };
    document.getElementById('f-metric').onchange = function () { state.metric = this.value; applyFilter(); };
    document.getElementById('f-label').onchange = function () { state.showLabel = this.checked; renderMarkers(); };
    document.getElementById('f-flagged').onchange = function () { state.flaggedOnly = this.checked; state.listCap = 200; applyFilter(); };
    document.getElementById('f-nogeo').onchange = function () { state.noGeoOnly = this.checked; state.listCap = 200; applyFilter(); };

    var qi = document.getElementById('f-search'), qt;
    qi.oninput = function () {
        clearTimeout(qt);
        qt = setTimeout(function () { state.q = qi.value; state.listCap = 200; applyFilter(); }, 180);
    };

    /* 툴바 */
    document.getElementById('btn-calc').onclick = function () { show('calc-float'); };
    document.getElementById('btn-audit').onclick = function () { show('audit-float'); };
    document.getElementById('btn-stats').onclick = function () { show('stats-float'); };
    document.getElementById('btn-heat').onclick = function () {
        heatOn = !heatOn;
        this.classList.toggle('on', heatOn);
        if (!heatOn && heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
        else renderHeat();
    };
    document.querySelectorAll('[data-close]').forEach(function (b) {
        b.onclick = function () { show(b.dataset.close, false); };
    });

    /* 검수 임계값 */
    [['th-resid', 'resid', 'v-th-resid', '%', 1], ['th-gap', 'gap', 'v-th-gap', '%', 1],
     ['th-chg', 'chg', 'v-th-chg', '%', 1], ['th-z', 'z', 'v-th-z', 'σ', 1]].forEach(function (p) {
        var el = document.getElementById(p[0]);
        el.oninput = function () {
            TH[p[1]] = +el.value;
            document.getElementById(p[2]).textContent = (+el.value).toFixed(p[4]) + p[3];
            A.applyAudit(recs, TH);
            applyFilter();
        };
    });
    document.getElementById('btn-audit-csv').onclick = function () {
        exportCsv(filtered.filter(function (r) { return r.flagged; })
            .sort(function (a, b) { return b.auditScore - a.auditScore; }), '공시지가_검수목록');
    };
    document.getElementById('btn-audit-focus').onclick = function () {
        var cb = document.getElementById('f-flagged');
        cb.checked = !cb.checked; state.flaggedOnly = cb.checked; applyFilter();
        this.textContent = cb.checked ? '전체 다시 보기' : '지도에 검수대상만';
    };

    /* 모바일 */
    document.getElementById('mobile-toggle').onclick = function () {
        document.getElementById('side-panel').classList.add('open');
        document.getElementById('panel-overlay').classList.add('on');
    };
    document.getElementById('panel-overlay').onclick = closePanel;

    /* 줌이 바뀌면 마커 반경·라벨·외곽선을 모두 다시,
       이동만 했으면 화면 겹침에 따라 라벨과 외곽선만 다시 계산한다. */
    map.on('zoomend', renderMarkers);
    map.on('moveend', function () { renderLabels(); renderShape(); });

    /* 폰트·레이아웃이 늦게 확정되는 경우 대비 */
    window.addEventListener('load', function () {
        map.invalidateSize(false);
        if (kbase) kbase.relayout();
    });

    wireGeo();
    geoSummary();
    applyFilter();
    initBaseMap();

    if (recs.some(function (r) { return r.lat; })) fitToData();
}

init();

/* 콘솔 디버그 훅 — 브라우저 콘솔에서 데이터·지도를 직접 조회할 때 사용
   예) __gis.recs.filter(r => r.flagged).length */
window.__gis = {
    map: map, recs: recs, byKey: byKey, state: state,
    kbase: function () { return kbase; },
    filtered: function () { return filtered; },
    select: select, refresh: applyFilter, fit: fitToData
};

})();
