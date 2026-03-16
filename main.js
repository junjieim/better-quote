const {
	Plugin,
	Notice,
	FuzzySuggestModal,
	SuggestModal,
	MarkdownView,
} = require("obsidian");

module.exports = class BetterQuotePlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "mirror-to",
			name: "mirror-to",
			editorCheckCallback: (checking, editor, view) => {
				if (!(view instanceof MarkdownView) || !view.file) return false;
				if (!checking) {
					this.handleMirrorTo(editor, view).catch((err) => {
						console.error("better-quote mirror-to error", err);
						new Notice("better-quote: mirror-to failed");
					});
				}
				return true;
			},
		});

		this.addCommand({
			id: "mirror-from",
			name: "mirror-from",
			editorCheckCallback: (checking, editor, view) => {
				if (!(view instanceof MarkdownView) || !view.file) return false;
				if (!checking) {
					this.handleMirrorFrom(editor, view).catch((err) => {
						console.error("better-quote mirror-from error", err);
						new Notice("better-quote: mirror-from failed");
					});
				}
				return true;
			},
		});
	}

	fileToLinktext(file, sourcePath = "") {
		return this.app.metadataCache.fileToLinktext(file, sourcePath, true);
	}

	buildBlockEmbed(file, blockId, sourcePath = "") {
		const linktext = this.fileToLinktext(file, sourcePath);
		return `![[${linktext}#^${blockId}]]`;
	}

	extractTrailingBlockId(line) {
		const match = line.match(/\^([A-Za-z0-9-]+)\s*$/);
		return match ? match[1] : null;
	}

	appendBlockIdToLine(line, blockId) {
		if (this.extractTrailingBlockId(line)) return line;
		const trimmedRight = line.replace(/\s+$/, "");
		if (trimmedRight.length === 0) return `^${blockId}`;
		return `${trimmedRight} ^${blockId}`;
	}

	getQuoteNumbersFromCache(file) {
		const cache = this.app.metadataCache.getFileCache(file);
		const blocks = cache?.blocks ?? {};
		const nums = [];

		for (const id of Object.keys(blocks)) {
			const m = /^quote(\d+)$/.exec(id);
			if (m) nums.push(Number(m[1]));
		}

		return nums;
	}

	getQuoteNumbersFromText(text) {
		const nums = [];
		const regex = /\^quote(\d+)\b/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			const n = Number(match[1]);
			if (Number.isFinite(n)) nums.push(n);
		}

		return nums;
	}

	async getNextQuoteIdForFile(file, textOverride = null) {
		const nums = this.getQuoteNumbersFromCache(file);

		let text = textOverride;
		if (text == null) {
			text = await this.app.vault.cachedRead(file);
		}

		nums.push(...this.getQuoteNumbersFromText(text));

		const max = nums.length ? Math.max(...nums) : 0;
		return `quote${max + 1}`;
	}

	async appendEmbedToFile(file, embedText) {
		await this.app.vault.process(file, (data) => {
			const normalized = data.replace(/\s*$/, "");
			if (!normalized) return `${embedText}\n`;
			return `${normalized}\n\n${embedText}\n`;
		});
	}

	async handleMirrorTo(editor, view) {
		const sourceFile = view.file;
		if (!sourceFile) {
			new Notice("No active file");
			return;
		}

		const cursor = editor.getCursor();
		const lineNo = cursor.line;
		const currentLine = editor.getLine(lineNo);

		let quoteId = this.extractTrailingBlockId(currentLine);
		if (!quoteId) {
			quoteId = await this.getNextQuoteIdForFile(sourceFile, editor.getValue());
			editor.setLine(lineNo, this.appendBlockIdToLine(currentLine, quoteId));
		}

		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path !== sourceFile.path);

		if (files.length === 0) {
			new Notice("No other markdown files found");
			return;
		}

		new BetterQuoteFileModal(this.app, files, async (targetFile) => {
			const embed = this.buildBlockEmbed(sourceFile, quoteId, targetFile.path);
			await this.appendEmbedToFile(targetFile, embed);
			new Notice(`Mirrored to: ${targetFile.path}`);
		}).open();
	}

	async handleMirrorFrom(editor, view) {
		const currentFile = view.file;
		if (!currentFile) {
			new Notice("No active file");
			return;
		}

		new BetterQuoteBlockModal(this.app, this, async (selectedBlock) => {
			const { file, quoteId, block } =
				await this.ensureBlockHasIdFromSelection(selectedBlock);

			const embed = this.buildBlockEmbed(file, quoteId, currentFile.path);
			editor.replaceRange(embed, editor.getCursor());

			new Notice(
				`Inserted block from: ${file.path}:${block.startLine + 1}`
			);
		}).open();
	}

	async ensureBlockHasIdAtLine(file, endLine) {
		const content = await this.app.vault.read(file);
		const lines = content.split(/\r?\n/);

		if (endLine < 0 || endLine >= lines.length) {
			throw new Error("Block line out of range");
		}

		const existing = this.extractTrailingBlockId(lines[endLine]);
		if (existing) return existing;

		const quoteId = await this.getNextQuoteIdForFile(file, content);

		await this.app.vault.process(file, (data) => {
			const liveLines = data.split(/\r?\n/);
			if (endLine < 0 || endLine >= liveLines.length) return data;
			liveLines[endLine] = this.appendBlockIdToLine(liveLines[endLine], quoteId);
			return liveLines.join("\n");
		});

		return quoteId;
	}

	async ensureBlockHasIdFromSelection(selectedBlock) {
		const liveBlock = await this.findLiveBlock(selectedBlock);
		if (!liveBlock) {
			throw new Error("Could not relocate selected block in source file");
		}

		const quoteId = await this.ensureBlockHasIdAtLine(
			liveBlock.file,
			liveBlock.endLine
		);

		return {
			file: liveBlock.file,
			quoteId,
			block: liveBlock,
		};
	}

	async findLiveBlock(selectedBlock) {
		const content = await this.app.vault.read(selectedBlock.file);
		const liveBlocks = this.extractBlocksFromFile(selectedBlock.file, content);

		const exactMatches = liveBlocks.filter(
			(block) => block.text === selectedBlock.text
		);

		if (exactMatches.length === 1) return exactMatches[0];

		if (exactMatches.length > 1) {
			return exactMatches.sort((a, b) => {
				const da =
					Math.abs(a.startLine - selectedBlock.startLine) +
					Math.abs(a.endLine - selectedBlock.endLine);
				const db =
					Math.abs(b.startLine - selectedBlock.startLine) +
					Math.abs(b.endLine - selectedBlock.endLine);
				return da - db;
			})[0];
		}

		const previewMatches = liveBlocks.filter(
			(block) => block.preview === selectedBlock.preview
		);

		if (previewMatches.length === 1) return previewMatches[0];

		if (previewMatches.length > 1) {
			return previewMatches.sort((a, b) => {
				const da =
					Math.abs(a.startLine - selectedBlock.startLine) +
					Math.abs(a.endLine - selectedBlock.endLine);
				const db =
					Math.abs(b.startLine - selectedBlock.startLine) +
					Math.abs(b.endLine - selectedBlock.endLine);
				return da - db;
			})[0];
		}

		return null;
	}

	async getAllSearchableBlocks() {
		const files = this.app.vault.getMarkdownFiles();
		const all = [];

		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			all.push(...this.extractBlocksFromFile(file, content));
		}

		return all;
	}

	extractBlocksFromFile(file, content) {
		const lines = content.split(/\r?\n/);
		const blocks = [];

		let i = 0;

		if (lines.length > 0 && lines[0].trim() === "---") {
			i = 1;
			while (i < lines.length) {
				const t = lines[i].trim();
				if (t === "---" || t === "...") {
					i += 1;
					break;
				}
				i += 1;
			}
		}

		let paraStart = null;
		let paraLines = [];

		const flushParagraph = () => {
			if (paraStart === null || paraLines.length === 0) return;

			const text = paraLines.join("\n").trim();
			if (text) {
				blocks.push({
					file,
					startLine: paraStart,
					endLine: paraStart + paraLines.length - 1,
					text,
					preview: this.makePreview(text),
				});
			}

			paraStart = null;
			paraLines = [];
		};

		while (i < lines.length) {
			const raw = lines[i];
			const trimmed = raw.trim();

			if (/^(```|~~~)/.test(trimmed)) {
				flushParagraph();
				const fence = trimmed.slice(0, 3);
				i += 1;
				while (i < lines.length && !lines[i].trim().startsWith(fence)) {
					i += 1;
				}
				if (i < lines.length) i += 1;
				continue;
			}

			if (trimmed === "") {
				flushParagraph();
				i += 1;
				continue;
			}

			if (/^#{1,6}\s+/.test(trimmed)) {
				flushParagraph();
				blocks.push({
					file,
					startLine: i,
					endLine: i,
					text: raw,
					preview: this.makePreview(raw),
				});
				i += 1;
				continue;
			}

			if (/^\s*([-*+]|\d+\.)\s+/.test(raw)) {
				flushParagraph();
				blocks.push({
					file,
					startLine: i,
					endLine: i,
					text: raw,
					preview: this.makePreview(raw),
				});
				i += 1;
				continue;
			}

			if (/^\s*>/.test(raw)) {
				flushParagraph();
				blocks.push({
					file,
					startLine: i,
					endLine: i,
					text: raw,
					preview: this.makePreview(raw),
				});
				i += 1;
				continue;
			}

			if (paraStart === null) paraStart = i;
			paraLines.push(raw);
			i += 1;
		}

		flushParagraph();

		return blocks;
	}

	makePreview(text) {
		return text.replace(/\s+/g, " ").trim().slice(0, 140);
	}

	searchBlocks(blocks, query) {
		const q = query.trim().toLowerCase();
		if (!q) return blocks.slice(0, 100);

		const terms = q.split(/\s+/).filter(Boolean);

		return blocks
			.map((block) => {
				const haystack = `${block.preview} ${block.file.path}`.toLowerCase();
				let score = 0;

				if (haystack.includes(q)) score += 100;

				for (const term of terms) {
					if (haystack.includes(term)) score += 20;
					else score -= 50;
				}

				if (score <= 0) return null;

				if (block.preview.toLowerCase().startsWith(q)) score += 30;

				return { block, score };
			})
			.filter(Boolean)
			.sort((a, b) => b.score - a.score)
			.slice(0, 100)
			.map((x) => x.block);
	}
};

class BetterQuoteFileModal extends FuzzySuggestModal {
	constructor(app, files, onChoose) {
		super(app);
		this.files = files;
		this.onChooseFile = onChoose;

		this.setPlaceholder("Select target file...");
		this.setInstructions([
			{ command: "↑↓", purpose: "Navigate" },
			{ command: "Enter", purpose: "Select file" },
			{ command: "Esc", purpose: "Cancel" },
		]);
	}

	getItems() {
		return this.files;
	}

	getItemText(file) {
		return file.path.replace(/\.md$/i, "");
	}

	renderSuggestion(match, el) {
		const file = match?.item ?? match;

		el.empty();
		el.addClass("better-quote-file-suggestion");

		const title = el.createDiv({ cls: "better-quote-title" });
		title.setText(file?.basename ?? "");

		const path = el.createDiv({ cls: "better-quote-path" });
		path.setText(file?.path ?? "");
	}

	onChooseItem(file) {
		this.onChooseFile(file);
	}
}

class BetterQuoteBlockModal extends SuggestModal {
	constructor(app, plugin, onChoose) {
		super(app);
		this.plugin = plugin;
		this.onChooseBlock = onChoose;
		this.blocksPromise = this.plugin.getAllSearchableBlocks();

		this.setPlaceholder("Search blocks...");
		this.setInstructions([
			{ command: "Type", purpose: "Search blocks" },
			{ command: "↑↓", purpose: "Navigate" },
			{ command: "Enter", purpose: "Insert embed" },
			{ command: "Esc", purpose: "Cancel" },
		]);
	}

	async getSuggestions(query) {
		const blocks = await this.blocksPromise;
		return this.plugin.searchBlocks(blocks, query);
	}

	renderSuggestion(block, el) {
		el.empty();
		el.addClass("better-quote-block-suggestion");

		const title = el.createDiv({ cls: "better-quote-title" });
		title.setText(block.preview || "(empty)");

		const meta = el.createDiv({ cls: "better-quote-path" });
		meta.setText(
			`${block.file.path}  [${block.startLine + 1}-${block.endLine + 1}]`
		);
	}

	onChooseSuggestion(block) {
		this.onChooseBlock(block);
	}
}