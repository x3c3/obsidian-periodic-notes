# Obsidian Periodic Notes — Code Walkthrough

*2026-02-25T07:42:32Z by Showboat 0.6.1*
<!-- showboat-id: 4dc728f5-1296-484a-a17b-1371f3d5f86d -->

## What is this plugin?

Obsidian Periodic Notes is an Obsidian plugin that creates and manages **daily, weekly, monthly, quarterly, and yearly notes**. It replaces the built-in Daily Notes plugin with a more powerful system that supports multiple time granularities and "calendar sets" — independent configurations that let you maintain separate note systems (e.g., work vs. personal).

The plugin is built with **TypeScript**, **Svelte 5**, and **Vite**. It runs inside Obsidian's plugin sandbox, extending the `Plugin` base class and interacting with the vault, workspace, and metadata cache APIs.

Let's walk through the entire codebase, starting from the foundation types and working up through the plugin lifecycle.

## File layout

Here's the project tree at a glance:

```bash
find src -type f \( -name '*.ts' -o -name '*.svelte' \) | sort
```

```output
src/cache.ts
src/calendarSetManager.ts
src/commands.ts
src/constants.ts
src/icons.ts
src/main.ts
src/modal.ts
src/obsidian.d.ts
src/parser.ts
src/settings/components/Arrow.svelte
src/settings/components/Breadcrumbs.svelte
src/settings/components/Checkmark.svelte
src/settings/components/Dropdown.svelte
src/settings/components/Footer.svelte
src/settings/components/NoteFolderSetting.svelte
src/settings/components/NoteFormatSetting.svelte
src/settings/components/NoteTemplateSetting.svelte
src/settings/components/OpenAtStartupSetting.svelte
src/settings/components/SettingItem.svelte
src/settings/components/Toggle.svelte
src/settings/index.ts
src/settings/localization.ts
src/settings/pages/Router.svelte
src/settings/pages/dashboard/Dashboard.svelte
src/settings/pages/dashboard/GettingStartedBanner.svelte
src/settings/pages/dashboard/calendarSets/MenuItem.svelte
src/settings/pages/details/Details.svelte
src/settings/pages/details/PeriodicGroup.svelte
src/settings/stores.ts
src/settings/utils.ts
src/settings/validation.ts
src/switcher/calendarSetSwitcher.ts
src/switcher/relatedFilesSwitcher.ts
src/switcher/switcher.ts
src/timeline/RelativeIcon.svelte
src/timeline/Timeline.svelte
src/timeline/manager.ts
src/types.ts
src/ui/fileSuggest.ts
src/ui/suggest.ts
src/utils.ts
```

## 1. The type foundation — `src/types.ts`

Everything starts with the `Granularity` type. This union literal defines the five time periods the plugin supports:

```bash
sed -n '1,14p' src/types.ts
```

```output
export type Granularity =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"; /*| "fiscal-year" */

export const granularities: Granularity[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year" /*", fiscal-year" */,
];
```

The `granularities` array provides an ordered list used throughout the codebase for iteration — from finest (day) to coarsest (year). This ordering matters in the cache when comparing granularities.

Each granularity has a corresponding `PeriodicConfig` that stores user preferences:

```bash
sed -n '16,23p' src/types.ts
```

```output
export interface PeriodicConfig {
  enabled: boolean;
  openAtStartup: boolean;

  format: string;
  folder: string;
  templatePath?: string;
}
```

And these configs are grouped into a `CalendarSet` — a self-contained configuration for one complete set of periodic notes:

```bash
sed -n '35,45p' src/types.ts
```

```output
export interface CalendarSet {
  id: string;
  ctime: string;

  day?: PeriodicConfig;
  week?: PeriodicConfig;
  month?: PeriodicConfig;
  quarter?: PeriodicConfig;
  year?: PeriodicConfig;
  fiscalYear?: PeriodicConfig;
}
```

Each config field within a `CalendarSet` is optional — a user might only enable daily and weekly notes, leaving the rest undefined. The `id` serves as both the display name and the key in the settings store.

## 2. Defaults and constants — `src/constants.ts`

The constants file provides sensible defaults for date formats using moment.js syntax:

```bash
cat src/constants.ts
```

```output
const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";
const DEFAULT_QUARTERLY_NOTE_FORMAT = "YYYY-[Q]Q";
const DEFAULT_YEARLY_NOTE_FORMAT = "YYYY";

export const DEFAULT_FORMAT = Object.freeze({
  day: DEFAULT_DAILY_NOTE_FORMAT,
  week: DEFAULT_WEEKLY_NOTE_FORMAT,
  month: DEFAULT_MONTHLY_NOTE_FORMAT,
  quarter: DEFAULT_QUARTERLY_NOTE_FORMAT,
  year: DEFAULT_YEARLY_NOTE_FORMAT,
});

export const DEFAULT_CALENDARSET_ID = "Default";

export const DEFAULT_PERIODIC_CONFIG = Object.freeze({
  enabled: false,
  openAtStartup: false,
  format: "",
  templatePath: "",
  folder: "",
});

export const HUMANIZE_FORMAT = Object.freeze({
  month: "MMMM YYYY",
  quarter: "YYYY Q[Q]",
  year: "YYYY",
});
```

Key things to notice:
- The weekly format uses `gggg-[W]ww` — locale-aware ISO week year. The `[W]` is a literal "W" character escaped with brackets so moment.js doesn't interpret it.
- `DEFAULT_PERIODIC_CONFIG` starts with everything disabled and blank. The plugin only creates a calendar set with `day.enabled = true` by default.
- `HUMANIZE_FORMAT` is used for display purposes in the timeline UI — showing "February 2026" instead of "2026-02".

## 3. Plugin initialization — `src/main.ts`

This is the heart of the plugin. `PeriodicNotesPlugin` extends Obsidian's `Plugin` class and orchestrates every subsystem. Let's look at the class shape first:

```bash
sed -n '49,56p' src/main.ts
```

```output
export default class PeriodicNotesPlugin extends Plugin {
  public settings!: Writable<Settings>;
  private ribbonEl!: HTMLElement | null;

  private cache!: PeriodicNotesCache;
  public calendarSetManager!: CalendarSetManager;
  private timelineManager!: TimelineManager;

```

The plugin holds three major subsystems as instance fields:
1. **`calendarSetManager`** — resolves which calendar set is active and exposes its config
2. **`cache`** — indexes every periodic note in the vault by date and granularity
3. **`timelineManager`** — injects Svelte timeline widgets into open markdown views

Notice that `settings` is a Svelte `Writable<Settings>` store, not a plain object. This is the reactive backbone — the settings UI, the cache, and the command system all respond to changes pushed through this store.

### The `onload()` boot sequence

Obsidian calls `onload()` when the plugin is enabled. Here's the full method:

```bash
sed -n '62,118p' src/main.ts
```

