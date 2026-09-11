"use strict";

/** Returns the last match of a global regex in `str`, or null if none. */
function lastRegexMatch(regex, str) {
  let match = null;
  let m;
  while ((m = regex.exec(str))) {
    match = m;
  }
  return match;
}

function escapeXml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace the first occurrence of `search` in `xml` with `replacement`.
 * Throws if `search` is not found, so template drift is caught immediately
 * instead of silently producing a document with a missing field.
 */
function replaceOnce(xml, search, replacement) {
  const idx = xml.indexOf(search);
  if (idx === -1) {
    throw new Error("템플릿에서 찾을 수 없는 텍스트: " + JSON.stringify(search));
  }
  return xml.slice(0, idx) + replacement + xml.slice(idx + search.length);
}

/**
 * HWPX does not auto-reflow text for us here — each paragraph we write
 * carries exactly one <hp:lineseg>, so a long line either overflows or (with
 * the template's default paragraph style) gets its character spacing
 * squeezed to force-fit. We word-wrap ourselves so every generated
 * paragraph is short enough to actually fit on one line at normal spacing.
 * `maxChars` is a rough budget (full-width Hangul glyphs at this template's
 * font size are close to square, so "character count" is a fair proxy for
 * width); a single word longer than the budget is hard-broken.
 */
