function cleanupAiWhitespace(text) {
	let s = text;
	s = s.replace(/[\u200B-\u200D\uFEFF\u2060\u180E]/g, "");
	s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");

	const cjk =
		"\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3007\u31c0-\u31ef";
	const cjkPunct =
		"，。、；：？！…—·～￥％＋－＝／（）【】《》「」『』“”‘’";

	const betweenCjk = new RegExp(`([${cjk}])[ \\t]+([${cjk}])`, "g");
	for (let i = 0; i < 20; i++) {
		const next = s.replace(betweenCjk, "$1$2");
		if (next === s) break;
		s = next;
	}

	s = s.replace(new RegExp(`[ \\t]+([${cjkPunct}])`, "g"), "$1");
	s = s.replace(new RegExp(`([‘“（【《「『])[ \\t]+`, "g"), "$1");
	s = s.replace(/ {2,}/g, " ");
	s = s.replace(/[ \t]+$/gm, "");
	return s;
}

const samples = [
	"这\u00A0是 一 个\u200B测 试，使用 Python 语言。",
	"根据\u3000最新\u00A0要求 ，继续推进。",
	"普通英文 keep  spaces  here and 中 文 空 格",
];

for (const sample of samples) {
	console.log("IN :", JSON.stringify(sample));
	console.log("OUT:", JSON.stringify(cleanupAiWhitespace(sample)));
	console.log("---");
}
