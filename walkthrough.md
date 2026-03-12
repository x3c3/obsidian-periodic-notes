# Obsidian Periodic Notes — Code Walkthrough

*2026-03-12T20:06:50Z by Showboat 0.6.1*
<!-- showboat-id: 386b58a1-3e77-402a-a4b9-bfa1960eed97 -->

## 1. Project Structure

This is an Obsidian plugin for creating and managing periodic notes — daily, weekly, monthly, quarterly, and yearly. It is built with Svelte 5, TypeScript, and Vite, and ships as a single CommonJS bundle (`main.js`) alongside `styles.css` and `manifest.json`.

Key architectural decisions:
- **Vite outputs to project root** (`outDir: "."`) with `emptyOutDir: false` — the build artifacts live alongside source. This is the Obsidian plugin convention.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) are used throughout — no legacy `$:` reactive statements.
- **Biome** handles linting and formatting; **svelte-check** validates Svelte components.
- **Bun** is the package manager and test runner.

```bash
find src -type f | sort
```

```output
src/cache.test.ts
src/cache.ts
src/calendar/Arrow.svelte
src/calendar/Calendar.svelte
src/calendar/constants.ts
src/calendar/context.ts
src/calendar/Day.svelte
src/calendar/fileStore.test.ts
src/calendar/fileStore.ts
src/calendar/Month.svelte
src/calendar/Nav.svelte
src/calendar/types.ts
src/calendar/utils.test.ts
src/calendar/utils.ts
src/calendar/view.ts
src/calendar/WeekNum.svelte
src/commands.ts
src/constants.ts
src/icons.ts
src/main.ts
src/modal.ts
src/obsidian.d.ts
src/parser.test.ts
src/parser.ts
src/settings/components/Arrow.svelte
src/settings/components/Dropdown.svelte
src/settings/components/Footer.svelte
src/settings/components/NoteFolderSetting.svelte
src/settings/components/NoteFormatSetting.svelte
src/settings/components/NoteTemplateSetting.svelte
src/settings/components/OpenAtStartupSetting.svelte
src/settings/components/SettingItem.svelte
src/settings/components/Toggle.svelte
src/settings/index.ts
src/settings/localization.test.ts
src/settings/localization.ts
src/settings/pages/dashboard/GettingStartedBanner.svelte
src/settings/pages/details/PeriodicGroup.svelte
src/settings/pages/SettingsPage.svelte
src/settings/utils.test.ts
src/settings/utils.ts
src/settings/validation.test.ts
src/settings/validation.ts
src/styles.css
src/switcher/relatedFilesSwitcher.ts
src/switcher/switcher.ts
src/test-preload.ts
src/types.ts
src/ui/fileSuggest.ts
src/utils.test.ts
src/utils.ts
```

The build configuration lives in `vite.config.ts`. Svelte CSS is inlined (`emitCss: false`), and a custom plugin copies `src/styles.css` to the project root after each build. Externals (`obsidian`, `electron`, `fs`, `os`, `path`) are excluded from the bundle since Obsidian provides them at runtime.

```bash
sed -n '1,33p' vite.config.ts
```

```output
import { copyFileSync } from "node:fs";
import path from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte({ emitCss: false }),
    {
      name: "copy-styles",
      writeBundle() {
        copyFileSync("src/styles.css", "styles.css");
      },
    },
  ],
  resolve: {
    alias: { src: path.resolve(__dirname, "src") },
  },
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    outDir: ".",
    emptyOutDir: false,
    sourcemap: process.env.NODE_ENV === "DEV" ? "inline" : false,
    rollupOptions: {
      external: ["obsidian", "electron", "fs", "os", "path"],
      output: { exports: "default" },
    },
  },
});
```

## 2. Plugin Lifecycle (`src/main.ts`)

`PeriodicNotesPlugin` extends Obsidian's `Plugin` class. The `onload` method orchestrates startup:

1. **Register custom icons** — five calendar SVGs (day, week, month, quarter, year) via `addIcon`.
2. **Load settings** into a Svelte `writable` store. If no granularity is enabled, daily notes default to enabled.
3. **Subscribe to settings changes** — `onUpdateSettings` persists data and fires `periodic-notes:settings-updated`.
4. **Initialize locale** — `initializeLocaleConfigOnce` reads Obsidian's private vault config.
5. **Create the cache** — `PeriodicNotesCache` indexes all periodic files.
6. **Register commands** — per-granularity open/jump/navigate commands, plus the NLDates switcher.
7. **Register the calendar view** — `CalendarView` backed by a Svelte component.
8. **Open startup note** — if configured, opens a periodic note on layout ready.

The plugin exposes public methods (`getPeriodicNote`, `isPeriodic`, `findAdjacent`, `openPeriodicNote`, `createPeriodicNote`) that other subsystems call into.

```bash
sed -n '43,113p' src/main.ts
```

```output
export default class PeriodicNotesPlugin extends Plugin {
  public settings!: Writable<Settings>;
  private ribbonEl!: HTMLElement | null;

  private cache!: PeriodicNotesCache;

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
    this.cache = new PeriodicNotesCache(this.app, this);

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

    // Calendar view
    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf) => new CalendarView(leaf, this),
    );

    this.addCommand({
      id: "show-calendar",
      name: "Show calendar",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.app.workspace.getRightLeaf(false)?.setViewState({
          type: VIEW_TYPE_CALENDAR,
        });
      },
    });

    this.app.workspace.onLayoutReady(() => {
      const startupGranularity = findStartupNoteConfig(this.settings);
      if (startupGranularity) {
        this.openPeriodicNote(startupGranularity, window.moment());
      }
    });
  }
```

