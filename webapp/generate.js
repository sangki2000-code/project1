"use strict";

// 브라우저(웹) 단일 파일 버전의 .hwpx 생성 로직. 서버 버전(lib/generateHwpx.js,
// lib/generateExecutionForms.js, lib/hwpxZip.js)과 같은 "원본 .hwpx의 빈 칸을
// 찾아 채운다"는 방식은 동일하고, zip을 다루는 부분만 Node의 yauzl/yazl 대신
// 브라우저에서 돌아가는 JSZip으로 바꿨다. 실제 빈 칸을 채우는 함수들
// (fillApplicationSection0 등)은 build.js가 lib/generateHwpx.js와
// lib/generateExecutionForms.js에서 소스 그대로 뽑아와 이 파일 앞에 넣어주므로,
// 여기서는 그 함수들과 TEMPLATES_B64(마찬가지로 build.js가 넣어주는, 서식
// 원본을 base64로 인코딩한 값)를 그대로 가져다 쓴다.

/** 원본 .hwpx 안에서 압축하지 않고 저장(store)해 둔 항목들 — 실제 7개 원본
 * 서식 파일을 전부 unzip -v로 확인해 같았던 규칙이다. 다시 묶을 때도 이
 * 항목만 압축하지 않아야 원본과 동일한 패키징을 유지한다. */
const HWPX_STORE_ENTRIES = new Set(["mimetype", "version.xml", "Preview/PrvImage.png"]);
const HWPX_SECTION_ENTRY = "Contents/section0.xml";
const HWPX_FIXED_DATE = new Date(1980, 0, 1);

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** base64로 인코딩된 원본 .hwpx 템플릿의 Contents/section0.xml만 fillFn으로
 * 고쳐 쓰고, 나머지 항목은 원본 그대로 다시 묶어 Blob으로 돌려준다. */
async function fillHwpxTemplate(templateBase64, fillFn, formData) {
  const zip = await JSZip.loadAsync(base64ToUint8Array(templateBase64));
  const sectionFile = zip.file(HWPX_SECTION_ENTRY);
  if (!sectionFile) {
    throw new Error(HWPX_SECTION_ENTRY + " 항목을 템플릿에서 찾을 수 없습니다.");
  }
  const originalXml = await sectionFile.async("string");
  const filledXml = fillFn(originalXml, formData);

  const outZip = new JSZip();
  const entryNames = Object.keys(zip.files);
  for (const name of entryNames) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const content = name === HWPX_SECTION_ENTRY ? filledXml : await entry.async("uint8array");
    outZip.file(name, content, {
      compression: HWPX_STORE_ENTRIES.has(name) ? "STORE" : "DEFLATE",
      date: HWPX_FIXED_DATE,
    });
  }
  return outZip.generateAsync({ type: "blob", mimeType: "application/hwp+zip" });
}

/** 완성된 .hwpx Blob 여러 개를 파일명과 함께 zip 하나로 묶는다(서버판의
 * zipFiles와 같은 역할). */
