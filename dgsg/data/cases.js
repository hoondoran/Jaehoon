/* 자동 생성 — 동경상경빌딩_가격자료_261012_v3.xlsx 에서 추출
 *
 *   본건     : 역삼동 824-19(동경빌딩) · 824-20, 824-21(상경빌딩)
 *   표준지   : 토지 시트
 *   거래사례 : 사례 시트 (블록 레이아웃을 필지 단위로 펼침)
 *   임대사례 : 임대사례 시트
 *
 * ※ 진행 중인 용역 자료입니다. 열람 외 목적의 인용·재배포를 금합니다.
 */

var PROJECT = {
    name: '동경상경빌딩',
    base: '2026-10-06',
    note: '탁상 · 일반거래',
    subjects: [
        { key: '동경빌딩', land: 221664400000, bld: 3813279300, area: 9836.18 },
        { key: '상경빌딩', land: 222773400000, bld: 2520341850, area: 9523.01 }
    ],
    totalLand: 444437800000,
    totalBld: 6333621150
};

/* 본건 — 결정단가는 토지 시트의 "결정단가(원/㎡)" */
var SUBJECT_LOTS = [
    {t:"subject",name:"동경빌딩",dong:"역삼동",jibun:"824-19",addr:"서울특별시 강남구 역삼동 824-19",
     area:1125.2,zone:"일반상업",jimok:"대",shape:"세장형",slope:"평지",road:"광대세각",
     gongsi:73830000,unit:197000000,value:221664400000,bldArea:9836.18,appr:"1991-07-12"},
    {t:"subject",name:"상경빌딩",dong:"역삼동",jibun:"824-20",addr:"서울특별시 강남구 역삼동 824-20",
     area:536.7,zone:"일반상업",jimok:"대",shape:"가장형",slope:"평지",road:"광대소각",
     gongsi:79210000,unit:207000000,value:111096900000,bldArea:9523.01,appr:"1986-05-08"},
    {t:"subject",name:"상경빌딩",dong:"역삼동",jibun:"824-21",addr:"서울특별시 강남구 역삼동 824-21",
     area:539.5,zone:"일반상업",jimok:"대",shape:"가장형",slope:"평지",road:"광대소각",
     gongsi:79210000,unit:207000000,value:111676500000,bldArea:0,appr:""}
];

/* 표준지 */
var STD_LOTS = [
    {t:"std",dong:"역삼동",jibun:"649-14",addr:"서울특별시 강남구 역삼동 649-14",
     year:2026,area:965.0,jimok:"대",use:"업무용",zone:"일반상업",
     gongsi:76910000,prev:72120000,road:"광대소각",shape:"세장형",slope:"평지"}
];