Note the ribbon icon setup: the first enabled granularity gets a ribbon icon. Right-clicking the ribbon shows a context menu (via `showFileMenu`) listing all enabled granularities. Left-clicking opens the note, with meta/ctrl+click opening in a split pane.

```bash
sed -n '115,141p' src/main.ts
```

```output
  private configureRibbonIcons() {
    this.ribbonEl?.detach();

    const configuredGranularities = getEnabledGranularities(get(this.settings));
    if (configuredGranularities.length) {
      const granularity = configuredGranularities[0];
      const config = displayConfigs[granularity];
      this.ribbonEl = this.addRibbonIcon(
        `calendar-${granularity}`,
        config.labelOpenPresent,
        (e: MouseEvent) => {
          if (e.type !== "auxclick") {
            this.openPeriodicNote(granularity, window.moment(), {
              inNewSplit: isMetaPressed(e),
            });
          }
        },
      );
      this.ribbonEl.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        showFileMenu(this.app, this, {
          x: e.pageX,
          y: e.pageY,
        });
      });
    }
  }
```

## 3. Types and Constants (`src/types.ts`, `src/constants.ts`)

The `Granularity` type is the fundamental discriminator. It appears in settings, cache, commands, and the calendar. The `granularities` array defines the ordering — finer to coarser — which the cache uses for `compareGranularity` and `includeFinerGranularities` filtering.

```bash
cat src/types.ts
```

```output
export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export const granularities: Granularity[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

export interface PeriodicConfig {
  enabled: boolean;
  openAtStartup: boolean;

  format: string;
  folder: string;
  templatePath?: string;
}

export interface DateNavigationItem {
  granularity: Granularity;
  date: import("moment").Moment;
  label: string;
  matchData?: {
    exact: boolean;
    matchType: import("./cache").MatchType;
  };
}
```

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

export const DEFAULT_PERIODIC_CONFIG = Object.freeze({
  enabled: false,
  openAtStartup: false,
  format: "",
  templatePath: undefined,
  folder: "",
});

export const HUMANIZE_FORMAT = Object.freeze({
  month: "MMMM YYYY",
  quarter: "YYYY Q[Q]",
  year: "YYYY",
});
```

Note the weekly format uses locale-aware `gggg` (locale year) and `ww` (locale week), not ISO `GGGG`/`WW`. The `HUMANIZE_FORMAT` map only covers month, quarter, and year — day and week use relative labels ("Today", "This week") via `getRelativeDate`.

`DateNavigationItem` is the type shared between the switcher modals and the cache — it carries a granularity, date, label, and optional match data.

## 4. Settings (`src/settings/`)

The settings system has three layers: data model, validation, and UI.

```bash
sed -n '1,51p' src/settings/index.ts
```

```output
import { type App, PluginSettingTab } from "obsidian";
import type { PeriodicConfig } from "src/types";
import { mount, unmount } from "svelte";

import type PeriodicNotesPlugin from "../main";
import SettingsPage from "./pages/SettingsPage.svelte";

export interface Settings {
  showGettingStartedBanner: boolean;

  day?: PeriodicConfig;
  week?: PeriodicConfig;
  month?: PeriodicConfig;
  quarter?: PeriodicConfig;
  year?: PeriodicConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  showGettingStartedBanner: true,
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

    this.view = mount(SettingsPage, {
      target: this.containerEl,
      props: {
        app: this.app,
        settings: this.plugin.settings,
      },
    });
  }

  hide() {
    super.hide();
    if (this.view) {
      unmount(this.view);
    }
  }
}
```

The `PeriodicNotesSettingsTab` bridges Obsidian's `PluginSettingTab` to a Svelte 5 component. On `display()` it mounts `SettingsPage.svelte`; on `hide()` it unmounts. The Svelte store (`Writable<Settings>`) is passed as a prop, so any mutation inside the Svelte tree propagates back to the plugin.

### Validation (`src/settings/validation.ts`)

Format validation handles two concerns: filename legality and round-trip parsing. The `validateFormatComplexity` function detects "fragile-basename" formats — nested paths like `YYYY/DD` where the basename alone lacks enough date components for strict parsing. When a fragile basename is detected, `getDateInput` reconstructs the path-based date input from file path segments.

```bash
sed -n '59,102p' src/settings/validation.ts
```

```output
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

