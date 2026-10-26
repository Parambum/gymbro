/**
 * Read a PMC article (JATS XML, as Europe PMC serves it) into what the coach's
 * knowledge base needs: citation metadata, the licence, and clean paragraphs
 * tagged with the section they came from.
 *
 * The XML reader is small on purpose — JATS from Europe PMC is well-formed
 * XML with no DTD tricks, and the same call was made for the .xlsx reader in
 * scripts/fuel: no dependency for a format that fits on one screen.
 *
 * Build-time only. Nothing here runs when the coach answers.
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: Array<XmlNode | string>;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;

  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      stack[stack.length - 1].children.push(decode(xml.slice(i)));
      break;
    }
    if (lt > i) stack[stack.length - 1].children.push(decode(xml.slice(i, lt)));

    if (xml.startsWith("<!--", lt)) {
      i = xml.indexOf("-->", lt) + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt);
      stack[stack.length - 1].children.push(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith("<?", lt)) {
      i = xml.indexOf("?>", lt) + 2;
    } else if (xml.startsWith("<!", lt)) {
      i = xml.indexOf(">", lt) + 1; // DOCTYPE
    } else if (xml[lt + 1] === "/") {
      const end = xml.indexOf(">", lt);
      const name = xml.slice(lt + 2, end).trim();
      // pop to the matching open tag; tolerate nothing else
      while (stack.length > 1 && stack[stack.length - 1].name !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      i = end + 1;
    } else {
      // find the tag's end, skipping '>' inside quoted attribute values
      let j = lt + 1;
      let quote: string | null = null;
      while (j < xml.length) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
        j++;
      }
      const raw = xml.slice(lt + 1, j);
      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const name = body.match(/^[^\s/>]+/)?.[0] ?? "";
      const attrs: Record<string, string> = {};
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(body.slice(name.length)))) attrs[a[1]] = decode(a[3] ?? a[4] ?? "");
      const node: XmlNode = { name, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  return root;
}

// ── tree helpers ─────────────────────────────────────────────────────

function elements(node: XmlNode): XmlNode[] {
  return node.children.filter((c): c is XmlNode => typeof c !== "string");
}

export function find(node: XmlNode, name: string): XmlNode | null {
  for (const child of elements(node)) {
    if (child.name === name) return child;
    const deeper = find(child, name);
    if (deeper) return deeper;
  }
  return null;
}

export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of elements(node)) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

/** Elements whose text is never part of the prose a reader sees. */
const DROP = new Set([
  "xref", // citation markers: "[12]", superscript numbers
  "table-wrap",
  "fig",
  "disp-formula",
  "inline-formula",
  "graphic",
  "media",
  "supplementary-material",
  "fn",
  "label",
  "alternatives",
  "mml:math",
  "tex-math",
]);

/** Elements that are blocks, not inline runs — their text must not fuse with a neighbour's. */
const BLOCK = new Set(["p", "list", "list-item", "title", "sec", "def-item", "term", "def"]);

export function textOf(node: XmlNode | string): string {
  if (typeof node === "string") return node;
  if (DROP.has(node.name)) return "";
  const inner = node.children.map(textOf).join("");
  return BLOCK.has(node.name) ? ` ${inner} ` : inner;
}

/**
 * A <p> can hold a <list> — the ISSN position stands put their numbered
 * position points inside one. Each list item is its own statement, so it
 * becomes its own paragraph, and the lead-in text before it ("the position of
 * the Society is as follows:") stays a paragraph of its own.
 */
function paragraphsOfP(p: XmlNode): string[] {
  const out: string[] = [];
  let run = "";
  const flush = () => {
    const text = cleanProse(run);
    if (text) out.push(text);
    run = "";
  };
  for (const child of p.children) {
    if (typeof child !== "string" && child.name === "list") {
      flush();
      for (const item of findAll(child, "list-item")) {
        // nested lists are reached by findAll; take only this item's own text
        const own = item.children.filter((c) => typeof c === "string" || c.name !== "list");
        const text = cleanProse(own.map(textOf).join(" "));
        if (text) out.push(text);
      }
    } else {
      run += textOf(child);
    }
  }
  flush();
  return out;
}

