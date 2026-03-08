const CODE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".cjs": "js",
  ".json": "json",
  ".css": "css",
  ".html": "html",
  ".htm": "html",
  ".svg": "html",
  ".py": "py",
  ".sh": "sh",
  ".bash": "sh",
  ".zsh": "sh",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".rs": "rs",
  ".go": "go",
  ".java": "java",
  ".sql": "sql",
};

const PLACEHOLDER_PREFIX = "§";
const PLACEHOLDER_SUFFIX = "§";

type Placeholder = {
  id: string;
  html: string;
};

export function isCodePreviewPath(filePath: string | null | undefined): boolean {
  return Boolean(resolveCodeLanguage(filePath));
}

export function renderHighlightedCodeHtml(
  code: string,
  filePath: string | null | undefined,
): string {
  const language = resolveCodeLanguage(filePath);
  if (!language) {
    return escapeHtml(code);
  }

  if (language === "html") {
    return highlightMarkup(code);
  }

  if (language === "json") {
    return highlightJsonLike(code);
  }

  if (language === "yaml") {
    return highlightYamlLike(code);
  }

  return highlightScriptLike(code, language);
}

function resolveCodeLanguage(filePath: string | null | undefined): string | null {
  const value = (filePath ?? "").trim().toLowerCase();
  if (!value) {
    return null;
  }
  const match = /\.[a-z0-9]+$/.exec(value);
  if (!match) {
    return null;
  }
  return CODE_LANGUAGE_BY_EXTENSION[match[0]] ?? null;
}

