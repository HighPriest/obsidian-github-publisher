import i18next from "i18next";
import { App, Notice, PluginSettingTab, setIcon, Setting } from "obsidian";

import GithubPublisherPlugin from "./main";
import {
	help,
	KeyBasedOnSettings,
	multipleRepoExplained,
	supportMe,
	usefullLinks} from "./settings/help";
import {
	EnumbSettingsTabId,	FolderSettings, GithubTiersVersion, Repository } from "./settings/interface";
import { migrateToken } from "./settings/migrate";
import {ExportModal, ImportLoadPreset, ImportModal, loadAllPresets} from "./settings/modals/import_export";
import {ModalAddingNewRepository} from "./settings/modals/manage_repo";
import { ModalRegexFilePathName, ModalRegexOnContents } from "./settings/modals/regex_edition";
import { TokenEditPath } from "./settings/modals/token_path";
import {
	autoCleanCondition,
	autoCleanUpSettingsOnCondition,
	folderHideShowSettings,
	shortcutsHideShow, showHideBasedOnFolder,
} from "./settings/style";
import {verifyRateLimitAPI} from "./utils";
import { checkRepositoryValidity } from "./utils/data_validation_test";


export class GithubPublisherSettingsTab extends PluginSettingTab {
	plugin: GithubPublisherPlugin;
	settingsPage!: HTMLElement;
	branchName: string;

	constructor(app: App, plugin: GithubPublisherPlugin, branchName: string) {
		super(app, plugin);
		this.plugin = plugin;
		this.branchName = branchName;
	}

	display(): void{
		const { containerEl } = this;
		containerEl.empty();
		
		const PUBLISHER_TABS = {
			"github-configuration": {
				name: i18next.t("settings.github.title"),
				icon: "cloud",
			},
			"upload-configuration": {
				name: i18next.t("settings.upload.title"),
				icon: "upload",
			},
			"text-conversion": {
				name: i18next.t("settings.conversion.title"),
				icon: "file-text",
			},
			"embed-configuration": {
				name: i18next.t("settings.embed.title"),
				icon: "link",
			},
			"plugin-settings": {
				name: i18next.t("settings.plugin.title"),
				icon: "gear",
			},
			"help": {
				name: i18next.t("settings.help.title"),
				icon: "info",
			},
		};

		new Setting(containerEl)
			.setClass("github-publisher-export-import")
			.addButton((button) => {
				button.setButtonText(i18next.t("modals.export.title"))
					.setClass("github-publisher-export")
					.onClick(() => {
						new ExportModal(this.app, this.plugin).open();
					});
			}
			)
			.addButton((button) => {
				button.setButtonText(i18next.t("modals.import.title"))
					.setClass("github-publisher-import")
					.onClick(() => {
						new ImportModal(this.app, this.plugin, this.settingsPage, this).open();
					});
			})
			.addButton((button) => {
				button
					.setButtonText(i18next.t("modals.import.presets.title"))
					.setTooltip(i18next.t("modals.import.presets.desc"))
					.setClass("github-publisher-add-new-repository")
					.onClick(async () => {
						const octokit = await this.plugin.reloadOctokit();
						const presetLists = await loadAllPresets(octokit.octokit, this.plugin);
						new ImportLoadPreset(this.app, this.plugin, presetLists, octokit.octokit, this).open();
					});
			});
		const tabBar = containerEl.createEl("nav", {
			cls: "settings-tab-bar github-publisher",
		});



		for (const [tabID, tabInfo] of Object.entries(PUBLISHER_TABS)) {
			const tabEl = tabBar.createEl("div", {
				cls: "settings-tab github-publisher",
			});
			const tabIcon = tabEl.createEl("div", {
				cls: "settings-tab-icon github-publisher",
			});
			setIcon(tabIcon, tabInfo.icon);
			tabEl.createEl("div", {
				cls: "settings-tab-name github-publisher",
				text: tabInfo.name,
			});
			if (tabID === "github-configuration")
				tabEl.addClass("settings-tab-active");

			tabEl.addEventListener("click", async () => {
				// @ts-ignore
				for (const tabEl of tabBar.children)
					tabEl.removeClass("settings-tab-active");

				tabEl.addClass("settings-tab-active");
				this.renderSettingsPage(tabID);
			});
		}
		this.settingsPage = containerEl.createEl("div", {
			cls: "settings-tab-page github-publisher",
		});
		this.renderSettingsPage("github-configuration");
	}

