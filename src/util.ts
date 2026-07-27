/** Strip YAML frontmatter from markdown source. */
export function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---")) return markdown;
	const end = markdown.indexOf("\n---", 3);
	if (end === -1) return markdown;
	let rest = markdown.slice(end + 4);
	if (rest.startsWith("\r\n")) rest = rest.slice(2);
	else if (rest.startsWith("\n")) rest = rest.slice(1);
	return rest;
}

/** Note display title without extension. */
export function noteTitleFromPath(path: string): string {
	const base = path.split("/").pop() ?? path;
	return base.replace(/\.md$/i, "");
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
