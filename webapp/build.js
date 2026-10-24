"use strict";

// 웹 단일 파일 버전을 만드는 빌드 스크립트. `node webapp/build.js`로 실행한다.
//
// 핵심 원칙: 서식을 채우는 실제 로직(lib/xmlFill.js, lib/generateHwpx.js의
// fillApplicationSection0 등, lib/generateExecutionForms.js의 fillSeizureReport
// 등)은 손으로 다시 베껴 적지 않고, 이 스크립트가 Node에서 그 모듈들을 직접
// require()한 뒤 함수의 .toString()으로 소스를 그대로 뽑아 브라우저 번들에
// 끼워 넣는다 — 그래야 서버판 로직이 바뀌면(버그 수정, 서식 보완 등) 이
// 스크립트를 다시 실행하는 것만으로 웹판도 똑같이 따라간다. zip을 다루는
// 부분만 Node 전용(yauzl/yazl/fs)이라 브라우저용(JSZip)으로 따로 쓴
// webapp/generate.js를 쓴다.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "영장업무도우미_웹버전.html");

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function readBase64(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath)).toString("base64");
}

/** "...\nmodule.exports = {...};\n" 형태의 마지막 블록을 제거한다(복붙 실수로
 * module.exports가 없으면 바로 알 수 있도록 못 찾으면 에러를 던진다). */
function stripModuleExports(source, label) {
  const idx = source.indexOf("\nmodule.exports");
  if (idx === -1) {
    throw new Error(label + "에서 module.exports를 찾지 못했습니다 — 원본 파일 구조가 바뀐 것 같습니다.");
  }
  return source.slice(0, idx).trimEnd() + "\n";
}

/** fields.js 맨 위의 "const { X } = require(...)" 줄들을 제거한다. 그 값들은
 * crimeFactsExamples.js/evidenceCategories.js를 먼저 인라인해 두므로 이미
 * 전역에 있다. */
function stripRequireLines(source, label) {
  const lines = source.split("\n");
  const kept = lines.filter((line) => !/^const \{[^}]*\} = require\(/.test(line));
  if (kept.length === lines.length) {
    throw new Error(label + "에서 require 줄을 찾지 못했습니다 — 원본 파일 구조가 바뀐 것 같습니다.");
  }
  return kept.join("\n");
}

function fnSource(fn, label) {
  if (typeof fn !== "function") {
    throw new Error(label + "을(를) 모듈에서 찾지 못했습니다(export가 빠졌을 수 있습니다).");
  }
  return fn.toString();
}

function constSource(name, value) {
  return "const " + name + " = " + JSON.stringify(value) + ";";
}

function build() {
  // --- 1. 서버 로직을 Node에서 직접 require해서 순수 함수 소스를 뽑는다 ---
  const generateHwpx = require("../lib/generateHwpx");
  const generateExecutionForms = require("../lib/generateExecutionForms");

  const pureFunctionsJs = [
    constSource("PROSE_PARA_PR_ID", generateHwpx.PROSE_PARA_PR_ID),
    fnSource(generateHwpx.numberIfMultiple, "numberIfMultiple"),
    fnSource(generateHwpx.joinToSingleLine, "joinToSingleLine"),
    fnSource(generateHwpx.formatCrimeContext, "formatCrimeContext"),
    fnSource(generateHwpx.fillApplicationSection0, "fillApplicationSection0"),
    fnSource(generateHwpx.fillAttachmentSection0, "fillAttachmentSection0"),
    fnSource(generateExecutionForms.dateParts, "dateParts"),
    fnSource(generateExecutionForms.fillSeizureReport, "fillSeizureReport"),
    fnSource(generateExecutionForms.fillSeizureList, "fillSeizureList"),
    fnSource(generateExecutionForms.fillSeizureTotalList, "fillSeizureTotalList"),
    fnSource(generateExecutionForms.fillSearchReport, "fillSearchReport"),
    fnSource(generateExecutionForms.fillSearchCertificate, "fillSearchCertificate"),
  ].join("\n\n");

  // --- 2. 순수 JS 데이터/유틸 파일들을 module.exports만 떼고 그대로 인라인 ---
  const xmlFillJs = stripModuleExports(readText("lib/xmlFill.js"), "lib/xmlFill.js");
  const crimeFactsJs = stripModuleExports(readText("lib/crimeFactsExamples.js"), "lib/crimeFactsExamples.js");
  const evidenceCategoriesJs = stripModuleExports(readText("lib/evidenceCategories.js"), "lib/evidenceCategories.js");
  const necessityReasonJs = stripModuleExports(readText("lib/necessityReasonExamples.js"), "lib/necessityReasonExamples.js");
  const executionChecklistJs = stripModuleExports(readText("lib/executionChecklist.js"), "lib/executionChecklist.js");
  const fieldsJs = stripRequireLines(
    stripModuleExports(readText("lib/fields.js"), "lib/fields.js"),
    "lib/fields.js"
  );

  const appDataJs =
    "window.AppData = (function(){\n" +
    crimeFactsJs + "\n" +
    evidenceCategoriesJs + "\n" +
    necessityReasonJs + "\n" +
    executionChecklistJs + "\n" +
    fieldsJs + "\n" +
    "return { CRIME_NAME_PRESETS, SEIZURE_ITEM_PRESETS, SEARCH_PLACE_PRESETS, NECESSITY_REASON_TYPES, EVIDENCE_CATEGORIES, CRIME_FACTS_EXAMPLES, EXECUTION_CHECKLIST };\n" +
    "})();";

  // --- 3. 원본 .hwpx 서식 7개 + 로고를 base64로 인코딩 ---
  const templatesB64 = {
    applicationCover: readBase64("압수수색영장신청서_표지서식.hwpx"),
    applicationAttachment: readBase64("압수수색영장신청서_별지서식.hwpx"),
    seizureReport: readBase64("templates/execution/압수조서_별지제70호서식.hwpx"),
    seizureList: readBase64("templates/execution/압수목록_별지제71호서식.hwpx"),
    searchReport: readBase64("templates/execution/수색조서_별지제72호서식.hwpx"),
    searchCertificate: readBase64("templates/execution/수색결과증명서_별지제73호서식.hwpx"),
    seizureTotalList: readBase64("templates/execution/압수물총목록_별지제137호서식.hwpx"),
  };
  const templatesJs = "const TEMPLATES_B64 = " + JSON.stringify(templatesB64) + ";";
  const logoDataUri = "data:image/png;base64," + readBase64("public/org-logo.png");

  // --- 4. 나머지 조각(스타일, 본문, JSZip, 생성 로직, UI 로직) ---
  const styleCss = readText("public/style.css");
  const jsZipJs = readText("node_modules/jszip/dist/jszip.min.js");
  const generateJs = readText("webapp/generate.js");
  const uiJs = readText("webapp/app.js");
  let bodyHtml = readText("webapp/body.html");
  bodyHtml = bodyHtml.replace('src="/org-logo.png"', 'src="' + logoDataUri + '"');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>영장업무 도우미 (웹버전)</title>
<style>
${styleCss}
</style>
</head>
<body>
${bodyHtml}
<script>
${jsZipJs}
</script>
<script>
${xmlFillJs}
</script>
<script>
${appDataJs}
</script>
<script>
${templatesJs}
</script>
<script>
${pureFunctionsJs}
</script>
<script>
${generateJs}
</script>
<script>
${uiJs}
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT_PATH, html, "utf8");
  const sizeKb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log("생성됨: " + OUT_PATH + " (" + sizeKb + " KB)");
}

build();
