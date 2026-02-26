import type { DailyNotesSettings } from "obsidian";

import type { Settings } from "./settings";
import type { PeriodicConfig } from "./types";

interface PeriodicitySettings {
  enabled: boolean;
  folder?: string;
  format?: string;
  template?: string;
}

interface LegacySettings {
  showGettingStartedBanner: boolean;
  hasMigratedDailyNoteSettings: boolean;
  hasMigratedWeeklyNoteSettings: boolean;

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

export function migrateDailyNoteSettings(
  settings: LegacySettings,
): Partial<Settings> {
  const migrateConfig = (s: DailyNotesSettings): PeriodicConfig => ({
    enabled: true,
    format: s.format || "",
    folder: s.folder || "",
    openAtStartup: s.autorun ?? false,
    templatePath: s.template,
  });

  return {
    day: migrateConfig(settings.daily),
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
