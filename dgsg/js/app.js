/* ============================================================
   app.js — 동경상경빌딩 평가자료 지도
   ============================================================ */
(function () {
'use strict';

/* ---------- 데이터 ---------- */

var recs = [];
SUBJECT_LOTS.forEach(function (r) { recs.push(r); });
STD_LOTS.forEach(function (r) { recs.push(r); });
ITEMS.forEach(function (r) { recs.push(r); });
AFTER_ITEMS.forEach(function (r) {
    // 종후 본건은 종전 본건과 같은 자리라 구분해 둔다
    if (r.subject) r.t = 'afterSubject';
    recs.push(r);
});
if (typeof RENT_ITEMS !== 'undefined') RENT_ITEMS.forEach(function (r) { recs.push(r); });
if (typeof LAND_ITEMS !== 'undefined') LAND_ITEMS.forEach(function (r) { recs.push(r); });

/* 최종 비준표 번호·명칭 적용. 번호가 없는 건(S1310)은 최종표에서 빠진 사례다. */
(function () {
    if (typeof COMP_ORDER === 'undefined') return;
    var byName = {};
    COMP_ORDER.forEach(function (c) { byName[c[0]] = { no: c[1], rename: c[2] }; });
    recs.forEach(function (r) {
        if (r.t !== 'after') return;
        var m = byName[r.name];
        if (!m) { r.compNo = null; return; }
        r.compNo = m.no;
        if (m.rename) { r.aka = r.name; r.name = m.rename; }
    });
})();

recs.forEach(function (r, i) {
    r.id = i;
    r.label = r.name || (r.dong ? r.dong + ' ' + r.jibun : r.loc);
    r.key = r.addr;
});

var TYPES = {
    subject:      { label: '본건',       color: '#d03b3b' },
    std:          { label: '표준지',     color: '#1baf7a' },
    sale:         { label: '거래사례',   color: '#2a78d6' },
    rent:         { label: '임대사례',   color: '#eb6834' },
    afterSubject: { label: '본건 종후',  color: '#d03b3b' },
    after:        { label: '비준사례',   color: '#4a3aa7' },
    rentcase:     { label: '임대사례',   color: '#0f9b8e' },
    landcase:     { label: '토지사례',   color: '#c2410c' }
};

/* 종전(토지단가 기준)과 종후(연면적단가 기준)는 비교 축이 달라 화면을 나눈다 */
var MODES = {
    before: {
        layers: ['subject', 'std', 'sale', 'rent'],
        metrics: [['type', '구분 (본건·표준지·거래·임대)'],
                  ['landUnit', '토지단가 · 공시지가 (㎡ 기준)'],
                  ['eqRent', '환산임대료 (원/평)'],
                  ['age', '사용승인 경과']]
    },
    after: {
        layers: ['afterSubject', 'after'],
        metrics: [['type', '구분 (본건 종후·비준사례)'],
                  ['unitPy', '거래단가 (원/평 연면적)'],
                  ['cap', 'Cap Rate (%)'],
                  ['noc', 'NOC (원/전용평)'],
                  ['far', '용적률 (%)'],
                  ['age', '사용승인 경과']]
    },
    /* 위치도 — 보고서용. 비준표 11건 + 본건만, 구분과 거래단가만 표기한다. */
    locmap: {
        layers: ['afterSubject', 'after', 'rentcase'],
        compOnly: true,
        metrics: [['type', '구분 (본건·거래사례)'],
                  ['unitPy', '거래단가 (원/평)']]
    },
    landmap: {
        layers: ['afterSubject', 'landcase'],
        metrics: [['type', '구분 (본건·토지사례)'],
                  ['unitM2', '토지단가 (원/㎡)']]
    }
};
/** 지도형 위치도(종후 위치도 · 토지위치도) 공통 판정 — 핀·지시선·드래그 라벨을 쓴다 */
function isLocMode(m) { m = m || state.mode; return m === 'locmap' || m === 'landmap'; }

var SEQ = ['#9ec5f4', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

/* 본건 결정단가 — 비교 기준 */
var SUBJ_UNIT = Math.round(
    SUBJECT_LOTS.reduce(function (s, r) { return s + r.unit * r.area; }, 0) /
    SUBJECT_LOTS.reduce(function (s, r) { return s + r.area; }, 0)
);
var SUBJ_RENT = 260000;   // 본건 환산임대료 (임대사례 시트)

/* ---------- 좌표 ---------- */

var CACHE_KEY = 'dgsg.coords.v1';

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

function hydrate() {
    var stat = window.ADDR_COORDS || {}, cache = loadCache(), n = 0;
    recs.forEach(function (r) {
        var c = cache[r.key] || stat[r.key];
        if (c && c.length >= 2) { r.lat = c[0]; r.lng = c[1]; n++; }
        else { r.lat = null; r.lng = null; }
    });
    return n;
}

/* ---------- 상태 ---------- */

var state = {
    mode: 'before',
    layers: new Set(MODES.before.layers),
    metric: 'type', showLabel: true, showRadius: false
};
var selected = null, filtered = [];

/* ---------- 지도 ---------- */

var map = L.map('map', {
    zoomControl: true, preferCanvas: true,
    zoomSnap: 0, zoomDelta: 1, zoomAnimation: false, attributionControl: false
}).setView([37.4996, 127.0365], 15);   // 역삼동 824 일원

var kbase = null;
var shapeLayer = L.layerGroup().addTo(map);
var markerLayer = L.layerGroup().addTo(map);
var labelLayer = L.layerGroup().addTo(map);

/* ---------- 색상 ---------- */

var scale = { type: 'cat' };

function buildScale() {
    var m = state.metric;
    if (m === 'type') { scale = { type: 'cat' }; return; }
    var vals = filtered.map(valueOf).filter(function (v) { return v !== null && isFinite(v) && v > 0; })
                       .sort(function (a, b) { return a - b; });
    if (!vals.length) { scale = { type: 'cat' }; return; }
    function q(p) {
        var pos = (vals.length - 1) * p, b = Math.floor(pos), rest = pos - b;
        return vals[b + 1] !== undefined ? vals[b] + rest * (vals[b + 1] - vals[b]) : vals[b];
    }
    scale = { type: 'seq', breaks: [q(.2), q(.4), q(.6), q(.8)], colors: SEQ };
}

/** 선택한 지표의 값 (해당 없으면 null) */
function valueOf(r) {
    switch (state.metric) {
        case 'landUnit':
            return (r.t === 'sale') ? r.landUnit : (r.t === 'subject' ? r.unit : (r.t === 'std' ? r.gongsi : null));
        case 'eqRent':
            return (r.t === 'rent') ? r.eqRent : null;
        case 'unitPy':
            return (r.t === 'after' || r.t === 'afterSubject') ? r.unitPy : null;
        case 'cap':
            return (r.t === 'after') ? r.cap : null;
        case 'noc':
            return (r.t === 'after' || r.t === 'afterSubject') ? r.noc : null;
        case 'far':
            return (r.t === 'after' || r.t === 'afterSubject') ? r.far : null;
        case 'age':
            if (!r.appr || r.appr.length < 4) return null;
            var y = Number(r.appr.slice(0, 4));
            return y > 2026 ? null : 2026 - y;     // 종후(2032)는 해당 없음
        default: return null;
    }
}

function colorOf(r) {
    if (scale.type === 'cat') return TYPES[r.t].color;
    var v = valueOf(r);
    if (v === null || !isFinite(v) || v <= 0) return '#cbd5e0';
    for (var i = 0; i < scale.breaks.length; i++) if (v < scale.breaks[i]) return scale.colors[i];
    return scale.colors[scale.breaks.length];
}

function radiusOf(r) {
    var isSubj = (r.t === 'subject' || r.t === 'afterSubject');
    var base = isSubj ? 10 : (r.t === 'std' ? 7 : 6);
    if (map.getZoom() <= 14) base *= .75;
    return (selected && selected.id === r.id) ? base + 3 : base;
}

/* ---------- 포맷 ---------- */

function won(x) {
    if (!isFinite(x) || !x) return '-';
    return Math.round(x).toLocaleString('ko-KR');
}
function eok(x) {
    if (!isFinite(x) || !x) return '-';
    if (x >= 1e12) return (x / 1e12).toFixed(2) + '조';
    if (x >= 1e8) return Math.round(x / 1e8).toLocaleString('ko-KR') + '억';
    return won(x);
}
function man(x) {
    if (!isFinite(x) || !x) return '-';
    if (x >= 1e8) return (x / 1e8).toFixed(2) + '억';
    if (x >= 1e4) return Math.round(x / 1e4).toLocaleString('ko-KR') + '만';
    return won(x);
}
function m2(x) {
    if (!isFinite(x) || !x) return '-';
    return x.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '㎡';
}
function pyeong(x) { return x ? (x / 3.305785).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '평' : '-'; }

/* 단가 ㎡ → 평 환산 (1평 = 3.305785㎡).
   표준지 공시지가는 법정 단위가 ㎡ 라 환산하지 않는다 — 거래단가·결정단가만 평으로 쓴다. */
var PY = 3.305785;
function toPy(x) { return (x > 0) ? Math.round(x * PY) : 0; }
function wonPy(x) { return won(toPy(x)); }
function pct(x, d) {
    if (!isFinite(x)) return '-';
    return (x > 0 ? '+' : '') + x.toFixed(d === undefined ? 1 : d) + '%';
}
function esc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- 필터 ---------- */

function applyFilter() {
    filtered = recs.filter(function (r) {
        if (!state.layers.has(r.t)) return false;
        // 위치도는 최종 비준표에 든 사례만 쓴다
        if (MODES[state.mode].compOnly && r.t === 'after' && !r.compNo) return false;
        return true;
    });
    buildScale();
    renderAll();
}

/* ---------- 렌더 ---------- */

function renderAll() {
    renderMarkers();
    renderList();
    renderLegend();
    renderCompare();
}

function renderMarkers() {
    markerLayer.clearLayers();
    shapeLayer.clearLayers();

    if (state.showRadius) {
        SUBJECT_LOTS.forEach(function (r) {
            if (!r.lat) return;
            shapeLayer.addLayer(L.circle([r.lat, r.lng], {
                radius: 500, color: '#d03b3b', weight: 1.5, opacity: .6,
                fillColor: '#d03b3b', fillOpacity: .05, dashArray: '5,5'
            }));
        });
    }

    /* 위치도는 지점에 번호 마커를 세운다. 라벨이 비켜 있어도
       어느 지점의 사례인지 마커만 보고 알 수 있어야 한다. */
    if (isLocMode()) {
        filtered.filter(function (r) { return r.lat; }).forEach(function (r) {
            var isSubj = (r.t === 'afterSubject');
            var isSel  = selected && selected.id === r.id;
            var isRent = (r.t === 'rentcase');
            var isLand = (r.t === 'landcase');

            var txt = isSubj ? '본' : (isRent ? 'R' + r.rentNo : (isLand ? r.landNo : r.compNo));
            var html = '<div class="loc-pin' + (isSubj ? ' subj' : '')
                     + (isRent ? ' rent' : '') + (isLand ? ' land' : '')
                     + (isLand && r.kind === '거래' ? ' deal' : '')
                     + (isSel ? ' sel' : '') + '">' + txt + '</div>';
            var mk = L.marker([r.lat, r.lng], {
                icon: L.divIcon({ className: 'pin-wrap', html: html,
                                  iconSize: [26, 26], iconAnchor: [13, 13] }),
                zIndexOffset: isSubj ? 800 : 500
            });
            mk.on('click', function () { select(r); });
            mk.bindTooltip(tipOf(r), { direction: 'top', offset: [0, -10] });
            markerLayer.addLayer(mk);
        });
        renderLabels();
        return;
    }

    filtered.filter(function (r) { return r.lat; }).forEach(function (r) {
        var isSel = selected && selected.id === r.id;
        var mk = L.circleMarker([r.lat, r.lng], {
            radius: radiusOf(r), fillColor: colorOf(r), fillOpacity: .9,
            color: isSel ? '#111' : '#fff', weight: r.t === 'subject' ? 3 : 2, opacity: 1
        });
        mk.on('click', function () { select(r); });
        mk.bindTooltip(tipOf(r), { direction: 'top', offset: [0, -4] });
        markerLayer.addLayer(mk);
    });

    renderLabels();
}

function tipOf(r) {
    var h = '<b>' + esc(r.label) + '</b> <span style="color:' + TYPES[r.t].color + '">■</span> '
          + TYPES[r.t].label + '<br>';
    if (r.t === 'sale') h += '토지단가 ' + wonPy(r.landUnit) + '원/평 · ' + r.date;
    else if (r.t === 'rent') h += '환산임대료 ' + won(r.eqRent) + '원/평 · 공실 ' + r.vacancy + '%';
    else if (r.t === 'std') h += '공시지가 ' + won(r.gongsi) + '원/㎡';
    else if (r.t === 'after') h += '연면적단가 ' + won(r.unitPy) + '원/평 · Cap ' + r.cap + '% · ' + r.date;
    else if (r.t === 'afterSubject') h += '연면적단가 ' + won(r.unitPy) + '원/평 · ' + m2(r.grossArea);
    else h += '결정단가 ' + wonPy(r.unit) + '원/평 · ' + m2(r.area);
    return h;
}

/* 라벨 — 화면에서 겹치는 것은 버린다 */
var LBL_W = 158, LBL_H = 74, LBL_OFF = 13, LBL_PAD = 3;

/** 모드별 라벨 크기 (CSS 와 반드시 같아야 겹침 계산이 맞는다) */
function labelBox() {
    if (isLocMode()) return { w: 146, h: 68 };
    return { w: LBL_W, h: LBL_H };
}

/** 두 선분이 교차하는가 (끝점만 닿는 경우는 제외) */
function segCross(a, b, c, d) {
    function o(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
    var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** 선분이 사각형을 지나는가 */
function segHitsBox(a, b, r) {
    var c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
             { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    for (var i = 0; i < 4; i++) if (segCross(a, b, c[i], c[(i + 1) % 4])) return true;
    return false;
}

function labelHtml(r, isSel) {
    var c = colorOf(r), T = TYPES[r.t];
    var head, val, unit, meta;

    /* 위치도 — 보고서 삽입용. 거래사례는 구분·단가·빌딩명, 임대사례는 NOC·임대료 */

    if (isLocMode()) {
        var isSubj = (r.t === 'afterSubject');

        /* 토지사례 — 토지 감정평가용이라 기호·토지단가·기준시점만 남긴다 */
        if (r.t === 'landcase') {
            var isDeal = (r.kind === '거래');
            return '<div class="loc-label land' + (isDeal ? ' deal' : '')
                 + (isSel ? ' sel' : '') + '">'
                 + '<div class="ll-no">기호 ' + r.landNo + ' · ' + r.kind + '사례</div>'
                 + '<div class="ll-val">' + won(r.unitM2) + '<span>원/㎡</span></div>'
                 + '<div class="ll-nm">' + r.date.replace(/-/g, '.') + '</div></div>';
        }

        /* 임대사례 — NOC 와 월임대료만. 분모가 달라 단위를 각각 붙인다. */
        if (r.t === 'rentcase') {
            return '<div class="loc-label rent' + (isSel ? ' sel' : '') + '">'
                 + '<div class="ll-no">R' + r.rentNo + ' ' + r.name + '</div>'
                 + '<div class="ll-val">' + won(r.noc) + '<span>원/전용평</span></div>'
                 + '<div class="ll-sub">' + won(r.rent) + '<span>원/임대평</span></div></div>';
        }

        var gubun  = isSubj ? '본 건' : '거래사례 #' + r.compNo;
        var price  = isSubj ? '-' : won(r.unitPy) + '<span>원/평</span>';
        var nm     = isSubj ? '' : (r.name || '');
        return '<div class="loc-label' + (isSel ? ' sel' : '') + (isSubj ? ' subj' : '') + '">'
             + '<div class="ll-no">' + gubun + '</div>'
             + '<div class="ll-val">' + price + '</div>'
             + (nm ? '<div class="ll-nm" title="' + nm + '">' + nm + '</div>' : '')
             + '</div>';
    }

    if (r.t === 'sale') {
        head = '거래 · ' + r.date.slice(2, 7).replace('-', '.');
        val = wonPy(r.landUnit); unit = '원/평';
        meta = m2(r.landArea) + ' · ' + eok(r.amount);
    } else if (r.t === 'rent') {
        head = '임대' + (r.subject ? ' · 본건' : '') + (r.vacancy ? ' · 공실 ' + r.vacancy + '%' : '');
        val = won(r.eqRent); unit = '원/평';
        meta = m2(r.area) + ' · ' + (r.appr ? r.appr.slice(0, 4) + '년' : '-');
    } else if (r.t === 'std') {
        head = '표준지 · ' + r.year;
        val = won(r.gongsi); unit = '원/㎡';
        meta = m2(r.area) + ' · ' + esc(r.use);
    } else if (r.t === 'after') {
        head = '비준 · ' + (r.date !== '-' ? r.date.slice(2, 7).replace('-', '.') : '')
             + (r.cap ? ' · Cap ' + r.cap + '%' : '');
        val = won(r.unitPy); unit = '원/평';
        meta = Math.round(r.grossPy).toLocaleString('ko-KR') + '평 · ' + esc(r.scale);
    } else if (r.t === 'afterSubject') {
        head = '본건 종후 · ' + AFTER_SUMMARY.base.slice(0, 4);
        val = won(r.unitPy); unit = '원/평';
        meta = Math.round(r.grossPy).toLocaleString('ko-KR') + '평 · ' + esc(r.scale);
    } else {
        head = '본건 · ' + esc(r.name);
        val = wonPy(r.unit); unit = '원/평';
        meta = m2(r.area) + ' · ' + eok(r.value);
    }
    return '<div class="sum-label' + (isSel ? ' sel' : '') + '" style="--c:' + c + ';">'
        + '<div class="sl-head">' + head + '</div>'
        + '<div class="sl-body">'
        + '<div class="sl-name">' + esc(r.label) + '</div>'
        + '<div class="sl-val">' + val + '<span>' + unit + '</span></div>'
        + '<div class="sl-meta">' + meta + '</div>'
        + '</div></div>';
}

function overlaps(b, list) {
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (b.x < o.x + o.w + LBL_PAD && b.x + b.w + LBL_PAD > o.x &&
            b.y < o.y + o.h + LBL_PAD && b.y + b.h + LBL_PAD > o.y) return true;
    }
    return false;
}

function renderLabels() {
    labelLayer.clearLayers();
    if (!state.showLabel) return;
    var size = map.getSize();
    if (!size.x || !size.y) return;

    // 본건 → 선택 → 나머지 순으로 자리를 준다
    function rank(r) {
        if (selected && selected.id === r.id) return 3;
        if (r.t === 'subject' || r.t === 'afterSubject') return 2;
        if (r.t === 'std') return 1;
        return 0;
    }
    var order = filtered.filter(function (r) { return r.lat; }).slice().sort(function (a, b) {
        return rank(b) - rank(a);
    });

    var B = labelBox(), placed = [], loc = (isLocMode());

    /* 위치도는 24건이 모두 보여야 하므로, 겹치면 버리지 않고 자리를 옮긴 뒤
       지시선으로 원래 지점과 이어 준다. 가까운 자리부터 차례로 시도한다. */
    /* 바깥쪽(군집 중심에서 멀어지는 방향)부터 시도하면 라벨이 방사형으로 퍼져
       연결선이 서로 가로지르는 경우가 크게 줄어든다. */
    function candidates(p, cen) {
        if (!loc) return [[0, -B.h - LBL_OFF]];
        var out = Math.atan2(p.y - cen.y, p.x - cen.x);
        var dirs = [];
        for (var k = 0; k < 16; k++) dirs.push(k * Math.PI / 8);
        dirs.sort(function (a, b) {
            function diff(x) { var d = Math.abs(x - out) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); }
            return diff(a) - diff(b);
        });
        var o = [];
        for (var step = 0; step < 9; step++) {
            for (var i = 0; i < dirs.length; i++) {
                var g = 22 + step * 34;
                o.push([Math.cos(dirs[i]) * (B.w / 2 + g),
                        Math.sin(dirs[i]) * (B.h / 2 + g) - B.h / 2]);
            }
        }
        return o;
    }

    /** 마커에서 라벨 테두리까지의 연결선 양 끝점 (화면 좌표) */
    function connector(p, box) {
        var cx = box.x + B.w / 2, cy = box.y + B.h / 2;
        var dx = cx - p.x, dy = cy - p.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var t = Math.min(Math.abs((B.w / 2 + 2) / (dx || 1e-6)),
                         Math.abs((B.h / 2 + 2) / (dy || 1e-6)));
        return [{ x: p.x + dx / len * 14, y: p.y + dy / len * 14 },
                { x: cx - dx * t, y: cy - dy * t }];
    }

    // 바깥쪽 판정 기준이 될 군집 중심
    var pts = order.map(function (r) { return map.latLngToContainerPoint([r.lat, r.lng]); });
    var cen = { x: 0, y: 0 };
    pts.forEach(function (q) { cen.x += q.x; cen.y += q.y; });
    if (pts.length) { cen.x /= pts.length; cen.y /= pts.length; }

    var lines = [];      // 이미 그린 연결선 (교차 방지용)

    order.forEach(function (r, idx) {
        var p = pts[idx];
        if (p.x < -B.w || p.x > size.x + B.w || p.y < -B.h || p.y > size.y + B.h) return;

        var cands = candidates(p, cen), pick = null, seg = null;
        for (var i = 0; i < cands.length; i++) {
            var box = { x: p.x + cands[i][0] - B.w / 2, y: p.y + cands[i][1],
                        w: B.w, h: B.h, off: cands[i] };
            if (overlaps(box, placed)) continue;
            if (!loc) { pick = box; break; }

            var s = connector(p, box);
            // 다른 연결선과 교차하거나, 이미 놓인 라벨을 가로지르면 버린다
            var bad = lines.some(function (o) { return segCross(s[0], s[1], o[0], o[1]); })
                   || placed.some(function (o) { return segHitsBox(s[0], s[1], o); });
            if (bad) continue;
            pick = box; seg = s; break;
        }
        if (!pick) {
            if (!loc) return;                                 // 일반 모드는 겹치면 버린다
            /* 창이 좁아 깨끗한 자리가 없으면 가장 덜 겹치는 자리를 쓴다 */
            var best = null, bestCost = Infinity;
            for (var k = 0; k < cands.length; k++) {
                var bx = { x: p.x + cands[k][0] - B.w / 2, y: p.y + cands[k][1],
                           w: B.w, h: B.h, off: cands[k] };
                var cost = 0;
                placed.forEach(function (o) {
                    var ow = Math.min(bx.x + bx.w, o.x + o.w) - Math.max(bx.x, o.x);
                    var oh = Math.min(bx.y + bx.h, o.y + o.h) - Math.max(bx.y, o.y);
                    if (ow > 0 && oh > 0) cost += ow * oh;
                });
                var sg = connector(p, bx);
                lines.forEach(function (o) { if (segCross(sg[0], sg[1], o[0], o[1])) cost += 4000; });
                if (cost < bestCost) { bestCost = cost; best = bx; seg = sg; }
            }
            pick = best;
        }
        var isSel = !!(selected && selected.id === r.id);

        if (!loc) {
            placed.push(pick);
            labelLayer.addLayer(L.marker([r.lat, r.lng], {
                icon: L.divIcon({ className: 'pin-wrap', html: labelHtml(r, isSel),
                                  iconSize: [B.w, B.h],
                                  iconAnchor: [B.w / 2 - pick.off[0], -pick.off[1]] }),
                interactive: true, keyboard: false, zIndexOffset: isSel ? 1000 : 0
            }).on('click', function () { select(r); }));
            return;
        }

        /* 위치도 — 라벨을 끌어 옮길 수 있게 별도 마커로 띄운다.
           손으로 옮긴 자리가 있으면 자동 배치 대신 그것을 쓴다. */
        var man = labelOffsets[r.id];
        var ctr = man ? { x: p.x + man[0], y: p.y + man[1] }
                      : { x: pick.x + B.w / 2, y: pick.y + B.h / 2 };
        // 뒤에 오는 라벨이 이 자리를 피하도록 실제 위치로 기록한다
        placed.push({ x: ctr.x - B.w / 2, y: ctr.y - B.h / 2, w: B.w, h: B.h, off: pick.off });
        seg = connectorPts(p, ctr, B);
        lines.push(seg);

        var line1 = L.polyline([], { color: '#fff', weight: 4.5, opacity: .95 });
        var lineCol = (r.t === 'landcase' && r.kind === '거래') ? '#15803d' : TYPES[r.t].color;
        var line2 = L.polyline([], { color: lineCol, weight: 2, opacity: 1 });
        labelLayer.addLayer(line1); labelLayer.addLayer(line2);

        var mk = L.marker(map.containerPointToLatLng(L.point(ctr.x, ctr.y)), {
            icon: L.divIcon({ className: 'pin-wrap', html: labelHtml(r, isSel),
                              iconSize: [B.w, B.h], iconAnchor: [B.w / 2, B.h / 2] }),
            draggable: true, autoPan: false, keyboard: false,
            zIndexOffset: isSel ? 1000 : 0
        });

        function drawLine() {
            var pin = map.latLngToContainerPoint([r.lat, r.lng]);
            var c = map.latLngToContainerPoint(mk.getLatLng());
            var s = connectorPts(pin, c, B);
            var a = map.containerPointToLatLng(L.point(s[0].x, s[0].y));
            var b = map.containerPointToLatLng(L.point(s[1].x, s[1].y));
            line1.setLatLngs([a, b]); line2.setLatLngs([a, b]);
        }
        drawLine();

        mk.on('drag', drawLine);
        mk.on('dragend', function () {
            var pin = map.latLngToContainerPoint([r.lat, r.lng]);
            var c = map.latLngToContainerPoint(mk.getLatLng());
            labelOffsets[r.id] = [Math.round(c.x - pin.x), Math.round(c.y - pin.y)];
            saveOffsets();
            drawLine();
        });
        mk.on('click', function () { select(r); });
        labelLayer.addLayer(mk);
    });

    // 배치 검증용 (겹침·교차 확인)
    lastPlacement = { boxes: placed, lines: lines };
}

var lastPlacement = { boxes: [], lines: [] };

/* ---------- 라벨 수동 배치 ----------
   자동 배치가 늘 마음에 들 수는 없으니 위치도에서는 라벨을 끌어 옮길 수 있게 한다.
   저장 단위는 마커 기준 화면 픽셀 오프셋이다. 지도 좌표로 저장하면 확대/축소할 때
   라벨과 마커의 간격이 달라져 배치가 흐트러진다.                                   */

var OFF_KEY = 'dgsg.locmap.offsets';
var labelOffsets = (function () {
    try { return JSON.parse(localStorage.getItem(OFF_KEY) || '{}'); } catch (e) { return {}; }
})();

function saveOffsets() {
    try { localStorage.setItem(OFF_KEY, JSON.stringify(labelOffsets)); } catch (e) {}
}

function resetOffsets() {
    labelOffsets = {};
    saveOffsets();
    renderMarkers();
}

/** 마커 지점과 라벨 중심으로 연결선 양 끝점을 구한다 (화면 좌표) */
function connectorPts(pin, center, B) {
    var dx = center.x - pin.x, dy = center.y - pin.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var t = Math.min(Math.abs((B.w / 2 + 2) / (dx || 1e-6)),
                     Math.abs((B.h / 2 + 2) / (dy || 1e-6)));
    return [{ x: pin.x + dx / len * 14, y: pin.y + dy / len * 14 },
            { x: center.x - dx * t, y: center.y - dy * t }];
}

function renderList() {
    var el = document.getElementById('list-container');
    var groups = (state.mode === 'landmap')
        ? [['afterSubject', '본 건'], ['landcase', '토지사례']]
        : (state.mode === 'after' || state.mode === 'locmap')
        ? [['afterSubject', state.mode === 'locmap' ? '본 건' : '본건 종후'],
           ['after', state.mode === 'locmap' ? '거래사례' : '비준사례'],
           ['rentcase', '임대사례']]
        : [['subject', '본건'], ['std', '표준지'], ['sale', '거래사례'], ['rent', '임대사례']];
    var h = '';
    groups.forEach(function (g) {
        var list = filtered.filter(function (r) { return r.t === g[0]; });
        if (!list.length) return;
        if (g[0] === 'sale') list.sort(function (a, b) { return b.landUnit - a.landUnit; });
        if (g[0] === 'rent') list.sort(function (a, b) { return b.eqRent - a.eqRent; });
        if (g[0] === 'rentcase') list.sort(function (a, b) { return a.rentNo - b.rentNo; });
        if (g[0] === 'landcase') list.sort(function (a, b) { return a.landNo - b.landNo; });
        if (g[0] === 'after') {
            // 위치도는 비준표 번호순, 그 외에는 단가 내림차순
            list.sort(state.mode === 'locmap'
                ? function (a, b) { return a.compNo - b.compNo; }
                : function (a, b) { return b.unitPy - a.unitPy; });
        }
        h += '<div class="grp-head">' + g[1] + ' ' + list.length + '건</div>';
        list.forEach(function (r) {
            var c = (r.t === 'landcase' && r.kind === '거래') ? '#15803d' : TYPES[r.t].color, val, meta;
            if (r.t === 'sale') {
                val = wonPy(r.landUnit); meta = r.date + ' · ' + m2(r.landArea) + ' · ' + eok(r.amount);
            } else if (r.t === 'rent') {
                val = won(r.eqRent);
                meta = m2(r.area) + ' · ' + (r.appr ? r.appr.slice(0, 4) : '-') + '년'
                     + (r.vacancy ? ' · 공실 ' + r.vacancy + '%' : '');
            } else if (r.t === 'landcase') {
                val = won(r.unitM2);
                meta = r.kind + '사례 · ' + r.date + ' · ' + m2(r.area) + ' · ' + r.road;
            } else if (r.t === 'rentcase') {
                val = won(r.noc);
                meta = 'NOC · 임대 ' + won(r.rent) + '원/평 · ' + r.appr.slice(0, 4) + '년'
                     + (r.vacancy ? ' · 공실 ' + r.vacancy + '%' : '');
            } else if (r.t === 'std') {
                val = won(r.gongsi); meta = r.year + ' · ' + m2(r.area) + ' · ' + r.use;
            } else if (r.t === 'after' || r.t === 'afterSubject') {
                val = won(r.unitPy);
                meta = Math.round(r.grossPy).toLocaleString('ko-KR') + '평 · ' + r.scale
                     + (r.cap ? ' · Cap ' + r.cap + '%' : '')
                     + (r.date && r.date !== '-' ? ' · ' + r.date : '');
            } else {
                val = wonPy(r.unit); meta = m2(r.area) + ' · ' + eok(r.value);
            }
            // 위치도에서는 비준표 번호를 앞에 붙인다
            var noTag = (state.mode === 'locmap' && r.compNo)
                ? '<span class="tag" style="background:' + TYPES.after.color + '">#'
                  + r.compNo + '</span>'
                : (r.t === 'rentcase'
                    ? '<span class="tag" style="background:' + TYPES.rentcase.color + '">R'
                      + r.rentNo + '</span>' : '');
            h += '<div class="list-item' + (selected && selected.id === r.id ? ' sel' : '')
               + '" data-id="' + r.id + '">'
               + '<div class="li-top"><span class="name">' + noTag
               + (r.subject ? '<span class="tag" style="background:' + TYPES.subject.color + '">본건</span>' : '')
               + esc(r.label) + '</span>'
               + '<span class="val" style="color:' + c + '">' + val + '</span></div>'
               + '<div class="meta">' + esc(meta) + (r.lat ? '' : ' <span class="nogeo">📍 좌표없음</span>')
               + '</div></div>';
        });
    });
    el.innerHTML = h || '<div class="empty">표시할 레이어가 없습니다.</div>';
    el.querySelectorAll('.list-item').forEach(function (n) {
        n.onclick = function () { select(recs[+n.dataset.id], true); };
    });
}

function renderLegend() {
    var rows = [], t = document.getElementById('lg-title');
    function sw(c, lab) {
        return '<div class="lg-row"><span class="lg-sw" style="background:' + c + '"></span>'
             + '<span class="lg-lab">' + lab + '</span></div>';
    }
    if (scale.type === 'cat') {
        t.textContent = '구분';
        var names = (state.mode === 'locmap')
            ? { afterSubject: '본 건', after: '거래사례 (단가)', rentcase: '임대사례 (NOC)' }
            : (state.mode === 'landmap')
            ? { afterSubject: '본 건' } : {};
        MODES[state.mode].layers.forEach(function (k) {
            if (!state.layers.has(k)) return;
            /* 토지사례는 한 타입이지만 평가/거래를 색으로 갈라 두 줄로 낸다 */
            if (k === 'landcase') {
                rows.push(sw(TYPES.landcase.color, '평가사례 (담보)'));
                rows.push(sw('#15803d', '거래사례'));
                return;
            }
            rows.push(sw(TYPES[k].color, names[k] || TYPES[k].label));
        });
        document.getElementById('lg-note').textContent = (state.mode === 'landmap')
            ? '라벨: 기호 · 토지단가(원/㎡) · 기준시점 — 지시선은 실제 위치'
            : (state.mode === 'locmap')
            ? '거래사례 = 거래단가(원/평) · 임대사례 = NOC(원/전용평)·월임대료(원/임대평) · 지시선은 실제 위치'
            : '본건은 큰 원 · 라벨에 구분이 글자로도 표시';
    } else {
        var m = document.getElementById('f-metric');
        t.textContent = m.options[m.selectedIndex].text;
        var b = scale.breaks, fmt = state.metric === 'age'
            ? function (v) { return Math.round(v) + '년'; }
            : (state.metric === 'cap' || state.metric === 'far')
            ? function (v) { return v.toFixed(state.metric === 'cap' ? 2 : 0) + '%'; }
            : function (v) { return man(v); };
        rows.push(sw(SEQ[0], '< ' + fmt(b[0])));
        for (var i = 1; i < b.length; i++) rows.push(sw(SEQ[i], fmt(b[i - 1]) + ' ~ ' + fmt(b[i])));
        rows.push(sw(SEQ[b.length], '≥ ' + fmt(b[b.length - 1])));
        rows.push(sw('#cbd5e0', '해당 없음'));
        document.getElementById('lg-note').textContent = state.metric === 'landUnit'
            ? '5분위 구간 · 색은 ㎡ 기준, 라벨은 거래사례·본건이 평 기준'
            : '5분위 구간';
    }
    document.getElementById('lg-rows').innerHTML = rows.join('');
}

/* ---------- 선택 · 상세 ---------- */

function select(r, pan) {
    if (!r) return;
    selected = r;
    if (pan && r.lat) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17), { animate: true });
    show('detail-float', true);
    renderMarkers();
    renderList();
    renderDetail();
    if (window.innerWidth <= 820) closePanel();
}

function renderDetail() {
    var el = document.getElementById('detail-body'), r = selected;
    if (!r) { el.innerHTML = '<div class="empty">지도의 마커 또는 좌측 목록에서 선택하세요.</div>'; return; }
    var c = (r.t === 'landcase' && r.kind === '거래') ? '#15803d' : TYPES[r.t].color;
    function dl(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }

    var h = '<div class="d-title">'
          + '<span class="tag" style="background:' + c + '">' + TYPES[r.t].label + '</span>'
          + esc(r.label) + '</div>'
          + '<div class="d-sub">' + esc(r.addr) + (r.lat ? '' : ' · <b>좌표 미확보</b>') + '</div>';

    if (r.t === 'subject') {
        h += '<dl class="kv">'
           + dl('토지면적', m2(r.area) + ' (' + pyeong(r.area) + ')')
           + dl('연면적', r.bldArea ? m2(r.bldArea) : '-')
           + dl('용도지역', esc(r.zone) + ' · ' + esc(r.jimok))
           + dl('형상 · 지세', esc(r.shape) + ' · ' + esc(r.slope))
           + dl('도로교통', esc(r.road))
           + dl('사용승인', esc(r.appr || '-'))
           + '</dl>'
           + '<div class="sec"><div class="sec-h">토지 평가</div><div class="box">'
           + '<div class="row"><span>개별공시지가</span><b>' + won(r.gongsi) + ' 원/㎡</b></div>'
           + '<div class="row"><span>결정단가 (㎡)</span><b>' + won(r.unit) + ' 원/㎡</b></div>'
           + '<div class="row"><span>결정단가 (평)</span><b>' + wonPy(r.unit) + ' 원/평</b></div>'
           + '<div class="row"><span>공시지가 대비</span><b>'
           + (r.unit / r.gongsi).toFixed(2) + '배</b></div>'
           + '<div class="res"><span>토지 평가액</span><b>' + eok(r.value) + '</b></div>'
           + '</div></div>';
    } else if (r.t === 'std') {
        h += '<dl class="kv">'
           + dl('면적', m2(r.area)) + dl('지목 · 이용', esc(r.jimok) + ' · ' + esc(r.use))
           + dl('용도지역', esc(r.zone)) + dl('도로교통', esc(r.road))
           + dl('형상 · 지세', esc(r.shape) + ' · ' + esc(r.slope))
           + '</dl>'
           + '<div class="sec"><div class="sec-h">공시지가</div><div class="box">'
           + '<div class="row"><span>' + r.year + '</span><b>' + won(r.gongsi) + ' 원/㎡</b></div>'
           + '<div class="row"><span>전년</span><b>' + won(r.prev) + ' 원/㎡</b></div>'
           + '<div class="res"><span>변동률</span><b class="' + (r.gongsi > r.prev ? 'up' : 'down') + '">'
           + pct((r.gongsi / r.prev - 1) * 100, 2) + '</b></div>'
           + '</div></div>';
    } else if (r.t === 'after' || r.t === 'afterSubject') {
        var SU = AFTER_SUBJ();
        h += '<dl class="kv">'
           + dl('대지면적', m2(r.landArea))
           + dl('연면적', m2(r.grossArea) + ' (' + Math.round(r.grossPy).toLocaleString('ko-KR') + '평)')
           + dl('규모', esc(r.scale))
           + dl('건폐 · 용적', r.bcr + '% · ' + r.far + '%')
           + dl('사용승인', esc(r.appr || '-'))
           + dl('구조', esc(r.struct || '-'))
           + dl('용도지역', esc(r.zone))
           + (r.eff ? dl('전용률', r.eff + '%') : '')
           + (r.rel && r.rel !== '-' ? dl('관련 지번', esc(r.rel)) : '')
           + '</dl>';

        h += '<div class="sec"><div class="sec-h">거래</div><div class="box">'
           + (r.date && r.date !== '-' ? '<div class="row"><span>거래시점</span><b>' + r.date + '</b></div>' : '')
           + '<div class="row"><span>거래금액</span><b>' + eok(r.amount) + '</b></div>'
           + (r.reg && r.reg !== '-' ? '<div class="row"><span>등기</span><b>' + esc(r.reg) + '</b></div>' : '')
           + '<div class="row"><span>㎡당</span><b>' + won(r.unitM2) + ' 원/㎡</b></div>'
           + '<div class="res"><span>연면적단가</span><b>' + won(r.unitPy) + ' 원/평</b></div>'
           + '</div>'
           + (r.t === 'after' && SU ?
              '<div class="hint">본건 종후 ' + won(SU.unitPy) + ' 원/평 대비 <b class="'
              + (r.unitPy > SU.unitPy ? 'up' : 'down') + '">'
              + pct((r.unitPy / SU.unitPy - 1) * 100, 1) + '</b></div>' : '')
           + '</div>';

        if (r.noc || r.cap) {
            h += '<div class="sec"><div class="sec-h">임대 · 수익 (원/평)</div><div class="box">'
               + (r.rent ? '<div class="row"><span>임대료</span><b>' + won(r.rent) + '</b></div>' : '')
               + (r.deposit ? '<div class="row"><span>보증금</span><b>' + won(r.deposit) + '</b></div>' : '')
               + (r.mgmt ? '<div class="row"><span>관리비</span><b>' + won(r.mgmt) + '</b></div>' : '')
               + (r.vacancy ? '<div class="row"><span>공실률</span><b>' + r.vacancy + '%</b></div>' : '')
               + (r.free && r.free !== '-' ? '<div class="row"><span>렌트프리</span><b>' + esc(r.free) + '</b></div>' : '')
               + '<div class="row"><span>NOC (전용평)</span><b>' + won(r.noc) + '</b></div>'
               + (r.cap ? '<div class="res"><span>Cap Rate</span><b>' + r.cap.toFixed(2) + '%</b></div>' : '')
               + '</div></div>';
        }
        if (r.note && r.note !== '-') {
            h += '<div class="sec"><div class="sec-h">비고</div><div class="hint" style="margin:0">'
               + esc(r.note) + '</div></div>';
        }
    } else if (r.t === 'sale') {
        h += '<dl class="kv">'
           + dl('거래일자', esc(r.date))
           + dl('거래금액', eok(r.amount))
           + dl('토지면적', m2(r.landArea) + ' (' + pyeong(r.landArea) + ')')
           + dl('연면적', r.bldArea ? m2(r.bldArea) : '-')
           + dl('용도지역', esc(r.zone))
           + dl('건물', esc(r.use || '-') + ' · ' + esc(r.struct || '-'))
           + dl('사용승인', esc(r.appr || '-'))
           + '</dl>'
           + '<div class="sec"><div class="sec-h">단가</div><div class="box">'
           + '<div class="row"><span>토지단가 (㎡)</span><b>' + won(r.landUnit) + ' 원/㎡</b></div>'
           + (r.bldUnit > 0 ? '<div class="row"><span>건물단가 (㎡)</span><b>' + won(r.bldUnit) + ' 원/㎡</b></div>' : '')
           + '<div class="row"><span>토지단가 (평)</span><b>' + wonPy(r.landUnit) + ' 원/평</b></div>'
           + '<div class="res"><span>본건 결정단가 대비</span><b class="'
           + (r.landUnit > SUBJ_UNIT ? 'up' : 'down') + '">'
           + pct((r.landUnit / SUBJ_UNIT - 1) * 100, 1) + '</b></div>'
           + '</div><div class="hint">본건 결정단가 ' + wonPy(SUBJ_UNIT)
           + ' 원/평 (면적가중 평균) 기준</div></div>';
    } else {
        h += '<dl class="kv">'
           + dl('연면적', m2(r.area) + ' (' + pyeong(r.area) + ')')
           + dl('사용승인', esc(r.appr || '-'))
           + dl('전용률', r.eff ? r.eff + '%' : '-')
           + dl('비고', esc(r.note || '-'))
           + '</dl>'
           + '<div class="sec"><div class="sec-h">임대 조건 (원/평)</div><div class="box">'
           + '<div class="row"><span>보증금</span><b>' + won(r.deposit) + '</b></div>'
           + '<div class="row"><span>월 임대료</span><b>' + won(r.rent) + '</b></div>'
           + '<div class="row"><span>월 관리비</span><b>' + won(r.mgmt) + '</b></div>'
           + '<div class="row"><span>렌트프리</span><b>' + esc(r.free || '-') + '</b></div>'
           + '<div class="row"><span>공실률</span><b>' + (r.vacancy || 0) + '%</b></div>'
           + '<div class="res"><span>월 환산임대료</span><b>' + won(r.eqRent) + '</b></div>'
           + '</div>'
           + (r.subject ? '' :
              '<div class="hint">본건 ' + won(SUBJ_RENT) + ' 원/평 대비 <b class="'
              + (r.eqRent > SUBJ_RENT ? 'up' : 'down') + '">'
              + pct((r.eqRent / SUBJ_RENT - 1) * 100, 1) + '</b></div>')
           + '</div>';
    }
    el.innerHTML = h;
}

/* ---------- 비교 패널 ---------- */

function AFTER_SUBJ() {
    return recs.filter(function (r) { return r.t === 'afterSubject'; })[0];
}

function renderCompare() {
    var el = document.getElementById('compare-body');
    if (isLocMode()) { renderCompareLoc(el); return; }
    if (state.mode === 'after') { renderCompareAfter(el); return; }
    var sales = recs.filter(function (r) { return r.t === 'sale' && r.landUnit > 0; })
                    .sort(function (a, b) { return b.landUnit - a.landUnit; });
    var rents = recs.filter(function (r) { return r.t === 'rent' && r.eqRent > 0; })
                    .sort(function (a, b) { return b.eqRent - a.eqRent; });

    function med(a) { return a.length ? a[Math.floor(a.length / 2)] : 0; }
    var su = sales.map(function (r) { return r.landUnit; }).sort(function (a, b) { return a - b; });
    var ru = rents.map(function (r) { return r.eqRent; }).sort(function (a, b) { return a - b; });

    var h = '<div class="box">'
        + '<div class="row"><span>본건 결정단가 (면적가중)</span><b>' + wonPy(SUBJ_UNIT) + ' 원/평</b></div>'
        + '<div class="row"><span>거래사례 중위 토지단가</span><b>' + wonPy(med(su)) + ' 원/평</b></div>'
        + '<div class="res"><span>본건 / 사례 중위</span><b class="'
        + (SUBJ_UNIT > med(su) ? 'up' : 'down') + '">'
        + pct((SUBJ_UNIT / med(su) - 1) * 100, 1) + '</b></div></div>';

    h += '<div class="sec"><div class="sec-h">거래사례 토지단가 (원/평)</div>'
       + '<table class="cmp"><thead><tr><th>소재지</th><th>거래일</th><th>토지단가</th><th>본건대비</th></tr></thead><tbody>'
       + '<tr class="me"><td>본건 (결정단가)</td><td>' + PROJECT.base.slice(2) + '</td><td>'
       + wonPy(SUBJ_UNIT) + '</td><td>-</td></tr>';
    sales.forEach(function (r) {
        h += '<tr data-id="' + r.id + '"><td>' + esc(r.dong + ' ' + r.jibun) + '</td><td>'
           + r.date.slice(2) + '</td><td>' + wonPy(r.landUnit) + '</td><td class="'
           + (r.landUnit > SUBJ_UNIT ? 'up' : 'down') + '">'
           + pct((r.landUnit / SUBJ_UNIT - 1) * 100, 0) + '</td></tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="sec"><div class="sec-h">임대사례 환산임대료 (원/평)</div>'
       + '<table class="cmp"><thead><tr><th>빌딩</th><th>연면적</th><th>환산임대료</th><th>공실</th></tr></thead><tbody>';
    rents.forEach(function (r) {
        h += '<tr data-id="' + r.id + '"' + (r.subject ? ' class="me"' : '') + '><td>'
           + esc(r.name) + '</td><td>' + Math.round(r.area).toLocaleString('ko-KR') + '</td><td>'
           + won(r.eqRent) + '</td><td>' + (r.vacancy || 0) + '%</td></tr>';
    });
    h += '</tbody></table>'
       + '<div class="hint">본건 환산임대료 ' + won(SUBJ_RENT) + ' 원/평 · 사례 중위 '
       + won(med(ru)) + ' 원/평</div></div>';

    el.innerHTML = h;
    el.querySelectorAll('tr[data-id]').forEach(function (n) {
        n.onclick = function () { select(recs[+n.dataset.id], true); };
    });
}

/* 위치도 — 비준표 순서 그대로의 일람 */
function renderCompareLoc(el) {
    var SU = AFTER_SUBJ();
    var list = recs.filter(function (r) { return r.t === 'after' && r.compNo; })
                   .sort(function (a, b) { return a.compNo - b.compNo; });

    var h = '<table class="cmp"><thead><tr><th>구분</th><th>명칭</th><th>소재지</th>'
          + '<th>거래단가<br>(원/평)</th></tr></thead><tbody>'
          + '<tr class="me"><td>본 건</td><td>' + esc(SU.name) + '</td><td>'
          + esc(SU.loc) + '</td><td>-</td></tr>';
    list.forEach(function (r) {
        h += '<tr data-id="' + r.id + '"><td>거래사례 #' + r.compNo + '</td><td>'
           + esc(r.name) + '</td><td>' + esc(r.loc) + '</td><td>' + won(r.unitPy) + '</td></tr>';
    });
    h += '</tbody></table>'
       + '<div class="hint">엑셀에는 거래사례 12건이 있으나 최종 비준표는 11건입니다. '
       + 'S1310(서초동 1310-15)은 빠졌고, BNK디지털타워는 <b>그레이츠 강남</b>으로 '
       + '명칭이 바뀐 동일 물건입니다.</div>';
    el.innerHTML = h;
    el.querySelectorAll('tr[data-id]').forEach(function (n) {
        n.onclick = function () { select(recs[+n.dataset.id], true); };
    });
}

function renderCompareAfter(el) {
    var SU = AFTER_SUBJ();
    var list = recs.filter(function (r) { return r.t === 'after' && r.unitPy > 0; })
                   .sort(function (a, b) { return b.unitPy - a.unitPy; });
    var units = list.map(function (r) { return r.unitPy; }).sort(function (a, b) { return a - b; });
    var caps = list.filter(function (r) { return r.cap > 0; }).map(function (r) { return r.cap; })
                   .sort(function (a, b) { return a - b; });
    function med(a) { return a.length ? a[Math.floor(a.length / 2)] : 0; }

    var h = '<div class="box">'
        + '<div class="row"><span>본건 종후 연면적단가</span><b>' + won(SU.unitPy) + ' 원/평</b></div>'
        + '<div class="row"><span>비준사례 중위</span><b>' + won(med(units)) + ' 원/평</b></div>'
        + '<div class="res"><span>본건 / 사례 중위</span><b class="'
        + (SU.unitPy > med(units) ? 'up' : 'down') + '">'
        + pct((SU.unitPy / med(units) - 1) * 100, 1) + '</b></div></div>';

    /* 3방식 시산가액 */
    h += '<div class="sec"><div class="sec-h">3방식 시산가액 (기준시점 ' + AFTER_SUMMARY.base + ')</div>'
       + '<table class="cmp"><thead><tr><th>방식</th><th>하한</th><th>중위</th><th>상한</th><th>평단가</th></tr></thead><tbody>';
    AFTER_SUMMARY.methods.forEach(function (m) {
        h += '<tr><td>' + m.name + '</td><td>' + eok(m.low) + '</td><td><b>' + eok(m.mid)
           + '</b></td><td>' + eok(m.high) + '</td><td>' + man(m.unitPy) + '</td></tr>';
    });
    h += '</tbody></table>'
       + '<div class="hint">원가 ' + AFTER_SUMMARY.methods[0].ratio
       + ' · 시장 ' + AFTER_SUMMARY.methods[1].ratio
       + ' · 수익 ' + AFTER_SUMMARY.methods[2].ratio + ' (시장 대비 비율)</div></div>';

    h += '<div class="sec"><div class="sec-h">비준사례 연면적단가 (원/평)</div>'
       + '<table class="cmp"><thead><tr><th>빌딩</th><th>거래일</th><th>단가</th><th>본건대비</th></tr></thead><tbody>'
       + '<tr class="me"><td>본건 종후자산</td><td>' + AFTER_SUMMARY.base.slice(2)
       + '</td><td>' + won(SU.unitPy) + '</td><td>-</td></tr>';
    list.forEach(function (r) {
        h += '<tr data-id="' + r.id + '"><td>' + esc(r.name) + '</td><td>'
           + (r.date && r.date !== '-' ? r.date.slice(2) : '-') + '</td><td>' + won(r.unitPy)
           + '</td><td class="' + (r.unitPy > SU.unitPy ? 'up' : 'down') + '">'
           + pct((r.unitPy / SU.unitPy - 1) * 100, 0) + '</td></tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="sec"><div class="sec-h">Cap Rate · NOC</div>'
       + '<table class="cmp"><thead><tr><th>빌딩</th><th>Cap</th><th>NOC</th><th>공실</th></tr></thead><tbody>';
    list.slice().sort(function (a, b) { return a.cap - b.cap; }).forEach(function (r) {
        h += '<tr data-id="' + r.id + '"><td>' + esc(r.name) + '</td><td>'
           + (r.cap ? r.cap.toFixed(2) + '%' : '-') + '</td><td>' + won(r.noc) + '</td><td>'
           + (r.vacancy || 0) + '%</td></tr>';
    });
    h += '</tbody></table>'
       + '<div class="hint">본건 종후 NOC ' + won(SU.noc) + ' 원/전용평 · 사례 Cap 중위 '
       + (caps.length ? med(caps).toFixed(2) + '%' : '-') + '</div></div>';

    el.innerHTML = h;
    el.querySelectorAll('tr[data-id]').forEach(function (n) {
        n.onclick = function () { select(recs[+n.dataset.id], true); };
    });
}

/* ---------- 지오코딩 ---------- */

function setStatus(cls, msg) {
    var el = document.getElementById('geo-status');
    el.className = 'sync-status ' + cls;
    el.textContent = msg;
}

function geoSummary() {
    var n = recs.filter(function (r) { return r.lat; }).length;
    if (n === recs.length) setStatus('ok', '✓ 좌표 ' + n + '건 전부 확보');
    else if (!n) setStatus('pending', '좌표 0건 — [📍 좌표 변환]을 실행하세요');
    else setStatus('pending', '좌표 ' + n + ' / ' + recs.length + '건');
}

function runGeocode() {
    if (!window.kakao || !kakao.maps) {
        setStatus('err', '⚠ 카카오 SDK 미로드 — 도메인 등록을 확인하세요'); return;
    }
    kakao.maps.load(function () {
        var g = new kakao.maps.services.Geocoder(), S = kakao.maps.services.Status;
        var todo = recs.filter(function (r) { return !r.lat; });
        if (!todo.length) { geoSummary(); return; }
        var cache = loadCache(), i = 0, ok = 0, fail = 0, refused = 0;

        (function step() {
            if (i >= todo.length) {
                saveCache(cache);
                geoSummary();
                setStatus(fail ? 'pending' : 'ok',
                    '✓ ' + ok + '건 변환' + (fail ? ' · 실패 ' + fail + '건' : '')
                    + ' — [⬇ coords 저장] 으로 파일을 갱신하세요');
                applyFilter(); fitAll();
                return;
            }
            var r = todo[i];
            g.addressSearch(r.addr, function (d, s) {
                if (s === S.OK && d && d.length) {
                    r.lat = parseFloat(d[0].y); r.lng = parseFloat(d[0].x);
                    cache[r.key] = [r.lat, r.lng]; ok++;
                } else if (s === S.ZERO_RESULT) { fail++; }
                else {
                    refused++;
                    if (refused >= 5 && ok === 0) {
                        setStatus('err', '⚠ 주소 검색이 거부되었습니다. appkey 의 Web 플랫폼에 '
                            + location.origin + ' 을 등록하세요.');
                        return;
                    }
                    fail++;
                }
                i++;
                setStatus('pending', '📍 변환 중 ' + i + ' / ' + todo.length);
                setTimeout(step, 110);
            });
        })();
    });
}

function serializeCoords() {
    // 거래사례와 임대사례가 같은 주소를 가리키는 경우가 있어 키가 겹친다 — 한 번만 쓴다
    var seen = {}, lines = [];
    recs.forEach(function (r) {
        if (!r.lat || seen[r.key]) return;
        seen[r.key] = 1;
        lines.push('"' + r.key.replace(/"/g, '\\"') + '":['
            + r.lat.toFixed(7) + ',' + r.lng.toFixed(7) + ']');
    });
    lines.sort();
    return '/* 주소 → 좌표 캐시 (자동 생성)\n'
         + ' * 키: 전체 주소 문자열, 값: [위도, 경도]\n'
         + ' * 페이지의 "⬇ coords 저장" 으로 재생성한다.\n */\n'
         + 'var ADDR_COORDS = {\n' + lines.join(',\n') + '\n};\n';
}

/* ---------- UI ---------- */

function show(id, on) {
    var el = document.getElementById(id);
    el.classList.toggle('visible', on === undefined ? !el.classList.contains('visible') : on);
    var btn = { 'detail-float': 'btn-detail', 'compare-float': 'btn-compare' }[id];
    if (btn) document.getElementById(btn).classList.toggle('on', el.classList.contains('visible'));
    if (el.classList.contains('visible')) {
        ['detail-float', 'compare-float'].forEach(function (o) { if (o !== id) show(o, false); });
    }
    var any = ['detail-float', 'compare-float'].some(function (o) {
        return document.getElementById(o).classList.contains('visible');
    });
    document.body.classList.toggle('sheet-open', any);
}

function closePanel() {
    document.getElementById('side-panel').classList.remove('open');
    document.getElementById('panel-overlay').classList.remove('on');
}

var pendingFit = false;

function fitAll() {
    pendingFit = true;
    tryFit();
    var t = 0;
    (function retry() {
        if (!pendingFit || t++ > 100) return;
        tryFit();
        if (pendingFit) setTimeout(retry, 100);
    })();
}

function tryFit() {
    if (!pendingFit) return;
    map.invalidateSize(false);
    var s = map.getSize();
    if (!s.x || !s.y) return;
    var pts = recs.filter(function (r) { return r.lat; }).map(function (r) { return [r.lat, r.lng]; });
    if (!pts.length) { pendingFit = false; return; }
    /* 위치도는 마커 바깥으로 라벨이 뻗으므로 라벨 한 칸만큼 여백을 더 준다 */
    var pad = (isLocMode()) ? [150, 110] : [60, 60];
    map.fitBounds(pts, { padding: pad });
    pendingFit = false;
    renderLabels();
}

if (window.ResizeObserver) {
    var lw = 0, lh = 0;
    new ResizeObserver(function () {
        map.invalidateSize(false);
        tryFit();
        var s = map.getSize();
        if (s.x && s.y && (s.x !== lw || s.y !== lh)) { lw = s.x; lh = s.y; renderLabels(); }
    }).observe(document.getElementById('map'));
}

function initBaseMap() {
    var ctl = document.getElementById('basemap-ctl');
    KakaoBase.ready(function (err) {
        if (err) {
            document.getElementById('kakao-map').style.background = '#e8edf2';
            ctl.style.display = 'none';
            setStatus('err', '⚠ ' + err.message);
            return;
        }
        kbase = KakaoBase.init(map, { lat: 37.4996, mapTypeId: 'ROADMAP' });
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

/** 종전/종후 전환 — 레이어·색상기준·헤더·비교패널이 모두 바뀐다 */
function setMode(mode) {
    state.mode = mode;
    state.layers = new Set(MODES[mode].layers);
    state.metric = 'type';
    selected = null;

    document.querySelectorAll('.mode-tabs button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.mode === mode);
    });

    var sel = document.getElementById('f-metric');
    sel.innerHTML = MODES[mode].metrics.map(function (m) {
        return '<option value="' + m[0] + '">' + m[1] + '</option>';
    }).join('');

    // 레이어 칩
    var el = document.getElementById('f-layer');
    el.innerHTML = MODES[mode].layers.map(function (k) {
        var n = recs.filter(function (r) {
            if (r.t !== k) return false;
            // 위치도 칩 건수는 실제로 그려지는 사례만 센다
            if (MODES[mode].compOnly && k === 'after' && !r.compNo) return false;
            return true;
        }).length;
        return '<span class="chip active" data-k="' + k + '" style="--c:' + TYPES[k].color + '">'
             + '<i class="dot"></i>' + TYPES[k].label + '<span class="cnt">' + n + '</span></span>';
    }).join('');
    el.querySelectorAll('.chip').forEach(function (n) {
        n.onclick = function () {
            var k = n.dataset.k;
            if (state.layers.has(k)) { state.layers.delete(k); n.classList.remove('active'); }
            else { state.layers.add(k); n.classList.add('active'); }
            applyFilter();
        };
    });

    document.getElementById('btn-reset-labels').style.display =
        isLocMode(mode) ? '' : 'none';

    renderHeader();
    show('detail-float', false);
    applyFilter();
    /* 위치도는 라벨 여백이 달라 화면을 다시 맞춘다 */
    if (isLocMode(mode)) { pendingFit = true; tryFit(); }
}

function renderHeader() {
    var el = document.getElementById('hdr-value');
    if (state.mode === 'landmap') {
        var lc = recs.filter(function (r) { return r.t === 'landcase'; });
        var lu = lc.map(function (r) { return r.unitM2; }).sort(function (a, b) { return a - b; });
        document.getElementById('hdr-sub').textContent =
            '토지 위치도 · 본건 + 평가사례 4건 + 거래사례 4건';
        el.innerHTML =
            '<div class="hv-row"><span>사례 최저</span><b>' + won(lu[0]) + ' 원/㎡</b></div>'
          + '<div class="hv-row"><span>사례 최고</span><b>' + won(lu[lu.length - 1]) + ' 원/㎡</b></div>'
          + '<div class="hv-row total"><span>사례 중위</span><b>'
          + won(lu[Math.floor(lu.length / 2)]) + ' 원/㎡</b></div>'
          + '<div class="hv-row"><span>본건 결정단가</span><b>' + won(SUBJ_UNIT) + ' 원/㎡</b></div>';
        return;
    }
    if (state.mode === 'locmap') {
        var SU = AFTER_SUBJ();
        var comps = recs.filter(function (r) { return r.t === 'after' && r.compNo; });
        var u = comps.map(function (r) { return r.unitPy; }).sort(function (a, b) { return a - b; });
        var rc = recs.filter(function (r) { return r.t === 'rentcase'; });
        var nocs = rc.map(function (r) { return r.noc; }).sort(function (a, b) { return a - b; });
        document.getElementById('hdr-sub').textContent =
            '위치도 · 본건 + 거래사례 ' + comps.length + '건 + 임대사례 ' + rc.length + '건';
        el.innerHTML =
            '<div class="hv-row"><span>사례 최저</span><b>' + won(u[0]) + ' 원/평</b></div>'
          + '<div class="hv-row"><span>사례 최고</span><b>' + won(u[u.length - 1]) + ' 원/평</b></div>'
          + '<div class="hv-row total"><span>사례 중위</span><b>'
          + won(u[Math.floor(u.length / 2)]) + ' 원/평</b></div>'
          + '<div class="hv-row"><span>임대 NOC 중위</span><b>'
          + won(nocs[Math.floor(nocs.length / 2)]) + ' 원/전용평</b></div>';
        return;
    }
    if (state.mode === 'after') {
        var SU = AFTER_SUBJ(), M = AFTER_SUMMARY.methods;
        document.getElementById('hdr-sub').textContent =
            '재건축 후 ' + SU.scale + ' · 연면적 ' + m2(SU.grossArea)
            + ' · 기준시점 ' + AFTER_SUMMARY.base;
        el.innerHTML = M.map(function (m) {
            return '<div class="hv-row"><span>' + m.name + '방식</span><b>' + eok(m.mid) + '</b></div>';
        }).join('')
          + '<div class="hv-row total"><span>연면적단가</span><b>' + won(SU.unitPy) + ' 원/평</b></div>';
    } else {
        document.getElementById('hdr-sub').textContent =
            '서울 강남구 역삼동 824-19 · 20 · 21 · 기준시점 ' + PROJECT.base;
        el.innerHTML =
            '<div class="hv-row"><span>토지</span><b>' + eok(PROJECT.totalLand) + '</b></div>'
          + '<div class="hv-row"><span>건물</span><b>' + eok(PROJECT.totalBld) + '</b></div>'
          + '<div class="hv-row total"><span>감정평가액</span><b>'
          + eok(PROJECT.totalLand + PROJECT.totalBld) + '</b></div>';
    }
}

function init() {
    document.querySelectorAll('.mode-tabs button').forEach(function (b) {
        b.onclick = function () { setMode(b.dataset.mode); };
    });

    document.getElementById('f-metric').onchange = function () { state.metric = this.value; applyFilter(); };
    document.getElementById('f-label').onchange = function () { state.showLabel = this.checked; renderLabels(); };
    document.getElementById('f-radius').onchange = function () { state.showRadius = this.checked; renderMarkers(); };
    document.getElementById('btn-reset-labels').onclick = function () {
        resetOffsets();
        this.textContent = '↺ 자동배치됨';
        var b = this;
        setTimeout(function () { b.textContent = '↺ 라벨 자동배치'; }, 1400);
    };
    document.getElementById('btn-detail').onclick = function () { show('detail-float'); };
    document.getElementById('btn-compare').onclick = function () { show('compare-float'); };
    document.querySelectorAll('[data-close]').forEach(function (b) {
        b.onclick = function () { show(b.dataset.close, false); };
    });
    document.getElementById('mobile-toggle').onclick = function () {
        document.getElementById('side-panel').classList.add('open');
        document.getElementById('panel-overlay').classList.add('on');
    };
    document.getElementById('panel-overlay').onclick = closePanel;

    document.getElementById('btn-geo').onclick = function () {
        setStatus('pending', '📍 변환 시작'); runGeocode();
    };
    document.getElementById('btn-save').onclick = function () {
        var text = serializeCoords();
        fetch('__save-data?f=coords.js', {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            setStatus('ok', '✓ data/coords.js 저장됨');
        }).catch(function () {
            var blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'coords.js';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
            setStatus('ok', '⬇ coords.js 내려받음 — data/ 에 덮어쓰세요');
        });
    };

    map.on('zoomend', renderMarkers);
    map.on('moveend', renderLabels);
    window.addEventListener('resize', function () {
        map.invalidateSize(false);
        if (kbase) kbase.relayout();
        renderLabels();
    });

    hydrate();
    geoSummary();
    initBaseMap();
    setMode('before');
    if (recs.some(function (r) { return r.lat; })) fitAll();
}

init();

window.__app = { map: map, recs: recs, state: state, select: select,
                 placement: function () { return lastPlacement; },
                 kbase: function () { return kbase; }, refresh: applyFilter, fit: fitAll };

})();
