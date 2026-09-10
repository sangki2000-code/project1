"use strict";

const { CRIME_FACTS_EXAMPLES } = require("./crimeFactsExamples");

// 클릭형 선택 UI에 쓰이는 프리셋 모음. 전부 "클릭하면 채워지고, 그 다음
// 직접 수정 가능"한 출발점일 뿐 강제 목록이 아니다.

// 범죄사실 작성례가 있는 죄명을 먼저 배치하고, 작성례가 없는 나머지 죄명을 이어붙인다.
const CRIME_NAME_PRESETS = [
  ...Object.keys(CRIME_FACTS_EXAMPLES),
  "마약류관리에관한법률위반",
  "수산업법위반",
  "문화재보호법위반",
  "관광진흥법위반",
  "대외무역법위반(원산지표시위반)",
  "폐기물관리법위반",
  "저작권법위반",
  "산림자원의 조성 및 관리에 관한 법률위반",
];

const SEIZURE_ITEM_PRESETS = [
  "휴대전화 1대",
  "노트북 컴퓨터 1대",
  "외장하드/USB 등 저장매체 일체",
  "회계장부 및 거래내역서 일체",
  "인장 및 명함",
  "차량 1대(차량번호: )",
  "현금 및 수표",
  "관련 서류 및 계약서 일체",
];

const SEARCH_PLACE_PRESETS = [
  "피의자의 주거지",
  "피의자가 운영하는 사업장",
  "피의자가 사용하는 차량 내부",
  "창고 및 부속 건물",
  "피의자가 소지한 가방 및 의류",
];

const CRIME_FACTS_STARTER =
  "피의자는 ____년 __월경부터 ____년 __월경까지 사이에 [범죄사실을 구체적으로 기재]";

module.exports = {
  CRIME_NAME_PRESETS,
  SEIZURE_ITEM_PRESETS,
  SEARCH_PLACE_PRESETS,
  CRIME_FACTS_STARTER,
  CRIME_FACTS_EXAMPLES,
};