function highlightScriptLike(code: string, language: string): string {
  const keywords = resolveKeywords(language);
  let html = escapeHtml(code);
  const placeholders: Placeholder[] = [];

  html = protect(html, /\/\*[\s\S]*?\*\//g, placeholders, "comment");
  html = protect(html, /(^|[^:])\/\/.*$/gm, placeholders, "comment", {
    keepPrefix: true,
  });
  if (language === "py") {
    html = protect(html, /#.*/g, placeholders, "comment");
  }
  html = protect(
    html,
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g,
    placeholders,
    "string",
  );

  html = protect(html, /\b([A-Za-z_$][A-Za-z0-9_$]*)\b(?=\()/g, placeholders, "function");
  html = protect(html, new RegExp(`\\b(${keywords.join("|")})\\b`, "g"), placeholders, "keyword");
  html = protect(html, /\b(true|false|null|undefined|None)\b/g, placeholders, "literal");
  html = protect(html, /\b(\d+(?:\.\d+)?)\b/g, placeholders, "number");
  html = protect(html, /\b([A-Z][A-Za-z0-9_]*)\b/g, placeholders, "type");

  return restorePlaceholders(html, placeholders);
}

function highlightJsonLike(code: string): string {
  const html = escapeHtml(code)
    .replace(
      /("(?:\\.|[^"\\])*")(?=\s*:)/g,
      '<span class="files-code-token files-code-token--property">$1</span>',
    )
    .replace(
      /("(?:\\.|[^"\\])*")/g,
      '<span class="files-code-token files-code-token--string">$1</span>',
    )
    .replace(
      /\b(-?\d+(?:\.\d+)?)\b/g,
      '<span class="files-code-token files-code-token--number">$1</span>',
    )
    .replace(
      /\b(true|false|null)\b/g,
      '<span class="files-code-token files-code-token--literal">$1</span>',
    );
  return html;
}

function highlightYamlLike(code: string): string {
  const placeholders: Placeholder[] = [];
  let html = escapeHtml(code);
  html = protect(html, /#.*/g, placeholders, "comment");
  html = protect(html, /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, placeholders, "string");
  html = html.replace(
    /^(\s*)([A-Za-z0-9_.-]+)(\s*:)/gm,
    '$1<span class="files-code-token files-code-token--property">$2</span>$3',
  );
  html = html.replace(
    /\b(true|false|null|yes|no|on|off)\b/gi,
    '<span class="files-code-token files-code-token--literal">$1</span>',
  );
  html = html.replace(
    /\b(-?\d+(?:\.\d+)?)\b/g,
    '<span class="files-code-token files-code-token--number">$1</span>',
  );
  return restorePlaceholders(html, placeholders);
}

function highlightMarkup(code: string): string {
  const escaped = escapeHtml(code);
  return escaped.replace(
    /(&lt;\/?)([A-Za-z][A-Za-z0-9:-]*)([^&]*?)(\/??&gt;)/g,
    (_match, open, tagName, attrs, close) => {
      const highlightedAttrs = attrs.replace(
        /([A-Za-z_:][A-Za-z0-9:._-]*)(=)(&quot;.*?&quot;|&#39;.*?&#39;)?/g,
        (_attrMatch, name, equals, value = "") =>
          `<span class="files-code-token files-code-token--property">${name}</span>${equals}${value ? `<span class="files-code-token files-code-token--string">${value}</span>` : ""}`,
      );
      return `${open}<span class="files-code-token files-code-token--keyword">${tagName}</span>${highlightedAttrs}${close}`;
    },
  );
}

function resolveKeywords(language: string): string[] {
  switch (language) {
    case "py":
      return [
        "def",
        "class",
        "return",
        "if",
        "elif",
        "else",
        "for",
        "while",
        "import",
        "from",
        "as",
        "try",
        "except",
        "finally",
        "with",
        "yield",
        "lambda",
        "pass",
        "break",
        "continue",
        "async",
        "await",
        "in",
        "is",
        "not",
        "and",
        "or",
      ];
    case "sh":
      return [
        "if",
        "then",
        "else",
        "fi",
        "for",
        "do",
        "done",
        "case",
        "esac",
        "while",
        "function",
        "in",
        "local",
        "export",
        "return",
      ];
    case "go":
      return [
        "package",
        "import",
        "func",
        "return",
        "if",
        "else",
        "for",
        "range",
        "type",
        "struct",
        "interface",
        "var",
        "const",
        "switch",
        "case",
        "default",
        "defer",
        "go",
        "map",
      ];
    case "java":
      return [
        "class",
        "public",
        "private",
        "protected",
        "static",
        "final",
        "void",
        "new",
        "return",
        "if",
        "else",
        "switch",
        "case",
        "default",
        "try",
        "catch",
        "finally",
        "import",
        "package",
        "extends",
        "implements",
      ];
    case "rs":
      return [
        "fn",
        "let",
        "mut",
        "pub",
        "impl",
        "struct",
        "enum",
        "trait",
        "match",
        "if",
        "else",
        "loop",
        "for",
        "while",
        "return",
        "use",
        "mod",
        "const",
      ];
    case "sql":
      return [
        "select",
        "from",
        "where",
        "join",
        "left",
        "right",
        "inner",
        "outer",
        "on",
        "group",
        "by",
        "order",
        "insert",
        "into",
        "update",
        "delete",
        "create",
        "table",
        "values",
        "limit",
      ];
    default:
      return [
        "const",
        "let",
        "var",
        "function",
        "return",
        "if",
        "else",
        "for",
        "while",
        "switch",
        "case",
        "default",
        "break",
        "continue",
        "class",
        "extends",
        "new",
        "import",
        "export",
        "from",
        "async",
        "await",
        "try",
        "catch",
        "finally",
        "throw",
        "type",
        "interface",
      ];
  }
}

function protect(
  source: string,
  pattern: RegExp,
  placeholders: Placeholder[],
  tokenClass: string,
  options?: { keepPrefix?: boolean },
): string {
  return source.replace(pattern, (...args) => {
    const match = String(args[0] ?? "");
    let content = match;
    let prefix = "";
    if (options?.keepPrefix) {
      prefix = String(args[1] ?? "");
      content = match.slice(prefix.length);
    }
    const marker = String.fromCharCode(0xe000 + placeholders.length);
    const id = `${PLACEHOLDER_PREFIX}${marker}${PLACEHOLDER_SUFFIX}`;
    placeholders.push({
      id,
      html: `<span class="files-code-token files-code-token--${tokenClass}">${content}</span>`,
    });
    return `${prefix}${id}`;
  });
}

function restorePlaceholders(source: string, placeholders: Placeholder[]): string {
  let html = source;
  for (const placeholder of placeholders) {
    html = html.replaceAll(placeholder.id, placeholder.html);
  }
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