async function zipBlobs(files) {
  const zip = new JSZip();
  for (const f of files) {
    const buf = await f.blob.arrayBuffer();
    zip.file(f.name, buf, { date: HWPX_FIXED_DATE });
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

function safeFileNamePart(name) {
  return (name || "").replace(/[\\/:*?"<>|]/g, "");
}

function timestamp() {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
}

function splitIsoDate(isoDate) {
  if (!isoDate) return { year: "", month: "", day: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return { year: "", month: "", day: "" };
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) };
}

/** 1번 화면(영장신청서 작성): formData(화면 입력값 그대로) -> { blob, fileName } */
async function generateApplicationZip(raw) {
  const sendDate = splitIsoDate(raw.sendDate);
  const validDate = splitIsoDate(raw.validDate);
  const formData = {
    orgName: raw.orgName || "",
    docNo: raw.docNo || "",
    sendYear: sendDate.year,
    sendMonth: sendDate.month,
    sendDay: sendDate.day,
    prosecutorsOffice: raw.prosecutorsOffice || "",
    crimeName: raw.crimeName || "",
    validYear: validDate.year,
    validMonth: validDate.month,
    validDay: validDate.day,
    suspectName: raw.suspectName || "",
    suspectRRN: raw.suspectRRN || "",
    suspectJob: raw.suspectJob || "",
    suspectAddress: raw.suspectAddress || "",
    defenseCounsel: raw.defenseCounsel || "",
    crimeFacts: raw.crimeFacts || "",
    seizureItems: raw.seizureItems || "",
    searchPlace: raw.searchPlace || "",
    crimeContext: raw.crimeContext || "",
    necessityReason: raw.necessityReason || "",
    over7DaysReason: raw.over7DaysReason || "",
    multipleWarrantsReason: raw.multipleWarrantsReason || "",
    nightExecutionReason: raw.nightExecutionReason || "",
    bodyExamInfo: raw.bodyExamInfo || "",
  };

  const [applicationBlob, attachmentBlob] = await Promise.all([
    fillHwpxTemplate(TEMPLATES_B64.applicationCover, fillApplicationSection0, formData),
    fillHwpxTemplate(TEMPLATES_B64.applicationAttachment, fillAttachmentSection0, formData),
  ]);

  const stamp = timestamp();
  const safeCrime = safeFileNamePart(formData.crimeName) || "신청서";
  const blob = await zipBlobs([
    { name: `압수수색영장신청서_${safeCrime}_${stamp}.hwpx`, blob: applicationBlob },
    { name: `별지_${safeCrime}_${stamp}.hwpx`, blob: attachmentBlob },
  ]);
  return { blob, fileName: `압수수색영장신청서_${safeCrime}_${stamp}.zip` };
}

/** 3번 화면(집행 후 서식 작성): formData(화면 입력값 그대로) -> { blob, fileName } */
async function generateExecutionFormsZip(raw) {
  const exec = splitIsoDate(raw.execDate);
  const issue = splitIsoDate(raw.issueDate || raw.execDate);
  const searchStart = splitIsoDate(raw.searchStartDate || raw.execDate);
  const searchEnd = splitIsoDate(raw.searchEndDate || raw.execDate);

  const formData = {
    orgName: raw.orgName || "",
    suspectName: raw.suspectName || "",
    crimeName: raw.crimeName || "",
    execYear: exec.year,
    execMonth: exec.month,
    execDay: exec.day,
    execPlace: raw.execPlace || "",
    officer1Name: raw.officer1Name || "",
    officer2Name: raw.officer2Name || "",
    seizureProcess: raw.seizureProcess || "",
    participants: Array.isArray(raw.participants) ? raw.participants.slice(0, 4) : [],
    items: Array.isArray(raw.items) ? raw.items.slice(0, 21) : [],
    holder: raw.holder || {},
    owner: raw.owner || {},
    searchPlace: raw.searchPlace || "",
    searchTarget: raw.searchTarget || "",
    searchResult: raw.searchResult || "",
    searchStartYear: searchStart.year,
    searchStartMonth: searchStart.month,
    searchStartDay: searchStart.day,
    searchEndYear: searchEnd.year,
    searchEndMonth: searchEnd.month,
    searchEndDay: searchEnd.day,
    docNo: raw.docNo || "",
    issueYear: issue.year,
    issueMonth: issue.month,
    issueDay: issue.day,
    recipientName: raw.recipientName || "",
  };

  const [
    seizureReportBlob,
    seizureListBlob,
    seizureTotalListBlob,
    searchReportBlob,
    searchCertificateBlob,
  ] = await Promise.all([
    fillHwpxTemplate(TEMPLATES_B64.seizureReport, fillSeizureReport, formData),
    fillHwpxTemplate(TEMPLATES_B64.seizureList, fillSeizureList, formData),
    fillHwpxTemplate(TEMPLATES_B64.seizureTotalList, fillSeizureTotalList, formData),
    fillHwpxTemplate(TEMPLATES_B64.searchReport, fillSearchReport, formData),
    fillHwpxTemplate(TEMPLATES_B64.searchCertificate, fillSearchCertificate, formData),
  ]);

  const stamp = timestamp();
  const safeCrime = safeFileNamePart(formData.crimeName) || "집행서식";
  const blob = await zipBlobs([
    { name: `압수조서_${safeCrime}_${stamp}.hwpx`, blob: seizureReportBlob },
    { name: `압수목록_${safeCrime}_${stamp}.hwpx`, blob: seizureListBlob },
    { name: `압수물총목록_${safeCrime}_${stamp}.hwpx`, blob: seizureTotalListBlob },
    { name: `수색조서_${safeCrime}_${stamp}.hwpx`, blob: searchReportBlob },
    { name: `수색결과증명서_${safeCrime}_${stamp}.hwpx`, blob: searchCertificateBlob },
  ]);
  return { blob, fileName: `영장집행서식_${safeCrime}_${stamp}.zip` };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
