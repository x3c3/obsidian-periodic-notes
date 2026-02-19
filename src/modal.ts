import { type App, Menu, type Point } from "obsidian";
import type PeriodicNotesPlugin from "src/main";

import { displayConfigs } from "./commands";

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
