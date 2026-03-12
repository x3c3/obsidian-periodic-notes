<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";

  import { isMetaPressed } from "src/utils";
  import type { Granularity } from "src/types";
  import { DISPLAYED_MONTH } from "./context";
  import type CalendarFileStore from "./fileStore";

  let {
    date,
    fileStore,
    onHover,
    onClick,
    onContextMenu,
    today,
    activeFilePath = null,
  }: {
    date: Moment;
    fileStore: CalendarFileStore;
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
    today: Moment;
    activeFilePath: string | null;
  } = $props();

  const displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);

  let file: TFile | null = $state(null);

  $effect(() => {
    return fileStore.store.subscribe(() => {
      file = fileStore.getFile(date, "day");
    });
  });

  function handleClick(event: MouseEvent) {
    onClick?.("day", date, file, isMetaPressed(event));
  }

  function handleHover(event: PointerEvent) {
    if (event.target) {
      onHover?.("day", date, file, event.target, isMetaPressed(event));
    }
  }

  function handleContextmenu(event: MouseEvent) {
    onContextMenu?.("day", date, file, event);
  }
</script>

<td>
  <div
    class="day"
    class:active={file !== null && file.path === activeFilePath}
    class:adjacent-month={!date.isSame($displayedMonth, "month")}
    class:has-note={file !== null}
    class:today={date.isSame(today, "day")}
    onclick={handleClick}
    oncontextmenu={handleContextmenu}
    onpointerenter={handleHover}
  >
    {date.format("D")}
  </div>
</td>

<style>
  .day {
    background-color: var(--color-background-day);
    border-radius: 4px;
    color: var(--color-text-day);
    cursor: pointer;
    font-size: 0.8em;
    height: 100%;
    padding: 4px;
    position: relative;
    text-align: center;
    transition:
      background-color 0.1s ease-in,
      color 0.1s ease-in;
    vertical-align: baseline;
  }
  .day:hover {
    background-color: var(--interactive-hover);
  }

  .day.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .adjacent-month {
    opacity: 0.25;
  }

  .today {
    color: var(--color-text-today);
  }

  .day:active,
  .active,
  .active.today {
    color: var(--text-on-accent);
    background-color: var(--interactive-accent);
  }
</style>
