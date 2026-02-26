import cloneDeep from "lodash/cloneDeep";
import type { App, DailyNotesPlugin } from "obsidian";
import { DEFAULT_PERIODIC_CONFIG } from "src/constants";
import {
  type CalendarSet,
  type Granularity,
  granularities,
  type PeriodicConfig,
} from "src/types";
import { get, type Updater, type Writable } from "svelte/store";
import type { Settings } from ".";

const defaultPeriodicSettings = granularities.reduce(
  (acc, g) => {
    acc[g] = { ...DEFAULT_PERIODIC_CONFIG };
    return acc;
  },
  {} as Record<Granularity, PeriodicConfig>,
);

type DeleteFunc = (calendarSetId: string) => Updater<Settings>;
export const deleteCalendarSet: DeleteFunc = (calendarSetId: string) => {
  return (settings: Settings) => {
    const calendarSet = settings.calendarSets.find(
      (c) => c.id === calendarSetId,
    );
    if (calendarSet) {
      settings.calendarSets.remove(calendarSet);
    }

    if (calendarSetId === settings.activeCalendarSet) {
      const fallbackCalendarSet = settings.calendarSets[0].id;
      settings.activeCalendarSet = fallbackCalendarSet;
    }

    return settings;
  };
};

type CreateFunc = (
  calendarSetId: string,
  refSettings?: Partial<CalendarSet>,
) => Updater<Settings>;
export const createNewCalendarSet: CreateFunc = (
  id: string,
  refSettings?: Partial<CalendarSet>,
) => {
  return (settings: Settings) => {
    settings.calendarSets.push({
      ...cloneDeep(defaultPeriodicSettings),
      ...cloneDeep(refSettings),
      id,
      ctime: window.moment().format(),
    });
    return settings;
  };
};

type UpdateActiveFunc = (
  calendarSetId: string,
  refSettings?: Partial<CalendarSet>,
) => Updater<Settings>;
export const setActiveSet: UpdateActiveFunc = (id: string) => {
  return (settings: Settings) => {
    settings.activeCalendarSet = id;
    return settings;
  };
};

export const clearStartupNote: Updater<Settings> = (settings: Settings) => {
  for (const calendarSet of settings.calendarSets) {
    for (const granularity of granularities) {
      const config = calendarSet[granularity];
      if (config?.openAtStartup) {
        config.openAtStartup = false;
      }
    }
  }
  return settings;
};

interface StartupNoteConfig {
  calendarSet: string;
  granularity: Granularity;
}

type FindStartupNoteConfigFunc = (
  settings: Writable<Settings>,
) => StartupNoteConfig | null;
export const findStartupNoteConfig: FindStartupNoteConfigFunc = (
  settings: Writable<Settings>,
) => {
  const calendarSets = get(settings).calendarSets;
  for (const calendarSet of calendarSets) {
    for (const granularity of granularities) {
      const config = calendarSet[granularity];
      if (config?.openAtStartup) {
        return {
          calendarSet: calendarSet.id,
          granularity,
        };
      }
    }
  }

  return null;
};

export function isDailyNotesPluginEnabled(app: App): boolean {
  // private API: app.internalPlugins is undocumented
  return app.internalPlugins.getPluginById("daily-notes").enabled;
}

function getDailyNotesPlugin(app: App): DailyNotesPlugin | null {
  // private API: app.internalPlugins is undocumented
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
  // private API: app.internalPlugins is undocumented
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
