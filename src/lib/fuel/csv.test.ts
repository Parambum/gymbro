import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    const out = toCsv(["a", "b"], [["dal, tadka", 'the "good" one'], ["two\nlines", 3]]);
    expect(out).toBe('﻿a,b\r\n"dal, tadka","the ""good"" one"\r\n"two\nlines",3\r\n');
  });

  it("neutralises formulas but leaves numbers alone", () => {
    const out = toCsv(["x", "n"], [["=HYPERLINK(1)", -5]]);
    expect(out).toContain("'=HYPERLINK(1),-5");
  });

  it("writes empty cells for missing values", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("﻿a,b\r\n,\r\n");
  });
});
