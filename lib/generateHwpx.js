"use strict";

const path = require("path");
const { readZipEntries, writeZipEntries } = require("./hwpxZip");
const {
  escapeXml,
  replaceOnce,
  replaceOnceRegex,
  fillAdjacentCell,
  fillAdjacentCellMultiline,
  fillParagraphBlock,
} = require("./xmlFill");

// 별지 제55호서식은 규정 서식이라 그 안의 배치(신청서 → 청구서 → 별지)를
// 임의로 바꿀 수 없다. 그래서 신청서(+청구서)와 별지1ㆍ2ㆍ3을 처음부터
// 별도의 두 .hwpx 서식 파일로 두고, 각자 채워서 각자 완성된 파일로
// 내보낸다 — 하나의 표를 프로그램이 쪼개고 다시 붙이는 방식보다 훨씬
// 안전하다(그 표 재배치 방식은 한글에서 실제로 열리지 않거나 레이아웃이
// 깨지는 문제가 반복적으로 확인되어 폐기했다).
const APPLICATION_TEMPLATE_PATH = path.join(__dirname, "..", "압수수색영장신청서_표지서식.hwpx");
const ATTACHMENT_TEMPLATE_PATH = path.join(__dirname, "..", "압수수색영장신청서_별지서식.hwpx");
const SECTION_ENTRY = "Contents/section0.xml";

function pad2(v) {
  const s = String(v || "").trim();
  return s;
}

/** 항목이 2개 이상이면 각 줄 앞에 "1. ", "2. " ...를 붙인다(1개면 그대로 둔다). */
function numberIfMultiple(value) {
  const items = String(value == null ? "" : value)
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0);
  if (items.length <= 1) return value || "";
  return items.map((line, i) => (i + 1) + ". " + line).join("\n");
}

/** 신청서(+청구서) 표지 파일의 빈 칸을 채운다. */
function fillApplicationSection0(xml, f) {
  let out = xml;

  // --- 상단 메타 정보 (자유 텍스트 칸) ---
  out = replaceOnce(out, "(기 관 명)", escapeXml(f.orgName || "(기 관 명)"));

  out = replaceOnceRegex(
    out,
    /제\s+호\s+년\s+월\s+일/,
    "제 " + escapeXml(f.docNo || "") + "호                                    " +
      escapeXml(f.sendYear || "") + "년  " + escapeXml(f.sendMonth || "") + "월  " +
      escapeXml(f.sendDay || "") + "일"
  );

  out = replaceOnceRegex(
    out,
    /신\s+○○/,
    "신    " + escapeXml(f.prosecutorsOffice || "○○")
  );

  out = replaceOnceRegex(
    out,
    /다음 사람에 대한\s+피의사건에 관하여/,
    "다음 사람에 대한 " + escapeXml(f.crimeName || "") + " 피의사건에 관하여"
  );

  out = replaceOnceRegex(
    out,
    /하므로,\s+년\s+월\s+일까지 유효한/,
    "하므로,  " + escapeXml(f.validYear || "") + "년 " + escapeXml(f.validMonth || "") + "월 " +
      escapeXml(f.validDay || "") + "일까지 유효한"
  );

  // --- 표 셀 (라벨 옆 빈칸) ---
  // 피의자 인적사항 — 민감정보. 사용자가 명시적으로 입력한 경우에만 채운다.
  out = fillAdjacentCell(out, "성             명", f.suspectName || "");
  out = replaceOnceRegex(out, /\(\s+세\)/, escapeXml(f.suspectRRN || "") + " (     세)");
  out = fillAdjacentCell(out, "직             업", f.suspectJob || "");
  out = fillAdjacentCell(out, "주             거", f.suspectAddress || "");

  out = fillAdjacentCell(out, "변호인", f.defenseCounsel || "");

  // "압수할 물건" / "수색ㆍ검증할 장소..." / "범죄사실 및 사유" 칸은 원본 서식에
  // 이미 "별지3과 같음" 등이 고정 텍스트로 들어있어 별도 처리가 필요 없다 —
  // 실제 내용은 별지 파일 쪽에 채운다.

  out = fillAdjacentCellMultiline(out, "7일을 넘는 유효기간을 필요로 하는 취지와 사유", f.over7DaysReason || "");
  out = fillAdjacentCellMultiline(out, "둘 이상의 영장을 신청하는 취지와 사유", f.multipleWarrantsReason || "");
  out = fillAdjacentCellMultiline(out, "일출 전 또는 일몰 후 집행을 필요로 하는 취지와 사유", f.nightExecutionReason || "");
  out = fillAdjacentCellMultiline(out, "신체검사를 받을 자의  성별, 건강상태", f.bodyExamInfo || "");

  return out;
}

