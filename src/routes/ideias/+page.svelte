<script>
	import { page } from '$app/state';
	import { normalize } from '$lib/constants.js';
	import { fullDate } from '$lib/dates.js';

	let { data } = $props();

	let q = $state(page.url.searchParams.get('q') ?? '');
	const filtered = $derived.by(() => {
		const needle = normalize(q);
		if (!needle) return data.ideas;
		return data.ideas.filter((i) => normalize(i.title).includes(needle) || normalize(i.body).includes(needle));
	});

	/** Primeiras linhas do texto, para pré-visualização. @param {string} body */
	const preview = (body) => body.split('\n').filter(Boolean).slice(0, 3).join(' · ');
</script>

<svelte:head><title>Ideias · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<h1>Ideias</h1>
		<a class="btn primary" href="/ideias/nova">+ Nova</a>
	</header>

	<form method="GET" role="search" class="search" onsubmit={(e) => e.preventDefault()}>
		<label class="visually-hidden" for="q">Pesquisar ideias</label>
		<input id="q" type="search" name="q" placeholder="Pesquisar receitas e ideias…" bind:value={q} autocomplete="off" />
	</form>

	{#if data.ideas.length === 0}
		<div class="card empty stack">
			<p style="margin:0">Um bloco de notas para receitas, ideias de refeições, listas…</p>
			<a class="btn primary" href="/ideias/nova">Escrever a primeira ideia</a>
		</div>
	{:else if filtered.length === 0}
		<p class="muted">Nada encontrado.</p>
	{:else}
		<ul class="list">
			{#each filtered as idea (idea.id)}
				<li>
					<a class="card idea" href="/ideias/{idea.id}">
						<span class="title">{idea.title}</span>
						{#if idea.body}<span class="preview muted">{preview(idea.body)}</span>{/if}
						<span class="meta muted small">
							{[fullDate(idea.updated_at.slice(0, 10)), idea.updated_by_name ?? idea.created_by_name]
								.filter(Boolean)
								.join(' · ')}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.search {
		margin-bottom: 16px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.idea {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: inherit;
		text-decoration: none;
	}

	.title {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.preview {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.92rem;
	}

	.empty {
		text-align: center;
		align-items: center;
	}
</style>