```output
  async onload(): Promise<void> {
    addIcon("calendar-day", calendarDayIcon);
    addIcon("calendar-week", calendarWeekIcon);
    addIcon("calendar-month", calendarMonthIcon);
    addIcon("calendar-quarter", calendarQuarterIcon);
    addIcon("calendar-year", calendarYearIcon);

    this.settings = writable<Settings>();
    await this.loadSettings();
    this.register(this.settings.subscribe(this.onUpdateSettings.bind(this)));

    initializeLocaleConfigOnce(this.app);

    this.ribbonEl = null;
    this.calendarSetManager = new CalendarSetManager(this);
    this.cache = new PeriodicNotesCache(this.app, this);
    this.timelineManager = new TimelineManager(this, this.cache);

    this.openPeriodicNote = this.openPeriodicNote.bind(this);
    this.addSettingTab(new PeriodicNotesSettingsTab(this.app, this));

    this.configureRibbonIcons();
    this.configureCommands();

    this.addCommand({
      id: "show-date-switcher",
      name: "Show date switcher...",
      checkCallback: (checking: boolean) => {
        if (!this.app.plugins.getPlugin("nldates-obsidian")) {
          return false;
        }
        if (checking) {
          return !!this.app.workspace.getMostRecentLeaf();
        }
        new NLDNavigator(this.app, this).open();
      },
      hotkeys: [],
    });

    this.addCommand({
      id: "switch-calendarset",
      name: "Switch active calendar set...",
      callback: () => {
        new CalendarSetSuggestModal(this.app, this).open();
      },
      hotkeys: [],
    });

    this.app.workspace.onLayoutReady(() => {
      const startupNoteConfig = findStartupNoteConfig(this.settings);
      if (startupNoteConfig) {
        this.openPeriodicNote(startupNoteConfig.granularity, window.moment(), {
          calendarSet: startupNoteConfig.calendarSet,
        });
      }
    });
  }
```

Step by step:

1. **Register icons** (lines 63-67): Five custom SVG calendar icons are registered with Obsidian's icon system, one per granularity. These appear in the ribbon, context menus, and the switcher UI.

2. **Create and load settings** (lines 69-71): A Svelte writable store is created, settings are loaded from disk (with legacy migration), and a subscription is registered so that every future settings change triggers `onUpdateSettings` — which persists to disk, reconfigures commands, and fires a workspace event.

3. **Initialize locale** (line 73): Configures moment.js with the user's preferred locale and week-start day. This is a one-time global operation guarded by a `window._hasConfiguredLocale` flag.

4. **Create managers** (lines 76-78): The three subsystem managers are instantiated. The `PeriodicNotesCache` constructor immediately schedules a full vault scan on `onLayoutReady`.

5. **Settings tab + ribbon + commands** (lines 81-84): The Obsidian settings tab is mounted (Svelte-powered), the ribbon icon is configured, and per-granularity commands are registered.

6. **Special commands** (lines 86-108): Two commands that don't map to a specific granularity — the NLDates date switcher (conditional on the nldates plugin being installed) and the calendar set switcher.

7. **Startup note** (lines 110-117): After the layout is ready, if any granularity has `openAtStartup: true`, that note is opened automatically.

### Settings persistence — the reactive loop

When settings change, `onUpdateSettings` fires:

```bash
sed -n '206,213p' src/main.ts
```

```output
  private async onUpdateSettings(newSettings: Settings): Promise<void> {
    await this.saveData(newSettings);
    this.configureCommands();
    this.configureRibbonIcons();

    // Integrations (i.e. Calendar Plugin) can listen for changes to settings
    this.app.workspace.trigger("periodic-notes:settings-updated");
  }
```

This creates a reactive loop: Svelte components mutate the writable store → the subscription fires → settings are saved to disk, commands are re-registered, the ribbon is refreshed, and the custom `periodic-notes:settings-updated` workspace event is triggered. The cache listens for that event and resets itself. External plugins like Obsidian Calendar can also listen to this event for integration.

## 4. Calendar set management — `src/calendarSetManager.ts`

The `CalendarSetManager` is the single authority on "which calendar set is active" and "what is enabled within it". It wraps the settings store and provides clean accessor methods:

```bash
sed -n '89,133p' src/calendarSetManager.ts
```

```output
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
```

Notice it uses Svelte's `get()` to synchronously read from the writable store. Every call goes straight to the current settings — there's no caching layer here, which keeps things simple and guarantees freshness.

The split between `getActiveGranularities()` and `getInactiveGranularities()` is used by the command system: active granularities get commands registered, inactive ones get their commands removed.

### Legacy migration

The file also handles migration from older plugin versions. The plugin originally stored settings in a flat structure with `daily`, `weekly`, etc. top-level keys. The migration functions detect and convert these:

```bash
sed -n '32,43p' src/calendarSetManager.ts
```

```output
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
```

And in `loadSettings()` back in `main.ts`, the migration logic runs during boot if no calendar sets exist:

```bash
sed -n '170,204p' src/main.ts
```

```output
  async loadSettings(): Promise<void> {
    const savedSettings = await this.loadData();
    const settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});
    this.settings.set(settings);

    if (!settings.calendarSets || settings.calendarSets.length === 0) {
      // check for migration
      if (isLegacySettings(settings)) {
        this.settings.update(
          createNewCalendarSet(
            DEFAULT_CALENDARSET_ID,
            migrateLegacySettingsToCalendarSet(settings),
          ),
        );
      } else if (hasLegacyDailyNoteSettings(this.app)) {
        this.settings.update(
          createNewCalendarSet(
            DEFAULT_CALENDARSET_ID,
            migrateDailyNoteSettings(settings),
          ),
        );
      } else {
        // otherwise create new default calendar set
        this.settings.update(
          createNewCalendarSet(DEFAULT_CALENDARSET_ID, {
            day: {
              ...DEFAULT_PERIODIC_CONFIG,
              enabled: true,
            },
          }),
        );
      }
      this.settings.update(setActiveSet(DEFAULT_CALENDARSET_ID));
    }
  }
```

Three paths:
1. **Legacy periodic-notes settings** → Convert the old flat `daily/weekly/monthly/quarterly/yearly` format into a calendar set
2. **Legacy built-in Daily Notes plugin settings** → Import format, folder, and template from Obsidian's own daily notes plugin
3. **Fresh install** → Create a "Default" calendar set with only daily notes enabled

The `createNewCalendarSet` and `setActiveSet` functions from `settings/utils.ts` are Svelte store updaters — they return functions that take the current settings and return modified settings. This pattern works seamlessly with `store.update()`.

## 5. The cache — `src/cache.ts`

The cache is the most complex subsystem. It indexes every file in the vault that looks like a periodic note, mapping file paths to dates, granularities, and match metadata.

### Data structure

```bash
sed -n '42,51p' src/cache.ts
```

```output
export interface PeriodicNoteCachedMetadata {
  calendarSet: string;
  filePath: string;
  date: Moment;
  granularity: Granularity;
  canonicalDateStr: string;

  /* "how" the match was made */
  matchData: PeriodicNoteMatchData;
}
```