function wrapToWidth(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length > maxChars) {
      if (cur) lines.push(cur);
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      cur = rest;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Same as replaceOnce, but takes a RegExp anchor (no /g flag — we only ever
 * want the first match) instead of a literal string. Used for free-text
 * blanks whose original whitespace run length is fragile to hardcode.
 */
function replaceOnceRegex(xml, regex, replacement) {
  const match = regex.exec(xml);
  if (!match) {
    throw new Error("템플릿에서 패턴을 찾을 수 없음: " + regex);
  }
  return xml.slice(0, match.index) + replacement + xml.slice(match.index + match[0].length);
}

/**
 * HWPX table cells that are meant to be filled by hand look like:
 *   <hp:tc ...><hp:subList ...><hp:p ...><hp:run charPrIDRef="N"><hp:t>LABEL</hp:t></hp:run>...</hp:tc>
 *   <hp:tc ...><hp:subList ...><hp:p ...><hp:run charPrIDRef="M"/>...
 * i.e. the label cell is immediately followed by a sibling cell whose paragraph
 * run is self-closing (no <hp:t>) because it has no text yet.
 *
 * This finds the label, then finds the *first* self-closing run inside the
 * next <hp:tc> block, and injects the value there.
 */
function fillAdjacentCell(xml, label, value) {
  const labelTag = "<hp:t>" + label + "</hp:t>";
  const labelIdx = xml.indexOf(labelTag);
  if (labelIdx === -1) {
    throw new Error("템플릿에서 라벨을 찾을 수 없음: " + JSON.stringify(label));
  }

  // Move past the label's own </hp:tc> so we search inside the *next* cell.
  const labelCellEnd = xml.indexOf("</hp:tc>", labelIdx);
  if (labelCellEnd === -1) {
    throw new Error("라벨 셀의 종료 태그를 찾을 수 없음: " + JSON.stringify(label));
  }
  const searchStart = labelCellEnd + "</hp:tc>".length;

  const emptyRunRe = /<hp:run charPrIDRef="(\d+)"\/>/;
  const rest = xml.slice(searchStart);
  const match = emptyRunRe.exec(rest);
  if (!match) {
    throw new Error("채울 빈 칸(빈 run)을 찾을 수 없음: " + JSON.stringify(label));
  }

  const absoluteIdx = searchStart + match.index;
  const before = xml.slice(0, absoluteIdx);
  const after = xml.slice(absoluteIdx + match[0].length);
  const filled = '<hp:run charPrIDRef="' + match[1] + '"><hp:t>' + escapeXml(value) + "</hp:t></hp:run>";
  return before + filled + after;
}

/**
 * Same idea as fillAdjacentCell, but for multi-line values: writes the first
 * line into the existing empty run/paragraph, then inserts one extra
 * <hp:p> per additional line right after it (same cell, same subList).
 */
function fillAdjacentCellMultiline(xml, label, value) {
  // 이 칸(가로폭 31476 HWPUNIT, 글자 크기 12pt 기준 대략 26자가 한 줄)도
  // 줄바꿈 대신 글자 간격을 좁혀 욱여넣는 서식을 쓰므로, 명시적 줄바꿈이
  // 없는 긴 문장도 미리 안전한 길이로 잘라 둔다.
  const lines = String(value == null ? "" : value)
    .split(/\r\n|\r|\n/)
    .flatMap((line) => wrapToWidth(line, 24));
  const first = lines[0] || "";
  let out = fillAdjacentCell(xml, label, first);
  if (lines.length <= 1) return out;

  // Re-locate the paragraph we just filled so we can append sibling <hp:p>s
  // for the remaining lines, inside the same cell (before </hp:subList>).
  const labelTag = "<hp:t>" + label + "</hp:t>";
  const labelIdx = out.indexOf(labelTag);
  const labelCellEnd = out.indexOf("</hp:tc>", labelIdx);
  const cellSubListEnd = out.indexOf("</hp:subList>", labelCellEnd);
  if (cellSubListEnd === -1) {
    throw new Error("멀티라인 삽입 위치를 찾을 수 없음: " + JSON.stringify(label));
  }

  const extraParas = lines
    .slice(1)
    .map(function (line) {
      const t = line.length
        ? "<hp:t>" + escapeXml(line) + "</hp:t>"
        : "";
      return (
        '<hp:p id="2147483648" paraPrIDRef="57" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
        '<hp:run charPrIDRef="12">' +
        t +
        "</hp:run>" +
        '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="1560" horzpos="0" horzsize="31476" flags="393216"/></hp:linesegarray>' +
        "</hp:p>"
      );
    })
    .join("");

  return out.slice(0, cellSubListEnd) + extraParas + out.slice(cellSubListEnd);
}

/**
 * The template's cover page is one big anchored table (19 rows): rows 0-14
 * are the 경찰 신청서 (기관명 ... 특이사항 4개), and rows 15-18 are the
 * 검사가 작성하는 영장청구서("○○지방검찰청" ... 기각취지 및 이유) — both
 * currently rendered back-to-back before "별지1"/"별지2"/"별지3" even start.
 *
 * This splits that single table into two (same column/border styling,
 * cloned from the original definition), keeps the 신청서 rows in place, and
 * moves the 검사 청구서 rows into a new table appended at the very end of
 * the document (after 별지3) so "별지1"이 신청서 표지 바로 다음에 오도록
 * 만든다 — the 검사/법원용 청구서는 별지들 뒤로 밀려난다.
 *
 * `splitRowLabel` identifies the first row of the block to relocate.
 */
function moveTrailingTableRowsToEnd(xml, splitRowLabel) {
  const tblOpenIdx = xml.indexOf("<hp:tbl");
  if (tblOpenIdx === -1) {
    throw new Error("표 시작 태그(<hp:tbl>)를 찾을 수 없음");
  }
  const firstTrIdx = xml.indexOf("<hp:tr>", tblOpenIdx);
  if (firstTrIdx === -1) {
    throw new Error("표의 첫 행(<hp:tr>)을 찾을 수 없음");
  }
  const tblDefPrefix = xml.slice(tblOpenIdx, firstTrIdx);

  const tblCloseTag = "</hp:tbl>";
  const tblCloseIdx = xml.indexOf(tblCloseTag, firstTrIdx);
  if (tblCloseIdx === -1) {
    throw new Error("표 종료 태그(</hp:tbl>)를 찾을 수 없음");
  }
  const rowsXml = xml.slice(firstTrIdx, tblCloseIdx);
  const rows = rowsXml.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g) || [];
  if (!rows.length) {
    throw new Error("표 안에서 행(<hp:tr>)을 찾을 수 없음");
  }

  const splitLabelTag = "<hp:t>" + splitRowLabel + "</hp:t>";
  const splitIdx = rows.findIndex((row) => row.includes(splitLabelTag));
  if (splitIdx === -1) {
    throw new Error("옮길 구간의 시작 행을 찾을 수 없음: " + JSON.stringify(splitRowLabel));
  }
  const keptRows = rows.slice(0, splitIdx);
  const movedRows = rows.slice(splitIdx);
  if (!keptRows.length || !movedRows.length) {
    throw new Error("표를 나눌 수 없음(한쪽에 행이 남지 않음): " + JSON.stringify(splitRowLabel));
  }

  function rebuildTableDef(rowCount, newHeight, newId, newZOrder) {
    let out = tblDefPrefix.replace(/rowCnt="\d+"/, 'rowCnt="' + rowCount + '"');
    out = out.replace(/height="\d+"/, 'height="' + newHeight + '"');
    if (newId != null) {
      out = out.replace(/(<hp:tbl\s+id=")(\d+)(")/, "$1" + newId + "$3");
    }
    if (newZOrder != null) {
      out = out.replace(/(zOrder=")(-?\d+)(")/, "$1" + newZOrder + "$3");
    }
    return out;
  }

  // 표를 나눈 두 표의 <hp:sz height="..."/>를 정확히 계산한다. 원래처럼
  // 행 개수 비율로 대충 나누면, 실제 행 높이가 제각각이라(예: 긴 텍스트가
  // 든 행 vs 짧은 행) 계산된 높이가 실제 내용보다 작아질 수 있다 — 그러면
  // 한글이 이 표 바로 다음 문단(별지1)을 그 표가 끝나기도 전에 배치해
  // 겹쳐 보이는 문제가 생긴다(실제로 확인됨). 대신 각 행의 실제 내용
  // 높이(rowSpan=1 셀의 <hp:cellSz height=.../> 중 가장 큰 값)를 더하고,
  // 원본 표의 (선언된 전체 높이 - 모든 행 내용 높이 합)을 행 수로 나눈
  // "행당 여백"을 그만큼 다시 더해, 나눠진 두 표의 높이 합이 원본과
  // 정확히 같아지도록 한다.
  function rowContentHeight(rowXml) {
    const cellMatches = [
      ...rowXml.matchAll(/<hp:cellSpan colSpan="\d+" rowSpan="(\d+)"\/><hp:cellSz width="\d+" height="(\d+)"\/>/g),
    ];
    const singleRowHeights = cellMatches.filter((m) => m[1] === "1").map((m) => Number(m[2]));
    if (singleRowHeights.length) return Math.max(...singleRowHeights);
    const anyHeights = cellMatches.map((m) => Number(m[2]));
    return anyHeights.length ? Math.max(...anyHeights) : 0;
  }

  const allRowHeights = rows.map(rowContentHeight);
  const totalRows = rows.length;
  const declaredHeightMatch = /<hp:sz\s+width="\d+"\s+widthRelTo="ABSOLUTE"\s+height="(\d+)"/.exec(tblDefPrefix);
  const declaredHeight = declaredHeightMatch ? Number(declaredHeightMatch[1]) : 0;
  const contentHeightSum = allRowHeights.reduce((a, b) => a + b, 0);
  const perRowOverhead = totalRows ? (declaredHeight - contentHeightSum) / totalRows : 0;

  function heightFor(count, sliceStart, sliceEnd) {
    const contentSum = allRowHeights.slice(sliceStart, sliceEnd).reduce((a, b) => a + b, 0);
    return Math.max(1, Math.round(contentSum + count * perRowOverhead));
  }

  const keptHeight = heightFor(keptRows.length, 0, splitIdx);
  const keptTableXml =
    rebuildTableDef(keptRows.length, keptHeight, null, null) + keptRows.join("") + tblCloseTag;

  const origIdMatch = /<hp:tbl\s+id="(\d+)"/.exec(tblDefPrefix);
  const newTblId = origIdMatch ? String(Number(origIdMatch[1]) + 1) : "1";
  // 표를 그대로 복제하면 zOrder(앵커 객체 쌓임 순서)도 원본 표와 같은 값을
  // 그대로 갖게 되어, 문서 안에 zOrder가 같은 앵커 객체가 두 개 생긴다.
  // 한글이 이 중복을 정상 처리하지 못하고 파일을 열 때 런타임 오류를 내는
  // 것을 실제로 확인했다 — 문서 전체에서 쓰이는 zOrder 중 가장 큰 값보다
  // 하나 큰 값을 새로 부여해 항상 유일하게 만든다.
  const allZOrders = [...xml.matchAll(/zOrder="(-?\d+)"/g)].map((m) => Number(m[1]));
  const newZOrder = (allZOrders.length ? Math.max(...allZOrders) : 0) + 1;

  // 옮겨지는 행마다 원래 표(19행) 안에서의 위치가 <hp:cellAddr rowAddr="15..18"/>
  // 로 박혀 있는데, 새로 분리된 표는 rowCnt="4"(유효 범위 0~3)라고 선언하므로
  // 이 값을 그대로 두면 표가 선언한 행 수를 벗어나는 행 주소를 갖게 된다.
  // 실제로 이 상태의 파일을 열면 한글이 런타임 오류를 내며 열리지 않는 것을
  // 확인했다 — rowAddr를 옮겨지는 표 기준 0부터 다시 매겨야 한다.
  const renumberedMovedRows = movedRows.map((row) =>
    row.replace(
      /(<hp:cellAddr colAddr="\d+" rowAddr=")(\d+)(")/g,
      function (m, pre, rowAddr, post) {
        return pre + (Number(rowAddr) - splitIdx) + post;
      }
    )
  );
  const movedHeight = heightFor(movedRows.length, splitIdx, rows.length);
  const movedTableXml =
    rebuildTableDef(movedRows.length, movedHeight, newTblId, newZOrder) + renumberedMovedRows.join("") + tblCloseTag;

  // 표를 감싸는 run/문단의 스타일 참조(charPrIDRef/paraPrIDRef)는 서식을
  // 한글에서 편집·저장할 때마다 번호가 바뀔 수 있으므로, 하드코딩하지 않고
  // 원본 표 바로 앞에서 실제로 쓰인 값을 그대로 읽어와 재사용한다.
  const beforeTbl = xml.slice(0, tblOpenIdx);
  const wrapRunMatch = lastRegexMatch(/<hp:run\s+charPrIDRef="(\d+)">/g, beforeTbl);
  if (!wrapRunMatch) {
    throw new Error("표를 감싸는 run(<hp:run charPrIDRef=...>)을 찾을 수 없음");
  }
  const wrapCharPrIDRef = wrapRunMatch[1];
  const wrapParaMatch = lastRegexMatch(/<hp:p\b[^>]*\bparaPrIDRef="(\d+)"/g, beforeTbl);
  if (!wrapParaMatch) {
    throw new Error("표를 감싸는 문단(<hp:p paraPrIDRef=...>)을 찾을 수 없음");
  }
  const wrapParaPrIDRef = wrapParaMatch[1];

  let out = xml.slice(0, tblOpenIdx) + keptTableXml + xml.slice(tblCloseIdx + tblCloseTag.length);

  const movedParagraph =
    '<hp:p id="0" paraPrIDRef="' + wrapParaPrIDRef + '" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0">' +
    '<hp:run charPrIDRef="' + wrapCharPrIDRef + '">' + movedTableXml + "<hp:t/></hp:run>" +
    '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="1560" horzpos="0" horzsize="48188" flags="393216"/></hp:linesegarray>' +
    "</hp:p>";

  const secCloseTag = "</hs:sec>";
  const secCloseIdx = out.lastIndexOf(secCloseTag);
  if (secCloseIdx === -1) {
    throw new Error("문서 본문 종료 태그(</hs:sec>)를 찾을 수 없음");
  }
  return out.slice(0, secCloseIdx) + movedParagraph + out.slice(secCloseIdx);
}

