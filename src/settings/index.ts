import { type App, PluginSettingTab } from "obsidian";
import type { Granularity, PeriodicConfig } from "src/types";
import { mount, unmount } from "svelte";

import type PeriodicNotesPlugin from "../main";

export interface Settings {
  showGettingStartedBanner: boolean;
  hasMigratedDailyNoteSettings: boolean;
  hasMigratedWeeklyNoteSettings: boolean;
  installedVersion: string;
  enableTimelineComplication: boolean;

  day?: PeriodicConfig;
  week?: PeriodicConfig;
  month?: PeriodicConfig;
  quarter?: PeriodicConfig;
  year?: PeriodicConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  installedVersion: "1.0.0-beta3",
  showGettingStartedBanner: true,
  hasMigratedDailyNoteSettings: false,
  hasMigratedWeeklyNoteSettings: false,
  enableTimelineComplication: true,
};

export class PeriodicNotesSettingsTab extends PluginSettingTab {
  private view!: Record<string, unknown>;

  constructor(
    readonly app: App,
    readonly plugin: PeriodicNotesPlugin,
  ) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    // SettingsPage.svelte will be created in Task 7
    // For now this will cause a build error — that's expected
  }

  hide() {
    super.hide();
    if (this.view) {
      unmount(this.view);
    }
  }
}
