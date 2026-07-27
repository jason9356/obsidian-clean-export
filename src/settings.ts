import { App, PluginSettingTab, Setting } from "obsidian";
import type CleanExportPlugin from "./main";

/** Chinese 字号 → pt */
export const FONT_SIZE_PT = {
	初号: 42,
	小初: 36,
	一号: 26,
	小一: 24,
	二号: 22,
	小二: 18,
	三号: 16,
	小三: 15,
	四号: 14,
	小四: 12,
	五号: 10.5,
	小五: 9,
} as const;

export type FontSizeName = keyof typeof FONT_SIZE_PT;

export interface DocxStyleSettings {
	/** 主标题字体（东亚） */
	titleFont: string;
	titleSize: FontSizeName;
	titleBold: boolean;
	/** 一级 / 二级标题 */
	heading1Font: string;
	heading1Size: FontSizeName;
	heading1Bold: boolean;
	heading2Font: string;
	heading2Size: FontSizeName;
	heading2Bold: boolean;
	/** 正文 */
	bodyFont: string;
	bodySize: FontSizeName;
	/** 固定行距（磅） */
	lineSpacingPt: number;
	/** 页边距（厘米） */
	marginTopCm: number;
	marginBottomCm: number;
	marginLeftCm: number;
	marginRightCm: number;
	/** 导出时是否把笔记文件名作为主标题 */
	includeNoteTitle: boolean;
	/** 主标题与正文之间空一行 */
	blankLineAfterTitle: boolean;
	/** 正文与标题首行缩进（全角字符数） */
	firstLineIndentChars: number;
}

export interface CleanExportSettings {
	docx: DocxStyleSettings;
	/** PDF：页边距（厘米） */
	pdfMarginCm: number;
	/** 导出后是否用系统默认程序打开 */
	openAfterExport: boolean;
	/** 去掉 YAML frontmatter */
	stripFrontmatter: boolean;
	/** 导出时去掉 Obsidian 标签 #tag */
	stripTags: boolean;
	/** 导出前规范中文单双引号 “” ‘’ */
	normalizeQuotes: boolean;
}

export const DEFAULT_SETTINGS: CleanExportSettings = {
	docx: {
		titleFont: "黑体",
		titleSize: "二号",
		titleBold: true,
		heading1Font: "黑体",
		heading1Size: "三号",
		heading1Bold: true,
		heading2Font: "黑体",
		heading2Size: "三号",
		heading2Bold: true,
		bodyFont: "仿宋_GB2312",
		bodySize: "三号",
		lineSpacingPt: 29,
		marginTopCm: 2.54,
		marginBottomCm: 2.54,
		marginLeftCm: 3.18,
		marginRightCm: 3.18,
		includeNoteTitle: true,
		blankLineAfterTitle: true,
		firstLineIndentChars: 2,
	},
	pdfMarginCm: 2.0,
	openAfterExport: true,
	stripFrontmatter: true,
	stripTags: true,
	normalizeQuotes: true,
};

export class CleanExportSettingTab extends PluginSettingTab {
	plugin: CleanExportPlugin;