/**
 * Appends one or more "별지" (attachment) pages at the very end of the
 * document body, each starting on a new page.
 *
 * sections: [{ heading: string, content: string }]
 */
function appendAttachmentPages(xml, sections) {
  const closeTag = "</hs:sec>";
  const closeIdx = xml.lastIndexOf(closeTag);
  if (closeIdx === -1) {
    throw new Error("문서 본문 종료 태그(</hs:sec>)를 찾을 수 없음");
  }

  function plainParagraph(text, opts) {
    opts = opts || {};
    const pageBreak = opts.pageBreak ? "1" : "0";
    const charPrIDRef = opts.charPrIDRef || "12";
    const t = text.length ? "<hp:t>" + escapeXml(text) + "</hp:t>" : "";
    const run = t
      ? '<hp:run charPrIDRef="' + charPrIDRef + '">' + t + "</hp:run>"
      : '<hp:run charPrIDRef="' + charPrIDRef + '"/>';
    return (
      '<hp:p id="2147483648" paraPrIDRef="1" styleIDRef="0" pageBreak="' +
      pageBreak +
      '" columnBreak="0" merged="0">' +
      run +
      '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="1560" horzpos="0" horzsize="47504" flags="393216"/></hp:linesegarray>' +
      "</hp:p>"
    );
  }

  let out = "";
  sections.forEach(function (section, sectionIdx) {
    out += plainParagraph("[별지] " + section.heading, {
      pageBreak: true,
      charPrIDRef: "16",
    });
    out += plainParagraph("", {});
    const lines = String(section.content == null ? "" : section.content).split(/\r\n|\r|\n/);
    lines.forEach(function (line) {
      out += plainParagraph(line, {});
    });
  });

  return xml.slice(0, closeIdx) + out + xml.slice(closeIdx);
}

