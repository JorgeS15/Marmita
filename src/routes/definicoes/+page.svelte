<script>
	import { enhance } from '$app/forms';
	import { PERSON_COLORS } from '$lib/constants.js';
	import PushSettings from '$lib/components/PushSettings.svelte';

	let { data, form } = $props();

	/** @param {string} section */
	const msg = (section) => (form?.section === section ? form : null);

	/** Mantém os valores após erro, limpa após sucesso. */
	const submit = () => async ({ update, result }) => {
		await update({ reset: result.type === 'success' });
	};
</script>

<svelte:head><title>Definições · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header"><h1>Definições</h1></header>

	<div class="stack">
		<section class="card stack" aria-labelledby="perfil">
			<h2 id="perfil">Perfil</h2>
			<p class="muted small" style="margin:0">Utilizador: <strong>{data.user?.username}</strong></p>
			{#if msg('profile')?.error}<p class="alert" role="alert">{msg('profile')?.error}</p>{/if}
			{#if msg('profile')?.ok}<p class="alert ok" role="status">{msg('profile')?.ok}</p>{/if}
			<form method="POST" action="?/profile" use:enhance={() => async ({ update }) => update({ reset: false })} class="stack">
				<label class="field">
					<span>Nome a mostrar</span>
					<input type="text" name="display_name" required maxlength="60" value={data.user?.display_name} />
				</label>
				<fieldset class="colors">
					<legend>Cor no calendário</legend>
					<div class="swatches">
						{#each PERSON_COLORS as c (c.value)}
							<label class="swatch" style="--c: {c.value}" title={c.label}>
								<input type="radio" name="color" value={c.value} checked={data.user?.color === c.value} />
								<span class="visually-hidden">{c.label}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				<button class="btn">Guardar perfil</button>
			</form>
		</section>

		<section class="card stack" aria-labelledby="casa">
			<h2 id="casa">Refeições da casa</h2>
			<p class="muted small" style="margin:0">Aplica-se a todas as pessoas e dispositivos.</p>
			{#if msg('house')?.ok}<p class="alert ok" role="status">{msg('house')?.ok}</p>{/if}
			<form method="POST" action="?/house" use:enhance={() => async ({ update }) => update({ reset: false })} class="stack">
				<label class="toggle">
					<input type="checkbox" name="morning_snack" value="1" checked={data.settings.morningSnack} />
					<span>
						<strong>Lanche da manhã</strong>
						<span class="muted small">Desligado, fica só o lanche da tarde, com o nome "Lanche".</span>
					</span>
				</label>
				<label class="toggle">
					<input type="checkbox" name="confirmations" value="1" checked={data.settings.confirmations} />
					<span>
						<strong>Confirmar o que foi comido</strong>
						<span class="muted small">
							Ligado, as refeições que já passaram ficam "Por confirmar" (Comido / Não comido). Desligado, contam
							automaticamente como comidas e saem do stock quando passa a hora da refeição.
						</span>
					</span>
				</label>
				<button class="btn">Guardar</button>
			</form>
		</section>

		<PushSettings
			publicKey={data.push.publicKey}
			devices={data.push.devices}
			prefs={data.push.prefs}
			message={msg('notifications')}
		/>

		<section class="card stack" aria-labelledby="pw">
			<h2 id="pw">Mudar palavra-passe</h2>
			{#if msg('password')?.error}<p class="alert" role="alert">{msg('password')?.error}</p>{/if}
			{#if msg('password')?.ok}<p class="alert ok" role="status">{msg('password')?.ok}</p>{/if}
			<form method="POST" action="?/password" use:enhance={submit} class="stack">
				<label class="field">
					<span>Palavra-passe atual</span>
					<input type="password" name="current" required autocomplete="current-password" />
				</label>
				<label class="field">
					<span>Nova palavra-passe <span class="hint">(mín. 8 caracteres)</span></span>
					<input type="password" name="password" required minlength="8" autocomplete="new-password" />
				</label>
				<label class="field">
					<span>Confirmar nova palavra-passe</span>
					<input type="password" name="password_confirm" required minlength="8" autocomplete="new-password" />
				</label>
				<button class="btn">Alterar palavra-passe</button>
			</form>
		</section>

		<section class="card stack" aria-labelledby="users">
			<h2 id="users">Pessoas da casa</h2>
			<ul class="users">
				{#each data.users as u (u.id)}
					<li>
						<span class="dot" style="background: {u.color}" aria-hidden="true"></span>
						<strong>{u.display_name}</strong> <span class="muted small">@{u.username}</span>
					</li>
				{/each}
			</ul>
			<details open={!!msg('addUser')}>
				<summary class="btn">+ Adicionar pessoa</summary>
				<div class="stack" style="margin-top:12px">
					{#if msg('addUser')?.error}<p class="alert" role="alert">{msg('addUser')?.error}</p>{/if}
					{#if msg('addUser')?.ok}<p class="alert ok" role="status">{msg('addUser')?.ok}</p>{/if}
					<form method="POST" action="?/addUser" use:enhance={submit} class="stack">
						<label class="field">
							<span>Nome</span>
							<input type="text" name="display_name" maxlength="60" autocomplete="off" />
						</label>
						<label class="field">
							<span>Utilizador</span>
							<input type="text" name="username" required maxlength="40" autocapitalize="none" spellcheck="false" autocomplete="off" />
						</label>
						<label class="field">
							<span>Palavra-passe <span class="hint">(mín. 8 caracteres)</span></span>
							<input type="password" name="password" required minlength="8" autocomplete="new-password" />
						</label>
						<label class="field">
							<span>Confirmar palavra-passe</span>
							<input type="password" name="password_confirm" required minlength="8" autocomplete="new-password" />
						</label>
						<button class="btn primary">Criar conta</button>
					</form>
				</div>
			</details>
		</section>

		<section class="card stack" aria-labelledby="dados">
			<h2 id="dados">Dados</h2>
			<p class="muted small" style="margin:0">
				Cópia completa da base de dados (serve para repor: substitui <code>data/marmita.db</code>) ou export
				legível em JSON.
			</p>
			<div class="row">
				<a class="btn" href="/definicoes/backup" download data-sveltekit-reload>Descarregar base de dados</a>
				<a class="btn" href="/definicoes/export" download data-sveltekit-reload>Exportar JSON</a>
			</div>
			<p class="muted small" style="margin:0">
				{#if data.backups.length}
					Cópias automáticas diárias no servidor: {data.backups.length}
					(última: {data.backups[0].name.replace('marmita-', '').replace('.db', '')}), em
					<code>data/backups/</code>.
				{:else}
					Ainda não há cópias automáticas (são feitas uma vez por dia, em <code>data/backups/</code>).
				{/if}
			</p>
		</section>

		<section class="card stack">
			<form method="POST" action="/logout">
				<button class="btn danger block">Terminar sessão</button>
			</form>
		</section>
	</div>
</main>

<style>
	.users {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.toggle {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 44px;
		cursor: pointer;
	}

	.toggle input {
		width: 22px;
		height: 22px;
		margin-top: 2px;
		accent-color: var(--accent);
		flex: none;
	}

	.toggle > span {
		display: flex;
		flex-direction: column;
	}

	.users li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex: none;
	}

	.colors {
		border: 0;
		margin: 0;
		padding: 0;
	}

	.colors legend {
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0;
		margin-bottom: 6px;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.swatch {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--c);
		cursor: pointer;
		display: grid;
		place-items: center;
		border: 3px solid transparent;
	}

	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.swatch:has(input:checked) {
		border-color: var(--surface);
		box-shadow: 0 0 0 3px var(--c);
	}

	.swatch:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 4px;
	}

	summary {
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>
