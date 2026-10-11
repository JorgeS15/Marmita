<script>
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/Logo.svelte';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Entrar · Marmita</title></svelte:head>

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
		<h1>Marmita</h1>

		{#if form?.error}<p class="alert" role="alert">{form.error}</p>{/if}

		<label class="field">
			<span>Utilizador</span>
			<input
				type="text"
				name="username"
				required
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				value={form?.username ?? ''}
			/>
		</label>
		<label class="field">
			<span>Palavra-passe</span>
			<input type="password" name="password" required autocomplete="current-password" />
		</label>
		<button class="btn primary block" disabled={busy}>Entrar</button>
		<p class="muted small" style="margin:0;text-align:center">v{__APP_VERSION__}</p>
	</form>
</main>
