import {
  type App,
  type Command,
  Menu,
  Notice,
  type Point,
  TFile,
} from "obsidian";
import type PeriodicNotesPlugin from "./main";
import { type Granularity, granularities } from "./types";

interface GranularityLabel {
  periodicity: string;
  relativeUnit: string;
  labelOpenPresent: string;
}

export const granularityLabels: Record<Granularity, GranularityLabel> = {
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
  year: {
    periodicity: "yearly",
    relativeUnit: "this year",
    labelOpenPresent: "Open this year's note",
  },
};

async function jumpToAdjacentNote(
  app: App,
  plugin: PeriodicNotesPlugin,
  direction: "forwards" | "backwards",
): Promise<void> {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) return;
  const meta = plugin.findInCache(activeFile.path);
  if (!meta) return;

  const adjacent = plugin.findAdjacent(activeFile.path, direction);
  if (adjacent) {
    const file = app.vault.getAbstractFileByPath(adjacent.filePath);
    if (file && file instanceof TFile) {
      const leaf = app.workspace.getLeaf();
      await leaf.openFile(file, { active: true });
    }
  } else {
    const qualifier = direction === "forwards" ? "after" : "before";
    new Notice(
      `There's no ${granularityLabels[meta.granularity].periodicity} note ${qualifier} this`,
    );
  }
}

async function openAdjacentNote(
  app: App,
  plugin: PeriodicNotesPlugin,
  direction: "forwards" | "backwards",
): Promise<void> {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) return;
  const meta = plugin.findInCache(activeFile.path);
  if (!meta) return;

  const offset = direction === "forwards" ? 1 : -1;
  const adjacentDate = meta.date.clone().add(offset, meta.granularity);
  plugin.openPeriodicNote(meta.granularity, adjacentDate);
}

export function getCommands(
  app: App,
  plugin: PeriodicNotesPlugin,
  granularity: Granularity,
): Command[] {
  const label = granularityLabels[granularity];

  return [
    {
      id: `open-${label.periodicity}-note`,
      name: label.labelOpenPresent,
      checkCallback: (checking: boolean) => {
        if (!plugin.settings.granularities[granularity].enabled) return false;
        if (checking) return true;
        plugin.openPeriodicNote(granularity, window.moment());
      },
    },
    {
      id: `next-${label.periodicity}-note`,
      name: `Jump forwards to closest ${label.periodicity} note`,
      checkCallback: (checking: boolean) => {
        if (!plugin.settings.granularities[granularity].enabled) return false;
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        jumpToAdjacentNote(app, plugin, "forwards");
      },
    },
    {
      id: `prev-${label.periodicity}-note`,
      name: `Jump backwards to closest ${label.periodicity} note`,
      checkCallback: (checking: boolean) => {
        if (!plugin.settings.granularities[granularity].enabled) return false;
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        jumpToAdjacentNote(app, plugin, "backwards");
      },
    },
    {
      id: `open-next-${label.periodicity}-note`,
      name: `Open next ${label.periodicity} note`,
      checkCallback: (checking: boolean) => {
        if (!plugin.settings.granularities[granularity].enabled) return false;
        const activeFile = app.workspace.getActiveFile();
        if (checking) {
          if (!activeFile) return false;
          return plugin.isPeriodic(activeFile.path, granularity);
        }
        openAdjacentNote(app, plugin, "forwards");
      },
    },
    {
      id: `open-prev-${label.periodicity}-note`,
      name: `Open previous ${label.periodicity} note`,
      checkCallback: (checking: boolean) => {
        if (!plugin.settings.granularities[granularity].enabled) return false;
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

export function showContextMenu(
  plugin: PeriodicNotesPlugin,
  position: Point,
): void {
  const menu = new Menu();
  const enabled = granularities.filter(
    (g) => plugin.settings.granularities[g].enabled,
  );

  for (const granularity of enabled) {
    const label = granularityLabels[granularity];
    menu.addItem((item) =>
      item
        .setTitle(label.labelOpenPresent)
        .setIcon(`calendar-${granularity}`)
        .onClick(() => plugin.openPeriodicNote(granularity, window.moment())),
    );
  }

  menu.showAtPosition(position);
}
