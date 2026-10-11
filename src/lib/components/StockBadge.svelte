<script>
	import { fmtNum } from '$lib/constants.js';

	/** @type {{ quantity: number, planned: number, free: number }} */
	let { quantity, planned, free } = $props();
</script>

<span class="stock" aria-label="{fmtNum(quantity)} em stock, {fmtNum(planned)} planeadas, {fmtNum(free)} livres">
	<span class="badge">{fmtNum(quantity)} stock</span>
	<span class="badge" class:accent={planned > 0}>{fmtNum(planned)} plan.</span>
	<span class="badge" class:ok={free > 0} class:danger={free < 0}>
		{fmtNum(free)}
		{Math.abs(free) <= 1 ? 'livre' : 'livres'}
	</span>
</span>

<style>
	.stock {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
	}
</style>
