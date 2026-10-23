"use strict";

const path = require("path");
const { readZipEntries, writeZipEntries } = require("./hwpxZip");
const {
  escapeXml,
  replaceOnce,
  fillAdjacentCellMultiline,
  fillCellAtAddr,
} = require("./xmlFill");

// "검사와 특별사법경찰관의 상호협력에 관한 규칙"의 별지 서식 원본들. 영장
// 신청서 작성기와 같은 방식(원본 .hwpx의 빈 칸을 찾아 채우는 방식)으로
// 만든다 — 서식을 새로 그리지 않고 원본 레이아웃을 그대로 쓴다.
const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "execution");
const TEMPLATES = {
  seizureReport: path.join(TEMPLATE_DIR, "압수조서_별지제70호서식.hwpx"), // 압수조서
  seizureList: path.join(TEMPLATE_DIR, "압수목록_별지제71호서식.hwpx"), // 압수목록
  searchReport: path.join(TEMPLATE_DIR, "수색조서_별지제72호서식.hwpx"), // 수색조서
  searchCertificate: path.join(TEMPLATE_DIR, "수색결과증명서_별지제73호서식.hwpx"), // 수색결과 증명서
  seizureTotalList: path.join(TEMPLATE_DIR, "압수물총목록_별지제137호서식.hwpx"), // 압수물 총목록
};
const SECTION_ENTRY = "Contents/section0.xml";

function dateParts(f, prefix) {
  return {
    y: f[prefix + "Year"] || "",
    m: f[prefix + "Month"] || "",
    d: f[prefix + "Day"] || "",
  };
}

/** 압수조서 [별지 제70호서식]의 빈 칸을 채운다. */
function fillSeizureReport(xml, f) {
  let out = xml;
  const exec = dateParts(f, "exec");

  out = replaceOnce(out, "<hp:t>          </hp:t>", "<hp:t>" + escapeXml(f.suspectName || "") + "</hp:t>");
  out = replaceOnce(
    out,
    "<hp:t> 에 대한          피의사건에 관하여           년     월     일</hp:t>",
    "<hp:t> " + escapeXml(f.crimeName || "") + " 피의사건에 관하여 " + exec.y + "년 " + exec.m + "월 " + exec.d + "일</hp:t>"
  );
  out = replaceOnce(
    out,
    "<hp:t>           에서 특별사법경찰관           는(은) 특별사법경찰리       와(과) 아래 사람(들)을 참여하게 하고 별지 목록의 물건을 다음과 같이 압수하다.</hp:t>",
    "<hp:t> " + escapeXml(f.execPlace || "") + "에서 특별사법경찰관 " + escapeXml(f.officer1Name || "") +
      " 는(은) 특별사법경찰리 " + escapeXml(f.officer2Name || "") + " 와(과) 아래 사람(들)을 참여하게 하고 별지 목록의 물건을 다음과 같이 압수하다.</hp:t>"
  );

  out = fillAdjacentCellMultiline(out, "압수경위", f.seizureProcess || "");

  const participants = (f.participants || []).slice(0, 3);
  participants.forEach((p, i) => {
    const row = 6 + i;
    if (p.name) out = fillCellAtAddr(out, row, 1, p.name);
    if (p.rrn) out = fillCellAtAddr(out, row, 2, p.rrn);
    if (p.address) out = fillCellAtAddr(out, row, 3, p.address);
  });

  out = replaceOnce(
    out,
    "<hp:t>년       월     일</hp:t>",
    "<hp:t>" + exec.y + "년 " + exec.m + "월 " + exec.d + "일</hp:t>"
  );
  out = replaceOnce(
    out,
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>                      </hp:t></hp:run><hp:run charPrIDRef="27">',
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>   ' + escapeXml(f.officer1Name || "") + '  </hp:t></hp:run><hp:run charPrIDRef="27">'
  );
  out = replaceOnce(
    out,
    '<hp:t>특별사법경찰리</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>                      </hp:t></hp:run><hp:run charPrIDRef="27">',
    '<hp:t>특별사법경찰리</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>   ' + escapeXml(f.officer2Name || "") + '  </hp:t></hp:run><hp:run charPrIDRef="27">'
  );

  return out;
}

/** 압수목록 [별지 제71호서식]의 빈 칸을 채운다 — 품목당 4개 물리적 행(번호/
 * 품종/수량/경찰의견/비고는 첫 행, 소지자·소유자 성명/주소/주민등록번호/
 * 전화번호가 그 아래 3개 행에 걸쳐 반복됨). 최대 7건까지 채울 수 있다. */
