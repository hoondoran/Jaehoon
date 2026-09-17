/* ============================================================
   geocode.js — 지번주소 → 좌표 변환 (카카오 로컬 SDK)
   ------------------------------------------------------------
   · 1순위 지번주소(엑셀 G열 "표준지 위치"), 2순위 도로명주소로 조회
   · 결과는 localStorage 캐시 + data/coords.js 정적 파일 두 곳에 보관
   · 한 번 변환해 coords.js 로 저장해 두면 이후에는 즉시 로딩된다
   ============================================================ */
(function (global) {
'use strict';

var CACHE_KEY = 'gongsi.coords.v1';
var DELAY_MS = 110;          // 카카오 로컬 호출 간격
var running = false, stopFlag = false;

/* ---------- 캐시 ---------- */

function loadCache() {
    try {
        var raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }
    catch (e) { console.warn('좌표 캐시 저장 실패(용량 초과 가능):', e); }
}

/** 정적 coords.js + localStorage 캐시를 레코드에 주입 */
function hydrate(recs) {
    var stat = global.PARCEL_COORDS || {};
    var cache = loadCache();
    var n = 0;
    for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        var c = cache[r.key] || stat[r.key];
        if (c && c.length >= 2 && c[0]) {
            r.lat = c[0]; r.lng = c[1]; r.geoSrc = c[2] || 'jibun';
            n++;
        } else {
            r.lat = null; r.lng = null; r.geoSrc = null;
        }
    }
    return { total: recs.length, geocoded: n, cacheCount: Object.keys(cache).length };
}

/* ---------- 카카오 SDK ---------- */

var geocoder = null, sdkReady = false;

function ready(cb) {
    if (sdkReady) { cb(null); return; }
    if (!global.kakao || !global.kakao.maps) {
        // SDK 스크립트 자체가 실행되지 않은 상태.
        // 흔한 원인은 앱의 카카오맵(OPEN_MAP_AND_LOCAL) 서비스가 꺼져 있는 경우로,
        // 이때 SDK URL은 JS 대신 NotAuthorizedError JSON을 돌려준다.
        cb(new Error('카카오 지도 SDK가 로드되지 않았습니다. 개발자 콘솔 → 내 애플리케이션 → '
            + '제품 설정 → 카카오맵이 [활성화 ON] 인지, 플랫폼 → Web 에 ' + location.origin
            + ' 이(가) 등록돼 있는지 확인하세요. SDK 주소를 브라우저에 직접 열어보면 원인이 JSON으로 나옵니다.'));
        return;
    }
    global.kakao.maps.load(function () {
        if (!kakao.maps.services) {
            cb(new Error('카카오 services 라이브러리가 없습니다. SDK URL에 libraries=services 가 필요합니다.'));
            return;
        }
        geocoder = new kakao.maps.services.Geocoder();
        sdkReady = true;
        cb(null);
    });
}

/**
 * 주소 1건 조회.
 * 반환: { pt:[위도,경도] } | { empty:true } | { hardError:true }
 *
 * 카카오는 "결과 없음"(ZERO_RESULT)과 "호출 거부"(도메인 미등록 등)를 구분한다.
 * 후자는 주소를 바꿔 재시도해도 소용없으므로 따로 구분해서 올린다.
 */
function search(query) {
    return new Promise(function (resolve) {
        var S = kakao.maps.services.Status;
        geocoder.addressSearch(query, function (res, status) {
            if (status === S.OK && res && res.length) {
                resolve({ pt: [parseFloat(res[0].y), parseFloat(res[0].x)] });
            } else if (status === S.ZERO_RESULT) {
                resolve({ empty: true });
            } else {
                resolve({ hardError: true });
            }
        });
    });
}

/** 한 필지에 대해 후보 주소를 순서대로 시도 */
function queriesFor(r, region) {
    var q = [];
    if (r.loc) {
        q.push({ s: region + ' ' + r.loc, src: 'jibun' });
        // "산68" 처럼 산번지는 공백 표기로도 조회
        if (/(^|\s)산\d/.test(r.loc)) q.push({ s: region + ' ' + r.loc.replace(/산(\d)/, '산 $1'), src: 'jibun' });
    }
    if (r.road) q.push({ s: region + ' ' + r.road, src: 'road' });
    // 최후: 본번만 (부번 없는 상위 필지로 근사)
    if (r.loc && r.loc.indexOf('-') > -1) {
        q.push({ s: region + ' ' + r.loc.split('-')[0], src: 'approx' });
    }
    return q;
}

/* ---------- 실행 ---------- */

/**
 * opts: { records, region, onProgress(done,total,rec), onDone(stats), onError(err) }
 */
function run(opts) {
    if (running) return;
    var recs = opts.records, region = opts.region || '';
    var todo = recs.filter(function (r) { return !r.lat; });
    if (!todo.length) { opts.onDone && opts.onDone({ ok: 0, fail: 0, skipped: recs.length }); return; }

    ready(function (err) {
        if (err) { opts.onError && opts.onError(err); return; }
        running = true; stopFlag = false;
        var cache = loadCache();
        var i = 0, ok = 0, fail = 0, hardErrors = 0;

        /* 초반 호출이 전부 거부되면 주소 문제가 아니라 설정 문제다. 계속 돌릴 이유가 없다. */
        function abortOnDomainError() {
            running = false;
            saveCache(cache);
            opts.onError && opts.onError(new Error(
                '카카오 주소 검색이 거부되었습니다. appkey의 Web 플랫폼에 '
                + location.origin + ' 이(가) 등록돼 있는지 확인하세요 '
                + '(개발자 콘솔 → 내 애플리케이션 → 플랫폼 → Web). '
                + '등록이 어려우면 [⬆ 좌표 CSV]로 좌표를 넣을 수 있습니다.'));
        }

        function step() {
            if (stopFlag || i >= todo.length) {
                saveCache(cache);
                running = false;
                opts.onDone && opts.onDone({ ok: ok, fail: fail, stopped: stopFlag, total: todo.length });
                return;
            }
            var r = todo[i], qs = queriesFor(r, region), qi = 0;

            function tryNext() {
                if (qi >= qs.length) {
                    fail++; i++;
                    opts.onProgress && opts.onProgress(i, todo.length, r);
                    setTimeout(step, DELAY_MS);
                    return;
                }
                var q = qs[qi++];
                search(q.s).then(function (res) {
                    if (res.hardError) {
                        // 아직 한 건도 성공하지 못한 채 거부만 5회 → 설정 문제로 보고 중단
                        if (++hardErrors >= 5 && ok === 0) { abortOnDomainError(); return; }
                        setTimeout(tryNext, DELAY_MS);
                        return;
                    }
                    if (res.pt) {
                        r.lat = res.pt[0]; r.lng = res.pt[1]; r.geoSrc = q.src;
                        cache[r.key] = [res.pt[0], res.pt[1], q.src];
                        ok++; i++;
                        if (ok % 25 === 0) saveCache(cache);   // 중간 저장
                        opts.onProgress && opts.onProgress(i, todo.length, r);
                        setTimeout(step, DELAY_MS);
                    } else {
                        setTimeout(tryNext, DELAY_MS);
                    }
                });
            }
            tryNext();
        }
        step();
    });
}

function stop() { stopFlag = true; }
function isRunning() { return running; }

/* ---------- 내보내기 ---------- */

/** 현재 확보된 좌표를 data/coords.js 형식으로 직렬화 */
function serialize(recs) {
    var lines = [];
    for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r.lat) continue;
        lines.push('"' + r.key + '":[' + r.lat.toFixed(7) + ',' + r.lng.toFixed(7)
            + ',"' + (r.geoSrc || 'jibun') + '"]');
    }
    return '/* 자동 생성 — 지번주소 지오코딩 결과 캐시\n'
        + ' * 키: PNU, 값: [위도, 경도, 출처(jibun|road|approx)]\n'
        + ' * 페이지의 "coords.js 저장" 버튼으로 재생성한다. */\n'
        + 'var PARCEL_COORDS = {\n' + lines.join(',\n') + '\n};\n';
}

