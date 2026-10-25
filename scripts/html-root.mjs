// html-root.mjs — the real <html> tag of a composition: the first one outside HTML comments, so a
// comment that mentions <html> is never taken for it. Shared by composition.mjs, reframe.mjs and
// timing.mjs.

const TAG = /<html\b[^>]*>/i;

// Text → { at, tag } of the root <html> tag, or null.
export function rootHtmlTag(text) {
  const masked = String(text).replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
  const at = masked.search(TAG);
  return at < 0 ? null : { at, tag: text.slice(at, at + masked.slice(at).match(TAG)[0].length) };
}

// Text with the root <html> tag replaced by fn(tag). Unchanged when there is none.
export function replaceRootHtmlTag(text, fn) {
  const r = rootHtmlTag(text);
  return r ? text.slice(0, r.at) + fn(r.tag) + text.slice(r.at + r.tag.length) : text;
}

// Whether the root <html> tag carries a boolean attribute such as data-karaoke.
export const rootHtmlFlag = (text, name) => new RegExp(`\\s${name}(?=[\\s=>/])`, "i").test(rootHtmlTag(text)?.tag ?? "");
