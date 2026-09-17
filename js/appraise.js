/* ============================================================
   appraise.js — 공시지가 산정 도메인 로직 (DOM 의존 없음)
   ------------------------------------------------------------
   표본목록.xls 1,043필지를 역산해 확인한 관계식 (모두 일치율 100%)

     1) 결정 공시지가   price = sigRound( (A조가격 + B조가격) / 2 )      · 685/685
        · 단수조(한 조만 평가)는 해당 조 가격을 그대로 사용
     2) 유효숫자 반올림 sigRound(x) = x >= 100,000 이면 유효숫자 4자리,
                                      그 미만이면 유효숫자 3자리 (반올림)
     3) '27 반영률      r27  = round( price / 시가수준 * 100 , 2 )        · 1043/1043
     4) '26 반영률      r26  = round( prev  / 전년시가수준 * 100 , 2 )    · 1043/1043
     5) 단순증감률      chg  = round( (price/prev - 1) * 100 , 1 )        · 1043/1043
     6) 시가수준변동률  mchg = round( (mkt/pmkt - 1) * 100 , 1 )          · 1043/1043
     7) A·B조 격차율    gap  = round( (A - B) / A * 100 , 2 )             ·  685/685

   → 즉 산정 흐름은  A·B조 평가액 → (평균·유효숫자 반올림) → 공시지가
                     공시지가 ÷ 시가수준 → 반영률
     반영률은 결과값이지 입력값이 아니다. 시뮬레이터에서 반영률을 조정하면
     역으로 목표 공시지가를 계산한다.
   ============================================================ */
(function (global) {
'use strict';

/* ---------- 수치 유틸 ---------- */

/** 유효숫자 n자리 반올림 */
function sigFig(x, n) {
    if (!isFinite(x) || x <= 0) return 0;
    var p = Math.floor(Math.log(x) / Math.LN10);
    var m = Math.pow(10, n - 1 - p);
    return Math.round(x * m) / m;
}

/** 공시지가 표시 단위 반올림: 10만원 이상 유효숫자 4자리, 미만 3자리 */
function sigRound(x) {
    if (!isFinite(x) || x <= 0) return 0;
    return sigFig(x, x >= 100000 ? 4 : 3);
}

function round(x, d) {
    if (!isFinite(x)) return 0;
    var m = Math.pow(10, d || 0);
    return (x >= 0 ? Math.round(x * m) : -Math.round(-x * m)) / m;
}

/* ---------- 산정식 ---------- */

/** A조·B조 평가액 → 결정 공시지가. 한쪽만 있으면 단수조로 처리 */
function decidePrice(pa, pb) {
    pa = +pa || 0; pb = +pb || 0;
    if (pa > 0 && pb > 0) return sigRound((pa + pb) / 2);
    if (pa > 0) return sigRound(pa);
    if (pb > 0) return sigRound(pb);
    return 0;
}

/** 반영률(%) = 공시지가 / 시가수준 × 100 */
function ratio(price, mkt) {
    if (!(mkt > 0)) return 0;
    return round(price / mkt * 100, 2);
}

/** 반영률에서 역산한 목표 공시지가 */
function priceFromRatio(mkt, rate) {
    if (!(mkt > 0)) return 0;
    return sigRound(mkt * rate / 100);
}

/** 증감률(%) — 소수 1자리 */
function changeRate(now, before) {
    if (!(before > 0)) return 0;
    return round((now / before - 1) * 100, 1);
}

/** A·B조 격차율(%) = (A − B) / A × 100 — 소수 2자리 */
function gapRate(pa, pb) {
    if (!(pa > 0) || !(pb > 0)) return 0;
    return round((pa - pb) / pa * 100, 2);
}

/* ---------- 레코드 구성 ---------- */

/** PARCEL_FIELDS / PARCEL_ROWS → 객체 배열 + 파생값 */
function buildRecords(fields, rows) {
    var out = new Array(rows.length);
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i], o = { idx: i };
        for (var f = 0; f < fields.length; f++) o[fields[f]] = r[f];
        o.singleGroup = !(o.pa > 0 && o.pb > 0);      // 단수조 여부
        o.key = o.pnu || (o.loc + '#' + i);
        o.groupKey = o.dong + '|' + (o.use || '미상'); // 균형성 비교 단위
        derive(o);
        out[i] = o;
    }
    return out;
}

/** 필지 한 건의 재산정 결과 */
function derive(o) {
    o.calcPrice = decidePrice(o.pa, o.pb);                 // A·B조 → 결정가격
    o.calcRatio = ratio(o.price, o.mkt);                   // 실제 반영률
    o.calcChg = changeRate(o.price, o.prev);               // 실제 증감률
    o.calcMchg = changeRate(o.mkt, o.pmkt);                // 시가수준 변동률
    o.calcGap = gapRate(o.pa, o.pb);                       // A·B 격차율
    o.ratioPrice = priceFromRatio(o.mkt, o.r27);           // 반영률 역산 지가

    // 산정 오차: 결정가격(A·B조 평균) 대비 실제 공시지가 편차(%)
    o.residPct = o.calcPrice > 0 ? round((o.price - o.calcPrice) / o.calcPrice * 100, 4) : 0;
    // 반영률 정합성: 공시지가와 시가수준×반영률의 편차(%)
    o.ratioDiffPct = o.ratioPrice > 0 ? round((o.price - o.ratioPrice) / o.ratioPrice * 100, 4) : 0;
    // 단가 지표
    o.total = o.price * o.area;
    return o;
}

