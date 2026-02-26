<script lang="ts">
  import type { App } from "obsidian";
  import type { Writable } from "svelte/store";

  import type { Settings } from "src/settings";
  import SettingItem from "src/settings/components/SettingItem.svelte";
  import Toggle from "src/settings/components/Toggle.svelte";
  import Dropdown from "src/settings/components/Dropdown.svelte";
  import Footer from "src/settings/components/Footer.svelte";
  import {
    getLocaleOptions,
    getWeekStartOptions,
  } from "src/settings/utils";
  import {
    getLocalizationSettings,
    type WeekStartOption,
  } from "src/settings/localization";
  import { granularities } from "src/types";

  import GettingStartedBanner from "./dashboard/GettingStartedBanner.svelte";
  import PeriodicGroup from "./details/PeriodicGroup.svelte";

  let { app, settings }: {
    app: App;
    settings: Writable<Settings>;
  } = $props();

  // svelte-ignore state_referenced_locally
  let localization = $state(getLocalizationSettings(app));
</script>

{#if $settings.showGettingStartedBanner}
  <GettingStartedBanner
    {app}
    handleTeardown={() => {
      $settings.showGettingStartedBanner = false;
    }}
  />
{/if}

<h3>Periodic Notes</h3>
<div class="periodic-groups">
  {#each granularities as granularity}
    <PeriodicGroup {app} {granularity} {settings} />
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
      value={localization.weekStart}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value as WeekStartOption;
        localization.weekStart = val;
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
      value={localization.localeOverride}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        localization.localeOverride = val;
        app.vault.setConfig("localeOverride", val);
      }}
    />
  {/snippet}
</SettingItem>

<Footer />

<style>
  .periodic-groups {
    margin-top: 1em;
  }
</style>
