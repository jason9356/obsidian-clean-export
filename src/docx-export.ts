import {
	AlignmentType,
	BorderStyle,
	Document,
	ImageRun,
	LineRuleType,
	Packer,
	Paragraph,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType,
	convertMillimetersToTwip,
	type IRunOptions,
} from "docx";
import * as path from "path";
import type { App, TFile } from "obsidian";
import type { Tokens } from "marked";
import {
	DEFAULT_SETTINGS,
	FONT_SIZE_PT,
	type CleanExportSettings,
	type DocxStyleSettings,
	type FontSizeName,
} from "./settings";
import { normalizeObsidianMarkdown, parseMarkdownTokens } from "./markdown";
import { noteTitleFromPath, stripFrontmatter } from "./util";
import { normalizeChineseQuotes } from "./typography";
import { readFileBuffer, resolveImageAbsolutePath } from "./fs";

const BLACK = "000000";

type RunBase = {
	font: string;
	size: FontSizeName;
	bold?: boolean;
	italics?: boolean;
};

function ptToHalfPoints(sizeName: FontSizeName): number {
	return Math.round(FONT_SIZE_PT[sizeName] * 2);
}

function cmToTwip(cm: number): number {
	return convertMillimetersToTwip(cm * 10);
}

function lineSpacingTwips(pt: number): number {
	return Math.round(pt * 20);
}

/** 首行缩进：按字号 × 字符数（1 全角字 ≈ 字号磅值）→ twips */
function firstLineIndentTwips(sizeName: FontSizeName, chars: number): number | undefined {
	if (!chars || chars <= 0) return undefined;
	return Math.round(FONT_SIZE_PT[sizeName] * chars * 20);
}

function eastAsiaFont(fontName: string): IRunOptions["font"] {
	return {
		ascii: fontName,
		hAnsi: fontName,
		eastAsia: fontName,
		cs: fontName,
	};
}

function baseSpacing(style: DocxStyleSettings) {
	return {
		line: lineSpacingTwips(style.lineSpacingPt),
		lineRule: LineRuleType.EXACT,
	};
}

function makeRun(_style: DocxStyleSettings, base: RunBase, text: string): TextRun {
	return new TextRun({
		text,
		bold: base.bold,
		italics: base.italics,
		size: ptToHalfPoints(base.size),
		font: eastAsiaFont(base.font),
		color: BLACK,
	});
}

function inlineToRuns(
	style: DocxStyleSettings,
	tokens: Tokens.Generic[] | undefined,
	base: RunBase,
): TextRun[] {
	if (!tokens?.length) return [makeRun(style, base, "")];

	const runs: TextRun[] = [];
	for (const t of tokens) {
		switch (t.type) {
			case "text":
				runs.push(makeRun(style, base, (t as Tokens.Text).text));
				break;
			case "strong":
				runs.push(
					...inlineToRuns(style, (t as Tokens.Strong).tokens as Tokens.Generic[], {
						...base,
						bold: true,
					}),
				);
				break;
			case "em":
				runs.push(
					...inlineToRuns(style, (t as Tokens.Em).tokens as Tokens.Generic[], {
						...base,
						italics: true,
					}),
				);
				break;
			case "codespan":
				runs.push(
					new TextRun({
						text: (t as Tokens.Codespan).text,
						size: ptToHalfPoints(base.size),
						color: BLACK,
						font: {
							ascii: "Consolas",
							hAnsi: "Consolas",
							eastAsia: style.bodyFont,
						},
					}),
				);
				break;
			case "link": {
				const link = t as Tokens.Link;
				if (link.tokens?.length) {
					runs.push(...inlineToRuns(style, link.tokens as Tokens.Generic[], base));
				} else {
					runs.push(makeRun(style, base, link.text || link.href));
				}
				break;
			}
			case "escape":
				runs.push(makeRun(style, base, (t as Tokens.Escape).text));
				break;
			case "br":
				runs.push(makeRun(style, base, "\n"));
				break;
			case "image": {
				const img = t as Tokens.Image;
				runs.push(makeRun(style, base, `[图片: ${img.text || img.href}]`));
				break;
			}
			default: {
				const anyT = t as { text?: string; tokens?: Tokens.Generic[] };
				if (anyT.tokens?.length) {
					runs.push(...inlineToRuns(style, anyT.tokens, base));
				} else if (typeof anyT.text === "string") {
					runs.push(makeRun(style, base, anyT.text));
				}
				break;
			}
		}
	}
	return runs.length ? runs : [makeRun(style, base, "")];
}

