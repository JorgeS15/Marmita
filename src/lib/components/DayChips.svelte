<script>
	import { addDays, dayMonth, weekdayShort } from '$lib/dates.js';

	/**
	 * Caixas para escolher vários dias (esta semana e a seguinte).
	 * @type {{ start: string, today: string, exclude?: string, name?: string }}
	 */
	let { start, today, exclude = '', name = 'dates' } = $props();

	const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(start, i)));
</script>

<fieldset class="days">
	<legend>Para que dias?</legend>
	<div class="grid">
		{#each days as d (d)}
			<label class="day" class:past={d < today} class:same={d === exclude}>
				<input type="checkbox" {name} value={d} />
				<span class="wd">{weekdayShort(d)}</span>
				<span class="dm">{dayMonth(d)}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.days {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}

	legend {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 6px;
		padding: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
	}

	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		line-height: 1.2;
		cursor: pointer;
		text-align: center;
	}

	.day input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.wd {
		font-weight: 700;
		text-transform: capitalize;
	}

	.dm {
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.day.past {
		opacity: 0.55;
	}

	.day.same {
		border-style: dashed;
	}

	.day:has(input:checked) {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}

	.day:has(input:checked) .dm {
		color: inherit;
	}

	.day:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}
</style>
