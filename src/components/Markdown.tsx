import { Fragment, type ReactNode } from "react";

/**
 * The Markdown an assistant actually writes, rendered as rich text.
 *
 * Headings, ordered and bulleted lists, fenced code blocks, tables, block
 * quotes, rules, links, bold, italic, strikethrough and inline code. A model
 * asked for plain prose still reaches for `**bold**`, `|` tables and triple
 * backticks, and printing those literally is what made answers look like
 * source code.
 *
 * This builds React elements and never touches `dangerouslySetInnerHTML`.
 * Replies are untrusted — they quote tenant names, and now the contents of
 * files the user uploads — so HTML inside a reply renders as the text it is,
 * and link targets are filtered down to the schemes that cannot execute. That
 * property is the reason this is hand-rolled rather than handed to a renderer
 * with an `allowHtml` switch somebody could flip later.
 */
export default function Markdown({ text }: { text: string }) {
  return <>{blocks(text)}</>;
}

type ListItem = { text: string; indented: boolean };

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const FENCE = /^\s*```(\w+)?\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])\s*(\1\s*){2,}$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_RULE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function blocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];

  let para: string[] = [];
  let items: ListItem[] = [];
  let ordered = false;
  let start = 1;

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(
      <p key={`p${out.length}`} className="whitespace-pre-wrap">
        {inline(para.join("\n"))}
      </p>
    );
    para = [];
  };

  const flushList = () => {
    if (items.length === 0) return;
    const body = items.map((it, i) => (
      <li key={i} className={it.indented ? "ml-4" : undefined}>
        {inline(it.text)}
      </li>
    ));
    out.push(
      ordered ? (
        <ol key={`l${out.length}`} start={start} className="list-decimal space-y-1 pl-5 marker:text-muted">
          {body}
        </ol>
      ) : (
        <ul key={`l${out.length}`} className="list-disc space-y-1 pl-5 marker:text-muted">
          {body}
        </ul>
      )
    );
    items = [];
  };

  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    /* ---- fenced code. Consumed verbatim: nothing inside is Markdown, which
       is the whole point of a fence, and an unclosed one runs to the end
       rather than swallowing the rest of the reply into a paragraph. */
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const lang = fence[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      out.push(<CodeBlock key={`c${out.length}`} lang={lang} code={body.join("\n")} />);
      continue;
    }

    /* ---- table: a header row, an alignment rule, then body rows. */
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map(align);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      i -= 1;
      out.push(<Table key={`t${out.length}`} head={head} aligns={aligns} rows={rows} />);
      continue;
    }

    if (RULE.test(line)) {
      flush();
      out.push(<hr key={`r${out.length}`} className="my-3 border-line-soft" />);
      continue;
    }

    const q = QUOTE.exec(line);
    if (q) {
      flush();
      const body: string[] = [q[1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        body.push(QUOTE.exec(lines[++i])![1]);
      }
      out.push(
        <blockquote
          key={`q${out.length}`}
          className="border-l-2 border-line-strong pl-3 text-muted"
        >
          {inline(body.join("\n"))}
        </blockquote>
      );
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      flush();
      // Everything sits inside a chat column, so heading levels differ by
      // weight rather than by the display sizes a document would use.
      const size = h[1].length <= 2 ? "text-[15px]" : "text-[13.5px]";
      out.push(
        <p key={`h${out.length}`} className={`${size} font-bold text-fg`}>
          {inline(h[2])}
        </p>
      );
      continue;
    }

    const n = NUMBERED.exec(line);
    if (n) {
      flushPara();
      // A different kind of list ends the previous one rather than merging in.
      if (items.length > 0 && !ordered) flushList();
      if (items.length === 0) {
        ordered = true;
        start = Number(n[2]) || 1;
      }
      items.push({ text: n[3], indented: n[1].length >= 2 });
      continue;
    }

    const b = BULLET.exec(line);
    if (b) {
      flushPara();
      if (items.length > 0 && ordered) flushList();
      if (items.length === 0) ordered = false;
      items.push({ text: b[2], indented: b[1].length >= 2 });
      continue;
    }

    // A plain line under a list item is that item's continuation — wrapped
    // prose, not a new paragraph.
    if (items.length > 0) {
      items[items.length - 1].text += " " + line.trim();
      continue;
    }

    para.push(line);
  }

  flush();
  return out;
}

/* -------------------------------------------------------------- table bits */

const cells = (row: string) =>
  row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function align(rule: string): "left" | "center" | "right" {
  const l = rule.startsWith(":");
  const r = rule.endsWith(":");
  return l && r ? "center" : r ? "right" : "left";
}

function Table({
  head,
  aligns,
  rows,
}: {
  head: string[];
  aligns: ("left" | "center" | "right")[];
  rows: string[][];
}) {
  const at = (i: number) => aligns[i] ?? "left";
  const cls = (i: number) =>
    at(i) === "right" ? "text-right" : at(i) === "center" ? "text-center" : "text-left";
  return (
    // Wide tables scroll inside their own box; the message column never
    // scrolls sideways.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={`px-2 py-1.5 font-semibold text-fg ${cls(i)}`}
              >
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line-soft last:border-0">
              {head.map((_, ci) => (
                <td key={ci} className={`px-2 py-1.5 align-top ${cls(ci)}`}>
                  {inline(r[ci] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {lang && (
        <div className="border-b border-line-soft px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
          {lang}
        </div>
      )}
      <pre className="scroll-thin overflow-x-auto px-3 py-2.5">
        <code className="font-mono text-[12px] leading-relaxed text-fg-soft">{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ inline */

/* `[\s\S]` rather than `.` with the dotAll flag: emphasis can wrap across a
   line break, and that flag needs a newer compile target than this project. */
/* Built fresh on every call, never shared. A `g` regex carries `lastIndex`,
   and `inline` recurses for nested emphasis — a shared instance would have the
   inner call rewind the outer loop's cursor and spin forever. */
const inlineRe = () =>
  new RegExp(
    [
      "`([^`]+)`", // code, first — its contents are never markup
      "\\[([^\\]]+)\\]\\(([^)\\s]+)\\)", // [label](href)
      "(\\*\\*|__)([\\s\\S]+?)\\4", // bold
      "(~~)([\\s\\S]+?)\\6", // strikethrough
      "(\\*|_)(?!\\s)([\\s\\S]+?)(?<!\\s)\\8", // italic
      "(https?://[^\\s<>()]+)", // bare URL
    ].join("|"),
    "g"
  );

