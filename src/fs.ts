import * as fs from "fs";
import * as path from "path";
import type { App, TFile } from "obsidian";
import { FileSystemAdapter } from "obsidian";

export function getVaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return null;
}

export function vaultPathToAbsolute(app: App, vaultPath: string): string | null {
	const base = getVaultBasePath(app);
	if (!base) return null;
	return path.join(base, ...vaultPath.split("/"));
}

export function defaultExportPath(app: App, file: TFile, ext: "pdf" | "docx"): string | null {
	const abs = vaultPathToAbsolute(app, file.path);
	if (!abs) return null;
	return abs.replace(/\.md$/i, `.${ext}`);
}

/** Resolve a wiki/markdown image target to an absolute filesystem path if possible. */
export function resolveImageAbsolutePath(
	app: App,
	sourceFile: TFile,
	linkTarget: string,
): string | null {
	const cleaned = linkTarget.split("|")[0].split("#")[0].trim();
	if (!cleaned) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(cleaned, sourceFile.path);
	if (dest) {
		return vaultPathToAbsolute(app, dest.path);
	}

	// Absolute-ish vault path
	const direct = vaultPathToAbsolute(app, cleaned.replace(/^\//, ""));
	if (direct && fs.existsSync(direct)) return direct;

	return null;
}

export function readFileBuffer(absPath: string): Buffer | null {
	try {
		if (!fs.existsSync(absPath)) return null;
		return fs.readFileSync(absPath);
	} catch {
		return null;
	}
}

export function mimeFromPath(absPath: string): string {
	const ext = path.extname(absPath).toLowerCase();
	switch (ext) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".svg":
			return "image/svg+xml";
		default:
			return "application/octet-stream";
	}
}

export function writeBinaryFile(absPath: string, data: Uint8Array | Buffer): void {
	const dir = path.dirname(absPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(absPath, data);
}

type ElectronDialog = {
	showSaveDialog: (options: {
		title?: string;
		defaultPath?: string;
		filters?: { name: string; extensions: string[] }[];
	}) => Promise<{ canceled: boolean; filePath?: string }>;
};

type ElectronShell = {
	openPath: (p: string) => Promise<string>;
};

function getElectron(): {
	dialog?: ElectronDialog;
	shell?: ElectronShell;
	remote?: { dialog: ElectronDialog; shell: ElectronShell; BrowserWindow: unknown };
	BrowserWindow?: unknown;
} {
	// Obsidian desktop exposes electron via require
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require("electron");
}

export function getBrowserWindowCtor(): new (opts: Record<string, unknown>) => {
	loadFile: (p: string) => Promise<void>;
	loadURL: (url: string) => Promise<void>;
	webContents: {
		printToPDF: (opts: Record<string, unknown>) => Promise<Uint8Array>;
		executeJavaScript: (code: string) => Promise<unknown>;
		on: (event: string, cb: () => void) => void;
	};
	destroy: () => void;
} {
	const electron = getElectron();
	const remote = electron.remote;
	const Ctor = (remote?.BrowserWindow ?? electron.BrowserWindow) as ReturnType<
		typeof getBrowserWindowCtor
	>;
	if (!Ctor) {
		throw new Error("无法访问 Electron BrowserWindow（请确认在桌面端 Obsidian 中运行）");
	}
	return Ctor;
}

export async function showSaveDialog(
	defaultPath: string,
	ext: "pdf" | "docx",
): Promise<string | null> {
	const electron = getElectron();
	const dialog = electron.remote?.dialog ?? electron.dialog;
	if (!dialog?.showSaveDialog) {
		return defaultPath;
	}
	const filters =
		ext === "pdf"
			? [{ name: "PDF", extensions: ["pdf"] }]
			: [{ name: "Word 文档", extensions: ["docx"] }];
	const result = await dialog.showSaveDialog({
		title: ext === "pdf" ? "导出 PDF" : "导出 DOCX",
		defaultPath,
		filters,
	});
	if (result.canceled || !result.filePath) return null;
	return result.filePath;
}

export async function openPath(absPath: string): Promise<void> {
	const electron = getElectron();
	const shell = electron.remote?.shell ?? electron.shell;
	if (shell?.openPath) {
		await shell.openPath(absPath);
	}
}