/* ---------- 균형성(이상치) ---------- */

/**
 * 동일 그룹(읍면 × 이용상황) 내 log 단가의 z-score.
 * 표본 3건 미만 그룹은 읍면 전체로 대체, 그래도 부족하면 0.
 */
function computeBalance(recs) {
    var g = {}, i, r;
    for (i = 0; i < recs.length; i++) {
        r = recs[i];
        if (!(r.price > 0)) continue;
        (g[r.groupKey] || (g[r.groupKey] = [])).push(Math.log(r.price));
        var dk = 'DONG|' + r.dong;
        (g[dk] || (g[dk] = [])).push(Math.log(r.price));
    }
    var stat = {};
    for (var k in g) {
        var a = g[k], n = a.length, s = 0, j;
        for (j = 0; j < n; j++) s += a[j];
        var mu = s / n, v = 0;
        for (j = 0; j < n; j++) v += (a[j] - mu) * (a[j] - mu);
        stat[k] = { n: n, mu: mu, sd: n > 1 ? Math.sqrt(v / (n - 1)) : 0 };
    }
    for (i = 0; i < recs.length; i++) {
        r = recs[i];
        var st = stat[r.groupKey];
        r.balanceScope = '읍면×이용상황';
        if (!st || st.n < 3 || !(st.sd > 0)) {
            st = stat['DONG|' + r.dong];
            r.balanceScope = '읍면 전체';
        }
        if (!st || st.n < 3 || !(st.sd > 0) || !(r.price > 0)) {
            r.zdev = 0; r.groupN = st ? st.n : 0; r.groupMedian = 0;
            r.balanceScope = '표본 부족';
            continue;
        }
        r.zdev = round((Math.log(r.price) - st.mu) / st.sd, 2);
        r.groupN = st.n;
        r.groupMedian = Math.round(Math.exp(st.mu));
    }
    return recs;
}

/* ---------- 검수(플래그) ---------- */

var DEFAULT_TH = { resid: 0.5, gap: 3, chg: 10, z: 2 };

/** 필지별 검수 사유 목록. 심각도: critical > serious > warning */
function auditFlags(r, th) {
    th = th || DEFAULT_TH;
    var f = [];

    // 1) A·B조 평균과 결정 공시지가 불일치 — 산정 절차 오류
    if (r.calcPrice > 0 && Math.abs(r.residPct) > th.resid) {
        f.push({ level: 'critical', code: 'RESID',
            text: 'A·B조 평균 산정액(' + fmtWon(r.calcPrice) + ')과 공시지가가 '
                + fmtPct(r.residPct, 2) + ' 차이' });
    }
    // 2) 반영률 정합성 — 시가수준 × 반영률 ≠ 공시지가
    if (r.ratioPrice > 0 && Math.abs(r.ratioDiffPct) > 0.02) {
        f.push({ level: 'serious', code: 'RATIO',
            text: '시가수준×반영률(' + fmtWon(r.ratioPrice) + ')과 공시지가 불일치' });
    }
    // 3) A·B조 격차 과다
    if (!r.singleGroup && Math.abs(r.calcGap) > th.gap) {
        f.push({ level: 'serious', code: 'GAP',
            text: 'A·B조 격차율 ' + fmtPct(r.calcGap, 2) + ' (허용 ±' + th.gap + '%)' });
    }
    // 4) 전년 대비 급변
    if (r.prev > 0 && Math.abs(r.calcChg) > th.chg) {
        f.push({ level: 'warning', code: 'CHG',
            text: '전년 대비 ' + fmtPct(r.calcChg, 1) + ' 변동 (허용 ±' + th.chg + '%)' });
    }
    // 5) 균형성 편차 — 동일 그룹 대비 단가 이탈
    if (r.zdev && Math.abs(r.zdev) > th.z) {
        f.push({ level: 'warning', code: 'ZDEV',
            text: r.balanceScope + ' 중위 ' + fmtWon(r.groupMedian) + ' 대비 '
                + (r.zdev > 0 ? '+' : '') + r.zdev + 'σ 이탈 (n=' + r.groupN + ')' });
    }
    // 6) 시가수준은 올랐는데 공시지가는 내렸거나 그 반대 — 방향 불일치
    if (r.pmkt > 0 && r.prev > 0 && r.calcMchg !== 0 && r.calcChg !== 0
        && (r.calcMchg > 0) !== (r.calcChg > 0)) {
        f.push({ level: 'warning', code: 'DIR',
            text: '시가수준 ' + fmtPct(r.calcMchg, 1) + ' vs 공시지가 '
                + fmtPct(r.calcChg, 1) + ' — 변동 방향 불일치' });
    }
    // 7) 단수조 — 교차검증 불가
    if (r.singleGroup) {
        f.push({ level: 'warning', code: 'SINGLE', text: '단수조 평가 — A·B조 교차검증 불가' });
    }
    return f;
}