/**
 * tools/serve.ps1 로 띄운 로컬 개발서버라면 data/coords.js 를 바로 덮어쓴다.
 * (GitHub Pages 등 정적 호스팅에서는 실패하므로 호출부에서 다운로드로 넘어간다)
 * 반환: Promise<bytes>
 */
function saveToServer(recs) {
    return fetch('__save-coords', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: serialize(recs)
    }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function (j) {
        if (!j.ok) throw new Error('저장 실패');
        return j.bytes;
    });
}

function download(recs) {
    var blob = new Blob([serialize(recs)], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coords.js';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

/* ---------- 좌표 CSV 가져오기 ----------
   카카오 appkey를 쓸 수 없는 환경(도메인 미등록 등)을 위한 대체 경로.
   PNU·위도·경도 열을 가진 CSV면 헤더 이름을 자동으로 찾아 읽는다.
   헤더가 없으면 1·2·3열을 PNU, 위도, 경도로 본다.                          */

function splitCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (q) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
}

function findCol(head, names) {
    for (var i = 0; i < head.length; i++) {
        var h = head[i].toLowerCase().replace(/\s/g, '');
        for (var j = 0; j < names.length; j++) if (h.indexOf(names[j]) > -1) return i;
    }
    return -1;
}

/** 반환: { matched, unmatched, rows } */
function importCsv(text, recs) {
    text = text.replace(/^﻿/, '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { matched: 0, unmatched: 0, rows: 0 };

    var head = splitCsvLine(lines[0]);
    var ci = { pnu: findCol(head, ['pnu', '고유번호', '필지고유']),
               lat: findCol(head, ['위도', 'lat', 'y']),
               lng: findCol(head, ['경도', 'lng', 'lon', 'x']) };
    var start = 1;
    if (ci.pnu < 0 || ci.lat < 0 || ci.lng < 0) { ci = { pnu: 0, lat: 1, lng: 2 }; start = 0; }

    var byKey = {};
    for (var i = 0; i < recs.length; i++) byKey[recs[i].key] = recs[i];

    var cache = loadCache(), matched = 0, unmatched = 0, rows = 0;
    for (var n = start; n < lines.length; n++) {
        var c = splitCsvLine(lines[n]);
        var key = (c[ci.pnu] || '').replace(/[^0-9]/g, '');
        var la = parseFloat(c[ci.lat]), ln = parseFloat(c[ci.lng]);
        if (!key || !isFinite(la) || !isFinite(ln)) continue;
        rows++;
        // 위경도가 뒤바뀐 파일도 허용 (한국: 위도 33~39, 경도 124~132)
        if (la > 100 && ln < 100) { var t = la; la = ln; ln = t; }
        var r = byKey[key];
        if (!r) { unmatched++; continue; }
        r.lat = la; r.lng = ln; r.geoSrc = 'csv';
        cache[key] = [la, ln, 'csv'];
        matched++;
    }
    saveCache(cache);
    return { matched: matched, unmatched: unmatched, rows: rows };
}

global.Geo = {
    hydrate: hydrate, run: run, stop: stop, isRunning: isRunning,
    serialize: serialize, download: download, saveToServer: saveToServer,
    clearCache: clearCache, importCsv: importCsv
};

})(window);
