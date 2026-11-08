<script>
  let { nom } = $props();
  let clics = $state(0);
</script>

<button type="button" onclick={() => (clics += 1)}>Svelte {nom} {clics}</button>
