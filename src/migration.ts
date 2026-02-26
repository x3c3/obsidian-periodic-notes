import type { App, DailyNotesPlugin } from "obsidian";

import type { Settings } from "./settings";
import type { PeriodicConfig } from "./types";

interface PeriodicitySettings {
  enabled: boolean;
  folder?: string;
  format?: string;
  template?: string;
}

interface LegacySettings {
  daily: PeriodicitySettings;
  weekly: PeriodicitySettings;
  monthly: PeriodicitySettings;
  quarterly: PeriodicitySettings;
  yearly: PeriodicitySettings;
}

export function isLegacySettings(
  settings: unknown,
): settings is LegacySettings {
  const s = settings as LegacySettings;
  return !!(s.daily || s.weekly || s.monthly || s.yearly || s.quarterly);
}

export function migrateDailyNoteSettings(app: App): Partial<Settings> {
  const plugin = app.internalPlugins.getPluginById("daily-notes");
  const options = (plugin?.instance as DailyNotesPlugin)?.options || {};

  return {
    day: {
      enabled: true,
      format: options.format || "",
      folder: options.folder || "",
      openAtStartup: options.autorun ?? false,
      templatePath: options.template,
    },
  };
}

export function migrateLegacySettings(
  settings: LegacySettings,
): Partial<Settings> {
  const migrateConfig = (s: PeriodicitySettings): PeriodicConfig => ({
    enabled: s.enabled,
    format: s.format || "",
    folder: s.folder || "",
    openAtStartup: false,
    templatePath: s.template,
  });

  return {
    day: migrateConfig(settings.daily),
    week: migrateConfig(settings.weekly),
    month: migrateConfig(settings.monthly),
    quarter: migrateConfig(settings.quarterly),
    year: migrateConfig(settings.yearly),
  };
}
