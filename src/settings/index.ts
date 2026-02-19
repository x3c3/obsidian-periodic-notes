import { type App, PluginSettingTab } from "obsidian";
import { DEFAULT_CALENDARSET_ID } from "src/constants";
import type { CalendarSet } from "src/types";
import { mount, unmount } from "svelte";

import type PeriodicNotesPlugin from "../main";
import SettingsRouter from "./pages/Router.svelte";

export interface Settings {
  showGettingStartedBanner: boolean;
  hasMigratedDailyNoteSettings: boolean;
  hasMigratedWeeklyNoteSettings: boolean;
  installedVersion: string;

  activeCalendarSet: string;
  calendarSets: CalendarSet[];

  enableTimelineComplication: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  // Onboarding
  installedVersion: "1.0.0-beta3",
  showGettingStartedBanner: true,
  hasMigratedDailyNoteSettings: false,
  hasMigratedWeeklyNoteSettings: false,

  // Configuration / Preferences
  activeCalendarSet: DEFAULT_CALENDARSET_ID,
  calendarSets: [],
  enableTimelineComplication: true,

  // Localization
};

export class PeriodicNotesSettingsTab extends PluginSettingTab {
  private view!: Record<string, never>;

  constructor(
    readonly app: App,
    readonly plugin: PeriodicNotesPlugin,
  ) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    this.view = mount(SettingsRouter, {
      target: this.containerEl,
      props: {
        app: this.app,
        manager: this.plugin.calendarSetManager,
        settings: this.plugin.settings,
      },
    });
  }

  hide() {
    super.hide();
    unmount(this.view);
  }
}
