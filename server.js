"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const yazl = require("yazl");
const { generateHwpxBuffers } = require("./lib/generateHwpx");
const presets = require("./lib/fields");

/** { name, data }[] -> Buffer, zipped. 별지 제55호서식은 규정 서식이라 순서를
 * 바꿀 수 없어, "신청서(+청구서)"와 "별지1ㆍ2ㆍ3"를 각각 다른 .hwpx 파일로
 * 만들고 이 zip 하나로 묶어 한 번에 내려받게 한다. */
function zipFiles(files) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const f of files) {
      zipfile.addBuffer(f.data, f.name, { mtime: new Date(1980, 0, 1), mode: 0o644 });
    }
    const tmpOut = path.join(
      os.tmpdir(),
      "hwpx-zip-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".zip"
    );
    const out = fs.createWriteStream(tmpOut);
    out.on("close", () => {
      const buf = fs.readFileSync(tmpOut);
      fs.unlinkSync(tmpOut);
      resolve(buf);
    });
    out.on("error", reject);
    zipfile.outputStream.pipe(out);
    zipfile.end();
  });
}

const PORT = process.env.PORT || 4173;

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
      // 피의자 인적사항 — 민감정보. 사용자가 입력한 경우에만 채워지며,
      // 서버 어디에도 저장하지 않고 응답으로 곧바로 돌려보내기만 한다.
      suspectName: body.suspectName || "",
      suspectRRN: body.suspectRRN || "",
      suspectJob: body.suspectJob || "",
      suspectAddress: body.suspectAddress || "",
      defenseCounsel: body.defenseCounsel || "",
      crimeFacts: body.crimeFacts || "",
      seizureItems: body.seizureItems || "",
      searchPlace: body.searchPlace || "",
      crimeContext: body.crimeContext || "",
      necessityReason: body.necessityReason || "",
      over7DaysReason: body.over7DaysReason || "",
      multipleWarrantsReason: body.multipleWarrantsReason || "",
      nightExecutionReason: body.nightExecutionReason || "",
      bodyExamInfo: body.bodyExamInfo || "",
    };

    const { applicationBuffer, attachmentBuffer } = await generateHwpxBuffers(formData);

    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    const safeCrime = (formData.crimeName || "신청서").replace(/[\\/:*?"<>|]/g, "");
    const zipName = `압수수색영장신청서_${safeCrime}_${stamp}.zip`;

    // 별지 제55호서식은 규정 서식이라 신청서ㆍ청구서ㆍ별지의 순서를 바꿀 수
    // 없다. 그래서 신청서(+청구서)와 별지1ㆍ2ㆍ3을 각각 별도 .hwpx 파일로
    // 만들어 zip 하나에 담아 내려보낸다.
    const zipBuf = await zipFiles([
      { name: `압수수색영장신청서_${safeCrime}_${stamp}.hwpx`, data: applicationBuffer },
      { name: `별지_${safeCrime}_${stamp}.hwpx`, data: attachmentBuffer },
    ]);

    // 인적사항이 포함될 수 있으므로 이 PC에도 사본을 남기지 않는다.
    // 다운로드되는 파일이 유일한 산출물이다.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent(zipName)
    );
    res.send(zipBuf);
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
