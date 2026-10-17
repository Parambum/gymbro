import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Read the first worksheet of an .xlsx file into rows of cell values.
 *
 * An .xlsx is a zip of XML files. Node already has the inflate half of zip, so
 * this is the central directory, two XML files and a few regexes — the same
 * call the CSV reader next door made about not adding a dependency for a
 * format that fits on one screen.
 *
 * Scope is deliberately narrow: shared and inline strings, numbers, booleans,
 * first sheet only. That is everything the INDB spreadsheet uses; anything
 * fancier (formulas evaluated by Excel, merged cells, dates) is not handled.
 */

function entries(buf) {
  // End of central directory: the last 0x06054b50 in the file.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    files.set(name, { method, compressed, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function read(buf, files, name) {
  const f = files.get(name);
  if (!f) return null;
  const start = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
  const data = buf.subarray(start, start + f.compressed);
  if (f.method === 0) return data.toString("utf8");
  if (f.method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`unsupported zip compression ${f.method} for ${name}`);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescape(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === "#") return String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10));
    return ENTITIES[e];
  });
}

/** Concatenated text of every <t> under one node — rich-text runs included. */
function textOf(xml) {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescape(out);
}

function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** @returns {Array<Array<string | number | boolean | null>>} */
export function readFirstSheet(path) {
  const buf = readFileSync(path);
  const files = entries(buf);

  const sharedXml = read(buf, files, "xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const sheetName = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  const sheet = read(buf, files, sheetName);
  if (!sheet) throw new Error("no worksheet found");

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = null;
      if (type === "s") value = shared[Number(v)] ?? null;
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str") value = v == null ? null : unescape(v);
      else if (type === "b") value = v === "1";
      else if (v != null && v !== "") value = Number(v);
      row[ref ? columnIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => (x === undefined ? null : x)));
  }
  return rows;
}
