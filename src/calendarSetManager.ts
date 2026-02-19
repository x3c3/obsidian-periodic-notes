import type { DailyNotesSettings } from "obsidian";
import { get } from "svelte/store";
import type PeriodicNotesPlugin from "./main";

import {
  type CalendarSet,
  type Granularity,
  granularities,
  type PeriodicConfig,
} from "./types";
import { getConfig, getFormat } from "./utils";

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

export const DEFAULT_CALENDARSET_ID = "Default";

export function isLegacySettings(
  settings: unknown,
): settings is LegacySettings {
  const maybeLegacySettings = settings as LegacySettings;
  return !!(
    maybeLegacySettings.daily ||
    maybeLegacySettings.weekly ||
    maybeLegacySettings.monthly ||
    maybeLegacySettings.yearly ||
    maybeLegacySettings.quarterly
  );
}

export function migrateDailyNoteSettings(
  settings: LegacySettings,
): CalendarSet {
  const migrateConfig = (settings: DailyNotesSettings) => {
    return {
      enabled: true,
      format: settings.format || "",
      folder: settings.folder || "",
      openAtStartup: settings.autorun,
      templatePath: settings.template,
    } as PeriodicConfig;
  };

  return {
    id: DEFAULT_CALENDARSET_ID,
    ctime: window.moment().format(),
    day: migrateConfig(settings.daily),
  };
}

export function migrateLegacySettingsToCalendarSet(
  settings: LegacySettings,
): CalendarSet {
  const migrateConfig = (settings: LegacySettings["daily"]) => {
    return {
      enabled: settings.enabled,
      format: settings.format || "",
      folder: settings.folder || "",
      openAtStartup: false,
      templatePath: settings.template,
    } as PeriodicConfig;
  };

  return {
    id: DEFAULT_CALENDARSET_ID,
    ctime: window.moment().format(),
    day: migrateConfig(settings.daily),
    week: migrateConfig(settings.weekly),
    month: migrateConfig(settings.monthly),
    quarter: migrateConfig(settings.quarterly),
    year: migrateConfig(settings.yearly),
  };
}

export default class CalendarSetManager {
  constructor(readonly plugin: PeriodicNotesPlugin) {}

  public getActiveId(): string {
    return get(this.plugin.settings).activeCalendarSet;
  }

  public getActiveSet(): CalendarSet {
    const settings = get(this.plugin.settings);
    const activeSet = settings.calendarSets.find(
      (set) => set.id === settings.activeCalendarSet,
    );
    if (!activeSet) {
      throw new Error("No active calendar set found");
    }
    return activeSet;
  }

  public getFormat(granularity: Granularity): string {
    const activeSet = this.getActiveSet();
    return getFormat(activeSet, granularity);
  }

  public getActiveConfig(granularity: Granularity): PeriodicConfig {
    const activeSet = this.getActiveSet();
    return getConfig(activeSet, granularity);
  }

  public getCalendarSets(): CalendarSet[] {
    return get(this.plugin.settings).calendarSets;
  }

  public getInactiveGranularities(): Granularity[] {
    const activeSet = this.getActiveSet();
    return granularities.filter(
      (granularity) => !activeSet[granularity]?.enabled,
    );
  }

  public getActiveGranularities(): Granularity[] {
    const activeSet = this.getActiveSet();
    return granularities.filter(
      (granularity) => activeSet[granularity]?.enabled,
    );
  }

  public renameCalendarset(calendarSetId: string, proposedName: string): void {
    if (calendarSetId === proposedName.trim()) {
      return;
    }

    if (proposedName.trim() === "") {
      throw new Error("Name required");
    }

    this.plugin.settings.update((settings) => {
      const existingSetWithName = settings.calendarSets.find(
        (c) => c.id === proposedName,
      );

      if (existingSetWithName) {
        throw new Error(
          `A calendar set with the name '${proposedName}' already exists`,
        );
      }

      const calendarSet = settings.calendarSets.find(
        (c) => c.id === calendarSetId,
      );
      if (calendarSet) {
        calendarSet.id = proposedName;
        if (settings.activeCalendarSet === calendarSetId) {
          settings.activeCalendarSet = proposedName;
        }
      }

      return settings;
    });
  }
}
