# 干净导出 PDF / DOCX（Obsidian 插件）

把当前笔记导出为 **不跟随主题配色** 的 PDF，以及 **固定公文式版式** 的 DOCX，方便后续在 Word 里微调。

当前版本 **1.0.0** · 许可 [MIT](./LICENSE)

## 解决什么问题

- 社区 / 原生 PDF 导出常失败，或按主题配色导出，花里胡哨、不好用
- DOCX 需要一套稳定的默认版式，便于统一改格式

## 默认 DOCX 版式

| 元素 | 样式 |
|------|------|
| 主标题（笔记文件名） | 黑体 二号 加粗，居中；与正文之间空一行 |
| 一级标题 `#` | 黑体 三号 加粗 |
| 二级标题 `##` | 黑体 三号 加粗 |
| 正文 | 仿宋_GB2312 三号 |
| 行距 | 固定值 29 磅 |
| 页边距 | 上/下 2.54 cm，左/右 3.18 cm |

以上均可在插件设置中修改。

## PDF

按 Markdown 结构导出：白底黑字、固定打印样式，不读取 Obsidian 主题颜色。支持标题、段落、列表、代码块、引用、表格、本地图片（含 `![[wiki]]`）。

## 安装

```powershell
cd C:\Users\LXP\Projects\obsidian-clean-export
npm install
npm run build
```

复制到库的插件目录：

```text
<你的库>/.obsidian/plugins/obsidian-clean-export/
  ├── main.js
  ├── manifest.json
  └── styles.css
```

```powershell
$vaultPlugin = "D:\Path\To\Vault\.obsidian\plugins\obsidian-clean-export"
New-Item -ItemType Directory -Force -Path $vaultPlugin | Out-Null
Copy-Item manifest.json, styles.css, main.js $vaultPlugin -Force
```

在 Obsidian：设置 → 社区插件 → 关闭安全模式 → 启用 **干净导出 PDF/DOCX**（仅桌面端）。

## 使用

命令面板：

- `导出当前笔记为 PDF`
- `导出当前笔记为 DOCX`

或在文件资源管理器中右键 `.md` 文件。

## 项目结构

```text
obsidian-clean-export/
├── manifest.json
├── package.json
├── esbuild.config.mjs
├── styles.css
├── src/
│   ├── main.ts          # 命令 / 菜单
│   ├── settings.ts      # 设置与默认版式
│   ├── markdown.ts      # Obsidian 语法预处理
│   ├── docx-export.ts   # DOCX
│   ├── pdf-export.ts    # PDF（Electron printToPDF）
│   ├── fs.ts            # 路径 / 对话框
│   └── util.ts
└── README.md
```

## 说明

- 需桌面端 Obsidian（PDF 依赖 Electron）
- DOCX 字体依赖本机已安装「黑体」「仿宋_GB2312」；若系统字体名不同，可在设置里改
- 正文字号未在需求中写明，默认按常见公文习惯使用 **三号**，可在设置中改
