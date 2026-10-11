<script>
	import { enhance } from '$app/forms';

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
				<button class="btn">Guardar nome</button>
			</form>
		</section>

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
					<li><strong>{u.display_name}</strong> <span class="muted small">@{u.username}</span></li>
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
			<p class="muted small" style="margin:0">Descarrega uma cópia do inventário e do calendário em JSON.</p>
			<a class="btn" href="/definicoes/export" download data-sveltekit-reload>Exportar JSON</a>
		</section>

		<section class="card stack">
			<form method="POST" action="/logout">
				<button class="btn danger block">Terminar sessão</button>
			</form>
			<p class="muted small" style="margin:0;text-align:center">Marmita v{data.version}</p>
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

	summary {
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>
