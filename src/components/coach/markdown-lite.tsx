import { Fragment, type ReactNode } from "react";

/**
 * A deliberately tiny markdown renderer for coach replies.
 *
 * The system prompt constrains the model to exactly four constructs — `###`
 * day headings, `-` bullets, `**bold**` exercise names and short paragraphs —
 * so a full markdown dependency would be ~40kB of client JS to render four
 * rules. Anything it doesn't recognise falls through as plain text.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // **bold** and `code`, scanned in one pass
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-bold text-zinc-100">
          {m[2]}
        </strong>,
      );
    } else {
      out.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-abyss px-1 font-mono text-[11px] text-neon-green">
          {m[3]}
        </code>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(last)}</Fragment>);
  return out;
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1 pl-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-hot-purple" aria-hidden />
            <span>{inline(item, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);

    if (bullet || numbered) {
      bullets.push((bullet ?? numbered)![1]);
      return;
    }
    flushBullets();

    if (heading) {
      blocks.push(
        <h4
          key={`h-${idx}`}
          className="pt-1 font-mono text-[11px] font-bold uppercase tracking-widest text-hot-green"
        >
          {inline(heading[1], `h-${idx}`)}
        </h4>,
      );
      return;
    }
    if (line.trim() === "") return;

    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {inline(line, `p-${idx}`)}
      </p>,
    );
  });

  flushBullets();

  return <div className="space-y-2">{blocks}</div>;
}
