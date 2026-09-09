"use strict";

const path = require("path");
const { readZipEntries, writeZipEntries } = require("./hwpxZip");
const {
  escapeXml,
  replaceOnce,
  replaceOnceRegex,
  fillAdjacentCell,
  fillAdjacentCellMultiline,
  appendAttachmentPages,
} = require("./xmlFill");

const TEMPLATE_PATH = path.join(__dirname, "..", "압수수색영장신청서서식.hwpx");
const SECTION_ENTRY = "Contents/section0.xml";

function pad2(v) {
  const s = String(v || "").trim();
  return s;
}

function fillSection0(xml, f) {
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

  // 압수할 물건 / 수색·검증할 장소 는 본문에는 "별지와 같음"으로만 표시하고
  // 실제 내용은 문서 끝의 별지 페이지에 작성한다.
  out = fillAdjacentCell(out, "압수할 물건", "별지와 같음");
  out = fillAdjacentCell(out, "수색ㆍ검증할 장소, 신체 또는 물건", "별지와 같음");
  // "범죄사실 및 압수ㆍ수색ㆍ 검증을 필요로 하는 사유" 칸은 원본 서식에 이미
  // "별지와 같음"이 고정 텍스트로 들어있어 별도 처리가 필요 없다.

  out = fillAdjacentCellMultiline(out, "7일을 넘는 유효기간을 필요로 하는 취지와 사유", f.over7DaysReason || "");
  out = fillAdjacentCellMultiline(out, "둘 이상의 영장을 신청하는 취지와 사유", f.multipleWarrantsReason || "");
  out = fillAdjacentCellMultiline(out, "일출 전 또는 일몰 후 집행을 필요로 하는 취지와 사유", f.nightExecutionReason || "");
  out = fillAdjacentCellMultiline(out, "신체검사를 받을 자의  성별, 건강상태", f.bodyExamInfo || "");

  // --- 별지(첨부) 페이지 ---
  out = appendAttachmentPages(out, [
    { heading: "압수할 물건", content: f.seizureItems || "" },
    { heading: "수색ㆍ검증할 장소, 신체 또는 물건", content: f.searchPlace || "" },
    { heading: "범죄사실 및 압수ㆍ수색ㆍ검증을 필요로 하는 사유", content: f.crimeFacts || "" },
  ]);

  return out;
}

/**
 * formData -> filled .hwpx Buffer. Does not touch the original template file.
 */
async function generateHwpxBuffer(formData) {
  const entries = await readZipEntries(TEMPLATE_PATH);
  const section = entries.find((e) => e.fileName === SECTION_ENTRY);
  if (!section) {
    throw new Error(SECTION_ENTRY + " 항목을 원본 hwpx에서 찾을 수 없습니다.");
  }

  const originalXml = section.data.toString("utf8");
  const filledXml = fillSection0(originalXml, formData);
  section.data = Buffer.from(filledXml, "utf8");

  const tmpOut = path.join(
    require("os").tmpdir(),
    "hwpx-gen-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".hwpx"
  );
  await writeZipEntries(entries, tmpOut);
  const fs = require("fs");
  const buf = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpOut);
  return buf;
}

module.exports = { generateHwpxBuffer, TEMPLATE_PATH };