function fillSeizureList(xml, f) {
  let out = xml;
  const items = (f.items || []).slice(0, 7);
  const holder = f.holder || {};
  const owner = f.owner || {};

  items.forEach((item, i) => {
    const base = 3 + 4 * i;
    out = fillCellAtAddr(out, base, 0, String(i + 1));
    if (item.name) out = fillCellAtAddr(out, base, 1, item.name);
    if (item.qty) out = fillCellAtAddr(out, base, 2, item.qty);
    if (item.note) out = fillCellAtAddr(out, base, 8, item.note);
    if (holder.name) out = fillCellAtAddr(out, base, 4, holder.name);
    if (owner.name) out = fillCellAtAddr(out, base, 6, owner.name);
    if (holder.address) out = fillCellAtAddr(out, base + 1, 4, holder.address);
    if (owner.address) out = fillCellAtAddr(out, base + 1, 6, owner.address);
    if (holder.rrn) out = fillCellAtAddr(out, base + 2, 4, holder.rrn);
    if (owner.rrn) out = fillCellAtAddr(out, base + 2, 6, owner.rrn);
    if (holder.phone) out = fillCellAtAddr(out, base + 3, 4, holder.phone);
    if (owner.phone) out = fillCellAtAddr(out, base + 3, 6, owner.phone);
  });

  return out;
}

/** 압수물 총목록 [별지 제137호서식]의 빈 칸을 채운다 — 품목당 1개 행, 최대
 * 21건. 압수목록과 같은 품목 목록을 그대로 재사용한다. */
function fillSeizureTotalList(xml, f) {
  let out = xml;
  const items = (f.items || []).slice(0, 21);
  items.forEach((item, i) => {
    const row = 3 + i;
    out = fillCellAtAddr(out, row, 0, String(i + 1));
    if (item.name) out = fillCellAtAddr(out, row, 1, item.name);
    if (item.qty) out = fillCellAtAddr(out, row, 2, item.qty);
    if (item.note) out = fillCellAtAddr(out, row, 4, item.note);
  });
  return out;
}

/** 수색조서 [별지 제72호서식]의 빈 칸을 채운다. */
function fillSearchReport(xml, f) {
  let out = xml;
  const exec = dateParts(f, "exec");
  const start = dateParts(f, "searchStart");
  const end = dateParts(f, "searchEnd");

  out = replaceOnce(out, "<hp:t>              </hp:t>", "<hp:t>" + escapeXml(f.suspectName || "") + "</hp:t>");
  out = replaceOnce(
    out,
    "<hp:t> 에 대한         피의사건에 관하여       년     월      일</hp:t>",
    "<hp:t> " + escapeXml(f.crimeName || "") + " 피의사건에 관하여 " + exec.y + "년 " + exec.m + "월 " + exec.d + "일</hp:t>"
  );
  out = replaceOnce(
    out,
    "<hp:t>         에서 특별사법경찰관         는(은) 특별사법경찰리        와(과) 아래 사람(들)을 참여하게 하고 다음과 같이 수색하다.</hp:t>",
    "<hp:t> " + escapeXml(f.execPlace || "") + "에서 특별사법경찰관 " + escapeXml(f.officer1Name || "") +
      " 는(은) 특별사법경찰리 " + escapeXml(f.officer2Name || "") + " 와(과) 아래 사람(들)을 참여하게 하고 다음과 같이 수색하다.</hp:t>"
  );

  if (f.searchPlace) out = fillCellAtAddr(out, 3, 3, f.searchPlace);
  if (f.searchTarget) out = fillCellAtAddr(out, 4, 3, f.searchTarget);
  if (f.searchResult) out = fillCellAtAddr(out, 5, 3, f.searchResult);

  out = replaceOnce(
    out,
    "<hp:t> 착수             년       월       일</hp:t>",
    "<hp:t> 착수 " + start.y + "년 " + start.m + "월 " + start.d + "일</hp:t>"
  );
  out = replaceOnce(
    out,
    "<hp:t> 종료             년       월       일</hp:t>",
    "<hp:t> 종료 " + end.y + "년 " + end.m + "월 " + end.d + "일</hp:t>"
  );

  const participants = (f.participants || []).slice(0, 4);
  participants.forEach((p, i) => {
    const row = 9 + i;
    if (p.name) out = fillCellAtAddr(out, row, 1, p.name);
    if (p.rrn) out = fillCellAtAddr(out, row, 2, p.rrn);
    if (p.address) out = fillCellAtAddr(out, row, 4, p.address);
  });

  out = replaceOnce(
    out,
    "<hp:t>년      월      일</hp:t>",
    "<hp:t>" + exec.y + "년 " + exec.m + "월 " + exec.d + "일</hp:t>"
  );
  out = replaceOnce(
    out,
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>               </hp:t></hp:run><hp:run charPrIDRef="26">',
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>   ' + escapeXml(f.officer1Name || "") + '  </hp:t></hp:run><hp:run charPrIDRef="26">'
  );
  out = replaceOnce(
    out,
    '<hp:t>특별사법경찰리</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>               </hp:t></hp:run><hp:run charPrIDRef="26">',
    '<hp:t>특별사법경찰리</hp:t></hp:run><hp:run charPrIDRef="21"><hp:t>   ' + escapeXml(f.officer2Name || "") + '  </hp:t></hp:run><hp:run charPrIDRef="26">'
  );

  return out;
}

