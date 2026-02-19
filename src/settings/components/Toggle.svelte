<script lang="ts">
  export let isEnabled: boolean;
  export let onChange: (value: boolean) => void;
</script>

<div
  class="checkbox-container"
  class:is-enabled={isEnabled}
  role="button"
  tabindex="0"
  on:click={() => onChange(!isEnabled)}
  on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange(!isEnabled); }}
></div>
