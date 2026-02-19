<script lang="ts">
  import { type App, setIcon } from "obsidian";
  import type { Writable } from "svelte/store";

  import CalendarSetManager from "src/calendarSetManager";
  import { router } from "src/settings/stores";
  import type { Settings } from "src/settings/index";
  import Dropdown from "src/settings/components/Dropdown.svelte";
  import Footer from "src/settings/components/Footer.svelte";
  import SettingItem from "src/settings/components/SettingItem.svelte";
  import Toggle from "src/settings/components/Toggle.svelte";
  import {
    createNewCalendarSet,
    getLocaleOptions,
    getWeekStartOptions,
  } from "src/settings/utils";
  import {
    configureGlobalMomentLocale,
    type LocalizationSettings,
    type WeekStartOption,
  } from "src/settings/localization";

  import GettingStartedBanner from "./GettingStartedBanner.svelte";
  import CalendarSetMenuItem from "./calendarSets/MenuItem.svelte";

  let { app, manager, localization, settings }: {
    app: App;
    manager: CalendarSetManager;
    localization: Writable<LocalizationSettings>;
    settings: Writable<Settings>;
  } = $props();

  let addEl: HTMLElement;

  function addCalendarset(): void {
    let iter = 1;
    const calSets = $settings.calendarSets;
    while (calSets.find((set) => set.id === `Calendar set ${iter}`)) {
      iter++;
    }
    const id = `Calendar set ${iter}`;
    settings.update(createNewCalendarSet(id));
    router.navigate(["Periodic Notes", id], {
      shouldRename: true,
    });
  }

  $effect(() => {
    setIcon(addEl, "plus");
  });
</script>

{#if $settings.showGettingStartedBanner}
  <GettingStartedBanner
    {app}
    handleTeardown={() => {
      $settings.showGettingStartedBanner = false;
    }}
  />
{/if}

<div class="section-nav">
  <h3 class="section-title">Calendar Sets</h3>
  <div class="clickable-icon" bind:this={addEl} role="button" tabindex="0" onclick={addCalendarset} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') addCalendarset(); }}></div>
</div>
<div class="calendarset-container">
  {#each $settings.calendarSets as calendarSet}
    <CalendarSetMenuItem
      {calendarSet}
      {manager}
      {settings}
      viewDetails={() => router.navigate(["Periodic Notes", calendarSet.id])}
    />
  {/each}
</div>

<SettingItem
  name="Show &ldquo;Timeline&rdquo; complication on periodic notes"
  description="Adds a collapsible timeline to the top-right of all periodic notes"
  type="toggle"
  isHeading={false}
>
  {#snippet control()}
    <Toggle
      isEnabled={$settings.enableTimelineComplication}
      onChange={(val) => {
        $settings.enableTimelineComplication = val;
      }}
    />
  {/snippet}
</SettingItem>

<h3>Localization</h3>
<div class="setting-item-description">
  These settings are applied to your entire vault, meaning the values you
  specify here may impact other plugins as well.
</div>
<SettingItem
  name="Start week on"
  description="Choose what day of the week to start. Select 'locale default' to use the default specified by moment.js"
  type="dropdown"
  isHeading={false}
>
  {#snippet control()}
    <Dropdown
      options={getWeekStartOptions()}
      value={$localization.weekStart}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value as WeekStartOption;
        $localization.weekStart = val;
        app.vault.setConfig("weekStart", val);
      }}
    />
  {/snippet}
</SettingItem>

<SettingItem
  name="Locale"
  description="Override the locale used by the calendar and other plugins"
  type="dropdown"
  isHeading={false}
>
  {#snippet control()}
    <Dropdown
      options={getLocaleOptions()}
      value={$localization.localeOverride}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        $localization.localeOverride = val;
        app.vault.setConfig("weekStart", val);
      }}
    />
  {/snippet}
</SettingItem>

<Footer />

<style>
  .calendarset-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    padding-bottom: 1.4em;
  }

  .section-title {
    margin: 0;
  }

  .section-nav {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin: 2em 0 0.8em;
  }
</style>