/**
 * Fills the blank paragraphs the template author left under a plain-body
 * label (not a table cell) — e.g. inside a "별지" attachment page that looks
 * like:
 *   <hp:p ...><hp:t>○ 범죄사실</hp:t>...</hp:p>
 *   <hp:p ...><hp:run charPrIDRef="N"/>...</hp:p>   <- blank line
 *   <hp:p ...><hp:run charPrIDRef="N"/>...</hp:p>   <- blank line
 *   ...
 *   <hp:p ...><hp:t>다음 라벨</hp:t>...</hp:p>
 *
 * `value` is split into lines; each line fills one existing blank paragraph
 * in order. Leftover blank paragraphs (value shorter than the reserved
 * space) are left untouched. Leftover lines (value longer than the reserved
 * space) become new paragraphs, cloning the style of a sampled blank
 * paragraph — or of the label's own paragraph when the template reserved no
 * blank lines at all (e.g. the very last label in the section).
 *
 * `nextLabel` is the next label text marking where this block ends; pass
 * null when `label` is the last labelled block in its container (by default
 * that container is the whole document body, ending at `</hs:sec>` — pass
 * `options.boundaryTag` to bound it to something narrower instead, e.g.
 * `</hp:subList>` when `label` lives inside a table cell and nothing past
 * that cell's own close tag should be touched).
 * An empty/blank `value` is a no-op — the template's blank lines stay as-is.
 */