export function getDateInput(
  file: TFile,
  format: string,
  granularity: Granularity,
): string {
  // pseudo-intelligently find files when the format is YYYY/MM/DD for example
  if (validateFormatComplexity(format, granularity) === "fragile-basename") {
    const fileName = pathWithoutExtension(file);
    const strippedFormat = removeEscapedCharacters(format);
    const nestingLvl = (strippedFormat.match(/\//g)?.length ?? 0) + 1;
    const pathParts = fileName.split("/");
    return pathParts.slice(-nestingLvl).join("/");
  }
  return file.basename;
}
```

### Localization (`src/settings/localization.ts`)

Locale configuration bridges Obsidian's vault settings (private API) to Moment.js's global locale. The `vault.getConfig()` call is wrapped in a try-catch because it is undocumented and could break in future Obsidian versions. The initial locale weekspec is saved so that switching back to "locale default" restores the original behavior.

```bash
sed -n '122,149p' src/settings/localization.ts
```

```output
export function initializeLocaleConfigOnce(app: App) {
  if (window._hasConfiguredLocale) {
    return;
  }

  const localization = getLocalizationSettings(app);
  const { localeOverride, weekStart } = localization;

  configureGlobalMomentLocale(localeOverride, weekStart);

  window._hasConfiguredLocale = true;
}

export function getLocalizationSettings(app: App): LocalizationSettings {
  try {
    // private API: vault.getConfig is undocumented
    const localeOverride =
      app.vault.getConfig("localeOverride") ?? "system-default";
    const weekStart = app.vault.getConfig("weekStart") ?? "locale";
    return { localeOverride, weekStart };
  } catch (e) {
    console.debug(
      "[Periodic Notes] vault.getConfig() unavailable, using defaults",
      e,
    );
    return { localeOverride: "system-default", weekStart: "locale" };
  }
}
```

### Settings Utilities (`src/settings/utils.ts`)

Helper functions for querying settings: `getEnabledGranularities`, `findStartupNoteConfig`, and legacy daily-notes plugin detection. The `clearStartupNote` updater is designed to be passed directly to a Svelte store's `update()` method.

## 5. Cache (`src/cache.ts`)

The `PeriodicNotesCache` is the central index. It maps file paths to `PeriodicNoteCachedMetadata` — a record of granularity, parsed date, canonical date string, and match data.

### Resolution Strategy

Files are resolved through a three-tier priority system:

1. **Frontmatter match** — a YAML key matching the granularity name (e.g., `day: 2026-03-15`) wins. Frontmatter entries supercede filename matches (checked via `existingEntry.matchData.matchType === "frontmatter"` guard).
2. **Strict filename match** — the filename (or path-reconstructed input for fragile formats) is parsed against the configured format using strict mode (`moment(input, format, true)`).
3. **Loose filename match** — `getLooselyMatchedDate` from the parser module tries regex patterns as a fallback for date-prefixed files.

The cache listens for vault events (`create`, `rename`), metadata changes, and settings updates. On settings change, it clears and rebuilds entirely.

### Linear Scan Design

Lookups (`getPeriodicNote`, `getPeriodicNotes`, `findAdjacent`) iterate the entire `Map`. This is intentional — the cache is small (bounded by the number of periodic files in the vault) and the code avoids secondary index maintenance complexity.

The `isPeriodic` guard is critical for performance: the calendar's `fileStore` uses it to filter vault events, avoiding unnecessary re-renders when non-periodic files change.

```bash
sed -n '51,81p' src/cache.ts
```

```output
export class PeriodicNotesCache extends Component {
  public cachedFiles: Map<string, PeriodicNoteCachedMetadata>;

  constructor(
    readonly app: App,
    readonly plugin: PeriodicNotesPlugin,
  ) {
    super();
    this.cachedFiles = new Map();

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

```bash
sed -n '176,250p' src/cache.ts
```

```output
  private resolve(
    file: TFile,
    reason: "create" | "rename" | "initialize" = "create",
  ): void {
    const settings = get(this.plugin.settings);
    const activeGranularities = granularities.filter(
      (g) => settings[g]?.enabled,
    );
    if (activeGranularities.length === 0) return;

    // 'frontmatter' entries should supercede 'filename'
    const existingEntry = this.cachedFiles.get(file.path);
    if (existingEntry && existingEntry.matchData.matchType === "frontmatter") {
      return;
    }

    for (const granularity of activeGranularities) {
      const folder = settings[granularity]?.folder || "";
      if (!file.path.startsWith(folder)) continue;

      const formats = getPossibleFormats(settings, granularity);
      const dateInputStr = getDateInput(file, formats[0], granularity);
      const date = window.moment(dateInputStr, formats, true);
      if (date.isValid()) {
        const metadata = {
          filePath: file.path,
          date,
          granularity,
          canonicalDateStr: getCanonicalDateString(granularity, date),
          matchData: {
            exact: true,
            matchType: "filename",
          },
        } as PeriodicNoteCachedMetadata;
        this.set(file.path, metadata);

        if (reason === "create" && file.stat.size === 0) {
          applyPeriodicTemplateToFile(this.app, file, settings, metadata).catch(
            (err) => {
              console.error("[Periodic Notes] failed to apply template", err);
              new Notice(
                `Periodic Notes: failed to apply template to "${file.path}". See console for details.`,
              );
            },
          );
        }

        this.app.workspace.trigger("periodic-notes:resolve", granularity, file);
        return;
      }
    }

    const nonStrictDate = getLooselyMatchedDate(file.basename);
    if (nonStrictDate) {
      this.set(file.path, {
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
```

Notice that when a file is newly created with size 0, the cache automatically applies the configured template via `applyPeriodicTemplateToFile`. This handles the case where users create files from Obsidian's file explorer or external tools rather than through the plugin's commands.

Also note that loose matches set `exact: false` — these are "date-prefixed" files that contain a date but don't exactly match the configured format. The switcher's related-files view filters on `exact === false` to show these associated files.

## 6. Parser (`src/parser.ts`)

The loose date parser is a simple regex cascade: full date (`YYYY-MM-DD` or `YYYYMMDD`), then month (`YYYY-MM`), then year (`YYYY`). It does not handle weeks or quarters — those require format-specific parsing. The regexes validate month (01-12) and day (01-31) ranges.

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

const FULL_DATE_PATTERN =
  /(\d{4})[-.]?(0[1-9]|1[0-2])[-.]?(0[1-9]|[12][0-9]|3[01])/;
const MONTH_PATTERN = /(\d{4})[-.]?(0[1-9]|1[0-2])/;
const YEAR_PATTERN = /(\d{4})/;

export function getLooselyMatchedDate(inputStr: string): ParseData | null {
  const fullDateExp = FULL_DATE_PATTERN.exec(inputStr);
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

  const monthDateExp = MONTH_PATTERN.exec(inputStr);
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

  const yearExp = YEAR_PATTERN.exec(inputStr);
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

## 7. Utilities (`src/utils.ts`)

This module contains template handling, note creation paths, and format helpers. Key functions:

- **`applyTemplateTransformations`** — the template engine. Handles `{{date}}`, `{{time}}`, `{{title}}`, `{{yesterday}}`, `{{tomorrow}}`, day-of-week tokens for weekly notes, and `{{granularity+Nd:format}}` delta syntax.
- **`replaceGranularityTokens`** — consolidates day/month/quarter/year token replacement. The week branch is structurally different because it uses `{{dayname:format}}` syntax instead.
- **`getPossibleFormats`** — when a format contains `/` (like `YYYY/YYYY-MM-DD`), both the full format and the basename-only format are returned. This allows matching files even if they've been moved.
- **`getNoteCreationPath`** — builds the destination path and ensures the parent folder exists.
- **`join`** — a custom path join (no dependency on Node's `path` at runtime).

The template delta regex is worth examining:

```bash
sed -n '50,83p' src/utils.ts
```

```output
function replaceGranularityTokens(
  contents: string,
  date: Moment,
  tokenPattern: string,
  format: string,
  startOfUnit?: Granularity,
): string {
  const pattern = new RegExp(
    `{{\\s*(${tokenPattern})\\s*(([-+]\\d+)([yqmwdhs]))?\\s*(:.+?)?}}`,
    "gi",
  );
  const now = window.moment();
  return contents.replace(
    pattern,
    (_, _token, calc, timeDelta, unit, momentFormat) => {
      const periodStart = date.clone();
      if (startOfUnit) {
        periodStart.startOf(startOfUnit);
      }
      periodStart.set({
        hour: now.get("hour"),
        minute: now.get("minute"),
        second: now.get("second"),
      });
      if (calc) {
        periodStart.add(parseInt(timeDelta, 10), unit);
      }
      if (momentFormat) {
        return periodStart.format(momentFormat.substring(1).trim());
      }
      return periodStart.format(format);
    },
  );
}
```

The regex captures: `{{token +/-Nunit :format}}`. The `gi` flag means token names are case-insensitive, but the captured unit letter preserves Moment.js semantics (`m` = minutes, `M` = months). The `startOfUnit` parameter snaps the date to the beginning of the period before applying deltas — critical for month/quarter/year tokens where the date itself may be mid-period.

## 8. Commands (`src/commands.ts`)

Each granularity gets five commands: open current period, jump forwards/backwards to closest existing note, and open next/previous period (creating if needed). All use `checkCallback` to conditionally appear based on whether the granularity is enabled and whether the active file is periodic.

```bash
sed -n '13,39p' src/commands.ts
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

The distinction between "jump" and "open" is important: `jumpToAdjacentNote` navigates to the closest **existing** note in the given direction, while `openAdjacentNote` computes the next/previous date and opens (or creates) that note regardless of whether it exists.

## 9. Switcher (`src/switcher/`)

The date switcher requires the [NLDates](https://github.com/argenos/nldates-obsidian) plugin. It provides natural-language date input with two modal classes:

- **`NLDNavigator`** — the primary switcher. Parses input via NLDates, generates suggestions for enabled granularities, and supports Tab to pivot to related files.
- **`RelatedFilesSwitcher`** — shows date-prefixed files (non-exact cache matches) within the selected period. The `*` toggle expands to include finer granularities.

Both modals use `SuggestModal.chooser` — a private Obsidian API that exposes the selected item. Access is wrapped in `@ts-expect-error` and try-catch:

```bash
sed -n '41,68p' src/switcher/switcher.ts
```

```output
    // SuggestModal.chooser is a private Obsidian API — not in the type
    // definitions but available at runtime. Wrapped in try-catch so the
    // plugin degrades gracefully if Obsidian removes or renames it.
    this.scope.register(["Meta"], "Enter", (evt: KeyboardEvent) => {
      try {
        // @ts-expect-error this.chooser exists but is not exposed
        this.chooser.useSelectedItem(evt);
      } catch (e) {
        console.debug(
          "[Periodic Notes] chooser.useSelectedItem() unavailable",
          e,
        );
      }
    });

    this.scope.register([], "Tab", (evt: KeyboardEvent) => {
      const selected = this.getSelectedItem();
      if (!selected) return;
      evt.preventDefault();
      this.close();
      new RelatedFilesSwitcher(
        this.app,
        this.plugin,
        selected,
        this.inputEl.value,
      ).open();
    });
  }
```

Quarter support in the switcher is blocked on NLDates quarter parsing support (philoserf/obsidian-nldates#18). The relevant lines are commented out with TODO markers.

## 10. Calendar View (`src/calendar/`)

The calendar is the most complex subsystem. It implements a month-grid view as an Obsidian sidebar panel, built with Svelte 5 components.

### Architecture Overview

The key design challenge is reactivity: the calendar must update when files are created, deleted, renamed, or when settings change — but it must not re-render on every vault event. The solution has three layers:

1. **`CalendarView`** (ItemView) — the Obsidian integration shell
2. **`CalendarFileStore`** — a reactive cache wrapper that bumps a counter store
3. **`Calendar.svelte`** and children — Svelte components that derive state from the store

### `view.ts` — CalendarView

The view bridges Obsidian's `ItemView` lifecycle to Svelte. On `onOpen`, it mounts the Calendar component and captures its exported functions (`tick` and `setActiveFilePath`). Communication flows in both directions:

- **View to Component**: via exported functions that update `$state` variables
- **Component to View**: via callback props (`onHover`, `onClick`, `onContextMenu`)

This pattern is necessary because Svelte 5's `mount()` captures initial prop values — for post-mount updates, exported functions are the prescribed mechanism.

```bash
sed -n '15,62p' src/calendar/view.ts
```

```output
export class CalendarView extends ItemView {
  private calendar!: CalendarExports;
  private plugin: PeriodicNotesPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: PeriodicNotesPlugin) {
    super(leaf);
    this.plugin = plugin;

    this.registerEvent(
      this.app.workspace.on("file-open", this.onFileOpen.bind(this)),
    );
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-day";
  }

  async onClose(): Promise<void> {
    if (this.calendar) {
      unmount(this.calendar);
    }
  }

  async onOpen(): Promise<void> {
    const fileStore = new CalendarFileStore(this, this.plugin);

    const cal = mount(Calendar, {
      target: this.contentEl,
      props: {
        fileStore,
        onHover: this.onHover.bind(this),
        onClick: this.onClick.bind(this),
        onContextMenu: this.onContextMenu.bind(this),
      },
    });
    if (!("tick" in cal && "setActiveFilePath" in cal)) {
      throw new Error("Calendar component missing expected exports");
    }
    this.calendar = cal as CalendarExports;
  }
```

### `fileStore.ts` — Reactive Cache Wrapper

`CalendarFileStore` wraps the plugin's cache with a Svelte `writable<number>` store that acts as a change counter. When vault events fire, the `bump` method checks `isPeriodic` before incrementing — this is the critical filter that prevents non-periodic file changes from triggering calendar re-renders.

Two `onLayoutReady` callbacks exist: one in the cache (to populate) and one in the fileStore (to wire events). The fileStore bumps once after setup to ensure the calendar reads the populated cache.

The `computeFileMap` function pre-computes a `FileMap` (a `Map<string, TFile | null>`) for every cell in the current month grid. This is the **FileMap pattern** — by computing all lookups once per store bump, individual cells use cheap `$derived` Map.get() lookups instead of each cell subscribing to the store independently.

```bash
cat src/calendar/fileStore.ts
```

```output
import type { Moment } from "moment";
import type { Component, TAbstractFile, TFile } from "obsidian";
import type PeriodicNotesPlugin from "src/main";
import type { Granularity } from "src/types";
import { get, type Writable, writable } from "svelte/store";

import type { FileMap, IMonth } from "./types";

export default class CalendarFileStore {
  public store: Writable<number>;
  private plugin: PeriodicNotesPlugin;

  constructor(component: Component, plugin: PeriodicNotesPlugin) {
    this.plugin = plugin;
    this.store = writable(0);

    plugin.app.workspace.onLayoutReady(() => {
      const { vault, metadataCache, workspace } = plugin.app;
      component.registerEvent(vault.on("create", this.bump, this));
      component.registerEvent(vault.on("delete", this.bump, this));
      component.registerEvent(vault.on("rename", this.onRename, this));
      component.registerEvent(metadataCache.on("changed", this.bump, this));
      component.registerEvent(
        workspace.on("periodic-notes:resolve", this.bumpUnconditionally, this),
      );
      component.registerEvent(
        workspace.on(
          "periodic-notes:settings-updated",
          this.bumpUnconditionally,
          this,
        ),
      );
      // Re-read cache after layout is ready (cache populates in its own onLayoutReady)
      this.bump();
    });
  }

  private bump(file?: TAbstractFile): void {
    if (file && !this.plugin.isPeriodic(file.path)) return;
    this.store.update((n) => n + 1);
  }

  private bumpUnconditionally(): void {
    this.store.update((n) => n + 1);
  }

  private onRename(file: TAbstractFile, oldPath: string): void {
    if (this.plugin.isPeriodic(file.path) || this.plugin.isPeriodic(oldPath)) {
      this.store.update((n) => n + 1);
    }
  }

  public getFile(date: Moment, granularity: Granularity): TFile | null {
    return this.plugin.getPeriodicNote(granularity, date);
  }

  public isGranularityEnabled(granularity: Granularity): boolean {
    const settings = get(this.plugin.settings);
    return settings[granularity]?.enabled ?? granularity === "day";
  }

  public getEnabledGranularities(): Granularity[] {
    const settings = get(this.plugin.settings);
    return (["week", "month", "year"] as Granularity[]).filter(
      (g) => settings[g]?.enabled,
    );
  }
}

const KEY_FORMATS: Record<Granularity, string> = {
  day: "YYYY-MM-DD",
  week: "gggg-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
};

export function fileMapKey(granularity: Granularity, date: Moment): string {
  return `${granularity}:${date.format(KEY_FORMATS[granularity])}`;
}

export function computeFileMap(
  month: IMonth,
  getFile: (date: Moment, granularity: Granularity) => TFile | null,
  enabledGranularities: Granularity[],
): FileMap {
  const map: FileMap = new Map();
  const displayedMonth = month[1].days[0];

  for (const week of month) {
    for (const day of week.days) {
      map.set(fileMapKey("day", day), getFile(day, "day"));
    }
    if (enabledGranularities.includes("week")) {
      const weekStart = week.days[0];
      map.set(fileMapKey("week", weekStart), getFile(weekStart, "week"));
    }
  }

  if (enabledGranularities.includes("month")) {
    map.set(
      fileMapKey("month", displayedMonth),
      getFile(displayedMonth, "month"),
    );
  }
  if (enabledGranularities.includes("year")) {
    map.set(
      fileMapKey("year", displayedMonth),
      getFile(displayedMonth, "year"),
    );
  }

  return map;
}
```

### `Calendar.svelte` — Root Component

The root component owns the month grid state and manages the critical store subscription. The Svelte 5 store bridge pattern is visible here:

**Why `$derived.by()` does not work with Svelte stores:** Svelte 5's `$derived` tracks reactive `$state` signals, not Svelte 4 store auto-subscriptions. The `fileStore.store` is a classic `writable`, so changes to it are invisible to `$derived.by()`. The solution is `$state` + `$effect` + `.subscribe()`:

```bash
sed -n '27,72p' src/calendar/Calendar.svelte
```

```output
  let activeFilePath: string | null = $state(null);

  let today: Moment = $state.raw(window.moment());

  const displayedMonthStore = writable<Moment>(window.moment());
  setContext(DISPLAYED_MONTH, displayedMonthStore);

  let month: IMonth = $state.raw(getMonth(window.moment()));
  let showWeekNums: boolean = $state(false);
  let fileMap: FileMap = $state.raw(new Map());

  $effect(() => {
    month = getMonth($displayedMonthStore);
  });

  $effect(() => {
    const currentMonth = month;
    return fileStore.store.subscribe(() => {
      showWeekNums = fileStore.isGranularityEnabled("week");
      fileMap = computeFileMap(
        currentMonth,
        (date, granularity) => fileStore.getFile(date, granularity),
        fileStore.getEnabledGranularities(),
      );
    });
  });

  let eventHandlers: IEventHandlers = $derived({
    onHover,
    onClick,
    onContextMenu,
  });

  const daysOfWeek: string[] = getWeekdayLabels();

  export function tick() {
    const now = window.moment();
    if (!now.isSame(today, "day")) {
      today = now;
    }
  }

  export function setActiveFilePath(path: string | null) {
    activeFilePath = path;
  }
</script>
```

The `$effect` that subscribes to `fileStore.store` is the single subscription point. It returns the unsubscribe function, so Svelte automatically cleans it up when the effect re-runs (when `month` changes) or when the component is destroyed. Every time the store bumps, the entire `FileMap` is recomputed — individual Day and WeekNum cells then use cheap `$derived` lookups against this pre-computed map.

The `displayedMonthStore` is shared via Svelte context, allowing `Nav`, `Month`, and `Day` components to read and update the displayed month without prop drilling.

### `Day.svelte` and `WeekNum.svelte` — Cell Components

Each cell component receives the full `FileMap` as a prop and derives its own file reference:

```bash
sed -n '31,31p' src/calendar/Day.svelte
```

```output
  let file = $derived(fileMap.get(fileMapKey("day", date)) ?? null);
```

```bash
sed -n '27,28p' src/calendar/WeekNum.svelte
```

```output
  let startOfWeek = $derived(getStartOfWeek(days));
  let file = $derived(fileMap.get(fileMapKey("week", startOfWeek)) ?? null);
```

This is the payoff of the FileMap pattern. Each cell does a single `Map.get()` — no store subscriptions, no cache lookups at render time. When the FileMap reference changes (via `$state.raw` assignment in Calendar.svelte), Svelte's fine-grained reactivity propagates the update to exactly the cells whose file reference changed.

### `Month.svelte` — Month/Year Header

The month header is interactive: clicking the month name opens (or creates) the monthly note; clicking the year opens the yearly note. The `makeHandlers` factory creates consistent click/hover/context handlers for each granularity:

```bash
sed -n '36,82p' src/calendar/Month.svelte
```

```output
  function makeHandlers(
    granularity: Granularity,
    getEnabled: () => boolean,
    getFile: () => TFile | null,
  ) {
    return {
      click: (event: MouseEvent) => {
        if (getEnabled()) {
          onClick?.(
            granularity,
            $displayedMonth,
            getFile(),
            isMetaPressed(event),
          );
        } else if (granularity === "month") {
          resetDisplayedMonth();
        }
      },
      hover: (event: PointerEvent) => {
        if (!getEnabled() || !event.target) return;
        onHover?.(
          granularity,
          $displayedMonth,
          getFile(),
          event.target,
          isMetaPressed(event),
        );
      },
      context: (event: MouseEvent) => {
        const f = getFile();
        if (getEnabled() && f) {
          onContextMenu?.(granularity, $displayedMonth, f, event);
        }
      },
    };
  }

  const monthH = makeHandlers(
    "month",
    () => monthEnabled,
    () => monthFile,
  );
  const yearH = makeHandlers(
    "year",
    () => yearEnabled,
    () => yearFile,
  );
```

When the month granularity is not enabled, clicking the month name resets to the current month instead — a fallback navigation behavior.

### `Nav.svelte` and `Arrow.svelte` — Navigation Controls

`Nav` provides month increment/decrement arrows and a reset-to-today button. The displayed month is managed through the shared context store. `Arrow` is a pure presentational component with platform-aware sizing (`Platform.isMobile`).

### `utils.ts` — Grid Generation

`getMonth` always generates exactly 6 weeks (42 days), starting from the weekday-adjusted beginning of the month. This fixed grid avoids layout shifts when navigating between months.

```bash
cat src/calendar/utils.ts
```

```output
import type { Moment } from "moment";
import type { IMonth, IWeek } from "./types";

export function getWeekdayLabels(): string[] {
  return window.moment.weekdaysShort(true);
}

export function isWeekend(date: Moment): boolean {
  return date.isoWeekday() === 6 || date.isoWeekday() === 7;
}

export function getStartOfWeek(days: Moment[]): Moment {
  return days[0].clone();
}

export function getMonth(displayedMonth: Moment): IMonth {
  const month: IMonth = [];
  let week!: IWeek;

  const startOfMonth = displayedMonth.clone().date(1);
  const startOffset = startOfMonth.weekday();
  let date: Moment = startOfMonth.clone().subtract(startOffset, "days");

  for (let _day = 0; _day < 42; _day++) {
    if (_day % 7 === 0) {
      week = {
        days: [],
        weekNum: date.week(),
      };
      month.push(week);
    }

    week.days.push(date);
    date = date.clone().add(1, "days");
  }

  return month;
}
```

### `types.ts` — Calendar Types

```bash
cat src/calendar/types.ts
```

```output
import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { Granularity } from "src/types";

export interface IWeek {
  days: Moment[];
  weekNum: number;
}

export type IMonth = IWeek[];

export interface IEventHandlers {
  onHover: (
    granularity: Granularity,
    date: Moment,
    file: TFile | null,
    targetEl: EventTarget,
    isMetaPressed: boolean,
  ) => void;
  onClick: (
    granularity: Granularity,
    date: Moment,
    existingFile: TFile | null,
    inNewSplit: boolean,
  ) => void;
  onContextMenu: (
    granularity: Granularity,
    date: Moment,
    file: TFile | null,
    event: MouseEvent,
  ) => void;
}

export type FileMap = Map<string, TFile | null>;
```

`FileMap` is `Map<string, TFile | null>` — the key is `"granularity:formatted-date"` and the value is either the resolved file or null. The `IEventHandlers` interface ensures all calendar cells emit events in a consistent shape that `CalendarView` can handle.

## 11. Modal (`src/modal.ts`)

The file menu is a simple context menu that lists all enabled granularities as "Open today's X note" actions:

```bash
cat src/modal.ts
```

```output
import { type App, Menu, type Point } from "obsidian";
import { get } from "svelte/store";
import { displayConfigs } from "./commands";
import type PeriodicNotesPlugin from "./main";
import { getEnabledGranularities } from "./settings/utils";

export function showFileMenu(
  _app: App,
  plugin: PeriodicNotesPlugin,
  position: Point,
): void {
  const contextMenu = new Menu();

  getEnabledGranularities(get(plugin.settings)).forEach((granularity) => {
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

## 12. Icons (`src/icons.ts`)

Five SVG icon definitions for day, week, month, quarter, and year calendar variants. Each uses the same calendar frame with a different number/letter glyph. Registered via `addIcon` in the plugin's `onload`.

## 13. Type Augmentations (`src/obsidian.d.ts`)

The declaration file augments Obsidian's types with private API surfaces and custom events:

```bash
cat src/obsidian.d.ts
```

```output
import "obsidian";
import type { LocaleOverride, WeekStartOption } from "./settings/localization";

declare module "obsidian" {
  export interface Workspace extends Events {
    on(
      name: "periodic-notes:settings-updated",
      callback: () => void,
      // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
      ctx?: any,
    ): EventRef;
    on(
      name: "periodic-notes:resolve",
      callback: () => void,
      // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
      ctx?: any,
    ): EventRef;
  }

  interface VaultSettings {
    localeOverride: LocaleOverride;
    weekStart: WeekStartOption;
  }

  interface Vault {
    config: Record<string, unknown>;
    getConfig<T extends keyof VaultSettings>(setting: T): VaultSettings[T];
    setConfig<T extends keyof VaultSettings>(
      setting: T,
      value: VaultSettings[T],
    ): void;
  }

  export interface PluginInstance {
    id: string;
  }

  export interface DailyNotesSettings {
    autorun?: boolean;
    format?: string;
    folder?: string;
    template?: string;
  }

  class DailyNotesPlugin implements PluginInstance {
    options?: DailyNotesSettings;
  }

  export interface App {
    internalPlugins: InternalPlugins;
    plugins: CommunityPluginManager;
  }

  export interface CommunityPluginManager {
    getPlugin(id: string): Plugin;
  }

  export interface InstalledPlugin {
    disable: (onUserDisable: boolean) => void;
    enabled: boolean;
    instance: PluginInstance;
  }

  export interface InternalPlugins {
    plugins: Record<string, InstalledPlugin>;
    getPluginById(id: string): InstalledPlugin;
  }

  interface NLDResult {
    formattedString: string;
    date: Date;
    moment: Moment;
  }

  interface NLDatesPlugin extends Plugin {
    parseDate(dateStr: string): NLDResult;
  }
}
```

This file declares:
- Custom workspace events (`periodic-notes:settings-updated`, `periodic-notes:resolve`)
- `Vault.getConfig` / `setConfig` — the private API for reading locale and week-start settings
- `App.internalPlugins` and `App.plugins` — for detecting/disabling the built-in daily-notes plugin and the NLDates plugin
- `NLDatesPlugin` — type for the natural language dates plugin interface

## 14. Testing Patterns

### Test Preload (`src/test-preload.ts`)

The test preload provides a minimal `window.moment` global, matching what Obsidian provides at runtime:

```bash
cat src/test-preload.ts
```

```output
import moment from "moment";

// @ts-expect-error partial window mock for test environment
globalThis.window = {
  moment,
  _bundledLocaleWeekSpec: { dow: 0, doy: 6 },
};
```

```bash
cat bunfig.toml
```

```output
[test]
preload = ["./src/test-preload.ts"]
```

### The Test Boundary

Modules are split into two categories based on whether they can be imported in the test environment:

**Can import directly:**
- `src/parser.ts` — no runtime Obsidian dependencies
- `src/settings/localization.ts` — no runtime Obsidian dependencies (tests mock localStorage/navigator)
- `src/calendar/fileStore.ts` (pure functions only: `fileMapKey`, `computeFileMap`)
- `src/calendar/utils.ts` — pure Moment.js logic

**Cannot import (depend on Obsidian or Svelte runtime):**
- `src/cache.ts` — uses Obsidian's `Component`, `parseFrontMatterEntry`, vault events
- `src/utils.ts` — uses `normalizePath`, `Platform`, `Notice`
- `src/settings/validation.ts` — uses `normalizePath`

For modules that cannot be imported, tests **re-implement the pure functions** under test. This is an established project pattern — not ideal, but pragmatic given the Obsidian SDK's non-mockable design. The re-implementations are kept in sync by testing the same logical behavior.

```bash
sed -n '1,9p' src/cache.test.ts
```

```output
import { describe, expect, test } from "bun:test";
import moment from "moment";

import { type Granularity, granularities } from "./types";

// Re-implement cache data types and pure logic

type MatchType = "filename" | "frontmatter" | "date-prefixed";

```

Running the test suite:

```bash
bun test 2>&1 | grep -E '^\s*\d+ (pass|fail)$|^\s*\d+ expect|^Ran \d+ tests' | sed 's/\[.*\]/[…]/'
```

```output
 159 pass
 0 fail
 283 expect() calls
Ran 159 tests across 8 files. […]
```

All 159 tests pass across 8 test files. The error stack traces in the output are intentional — those tests verify that `getLocalizationSettings` gracefully handles missing or throwing `vault.getConfig()`.

## 15. Build and Release

### CI Pipeline (`.github/workflows/main.yml`)

The CI pipeline runs on push to main and pull requests:

```bash
cat .github/workflows/main.yml
```

```output
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun audit --audit-level=critical
      - run: bun run check
      - run: bun test
```

Steps: install, audit (critical-level only — transitive dev deps have high-severity vulns with no fix), check (typecheck + biome + svelte-check), and test.

### Release Workflow (`.github/workflows/release.yml`)

Releases are triggered by pushing a git tag. The workflow builds the plugin and creates a GitHub release with `main.js`, `styles.css`, and `manifest.json` attached:

```bash
cat .github/workflows/release.yml
```

```output
name: Release

on:
  push:
    tags:
      - "*"

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: |
          bun install
          bun run build

      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            styles.css
            manifest.json
          fail_on_unmatched_files: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Version Bumping

The `bun run version` script reads the version from `package.json` and syncs it to `manifest.json` and `versions.json`. The release process is: bump `package.json`, run `bun run version`, commit, tag, push.

```bash
cat version-bump.ts
```

```output
import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error("No version found in package.json");
}

// Update manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

// Update versions.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

console.log(`Updated to version ${targetVersion}`);
```

### Validate Script

`bun run validate` runs a comprehensive pre-release check: manifest field validation, version number consistency, code quality checks, and a production build with output size reporting.

```bash
cat scripts/validate-plugin.ts
```

```output
#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { $ } from "bun";

const manifest = JSON.parse(readFileSync("manifest.json", "utf-8"));
console.log(`🔍 Validating ${manifest.name || "plugin"}...\n`);

let errors = 0;

// Check manifest.json
if (!manifest.id || !manifest.name || !manifest.version) {
  console.error("✗ manifest.json missing required fields");
  errors++;
} else {
  console.log(`✓ manifest.json — ${manifest.name} v${manifest.version}`);
}

// Check package.json version matches manifest
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  if (pkg.version !== manifest.version) {
    console.error(
      `✗ Version mismatch: package.json (${pkg.version}) != manifest.json (${manifest.version})`,
    );
    errors++;
  } else {
    console.log("✓ Version numbers match");
  }
} catch (error) {
  console.error("✗ Version check failed:", error);
  errors++;
}

// Run checks
console.log("\n🔧 Checking code quality...");
const checkResult = await $`bun run check`.nothrow();
if (checkResult.exitCode === 0) {
  console.log("✓ Code quality checks passed");
} else {
  console.error("✗ Code quality checks failed");
  errors++;
}

// Build the plugin
console.log("\n📦 Building plugin...");
const buildResult = await $`vite build`.nothrow();
if (buildResult.exitCode === 0) {
  console.log("✓ Build successful");

  const mainFile = Bun.file("main.js");
  if (await mainFile.exists()) {
    const size = mainFile.size / 1024;
    console.log(`  Output: main.js (${size.toFixed(2)} KB)`);
  } else {
    console.error("✗ main.js not found after build");
    errors++;
  }
} else {
  console.error("✗ Build failed");
  errors++;
}

// Summary
console.log(`\n${"=".repeat(50)}`);
if (errors === 0) {
  console.log("✅ All validations passed! Plugin is ready.");
  process.exit(0);
} else {
  console.log(`❌ Validation failed with ${errors} error(s).`);
  process.exit(1);
}
```
