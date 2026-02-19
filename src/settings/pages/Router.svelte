<script lang="ts">
  import type { App } from "obsidian";

  import type CalendarSetManager from "src/calendarSetManager";
  import { router } from "src/settings/stores";
  import Breadcrumbs from "src/settings/components/Breadcrumbs.svelte";

  import Dashboard from "./dashboard/Dashboard.svelte";
  import Details from "./details/Details.svelte";
  import { writable, type Writable } from "svelte/store";
  import type { ISettings } from "..";
  import {
    getLocalizationSettings,
    type ILocalizationSettings,
  } from "../localization";

  let { app, manager, settings }: { app: App; manager: CalendarSetManager; settings: Writable<ISettings> } = $props();

  // svelte-ignore state_referenced_locally
  let localization = writable(getLocalizationSettings(app));

  $effect(() => {
    return () => {
      router.reset();
    };
  });
</script>

<Breadcrumbs />

{#if $router.path.length > 1}
  {#key $router.path[1]}
    <Details {app} {settings} {manager} selectedCalendarSet={$router.path[1]} />
  {/key}
{:else}
  <Dashboard {app} {settings} {localization} {manager} />
{/if}