var LEVEL_WEIGHT = { critical: 100, serious: 30, warning: 8 };

function applyAudit(recs, th) {
    for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        r.flags = auditFlags(r, th);
        var score = 0, worst = null;
        for (var j = 0; j < r.flags.length; j++) {
            score += LEVEL_WEIGHT[r.flags[j].level] || 0;
            if (!worst || LEVEL_WEIGHT[r.flags[j].level] > LEVEL_WEIGHT[worst]) worst = r.flags[j].level;
        }
        // 단수조만 걸린 건은 검수 대상에서 제외 (정상 케이스)
        var onlySingle = r.flags.length === 1 && r.flags[0].code === 'SINGLE';
        r.auditScore = onlySingle ? 0 : score;
        r.auditLevel = onlySingle ? null : worst;
        r.flagged = r.auditScore > 0;
    }
    return recs;
}

/* ---------- 집계 ---------- */

function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var pos = (sorted.length - 1) * q, b = Math.floor(pos), rest = pos - b;
    return sorted[b + 1] !== undefined ? sorted[b] + rest * (sorted[b + 1] - sorted[b]) : sorted[b];
}

function summarize(recs) {
    var p = [], areaSum = 0, valSum = 0, chgs = [], ratios = [], flagged = 0, geo = 0, i, r;
    for (i = 0; i < recs.length; i++) {
        r = recs[i];
        if (r.price > 0) { p.push(r.price); areaSum += r.area; valSum += r.price * r.area; }
        if (r.prev > 0) chgs.push(r.calcChg);
        if (r.r27 > 0) ratios.push(r.r27);
        if (r.flagged) flagged++;
        if (r.lat) geo++;
    }
    p.sort(function (a, b) { return a - b; });
    chgs.sort(function (a, b) { return a - b; });
    ratios.sort(function (a, b) { return a - b; });
    var chgMean = 0;
    for (i = 0; i < chgs.length; i++) chgMean += chgs[i];
    return {
        n: recs.length,
        geo: geo,
        flagged: flagged,
        min: p.length ? p[0] : 0,
        max: p.length ? p[p.length - 1] : 0,
        median: quantile(p, .5),
        q1: quantile(p, .25),
        q3: quantile(p, .75),
        areaSum: areaSum,
        valSum: valSum,
        wAvg: areaSum > 0 ? valSum / areaSum : 0,       // 면적가중 평균 단가
        chgMean: chgs.length ? chgMean / chgs.length : 0,
        chgMedian: quantile(chgs, .5),
        ratioMedian: quantile(ratios, .5),
        prices: p
    };
}

/** 로그 스케일 히스토그램 (0 제외) */
function histogram(values, bins) {
    bins = bins || 22;
    var v = values.filter(function (x) { return x > 0; });
    if (!v.length) return { bins: [], min: 0, max: 0 };
    var lo = Math.log(Math.min.apply(null, v)), hi = Math.log(Math.max.apply(null, v));
    if (hi === lo) hi = lo + 1;
    var arr = new Array(bins), i;
    for (i = 0; i < bins; i++) arr[i] = 0;
    for (i = 0; i < v.length; i++) {
        var b = Math.floor((Math.log(v[i]) - lo) / (hi - lo) * bins);
        if (b >= bins) b = bins - 1; if (b < 0) b = 0;
        arr[b]++;
    }
    return { bins: arr, min: Math.exp(lo), max: Math.exp(hi) };
}

/* ---------- 표시 포맷 ---------- */

function fmtWon(x) {
    if (!isFinite(x) || x === 0) return '-';
    return Math.round(x).toLocaleString('ko-KR');
}
function fmtPct(x, d) {
    if (!isFinite(x)) return '-';
    d = d === undefined ? 1 : d;
    return (x > 0 ? '+' : '') + x.toFixed(d) + '%';
}
function fmtArea(x) {
    if (!isFinite(x) || x === 0) return '-';
    return x.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '㎡';
}
/** 큰 금액 축약 (억/만) */
function fmtShort(x) {
    if (!isFinite(x) || x === 0) return '-';
    if (x >= 1e8) return (x / 1e8).toFixed(x >= 1e9 ? 0 : 1) + '억';
    if (x >= 1e4) return Math.round(x / 1e4).toLocaleString('ko-KR') + '만';
    return Math.round(x).toLocaleString('ko-KR');
}

global.Appraise = {
    sigFig: sigFig, sigRound: sigRound, round: round,
    decidePrice: decidePrice, ratio: ratio, priceFromRatio: priceFromRatio,
    changeRate: changeRate, gapRate: gapRate,
    buildRecords: buildRecords, derive: derive,
    computeBalance: computeBalance, auditFlags: auditFlags, applyAudit: applyAudit,
    DEFAULT_TH: DEFAULT_TH,
    summarize: summarize, histogram: histogram, quantile: quantile,
    fmtWon: fmtWon, fmtPct: fmtPct, fmtArea: fmtArea, fmtShort: fmtShort
};

})(window);
