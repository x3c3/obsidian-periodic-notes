<script lang="ts">
  interface SelectOption {
    label: string;
    value: string;
  }

  let { onChange, options = [], value }: { onChange: (e: Event) => void; options?: SelectOption[]; value: string } = $props();
</script>

<select class="dropdown" onchange={onChange} {value}>
  {#each options as { label, value }}
    <option {value}>{label}</option>
  {/each}
</select>
