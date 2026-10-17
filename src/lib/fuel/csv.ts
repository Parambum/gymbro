/**
 * RFC 4180 CSV, for exports. Small enough not to want a dependency.
 *
 * One defence beyond quoting: a cell that starts with = + - @ (or a tab /
 * carriage return) is prefixed with an apostrophe, so a food named
 * "=HYPERLINK(...)" cannot run as a formula when the file is opened in a
 * spreadsheet (CSV injection). Numbers are written as numbers and exempt.
 */

type Cell = string | number | boolean | null | undefined;

function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  // BOM so Excel opens UTF-8 (paneer, crème brûlée) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