The cache is a two-level `Map`: `calendarSetId → (filePath → metadata)`. Each entry records not just the date and granularity, but *how* the match was made — via filename, frontmatter, or loose parsing — and whether it was an exact match. This distinction matters: only exact matches are returned by `getPeriodicNote()`, while loose matches show up in broader queries.

### Initialization

On layout ready, the cache scans every file under each enabled granularity's configured folder:

```bash
sed -n '99,135p' src/cache.ts
```

```output
  public initialize(): void {
    const memoizedRecurseChildren = memoize(
      (rootFolder: TFolder, cb: (file: TAbstractFile) => void) => {
        if (!rootFolder) return;
        for (const c of rootFolder.children) {
          if (c instanceof TFile) {
            cb(c);
          } else if (c instanceof TFolder) {
            memoizedRecurseChildren(c, cb);
          }
        }
      },
    );

    for (const calendarSet of this.plugin.calendarSetManager.getCalendarSets()) {
      const activeGranularities = granularities.filter(
        (g) => calendarSet[g]?.enabled,
      );
      for (const granularity of activeGranularities) {
        const config = calendarSet[granularity] as PeriodicConfig;
        const rootFolder = this.app.vault.getAbstractFileByPath(
          config.folder || "/",
        ) as TFolder;

        // Scan for filename matches
        memoizedRecurseChildren(rootFolder, (file: TAbstractFile) => {
          if (file instanceof TFile) {
            this.resolve(file, "initialize");
            const metadata = this.app.metadataCache.getFileCache(file);
            if (metadata) {
              this.resolveChangedMetadata(file, "", metadata);
            }
          }
        });
      }
    }
  }
```

The `memoizedRecurseChildren` helper walks folder trees, using lodash's `memoize` to avoid scanning the same folder twice when multiple granularities share a folder. For each file, two resolution passes are made: `resolve()` for filename matching, and `resolveChangedMetadata()` for frontmatter matching.

### The resolve pipeline — filename matching

The main `resolve()` method is where filenames are matched against configured date formats:

```bash
sed -n '199,281p' src/cache.ts
```

```output
  private resolve(
    file: TFile,
    reason: "create" | "rename" | "initialize" = "create",
  ): void {
    const manager = this.plugin.calendarSetManager;

    // Check if file matches any calendar set
    calendarsets: for (const calendarSet of manager.getCalendarSets()) {
      const activeGranularities = granularities.filter(
        (g) => calendarSet[g]?.enabled,
      );
      if (activeGranularities.length === 0) continue;

      // 'frontmatter' entries should supercede 'filename'
      const existingEntry = this.cachedFiles
        .get(calendarSet.id)
        ?.get(file.path);
      if (
        existingEntry &&
        existingEntry.matchData.matchType === "frontmatter"
      ) {
        continue;
      }

      for (const granularity of activeGranularities) {
        const folder = calendarSet[granularity]?.folder || "";
        if (!file.path.startsWith(folder)) continue;

        const formats = getPossibleFormats(calendarSet, granularity);
        const dateInputStr = getDateInput(file, formats[0], granularity);
        const date = window.moment(dateInputStr, formats, true);
        if (date.isValid()) {
          const metadata = {
            calendarSet: calendarSet.id,
            filePath: file.path,
            date,
            granularity,
            canonicalDateStr: getCanonicalDateString(granularity, date),
            matchData: {
              exact: true,
              matchType: "filename",
            },
          } as PeriodicNoteCachedMetadata;
          this.set(calendarSet.id, file.path, metadata);

          if (reason === "create" && file.stat.size === 0) {
            applyPeriodicTemplateToFile(this.app, file, calendarSet, metadata);
          }

          this.app.workspace.trigger(
            "periodic-notes:resolve",
            granularity,
            file,
          );
          continue calendarsets;
        }
      }

      const nonStrictDate = getLooselyMatchedDate(file.basename);
      if (nonStrictDate) {
        this.set(calendarSet.id, file.path, {
          calendarSet: calendarSet.id,
          filePath: file.path,
          date: nonStrictDate.date,
          granularity: nonStrictDate.granularity,
          canonicalDateStr: getCanonicalDateString(
            nonStrictDate.granularity,
            nonStrictDate.date,
          ),
          matchData: {
            exact: false,
            matchType: "filename",
          },
        });

        this.app.workspace.trigger(
          "periodic-notes:resolve",
          nonStrictDate.granularity,
          file,
        );
      }
    }
  }
```

This is a three-tier matching strategy:

1. **Frontmatter priority**: If a file already has a frontmatter-based match, the filename matcher skips it. Frontmatter always wins.

2. **Strict format match** (line 230): `moment(dateInputStr, formats, true)` — the `true` means strict parsing. The date string must match the configured format exactly. `getPossibleFormats()` returns both the full format (e.g. `YYYY/YYYY-MM-DD`) and the basename-only format (`YYYY-MM-DD`) to handle files that were moved out of their date-based subdirectory. On match, the entry is marked `exact: true`.

3. **Loose fallback** (line 257): If no strict match is found, `getLooselyMatchedDate()` tries regex-based extraction. These entries are marked `exact: false` and won't be returned by `getPeriodicNote()` — they're "related files" that happen to contain a date.

A notable detail: when a file is newly created (`reason === 'create'`) and is empty (`file.stat.size === 0`), the cache automatically applies the template. This handles the case where another plugin (or the user via file explorer) creates an empty file with a matching name.

### Event-driven updates

The cache stays fresh by listening to four events:

```bash
sed -n '71,91p' src/cache.ts
```

```output
    this.app.workspace.onLayoutReady(() => {
      console.info("[Periodic Notes] initializing cache");
      this.initialize();
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          if (file instanceof TFile) this.resolve(file, "create");
        }),
      );
      this.registerEvent(this.app.vault.on("rename", this.resolveRename, this));
      this.registerEvent(
        this.app.metadataCache.on("changed", this.resolveChangedMetadata, this),
      );
      this.registerEvent(
        this.app.workspace.on(
          "periodic-notes:settings-updated",
          this.reset,
          this,
        ),
      );
    });
  }
```

- **`vault.create`** → run `resolve()` on the new file
- **`vault.rename`** → delete old path from cache, re-resolve with new path
- **`metadataCache.changed`** → check if frontmatter now declares a periodic note type
- **`periodic-notes:settings-updated`** → full cache reset (clear + reinitialize)

### Querying the cache

The cache exposes several query methods. The most important one is `getPeriodicNote()`:

```bash
sed -n '291,310p' src/cache.ts
```

```output
  public getPeriodicNote(
    calendarSet: string,
    granularity: Granularity,
    targetDate: Moment,
  ): TFile | null {
    const metadata = this.cachedFiles.get(calendarSet);
    if (metadata) {
      for (const [filePath, cacheData] of metadata) {
        if (
          cacheData.granularity === granularity &&
          cacheData.matchData.exact === true &&
          cacheData.date.isSame(targetDate, granularity)
        ) {
          return this.app.vault.getAbstractFileByPath(filePath) as TFile;
        }
      }
    }

    return null;
  }
```