function para(
	style: DocxStyleSettings,
	tokens: Tokens.Generic[] | undefined,
	opts: {
		font?: string;
		size?: FontSizeName;
		bold?: boolean;
		align?: (typeof AlignmentType)[keyof typeof AlignmentType];
		/** 应用首行缩进（正文/标题） */
		indent?: boolean;
		outlineLevel?: number;
	} = {},
): Paragraph {
	const size = opts.size ?? style.bodySize;
	const base: RunBase = {
		font: opts.font ?? style.bodyFont,
		size,
		bold: opts.bold,
	};
	const firstLine =
		opts.indent === false
			? undefined
			: firstLineIndentTwips(size, style.firstLineIndentChars ?? 2);

	return new Paragraph({
		alignment: opts.align,
		spacing: baseSpacing(style),
		indent: firstLine !== undefined ? { firstLine } : undefined,
		outlineLevel: opts.outlineLevel,
		children: inlineToRuns(style, tokens, base),
	});
}

function fileUrlToAbs(href: string): string | null {
	if (href.startsWith("file:///")) {
		return decodeURI(href.replace(/^file:\/\/\//, "")).replace(/\//g, path.sep);
	}
	if (href.startsWith("file://")) {
		return decodeURI(href.replace(/^file:\/\//, ""));
	}
	return null;
}

async function imageParagraph(
	app: App,
	sourceFile: TFile,
	style: DocxStyleSettings,
	href: string,
	alt: string,
): Promise<Paragraph> {
	const abs = fileUrlToAbs(href) ?? resolveImageAbsolutePath(app, sourceFile, href);
	const buf = abs ? readFileBuffer(abs) : null;
	if (!buf || !abs) {
		return new Paragraph({
			spacing: baseSpacing(style),
			children: [
				makeRun(
					style,
					{ font: style.bodyFont, size: style.bodySize },
					`[图片无法加载: ${alt || href}]`,
				),
			],
		});
	}

	const lower = abs.toLowerCase();
	const type = lower.endsWith(".png")
		? "png"
		: lower.endsWith(".jpg") || lower.endsWith(".jpeg")
			? "jpg"
			: lower.endsWith(".gif")
				? "gif"
				: lower.endsWith(".bmp")
					? "bmp"
					: "png";

	try {
		return new Paragraph({
			spacing: baseSpacing(style),
			children: [
				new ImageRun({
					data: buf,
					transformation: { width: 480, height: 320 },
					type,
				}),
			],
		});
	} catch {
		return new Paragraph({
			spacing: baseSpacing(style),
			children: [
				makeRun(style, { font: style.bodyFont, size: style.bodySize }, `[图片: ${alt || href}]`),
			],
		});
	}
}

/** Pull inline tokens out of marked list-item block tokens. */
function flattenListItemInlines(tokens: Tokens.Generic[]): Tokens.Generic[] {
	const out: Tokens.Generic[] = [];
	for (const t of tokens) {
		if (["text", "strong", "em", "codespan", "link", "escape", "br", "image"].includes(t.type)) {
			if (t.type === "text" && (t as Tokens.Text).tokens?.length) {
				out.push(...((t as Tokens.Text).tokens as Tokens.Generic[]));
			} else {
				out.push(t);
			}
		} else if (t.type === "paragraph") {
			out.push(...(((t as Tokens.Paragraph).tokens ?? []) as Tokens.Generic[]));
		} else if ("tokens" in t && Array.isArray((t as { tokens?: Tokens.Generic[] }).tokens)) {
			out.push(...flattenListItemInlines((t as { tokens: Tokens.Generic[] }).tokens));
		}
	}
	return out;
}

async function tokensToBlocks(
	app: App,
	sourceFile: TFile,
	style: DocxStyleSettings,
	tokens: Tokens.Generic[],
): Promise<(Paragraph | Table)[]> {
	const out: (Paragraph | Table)[] = [];

	for (const token of tokens) {
		switch (token.type) {
			case "heading": {
				const h = token as Tokens.Heading;
				if (h.depth === 1) {
					out.push(
						para(style, h.tokens as Tokens.Generic[], {
							font: style.heading1Font,
							size: style.heading1Size,
							bold: style.heading1Bold,
							indent: true,
							outlineLevel: 0,
						}),
					);
				} else if (h.depth === 2) {
					out.push(
						para(style, h.tokens as Tokens.Generic[], {
							font: style.heading2Font,
							size: style.heading2Size,
							bold: style.heading2Bold,
							indent: true,
							outlineLevel: 1,
						}),
					);
				} else {
					out.push(
						para(style, h.tokens as Tokens.Generic[], {
							font: style.heading2Font,
							size: style.bodySize,
							bold: true,
							indent: true,
							outlineLevel: Math.min(h.depth - 1, 5),
						}),
					);
				}
				break;
			}
			case "paragraph": {
				const p = token as Tokens.Paragraph;
				const onlyImage =
					p.tokens?.length === 1 && p.tokens[0].type === "image"
						? (p.tokens[0] as Tokens.Image)
						: null;
				if (onlyImage) {
					out.push(await imageParagraph(app, sourceFile, style, onlyImage.href, onlyImage.text));
				} else {
					out.push(para(style, p.tokens as Tokens.Generic[], { indent: true }));
				}
				break;
			}
			case "list": {
				const list = token as Tokens.List;
				let i = 0;
				const firstLine = firstLineIndentTwips(
					style.bodySize,
					style.firstLineIndentChars ?? 2,
				);
				for (const item of list.items) {
					i += 1;
					const prefix = list.ordered ? `${i}. ` : "• ";
					const base: RunBase = { font: style.bodyFont, size: style.bodySize };
					const inline = flattenListItemInlines((item.tokens ?? []) as Tokens.Generic[]);
					const children = [
						makeRun(style, base, prefix),
						...(inline.length
							? inlineToRuns(style, inline, base)
							: [
									makeRun(
										style,
										base,
										(item.text ?? "").replace(/^\s*([-*+]|\d+\.)\s+/, ""),
									),
								]),
					];
					out.push(
						new Paragraph({
							spacing: baseSpacing(style),
							indent: firstLine !== undefined ? { firstLine } : undefined,
							children,
						}),
					);
				}
				break;
			}
			case "code": {
				const c = token as Tokens.Code;
				for (const line of c.text.split(/\r?\n/)) {
					out.push(
						new Paragraph({
							spacing: baseSpacing(style),
							children: [
								new TextRun({
									text: line || " ",
									size: ptToHalfPoints(style.bodySize),
									color: BLACK,
									font: {
										ascii: "Consolas",
										hAnsi: "Consolas",
										eastAsia: style.bodyFont,
									},
								}),
							],
						}),
					);
				}
				break;
			}
			case "blockquote": {
				const bq = token as Tokens.Blockquote;
				out.push(...(await tokensToBlocks(app, sourceFile, style, bq.tokens as Tokens.Generic[])));
				break;
			}
			case "table": {
				const table = token as Tokens.Table;
				const border = {
					top: { style: BorderStyle.SINGLE, size: 1, color: BLACK },
					bottom: { style: BorderStyle.SINGLE, size: 1, color: BLACK },
					left: { style: BorderStyle.SINGLE, size: 1, color: BLACK },
					right: { style: BorderStyle.SINGLE, size: 1, color: BLACK },
				};
				const rows: TableRow[] = [
					new TableRow({
						children: table.header.map(
							(cell) =>
								new TableCell({
									borders: border,
									children: [
										para(style, cell.tokens as Tokens.Generic[], {
											font: style.bodyFont,
											size: style.bodySize,
											bold: true,
											indent: false,
										}),
									],
								}),
						),
					}),
				];
				for (const row of table.rows) {
					rows.push(
						new TableRow({
							children: row.map(
								(cell) =>
									new TableCell({
										borders: border,
										children: [
											para(style, cell.tokens as Tokens.Generic[], { indent: false }),
										],
									}),
							),
						}),
					);
				}
				out.push(
					new Table({
						width: { size: 100, type: WidthType.PERCENTAGE },
						rows,
					}),
				);
				break;
			}
			case "hr":
				// 公文排版不使用分隔线
				break;
			default:
				break;
		}
	}

	return out;
}

function normalizeOptions(settings: CleanExportSettings) {
	return {
		stripTags: settings.stripTags !== false,
		normalizeQuotes: settings.normalizeQuotes !== false,
		stripHorizontalRules: true,
	};
}

export async function buildDocxBuffer(
	app: App,
	file: TFile,
	markdownRaw: string,
	settings: CleanExportSettings,
): Promise<Buffer> {
	const style = {
		...DEFAULT_SETTINGS.docx,
		...(settings.docx ?? {}),
	};
	let md = markdownRaw;
	if (settings.stripFrontmatter) {
		md = stripFrontmatter(md);
	}
	md = normalizeObsidianMarkdown(app, file, md, normalizeOptions(settings));
	const tokens = parseMarkdownTokens(md);
	const body = await tokensToBlocks(app, file, style, tokens);

	const children: (Paragraph | Table)[] = [];
	let title = noteTitleFromPath(file.path);
	if (settings.normalizeQuotes !== false) {
		title = normalizeChineseQuotes(title);
	}

	if (style.includeNoteTitle) {
		children.push(
			new Paragraph({
				alignment: AlignmentType.CENTER,
				spacing: baseSpacing(style),
				children: [
					makeRun(
						style,
						{
							font: style.titleFont,
							size: style.titleSize,
							bold: style.titleBold,
						},
						title,
					),
				],
			}),
		);
		if (style.blankLineAfterTitle) {
			children.push(
				new Paragraph({
					spacing: baseSpacing(style),
					children: [makeRun(style, { font: style.bodyFont, size: style.bodySize }, "")],
				}),
			);
		}
	}

	children.push(...body);

	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						margin: {
							top: cmToTwip(style.marginTopCm),
							bottom: cmToTwip(style.marginBottomCm),
							left: cmToTwip(style.marginLeftCm),
							right: cmToTwip(style.marginRightCm),
						},
					},
				},
				children: children.length
					? children
					: [
							new Paragraph({
								children: [
									makeRun(style, { font: style.bodyFont, size: style.bodySize }, ""),
								],
							}),
						],
			},
		],
	});

	return Buffer.from(await Packer.toBuffer(doc));
}