/** 수색결과 증명서 [별지 제73호서식]의 빈 칸을 채운다 — 증거물을 발견하지
 * 못했을 때, 수색을 받은 자에게 교부하는 서식이다. */
function fillSearchCertificate(xml, f) {
  let out = xml;
  const exec = dateParts(f, "exec");
  const issue = dateParts(f, "issue");

  out = replaceOnce(
    out,
    "<hp:t>제      호                                         년        월        일</hp:t>",
    "<hp:t>제 " + escapeXml(f.docNo || "") + " 호 " + issue.y + "년 " + issue.m + "월 " + issue.d + "일</hp:t>"
  );
  out = replaceOnce(out, "<hp:t>  </hp:t>", "<hp:t>" + escapeXml(f.recipientName || "") + "</hp:t>");
  out = replaceOnce(
    out,
    "<hp:t>           에 대한        피의사건에 관하여        년     월     일 </hp:t>",
    "<hp:t> " + escapeXml(f.suspectName || "") + " 에 대한 " + escapeXml(f.crimeName || "") +
      " 피의사건에 관하여 " + exec.y + "년 " + exec.m + "월 " + exec.d + "일 </hp:t>"
  );
  out = replaceOnce(
    out,
    "<hp:t>         에서      을 수색한 결과 증거물 등이 없었음을 증명합니다.</hp:t>",
    "<hp:t> " + escapeXml(f.execPlace || "") + "에서 " + escapeXml(f.searchTarget || "") +
      "을 수색한 결과 증거물 등이 없었음을 증명합니다.</hp:t>"
  );

  out = replaceOnce(out, "(기관명)", escapeXml(f.orgName || "(기관명)"));
  out = replaceOnce(
    out,
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="25"><hp:t>                </hp:t></hp:run><hp:run charPrIDRef="28">',
    '<hp:t>특별사법경찰관</hp:t></hp:run><hp:run charPrIDRef="25"><hp:t>   ' + escapeXml(f.officer1Name || "") + '  </hp:t></hp:run><hp:run charPrIDRef="28">'
  );

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
    "hwpx-exec-gen-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".hwpx"
  );
  await writeZipEntries(entriesCopy, tmpOut);
  const fs = require("fs");
  const buf = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpOut);
  return buf;
}

/**
 * formData -> { seizureReportBuffer, seizureListBuffer, searchReportBuffer,
 * searchCertificateBuffer, seizureTotalListBuffer }. 다섯 서식 모두 항상
 * 만든다 — 증거물을 발견했는지 여부에 따라 압수 쪽/수색 쪽 중 실제로 쓰는
 * 것만 골라 쓰면 된다.
 */
async function generateExecutionFormBuffers(formData) {
  const [
    seizureReportBuffer,
    seizureListBuffer,
    searchReportBuffer,
    searchCertificateBuffer,
    seizureTotalListBuffer,
  ] = await Promise.all([
    fillTemplateBuffer(TEMPLATES.seizureReport, fillSeizureReport, formData),
    fillTemplateBuffer(TEMPLATES.seizureList, fillSeizureList, formData),
    fillTemplateBuffer(TEMPLATES.searchReport, fillSearchReport, formData),
    fillTemplateBuffer(TEMPLATES.searchCertificate, fillSearchCertificate, formData),
    fillTemplateBuffer(TEMPLATES.seizureTotalList, fillSeizureTotalList, formData),
  ]);
  return {
    seizureReportBuffer,
    seizureListBuffer,
    searchReportBuffer,
    searchCertificateBuffer,
    seizureTotalListBuffer,
  };
}

module.exports = { generateExecutionFormBuffers, TEMPLATES };