Notice the three-way filter: it must match the granularity, be an exact match (`matchData.exact === true`), and the date must be the same at the given granularity level. That last check uses moment's `isSame(date, granularity)` — so for a weekly note, any date within the same week will match.

The `findAdjacent()` method is used for the "jump to next/previous note" commands:

```bash
sed -n '404,425p' src/cache.ts
```

```output
  public findAdjacent(
    calendarSet: string,
    filePath: string,
    direction: "forwards" | "backwards",
  ): PeriodicNoteCachedMetadata | null {
    const currMetadata = this.find(filePath, calendarSet);
    if (!currMetadata) return null;

    const granularity = currMetadata.granularity;
    const cache = this.cachedFiles.get(calendarSet)?.values() ?? [];

    const sortedCache = sortBy(
      Array.from(cache).filter((m) => m.granularity === granularity),
      ["canonicalDateStr"],
    );
    const activeNoteIndex = sortedCache.findIndex(
      (m) => m.filePath === filePath,
    );

    const offset = direction === "forwards" ? 1 : -1;
    return sortedCache[activeNoteIndex + offset];
  }
```

It filters to the same granularity, sorts by `canonicalDateStr` (which is an ISO string, so lexicographic sorting = chronological sorting), finds the current file's position, and returns the neighbor. Simple and elegant.

## 6. Date parsing and matching — `src/parser.ts` and `src/settings/validation.ts`

### Loose matching — the fallback parser

When a filename doesn't match any configured format, the parser tries regex-based extraction:

```bash
cat src/parser.ts
```

```output
import type { Moment } from "moment";

import type { Granularity } from "./types";

interface ParseData {
  granularity: Granularity;
  date: Moment;
}

// TODO rename these to remove 'prefix'
const FULL_DATE_PREFIX =
  /(\d{4})[-.]?(0[1-9]|1[0-2])[-.]?(0[1-9]|[12][0-9]|3[01])/;
const MONTH_PREFIX = /(\d{4})[-.]?(0[1-9]|1[0-2])/;
// const WEEK_PREFIX = /(\d{4})[-. ]?W(\d{2})/;
const YEAR_PREFIX = /(\d{4})/;

export function getLooselyMatchedDate(inputStr: string): ParseData | null {
  // TODO: include 'unparsed characters' in match data
  // to show what _isn't_ a date/timestamp
  const fullDateExp = FULL_DATE_PREFIX.exec(inputStr);
  if (fullDateExp) {
    return {
      date: window.moment({
        day: Number(fullDateExp[3]),
        month: Number(fullDateExp[2]) - 1,
        year: Number(fullDateExp[1]),
      }),
      granularity: "day",
    };
  }

  const monthDateExp = MONTH_PREFIX.exec(inputStr);
  if (monthDateExp) {
    return {
      date: window.moment({
        day: 1,
        month: Number(monthDateExp[2]) - 1,
        year: Number(monthDateExp[1]),
      }),
      granularity: "month",
    };
  }

  // TODO: This should probably _always_ be ISO, but that could cause issues for
  // users not using ISO.

  // const weekDateExp = WEEK_PREFIX.exec(inputStr);
  // if (weekDateExp) {
  //   return {
  //     date: window.moment({
  //       week: Number(weekDateExp[2]),
  //       year: Number(weekDateExp[1]),
  //     }),
  //     granularity: "month",
  //   };
  // }

  const yearExp = YEAR_PREFIX.exec(inputStr);
  if (yearExp) {
    return {
      date: window.moment({
        day: 1,
        month: 0,
        year: Number(yearExp[1]),
      }),
      granularity: "year",
    };
  }

  return null;
}
```

The matching cascade is deliberate — most-specific first:
1. `YYYY-MM-DD` (or `YYYY.MM.DD`) → day
2. `YYYY-MM` → month
3. `YYYY` → year

Week matching is commented out with a TODO — the author notes that ISO vs locale week numbers make this ambiguous.

Note how `month` is zero-indexed when constructing the moment object (`Number(fullDateExp[2]) - 1`), matching JavaScript/moment convention.

### Format validation

The validation module in `src/settings/validation.ts` ensures user-provided formats are sane:

```bash
sed -n '35,86p' src/settings/validation.ts
```

```output
export function validateFormat(
  format: string,
  granularity: Granularity,
): string {
  if (!format) {
    return "";
  }

  if (!isValidFilename(format)) {
    return "Format contains illegal characters";
  }

  if (granularity === "day") {
    const testFormattedDate = window.moment().format(format);
    const parsedDate = window.moment(testFormattedDate, format, true);

    if (!parsedDate.isValid()) {
      return "Failed to parse format";
    }
  }

  return "";
}

export function validateFormatComplexity(
  format: string,
  granularity: Granularity,
): "valid" | "fragile-basename" | "loose-parsing" {
  const testFormattedDate = window.moment().format(format);
  const parsedDate = window.moment(testFormattedDate, format, true);
  if (!parsedDate.isValid()) {
    return "loose-parsing";
  }

  const strippedFormat = removeEscapedCharacters(format);
  if (strippedFormat.includes("/")) {
    if (
      granularity === "day" &&
      !["m", "d", "y"].every(
        (requiredChar) =>
          getBasename(format)
            .replace(/\[[^\]]*\]/g, "") // remove everything within brackets
            .toLowerCase()
            .indexOf(requiredChar) !== -1,
      )
    ) {
      return "fragile-basename";
    }
  }

  return "valid";
}
```

`validateFormat` performs a round-trip test: format today's date with the format string, then parse it back. If the result is invalid, the format is broken.

`validateFormatComplexity` detects "fragile" formats. Consider `YYYY/YYYY-MM-DD` — the basename is `YYYY-MM-DD`, which contains year, month, and day, so it's fine. But `YYYY/MM/DD` has basename `DD`, which is just a day number — not enough to reconstruct the full date. This is flagged as `fragile-basename` and the user gets a warning.

## 7. Template system — `src/utils.ts`

When a periodic note is created, its content comes from a user-specified template file. The template engine is simple but powerful — it replaces `{{variable}}` placeholders with formatted dates.

### Note creation flow

First, the plugin builds the file path and loads the template:

```bash
sed -n '215,265p' src/main.ts
```