/* 거래사례 · 임대사례 */
var ITEMS = [
{t:"sale",dong:"역삼동",jibun:"826-14",gu:"강남구",addr:"서울특별시 강남구 역삼동 826-14",date:"2026-07-16",amount:445000000000,landArea:2377.8,landUnit:179000000,bldArea:32685.7,bldUnit:588000,use:"근생",struct:"철콘",appr:"1996-08-13",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"826-7",gu:"강남구",addr:"서울특별시 강남구 역삼동 826-7",date:"2026-09-11",amount:58500000000,landArea:214,landUnit:119000000,bldArea:1999.97,bldUnit:1800000,use:"근생",struct:"철콘",appr:"2026-05-26",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"826-62",gu:"강남구",addr:"서울특별시 강남구 역삼동 826-62",date:"2026-09-11",amount:58500000000,landArea:214,landUnit:119000000,bldArea:1999.51,bldUnit:1800000,use:"근생",struct:"철콘",appr:"2026-05-26",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"679-4",gu:"강남구",addr:"서울특별시 강남구 역삼동 679-4",date:"2025-06-20",amount:897133000000,landArea:3587,landUnit:233000000,bldArea:66202,bldUnit:900000,use:"근생",struct:"철콘",appr:"1999-11-24",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"824-22",gu:"강남구",addr:"서울특별시 강남구 역삼동 824-22",date:"2023-12-28",amount:165731405658,landArea:600.8,landUnit:275851207,bldArea:0,bldUnit:0,use:"",struct:"",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"824-23",gu:"강남구",addr:"서울특별시 강남구 역삼동 824-23",date:"2023-12-28",amount:57380075000,landArea:482.3,landUnit:118971749,bldArea:0,bldUnit:0,use:"",struct:"",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"824-24",gu:"강남구",addr:"서울특별시 강남구 역삼동 824-24",date:"2023-12-28",amount:78271515000,landArea:657.9,landUnit:118971751,bldArea:0,bldUnit:0,use:"",struct:"",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"824-46",gu:"강남구",addr:"서울특별시 강남구 역삼동 824-46",date:"2023-12-28",amount:50586795000,landArea:425.2,landUnit:118971766,bldArea:0,bldUnit:0,use:"",struct:"",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"역삼동",jibun:"736-1",gu:"강남구",addr:"서울특별시 강남구 역삼동 736-1",date:"2024-03-20",amount:791699725000,landArea:4172,landUnit:174000000,bldArea:62725.3,bldUnit:1001818,use:"근생",struct:"철골철근",appr:"1998-02-27",zone:"일반상업지역"},
{t:"sale",dong:"서초동",jibun:"1328-10",gu:"서초구",addr:"서울특별시 서초구 서초동 1328-10",date:"2024-11-07",amount:146800000000,landArea:855.6,landUnit:171575502,bldArea:0,bldUnit:-2258182,use:"나지",struct:"철골철콘",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"서초동",jibun:"1304-2",gu:"서초구",addr:"서울특별시 서초구 서초동 1304-2",date:"2024-07-26",amount:48500000000,landArea:212.5,landUnit:228235294,bldArea:0,bldUnit:-2258182,use:"나지",struct:"철골철콘",appr:"",zone:"일반상업지역"},
{t:"sale",dong:"서초동",jibun:"1321-20",gu:"서초구",addr:"서울특별시 서초구 서초동 1321-20",date:"2024-09-27",amount:1104200000000,landArea:5348.1,landUnit:191000000,bldArea:81117.3,bldUnit:992727,use:"근생",struct:"철골철콘",appr:"2007-12-24",zone:"일반상업지역"},
{t:"rent",name:"여삼빌딩",loc:"강남구 역삼동 648-23 외",addr:"서울특별시 강남구 역삼동 648-23",area:14256.6,appr:"1985-06-13",eff:63.91,deposit:1200000,rent:120000,mgmt:40000,eqRent:255000,free:"0",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"코레이트타워",loc:"강남구 역삼동 646",addr:"서울특별시 강남구 역삼동 646",area:34983.7,appr:"2001-08-31",eff:46.91,deposit:1500000,rent:150000,mgmt:50000,eqRent:434000,free:"1",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"하나금융그룹 강남사옥",loc:"강남구 역삼동 648-19",addr:"서울특별시 강남구 역삼동 648-19",area:24529.7,appr:"1994-11-30",eff:56.13,deposit:1730000,rent:173000,mgmt:46000,eqRent:398000,free:"0",vacancy:0.9,note:"집합건물",subject:false},
{t:"rent",name:"아크플레이스",loc:"강남구 역삼동 736-1",addr:"서울특별시 강남구 역삼동 736-1",area:62725.3,appr:"1998-02-27",eff:46.25,deposit:1960000,rent:196000,mgmt:51000,eqRent:545000,free:"-",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"빗썸금융타워",loc:"강남구 역삼동 648-9",addr:"서울특별시 강남구 역삼동 648-9",area:51126.3,appr:"2018-08-01",eff:53.54,deposit:1900000,rent:190000,mgmt:60000,eqRent:476000,free:"-",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"캠브리지강남빌딩",loc:"강남구 역삼동 825-18",addr:"서울특별시 강남구 역삼동 825-18",area:11544.5,appr:"2002-09-11",eff:55.14,deposit:1480000,rent:148000,mgmt:48000,eqRent:362000,free:"2",vacancy:0,note:"집합건물",subject:false},
{t:"rent",name:"역삼빌딩",loc:"강남구 역삼동 824",addr:"서울특별시 강남구 역삼동 824",area:34899.3,appr:"1996-03-28",eff:50.2,deposit:1460000,rent:146000,mgmt:46000,eqRent:390000,free:"2",vacancy:0,note:"집합건물",subject:false},
{t:"rent",name:"삼원타워",loc:"역삼동 823",addr:"서울특별시 강남구 역삼동 823",area:41365.1,appr:"1985-12-07",eff:56.87,deposit:1200000,rent:120000,mgmt:43000,eqRent:292000,free:"0",vacancy:6.07,note:"집합건물",subject:false},
{t:"rent",name:"GT대공빌딩",loc:"역삼동 823-21",addr:"서울특별시 강남구 역삼동 823-21",area:12970.7,appr:"1992-07-16",eff:58.3,deposit:1050000,rent:105000,mgmt:41500,eqRent:256000,free:"0",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"포스코타워 역삼",loc:"역삼동 735-3",addr:"서울특별시 강남구 역삼동 735-3",area:43202.8,appr:"2003-07-04",eff:46.07,deposit:1440000,rent:144000,mgmt:53000,eqRent:435000,free:"1",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"HK스퀘어",loc:"역삼동 647-14",addr:"서울특별시 강남구 역삼동 647-14",area:24895.5,appr:"1992-10-24",eff:55.96,deposit:1648000,rent:164800,mgmt:44290,eqRent:381000,free:"0",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"더피나클 역삼II",loc:"역삼동 646-15",addr:"서울특별시 강남구 역삼동 646-15",area:16695.8,appr:"2001-05-29",eff:63.47,deposit:1960000,rent:196000,mgmt:46500,eqRent:390000,free:"0",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"현익빌딩",loc:"역삼동 736-6",addr:"서울특별시 강남구 역삼동 736-6",area:9615.27,appr:"1993-05-08",eff:61.45,deposit:1204819,rent:135000,mgmt:55000,eqRent:314000,free:"0",vacancy:19.36,note:"토지건물",subject:false},
{t:"rent",name:"한국지식재산센터",loc:"역삼동 647-9",addr:"서울특별시 강남구 역삼동 647-9",area:48638.7,appr:"1999-02-10",eff:51.88,deposit:950000,rent:95000,mgmt:39000,eqRent:263000,free:"0",vacancy:0,note:"토지건물",subject:false},
{t:"rent",name:"한독약품빌딩",loc:"역삼동 735",addr:"서울특별시 강남구 역삼동 735",area:19160.8,appr:"1992-09-17",eff:56,deposit:1200000,rent:120000,mgmt:37000,eqRent:286000,free:"2",vacancy:4.7,note:"토지건물",subject:false},
{t:"rent",name:"동경빌딩",loc:"강남구 역삼동 824-19",addr:"서울특별시 강남구 역삼동 824-19",area:9836.18,appr:"1991-07-12",eff:54.55,deposit:816000,rent:98000,mgmt:42000,eqRent:260000,free:"",vacancy:0,note:"토지건물",subject:true},
{t:"rent",name:"상경빌딩",loc:"역삼동 824-20, 21",addr:"서울특별시 강남구 역삼동 824-20",area:9523.01,appr:"1986-05-08",eff:51.16,deposit:1197000,rent:89000,mgmt:41000,eqRent:260000,free:"",vacancy:0,note:"토지건물",subject:true},
{t:"rent",name:"AP타워",loc:"강남구 역삼동 719-1 외",addr:"서울특별시 강남구 역삼동 719-1",area:14457.6,appr:"1994-12-01",eff:66.53,deposit:1550000,rent:155000,mgmt:47000,eqRent:309000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"케이스퀘어 강남2빌딩",loc:"강남구 역삼동 826 외",addr:"서울특별시 강남구 역삼동 826",area:21942.2,appr:"2022-04-25",eff:74,deposit:2000000,rent:200000,mgmt:55000,eqRent:351000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"S1310",loc:"서초구 서초동 1310-15",addr:"서울특별시 서초구 서초동 1310-15",area:13752.9,appr:"2025-09-17",eff:51.57,deposit:1500000,rent:150000,mgmt:45000,eqRent:385000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"BNK디지털타워",loc:"서초구 서초동 1321-11",addr:"서울특별시 서초구 서초동 1321-11",area:37182.2,appr:"1997-06-27",eff:51.65,deposit:1400000,rent:140000,mgmt:41000,eqRent:357000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"서울 인터내셔널타워",loc:"강남구 역삼동 679-4",addr:"서울특별시 강남구 역삼동 679-4",area:66202.4,appr:"1999-11-24",eff:46,deposit:1680000,rent:168000,mgmt:52500,eqRent:488000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"363강남타워",loc:"서초구 서초동 1328-10",addr:"서울특별시 서초구 서초동 1328-10",area:11413.5,appr:"1994-12-01",eff:59.2,deposit:1540000,rent:154000,mgmt:48000,eqRent:348000,free:"",vacancy:0,note:"",subject:false},
{t:"rent",name:"더에셋(The Asset)",loc:"서초구 서초동 1321-20",addr:"서울특별시 서초구 서초동 1321-20",area:81117.3,appr:"2007-12-24",eff:50.71,deposit:1740000,rent:174000,mgmt:54000,eqRent:458000,free:"",vacancy:0,note:"",subject:false},
];

