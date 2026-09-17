/* ============================================================
   kakao_base.js — 카카오맵을 배경으로 깔고 Leaflet 오버레이를 그 위에 얹는다
   ------------------------------------------------------------
   왜 이렇게 하나
     · 배경지도(도로·위성·지적편집도)는 카카오가 가장 정확하다.
     · 마커 1,000여 개의 캔버스 렌더링과 히트맵은 Leaflet 쪽이 낫다.
     → #kakao-map(아래, 카카오) + #map(위, 투명한 Leaflet) 을 겹쳐 두고
       Leaflet 이 조작을 받아 카카오 지도를 따라오게 동기화한다.

   줌 대응 관계 (배포 환경에서 level 1~14 실측)
     카카오 level L 의 해상도 = 0.25 × 2^(L-1) m/px   (EPSG:5181, 실제 지상거리)
     웹메르카토르 zoom z 의 해상도 = 156543.03392 × cos(위도) / 2^z
     두 값을 같게 두면            z = OFFSET − L
       OFFSET = log2( 156543.03392 × cos(위도) / 0.125 )
     위도 35.72(달성군)에서 OFFSET ≈ 19.95 → 실측값 19.936 과 일치.

   OFFSET 이 정수가 아니므로 Leaflet 줌도 정수가 아니다.
   zoomSnap:0 으로 두고 허용 줌을 {OFFSET−1 … OFFSET−14} 격자에 스냅시킨다.
   위도에 따라 OFFSET 이 아주 조금 달라지지만(달성군 전역에서 0.005 미만)
   화면상 오차는 1px 미만이라 무시한다.
   ============================================================ */