/**
 * Only schemes that cannot execute.
 *
 * A reply can propose any href it likes, including `javascript:` — so the
 * allowlist is positive, and anything unrecognised renders as plain text
 * rather than as a link the reader might click.
 */
function safeHref(href: string): string | null {
  const v = href.trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(v) ? v : null;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      // noreferrer as well as noopener: the target should not learn where the
      // click came from, and this is an authenticated internal tool.
      rel="noopener noreferrer"
      className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
    >
      {children}
    </a>
  );
}

function inline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = inlineRe();

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = out.length;

    if (m[1] !== undefined) {
      out.push(
        <code key={k} className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.9em]">
          {m[1]}
        </code>
      );
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      out.push(href ? <Link key={k} href={href}>{m[2]}</Link> : <Fragment key={k}>{m[0]}</Fragment>);
    } else if (m[5] !== undefined) {
      out.push(<strong key={k} className="font-semibold text-fg">{inline(m[5])}</strong>);
    } else if (m[7] !== undefined) {
      out.push(<s key={k} className="text-muted">{inline(m[7])}</s>);
    } else if (m[9] !== undefined) {
      out.push(<em key={k}>{inline(m[9])}</em>);
    } else if (m[10] !== undefined) {
      const href = safeHref(m[10]);
      out.push(href ? <Link key={k} href={href}>{m[10]}</Link> : <Fragment key={k}>{m[10]}</Fragment>);
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}