```output
  public async createPeriodicNote(
    granularity: Granularity,
    date: Moment,
  ): Promise<TFile> {
    const config = this.calendarSetManager.getActiveConfig(granularity);
    const format = this.calendarSetManager.getFormat(granularity);
    const filename = date.format(format);
    const templateContents = await getTemplateContents(
      this.app,
      config.templatePath,
    );
    const renderedContents = applyTemplateTransformations(
      filename,
      granularity,
      date,
      format,
      templateContents,
    );
    const destPath = await getNoteCreationPath(this.app, filename, config);
    return this.app.vault.create(destPath, renderedContents);
  }

  public getPeriodicNote(granularity: Granularity, date: Moment): TFile | null {
    return this.cache.getPeriodicNote(
      this.calendarSetManager.getActiveId(),
      granularity,
      date,
    );
  }

  // TODO: What API do I want for this?
  public getPeriodicNotes(
    granularity: Granularity,
    date: Moment,
    includeFinerGranularities = false,
  ): PeriodicNoteCachedMetadata[] {
    return this.cache.getPeriodicNotes(
      this.calendarSetManager.getActiveId(),
      granularity,
      date,
      includeFinerGranularities,
    );
  }

  public isPeriodic(filePath: string, granularity?: Granularity): boolean {
    return this.cache.isPeriodic(filePath, granularity);
  }

  public findAdjacent(
    calendarSet: string,
    filePath: string,
```

The flow is: get config → format the date as a filename → load template → transform template → build file path (ensuring parent folders exist) → create the file.

### Template transformations

The `applyTemplateTransformations()` function handles all the variable replacement. Universal variables come first:

```bash
sed -n '49,61p' src/utils.ts
```

```output
export function applyTemplateTransformations(
  filename: string,
  granularity: Granularity,
  date: Moment,
  format: string,
  rawTemplateContents: string,
): string {
  let templateContents = rawTemplateContents;

  templateContents = rawTemplateContents
    .replace(/{{\s*date\s*}}/gi, filename)
    .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"))
    .replace(/{{\s*title\s*}}/gi, filename);
```

Three universal variables: `{{date}}` and `{{title}}` both resolve to the filename (the formatted date), while `{{time}}` gives the current time. The regex uses `\s*` to allow optional whitespace inside the braces and `gi` for case-insensitive global replacement.

Then come granularity-specific transformations. The daily note handler is the most complex:

```bash
sed -n '63,89p' src/utils.ts
```

```output
  if (granularity === "day") {
    templateContents = templateContents
      .replace(
        /{{\s*yesterday\s*}}/gi,
        date.clone().subtract(1, "day").format(format),
      )
      .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "d").format(format))
      .replace(
        /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
        (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
          const now = window.moment();
          const currentDate = date.clone().set({
            hour: now.get("hour"),
            minute: now.get("minute"),
            second: now.get("second"),
          });
          if (calc) {
            currentDate.add(parseInt(timeDelta, 10), unit);
          }

          if (momentFormat) {
            return currentDate.format(momentFormat.substring(1).trim());
          }
          return currentDate.format(format);
        },
      );
  }
```

Daily notes get:
- `{{yesterday}}` and `{{tomorrow}}` — simple date math formatted with the same format as the filename
- `{{date +5d:MMMM DD}}` — a powerful relative-date syntax. The regex captures an optional offset (`+5d`, `-3w`, etc.) and an optional format after the colon. If no format is given, it uses the note's own format. This lets templates create cross-links like `[[{{date +1d}}]]` to link to tomorrow's note.

Weekly notes get day-of-week expansion:

```bash
sed -n '91,99p' src/utils.ts
```

```output
  if (granularity === "week") {
    templateContents = templateContents.replace(
      /{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi,
      (_, dayOfWeek, momentFormat) => {
        const day = getDayOfWeekNumericalValue(dayOfWeek);
        return date.weekday(day).format(momentFormat.trim());
      },
    );
  }
```

`{{monday:YYYY-MM-DD}}` expands to the Monday of that week, formatted however you like. This is locale-aware — `getDayOfWeekNumericalValue` respects the configured week start day.

Monthly, quarterly, and yearly notes all follow the same pattern as daily notes but with their respective period boundaries (`startOf('month')`, `startOf('quarter')`, `startOf('year')`).

### Path construction

```bash
sed -n '267,315p' src/utils.ts
```

```output
export async function getNoteCreationPath(
  app: App,
  filename: string,
  periodicConfig: PeriodicConfig,
): Promise<string> {
  const directory = periodicConfig.folder ?? "";
  const filenameWithExt = !filename.endsWith(".md")
    ? `${filename}.md`
    : filename;

  const path = normalizePath(join(directory, filenameWithExt));
  await ensureFolderExists(app, path);
  return path;
}

// Credit: @creationix/path.js
export function join(...partSegments: string[]): string {
  // Split the inputs into a list of path commands.
  let parts: string[] = [];
  for (let i = 0, l = partSegments.length; i < l; i++) {
    parts = parts.concat(partSegments[i].split("/"));
  }
  // Interpret the path commands to get the new resolved path.
  const newParts = [];
  for (let i = 0, l = parts.length; i < l; i++) {
    const part = parts[i];
    // Remove leading and trailing slashes
    // Also remove "." segments
    if (!part || part === ".") continue;
    // Push new path segments.
    else newParts.push(part);
  }
  // Preserve the initial slash if there was one.
  if (parts[0] === "") newParts.unshift("");
  // Turn back into a single string path.
  return newParts.join("/");
}

async function ensureFolderExists(app: App, path: string): Promise<void> {
  const dirs = path.replace(/\\/g, "/").split("/");
  dirs.pop(); // remove basename

  if (dirs.length) {
    const dir = join(...dirs);
    if (!app.vault.getAbstractFileByPath(dir)) {
      await app.vault.createFolder(dir);
    }
  }
}
```

The plugin bundles its own `join()` implementation (credited to `@creationix/path.js`) rather than using Node's `path.join`, because Obsidian plugins run in a browser-like environment where Node modules aren't available. The `ensureFolderExists` helper creates missing parent directories before creating the note — so a format like `YYYY/YYYY-MM-DD` will automatically create the year subfolder.

## 8. Commands and navigation — `src/commands.ts`

The command system generates five commands for each enabled granularity. First, the display configuration map:

```bash
sed -n '12,38p' src/commands.ts
```

```output
export const displayConfigs: Record<Granularity, DisplayConfig> = {
  day: {
    periodicity: "daily",
    relativeUnit: "today",
    labelOpenPresent: "Open today's daily note",
  },
  week: {
    periodicity: "weekly",
    relativeUnit: "this week",
    labelOpenPresent: "Open this week's note",
  },
  month: {
    periodicity: "monthly",
    relativeUnit: "this month",
    labelOpenPresent: "Open this month's note",
  },
  quarter: {
    periodicity: "quarterly",
    relativeUnit: "this quarter",
    labelOpenPresent: "Open this quarter's note",
  },
  year: {
    periodicity: "yearly",
    relativeUnit: "this year",
    labelOpenPresent: "Open this year's note",
  },
};
```

This maps each granularity to human-readable labels. The `periodicity` string is used in command IDs (`open-daily-note`, `next-weekly-note`, etc.), and `labelOpenPresent` is the command palette text.

### Command generation

```bash
sed -n '90,153p' src/commands.ts
```

