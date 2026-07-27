/**
 * Smoke test: build a minimal DOCX buffer without Obsidian runtime.
 * Run: npx tsx scripts/smoke-docx.ts
 */
import {
	AlignmentType,
	Document,
	LineRuleType,
	Packer,
	Paragraph,
	TextRun,
	convertMillimetersToTwip,
} from "docx";
import * as fs from "fs";
import * as path from "path";

async function main() {
	const line = { line: 29 * 20, lineRule: LineRuleType.EXACT };
	const font = (name: string) => ({
		ascii: name,
		hAnsi: name,
		eastAsia: name,
		cs: name,
	});

	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						margin: {
							top: convertMillimetersToTwip(25.4),
							bottom: convertMillimetersToTwip(25.4),
							left: convertMillimetersToTwip(31.8),
							right: convertMillimetersToTwip(31.8),
						},
					},
				},
				children: [
					new Paragraph({
						alignment: AlignmentType.CENTER,
						spacing: line,
						children: [
							new TextRun({
								text: "冒烟测试标题",
								bold: true,
								size: 44,
								font: font("黑体"),
							}),
						],
					}),
					new Paragraph({ spacing: line, children: [] }),
					new Paragraph({
						spacing: line,
						children: [
							new TextRun({
								text: "一级标题",
								bold: true,
								size: 32,
								font: font("黑体"),
							}),
						],
					}),
					new Paragraph({
						spacing: line,
						children: [
							new TextRun({
								text: "这是仿宋正文，固定行距 29 磅。",
								size: 32,
								font: font("仿宋_GB2312"),
							}),
						],
					}),
				],
			},
		],
	});

	const buf = await Packer.toBuffer(doc);
	const out = path.join(process.cwd(), "smoke-test.docx");
	fs.writeFileSync(out, buf);
	console.log(`Wrote ${out} (${buf.length} bytes)`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