/**
 * Tidy prose once markup is gone: collapse whitespace, and remove the debris
 * that deleting citation markers leaves behind — "( )", "[, ]", " ,".
 */
export function cleanProse(s: string): string {
  return s
    .replace(/\s+/g, " ")
    // plain-text numeric citations, for journals that do not use <xref>: "[251]", "[3, 7–9]"
    .replace(/\s?\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/g, "")
    // a figure/table reference whose number lived in the dropped <xref>
    .replace(/\b(?:Figs?|Figures?|Tables?|Supplementary (?:Table|Figure|Material)s?)\.?\s*(?=[)\];,(]|and\b|$)/g, "")
    .replace(/\[(?:\s|[,;–-]|\band\b)*\]/g, "")
    .replace(/\((?:\s|[,;–-]|\band\b)*\)/g, "")
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/[;,]\s*(?=[,;)\]])/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── the article ──────────────────────────────────────────────────────

export interface Paragraph {
  /** Section path, outermost first: ["Results", "Protein dose"]. */
  section: string[];
  text: string;
}

export interface Article {
  title: string;
  authors: string[];
  journal: string;
  year: number | null;
  doi: string | null;
  pmcid: string | null;
  licenseUrl: string | null;
  licenseText: string;
  paragraphs: Paragraph[];
  /** Section titles left out by SKIP_SECTION, so the build can show its work. */
  skippedSections: string[];
}

/**
 * Sections that carry no coaching content. Methods of a meta-analysis are the
 * search strings and inclusion criteria, which retrieve well for "how much
 * protein" (they mention protein constantly) and answer nothing.
 */
const SKIP_SECTION = new RegExp(
  [
    // a methods section, numbered or not — but only when the title STARTS that
    // way: "Body composition assessment methods" and "Preparation methods of
    // various proteins" are content, and both live in position stands
    "^(?:\\d+(?:\\.\\d+)*\\.?\\s*)?(?:materials and |research |study |synthesis |statistical |search )?method",
    "search strateg",
    "literature search",
    "statistic",
    "data extraction",
    "data synthesis",
    "data analys",
    "risk of bias",
    "quality assessment",
    "methodological quality",
    "eligibility",
    "inclusion criteria",
    "exclusion criteria",
    "study selection",
    "selection of studies",
    "information sources",
    "registration",
    // not plain "protocol": "Creatine loading protocols" is exactly the content
    "review protocol",
    "abbreviation",
    "acknowledg",
    "funding",
    "competing interest",
    "conflict",
    "author contribution",
    // not plain "availability": "Protein availability" is content
    "data availability",
    "availability of data",
    "declaration",
    "supplementary",
    "ethic",
    "consent",
    "disclosure",
    "limitation", // kept out of answers; a limitation quoted alone reads as a finding
  ].join("|"),
  "i",
);

function sectionTitle(sec: XmlNode): string {
  const t = elements(sec).find((c) => c.name === "title");
  return t ? cleanProse(textOf(t)) : "";
}

function collect(node: XmlNode, path: string[], out: Paragraph[], skipped: string[]) {
  for (const child of elements(node)) {
    if (child.name === "sec") {
      const title = sectionTitle(child);
      const secType = child.attrs["sec-type"] ?? "";
      // The title decides when there is one: publishers tag content sections
      // as methods too (ISSN's "Body composition assessment methods" carries
      // sec-type="materials|methods"). The tag only speaks for untitled ones.
      const skip = title
        ? SKIP_SECTION.test(title) || /supplementary/i.test(secType)
        : /method|supplementary/i.test(secType);
      if (skip) {
        skipped.push(title || `[sec-type=${secType}]`);
        continue;
      }
      collect(child, title ? [...path, title] : path, out, skipped);
    } else if (child.name === "p") {
      for (const text of paragraphsOfP(child)) out.push({ section: path, text });
    } else if (child.name === "list") {
      for (const item of findAll(child, "list-item")) {
        const own = item.children.filter((c) => typeof c === "string" || c.name !== "list");
        const text = cleanProse(own.map(textOf).join(" "));
        if (text) out.push({ section: path, text });
      }
    } else if (child.name === "boxed-text" || child.name === "disp-quote") {
      collect(child, path, out, skipped);
    }
  }
}