/* ---------- 종후자산 (재건축 후 · 기준시점 2032-01-01) ----------
 * 종전(현황)은 토지단가 기준, 종후는 연면적 단가 기준이라 비교 축이 다르다.
 * 3방식 시산가액은 종후_가격작업 시트 SUMMARY 블록.
 */
var AFTER_SUMMARY = {
    base: '2032-01-01',
    written: '2026-10-12',
    methods: [
        { name:'원가', high:748481100000, low:668752900000, mid:708617000000, unitPy:60240000, ratio:'80%' },
        { name:'시장', high:938600000000, low:830400000000, mid:884500000000, unitPy:75200000, ratio:'100%' },
        { name:'수익', high:946500000000, low:841100000000, mid:893800000000, unitPy:75990000, ratio:'101%' }
    ]
};

var AFTER_ITEMS = [
{t:"after",subject:true,name:"본건 종후자산",loc:"역삼동 824-19",addr:"서울특별시 강남구 역삼동 824-19",rel:"824-20, 824-21",kind:"토지, 건물",struct:"",landArea:2201.4,grossArea:38885,grossPy:11762.7,scale:"지하8층/지상21층",bcr:57.92,far:1135,appr:"2032-01-01",eff:0,zone:"일반상업지역",date:"-",amount:882000000000,reg:"-",unitM2:22680000,unitPy:75000000,noc:554000,rent:226000,deposit:2260000,mgmt:42000,eqRent:2779800,cap:0,free:"-",officePy:0,vacancy:0,note:"-"},
{t:"after",subject:false,name:"여삼빌딩",loc:"강남구 역삼동 648-23 외",addr:"서울특별시 강남구 역삼동 648-23",rel:"648-24, 648-25",kind:"토지, 건물",struct:"철근콘크리트구조",landArea:1452.2,grossArea:14256.6,grossPy:4312.63,scale:"지하3층/지상15층",bcr:47.78,far:719.66,appr:"1985-06-13",eff:63.91,zone:"일반상업",date:"2026-03-18",amount:185000000000,reg:"O",unitM2:12980000,unitPy:42900000,noc:256344,rent:120000,deposit:1200000,mgmt:40000,eqRent:1476000,cap:3.44,free:"0개월",officePy:4312.62,vacancy:0,note:"-"},
{t:"after",subject:false,name:"AP타워",loc:"강남구 역삼동 719-1 외",addr:"서울특별시 강남구 역삼동 719-1",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:1452,grossArea:14457.6,grossPy:4373.42,scale:"지하3층/지상16층",bcr:59.66,far:796.21,appr:"1994-12-01",eff:66.53,zone:"일반상업",date:"2025-11-20",amount:253020000000,reg:"X",unitM2:17500000,unitPy:57900000,noc:311043,rent:155000,deposit:1550000,mgmt:47000,eqRent:1906500,cap:3.29,free:"-",officePy:4373.42,vacancy:0,note:"매도자 : 이지스자산운용  매수자 : 스마일게이트자산운용 셰어딜 방식(수익증권)"},
{t:"after",subject:false,name:"케이스퀘어 강남2빌딩",loc:"강남구 역삼동 826 외",addr:"서울특별시 강남구 역삼동 826",rel:"826-1, 826-2, 826-6",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:2029.9,grossArea:21942.2,grossPy:6637.51,scale:"지하4층/지상20층",bcr:59.35,far:799.88,appr:"2022-04-25",eff:74,zone:"일반상업",date:"2025-11-11",amount:355000000000,reg:"O",unitM2:16180000,unitPy:53500000,noc:385900,rent:200000,deposit:2000000,mgmt:55000,eqRent:2460000,cap:4.6,free:"-",officePy:0,vacancy:0,note:"-"},
{t:"after",subject:false,name:"S1310",loc:"서초구 서초동 1310-15",addr:"서울특별시 서초구 서초동 1310-15",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:2140.8,grossArea:13752.9,grossPy:4160.24,scale:"지하5층/지상6층",bcr:49.78,far:249.88,appr:"2025-09-17",eff:51.57,zone:"3종일주",date:"2025-10-30",amount:179300000000,reg:"O",unitM2:13040000,unitPy:43100000,noc:399300,rent:150000,deposit:1500000,mgmt:45000,eqRent:1845000,cap:4.28,free:"-",officePy:0,vacancy:0,note:"-"},
{t:"after",subject:false,name:"BNK디지털타워",loc:"서초구 서초동 1321-11",addr:"서울특별시 서초구 서초동 1321-11",rel:"-",kind:"구분건물",struct:"철골철근콘크리트구조",landArea:2534,grossArea:37182.2,grossPy:11247.6,scale:"지하7층/지상20층",bcr:49.63,far:922.58,appr:"1997-06-27",eff:51.65,zone:"일반상업",date:"2025-06-20",amount:457800000000,reg:"O",unitM2:12310000,unitPy:40700000,noc:359115,rent:140000,deposit:1400000,mgmt:41000,eqRent:1722000,cap:4.23,free:"1개월/년",officePy:11427.6,vacancy:4.52,note:"집합건물  전체 일괄 거래"},
{t:"after",subject:false,name:"서울 인터내셔널타워",loc:"강남구 역삼동 679-4",addr:"서울특별시 강남구 역삼동 679-4",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:3587.2,grossArea:66202.4,grossPy:20026.2,scale:"지하8층/지상25층",bcr:56.73,far:1119.11,appr:"1999-11-24",eff:46,zone:"일반상업",date:"2025-06-20",amount:897133000000,reg:"O",unitM2:13550000,unitPy:44800000,noc:490995,rent:168000,deposit:1680000,mgmt:52500,eqRent:2066400,cap:4.61,free:"1개월/년",officePy:20026.2,vacancy:3.31,note:"-"},
{t:"after",subject:false,name:"코레이트타워",loc:"강남구 역삼동 646",addr:"서울특별시 강남구 역삼동 646",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:2289.4,grossArea:34983.7,grossPy:10582.5,scale:"지하7층/지상19층",bcr:53.75,far:949.27,appr:"2001-08-31",eff:46.91,zone:"일반상업",date:"2024-12-05",amount:445000000000,reg:"X",unitM2:12720000,unitPy:42100000,noc:436574,rent:150000,deposit:1500000,mgmt:50000,eqRent:1845000,cap:4.38,free:"1개월/년",officePy:10582.6,vacancy:0,note:"* 수익증권 거래 * 2020.07.31.자로 3,605억원에 거래됨."},
{t:"after",subject:false,name:"363강남타워",loc:"서초구 서초동 1328-10",addr:"서울특별시 서초구 서초동 1328-10",rel:"-",kind:"토지, 건물",struct:"철근콘크리트구조",landArea:855.6,grossArea:11413.5,grossPy:3452.57,scale:"지하5층/지상16층",bcr:59.87,far:931.32,appr:"1994-12-01",eff:59.2,zone:"일반상업",date:"2024-11-07",amount:146800000000,reg:"O",unitM2:12860000,unitPy:42500000,noc:349506,rent:154000,deposit:1540000,mgmt:48000,eqRent:1894200,cap:4.46,free:"0개월",officePy:3452.58,vacancy:6.07,note:"* 알스퀘어 거래금액 : 153,300,000,000원"},
{t:"after",subject:false,name:"더에셋(The Asset)",loc:"서초구 서초동 1321-20",addr:"서울특별시 서초구 서초동 1321-20",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:5348.1,grossArea:81117.3,grossPy:24538,scale:"지하7층/지상32층",bcr:34.59,far:940.38,appr:"2007-12-24",eff:50.71,zone:"일반상업",date:"2024-09-27",amount:1104200000000,reg:"O",unitM2:13610000,unitPy:45000000,noc:460558,rent:174000,deposit:1740000,mgmt:54000,eqRent:2140200,cap:4.76,free:"0개월",officePy:24538,vacancy:0,note:"-"},
{t:"after",subject:false,name:"하나금융그룹 강남사옥",loc:"강남구 역삼동 648-19",addr:"서울특별시 강남구 역삼동 648-19",rel:"-",kind:"구분건물",struct:"철골철근콘크리트구조",landArea:1621.8,grossArea:24529.7,grossPy:7420.23,scale:"지하6층/지상20층",bcr:63.3,far:1008.59,appr:"1994-11-30",eff:56.13,zone:"일반상업",date:"2024-06-26",amount:281969000000,reg:"O",unitM2:11500000,unitPy:38000000,noc:399995,rent:173000,deposit:1730000,mgmt:46000,eqRent:2127900,cap:5.6,free:"0개월",officePy:7420.23,vacancy:0.9,note:"집합건물  전체 일괄 거래"},
{t:"after",subject:false,name:"아크플레이스",loc:"강남구 역삼동 736-1",addr:"서울특별시 강남구 역삼동 736-1",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:4171.7,grossArea:62725.3,grossPy:18974.4,scale:"지하6층/지상24층",bcr:53.17,far:980.53,appr:"1998-02-27",eff:46.25,zone:"일반상업",date:"2024-03-20",amount:791699725000,reg:"O",unitM2:12620000,unitPy:41700000,noc:547569,rent:196000,deposit:1960000,mgmt:51000,eqRent:2410800,cap:5.78,free:"-",officePy:18974.4,vacancy:0,note:"-"},
{t:"after",subject:false,name:"빗썸금융타워",loc:"강남구 역삼동 648-9",addr:"서울특별시 강남구 역삼동 648-9",rel:"-",kind:"토지, 건물",struct:"철골철근콘크리트구조",landArea:3721.82,grossArea:51126.3,grossPy:15465.7,scale:"지하7층/지상24층",bcr:39.52,far:799.91,appr:"2018-08-01",eff:53.54,zone:"일반상업",date:"2025-06-24",amount:340245593050,reg:"X",unitM2:13310000,unitPy:44000000,noc:478222,rent:190000,deposit:1900000,mgmt:60000,eqRent:2337000,cap:5.31,free:"-",officePy:15465.7,vacancy:0,note:"지분 일부 (거래면적 7,732.85평) 셰어딜 방식(수익증권)"},
];