	constructor(app: App, plugin: CleanExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("clean-export-settings");

		containerEl.createEl("h2", { text: "干净导出 PDF / DOCX" });

		new Setting(containerEl)
			.setName("导出后打开文件")
			.setDesc("导出成功后用系统默认程序打开")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.openAfterExport).onChange(async (v) => {
					this.plugin.settings.openAfterExport = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("去掉 YAML frontmatter")
			.setDesc("导出时忽略笔记开头的 --- ... --- 元数据")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.stripFrontmatter).onChange(async (v) => {
					this.plugin.settings.stripFrontmatter = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("去掉 Obsidian 标签")
			.setDesc("导出时移除 #标签（不影响 Markdown 标题）")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.stripTags).onChange(async (v) => {
					this.plugin.settings.stripTags = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("规范中文引号")
			.setDesc("将 \" \" ' ' 等转为 “” ‘’，代码块内不改")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.normalizeQuotes).onChange(async (v) => {
					this.plugin.settings.normalizeQuotes = v;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl("h3", { text: "DOCX 版式（可调）" });
		containerEl.createEl("p", {
			text: "默认：主标题黑体二号加粗；一/二级标题黑体三号加粗；正文仿宋_GB2312 三号；固定行距 29 磅；首行缩进 2 字符；上下边距 2.54 cm，左右 3.18 cm。标题黑色、无分隔线。",
			cls: "setting-item-description",
		});

		const d = this.plugin.settings.docx;

		new Setting(containerEl)
			.setName("导出笔记标题为主标题")
			.addToggle((t) =>
				t.setValue(d.includeNoteTitle).onChange(async (v) => {
					d.includeNoteTitle = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("主标题后空一行")
			.addToggle((t) =>
				t.setValue(d.blankLineAfterTitle).onChange(async (v) => {
					d.blankLineAfterTitle = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("正文/标题首行缩进（全角字符）")
			.setDesc("公文习惯一般为 2；设为 0 则不缩进。主标题居中不受影响。")
			.addText((t) =>
				t.setValue(String(d.firstLineIndentChars)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || n < 0) return;
					d.firstLineIndentChars = n;
					await this.plugin.saveSettings();
				}),
			);

		this.addFontSetting(containerEl, "主标题字体", d.titleFont, (v) => {
			d.titleFont = v;
		});
		this.addSizeSetting(containerEl, "主标题字号", d.titleSize, (v) => {
			d.titleSize = v;
		});

		this.addFontSetting(containerEl, "一级标题字体", d.heading1Font, (v) => {
			d.heading1Font = v;
		});
		this.addSizeSetting(containerEl, "一级标题字号", d.heading1Size, (v) => {
			d.heading1Size = v;
		});

		this.addFontSetting(containerEl, "二级标题字体", d.heading2Font, (v) => {
			d.heading2Font = v;
		});
		this.addSizeSetting(containerEl, "二级标题字号", d.heading2Size, (v) => {
			d.heading2Size = v;
		});

		this.addFontSetting(containerEl, "正文字体", d.bodyFont, (v) => {
			d.bodyFont = v;
		});
		this.addSizeSetting(containerEl, "正文字号", d.bodySize, (v) => {
			d.bodySize = v;
		});

		new Setting(containerEl)
			.setName("固定行距（磅）")
			.addText((t) =>
				t.setValue(String(d.lineSpacingPt)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || n <= 0) return;
					d.lineSpacingPt = n;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("页边距 上/下/左/右（厘米）")
			.setDesc("用逗号分隔，例如 2.54,2.54,3.18,3.18")
			.addText((t) =>
				t
					.setValue(
						`${d.marginTopCm},${d.marginBottomCm},${d.marginLeftCm},${d.marginRightCm}`,
					)
					.onChange(async (v) => {
						const parts = v.split(",").map((s) => Number(s.trim()));
						if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
							return;
						}
						d.marginTopCm = parts[0];
						d.marginBottomCm = parts[1];
						d.marginLeftCm = parts[2];
						d.marginRightCm = parts[3];
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "PDF" });
		containerEl.createEl("p", {
			text: "PDF 按 Markdown 结构导出，白底黑字，不跟随主题配色。",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("PDF 页边距（厘米）")
			.addText((t) =>
				t.setValue(String(this.plugin.settings.pdfMarginCm)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isFinite(n) || n < 0) return;
					this.plugin.settings.pdfMarginCm = n;
					await this.plugin.saveSettings();
				}),
			);
	}

	private addFontSetting(
		containerEl: HTMLElement,
		name: string,
		value: string,
		apply: (v: string) => void,
	): void {
		new Setting(containerEl).setName(name).addText((t) =>
			t.setValue(value).onChange(async (v) => {
				apply(v.trim() || value);
				await this.plugin.saveSettings();
			}),
		);
	}

	private addSizeSetting(
		containerEl: HTMLElement,
		name: string,
		value: FontSizeName,
		apply: (v: FontSizeName) => void,
	): void {
		new Setting(containerEl).setName(name).addDropdown((dd) => {
			for (const key of Object.keys(FONT_SIZE_PT) as FontSizeName[]) {
				dd.addOption(key, `${key}（${FONT_SIZE_PT[key]} 磅）`);
			}
			dd.setValue(value).onChange(async (v) => {
				apply(v as FontSizeName);
				await this.plugin.saveSettings();
			});
		});
	}
}
