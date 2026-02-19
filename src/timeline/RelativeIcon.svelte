<script lang="ts">
  import { setIcon } from "obsidian";

  let iconEl: HTMLElement;

  $effect(() => {
    setIcon(iconEl, "arrow-right");
  });
</script>

<span bind:this={iconEl}></span>
