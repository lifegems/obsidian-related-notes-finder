import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface RelatedNotesPluginSettings {
	appendLink: boolean;
	filterWords: string;
	dailies: string;
	minLetters: number;
}

const DEFAULT_SETTINGS: RelatedNotesPluginSettings = {
	appendLink: true,
	filterWords: 'the,and,but,not,then,they,will,not,your,from,them,was,with,what,who,why,where,this,over,than',
	dailies: '',
	minLetters: 3,
}

export default class RelatedNotesPlugin extends Plugin {
	settings: RelatedNotesPluginSettings;

	async onload() {
		console.log('loading Related Notes plugin');

		await this.loadSettings();

		const getPossibleLinks = async (): Promise<any> => {
			let files = this.app.vault.getFiles();
			let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return null;
			
			let fileData = await this.app.vault.cachedRead(activeView.file);
			fileData = fileData ? fileData : "";
			const selectedRange = activeView.editor.getSelection();
			fileData = selectedRange || fileData.replace(/[^\p{L}+|\p{M}]+/gmu," ");
			let fileTextItems = fileData.split(" ");
			fileTextItems = [...new Set(fileTextItems)];
			fileTextItems = fileTextItems.map(text => text.replace(/\s+/g, ""))
							 					  .filter(t => t.length > this.settings.minLetters && this.settings.filterWords.toLowerCase().split(",").indexOf(t.toLowerCase()) == -1);
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
			new KeywordsModal(this.app, keywords, this.settings).open();
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

		this.addCommand({
			id: 'toggle-append-link',
			name: 'Toggle Append Link Setting',
			callback: () => {
				this.settings.appendLink = !this.settings.appendLink;
				this.saveSettings();
				let status = this.settings.appendLink ? 'On' : 'Off';
				new Notice(`Append Link setting is now ${status}`)
			}
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
	constructor(app: App, public keywords: any, public settings: any) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		let modalContainer = contentEl.createDiv();
		let keys = Object.keys(this.keywords);
		let title = modalContainer.createEl("h3", {text: `${keys.length} keywords found`});
		let section = modalContainer.createDiv({cls: 'possible-links-container'});

		keys.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		keys.map(keyword => {
			let noteContainer = section.createEl("p");
			let noteLink = noteContainer.createEl("a", {
				cls: 'possible-link-item',
				text: `${keyword} - ${this.keywords[keyword].length} notes found`
			});
			noteLink.addEventListener('click', () => {
				new PossibleLinksModal(this.app, this.keywords[keyword], this.keywords, this.settings).open();
				this.close();
			});
		});
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class PossibleLinksModal extends Modal {
	constructor(app: App, public links: any, public keywords: any, public settings: any) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		let backBtn = contentEl.createEl("a", {text:'< Back to Keywords', cls:'possible-link-item'});
		let title = (this.links.length == 0)
			? contentEl.createEl('h3', {text:'0 Notes Found'})
			: contentEl.createEl('h3', {text: `${this.links.length} notes found`});
		let modalContainer = contentEl.createDiv({cls:'possible-links-container'});
		backBtn.addEventListener('click', () => {
			new KeywordsModal(this.app, this.keywords, this.settings).open();
			this.close();
		});


		this.links.map((link: any) => {
			let noteLink = modalContainer.createEl("p").createEl("a", {text:link.path, cls:'possible-link-item'});
			noteLink.addEventListener('click', async (e) => {
				let activeFile = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeFile && this.settings.appendLink) {
					let fileData = await this.app.vault.read(activeFile.file);
					this.app.vault.modify(activeFile.file, fileData + `\n[[${link.basename}]]`);
					new Notice(`Added link [[${link.basename}]] to end of '${activeFile.file.basename}'`)
				}
				if (e.metaKey) {
					let newLeaf = this.app.workspace.splitActiveLeaf('vertical');
					newLeaf.openFile(link);
				} else {
					const currentLeaf = this.app.workspace.activeLeaf;
					currentLeaf.openFile(link);
				}
				this.close();
			});
		});
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
			.setName('Append Link')
			.setDesc('Adds the selected link to the currently open note')
			.addToggle(value => {
				value
					.setValue(this.plugin.settings.appendLink)
					.onChange(async (value) => {
						this.plugin.settings.appendLink = value;
						await this.plugin.saveSettings();
					});
			});

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
