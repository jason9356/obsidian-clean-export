import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { marked } from "marked";
import type { App, TFile } from "obsidian";
import type { CleanExportSettings } from "./settings";
import { normalizeObsidianMarkdown } from "./markdown";
import { escapeHtml, noteTitleFromPath, stripFrontmatter } from "./util";
import { normalizeChineseQuotes } from "./typography";
import { getBrowserWindowCtor } from "./fs";

function buildPrintCss(marginCm: number): string {
	return `
@page {
  size: A4;
  margin: ${marginCm}cm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff !important;
  color: #000000 !important;
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif;
  font-size: 12pt;
  line-height: 1.6;
}
h1, h2, h3, h4, h5, h6 {
  color: #000000 !important;
  background: transparent !important;
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "SimHei", sans-serif;
  font-weight: 700;
  line-height: 1.35;
  margin: 1.2em 0 0.5em;
  page-break-after: avoid;
}
h1 { font-size: 20pt; }
h2 { font-size: 16pt; }
h3 { font-size: 14pt; }
h4, h5, h6 { font-size: 12pt; }
p, li, td, th, blockquote {
  color: #000000 !important;
  background: transparent !important;
}
a { color: #000000 !important; text-decoration: underline; }
code, pre {
  font-family: Consolas, "Courier New", monospace;
  background: #f5f5f5 !important;
  color: #000000 !important;
  border: 1px solid #ddd;
}
code {
  padding: 0.1em 0.3em;
  border-radius: 2px;
  font-size: 0.92em;
}
pre {
  padding: 0.75em 1em;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  page-break-inside: avoid;
}
pre code {
  border: none;
  padding: 0;
  background: transparent !important;
}
blockquote {
  margin: 0.8em 0;
  padding: 0.2em 0 0.2em 0.9em;
  border-left: 3px solid #999;
  color: #222 !important;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #333;
  padding: 0.35em 0.55em;
  vertical-align: top;
}
th { font-weight: 700; background: #f0f0f0 !important; }
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0.6em 0;
}
hr { display: none !important; }
.doc-title {
  font-family: "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "SimHei", sans-serif;
  font-size: 22pt;
  font-weight: 700;
  text-align: center;
  margin: 0 0 1em;
  color: #000000 !important;
  text-indent: 0 !important;
}
.markdown-body > p,
.markdown-body > h1,
.markdown-body > h2,
.markdown-body > h3,
.markdown-body > h4,
.markdown-body > h5,
.markdown-body > h6 {
  text-indent: 2em;
}
.markdown-body > *:first-child { margin-top: 0; }
/* Hide residual Obsidian tag chips if any CSS leaked in */
.tag, a.tag { display: none !important; }
`.trim();
}

async function markdownToHtmlBody(
	app: App,
	file: TFile,
	markdownRaw: string,
	settings: CleanExportSettings,
): Promise<string> {
	let md = markdownRaw;
	if (settings.stripFrontmatter) {
		md = stripFrontmatter(md);
	}
	md = normalizeObsidianMarkdown(app, file, md, {
		stripTags: settings.stripTags !== false,
		normalizeQuotes: settings.normalizeQuotes !== false,
		stripHorizontalRules: true,
	});

	marked.setOptions({ gfm: true, breaks: false });
	const bodyHtml = await marked.parse(md);
	let title = noteTitleFromPath(file.path);
	if (settings.normalizeQuotes !== false) {
		title = normalizeChineseQuotes(title);
	}

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${buildPrintCss(settings.pdfMarginCm)}</style>
</head>
<body>
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <div class="markdown-body">${bodyHtml}</div>
</body>
</html>`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export async function buildPdfBuffer(
	app: App,
	file: TFile,
	markdownRaw: string,
	settings: CleanExportSettings,
): Promise<Buffer> {
	const html = await markdownToHtmlBody(app, file, markdownRaw, settings);
	const tempFile = path.join(os.tmpdir(), `obsidian-clean-export-${Date.now()}.html`);
	fs.writeFileSync(tempFile, html, "utf-8");

	const BrowserWindow = getBrowserWindowCtor();
	const win = new BrowserWindow({
		show: false,
		width: 1024,
		height: 768,
		webPreferences: {
			offscreen: true,
			javascript: true,
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	try {
		await win.loadFile(tempFile);
		await sleep(400);

		const data = await win.webContents.printToPDF({
			printBackground: true,
			preferCSSPageSize: true,
			pageSize: "A4",
			margins: {
				marginType: "default",
			},
		});
		return Buffer.from(data);
	} finally {
		try {
			win.destroy();
		} catch {
			/* ignore */
		}
		try {
			fs.unlinkSync(tempFile);
		} catch {
			/* ignore */
		}
	}
}