/* ---------- 최종 비준표 (제시받은 11건) ----------
 * 엑셀 종후_가격작업 시트에는 거래사례 12건이 있으나 최종 비준표는 11건이다.
 *   · S1310 (서초동 1310-15) — 최종표에서 빠짐
 *   · BNK디지털타워 → '그레이츠 강남' 으로 명칭 변경
 *     (서초동 1321-11 · 37,182.24㎡ · 2025-06-20 · 457,800,000,000 동일 물건)
 * [엑셀상 명칭, 비준표 번호, 표기 명칭(바뀐 경우)]
 */
var COMP_ORDER = [
    ['여삼빌딩', 1],
    ['AP타워', 2],
    ['케이스퀘어 강남2빌딩', 3],
    ['BNK디지털타워', 4, '그레이츠 강남'],
    ['서울 인터내셔널타워', 5],
    ['코레이트타워', 6],
    ['363강남타워', 7],
    ['더에셋(The Asset)', 8],
    ['하나금융그룹 강남사옥', 9],
    ['아크플레이스', 10],
    ['빗썸금융타워', 11]
];

/* ---------------------------------------------------------------
   임대사례 (12건) — 위치도에 NOC · 월임대료만 표기한다.
   단위 주의 : 보증금/월임대료/관리비는 원/연면적 3.3㎡,
              NOC 는 원/전용 3.3㎡ (분모가 다르다).
   --------------------------------------------------------------- */
