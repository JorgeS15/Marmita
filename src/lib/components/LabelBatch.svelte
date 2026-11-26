<script>
	// Várias etiquetas de uma vez (ex.: as caixas de uma preparação, divididas por local).
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { LOCATIONS, fmtNum, labelOf } from '$lib/constants.js';
	import { LABEL_SIZES, itemQrUrl, labelContent, labelDots } from '$lib/labels/model.js';
	import { drawLabel } from '$lib/labels/render.js';
	import PrinterControls from './PrinterControls.svelte';
	import {
		canPrint,
		impressao,
		initLabelPrefs,
		labelPrefs,
		printLabels,
		progressPct,
		resetImpressao,
		saveLabelPrefs
	} from '$lib/labels/printing.svelte.js';

	/** @type {{ groups: import('$lib/labels/model.js').LabelGroup[], ha: { id: string, name: string } | null, haConfigured?: boolean, origin?: string | null, open?: boolean, title?: string }} */
	let { groups, ha, haConfigured = false, origin = null, open = false, title = 'Etiquetas para as caixas' } = $props();

	/**
	 * Uma etiqueta por dose (doses inteiras, até 20); com meias doses ou mais de 20, uma etiqueta para tudo.
	 * @param {number} units
	 */
	const defaultCount = (units) => (Number.isInteger(units) && units <= 20 ? units : 1);

	/** Etiquetas por grupo (texto, como nos campos). @type {Record<string, number>} */
	let counts = $state({});
	$effect(() => {
		for (const g of groups) if (!(g.key in counts)) counts[g.key] = defaultCount(g.units);
	});

	onMount(() => {
		initLabelPrefs();
		resetImpressao();
	});

	/** @param {import('$lib/labels/model.js').LabelGroup} g */
	const countOf = (g) => Math.min(20, Math.max(0, Math.floor(counts[g.key] ?? defaultCount(g.units)) || 0));
	/** Doses em cada etiqueta do grupo. @param {import('$lib/labels/model.js').LabelGroup} g */
	const dosesEach = (g) => (countOf(g) ? Math.round((g.units / countOf(g)) * 100) / 100 : g.units);
	/** @param {import('$lib/labels/model.js').LabelGroup} g */
	const contentOf = (g) =>
		labelContent(g.item, {
			showStored: labelPrefs.showStored,
			showBestBefore: labelPrefs.showBestBefore,
			showDoses: labelPrefs.showDoses,
			doses: dosesEach(g),
			qr: labelPrefs.showQr && g.item.id ? itemQrUrl(origin || page.url.origin, g.item.id) : undefined
		});

	const total = $derived(groups.reduce((n, g) => n + countOf(g), 0));
	const ready = $derived(canPrint(ha));

	/**
	 * Desenha a pré-visualização no canvas (e volta a desenhar quando muda).
	 * @param {HTMLCanvasElement} node
	 * @param {{ content: import('$lib/labels/model.js').LabelContent, size: string }} p
	 */
	function preview(node, p) {
		const draw = (/** @type {typeof p} */ q) => drawLabel(node, q.content, labelDots(q.size));
		draw(p);
		return { update: draw };
	}

	function print() {
		printLabels(
			groups.map((g) => ({ content: contentOf(g), copies: countOf(g) })),
			ha
		);
	}
</script>

<details class="card stack batch" {open}>
	<summary>🏷 {title}</summary>
	<div class="stack">
		<ul class="groups">
			{#each groups as g (g.key)}
				<li>
					<canvas class="thumb" use:preview={{ content: contentOf(g), size: labelPrefs.size }} aria-hidden="true"></canvas>
					<span class="grow">
						<strong>{g.label ?? labelOf(LOCATIONS, g.item.location)}</strong>
						<span class="muted small">
							{#if g.label}{labelOf(LOCATIONS, g.item.location)} ·{/if}
							{fmtNum(g.units)}&nbsp;{g.units <= 1 ? 'dose' : 'doses'}{countOf(g) ? ` · ${fmtNum(dosesEach(g))} por etiqueta` : ''}
						</span>
					</span>
					<label class="count">
						<span class="visually-hidden">Etiquetas para {g.label ?? labelOf(LOCATIONS, g.item.location)}</span>
						<input type="number" min="0" max="20" bind:value={counts[g.key]} />
					</label>
				</li>
			{/each}
		</ul>

		<label class="field">
			<span>Tamanho da etiqueta</span>
			<select bind:value={labelPrefs.size} onchange={saveLabelPrefs}>
				{#each LABEL_SIZES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</label>

		<label class="toggle">
			<input type="checkbox" bind:checked={labelPrefs.showQr} onchange={saveLabelPrefs} />
			<span><strong>Código QR</strong><span class="muted small">Abre o item ao ler com o telemóvel.</span></span>
		</label>

		<PrinterControls {ha} {haConfigured} />

		{#if impressao.error}<p class="alert" role="alert" style="margin:0">{impressao.error}</p>{/if}
		{#if impressao.done}<p class="alert ok" role="status" style="margin:0">{impressao.done}</p>{/if}

		{#if ready}
			<button type="button" class="btn primary block" onclick={print} disabled={!total || impressao.busy}>
				{#if impressao.busy}
					A imprimir… {progressPct()}%
				{:else}
					Imprimir {total === 1 ? '1 etiqueta' : `${total} etiquetas`}
				{/if}
			</button>
			{#if impressao.busy}
				<progress max="100" value={progressPct()} aria-label="Progresso da impressão"></progress>
			{/if}
		{/if}
	</div>
</details>

<style>
	.batch summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 28px;
	}

	.batch[open] summary {
		margin-bottom: 10px;
	}

	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.groups li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.thumb {
		width: 96px;
		height: auto;
		flex: none;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 4px;
		image-rendering: pixelated;
	}

	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.count input {
		width: 64px;
		text-align: center;
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

	progress {
		width: 100%;
		accent-color: var(--accent);
	}
</style>