/** 별지1ㆍ2ㆍ3 파일의 빈 칸을 채운다. */
function fillAttachmentSection0(xml, f) {
  let out = xml;

  // 별지1ㆍ2ㆍ3은 각각 한글에서 편집하기 쉽도록 표(박스) 안에 들어있다 —
  // 즉 "다음 라벨"이 항상 같은 셀 안에 있는 것은 아니다(예: "○ 범죄사실"과
  // "별지 2" 표제는 서로 다른 표의 서로 다른 셀에 있다). 그래서 같은 셀 안에
  // 짝이 있는 라벨끼리만 nextLabel로 서로를 가리키게 하고, 그 셀의 마지막
  // 라벨은 boundaryTag: "</hp:subList>"로 그 셀의 끝까지만 채우게 한다 —
  // 그렇지 않으면 다음 표/셀의 시작까지 훑으면서 그 사이의 표 닫는 태그
  // 등 구조 태그가 통째로 사라져 문서가 깨진다.
  //
  // 별지1: 범죄사실 — "○ 범죄사실" 아래는 서식 자체에 작성 순서 안내 문구가
  // 고정으로 들어있다(피의자의 직업, 금지규정, 위반행위 결과 순). 사용자가
  // 죄명 칩을 클릭해 작성례를 채웠거나 직접 입력한 경우에만 그 안내 문구를
  // 대체하고, 비워두면 기존처럼 안내 문구가 그대로 남는다.
  out = fillParagraphBlock(out, "○ 범죄사실", null, f.crimeFacts || "", { boundaryTag: "</hp:subList>" });
  // 별지2: 압수수색검증을 필요로 하는 사유 (정황 / 필요성 2단 구성) — 두 라벨이 같은 셀 안에 있다.
  out = fillParagraphBlock(out, " - 범죄혐의의 정황", " - 압수수색의 필요성", f.crimeContext || "");
  out = fillParagraphBlock(out, " - 압수수색의 필요성", null, f.necessityReason || "", { boundaryTag: "</hp:subList>" });
  // 별지3: 압수할 물건 / 수색검증할 장소 — 두 라벨이 같은 셀 안에 있다.
  // 항목이 여러 개면 번호를 매겨 가독성을 높인다.
  out = fillParagraphBlock(out, "○ 압수수색할 물건 ", "○ 수색검증할 장소, 신체, 물건 ", numberIfMultiple(f.seizureItems));
  out = fillParagraphBlock(out, "○ 수색검증할 장소, 신체, 물건 ", null, numberIfMultiple(f.searchPlace), { boundaryTag: "</hp:subList>" });

  return out;
}

async function fillTemplateBuffer(templatePath, fillFn, formData) {
  const entries = await readZipEntries(templatePath);
  const section = entries.find((e) => e.fileName === SECTION_ENTRY);
  if (!section) {
    throw new Error(SECTION_ENTRY + " 항목을 " + templatePath + "에서 찾을 수 없습니다.");
  }

  const filledXml = fillFn(section.data.toString("utf8"), formData);
  const entriesCopy = entries.map((e) => (e === section ? { ...e, data: Buffer.from(filledXml, "utf8") } : e));

  const tmpOut = path.join(
    require("os").tmpdir(),
    "hwpx-gen-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".hwpx"
  );
  await writeZipEntries(entriesCopy, tmpOut);
  const fs = require("fs");
  const buf = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpOut);
  return buf;
}

/**
 * formData -> { applicationBuffer, attachmentBuffer }. 두 서식 파일(신청서
 * 표지, 별지)을 각각 따로 채워 각각의 .hwpx Buffer로 만든다. 원본 template
 * 파일들은 건드리지 않는다.
 */
async function generateHwpxBuffers(formData) {
  const [applicationBuffer, attachmentBuffer] = await Promise.all([
    fillTemplateBuffer(APPLICATION_TEMPLATE_PATH, fillApplicationSection0, formData),
    fillTemplateBuffer(ATTACHMENT_TEMPLATE_PATH, fillAttachmentSection0, formData),
  ]);
  return { applicationBuffer, attachmentBuffer };
}

module.exports = { generateHwpxBuffers, APPLICATION_TEMPLATE_PATH, ATTACHMENT_TEMPLATE_PATH };
