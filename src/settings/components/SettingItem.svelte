<script lang="ts">
  import type { Snippet } from "svelte";

  let { name, description, isHeading, type, control }: {
    name: string;
    description: string;
    isHeading: boolean;
    type: "dropdown" | "toggle";
    control?: Snippet;
  } = $props();
</script>

<div
  class="setting-item"
  class:setting-item-heading={isHeading}
  class:mod-dropdown={type === "dropdown"}
>
  <div class="setting-item-info">
    <div class="setting-item-name">
      <div>
        {name}
      </div>
    </div>
    {#if description}
      <div class="setting-item-description">
        {description}
      </div>
    {/if}
  </div>
  <div class="setting-item-control">
    {@render control?.()}
  </div>
</div>