	/**
	 * Render the settings tab
	 * @param {string} tabId - to know which tab to render
	 */
	renderSettingsPage(tabId: string) {
		this.settingsPage.empty();
		switch (tabId) {
		case "github-configuration":
			this.renderGithubConfiguration();
			break;
		case "upload-configuration":
			this.renderUploadConfiguration();
			break;
		case "text-conversion":
			this.renderTextConversion();
			break;
		case "embed-configuration":
			this.renderEmbedConfiguration();
			break;
		case "plugin-settings":
			this.renderPluginSettings();
			break;
		case "help":
			this.renderHelp();
			break;
		}
	}

	/**
	 * Render the github configuration tab
	 * @returns {void}
	 */
	renderGithubConfiguration() {
		const githubSettings = this.plugin.settings.github;
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.github.apiType.title"))
			.setDesc(i18next.t("settings.github.apiType.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption(GithubTiersVersion.free, i18next.t("settings.github.apiType.dropdown.free"))
					.addOption(GithubTiersVersion.entreprise, i18next.t("settings.github.apiType.dropdown.enterprise"))
					.setValue(githubSettings.api.tiersForApi)
					.onChange(async (value) => {
						githubSettings.api.tiersForApi = value as GithubTiersVersion;
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.github);
					});
			});
		if (githubSettings.api.tiersForApi === GithubTiersVersion.entreprise) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.github.apiType.hostname.title"))
				.setDesc(i18next.t("settings.github.apiType.hostname.desc"))
				.addText((text) =>
					text
						.setPlaceholder("https://github.mycompany.com")
						.setValue(githubSettings.api.hostname)
						.onChange(async (value) => {
							githubSettings.api.hostname = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.github.repoName.title"))
			.setDesc(i18next.t("settings.github.repoName.desc"))
			.addText((text) =>
				text
					.setPlaceholder(i18next.t("settings.github.repoName.placeholder"))
					.setValue(githubSettings.repo)
					.onChange(async (value) => {
						githubSettings.repo = value.trim();
						await this.plugin.saveSettings();
					})
			);
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.github.username.title"))
			.setDesc(i18next.t("settings.github.username.desc"))
			.addText((text) =>
				text
					.setPlaceholder(
						i18next.t("settings.github.username.title") 
					)
					.setValue(githubSettings.user)
					.onChange(async (value) => {
						githubSettings.user = value.trim();
						await this.plugin.saveSettings();
					})
			);
		const desc_ghToken = document.createDocumentFragment();
		desc_ghToken.createEl("span", undefined, (span) => {
			span.innerText = i18next.t("settings.github.ghToken.desc") ;
			span.createEl("a", undefined, (link) => {
				link.innerText = i18next.t("common.here") + "." ;
				link.href =
					"https://github.com/settings/tokens/new?scopes=repo,workflow";
			});
		});
		const tokenSettings = new Setting(this.settingsPage)
			.setName(i18next.t("common.ghToken"))
			.setDesc(desc_ghToken)
			.addText(async (text) => {
				const decryptedToken:string = await this.plugin.loadToken();
				text
					.setPlaceholder("ghp_15457498545647987987112184")
					.setValue(decryptedToken)
					.onChange(async (value) => {
						if (value.trim().length === 0 ) {
							tokenSettings.controlEl.querySelector("input")!.style.border = "1px solid red";
							new Notice(i18next.t("settings.github.ghToken.error"));
						} else {
							tokenSettings.controlEl.querySelector("input")!.style.border = "";
							await migrateToken(this.plugin, value.trim());
						}
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("edit")
					.setTooltip(i18next.t("settings.github.ghToken.button.tooltip"))
					.onClick(async () => {
						const token = await this.plugin.loadToken();
						new TokenEditPath(this.app, this.plugin, token).open();
						await this.plugin.saveSettings();

					});
			});
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.github.branch.title"))
			.setDesc(i18next.t("settings.github.branch.desc"))
			.addText((text) =>
				text
					.setPlaceholder("main")
					.setValue(githubSettings.branch)
					.onChange(async (value) => {
						githubSettings.branch = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.github.automaticallyMergePR"))
			.addToggle((toggle) =>
				toggle
					.setValue(githubSettings.automaticallyMergePR)
					.onChange(async (value) => {
						githubSettings.automaticallyMergePR = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.settingsPage)
			.setClass("github-publisher-no-display")
			.addButton((button) =>
				button
					.setButtonText(i18next.t("settings.github.testConnection"))
					.setClass("github-publisher-connect-button")
					.onClick(async () => {
						const octokit = await this.plugin.reloadOctokit();
						this.plugin.settings.github.verifiedRepo = await checkRepositoryValidity(octokit, null,null);
						this.plugin.settings.github.rateLimit = await verifyRateLimitAPI(octokit.octokit, this.plugin.settings);
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button
					.setButtonText(i18next.t("settings.github.smartRepo.button"))
					.onClick(async () => {
						const repository: Repository[] = this.plugin.settings.github?.otherRepo ?? [];
						new ModalAddingNewRepository(this.app, this.plugin.settings, this.branchName, this.plugin, repository, (result => {
							this.plugin.settings.github.otherRepo = result;
							this.plugin.saveSettings();
							this.plugin.reloadCommands(this.branchName);
						})
						).open();
					}));
		this.settingsPage.createEl("h3", { text: "Github Workflow" });
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.githubWorkflow.prRequest.title"))
			.setDesc(i18next.t("settings.githubWorkflow.prRequest.desc"))
			.addText((text) =>
				text
					.setPlaceholder("[PUBLISHER] MERGE")
					.setValue(githubSettings.workflow.commitMessage)
					.onChange(async (value) => {
						if (value.trim().length === 0) {
							value = "[PUBLISHER] MERGE";
							new Notice(i18next.t("settings.githubWorkflow.prRequest.error"));
						}
						githubSettings.workflow.commitMessage = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.githubWorkflow.githubAction.title"))
			.setDesc(
				i18next.t("settings.githubWorkflow.githubAction.desc") 
			)
			.addText((text) => {
				text.setPlaceholder("ci")
					.setValue(githubSettings.workflow.name)
					.onChange(async (value) => {
						if (value.length > 0) {
							value = value.trim();
							const yamlEndings = [".yml", ".yaml"];
							if (! yamlEndings.some(ending => value.endsWith(ending))) {
								value += yamlEndings[0];
							}
						}
						githubSettings.workflow.name = value;
						await this.plugin.saveSettings();
					});
			});


	}

	/**
	 * Render the settings tab for the upload configuration
	 */
	renderUploadConfiguration() {
		const uploadSettings = this.plugin.settings.upload;
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.upload.folderBehavior.title"))
			.setDesc(i18next.t("settings.upload.folderBehavior.desc"))
			.addDropdown((dropDown) => {
				dropDown
					.addOptions({
						fixed: i18next.t(
							"settings.upload.folderBehavior.fixedFolder") ,
						yaml: i18next.t("settings.upload.folderBehavior.yaml") ,
						obsidian: i18next.t(
							"settings.upload.folderBehavior.obsidianPath") ,
					})
					.setValue(uploadSettings.behavior)
					.onChange(async (value: string) => {
						uploadSettings.behavior = value as FolderSettings;
						await folderHideShowSettings(
							frontmatterKeySettings,
							rootFolderSettings,
							autoCleanSetting,
							value,
							this.plugin);
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.upload);
					});
			});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.upload.defaultFolder.title"))
			.setDesc(i18next.t("settings.upload.defaultFolder.desc"))
			.addText((text) => {
				text.setPlaceholder(i18next.t("settings.upload.defaultFolder.placeholder"))
					.setValue(uploadSettings.defaultName)
					.onChange(async (value) => {
						uploadSettings.defaultName = value.replace(
							/\/$/,
							""
						);
						await autoCleanCondition(
							value,
							autoCleanSetting,
							this.plugin,
							"defaultName",
							this
						);
						await this.plugin.saveSettings();
					});
			});

		const frontmatterKeySettings = new Setting(this.settingsPage)
			.setName(i18next.t("settings.upload.frontmatterKey.title"))
			.setClass("github-publisher")
			.setDesc(i18next.t("settings.upload.frontmatterKey.desc"))
			.addText((text) => {
				text.setPlaceholder(i18next.t("settings.upload.frontmatterKey.placeholder"))
					.setValue(uploadSettings.yamlFolderKey)
					.onChange(async (value) => {
						uploadSettings.yamlFolderKey = value.trim();
						await this.plugin.saveSettings();
					});
			});
		const rootFolderSettings = new Setting(this.settingsPage)
			.setName(i18next.t("settings.upload.rootFolder.title"))
			.setClass("github-publisher")
			.setDesc(i18next.t("settings.upload.rootFolder.desc"))
			.addText((text) => {
				text.setPlaceholder("docs")
					.setValue(uploadSettings.rootFolder)
					.onChange(async (value) => {
						uploadSettings.rootFolder = value.replace(
							/\/$/,
							""
						);
						await autoCleanCondition(
							value,
							autoCleanSetting,
							this.plugin,
							"rootFolder",
							this
						);
						await this.plugin.saveSettings();
					});
			});
		const frontmatterTitleSet = new Setting(this.settingsPage)
			.setName(
				i18next.t("settings.upload.useFrontmatterTitle.title") 
			)
			.setDesc(
				i18next.t("settings.upload.useFrontmatterTitle.desc") 
			)
			.setClass("github-publisher-title")
			.addToggle((toggle) => {
				toggle
					.setValue(uploadSettings.frontmatterTitle.enable)
					.onChange(async (value) => {
						uploadSettings.frontmatterTitle.enable = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.upload);
					});
			});
		if (uploadSettings.frontmatterTitle.enable) {
			frontmatterTitleSet.addText((text) => {
				text.setPlaceholder("title")
					.setValue(uploadSettings.frontmatterTitle.key)
					.onChange(async (value) => {
						uploadSettings.frontmatterTitle.key = value.trim();
						await this.plugin.saveSettings();
					});
			});
		}

		const desc = uploadSettings.behavior === FolderSettings.fixed ? i18next.t("settings.upload.regexFilePathTitle.title.titleOnly") : i18next.t("settings.upload.regexFilePathTitle.title.FolderPathTitle") ;

		new Setting(this.settingsPage)
			.setName(desc)
			.setDesc(
				i18next.t("settings.upload.regexFilePathTitle.desc") 
			)
			.addButton((button) => {
				button
					.setIcon("pencil")
					.onClick(async () => {
						let allRegex = uploadSettings.replaceTitle;
						if (uploadSettings.behavior !== FolderSettings.fixed) {
							allRegex = allRegex.concat(uploadSettings.replacePath);
						}
						new ModalRegexFilePathName(this.app, this.plugin.settings, allRegex, (result => {
							uploadSettings.replacePath = result.filter(title => {return title.type === "path";});
							uploadSettings.replaceTitle = result.filter(title => {return title.type === "title";});
							this.plugin.saveSettings();
						})).open();
					});
			});
				
		const folderNoteSettings = new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.links.folderNote.title"))
			.setClass("github-publisher-folderNote")
			.setDesc(
				i18next.t("settings.conversion.links.folderNote.desc") 
			)
			.addToggle((toggle) => {
				toggle
					.setValue(uploadSettings.folderNote.enable)
					.onChange(async (value) => {
						uploadSettings.folderNote.enable = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.upload);
					});
			});

		if (uploadSettings.folderNote.enable) {
			folderNoteSettings.addText((text) => {
				text.setPlaceholder("folderNote")
					.setValue(uploadSettings.folderNote.rename)
					.onChange(async (value) => {
						uploadSettings.folderNote.rename = value;
						await this.plugin.saveSettings();

					});
			});
		}

		showHideBasedOnFolder(this.plugin.settings, frontmatterKeySettings, rootFolderSettings, folderNoteSettings);

		//@ts-ignore
		if (this.app.plugins.manifests["metadata-extractor"]) {
			new Setting(this.settingsPage)
				.setName(
					i18next.t("settings.githubWorkflow.useMetadataExtractor.title") 
				)
				.setDesc(
					i18next.t("settings.githubWorkflow.useMetadataExtractor.desc") 
				)
				.addText((text) => {
					text.setPlaceholder("docs/_assets/metadata")
						.setValue(uploadSettings.metadataExtractorPath)
						.onChange(async (value) => {
							uploadSettings.metadataExtractorPath =
								value.trim();
							await this.plugin.saveSettings();
						});
				});
		}

		const condition =
			(uploadSettings.behavior === FolderSettings.yaml &&
				uploadSettings.rootFolder.length === 0) ||
				uploadSettings.defaultName.length === 0;

		const autoCleanSetting = new Setting(this.settingsPage)
			.setName(i18next.t("settings.githubWorkflow.autoCleanUp.title"))
			.setDesc(i18next.t("settings.githubWorkflow.autoCleanUp.desc"))
			.setDisabled(condition)
			.addToggle((toggle) => {
				toggle
					.setValue(uploadSettings.autoclean.enable)
					.onChange(async (value) => {
						uploadSettings.autoclean.enable = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.upload);
					});
			});
		if (uploadSettings.autoclean.enable && !condition) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.githubWorkflow.excludedFiles.title"))
				.setDesc(i18next.t("settings.githubWorkflow.excludedFiles.desc"))
				.setClass("github-publisher-textarea")
				.addTextArea((textArea) => {
					textArea
						.setPlaceholder(
							"docs/assets/js, docs/assets/logo, /\\.js$/"
						)
						.setValue(
							uploadSettings.autoclean.excluded.join(", ")
						)
						.onChange(async (value) => {
							uploadSettings.autoclean.excluded = value
								.split(/[,\n]\W*/)
								.map((item) => item.trim())
								.filter((item) => item.length > 0);
							await this.plugin.saveSettings();
						});
				});
		}
		autoCleanUpSettingsOnCondition(
			condition,
			autoCleanSetting,
			this.plugin
		);
		
		folderHideShowSettings(
			frontmatterKeySettings,
			rootFolderSettings,
			autoCleanSetting,
			uploadSettings.behavior,
			this.plugin,
		);

	}

	/**
	 * Render the settings page for the text conversion parameters
	 * @returns {void}
	 */
	renderTextConversion() {
		const textSettings = this.plugin.settings.conversion;
		this.settingsPage.createEl("p", {
			text: i18next.t("settings.conversion.desc") ,
		});
		this.settingsPage.createEl("h5", {
			text: i18next.t("settings.conversion.sectionTitle") ,
		});
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.hardBreak.title"))
			.setDesc(i18next.t("settings.conversion.hardBreak.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(textSettings.hardbreak)
					.onChange(async (value) => {
						textSettings.hardbreak = value;
						await this.plugin.saveSettings();
					});
			});
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.dataview.title"))
			.setDesc(i18next.t("settings.conversion.dataview.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(textSettings.dataview)
					.onChange(async (value) => {
						textSettings.dataview = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.regexReplacing.modal.title.text"))
			.setDesc(i18next.t("settings.regexReplacing.modal.desc"))
			.addButton((button) => {
				button
					.setIcon("pencil")
					.onClick(async () => {
						new ModalRegexOnContents(this.app, this.plugin.settings, (result => {
							this.plugin.settings.conversion.censorText = result.conversion.censorText;
							this.plugin.saveSettings();
						})).open();
					});
			});

		this.settingsPage.createEl("h5", { text: "Tags" });
		new Setting(this.settingsPage)
			.setName(
				i18next.t("settings.conversion.tags.inlineTags.title") 
			)
			.setDesc(
				i18next.t("settings.conversion.tags.inlineTags.desc") 
			)
			.addToggle((toggle) => {
				toggle
					.setValue(textSettings.tags.inline)
					.onChange(async (value) => {
						textSettings.tags.inline = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.tags.title"))
			.setDesc(i18next.t("settings.conversion.tags.desc"))
			.setClass("github-publisher-textarea")
			.addTextArea((text) => {
				text.inputEl.style.width = "50%";
				text.setPlaceholder("field_name")
					.setValue(textSettings.tags.fields.join(","))
					.onChange(async (value) => {
						textSettings.tags.fields = value
							.split(/[,\n]\W*/)
							.map((item) => item.trim())
							.filter((item) => item.length > 0);
						await this.plugin.saveSettings();
					});
			});
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.tags.exclude.title"))
			.setDesc(i18next.t("settings.conversion.tags.exclude.desc"))
			.setClass("github-publisher-textarea")
			.addTextArea((text) => {
				text.setPlaceholder("field value")
					.setValue(
						textSettings.tags.exclude.join(",")
					)
					.onChange(async (value) => {
						textSettings.tags.exclude = value
							.split(/[,\n]\W*/)
							.map((item) => item.trim())
							.filter((item) => item.length > 0);
						await this.plugin.saveSettings();
					});
			});

		this.settingsPage.createEl("h5", {
			text: i18next.t("settings.conversion.links.title") ,
		});
		this.settingsPage.createEl("p", {
			text: i18next.t("settings.conversion.links.desc") ,
		});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.links.internals.title"))
			.setDesc(
				i18next.t("settings.conversion.links.internals.desc") 
			)
			.addToggle((toggle) => {
				toggle
					.setValue(textSettings.links.internal)
					.onChange(async (value) => {
						textSettings.links.internal = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage("text-conversion");
					});
			});

		if (textSettings.links.internal) {
			new Setting(this.settingsPage)
				.setName(
					i18next.t("settings.conversion.links.nonShared.title") 
				)
				.setDesc(
					i18next.t("settings.conversion.links.nonShared.desc") 
				)
				.addToggle((toggle) => {
					toggle
						.setValue(textSettings.links.unshared)
						.onChange(async (value) => {
							textSettings.links.unshared =
								value;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.conversion.links.wikilinks.title"))
			.setDesc(
				i18next.t("settings.conversion.links.wikilinks.desc") 
			)
			.addToggle((toggle) => {
				toggle
					.setValue(textSettings.links.wiki)
					.onChange(async (value) => {
						textSettings.links.wiki = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage("text-conversion");
					});
			});

		if (textSettings.links.wiki || textSettings.links.internal) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.conversion.links.slugify.title"))
				.setDesc(i18next.t("settings.conversion.links.slugify.desc"))
				.addToggle((toggle) => {
					toggle
						.setValue(textSettings.links.slugify)
						.onChange(async (value) => {
							textSettings.links.slugify = value;
							await this.plugin.saveSettings();
						});
				});
		}
	}

	/**
	 * Render the settings page for the embeds settings
	 */
	async renderEmbedConfiguration() {
		this.settingsPage.empty();
		const embedSettings = this.plugin.settings.embed;
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.embed.transferImage.title"))
			.setDesc(i18next.t("settings.embed.transferImage.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(embedSettings.attachments)
					.onChange(async (value) => {
						embedSettings.attachments = value;
						shortcutsHideShow(value, settingsDefaultImage);
						await this.plugin.saveSettings();
					});
			});

		const settingsDefaultImage = new Setting(this.settingsPage)
			.setName(i18next.t("settings.embed.defaultImageFolder.title"))
			.setDesc(i18next.t("settings.embed.defaultImageFolder.desc"))
			.addText((text) => {
				text.setPlaceholder("docs/images")
					.setValue(embedSettings.folder)
					.onChange(async (value) => {
						embedSettings.folder = value.replace(
							/\/$/,
							""
						);
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.embed.transferMetaFile.title"))
			.setDesc(i18next.t("settings.embed.transferMetaFile.desc"))
			.setClass("github-publisher-textarea")
			.addTextArea((text) => {
				text.setPlaceholder("banner")
					.setValue(
						embedSettings.keySendFile.join(", ")
					)
					.onChange(async (value) => {
						embedSettings.keySendFile = value
							.split(/[,\n]\W*/)
							.map((item) => item.trim())
							.filter((item) => item.length > 0);
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.settingsPage)
			.setName(i18next.t("settings.embed.transferNotes.title"))
			.setDesc(i18next.t("settings.embed.transferNotes.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(embedSettings.notes)
					.onChange(async (value) => {
						embedSettings.notes = value;
						await this.plugin.saveSettings();
						await this.renderEmbedConfiguration();
					});
			});

		if (embedSettings.notes) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.embed.links.title"))
				.setDesc(i18next.t("settings.embed.links.desc"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("keep", i18next.t("settings.embed.links.dp.keep"))
						.addOption("remove", i18next.t("settings.embed.links.dp.remove"))
						.addOption("links", i18next.t("settings.embed.links.dp.links"))
						.addOption("bake", i18next.t("settings.embed.links.dp.bake"))
						.setValue(embedSettings.convertEmbedToLinks ?? "keep")
						.onChange(async (value) => {
							embedSettings.convertEmbedToLinks = value as "keep" | "remove" | "links" | "bake";
							await this.plugin.saveSettings();
							await this.renderEmbedConfiguration();
						});
				});

			if (embedSettings.convertEmbedToLinks === "links") {
				new Setting(this.settingsPage)
					.setName(i18next.t("settings.embed.char.title"))
					.setDesc(i18next.t("settings.embed.char.desc"))
					.addText((text) => {
						text.setPlaceholder("->")
							.setValue(embedSettings.charConvert ?? "->")
							.onChange(async (value) => {
								embedSettings.charConvert = value;
								await this.plugin.saveSettings();
							});
					});
			} else if (embedSettings.convertEmbedToLinks === "bake") {
				if (!embedSettings.bake) {
					embedSettings.bake = {
						textBefore: "",
						textAfter: ""
					};
					await this.plugin.saveSettings();
				}
				await this.plugin.saveSettings();
				this.settingsPage.createEl("h4", {text: i18next.t("settings.embed.bake.title")});
				this.settingsPage.createEl("p", {text: i18next.t("settings.embed.bake.text")});
				this.settingsPage.createEl("p", undefined, (el) => {
					el.createEl("span", {
						text: i18next.t("settings.embed.bake.variable.desc"),
						cls: ["github-publisher", "bake"]
					})
						.createEl("ul", undefined, (ul) => {
							ul.createEl("li", undefined, (li) => {
								li.createEl("code", {text: "{{title}}"});
								li.createEl("span", {text: i18next.t("settings.embed.bake.variable.title")});
							});
							ul.createEl("li", undefined, (li) => {
								li.createEl("code", {text: "{{url}}"});
								li.createEl("span", {text: i18next.t("settings.embed.bake.variable.url")});
							});
						});
				});

				this.settingsPage.createEl("p", {
					text: `⚠️ ${i18next.t("settings.embed.bake.warning")}`,
					cls: ["warning", "github-publisher", "embed"]
				});

				new Setting(this.settingsPage)
					.setName(i18next.t("settings.embed.bake.textBefore.title"))
					.setClass("github-publisher-textarea")
					.addTextArea((text) => {
						text
							.setValue(embedSettings.bake?.textBefore ?? "")
							.onChange(async (value) => {
								embedSettings.bake!.textBefore = value;
								await this.plugin.saveSettings();
							});
					});

				new Setting(this.settingsPage)
					.setName(i18next.t("settings.embed.bake.textAfter.title"))
					.setClass("github-publisher-textarea")
					.addTextArea((text) => {
						text
							.setValue(embedSettings.bake?.textAfter ?? "")
							.onChange(async (value) => {
								embedSettings.bake!.textAfter = value;
								await this.plugin.saveSettings();
							});
					});
			}
		}
	}

	/**
	 * Render the settings page for the plugin settings (general settings, as shareKey)
	 */
	renderPluginSettings() {
		const pluginSettings = this.plugin.settings.plugin;
		
		
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.shareKey.all.title"))
			.setDesc(i18next.t("settings.plugin.shareKey.all.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.shareAll?.enable ?? false)
					.onChange(async (value) => {
						pluginSettings.shareAll = {
							enable: value,
							excludedFileName: pluginSettings.shareAll?.excludedFileName ?? "DRAFT",
						};
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.plugin);
					})
			);
		if (!pluginSettings.shareAll || !pluginSettings.shareAll.enable) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.plugin.shareKey.title"))
				.setDesc(i18next.t("settings.plugin.shareKey.desc"))
				.addText((text) =>
					text
						.setPlaceholder("share")
						.setValue(pluginSettings.shareKey)
						.onChange(async (value) => {
							pluginSettings.shareKey = value.trim();
							await this.plugin.saveSettings();
						})
				);
		} else {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.plugin.shareKey.excludedFileName.title"))
				.addText((text) =>
					text
						.setPlaceholder("DRAFT")
						.setValue(pluginSettings.shareAll?.excludedFileName ?? "DRAFT")
						.onChange(async (value) => {
							pluginSettings.shareAll!.excludedFileName = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}
		
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.excludedFolder.title"))
			.setDesc(i18next.t("settings.plugin.excludedFolder.desc"))
			.setClass("github-publisher-textarea")
			.addTextArea((textArea) =>
				textArea
					.setPlaceholder("_assets, Archive, /^_(.*)/gi")
					.setValue(pluginSettings.excludedFolder.join(", "))
					.onChange(async (value) => {
						pluginSettings.excludedFolder = value
							.split(/[,\n]\W*/)
							.map((item) => item.trim())
							.filter((item) => item.length > 0);
						await this.plugin.saveSettings();
					})
			);
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.fileMenu.title"))
			.setDesc(i18next.t("settings.plugin.fileMenu.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.fileMenu)
					.onChange(async (value) => {
						pluginSettings.fileMenu = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.editorMenu.title"))
			.setDesc(i18next.t("settings.plugin.editorMenu.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.editorMenu)
					.onChange(async (value) => {
						pluginSettings.editorMenu = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.copyLink.title"))
			.setDesc(i18next.t("settings.plugin.copyLink.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.copyLink.enable)
					.onChange(async (value) => {
						pluginSettings.copyLink.enable = value;
						await this.plugin.saveSettings();
						this.renderSettingsPage(EnumbSettingsTabId.plugin);
						
					})
			);
		if (pluginSettings.copyLink.enable) {
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.plugin.copyLink.baselink.title"))
				.setDesc(i18next.t("settings.plugin.copyLink.baselink.desc"))
				.setClass("github-publisher")
				.addText((text) => {
					text.setPlaceholder("my_blog.com")
						.setValue(pluginSettings.copyLink.links)
						.onChange(async (value) => {
							pluginSettings.copyLink.links = value;
							await this.plugin.saveSettings();
						});
				});
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.plugin.copyLink.linkPathRemover.title"))
				.setDesc(
					i18next.t("settings.plugin.copyLink.linkPathRemover.desc") 
				)
				.setClass("github-publisher")
				.addText((text) => {
					text.setPlaceholder("docs")
						.setValue(pluginSettings.copyLink.removePart.join(", "))
						.onChange(async (value) => {
							pluginSettings.copyLink.removePart = value.split(/[,\n]\s*/).map((item) => item.trim()).filter((item) => item.length > 0);
							await this.plugin.saveSettings();
						});
				});
			
			new Setting(this.settingsPage)
				.setName(i18next.t("settings.plugin.copyLink.command.desc"))
				.addToggle((toggle) =>
					toggle
						.setValue(pluginSettings.copyLink.addCmd)
						.onChange(async (value) => {
							pluginSettings.copyLink.addCmd = value;
							await this.plugin.saveSettings();
						})
				);
		}
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.logNoticeHeader.title"))
			.setDesc(i18next.t("settings.plugin.logNoticeHeader.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.noticeError)
					.onChange(async (value) => {
						pluginSettings.noticeError = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(this.settingsPage)
			.setName(i18next.t("settings.plugin.embedEditRepo.title"))
			.setDesc(i18next.t("settings.plugin.embedEditRepo.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(pluginSettings.displayModalRepoEditing)
					.onChange(async (value) => {
						pluginSettings.displayModalRepoEditing = value;
						await this.plugin.saveSettings();
					})
			);
	}

	/**
	 * Render the help page
	 */
	renderHelp() {
		this.settingsPage.createEl("h2", {
			text: i18next.t("settings.help.usefulLinks.title") ,
		});
		this.settingsPage.appendChild(usefullLinks());
		this.settingsPage.createEl("hr");
		this.settingsPage.createEl("h2", {
			text: i18next.t("settings.help.frontmatter.title") ,
		});
		this.settingsPage.createEl("p", {
			text: i18next.t("settings.help.frontmatter.desc") ,
		});
		this.settingsPage
			.createEl("pre", { cls: "language-yaml" })
			.createEl("code", {
				text: KeyBasedOnSettings(this.plugin.settings),
				cls: "language-yaml",
			});
		this.settingsPage.appendChild(help(this.plugin.settings));
		this.settingsPage.createEl("h2", {
			text: i18next.t("settings.help.multiRepoHelp.title") ,
		});
		this.settingsPage.appendChild(
			multipleRepoExplained(this.plugin.settings)
		);
		this.settingsPage.appendChild(supportMe());
	}
}
