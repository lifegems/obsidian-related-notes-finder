import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface MyPluginSettings {
	filterWords: string;
	dailies: string;
	minLetters: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	filterWords: 'the,and,but,not,then,they,will,not,your,from,them,was,with,what,who,why,where,this,over,than',
	dailies: '',
	minLetters: 3,
}

export default class RelatedNotesPlugin extends Plugin {
	settings: RelatedNotesPluginSettings;

	async onload() {
		console.log('loading Related Notes plugin');

		await this.loadSettings();

		const getPossibleLinks = async () => {
			let files = this.app.vault.getFiles();
			let activeFile = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeFile) return null;
			
			let fileData = await this.app.vault.read(activeFile.file);
			fileData = fileData ? fileData : "";
			const selectedRange = activeFile.editor.getSelection();
			fileData = selectedRange || fileData.replace(/\W+/g," ");
			let fileTextItems = fileData.split(" ");
			fileTextItems = [...new Set(fileTextItems)];
			fileTextItems = fileTextItems.map(text => text.replace(/\s+/g, ""))
							 					  .filter(t => t.length > this.settings.minLetters && this.settings.filterWords.split(",").indexOf(t.toLowerCase()) == -1);
			let keywords: any = {};
			fileTextItems.forEach(text => {
				text = text.toLowerCase();
				files.forEach(file => {
					if ((this.settings.dailies == '' || (this.settings.dailies != '' && file.path.indexOf(this.settings.dailies) == -1)) 
					&& file.extension == "md"
					&& file.basename.toLowerCase().indexOf(text) > -1
					) {
						if (keywords[text] === undefined) {
							keywords[text] = [];
						}
						keywords[text].push(file);
					}
				});
			});
			new KeywordsModal(this.app, keywords).open();
		}

		this.addCommand({
			id: 'show-possible-links',
			name: 'Show Possible Links',
			callback: getPossibleLinks,
			hotkeys: [
				{
					modifiers: ["Mod"],
					key: "6"
				}
			]
		});

		this.addSettingTab(new RelatedNotesSettingTab(this.app, this));
	}

	onunload() {
		console.log('unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class KeywordsModal extends Modal {
	constructor(app: App, public keywords: any) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		let modalContainer = contentEl.createDiv();
		let section = contentEl.createDiv({cls: 'possible-links-container'});
		let keys = Object.keys(this.keywords);
		let title = contentEl.createEl("h3", {text: `${keys.length} keywords found`});

		keys.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		keys.map(keyword => {
			let noteContainer = contentEl.createEl("p");
			let noteLink = contentEl.createEl("a", {
				cls: 'possible-link-item',
				text: `${keyword} - ${this.keywords[keyword].length} notes found`
			});
			noteLink.addEventListener('click', () => {
				new PossibleLinksModal(this.app, this.keywords[keyword], this.keywords).open();
				this.close();
			});

			noteContainer.append(noteLink);
			section.append(noteContainer);
		});
		
		modalContainer.append(title);
		modalContainer.append(section);
		contentEl.append(modalContainer);
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class PossibleLinksModal extends Modal {
	constructor(app: App, public links: any, public keywords: any) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		let modalContainer = contentEl.createDiv({cls:'possible-links-container'});
		let backBtn = contentEl.createEl("a", {text:'< Back to Keywords', cls:'possible-link-item'});
		backBtn.addEventListener('click', () => {
			new KeywordsModal(this.app, this.keywords).open();
			this.close();
		});

		let title = (this.links.length == 0)
			? contentEl.createEl('h3', {text:'0 Notes Found'})
			: contentEl.createEl('h3', {text: `${this.links.length} notes found`});

		this.links.map((link: any) => {
			let noteLink = contentEl.createEl("a", {text:link.path, cls:'possible-link-item'});
			noteLink.addEventListener('click', async (e) => {
				const currentLeaf = this.app.workspace.activeLeaf;
				if (e.metaKey) {
					let newLeaf = this.app.workspace.splitActiveLeaf('vertical');
					newLeaf.openFile(link);
				} else {
					currentLeaf.openFile(link);
				}
				let activeFile = this.app.workspace.getActiveFile();
				let fileData = await this.app.vault.read(activeFile);
				this.app.vault.modify(activeFile, fileData + `\n[[${link.basename}]]`);
				new Notice(`Added link [[${link.basename}]] to end of '${activeFile.basename}'`)
				this.close();
			});

			let noteContainer = contentEl.createEl("p");
			noteContainer.append(noteLink);
			modalContainer.append(noteContainer);
		});

		contentEl.append(backBtn);
		contentEl.append(title);
		contentEl.append(modalContainer);
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class RelatedNotesSettingTab extends PluginSettingTab {
	plugin: RelatedNotesPlugin;

	constructor(app: App, plugin: RelatedNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Settings for Related Notes Finder'});

		// Possible Links
		containerEl.createEl('h3', {text: 'Possible Links'});
		new Setting(containerEl)
			.setName('Minimum Letters')
			.setDesc('Minimum letter count for a word when searching for related notes.')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(this.plugin.settings.minLetters.toString())
				.onChange(async (value) => {
					this.plugin.settings.minLetters = parseInt(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ignore Dailies Path')
			.setDesc('Specify folder of Daily Journal to ignore these notes when searching for possible links. (leave blank to include dailies in possible links)')
			.addText(text => text
				.setPlaceholder('dailies')
				.setValue(this.plugin.settings.dailies)
				.onChange(async (value) => {
					this.plugin.settings.dailies = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Filtered Words')
			.setDesc('Words filtered when searching for related notes. (separated by comma, no spaces)')
			.addTextArea(text => {
				text
					.setPlaceholder('and,but,they...')
					.setValue(this.plugin.settings.filterWords)
					.onChange(async (value) => {
						this.plugin.settings.filterWords = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 10;
				text.inputEl.cols = 25;
			});
	}
}
