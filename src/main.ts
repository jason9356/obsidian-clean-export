import { MarkdownView, Menu, Notice, Plugin, TFile } from "obsidian";
import {
	CleanExportSettingTab,
	DEFAULT_SETTINGS,
	type CleanExportSettings,
} from "./settings";
import { buildDocxBuffer } from "./docx-export";
import { buildPdfBuffer } from "./pdf-export";
import {
	defaultExportPath,
	openPath,
	showSaveDialog,
	writeBinaryFile,
} from "./fs";

export default class CleanExportPlugin extends Plugin {
	settings: CleanExportSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "export-current-to-pdf",
			name: "导出当前笔记为 PDF",
			checkCallback: (checking) => {
				const file = this.getActiveMarkdownFile();
				if (!file) return false;
				if (!checking) void this.exportFile(file, "pdf");
				return true;
			},
		});

		this.addCommand({
			id: "export-current-to-docx",
			name: "导出当前笔记为 DOCX",
			checkCallback: (checking) => {
				const file = this.getActiveMarkdownFile();
				if (!file) return false;
				if (!checking) void this.exportFile(file, "docx");
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) => {
					item
						.setTitle("导出为 PDF（干净版式）")
						.setIcon("file-text")
						.setSection("action")
						.onClick(() => void this.exportFile(file, "pdf"));
				});
				menu.addItem((item) => {
					item
						.setTitle("导出为 DOCX（固定版式）")
						.setIcon("file-type")
						.setSection("action")
						.onClick(() => void this.exportFile(file, "docx"));
				});
			}),
		);

		this.addSettingTab(new CleanExportSettingTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<CleanExportSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...data,
			docx: {
				...DEFAULT_SETTINGS.docx,
				...(data?.docx ?? {}),
			},
		};
		if (this.settings.stripTags === undefined) {
			this.settings.stripTags = DEFAULT_SETTINGS.stripTags;
		}
		if (this.settings.normalizeQuotes === undefined) {
			this.settings.normalizeQuotes = DEFAULT_SETTINGS.normalizeQuotes;
		}
		if (this.settings.docx.firstLineIndentChars === undefined) {
			this.settings.docx.firstLineIndentChars = DEFAULT_SETTINGS.docx.firstLineIndentChars;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getActiveMarkdownFile(): TFile | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file ?? null;
	}

	private async exportFile(file: TFile, kind: "pdf" | "docx"): Promise<void> {
		const fallback = defaultExportPath(this.app, file, kind);
		if (!fallback) {
			new Notice("无法解析库路径，仅支持本地桌面库");
			return;
		}

		const outPath = await showSaveDialog(fallback, kind);
		if (!outPath) {
			new Notice("已取消导出");
			return;
		}

		const notice = new Notice(`正在导出 ${kind.toUpperCase()}…`, 0);
		try {
			const markdown = await this.app.vault.read(file);
			const buffer =
				kind === "pdf"
					? await buildPdfBuffer(this.app, file, markdown, this.settings)
					: await buildDocxBuffer(this.app, file, markdown, this.settings);

			writeBinaryFile(outPath, buffer);
			notice.hide();
			new Notice(`已导出：${outPath}`);

			if (this.settings.openAfterExport) {
				await openPath(outPath);
			}
		} catch (err) {
			notice.hide();
			console.error(err);
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`导出失败：${message}`);
		}
	}
}