```output
export function getCommands(
  app: App,
  plugin: PeriodicNotesPlugin,
  granularity: Granularity,
): Command[] {
  const config = displayConfigs[granularity];

  return [
    {
      id: `open-${config.periodicity}-note`,
      name: config.labelOpenPresent,
      callback: () => plugin.openPeriodicNote(granularity, window.moment()),
    },

    {
      id: `next-${config.periodicity}-note`,
      name: `Jump forwards to closest ${config.periodicity} note`,
      checkCallback: (checking: boolean) => {
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        jumpToAdjacentNote(app, plugin, "forwards");
      },
    },
    {
      id: `prev-${config.periodicity}-note`,
      name: `Jump backwards to closest ${config.periodicity} note`,
      checkCallback: (checking: boolean) => {
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        jumpToAdjacentNote(app, plugin, "backwards");
      },
    },
    {
      id: `open-next-${config.periodicity}-note`,
      name: `Open next ${config.periodicity} note`,
      checkCallback: (checking: boolean) => {
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        openAdjacentNote(app, plugin, "forwards");
      },
    },
    {
      id: `open-prev-${config.periodicity}-note`,
      name: `Open previous ${config.periodicity} note`,
      checkCallback: (checking: boolean) => {
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        openAdjacentNote(app, plugin, "backwards");
      },
    },
  ];
}
```

Five commands per granularity:

| Command | Behavior |
|---------|----------|
| `open-{periodicity}-note` | Opens the note for the current period (today, this week, etc.). Creates it if missing. |
| `next-{periodicity}-note` | Jumps to the chronologically next *existing* note in the cache. |
| `prev-{periodicity}-note` | Jumps to the chronologically previous *existing* note. |
| `open-next-{periodicity}-note` | Opens (or creates) the note for the *next* period. |
| `open-prev-{periodicity}-note` | Opens (or creates) the note for the *previous* period. |

The jump commands use `checkCallback` — Obsidian's way of conditionally enabling commands. When `checking` is true, it returns whether the command should be available (only when viewing a periodic note of the matching granularity). When `checking` is false, it executes.

There's a subtle but important distinction between "jump" and "open" adjacent: **jump** navigates to an existing note found via `cache.findAdjacent()`, while **open** computes the next date via `date.add(1, granularity)` and calls `openPeriodicNote()` which will create the file if needed.

### The openPeriodicNote flow — tying it all together

This is the central method that every command, ribbon click, and startup hook funnels through:

```bash
sed -n '275,294p' src/main.ts
```

```output
  public async openPeriodicNote(
    granularity: Granularity,
    date: Moment,
    opts?: OpenOpts,
  ): Promise<void> {
    const { inNewSplit = false, calendarSet } = opts ?? {};
    const { workspace } = this.app;
    let file = this.cache.getPeriodicNote(
      calendarSet ?? this.calendarSetManager.getActiveId(),
      granularity,
      date,
    );
    if (!file) {
      file = await this.createPeriodicNote(granularity, date);
    }

    const leaf = inNewSplit ? workspace.getLeaf("split") : workspace.getLeaf();
    await leaf.openFile(file, { active: true });
  }
}
```

The flow is beautifully simple:
1. Check the cache for an existing note matching this granularity and date
2. If not found, create one (format date → load template → transform → write file)
3. Open the file in the current leaf, or a new split if requested

The `inNewSplit` option is triggered when the user holds Ctrl/Cmd while clicking the ribbon icon or pressing Enter in the switcher.

### Context menu — `src/modal.ts`

```bash
cat src/modal.ts
```

```output
import { type App, Menu, type Point } from "obsidian";
import { displayConfigs } from "./commands";
import type PeriodicNotesPlugin from "./main";

export function showFileMenu(
  _app: App,
  plugin: PeriodicNotesPlugin,
  position: Point,
): void {
  const contextMenu = new Menu();

  plugin.calendarSetManager.getActiveGranularities().forEach((granularity) => {
    const config = displayConfigs[granularity];
    contextMenu.addItem((item) =>
      item
        .setTitle(config.labelOpenPresent)
        .setIcon(`calendar-${granularity}`)
        .onClick(() => {
          plugin.openPeriodicNote(granularity, window.moment());
        }),
    );
  });

  contextMenu.showAtPosition(position);
}
```

Right-clicking the ribbon icon builds a context menu with one entry per active granularity, each using the corresponding calendar icon. Clicking any item opens that period's note for today.

## 9. The switcher — `src/switcher/`

The switcher provides a fuzzy-search modal for navigating to periodic notes by natural language date expressions. It requires the `nldates-obsidian` plugin to be installed.

### NLDNavigator — `src/switcher/switcher.ts`

This extends Obsidian's `SuggestModal` to create a date-aware note picker:

```bash
sed -n '23,54p' src/switcher/switcher.ts
```

```output
export class NLDNavigator extends SuggestModal<DateNavigationItem> {
  private nlDatesPlugin: NLDatesPlugin;

  constructor(
    readonly app: App,
    readonly plugin: PeriodicNotesPlugin,
  ) {
    super(app);

    this.setInstructions(DEFAULT_INSTRUCTIONS);
    this.setPlaceholder("Type date to find related notes");

    this.nlDatesPlugin = app.plugins.getPlugin(
      "nldates-obsidian",
    ) as NLDatesPlugin;

    this.scope.register(["Meta"], "Enter", (evt: KeyboardEvent) => {
      // @ts-expect-error this.chooser exists but is not exposed
      this.chooser.useSelectedItem(evt);
    });

    this.scope.register([], "Tab", (evt: KeyboardEvent) => {
      evt.preventDefault();
      this.close();
      new RelatedFilesSwitcher(
        this.app,
        this.plugin,
        this.getSelectedItem(),
        this.inputEl.value,
      ).open();
    });
  }
```

Key interactions:
- **Enter** opens the selected note (creating it if needed)
- **Cmd/Ctrl+Enter** opens in a new split pane
- **Tab** switches to the `RelatedFilesSwitcher`, passing the currently selected date

### Suggestion generation

The `getSuggestions` method provides three tiers of suggestions:

```bash
sed -n '100,112p' src/switcher/switcher.ts
```

```output
  getSuggestions(query: string): DateNavigationItem[] {
    const dateInQuery = this.nlDatesPlugin.parseDate(query);
    const quickSuggestions = this.getDateSuggestions(query);

    if (quickSuggestions.length) {
      return quickSuggestions;
    }

    if (dateInQuery.moment.isValid()) {
      return this.getPeriodicNotesFromQuery(query, dateInQuery.moment);
    }
    return [];
  }
```

1. **Quick suggestions** come first — these handle common patterns like "today", "yesterday", "next week", "in 5 days", etc. by building a predefined list filtered by the query. They are generated *without* calling the NLDates parser.

2. **NLDates parsing** is the fallback for anything more complex — "February 14th", "last Tuesday of March", etc. The NLDates plugin parses the natural language and returns a moment object.

