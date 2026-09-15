import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * A minimal RFC-4180 CSV reader.
 *
 * USDA's exports are quoted, contain commas inside descriptions, and run to
 * hundreds of thousands of rows. A dependency would do this, but it is thirty
 * lines and the project rule is not to add one for that.
 *
 * Streams line by line so a 35 MB nutrient table never lands in memory whole.
 */

/** Split one CSV line, honouring quotes and doubled-quote escapes. */
export function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Yield each row as an object keyed by the header.
 *
 * `onRow` returning false stops the scan early — used when we only need a
 * slice of a very large table.
 */
export async function readCsv(path, onRow) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let header = null;
  let count = 0;

  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((h) => h.trim().replace(/^"|"$/g, ""));
      continue;
    }
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    count++;
    if (onRow(row) === false) break;
  }

  rl.close();
  return count;
}
