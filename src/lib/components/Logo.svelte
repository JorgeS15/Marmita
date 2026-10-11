<script>
	/** @type {{ size?: number, class?: string }} */
	let { size = 64, class: klass = '' } = $props();
</script>

<img src="/icons/favicon.svg" width={size} height={size} alt="" class={klass} />
