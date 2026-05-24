import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

interface MathTextProps {
  text: string;
  className?: string;
}

export function MathText({ text, className = "" }: MathTextProps) {
  const html = useMemo(() => {
    if (!text) return "";
    const parts: string[] = [];
    let remaining = text;

    const blockRegex = /\$\$([\s\S]+?)\$\$/g;
    const inlineRegex = /\$((?:[^$]|\\\$)+?)\$/g;

    let lastIndex = 0;
    const combined = /\$\$([\s\S]+?)\$\$|\$((?:[^$]|\\\$)+?)\$/g;
    let match;

    while ((match = combined.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) parts.push(escapeHtml(before));

      const isBlock = match[0].startsWith("$$");
      const mathContent = isBlock ? match[1] : match[2];
      try {
        const rendered = katex.renderToString(mathContent, {
          displayMode: isBlock,
          throwOnError: false,
          output: "html",
        });
        parts.push(rendered);
      } catch {
        parts.push(escapeHtml(match[0]));
      }
      lastIndex = match.index + match[0].length;
    }

    const tail = text.slice(lastIndex);
    if (tail) parts.push(escapeHtml(tail));

    return parts.join("");
  }, [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