var RENT_ITEMS = [
{t:"rentcase",rentNo:1, name:"GT타워",           loc:"서초구 서초동 1317-23",addr:"서울특별시 서초구 서초동 1317-23",landArea:4033.6, grossArea:54583.43, grossPy:16511.49,scale:"지하8층/지상24층",bcr:38.13,far:794.81, appr:"2011-02-07",eff:49.14,deposit:1400000,rent:140000,mgmt:48500,noc:392700,vacancy:0,   free:"0개월/년"},
{t:"rentcase",rentNo:2, name:"메리츠타워",       loc:"강남구 역삼동 825-2",  addr:"서울특별시 강남구 역삼동 825-2",  landArea:4464.1, grossArea:57435.79, grossPy:17374.33,scale:"지하6층/지상30층",bcr:42.63,far:789.78, appr:"2005-10-05",eff:48.58,deposit:1670000,rent:167000,mgmt:57000,noc:472078,vacancy:0,   free:"0개월/년"},
{t:"rentcase",rentNo:3, name:"역삼빌딩",         loc:"강남구 역삼동 824",    addr:"서울특별시 강남구 역삼동 824",    landArea:2579.1, grossArea:34899.28, grossPy:10557.03,scale:"지하6층/지상20층",bcr:45.55,far:902.72, appr:"1996-03-28",eff:50.20,deposit:1460000,rent:146000,mgmt:46000,noc:391761,vacancy:0,   free:"2개월/년"},
{t:"rentcase",rentNo:4, name:"삼성생명 서초타워",loc:"서초구 서초동 1321-15",addr:"서울특별시 서초구 서초동 1321-15",landArea:6563.5, grossArea:110660.95,grossPy:33474.94,scale:"지하7층/지상34층",bcr:39.91,far:1096.19,appr:"2007-04-02",eff:51.64,deposit:1707000,rent:170700,mgmt:57000,noc:451471,vacancy:0,   free:"0개월/년"},
{t:"rentcase",rentNo:5, name:"GT타워",           loc:"서초구 서초동 1321-20",addr:"서울특별시 서초구 서초동 1321-20",landArea:5348.1, grossArea:81117.28, grossPy:24537.98,scale:"지하7층/지상32층",bcr:34.59,far:940.38, appr:"2007-12-24",eff:50.71,deposit:1740000,rent:174000,mgmt:48500,noc:460558,vacancy:0,   free:"0개월/년"},
{t:"rentcase",rentNo:6, name:"빗썸금융타워",     loc:"강남구 역삼동 648-9",  addr:"서울특별시 강남구 역삼동 648-9",  landArea:3721.82,grossArea:51126.31, grossPy:15465.71,scale:"지하7층/지상24층",bcr:39.52,far:799.91, appr:"2018-08-01",eff:53.54,deposit:1900000,rent:190000,mgmt:60000,noc:478222,vacancy:0,   free:"-"},
{t:"rentcase",rentNo:7, name:"포스코타워 역삼",  loc:"강남구 역삼동 735-3",  addr:"서울특별시 강남구 역삼동 735-3",  landArea:2874.0, grossArea:43202.77, grossPy:13068.84,scale:"지하7층/지상24층",bcr:43.04,far:991.98, appr:"2003-07-04",eff:46.07,deposit:1440000,rent:144000,mgmt:53000,noc:437578,vacancy:0,   free:"1개월/년"},
{t:"rentcase",rentNo:8, name:"아크플레이스",     loc:"강남구 역삼동 736-1",  addr:"서울특별시 강남구 역삼동 736-1",  landArea:4171.7, grossArea:62725.31, grossPy:18974.41,scale:"지하6층/지상24층",bcr:53.17,far:980.53, appr:"1998-02-27",eff:46.25,deposit:1960000,rent:196000,mgmt:51000,noc:547569,vacancy:0,   free:"-"},
{t:"rentcase",rentNo:9, name:"강남파이낸스센터", loc:"강남구 역삼동 737",    addr:"서울특별시 강남구 역삼동 737",    landArea:13156.7,grossArea:212615.29,grossPy:64316.13,scale:"지하6층/지상45층",bcr:42.57,far:995.19, appr:"2001-07-31",eff:47.53,deposit:1600000,rent:160000,mgmt:56000,noc:465146,vacancy:0.23,free:"0개월/년"},
{t:"rentcase",rentNo:10,name:"서울 인터내셔널타워",loc:"강남구 역삼동 679-4",addr:"서울특별시 강남구 역삼동 679-4",  landArea:3587.2, grossArea:66202.39, grossPy:20026.22,scale:"지하8층/지상25층",bcr:56.73,far:1119.11,appr:"1999-11-24",eff:46.00,deposit:1680000,rent:168000,mgmt:52500,noc:490995,vacancy:3.31,free:"1개월/년"},
{t:"rentcase",rentNo:11,name:"센터필드",         loc:"강남구 역삼동 676",    addr:"서울특별시 강남구 역삼동 676",    landArea:18489.7,grossArea:239267.01,grossPy:72378.30,scale:"지하7층/지상36층",bcr:37.23,far:880.86, appr:"2021-01-30",eff:53.84,deposit:2170000,rent:217000,mgmt:55000,noc:518026,vacancy:0,   free:"0개월/년"},
{t:"rentcase",rentNo:12,name:"더피나클 역삼II",  loc:"강남구 역삼동 646-15", addr:"서울특별시 강남구 역삼동 646-15", landArea:1128.3, grossArea:16695.82, grossPy:5050.49, scale:"지하6층/지상18층",bcr:61.77,far:1087.31,appr:"2001-05-29",eff:63.47,deposit:1960000,rent:196000,mgmt:46500,noc:391919,vacancy:0,   free:"0개월/년"}
];

