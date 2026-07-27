/**
 * Normalize ASCII / mixed quotation marks to Chinese typographic quotes.
 * “…” for double, ‘…’ for single. Skips English apostrophes (don't).
 */
export function normalizeChineseQuotes(text: string): string {
	let out = "";
	let doubleOpen = true;
	let singleOpen = true;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const prev = i > 0 ? text[i - 1] : "";
		const next = i + 1 < text.length ? text[i + 1] : "";

		if (ch === '"' || ch === "\u201C" || ch === "\u201D" || ch === "\uFF02" || ch === "„" || ch === "‟") {
			out += doubleOpen ? "\u201C" : "\u201D";
			doubleOpen = !doubleOpen;
			continue;
		}

		if (ch === "'" || ch === "\u2018" || ch === "\u2019" || ch === "\uFF07" || ch === "‚" || ch === "‛") {
			if (ch === "'" && /[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next)) {
				out += "'";
				continue;
			}
			out += singleOpen ? "\u2018" : "\u2019";
			singleOpen = !singleOpen;
			continue;
		}

		out += ch;
	}

	return out;
}

/** Run a transform on markdown text outside fenced / inline code. */
export function mapOutsideCode(markdown: string, transform: (text: string) => string): string {
	const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
	return parts
		.map((part) => {
			if (part.startsWith("```") || (part.startsWith("`") && part.endsWith("`"))) {
				return part;
			}
			return transform(part);
		})
		.join("");
}

/**
 * Apply quote normalization outside fenced / inline code.
 */
export function normalizeQuotesOutsideCode(markdown: string): string {
	return mapOutsideCode(markdown, normalizeChineseQuotes);
}

/**
 * Strip AI-paste leftovers: zero-width chars, NBSP / odd Unicode spaces,
 * spaces between CJK characters, spaces next to CJK punctuation.
 * Code blocks are left untouched by callers via mapOutsideCode.
 */
export function cleanupAiWhitespace(text: string): string {
	let s = text;

	// Zero-width / BOM / word joiner
	s = s.replace(/[\u200B-\u200D\uFEFF\u2060\u180E]/g, "");

	// Odd Unicode spaces → regular space (incl. NBSP, thin/en/em, ideographic)
	s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");

	const cjk =
		"\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3007\\u31c0-\\u31ef";
	const cjkPunct =
		"，。、；：？！…—·～￥％＋－＝／（）【】《》「」『』“”‘’";

	// Spaces between CJK ↔ CJK (repeat until stable)
	const betweenCjk = new RegExp(`([${cjk}])[ \\t]+([${cjk}])`, "g");
	for (let i = 0; i < 20; i++) {
		const next = s.replace(betweenCjk, "$1$2");
		if (next === s) break;
		s = next;
	}

	// Spaces beside CJK punctuation
	s = s.replace(new RegExp(`[ \\t]+([${cjkPunct}])`, "g"), "$1");
	s = s.replace(new RegExp(`([‘“（【《「『])[ \\t]+`, "g"), "$1");

	// Collapse runs of regular spaces (keep newlines / markdown structure)
	s = s.replace(/ {2,}/g, " ");

	// Trailing spaces on each line
	s = s.replace(/[ \t]+$/gm, "");

	return s;
}

export function cleanupAiWhitespaceOutsideCode(markdown: string): string {
	return mapOutsideCode(markdown, cleanupAiWhitespace);
}

/**
 * Remove Obsidian tags (#tag / #标签 / #a/b) without touching markdown headings.
 */
export function stripObsidianTags(markdown: string): string {
	const lines = markdown.split("\n");
	let inFence = false;
	const out: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		// ATX headings: keep
		if (/^\s{0,3}#{1,6}\s/.test(line)) {
			out.push(line);
			continue;
		}

		// Drop lines that are only tags
		if (/^(?:\s*#[^\s#]+)+\s*$/.test(line)) {
			continue;
		}

		// Inline tags: require start or whitespace before #
		const cleaned = line.replace(/(^|[\s\u3000])#([^\s#]+)/g, "$1").replace(/[ \t]+$/g, "");
		out.push(cleaned);
	}

	return out.join("\n");
}