(function (global) {
'use strict';

var BASE_RES = 0.25;              // 카카오 level 1 해상도 (m/px)
var WEB_RES  = 156543.03392;      // 웹메르카토르 zoom 0 적도 해상도 (m/px)
var MIN_LEVEL = 1, MAX_LEVEL = 14;

/** 해당 위도에서의 zoom↔level 오프셋 (이론값, 보정 전 초기치) */
function zoomOffset(lat) {
    return Math.log(WEB_RES * Math.cos(lat * Math.PI / 180) / (BASE_RES / 2)) / Math.LN2;
}

/**
 * 실측 보정 — 이론값만 쓰면 스케일이 약 1.5% 어긋난다(검증으로 확인).
 * 카카오 지도가 실제로 잡은 경도폭과 Leaflet 의 경도폭을 같게 만드는 OFFSET 을 역산한다.
 *
 * Leaflet(EPSG:3857) 에서 폭 px 픽셀에 담기는 경도폭 = px × 360 / (256 × 2^z)
 * 이 식은 위도와 무관하므로 cos(위도) 가정이 필요 없다.
 *   → z = log2( px × 360 / (256 × 카카오경도폭) ),  OFFSET = z + level
 */
function calibrate(kmap, widthPx, level) {
    if (!widthPx) return null;
    var b = kmap.getBounds();
    if (!b) return null;
    var span = b.getNorthEast().getLng() - b.getSouthWest().getLng();
    if (!(span > 0)) return null;
    return Math.log(widthPx * 360 / (256 * span)) / Math.LN2 + level;
}

/* ---------- SDK 로딩 ---------- */

var loaded = false;

/** cb(err) — SDK 와 services 라이브러리가 준비되면 호출 */
function ready(cb) {
    if (loaded) { cb(null); return; }
    if (!global.kakao || !global.kakao.maps) {
        cb(new Error('카카오 지도 SDK가 로드되지 않았습니다. 개발자 콘솔에서 '
            + '제품 설정 → 카카오맵 활성화, 플랫폼 → Web 에 ' + location.origin
            + ' 등록을 확인하세요.'));
        return;
    }
    global.kakao.maps.load(function () { loaded = true; cb(null); });
}

/* ---------- 부착 ---------- */

/**
 * initKakaoBaseMap(leafletMap, opts)
 *   opts.containerId  카카오 지도를 그릴 div id (기본 'kakao-map')
 *   opts.mapTypeId    'ROADMAP' | 'SKYVIEW' | 'HYBRID'  (기본 ROADMAP)
 *   opts.lat          OFFSET 계산 기준 위도 (기본 지도 중심)
 * 반환: 컨트롤러 객체
 */
function initKakaoBaseMap(leafletMap, opts) {
    opts = opts || {};
    var el = document.getElementById(opts.containerId || 'kakao-map');
    if (!el) throw new Error('카카오 지도 컨테이너를 찾을 수 없습니다.');

    var c0 = leafletMap.getCenter();
    var OFFSET = zoomOffset(opts.lat !== undefined ? opts.lat : c0.lat);

    var kmap = new kakao.maps.Map(el, {
        center: new kakao.maps.LatLng(c0.lat, c0.lng),
        level: clampLevel(Math.round(OFFSET - leafletMap.getZoom())),
        draggable: false,          // 조작은 전부 Leaflet 이 받는다
        scrollwheel: false,
        disableDoubleClickZoom: true,
        keyboardShortcuts: false,
        tileAnimation: false
    });
    kmap.setMapTypeId(kakao.maps.MapTypeId[opts.mapTypeId || 'ROADMAP']);

    function clampLevel(L) {
        return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, L));
    }

    /** Leaflet 줌 → 카카오 레벨 */
    function levelOf(zoom) { return clampLevel(Math.round(OFFSET - zoom)); }
    /** 카카오 레벨 → Leaflet 줌 */
    function zoomOf(level) { return OFFSET - clampLevel(level); }
    /** 임의의 줌을 허용 격자에 스냅 */
    function snap(zoom) { return zoomOf(levelOf(zoom)); }

    var syncing = false;

    function sync() {
        if (syncing) return;
        syncing = true;
        var c = leafletMap.getCenter();
        var L = levelOf(leafletMap.getZoom());
        if (kmap.getLevel() !== L) kmap.setLevel(L);
        kmap.setCenter(new kakao.maps.LatLng(c.lat, c.lng));
        syncing = false;
    }

    /** 줌이 격자에서 벗어나면 되돌린다 (fitBounds 등이 임의 줌을 만든다) */
    function snapIfNeeded() {
        var z = leafletMap.getZoom(), s = snap(z);
        if (Math.abs(z - s) > 1e-6) { leafletMap.setZoom(s, { animate: false }); return true; }
        return false;
    }

    leafletMap.on('move zoom', sync);
    leafletMap.on('moveend', sync);
    leafletMap.on('zoomend', function () { if (!snapIfNeeded()) sync(); });
    leafletMap.on('resize', function () { kmap.relayout(); sync(); });

    /* 레이아웃이 잡힌 뒤 실측으로 OFFSET 을 보정한다.
       이론값과 크게 다르면(±0.5 초과) 측정이 잘못된 것으로 보고 무시한다. */
    var calibrated = false;
    function tryCalibrate() {
        if (calibrated) return true;
        var w = el.clientWidth;
        if (!w) return false;
        var m = calibrate(kmap, w, kmap.getLevel());
        if (m === null || Math.abs(m - OFFSET) > 0.5) return false;
        OFFSET = m;
        calibrated = true;
        applyZoomLimits();
        snapIfNeeded();
        sync();
        return true;
    }

    /** 카카오 레벨 1~14 에 대응하는 줌 범위를 Leaflet 에 반영 */
    function applyZoomLimits() {
        leafletMap.setMinZoom(zoomOf(MAX_LEVEL));
        leafletMap.setMaxZoom(zoomOf(MIN_LEVEL));
    }
    applyZoomLimits();

    // 시작 줌도 격자에 맞춘다
    snapIfNeeded();
    sync();
    setTimeout(function () {
        kmap.relayout();
        sync();
        // 컨테이너 크기가 늦게 잡히는 환경 대비 — 최대 5초간 재시도
        var t = 0;
        (function retry() {
            if (tryCalibrate() || t++ > 50) return;
            setTimeout(retry, 100);
        })();
    }, 0);

    /* ---------- 컨트롤러 ---------- */

    var districtOn = false;

    return {
        kakaoMap: kmap,
        /** 보정 후 값이 바뀌므로 스냅샷이 아닌 함수로 준다 */
        getOffset: function () { return OFFSET; },
        isCalibrated: function () { return calibrated; },
        levelOf: levelOf,
        zoomOf: zoomOf,
        snap: snap,

        /** 최소·최대 레벨에 대응하는 Leaflet 줌 범위 */
        zoomRange: function () {
            return { min: zoomOf(MAX_LEVEL), max: zoomOf(MIN_LEVEL) };
        },

        /** 'ROADMAP' | 'SKYVIEW' | 'HYBRID' */
        setMapType: function (id) {
            kmap.setMapTypeId(kakao.maps.MapTypeId[id]);
        },

        /** 지적편집도(용도지역) 오버레이 on/off — 공시지가 검토에 유용 */
        setDistrict: function (on) {
            districtOn = !!on;
            if (districtOn) kmap.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            else kmap.removeOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            return districtOn;
        },
        districtOn: function () { return districtOn; },

        relayout: function () { kmap.relayout(); sync(); }
    };
}

global.KakaoBase = { ready: ready, init: initKakaoBaseMap, zoomOffset: zoomOffset };
global.initKakaoBaseMap = initKakaoBaseMap;   // 참고 프로젝트와 같은 이름

})(window);
