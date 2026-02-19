import { MarkdownView } from "obsidian";
import type { PeriodicNotesCache } from "src/cache";
import type PeriodicNotesPlugin from "src/main";
import { mount, unmount } from "svelte";

import Timeline from "./Timeline.svelte";

interface MountedTimeline {
  component: Record<string, never>;
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