The suggestion list is filtered to only include granularities that are actually enabled in the active calendar set. The rendering distinguishes between existing notes (shown with a calendar icon) and new notes (shown with a "+" icon and the path where the file will be created).

### RelatedFilesSwitcher

When you press Tab in the NLDNavigator, the `RelatedFilesSwitcher` opens. It shows files that are *loosely* date-matched (i.e. `exact: false` in the cache) — files that contain a date in their name but don't match the configured format exactly. Think of notes like "2024-01-15 Meeting with Client.md" that aren't proper daily notes but are related to that day.

```bash
sed -n '62,82p' src/switcher/relatedFilesSwitcher.ts
```

```output
  private getDatePrefixedNotes(
    item: DateNavigationItem,
    query: string,
  ): DateNavigationItem[] {
    return this.plugin
      .getPeriodicNotes(
        item.granularity,
        item.date,
        this.includeFinerGranularities,
      )
      .filter((e) => e.matchData.exact === false)
      .filter((e) =>
        e.filePath.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
      .map((e) => ({
        label: e.filePath,
        date: e.date,
        granularity: e.granularity,
        matchData: e.matchData,
      }));
  }
```

The `Shift+*` toggle controls `includeFinerGranularities` — when viewing a month, toggling "Expanded" mode also shows daily notes within that month. Tab switches back to the NLDNavigator, preserving the original search query.

### CalendarSetSuggestModal

The simplest switcher — a fuzzy search over calendar set names:

```bash
cat src/switcher/calendarSetSwitcher.ts
```

```output
import { type App, type FuzzyMatch, FuzzySuggestModal } from "obsidian";
import type PeriodicNotesPlugin from "src/main";
import { setActiveSet } from "src/settings/utils";
import type { CalendarSet } from "src/types";

export class CalendarSetSuggestModal extends FuzzySuggestModal<CalendarSet> {
  constructor(
    app: App,
    readonly plugin: PeriodicNotesPlugin,
  ) {
    super(app);
  }

  getItemText(item: CalendarSet): string {
    return item.toString();
  }

  getItems(): CalendarSet[] {
    return this.plugin.calendarSetManager.getCalendarSets();
  }

  renderSuggestion(calendarSet: FuzzyMatch<CalendarSet>, el: HTMLElement) {
    el.createDiv({ text: calendarSet.item.id });
  }

  async onChooseItem(
    item: CalendarSet,
    _evt: MouseEvent | KeyboardEvent,
  ): Promise<void> {
    this.plugin.settings.update(setActiveSet(item.id));
  }
}
```

Selecting a calendar set updates the settings store, which triggers the full reactive cascade: settings save → commands reconfigure → ribbon updates → cache resets.

## 10. Timeline UI — `src/timeline/`

The timeline is a small Svelte widget injected into the top-right corner of markdown views when you're viewing a periodic note.

### TimelineManager — `src/timeline/manager.ts`

```bash
cat src/timeline/manager.ts
```

```output
import { MarkdownView } from "obsidian";
import type { PeriodicNotesCache } from "src/cache";
import type PeriodicNotesPlugin from "src/main";
import { mount, unmount } from "svelte";

import Timeline from "./Timeline.svelte";

interface MountedTimeline {
  component: Record<string, unknown>;
  target: HTMLElement;
}

export default class TimelineManager {
  private timelines: MountedTimeline[];

  constructor(
    readonly plugin: PeriodicNotesPlugin,
    readonly cache: PeriodicNotesCache,
  ) {
    this.timelines = [];

    this.plugin.app.workspace.onLayoutReady(() => {
      plugin.registerEvent(
        plugin.app.workspace.on("layout-change", this.onLayoutChange, this),
      );
      this.onLayoutChange();
    });
  }

  public cleanup() {
    for (const entry of this.timelines) {
      unmount(entry.component);
    }
  }

  private onLayoutChange(): void {
    const openViews: MarkdownView[] = [];
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        openViews.push(leaf.view);
      }
    });

    const openContainers = openViews.map((view) => view.containerEl);
    this.timelines = this.timelines.filter((entry) => {
      if (!openContainers.includes(entry.target)) {
        unmount(entry.component);
        return false;
      }
      return true;
    });

    for (const view of openViews) {
      const existing = this.timelines.find(
        (entry) => entry.target === view.containerEl,
      );
      if (!existing) {
        const component = mount(Timeline, {
          target: view.containerEl,
          props: {
            plugin: this.plugin,
            cache: this.cache,
            view,
          },
        });
        this.timelines.push({ component, target: view.containerEl });
      }
    }
  }
}
```

The `TimelineManager` uses a reconciliation approach on every `layout-change` event:

1. **Collect** all open `MarkdownView` instances
2. **Prune** — unmount and remove any timeline whose container is no longer in the open views
3. **Create** — mount a new `Timeline` Svelte component for any open view that doesn't have one yet

This is essentially a manual implementation of what a framework like React would do with a keyed list — diff the current state against the desired state and apply minimal changes. Svelte 5's `mount()` and `unmount()` are used directly (not the component-mount syntax from Svelte 4), reflecting the Svelte 5 migration.

The Timeline component itself receives the `plugin`, `cache`, and `view` as props, giving it everything it needs to determine if the current file is a periodic note and to render navigation controls.

```bash
sed -n '16,54p' src/timeline/Timeline.svelte
```

```output
  let { plugin, cache, view }: {
    plugin: PeriodicNotesPlugin;
    cache: PeriodicNotesCache;
    view: MarkdownView;
  } = $props();

  let showTimeline = $state(false);
  let weekDays = $state<Moment[]>([]);
  let today = window.moment();
  let periodicData = $state<PeriodicNoteCachedMetadata | null>(null);
  let relativeDataStr = $state("");

  let settings = $derived(plugin.settings);
  let showComplication = $state($settings.enableTimelineComplication);

  function updateView() {
    periodicData = cache.find(view.file?.path);

    if (periodicData) {
      weekDays = generateWeekdays(today, periodicData.date);
      relativeDataStr = getRelativeDate(
        periodicData.granularity,
        periodicData.date,
      );
    }
  }

  updateView();

  function generateWeekdays(_today: Moment, selectedDate: Moment) {
    let days: Moment[] = [];
    let startOfWeek = selectedDate.clone().startOf("week");
    let dayIter = startOfWeek.clone();
    for (let i = 0; i < 7; i++) {
      days.push(dayIter.clone());
      dayIter = dayIter.add(1, "day");
    }
    return days;
  }
```

The Timeline component uses Svelte 5 runes (`$props()`, `$state()`, `$derived()`). On mount, it looks up the current file in the cache. If it's a periodic note, it:

1. Generates the 7 weekdays surrounding the note's date
2. Computes a human-readable relative date string ("Today", "Last week", "February 2026", etc.)

The template renders a clickable pill showing the relative date. Clicking toggles the week view, which shows a 7-day grid with selectable day circles. Clicking a day calls `openPeriodicNoteInView()`, which opens (or creates) that day's note in the *same leaf* — an important detail for the timeline to keep working within the same view.