function fillParagraphBlock(xml, label, nextLabel, value, options) {
  const text = String(value == null ? "" : value);
  if (!text.trim()) return xml;

  const boundaryTag = (options && options.boundaryTag) || "</hs:sec>";

  const labelTag = "<hp:t>" + label + "</hp:t>";
  const labelIdx = xml.indexOf(labelTag);
  if (labelIdx === -1) {
    throw new Error("템플릿에서 라벨을 찾을 수 없음: " + JSON.stringify(label));
  }
  const labelParaStart = xml.lastIndexOf("<hp:p", labelIdx);
  const labelParaEnd = xml.indexOf("</hp:p>", labelIdx) + "</hp:p>".length;

  let boundary;
  if (nextLabel) {
    const nextTag = "<hp:t>" + nextLabel + "</hp:t>";
    const nextIdx = xml.indexOf(nextTag, labelParaEnd);
    if (nextIdx === -1) {
      throw new Error("템플릿에서 다음 라벨을 찾을 수 없음: " + JSON.stringify(nextLabel));
    }
    boundary = xml.lastIndexOf("<hp:p", nextIdx);
  } else {
    const closeIdx = xml.indexOf(boundaryTag, labelParaEnd);
    if (closeIdx === -1) {
      throw new Error("종료 경계 태그를 찾을 수 없음: " + JSON.stringify(boundaryTag));
    }
    boundary = closeIdx;
  }

  const region = xml.slice(labelParaEnd, boundary);
  const blankParas = region.match(/<hp:p[^>]*>[\s\S]*?<\/hp:p>/g) || [];

  const sampleFrom = blankParas[0] || xml.slice(labelParaStart, labelParaEnd);
  function sampleAttr(re, fallback) {
    const m = re.exec(sampleFrom);
    return m ? m[1] : fallback;
  }
  const charPrIDRef = sampleAttr(/charPrIDRef="(\d+)"/, "0");

  // 별지의 빈 줄들은 문단서식 54번을 쓰는데, 그 서식은 condense="25"
  // (한 줄에 안 들어가는 문장을 줄바꿈하는 대신 글자 간격을 최대 25%까지
  // 좁혀서 욱여넣는 설정)라 문장이 길면 읽기 힘들어진다. 원본 서식에
  // condense="0"으로 그대로 복제해 둔 56번 서식을 대신 써서, 줄이 넘치면
  // 글자 간격을 유지한 채 자연스럽게 다음 줄로 넘어가게 한다.
  const sampledParaPrIDRef = sampleAttr(/paraPrIDRef="(\d+)"/, "54");
  const paraPrIDRef = sampledParaPrIDRef === "54" ? "56" : sampledParaPrIDRef;

  function paraWithText(line) {
    const t = line.length ? "<hp:t>" + escapeXml(line) + "</hp:t>" : "";
    const run = t
      ? '<hp:run charPrIDRef="' + charPrIDRef + '">' + t + "</hp:run>"
      : '<hp:run charPrIDRef="' + charPrIDRef + '"/>';
    return (
      '<hp:p id="2147483648" paraPrIDRef="' + paraPrIDRef + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
      run +
      '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1400" textheight="1400" baseline="1190" spacing="1820" horzpos="0" horzsize="48188" flags="393216"/></hp:linesegarray>' +
      "</hp:p>"
    );
  }

  // horzsize 48188 HWPUNIT, 이 서식의 본문 글자 크기(vertsize 1400 = 14pt)
  // 기준 대략 34자가 한 줄 — 여유를 두고 32자에서 끊는다.
  const lines = text
    .split(/\r\n|\r|\n/)
    .flatMap((line) => wrapToWidth(line, 32));
  // 채우고 남는 예약 줄은 원래 텍스트(예: 작성 예시 문구)가 있었더라도
  // 항상 빈 줄로 다시 만든다 — 그렇지 않으면 사용자가 입력한 내용 뒤에
  // 서식에 남아있던 예시 문구가 그대로 딸려 나오는 문제가 생긴다.
  let newRegion = "";
  for (let i = 0; i < Math.max(lines.length, blankParas.length); i++) {
    newRegion += paraWithText(i < lines.length ? lines[i] : "");
  }

  return xml.slice(0, labelParaEnd) + newRegion + xml.slice(boundary);
}

module.exports = {
  escapeXml,
  replaceOnce,
  replaceOnceRegex,
  fillAdjacentCell,
  fillAdjacentCellMultiline,
  appendAttachmentPages,
  fillParagraphBlock,
  moveTrailingTableRowsToEnd,
};
