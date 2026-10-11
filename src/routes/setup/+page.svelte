<script>
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/Logo.svelte';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Configuração inicial · Marmita</title></svelte:head>

<main class="auth">
	<form
		class="card"
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<Logo class="logo" />
		<h1>Bem-vindo à Marmita</h1>
		<p class="muted small" style="margin:0;text-align:center">
			Cria a primeira conta. Depois podes adicionar a segunda pessoa em Definições.
		</p>

		{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

		<label class="field">
			<span>Nome</span>
			<input type="text" name="display_name" autocomplete="name" maxlength="60" placeholder="Ex.: Ana" />
		</label>
		<label class="field">
			<span>Utilizador</span>
			<input
				type="text"
				name="username"
				required
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				maxlength="40"
			/>
		</label>
		<label class="field">
			<span>Palavra-passe <span class="hint">(mín. 8 caracteres)</span></span>
			<input type="password" name="password" required minlength="8" autocomplete="new-password" />
		</label>
		<label class="field">
			<span>Confirmar palavra-passe</span>
			<input type="password" name="password_confirm" required minlength="8" autocomplete="new-password" />
		</label>
		<button class="btn primary block" disabled={busy}>Criar conta</button>
		<p class="muted small" style="margin:0;text-align:center">v{__APP_VERSION__}</p>
	</form>
</main>
