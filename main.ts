import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface MyPluginSettings {
	filterWords: string;
	dailies: string;
	minLetters: number;
	showFilePath: boolean;
	showRandom: boolean;
	showReadingTime: boolean;
	wpm: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	filterWords: 'the,and,but,not,then,they,will,not,your,from,them,was,with,what,who,why,where,this,over,than',
	dailies: '',
	minLetters: 3,
	showFilePath: true,
	showRandom: true,
	showReadingTime: true,
	wpm: 200,
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log('loading Obsidian+');

		await this.loadSettings();

		const FILE_PATH_STATUS = this.addStatusBarItem();
		const READING_TIME_STATUS = this.addStatusBarItem();

		const updateFilePath = () => {
			let activeFile = this.app.workspace.getActiveFile();

			if (this.settings.showFilePath) {
				FILE_PATH_STATUS.setText(activeFile.path);
			} else {
				FILE_PATH_STATUS.setText('');
			}
		}

		const updateReadingTime = async () => {
			let activeFile = this.app.workspace.getActiveFile();
			let fileData = await this.app.vault.read(activeFile);

			let result = "0m";
			let textLength = fileData ? fileData.split(" ").length : 0;
			if (textLength > 0) {
				let value = Math.ceil(textLength / this.settings.wpm);
				result = `${value}m`;
			}

			if (this.settings.showReadingTime) {
				READING_TIME_STATUS.setText(result);
			} else {
				READING_TIME_STATUS.setText('');
			}
		}

		const openRandomNote = () => {
			let files = this.app.vault.getFiles();
			let random = Math.floor(Math.random() * files.length);
			let randomFile = files[random];

			const currentLeaf = this.app.workspace.activeLeaf;
			currentLeaf.openFile(randomFile);
		}

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
			let links: any[] = [];
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

		this.app.workspace.on('active-leaf-change', updateFilePath);
		this.app.workspace.on('file-open', updateFilePath);
		this.app.workspace.on('click', updateFilePath);
		this.app.workspace.on('active-leaf-change', updateReadingTime);
		this.app.workspace.on('file-open', updateReadingTime);
		this.app.workspace.on('click', updateReadingTime);

		this.addCommand({
			id: 'obp-open-random-note',
			name: 'Open Random Note',
			callback: openRandomNote,
			hotkeys: [
				{
					modifiers: ["Mod"],
					key: "8"
				}
			]
		});

		this.addCommand({
			id: 'obp-show-possible-links',
			name: 'Show Possible Links',
			callback: getPossibleLinks,
			hotkeys: [
				{
					modifiers: ["Mod"],
					key: "6"
				}
			]
		})

		if (this.settings.showRandom) {
			this.addRibbonIcon('dice', 'Open Random Note', openRandomNote);
		}

		this.addSettingTab(new ObsidianPlusSettingTab(this.app, this));
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

class ObsidianPlusSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Settings for Obsidian+'});

		// File Path
		containerEl.createEl('h3', {text: 'File Path'});
		new Setting(containerEl)
			.setName('Display File Path')
			.setDesc('Show the active file path in the status bar.')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.showFilePath)
				.onChange(async (value) => {
					this.plugin.settings.showFilePath = value;
					await this.plugin.saveSettings();
				}));


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

		// new Setting(containerEl)
		// 	.setName('Include paths')
		// 	.setDesc('Paths in vault to search for possible links. (leave blank to search entire vault')
		// 	.addTextArea(text => {
		// 		text
		// 			.setPlaceholder('root/to/folder')
		// 			.setValue(this.plugin.settings.dailies)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.dailies = value;
		// 				await this.plugin.saveSettings();
		// 			});
		// 		text.inputEl.rows = 10;
		// 		text.inputEl.cols = 25;
		// 	});

		// Random Note
		containerEl.createEl('h3', {text: 'Random Note'});
		new Setting(containerEl)
			.setName('Display Random Icon in Ribbon. (Requires reload)')
			.setDesc('Show the random file option in the ribbon.')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.showRandom)
				.onChange(async (value) => {
					this.plugin.settings.showRandom = value;
					await this.plugin.saveSettings();
				}));

		// Reading Time
		containerEl.createEl('h3', {text: 'Reading Time'});
		new Setting(containerEl)
			.setName('Display Reading Time')
			.setDesc('Show the estimated reading time in the status bar.')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.showReadingTime)
				.onChange(async (value) => {
					this.plugin.settings.showReadingTime = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Words Per Minute')
			.setDesc('Words per minute calculated and added to status bar.')
			.addText(text => text
				.setPlaceholder('200')
				.setValue(this.plugin.settings.wpm.toString())
				.onChange(async (value) => {
					this.plugin.settings.wpm = parseInt(value);
					await this.plugin.saveSettings();
				}));

	}
}
