import type { App, DailyNotesPlugin } from "obsidian";
import { type Granularity, granularities } from "src/types";
import { get, type Updater, type Writable } from "svelte/store";
import type { Settings } from ".";

export const clearStartupNote: Updater<Settings> = (settings: Settings) => {
  for (const granularity of granularities) {
    const config = settings[granularity];
    if (config?.openAtStartup) {
      config.openAtStartup = false;
    }
  }
  return settings;
};

export function findStartupNoteConfig(
  settings: Writable<Settings>,
): Granularity | null {
  const s = get(settings);
  for (const granularity of granularities) {
    if (s[granularity]?.openAtStartup) {
      return granularity;
    }
  }
  return null;
}

export function getEnabledGranularities(settings: Settings): Granularity[] {
  return granularities.filter((g) => settings[g]?.enabled);
}

export function isDailyNotesPluginEnabled(app: App): boolean {
  return app.internalPlugins.getPluginById("daily-notes").enabled;
}

function getDailyNotesPlugin(app: App): DailyNotesPlugin | null {
  const installedPlugin = app.internalPlugins.getPluginById("daily-notes");
  if (installedPlugin) {
    return installedPlugin.instance as DailyNotesPlugin;
  }
  return null;
}

export function hasLegacyDailyNoteSettings(app: App): boolean {
  const options = getDailyNotesPlugin(app)?.options || {};
  return !!(options.format || options.folder || options.template);
}

export function disableDailyNotesPlugin(app: App): void {
  app.internalPlugins.getPluginById("daily-notes").disable(true);
}

export function getLocaleOptions() {
  const sysLocale = navigator.language?.toLowerCase();
  return [
    { label: `Same as system (${sysLocale})`, value: "system-default" },
    ...window.moment.locales().map((locale) => ({
      label: locale,
      value: locale,
    })),
  ];
}

export function getWeekStartOptions() {
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const localizedWeekdays = window.moment.weekdays();
  const localeWeekStartNum = window._bundledLocaleWeekSpec.dow;
  const localeWeekStart = localizedWeekdays[localeWeekStartNum];
  return [
    { label: `Locale default (${localeWeekStart})`, value: "locale" },
    ...localizedWeekdays.map((day, i) => ({ value: weekdays[i], label: day })),
  ];
}
