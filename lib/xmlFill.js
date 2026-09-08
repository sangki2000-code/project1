"use strict";

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
  const lines = String(value == null ? "" : value).split(/\r\n|\r|\n/);
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
        '<hp:p id="2147483648" paraPrIDRef="46" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
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

module.exports = {
  escapeXml,
  replaceOnce,
  replaceOnceRegex,
  fillAdjacentCell,
  fillAdjacentCellMultiline,
  appendAttachmentPages,
};
