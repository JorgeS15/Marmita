<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	/**
	 * Painel modal (bottom sheet no telemóvel, caixa centrada no ecrã largo).
	 * O estado aberto/fechado vive no URL, por isso funciona sem JS e o botão
	 * "voltar" do telemóvel também o fecha.
	 * @type {{ title: string, subtitle?: string, closeHref: string, children: import('svelte').Snippet }}
	 */
	let { title, subtitle = '', closeHref, children } = $props();

	/** @type {HTMLElement | undefined} */
	let panel = $state();

	// Área visível acima do teclado (visualViewport). Sem isto, no telemóvel o
	// teclado tapa o fundo do painel e o botão de submeter.
	let viewportHeight = $state(0);
	let viewportTop = $state(0);
	const rootStyle = $derived(
		viewportHeight ? `top: ${viewportTop}px; bottom: auto; height: ${viewportHeight}px` : ''
	);

	/** Traz o campo em foco para a zona visível depois de o teclado abrir. @param {FocusEvent} e */
	function onFocusIn(e) {
		const el = /** @type {HTMLElement} */ (e.target);
		if (!el.matches('input, textarea, select')) return;
		setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
	}
	const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

	function close() {
		goto(closeHref, { replaceState: true, noScroll: true, keepFocus: false });
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	onMount(() => {
		const previous = /** @type {HTMLElement | null} */ (document.activeElement);
		panel?.focus({ preventScroll: true });
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const vv = window.visualViewport;
		const syncViewport = () => {
			if (!vv) return;
			viewportHeight = vv.height;
			viewportTop = vv.offsetTop;
		};
		syncViewport();
		vv?.addEventListener('resize', syncViewport);
		vv?.addEventListener('scroll', syncViewport);

		return () => {
			vv?.removeEventListener('resize', syncViewport);
			vv?.removeEventListener('scroll', syncViewport);
			document.body.style.overflow = overflow;
			previous?.focus?.({ preventScroll: true });
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sheet-root" style={rootStyle}>
	<a class="backdrop" href={closeHref} data-sveltekit-replacestate data-sveltekit-noscroll aria-label="Fechar" tabindex="-1"></a>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		tabindex="-1"
		bind:this={panel}
		onfocusin={onFocusIn}
	>
		<div class="grabber" aria-hidden="true"></div>
		<header>
			<div class="titles">
				<h2 id={titleId}>{title}</h2>
				{#if subtitle}<p class="muted small">{subtitle}</p>{/if}
			</div>
			<a class="btn icon ghost" href={closeHref} data-sveltekit-replacestate data-sveltekit-noscroll aria-label="Fechar">✕</a>
		</header>
		<div class="content">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.sheet-root {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.45);
		animation: fade 0.15s ease-out;
	}

	.panel {
		position: relative;
		width: 100%;
		max-width: 560px;
		max-height: calc(100% - 24px);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-radius: 20px 20px 0 0;
		box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
		padding-bottom: env(safe-area-inset-bottom);
		animation: slide 0.2s ease-out;
		outline: none;
	}

	.grabber {
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		margin: 8px auto 0;
	}

	header {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 12px 8px 16px;
		border-bottom: 1px solid var(--border);
	}

	.titles {
		flex: 1;
		min-width: 0;
		padding-top: 8px;
	}

	.titles h2 {
		overflow-wrap: anywhere;
	}

	.titles p {
		margin: 2px 0 0;
	}

	.content {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 16px;
	}

	/* Botão de submeter sempre visível no fundo do painel. */
	.content :global(.sheet-actions) {
		position: sticky;
		bottom: -16px;
		margin: 0 -16px -16px;
		padding: 12px 16px 16px;
		background: var(--surface);
		border-top: 1px solid var(--border);
		z-index: 1;
	}

	@media (min-width: 720px) {
		.sheet-root {
			align-items: center;
		}

		.panel {
			border-radius: 20px;
			max-height: calc(100% - 48px);
		}

		.grabber {
			display: none;
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@keyframes slide {
		from {
			transform: translateY(40px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.panel {
			animation: none;
		}
	}
</style>
