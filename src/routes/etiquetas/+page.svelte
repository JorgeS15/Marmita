<script>
	// Etiqueta livre: texto à escolha (frascos e sacos abertos, sobras, o que não está no inventário).
	import { onMount } from 'svelte';
	import { LABEL_SIZES, labelDots, labelSize, shortDate } from '$lib/labels/model.js';
	import { drawLabel } from '$lib/labels/render.js';
	import { addDays, nowParts } from '$lib/dates.js';
	import PrinterControls from '$lib/components/PrinterControls.svelte';
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

	let { data } = $props();
	const ha = $derived(data.labels?.ha ?? null);

	let title = $state('');
	let line1 = $state('');
	let line2 = $state('');
	let copies = $state(1);

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();

	const content = $derived({ title: title.trim() || 'Etiqueta', lines: [line1.trim(), line2.trim()].filter(Boolean) });
	const dots = $derived(labelDots(labelPrefs.size));
	const sizeInfo = $derived(labelSize(labelPrefs.size));
	const copiesN = $derived(Math.min(20, Math.max(1, Math.floor(copies) || 1)));

	const today = nowParts().date;
	/** Atalhos de texto para as linhas. */
	const QUICK = [
		{ label: 'Aberto hoje', text: `Aberto ${shortDate(today)}` },
		{ label: 'Feito hoje', text: `Feito ${shortDate(today)}` },
		{ label: 'Congelado hoje', text: `Cong. ${shortDate(today)}` },
		{ label: 'Até +3 dias', text: `Até ${shortDate(addDays(today, 3))}` },
		{ label: 'Até +1 semana', text: `Até ${shortDate(addDays(today, 7))}` },
		{ label: 'Até +3 meses', text: `Até ${shortDate(addDays(today, 91))}` }
	];

	/** Põe o atalho na primeira linha vazia (ou na segunda). @param {string} text */
	function quick(text) {
		if (!line1.trim()) line1 = text;
		else line2 = text;
	}

	onMount(() => {
		initLabelPrefs();
		resetImpressao();
	});

	$effect(() => {
		if (canvas) drawLabel(canvas, content, dots);
	});

	function print() {
		printLabels([{ content, copies: copiesN }], ha);
	}
</script>

<svelte:head><title>Etiqueta livre · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header">
		<a class="btn icon ghost" href="/inventario" aria-label="Voltar ao inventário">‹</a>
		<h1>Etiqueta livre</h1>
	</header>

	<div class="stack">
		<section class="card stack">
			<div class="preview" style="aspect-ratio: {sizeInfo.lengthMm} / {sizeInfo.widthMm}">
				<canvas bind:this={canvas} aria-label="Pré-visualização da etiqueta"></canvas>
			</div>
			<p class="muted small" style="margin:0">
				Para frascos e sacos abertos, sobras ou o que não está no inventário.
			</p>
		</section>

		<section class="card stack">
			<label class="field">
				<span>Texto principal</span>
				<input type="text" maxlength="60" bind:value={title} placeholder="Ex.: Molho de tomate" />
			</label>
			<label class="field">
				<span>Linha 2 <span class="hint">(opcional)</span></span>
				<input type="text" maxlength="40" bind:value={line1} />
			</label>
			<label class="field">
				<span>Linha 3 <span class="hint">(opcional)</span></span>
				<input type="text" maxlength="40" bind:value={line2} />
			</label>
			<div class="chips" role="group" aria-label="Atalhos">
				{#each QUICK as q (q.label)}
					<button type="button" class="chip" onclick={() => quick(q.text)}>{q.label}</button>
				{/each}
			</div>
			<div class="grid-2">
				<label class="field">
					<span>Tamanho</span>
					<select bind:value={labelPrefs.size} onchange={saveLabelPrefs}>
						{#each LABEL_SIZES as s (s.value)}
							<option value={s.value}>{s.label}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Cópias</span>
					<input type="number" min="1" max="20" bind:value={copies} />
				</label>
			</div>
		</section>

		<section class="card stack">
			<h2>Etiquetadora</h2>
			<PrinterControls {ha} haConfigured={data.labels?.haConfigured} />
			{#if impressao.error}<p class="alert" role="alert" style="margin:0">{impressao.error}</p>{/if}
			{#if impressao.done}<p class="alert ok" role="status" style="margin:0">{impressao.done}</p>{/if}
			{#if canPrint(ha)}
				<button class="btn primary block" onclick={print} disabled={!title.trim() || impressao.busy}>
					{#if impressao.busy}
						A imprimir… {progressPct()}%
					{:else}
						Imprimir {copiesN === 1 ? 'etiqueta' : `${copiesN} etiquetas`}
					{/if}
				</button>
				{#if impressao.busy}
					<progress max="100" value={progressPct()} aria-label="Progresso da impressão"></progress>
				{/if}
			{/if}
		</section>
	</div>
</main>

<style>
	.preview {
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}

	.preview canvas {
		display: block;
		width: 100%;
		height: auto;
		image-rendering: pixelated;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	progress {
		width: 100%;
		accent-color: var(--accent);
	}
</style>
