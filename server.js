"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const { generateHwpxBuffer } = require("./lib/generateHwpx");
const presets = require("./lib/fields");

const PORT = process.env.PORT || 4173;
const OUTPUT_DIR = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/presets", (req, res) => {
  res.json(presets);
});

function splitDate(isoDate) {
  // "2026-09-08" -> { year: "2026", month: "9", day: "8" }
  if (!isoDate) return { year: "", month: "", day: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return { year: "", month: "", day: "" };
  return {
    year: m[1],
    month: String(Number(m[2])),
    day: String(Number(m[3])),
  };
}

app.post("/api/generate", async (req, res) => {
  try {
    const body = req.body || {};
    const sendDate = splitDate(body.sendDate);
    const validDate = splitDate(body.validDate);

    const formData = {
      orgName: body.orgName || "",
      docNo: body.docNo || "",
      sendYear: sendDate.year,
      sendMonth: sendDate.month,
      sendDay: sendDate.day,
      prosecutorsOffice: body.prosecutorsOffice || "",
      crimeName: body.crimeName || "",
      validYear: validDate.year,
      validMonth: validDate.month,
      validDay: validDate.day,
      defenseCounsel: body.defenseCounsel || "",
      seizureItems: body.seizureItems || "",
      searchPlace: body.searchPlace || "",
      crimeFacts: body.crimeFacts || "",
      crimeCircumstances: body.crimeCircumstances || "",
      over7DaysReason: body.over7DaysReason || "",
      multipleWarrantsReason: body.multipleWarrantsReason || "",
      nightExecutionReason: body.nightExecutionReason || "",
      bodyExamInfo: body.bodyExamInfo || "",
    };

    const buf = await generateHwpxBuffer(formData);

    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    const safeCrime = (formData.crimeName || "신청서").replace(/[\\/:*?"<>|]/g, "");
    const fileName = `압수수색영장신청서_${safeCrime}_${stamp}.hwpx`;
    fs.writeFileSync(path.join(OUTPUT_DIR, fileName), buf);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent(fileName)
    );
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 127.0.0.1에만 바인딩 — 같은 네트워크의 다른 기기에서는 접속할 수 없고,
// 이 PC 안에서만 열리는 서버임을 보장한다.
const server = app.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`압수수색영장신청서 작성기 서버가 시작되었습니다: ${url}`);
  console.log("이 창을 닫으면 프로그램이 종료됩니다.");
  openBrowser(url);
});

function openBrowser(url) {
  const { exec } = require("child_process");
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log("브라우저를 자동으로 열지 못했습니다. 다음 주소를 직접 열어주세요: " + url);
    }
  });
}

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
