<script>
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	/**
	 * @type {{
	 *   publicKey: string,
	 *   devices: number,
	 *   prefs: Record<string, string | number>,
	 *   message?: { ok?: string, error?: string } | null
	 * }}
	 */
	let { publicKey, devices, prefs, message = null } = $props();

	const KINDS = [
		{ key: 'thaw', label: '🧊 Tirar do congelador', hint: 'Refeições de amanhã que vêm do congelador.' },
		{ key: 'preps', label: '🍳 Preparações de amanhã', hint: 'O que há para cozinhar amanhã.' },
		{ key: 'pending', label: '✓ Por confirmar', hint: 'Refeições de hoje (ou antes) ainda por marcar.' },
		{ key: 'expiry', label: '⏳ Validade a acabar', hint: 'Itens a consumir até hoje ou amanhã.' }
	];

	/** 'checking' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' */
	let status = $state('checking');
	let busy = $state(false);
	let feedback = $state('');

	/** @param {string} base64url */
	function keyBytes(base64url) {
		const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
		return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	}

	async function registration() {
		return navigator.serviceWorker.ready;
	}

	async function refreshState() {
		const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
		const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone;
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
			status = ios && !standalone ? 'ios-install' : 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			status = 'denied';
			return;
		}
		const sub = await (await registration()).pushManager.getSubscription();
		status = sub ? 'on' : 'off';
	}

	async function enable() {
		busy = true;
		feedback = '';
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				status = permission === 'denied' ? 'denied' : 'off';
				return;
			}
			const reg = await registration();
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
			const res = await fetch('/definicoes/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(sub.toJSON())
			});
			if (!res.ok) throw new Error(await res.text());
			status = 'on';
			feedback = 'Notificações ativadas neste dispositivo.';
			await invalidateAll();
		} catch (err) {
			feedback = `Não foi possível ativar: ${err instanceof Error ? err.message : err}`;
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		feedback = '';
		try {
			const sub = await (await registration()).pushManager.getSubscription();
			if (sub) {
				await fetch('/definicoes/push', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint })
				});
				await sub.unsubscribe();
			}
			status = 'off';
			feedback = 'Notificações desativadas neste dispositivo.';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function test() {
		busy = true;
		feedback = '';
		try {
			const res = await fetch('/definicoes/push?teste=1', { method: 'POST' });
			const { sent, failed } = await res.json();
			feedback = sent
				? `Notificação de teste enviada para ${sent} ${sent === 1 ? 'dispositivo' : 'dispositivos'}.`
				: `Não foi possível enviar (${failed} com erro). Volta a ativar as notificações.`;
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		refreshState().catch(() => (status = 'unsupported'));
	});
</script>

<section class="card stack" aria-labelledby="notif">
	<h2 id="notif">Notificações</h2>

	{#if status === 'checking'}
		<p class="muted small" style="margin:0">A verificar…</p>
	{:else if status === 'ios-install'}
		<p class="alert info small" style="margin:0">
			No iPhone, as notificações só funcionam com a app instalada: Partilhar → <strong>Adicionar ao ecrã principal</strong>,
			e depois abre a Marmita a partir do ícone (iOS 16.4 ou mais recente).
		</p>
	{:else if status === 'unsupported'}
		<p class="alert info small" style="margin:0">Este browser não suporta notificações push.</p>
	{:else if status === 'denied'}
		<p class="alert warn small" style="margin:0">
			As notificações estão bloqueadas para este site. Permite-as nas definições do browser/telemóvel e recarrega a página.
		</p>
	{:else}
		<div class="row">
			{#if status === 'on'}
				<span class="badge ok">Ativas neste dispositivo</span>
				<button class="btn small" onclick={test} disabled={busy}>Enviar teste</button>
				<button class="btn small ghost" onclick={disable} disabled={busy}>Desativar</button>
			{:else}
				<button class="btn primary" onclick={enable} disabled={busy}>🔔 Ativar neste dispositivo</button>
			{/if}
		</div>
	{/if}
	{#if feedback}<p class="muted small" role="status" style="margin:0">{feedback}</p>{/if}
	<p class="muted small" style="margin:0">
		{devices === 0
			? 'Ainda não ativaste as notificações em nenhum dispositivo.'
			: devices === 1
				? 'Ativas em 1 dos teus dispositivos.'
				: `Ativas em ${devices} dos teus dispositivos.`}
		Cada pessoa recebe só o que lhe diz respeito (e o que é para Ambos).
	</p>

	{#if message?.error}<p class="alert" role="alert">{message.error}</p>{/if}
	{#if message?.ok}<p class="alert ok" role="status">{message.ok}</p>{/if}
	<form method="POST" action="?/notifications" class="stack" use:enhance={() => async ({ update }) => update({ reset: false })}>
		{#each KINDS as k (k.key)}
			<div class="pref">
				<label class="toggle">
					<input type="checkbox" name={k.key} value="1" checked={!!prefs[k.key]} />
					<span>
						<strong>{k.label}</strong>
						<span class="muted small">{k.hint}</span>
					</span>
				</label>
				<label class="time">
					<span class="visually-hidden">Hora de "{k.label}"</span>
					<input type="time" name="{k.key}_time" value={prefs[`${k.key}_time`]} required />
				</label>
			</div>
		{/each}
		<button class="btn">Guardar notificações</button>
	</form>
</section>

<style>
	.pref {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.toggle {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 44px;
		cursor: pointer;
		flex: 1;
		min-width: 0;
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

	.time input {
		width: 128px;
	}

	input[type='time'] {
		min-height: 44px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
</style>