/* ---------------------------------------------------------------
   토지 감정평가 사례 (평가사례 4 + 거래사례 4) — 토지위치도용.
   단가 단위는 원/㎡ (원표는 천원/㎡ 표기).
   거래사례의 토지단가 = (거래금액 − 건물가액) ÷ 토지면적.
   --------------------------------------------------------------- */
var LAND_ITEMS = [
{t:"landcase",landNo:1,kind:"평가",gubun:"담보",date:"2024-08-14",loc:"서초동 1304-2",addr:"서울특별시 서초구 서초동 1304-2",area:212.5, jimok:"대",use:"상업용",zone:"일반상업",shape:"세장형",road:"광대세각",unitM2:230000000,gongsi:86290000,note:"-"},
{t:"landcase",landNo:2,kind:"평가",gubun:"담보",date:"2025-11-27",loc:"역삼동 820-5", addr:"서울특별시 강남구 역삼동 820-5", area:305.8, jimok:"대",use:"상업용",zone:"일반상업",shape:"세장형",road:"광대한면",unitM2:194000000,gongsi:94840000,note:"-"},
{t:"landcase",landNo:3,kind:"평가",gubun:"담보",date:"2025-11-21",loc:"서초동 1320",  addr:"서울특별시 서초구 서초동 1320",  area:359.1, jimok:"대",use:"상업용",zone:"일반상업",shape:"세장형",road:"광대소각",unitM2:249000000,gongsi:74110000,note:"-"},
{t:"landcase",landNo:4,kind:"평가",gubun:"담보",date:"2024-07-10",loc:"역삼동 720-6", addr:"서울특별시 강남구 역삼동 720-6", area:334.1, jimok:"대",use:"상업용",zone:"일반상업",shape:"세장형",road:"광대세각",unitM2:191000000,gongsi:53290000,note:"-"},
{t:"landcase",landNo:5,kind:"거래",gubun:"거래",date:"2025-06-20",loc:"역삼동 679-4", addr:"서울특별시 강남구 역삼동 679-4", area:3587.2,jimok:"대",use:"업무용",zone:"일반상업",shape:"가장형",road:"광대소각",unitM2:235000000,gongsi:69390000,
 note:"거래금액 897,133,000,000원 · 건물 철근콘크리트조 업무용 66,202.39㎡(사용승인 1999.11.24) · 건물단가 1,600,000원/㎡×25÷50≒800,000원/㎡ (원표 비고의 900,000원은 오기 — 800,000원이라야 토지단가 235,000천원/㎡과 일치) · 토지단가=(897,133,000,000−800,000×66,202.39)÷3,587.2㎡"},
{t:"landcase",landNo:6,kind:"거래",gubun:"거래",date:"2024-03-20",loc:"역삼동 736-1", addr:"서울특별시 강남구 역삼동 736-1", area:4171.7,jimok:"대",use:"업무용",zone:"일반상업",shape:"사다리",road:"광대세각",unitM2:176000000,gongsi:61210000,
 note:"거래금액 791,699,725,000원 · 건물 철골철근콘크리트조 업무용 62,725.31㎡(사용승인 1998.02.27) · 건물단가 1,700,000원/㎡×29÷55≒896,000원/㎡ · 토지단가=(791,699,725,000−896,000×62,725.31)÷4,171.7㎡"},
{t:"landcase",landNo:7,kind:"거래",gubun:"거래",date:"2024-07-26",loc:"서초동 1304-2",addr:"서울특별시 서초구 서초동 1304-2",area:212.5, jimok:"대",use:"상업용",zone:"일반상업",shape:"세장형",road:"광대세각",unitM2:228000000,gongsi:86290000,
 note:"거래금액 48,500,000,000원 · 토지단가=48,500,000,000÷212.5㎡ (나지 상태 거래)"},
{t:"landcase",landNo:8,kind:"거래",gubun:"거래",date:"2024-09-27",loc:"서초동 1321-20",addr:"서울특별시 서초구 서초동 1321-20",area:5348.1,jimok:"대",use:"상업용",zone:"일반상업",shape:"사다리",road:"중로각지",unitM2:186000000,gongsi:76490000,
 note:"거래금액 1,104,200,000,000원 · 건물 철골철근콘크리트조 업무용 81,117.28㎡(사용승인 2007.12.24) · 건물단가 1,900,000원/㎡×39÷55≒1,347,000원/㎡ · 토지단가=(1,104,200,000,000−1,347,000×81,117.28)÷5,348.1㎡"}
];
