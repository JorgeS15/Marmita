<script>
	/**
	 * Escolha da pessoa a quem se destina a refeição (rádio em forma de "chips").
	 * Valor "" = todos.
	 * @type {{
	 *   users: { id: number, display_name: string, color: string }[],
	 *   value?: number | null,
	 *   name?: string
	 * }}
	 */
	let { users, value = null, name = 'person_id' } = $props();

	const everyone = $derived(users.length === 2 ? 'Ambos' : 'Todos');
</script>

<fieldset class="people">
	<legend>Para quem?</legend>
	<div class="options">
		{#each users as u (u.id)}
			<label class="person" style="--person: {u.color}">
				<input type="radio" {name} value={u.id} checked={value === u.id} />
				<span class="dot" aria-hidden="true"></span>
				{u.display_name}
			</label>
		{/each}
		<label class="person all" style="--a: {users[0]?.color ?? '#888'}; --b: {users[1]?.color ?? users[0]?.color ?? '#888'}">
			<input type="radio" {name} value="" checked={value == null} />
			<span class="dot" aria-hidden="true"></span>
			{everyone}
		</label>
	</div>
</fieldset>

<style>
	.people {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}

	legend {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 4px;
		padding: 0;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.person {
		--person: var(--text-muted);
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}

	.person input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--person);
	}

	.all .dot {
		background: conic-gradient(var(--a) 0 50%, var(--b) 50% 100%);
	}

	.person:has(input:checked) {
		border-color: var(--person);
		background: color-mix(in srgb, var(--person) 16%, var(--surface));
		box-shadow: inset 0 0 0 1px var(--person);
	}

	.all:has(input:checked) {
		border-color: var(--text);
		box-shadow: inset 0 0 0 1px var(--text);
		background: var(--surface-2);
	}

	.person:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
</style>