function pubYear(meta: XmlNode): number | null {
  const dates = findAll(meta, "pub-date");
  const preferred =
    dates.find((d) => /epub|electronic|pub/.test(d.attrs["pub-type"] ?? d.attrs["date-type"] ?? "")) ?? dates[0];
  const year = preferred ? find(preferred, "year") : null;
  const n = year ? parseInt(textOf(year), 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function readArticle(xml: string): Article {
  const doc = parseXml(xml);
  const article = find(doc, "article");
  if (!article) throw new Error("no <article> element");
  const meta = find(article, "article-meta");
  if (!meta) throw new Error("no <article-meta>");

  const titleNode = find(meta, "article-title");
  const authors = findAll(find(meta, "contrib-group") ?? meta, "contrib")
    .filter((c) => (c.attrs["contrib-type"] ?? "author") === "author")
    .map((c) => {
      const surname = find(c, "surname");
      const collab = find(c, "collab");
      return cleanProse(textOf(surname ?? collab ?? c));
    })
    .filter(Boolean);

  const ids = findAll(meta, "article-id");
  const idOf = (type: string) => {
    const node = ids.find((n) => n.attrs["pub-id-type"] === type);
    return node ? cleanProse(textOf(node)) : null;
  };

  const license = find(meta, "license");
  const licenseRef = license ? find(license, "ali:license_ref") : null;
  // Publishers put the licence URL in one of three places; Springer only links
  // it from inside the licence prose.
  const linked = license
    ? [...findAll(license, "ext-link"), ...findAll(license, "uri")]
        .map((n) => n.attrs["xlink:href"] ?? cleanProse(textOf(n)))
        .find((href) => /creativecommons\.org\//i.test(href))
    : undefined;
  const licenseUrl =
    (licenseRef ? cleanProse(textOf(licenseRef)) : null) ||
    license?.attrs["xlink:href"] ||
    linked ||
    null;

  const journalTitle = find(find(article, "journal-meta") ?? article, "journal-title");

  const paragraphs: Paragraph[] = [];
  const skippedSections: string[] = [];
  for (const abstract of findAll(meta, "abstract")) {
    // graphical/teaser abstracts restate the real one
    if (abstract.attrs["abstract-type"] && abstract.attrs["abstract-type"] !== "summary") continue;
    collect(abstract, ["Abstract"], paragraphs, skippedSections);
  }
  const body = find(article, "body");
  if (body) collect(body, [], paragraphs, skippedSections);

  const pmcid = idOf("pmcid") ?? idOf("pmc");

  return {
    title: titleNode ? cleanProse(textOf(titleNode)).replace(/\.$/, "") : "",
    authors,
    journal: journalTitle ? cleanProse(textOf(journalTitle)) : "",
    year: pubYear(meta),
    doi: idOf("doi"),
    pmcid: pmcid ? (pmcid.startsWith("PMC") ? pmcid : `PMC${pmcid}`) : null,
    licenseUrl,
    licenseText: license ? cleanProse(textOf(license)) : "",
    paragraphs,
    skippedSections,
  };
}

/**
 * Which licences the knowledge base accepts: CC BY (any version) and CC0.
 *
 * Not NC — GymBro may be sold, and a non-commercial licence would make every
 * answer that quotes the paper a breach. Not ND — the coach excerpts sentences,
 * which is adaptation. Not SA — share-alike would attach to the knowledge base
 * as a database. Unknown means no.
 */
export function acceptedLicence(url: string | null, text: string): "cc-by" | "cc0" | null {
  const u = (url ?? "").toLowerCase();
  if (/creativecommons\.org\/publicdomain\/zero\//.test(u)) return "cc0";
  if (/creativecommons\.org\/licenses\/by\/\d/.test(u)) return "cc-by";
  if (u) return null; // a URL that is some other licence
  // No URL: accept only an unambiguous statement in the licence text.
  const t = text.toLowerCase();
  if (/non-?commercial|noderivative|no derivative|sharealike|share alike|-nc|-nd|-sa\b/.test(t)) return null;
  if (/creative commons attribution(?: \d\.\d)?(?: international)? licen[cs]e/.test(t)) return "cc-by";
  return null;
}