The component listens for three workspace events via `onMount`:
- `file-open` → update the view when the user switches files
- `periodic-notes:resolve` → update when a file is newly indexed
- `periodic-notes:settings-updated` → show/hide based on the toggle setting

## 11. Settings UI — `src/settings/`

The settings UI is a multi-page Svelte application embedded in Obsidian's settings panel.

### The Settings interface and tab

```bash
sed -n '9,34p' src/settings/index.ts
```

```output
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
```

The `PeriodicNotesSettingsTab` extends Obsidian's `PluginSettingTab` and bridges the Obsidian settings system to Svelte:

```bash
sed -n '36,64p' src/settings/index.ts
```

```output
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
```

Every time the settings tab is displayed, the previous Svelte component is cleared and a fresh `SettingsRouter` is mounted. When the tab is hidden, it's unmounted. The router receives the `app`, `manager`, and `settings` store as props.

### Routing — `src/settings/stores.ts` and `Router.svelte`

The settings UI has a simple two-level routing system:

```bash
cat src/settings/stores.ts
```

```output
import { writable } from "svelte/store";

interface RouterState {
  path: string[];
  eState: Record<string, string | number | boolean>;
}

function createRouter() {
  const { subscribe, set, update } = writable<RouterState>({
    path: ["Periodic Notes"],
    eState: {},
  });
  return {
    subscribe,
    set,
    navigate: (
      path: string[],
      eState?: Record<string, string | number | boolean>,
    ) =>
      set({
        path,
        eState: eState ?? {},
      }),
    update,
    reset: () =>
      set({
        path: ["Periodic Notes"],
        eState: {},
      }),
  };
}

export const router = createRouter();
```

The router is a simple writable store with a `path` array. When `path` has one element (`["Periodic Notes"]`), the Dashboard is shown. When it has two (`["Periodic Notes", "My Calendar Set"]`), the Details page for that calendar set is shown. The `eState` field carries extra state — for example, `{ shouldRename: true }` when a newly created calendar set should start with its name editable.

### Localization — `src/settings/localization.ts`

The localization system configures moment.js globally:

```bash
sed -n '93,117p' src/settings/localization.ts
```

```output
export function configureGlobalMomentLocale(
  localeOverride: LocaleOverride = "system-default",
  weekStart: WeekStartOption = "locale",
): string {
  const obsidianLang = localStorage.getItem("language") || "en";
  const systemLang = navigator.language?.toLowerCase();

  let momentLocale = langToMomentLocale[obsidianLang];

  if (localeOverride !== "system-default") {
    momentLocale = localeOverride;
  } else if (systemLang.startsWith(obsidianLang)) {
    // If the system locale is more specific (en-gb vs en), use the system locale.
    momentLocale = systemLang;
  }

  const currentLocale = window.moment.locale(momentLocale);
  console.debug(
    `[Periodic Notes] Trying to switch Moment.js global locale to ${momentLocale}, got ${currentLocale}`,
  );

  overrideGlobalMomentWeekStart(weekStart);

  return currentLocale;
}
```

The locale resolution follows a cascade:
1. If the user set an explicit locale override → use that
2. If the system locale is more specific than Obsidian's language setting (e.g., `en-gb` vs `en`) → use the system locale
3. Otherwise → map Obsidian's language code to a moment.js locale using the `langToMomentLocale` lookup table

Week start is handled separately via `overrideGlobalMomentWeekStart()`, which uses moment's `updateLocale()` API. The original locale weekspec is saved on first call to `window._bundledLocaleWeekSpec` so it can be restored when switching back to "Locale default".

### Settings utility functions — `src/settings/utils.ts`

The settings utilities use the Svelte store updater pattern — functions that return updater functions:

```bash
sed -n '22,57p' src/settings/utils.ts
```

```output
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
```

`createNewCalendarSet` uses `cloneDeep` on both the default periodic settings and any reference settings to ensure no shared mutable state between calendar sets. `deleteCalendarSet` includes a safety fallback — if the deleted set was active, it switches to the first remaining set.

The `findStartupNoteConfig` function searches across *all* calendar sets for any granularity with `openAtStartup: true`:

```bash
sed -n '90,107p' src/settings/utils.ts
```

```output
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
```

This iterates across all calendar sets and all granularities, returning the first match. Only one note type can be the startup note across the entire plugin — the UI enforces this mutual exclusivity through the `clearStartupNote` updater which clears all other `openAtStartup` flags before setting a new one.

## 12. Putting it all together — the data flow

Let's trace the complete lifecycle of opening a daily note:

```
User clicks ribbon icon
  │
  ▼
configureRibbonIcons() bound the click to:
  plugin.openPeriodicNote("day", moment())
  │
  ▼
openPeriodicNote() checks cache:
  cache.getPeriodicNote(activeCalendarSet, "day", today)
  │
  ├─ File exists → open it in a leaf
  │
  └─ File missing → createPeriodicNote("day", today)
       │
       ├─ calendarSetManager.getFormat("day") → "YYYY-MM-DD"
       ├─ today.format("YYYY-MM-DD") → "2026-02-25"
       ├─ getTemplateContents(templatePath) → raw template
       ├─ applyTemplateTransformations(filename, "day", date, format, template)
       │    └─ Replace {{date}}, {{yesterday}}, {{tomorrow}}, etc.
       ├─ getNoteCreationPath(app, "2026-02-25", config)
       │    └─ Ensure folder exists, return "daily/2026-02-25.md"
       └─ vault.create(path, renderedContents) → TFile
            │
            ▼
       vault.on("create") fires → cache.resolve(file)
            │
            ├─ Filename matches format → exact: true, matchType: "filename"
            └─ Indexed in cache, periodic-notes:resolve event fired
                 │
                 ▼
            Timeline.svelte picks up the event → updates UI
```

## Key design patterns

1. **Svelte store as single source of truth** — The `Writable<Settings>` store is the canonical source. Obsidian persistence, Svelte UI, commands, ribbon, and cache all react to it.

2. **Three-tier date matching** — Strict format → frontmatter → loose regex. Priority is enforced in the cache, and the `exact` flag distinguishes first-class periodic notes from date-related files.

3. **Calendar sets as namespaces** — Everything is scoped by calendar set ID: the cache, the config, the format. Switching sets triggers a full cascade of reconfiguration.

4. **Event-driven coordination** — Custom workspace events (`periodic-notes:settings-updated`, `periodic-notes:resolve`) decouple subsystems. The cache, timeline, and external plugins all listen independently.

5. **Template variables as a mini DSL** — The `{{variable ±offset:format}}` syntax is a small domain-specific language parsed by regex, giving users power without requiring a full template engine.

6. **Obsidian API integration** — The plugin uses both documented and undocumented APIs (marked with comments). Private APIs like `app.internalPlugins`, `app.commands.removeCommand`, and `vault.getConfig` are used where the public API falls short.
