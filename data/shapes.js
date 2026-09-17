/* 필지 외곽선(지적 경계) — PNU → 폴리곤 링
 *
 *   PARCEL_SHAPES = { "<PNU>": [[위도, 경도], [위도, 경도], ...] }
 *
 * 카카오 지도 SDK 는 Polygon(그리기)은 제공하지만 필지 경계 좌표 자체는 주지 않는다.
 * (kakao.maps.services 에는 Geocoder·Places 뿐, 지적 데이터 API 가 없다)
 * 따라서 경계 좌표는 외부에서 받아 이 파일에 넣어야 한다.
 *
 * 받을 수 있는 곳
 *   · VWorld 데이터 API  — LP_PA_CBND_BUBUN(연속지적도 부분) 레이어를 PNU 로 조회.
 *                          무료지만 API 키 발급과 도메인 등록이 필요하다.
 *   · 국가공간정보포털 / data.go.kr — 연속지적도 SHP 를 내려받아 변환.
 *
 * 비어 있으면 외곽선은 그리지 않고 원형 마커만 표시된다(기능 저하 없음).
 */
var PARCEL_SHAPES = {
};
