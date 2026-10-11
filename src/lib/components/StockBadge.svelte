<script>
	/** @type {{ quantity: number, planned: number, free: number }} */
	let { quantity, planned, free } = $props();
</script>

<span class="stock" aria-label="{quantity} em stock, {planned} planeadas, {free} livres">
	<span class="badge">{quantity} stock</span>
	<span class="badge" class:accent={planned > 0}>{planned} plan.</span>
	<span class="badge" class:ok={free > 0} class:danger={free < 0}>
		{free}
		{Math.abs(free) === 1 ? 'livre' : 'livres'}
	</span>
</span>

<style>
	.stock {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
	}
</style>
