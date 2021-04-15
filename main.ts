import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface MyPluginSettings {
	filterWords: string;
	dailies: string;
	minLetters: number;
	wpm: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	filterWords: 'the,and,but,not,then,they,will,not,your,from,them,was,with,what,who,why,where,this,over,than',
	dailies: '',
	minLetters: 3,
	wpm: 200,
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log('loading Related Notes plugin');

		await this.loadSettings();

		const getPossibleLinks = async () => {
			let files = this.app.vault.getFiles();
			let activeFile = this.app.workspace.getActiveFile();
			let fileData = await this.app.vault.read(activeFile);
			fileData = fileData ? fileData : "";

			const currentView = this.app.workspace.activeLeaf.view;
			const cm = (currentView as any).sourceMode.cmEditor
			const cursor = cm.getCursor()
			const selectedRange = cm.getSelections().join('\n')

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
		let section = document.createElement("div");
		section.addClass('possible-links-container');
		let keys = Object.keys(this.keywords);
		let title = document.createElement("h3");
		title.setText(`${keys.length} keywords found`);
		section.append(title);

		keys.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		keys.map(keyword => {
			let title = document.createElement("p");
			title.addClass('possible-link-item');
			title.setText(`${keyword} - ${this.keywords[keyword].length} notes found`);
			title.addEventListener('click', () => {
				new PossibleLinksModal(this.app, this.keywords[keyword], this.keywords).open();
				this.close();
			});
			section.append(title);
		});
		contentEl.append(section);
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
		let section = document.createElement("div");
		section.addClass('possible-links-container');
		let back = document.createElement("h4");
		back.setText(`< Back to Keywords`);
		back.addClass('possible-link-item');
		back.addEventListener('click', () => {
			new KeywordsModal(this.app, this.keywords).open();
			this.close();
		});
		contentEl.append(back);
		let title = document.createElement("h3");
		title.setText(`${this.links.length} notes found`);
		section.append(title);
		this.links.map((link: any) => {
			let aref = document.createElement("a");
			aref.setText(link.path);
			aref.addClass('possible-link-item');
			aref.addEventListener('click', async (e) => {
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
			let p = document.createElement("p");
			p.append(aref);
			section.append(p);
		});
		contentEl.append(section);

		if (this.links.length == 0) {
			contentEl.setText("0 Notes Found");
		}
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class RelatedNotesSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
