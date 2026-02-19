<script lang="ts">
  let { isEnabled, onChange }: { isEnabled: boolean; onChange: (value: boolean) => void } = $props();
</script>

<div
  class="checkbox-container"
  class:is-enabled={isEnabled}
  role="button"
  tabindex="0"
  onclick={() => onChange(!isEnabled)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange(!isEnabled); }}
></div>
