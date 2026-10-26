import { describe, expect, it } from "vitest";
import { acceptedLicence, cleanProse, parseXml, readArticle, textOf } from "./jats";

const ARTICLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS//EN" "JATS.dtd">
<article><front>
<journal-meta><journal-title-group><journal-title>J Test</journal-title></journal-title-group></journal-meta>
<article-meta>
  <article-id pub-id-type="pmcid">PMC123</article-id>
  <article-id pub-id-type="doi">10.1/abc</article-id>
  <title-group><article-title>Protein &amp; exercise.</article-title></title-group>
  <contrib-group>
    <contrib contrib-type="author"><name><surname>Jäger</surname><given-names>R</given-names></name></contrib>
    <contrib contrib-type="editor"><name><surname>Nobody</surname></name></contrib>
  </contrib-group>
  <pub-date pub-type="epub"><year>2017</year></pub-date>
  <permissions><license><ali:license_ref>https://creativecommons.org/licenses/by/4.0/</ali:license_ref></license></permissions>
  <abstract><p>Intakes of 1.4&#x2013;2.0 g/kg are sufficient <xref ref-type="bibr" rid="r1">[1]</xref>.</p></abstract>
</article-meta></front>
<body>
  <sec><title>Background</title>
    <p>The position is as follows:<list><list-item><p>First point here.</p></list-item><list-item><p>Second point here.</p></list-item></list></p>
    <p>See the results <xref ref-type="fig" rid="f1">Fig. 1</xref> (Fig. <xref rid="f2">2</xref>) and <italic>more</italic> text<xref rid="r2">2</xref>.</p>
    <table-wrap><table><tr><td>99 g</td></tr></table></table-wrap>
  </sec>
  <sec><title>Methods</title><p>Search strings that must not appear.</p></sec>
  <sec sec-type="materials|methods"><title>Body composition assessment methods</title><p>DEXA is a reference method.</p></sec>
  <sec sec-type="methods"><p>Untitled methods text that must not appear.</p></sec>
  <sec><title>Data Availability Statement</title><p>On request.</p></sec>
</body></article>`;

describe("parseXml", () => {
  it("decodes entities and survives a DOCTYPE and processing instruction", () => {
    const doc = parseXml(ARTICLE);
    expect(textOf(doc)).toContain("Protein & exercise.");
    expect(textOf(doc)).toContain("1.4–2.0");
  });
  it("keeps '>' inside quoted attribute values", () => {
    const doc = parseXml(`<a href="x>y">t</a>`);
    expect((doc.children[0] as { attrs: Record<string, string> }).attrs.href).toBe("x>y");
  });
});

describe("readArticle", () => {
  const a = readArticle(ARTICLE);

  it("reads citation metadata", () => {
    expect(a.title).toBe("Protein & exercise");
    expect(a.authors).toEqual(["Jäger"]);
    expect(a.journal).toBe("J Test");
    expect(a.year).toBe(2017);
    expect(a.doi).toBe("10.1/abc");
    expect(a.pmcid).toBe("PMC123");
    expect(a.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("drops citation markers, tables and figure references", () => {
    const text = a.paragraphs.map((p) => p.text).join(" ");
    expect(text).toContain("Intakes of 1.4–2.0 g/kg are sufficient.");
    expect(text).not.toContain("[1]");
    expect(text).not.toContain("99 g");
    expect(text).not.toMatch(/Fig/);
  });

  it("splits a list inside a paragraph into one paragraph per item", () => {
    const texts = a.paragraphs.map((p) => p.text);
    expect(texts).toContain("The position is as follows:");
    expect(texts).toContain("First point here.");
    expect(texts).toContain("Second point here.");
  });

  it("skips methods and boilerplate but keeps content sections that mention methods", () => {
    const sections = a.paragraphs.map((p) => p.section.join(" › "));
    expect(sections).toContain("Body composition assessment methods");
    expect(sections).not.toContain("Methods");
    expect(a.skippedSections).toEqual(["Methods", "[sec-type=methods]", "Data Availability Statement"]);
    expect(a.paragraphs.map((p) => p.text).join(" ")).not.toContain("Untitled methods");
  });
});

describe("acceptedLicence", () => {
  it("accepts CC BY and CC0", () => {
    expect(acceptedLicence("https://creativecommons.org/licenses/by/4.0/", "")).toBe("cc-by");
    expect(acceptedLicence("http://creativecommons.org/licenses/by/2.0", "")).toBe("cc-by");
    expect(acceptedLicence("https://creativecommons.org/publicdomain/zero/1.0/", "")).toBe("cc0");
  });
  it("refuses NC, ND and SA", () => {
    expect(acceptedLicence("https://creativecommons.org/licenses/by-nc/4.0/", "")).toBeNull();
    expect(acceptedLicence("https://creativecommons.org/licenses/by-nd/4.0/", "")).toBeNull();
    expect(acceptedLicence("https://creativecommons.org/licenses/by-sa/4.0/", "")).toBeNull();
    expect(acceptedLicence("https://creativecommons.org/licenses/by-nc-nd/4.0/", "")).toBeNull();
  });
  it("reads licence prose only when it is unambiguous", () => {
    expect(acceptedLicence(null, "This article is licensed under a Creative Commons Attribution 4.0 International License")).toBe("cc-by");
    expect(acceptedLicence(null, "Creative Commons Attribution-NonCommercial 4.0 International License")).toBeNull();
    expect(acceptedLicence(null, "All rights reserved")).toBeNull();
  });
});

describe("cleanProse", () => {
  it("removes the debris dropped citations leave", () => {
    expect(cleanProse("works ( , ) well [ ] here , too")).toBe("works well here, too");
    expect(cleanProse("as shown [3, 7–9] before")).toBe("as shown before");
  });
});
