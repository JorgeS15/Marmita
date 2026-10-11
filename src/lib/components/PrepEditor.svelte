<script>
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import PersonPicker from './PersonPicker.svelte';
	import { weekStartOf } from '$lib/dates.js';

	/**
	 * Edição direta de uma preparação: grava sozinha ao mudar e ao fechar o painel.
	 * @type {{
	 *   prep: { id: number, title: string, notes: string, date: string, person_id: number | null },
	 *   users: { id: number, display_name: string, color: string }[],
	 *   week: string
	 * }}
	 */
	let { prep, users, week } = $props();

	/** @type {HTMLFormElement | undefined} */
	let form = $state();
	/** '' | 'pending' | 'saving' | 'saved' | 'error' */
	let status = $state('');
	let message = $state('');
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	let dirty = false;

	/** @param {boolean} [keepalive] */
	async function save(keepalive = false) {
		clearTimeout(timer);
		if (!form || !dirty) return;
		const data = new FormData(form);
		if (!String(data.get('title') ?? '').trim()) {
			status = 'error';
			message = 'O nome não pode ficar vazio.';
			return;
		}
		dirty = false;
		status = 'saving';
		try {
			const res = await fetch('?/prepUpdate', {
				method: 'POST',
				body: data,
				headers: { 'x-sveltekit-action': 'true' },
				keepalive
			});
			const result = await res.json().catch(() => ({}));
			if (result.type === 'failure') {
				status = 'error';
				message = String(result.data ?? 'Não foi possível guardar.');
				try {
					message = JSON.parse(result.data).at(-1);
				} catch {
					/* mensagem genérica */
				}
				return;
			}
			status = 'saved';
			const date = String(data.get('date'));
			if (!keepalive && weekStartOf(date) !== week) {
				// Mudou de semana: acompanha a preparação.
				await goto(`/?w=${weekStartOf(date)}&preparacao=${prep.id}`, { replaceState: true, noScroll: true });
			}
		} catch {
			status = 'error';
			message = 'Sem ligação: não foi guardado.';
			dirty = true;
		}
	}

	function schedule() {
		dirty = true;
		status = 'pending';
		clearTimeout(timer);
		timer = setTimeout(() => save(), 800);
	}

	onDestroy(() => {
		if (dirty) save(true).then(() => invalidateAll());
		else if (status === 'saved') invalidateAll();
	});
</script>

<form
	method="POST"
	action="?/prepUpdate"
	class="stack"
	bind:this={form}
	oninput={schedule}
	onchange={schedule}
	onsubmit={(e) => {
		e.preventDefault();
		dirty = true;
		save();
	}}
>
	<input type="hidden" name="w" value={week} />
	<input type="hidden" name="id" value={prep.id} />
	<label class="field">
		<span>Preparação</span>
		<input type="text" name="title" required maxlength="100" value={prep.title} />
	</label>
	<PersonPicker {users} value={prep.person_id} />
	<label class="field">
		<span>Dia</span>
		<input type="date" name="date" value={prep.date} required />
	</label>
	<label class="field">
		<span>Notas</span>
		<textarea name="notes" maxlength="2000" rows="5" placeholder="Ingredientes, passos, o que descongelar…">{prep.notes}</textarea>
	</label>
	<p class="save-status small" aria-live="polite">
		{#if status === 'pending' || status === 'saving'}
			<span class="muted">A guardar…</span>
		{:else if status === 'saved'}
			<span class="ok">✓ Guardado</span>
		{:else if status === 'error'}
			<span class="err">{message}</span>
		{:else}
			<span class="muted">As alterações são guardadas automaticamente.</span>
		{/if}
	</p>
	<noscript><button class="btn primary">Guardar</button></noscript>
</form>

<style>
	.save-status {
		margin: 0;
		min-height: 1.2em;
	}

	.ok {
		color: var(--ok);
		font-weight: 600;
	}

	.err {
		color: var(--danger);
		font-weight: 600;
	}
</style>
