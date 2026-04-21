import React from "react";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

// Inline parser: URLs first so underscores inside URLs don't trigger italic
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order: bare URL, markdown link [text](url), **bold**, _italic_
  const rx =
    /(https?:\/\/[^\s<>"]+)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_/g;
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;

  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    if (m[1] !== undefined) {
      // bare URL
      nodes.push(
        <a
          key={`${keyPrefix}-u${idx++}`}
          href={m[1]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgb(var(--brand))", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {m[1]}
        </a>
      );
    } else if (m[2] !== undefined) {
      // markdown link [text](url)
      nodes.push(
        <a
          key={`${keyPrefix}-ml${idx++}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgb(var(--brand))", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {m[2]}
        </a>
      );
    } else if (m[4] !== undefined) {
      // **bold**
      nodes.push(<strong key={`${keyPrefix}-b${idx++}`}>{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      // _italic_
      nodes.push(<em key={`${keyPrefix}-i${idx++}`}>{m[5]}</em>);
    }

    last = rx.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownContent({ content, className, style }: MarkdownContentProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  type ListItem = { text: string };
  let listBuf: ListItem[] = [];
  let listOrdered = false;

  const flushList = () => {
    if (!listBuf.length) return;
    const Tag = listOrdered ? "ol" : "ul";
    const k = key++;
    elements.push(
      React.createElement(
        Tag,
        {
          key: k,
          style: {
            paddingLeft: "var(--space-5)",
            margin: "var(--space-1) 0 var(--space-3) 0",
            display: "flex",
            flexDirection: "column" as const,
            gap: "var(--space-1)",
          },
        },
        listBuf.map((item, i) =>
          React.createElement(
            "li",
            {
              key: i,
              style: { fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text))" },
            },
            parseInline(item.text, `${k}li${i}`)
          )
        )
      )
    );
    listBuf = [];
  };

  for (const line of lines) {
    const mh = line.match(/^(#{1,3}) (.+)/);
    const mu = line.match(/^[-*] (.+)/);
    const mo = line.match(/^\d+\. (.+)/);

    if (mh) {
      flushList();
      const level = mh[1].length as 1 | 2 | 3;
      const fz = level === 1 ? "17px" : level === 2 ? "15px" : "14px";
      const fw = level === 3 ? "600" : "700";
      const mt = level === 1 ? "var(--space-4)" : "var(--space-3)";
      const k = key++;
      elements.push(
        React.createElement(
          `h${level}`,
          {
            key: k,
            style: {
              fontSize: fz,
              fontWeight: fw,
              color: "rgb(var(--text))",
              margin: `${mt} 0 var(--space-1) 0`,
            },
          },
          parseInline(mh[2], `h${level}-${k}`)
        )
      );
    } else if (mu) {
      if (listOrdered) flushList();
      listOrdered = false;
      listBuf.push({ text: mu[1] });
    } else if (mo) {
      if (!listOrdered && listBuf.length > 0) flushList();
      listOrdered = true;
      listBuf.push({ text: mo[1] });
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      const k = key++;
      elements.push(
        <p
          key={k}
          style={{
            fontSize: "14px",
            lineHeight: "1.6",
            color: "rgb(var(--text))",
            margin: "0 0 var(--space-2) 0",
          }}
        >
          {parseInline(line, `p${k}`)}
        </p>
      );
    }
  }

  flushList();

  return (
    <div className={className} style={style}>
      {elements}
    </div>
  );
}
