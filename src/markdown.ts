import type { App, TFile } from "obsidian";
import { marked, type Tokens } from "marked";
import { resolveImageAbsolutePath } from "./fs";
import { normalizeQuotesOutsideCode, stripObsidianTags, cleanupAiWhitespaceOutsideCode } from "./typography";

export interface NormalizeMarkdownOptions {
	stripTags?: boolean;
	normalizeQuotes?: boolean;
	/** Drop thematic breaks (--- / ***) — not used in 公文排版 */
	stripHorizontalRules?: boolean;
	/** Remove AI-paste weird spaces (CJK 间隙、NBSP、零宽字符等) */
	cleanupAiSpaces?: boolean;
}

/** Convert Obsidian-flavored bits to more standard markdown before parsing. */
export function normalizeObsidianMarkdown(
	app: App,
	sourceFile: TFile,
	markdown: string,
	options: NormalizeMarkdownOptions = {},
): string {
	const {
		stripTags = true,
		normalizeQuotes = true,
		stripHorizontalRules = true,
		cleanupAiSpaces = true,
	} = options;

	let text = markdown;

	// Wiki images: ![[path|size]] / ![[path]]
	text = text.replace(/!\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
		const target = String(inner).split("|")[0].trim();
		const absHint = resolveImageAbsolutePath(app, sourceFile, target);
		const display = absHint ? pathToFileUrlSafe(absHint) : target;
		return `![${target}](${display})`;
	});

	// Wiki links: [[note|alias]] / [[note]]
	text = text.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
		const parts = String(inner).split("|");
		const label = (parts[1] ?? parts[0]).trim();
		return label;
	});

	// Callouts: > [!note] Title  → treat as blockquote paragraph
	text = text.replace(/^>\s*\[![\w/-]+\]\s*/gm, "> ");

	if (stripTags) {
		text = stripObsidianTags(text);
	}

	if (stripHorizontalRules) {
		text = stripMarkdownHorizontalRules(text);
	}

	if (cleanupAiSpaces) {
		text = cleanupAiWhitespaceOutsideCode(text);
	}

	if (normalizeQuotes) {
		text = normalizeQuotesOutsideCode(text);
	}

	return text;
}

/** Remove standalone --- / *** / ___ thematic-break lines (not YAML). */
function stripMarkdownHorizontalRules(markdown: string): string {
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
		if (!inFence && /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
			continue;
		}
		out.push(line);
	}
	return out.join("\n");
}

function pathToFileUrlSafe(absPath: string): string {
	const normalized = absPath.replace(/\\/g, "/");
	if (/^[A-Za-z]:\//.test(normalized)) {
		return `file:///${encodeURI(normalized)}`;
	}
	return `file://${encodeURI(normalized)}`;
}

export function parseMarkdownTokens(markdown: string): Tokens.Generic[] {
	marked.setOptions({ gfm: true, breaks: false });
	const tokens = marked.lexer(markdown);
	return tokens as Tokens.Generic[];
}

export type { Tokens };
