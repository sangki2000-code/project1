"use strict";

const fs = require("fs");
const yauzl = require("yauzl");
const yazl = require("yazl");

/** Reads every entry of a zip (hwpx) file into memory, preserving order and
 * whether each entry was stored (uncompressed) or deflated in the original,
 * so a rewritten copy can mirror the original packaging exactly. */
function readZipEntries(filePath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            entries.push({
              fileName: entry.fileName,
              data: Buffer.concat(chunks),
              store: entry.compressionMethod === 0,
            });
            zipfile.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zipfile.on("end", () => resolve(entries));
      zipfile.on("error", reject);
    });
  });
}

function writeZipEntries(entries, outPath) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const e of entries) {
      zipfile.addBuffer(e.data, e.fileName, {
        compress: !e.store,
        mtime: new Date(1980, 0, 1),
        mode: 0o644,
      });
    }
    const out = fs.createWriteStream(outPath);
    out.on("close", resolve);
    out.on("error", reject);
    zipfile.outputStream.pipe(out);
    zipfile.end();
  });
}

module.exports = { readZipEntries, writeZipEntries };
