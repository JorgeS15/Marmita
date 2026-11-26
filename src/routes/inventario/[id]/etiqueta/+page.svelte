<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { LOCATIONS, fmtNum, labelOf } from '$lib/constants.js';
	import { LABEL_SIZES, itemQrUrl, labelContent, labelDots, labelSize } from '$lib/labels/model.js';
	import { drawLabel } from '$lib/labels/render.js';
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
	const item = $derived(data.item);
	const ha = $derived(data.labels?.ha ?? null);

	let dosesText = $state('1');
	let copies = $state(1);
	let title = $state('');
	let titleTouched = false;

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	let png = $state('');

	const doses = $derived(Math.max(0, Number(String(dosesText).replace(',', '.')) || 0));
	const content = $derived({
		...labelContent(item, {
			showStored: labelPrefs.showStored,
			showBestBefore: labelPrefs.showBestBefore,
			showDoses: labelPrefs.showDoses,
			doses,
			qr: labelPrefs.showQr ? itemQrUrl(data.labels?.origin || page.url.origin, item.id) : undefined
		}),
		title: title.trim() || item.name
	});
	const dots = $derived(labelDots(labelPrefs.size));
	const sizeInfo = $derived(labelSize(labelPrefs.size));
	const copiesN = $derived(Math.min(20, Math.max(1, Math.floor(copies) || 1)));

	// O nome acompanha o item (atualização automática) enquanto não for editado.
	$effect(() => {
		if (!titleTouched) title = item.name;
	});

	// Uma dose por etiqueta; se o item tiver menos (ex.: 0,5), essa quantidade.
	const itemQty = $derived(item.quantity);
	onMount(() => {
		initLabelPrefs();
		resetImpressao();
		dosesText = fmtNum(itemQty > 0 && itemQty < 1 ? itemQty : 1);
	});

	$effect(() => {
		if (!canvas) return;
		drawLabel(canvas, content, dots);
		png = canvas.toDataURL('image/png');
	});

	function printLabel() {
		printLabels([{ content, copies: copiesN }], ha);
	}

	function download() {
		const a = document.createElement('a');
		a.href = png;
		const slug = item.name
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase();
		a.download = `etiqueta-${slug || item.id}-${labelPrefs.size}.png`;
		a.click();
	}
</script>

<svelte:head><title>Etiqueta · {item.name} · Marmita</title></svelte:head>

<main class="page narrow">
	<header class="page-header no-print">
		<a class="btn icon ghost" href={data.back} aria-label="Voltar ao item">‹</a>
		<h1>Etiqueta <span class="badge">{labelOf(LOCATIONS, item.location)}</span></h1>
	</header>

	<div class="stack no-print">
		<section class="card stack">
			<div class="preview" style="aspect-ratio: {sizeInfo.lengthMm} / {sizeInfo.widthMm}">
				<canvas bind:this={canvas} aria-label="Pré-visualização da etiqueta"></canvas>
			</div>
			<p class="muted small" style="margin:0">
				{sizeInfo.label} · {dots.width} × {dots.height} pontos, a preto e branco como sai na etiquetadora.
			</p>
		</section>

		<section class="card stack">
			<h2>Etiquetadora</h2>
			<PrinterControls {ha} haConfigured={data.labels?.haConfigured} />
			{#if impressao.error}<p class="alert" role="alert" style="margin:0">{impressao.error}</p>{/if}
			{#if impressao.done}<p class="alert ok" role="status" style="margin:0">{impressao.done}</p>{/if}
			{#if canPrint(ha)}
				<button class="btn primary block" onclick={printLabel} disabled={!png || impressao.busy}>
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

		<section class="card stack">
			<label class="field">
				<span>Nome</span>
				<input type="text" maxlength="60" bind:value={title} oninput={() => (titleTouched = true)} />
			</label>
			<label class="field">
				<span>Tamanho da etiqueta</span>
				<select bind:value={labelPrefs.size} onchange={saveLabelPrefs}>
					{#each LABEL_SIZES as s (s.value)}
						<option value={s.value}>{s.label}</option>
					{/each}
				</select>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={labelPrefs.showStored} onchange={saveLabelPrefs} />
				<span>
					<strong>Data de {item.location === 'congelador' ? 'congelação' : 'entrada'}</strong>
					{#if !item.stored_on}<span class="muted small">O item não tem data.</span>{/if}
				</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={labelPrefs.showBestBefore} onchange={saveLabelPrefs} />
				<span>
					<strong>Consumir até</strong>
					{#if !item.best_before}<span class="muted small">O item não tem data.</span>{/if}
				</span>
			</label>
			<div class="grid-2">
				<label class="toggle">
					<input type="checkbox" bind:checked={labelPrefs.showDoses} onchange={saveLabelPrefs} />
					<span><strong>Doses</strong></span>
				</label>
				<label class="field">
					<span class="visually-hidden">Doses por etiqueta</span>
					<input
						type="text"
						inputmode="decimal"
						pattern="[0-9]+([.,][0-9]+)?"
						autocomplete="off"
						bind:value={dosesText}
						disabled={!labelPrefs.showDoses}
					/>
				</label>
			</div>
			<label class="toggle">
				<input type="checkbox" bind:checked={labelPrefs.showQr} onchange={saveLabelPrefs} />
				<span>
					<strong>Código QR</strong>
					<span class="muted small">Ao ler com a câmara do telemóvel, abre este item no Marmita.</span>
				</span>
			</label>
			<label class="field">
				<span>Cópias</span>
				<input type="number" min="1" max="20" bind:value={copies} />
			</label>
		</section>

		<div class="row actions">
			<button class="btn" onclick={download} disabled={!png}>Descarregar PNG</button>
			<button class="btn" onclick={() => window.print()} disabled={!png}>Imprimir em papel</button>
		</div>
		<p class="muted small" style="margin:0">
			O PNG pode ser aberto na app da Marklife. "Imprimir em papel" serve para uma impressora normal: as etiquetas saem
			ao tamanho real, com contorno para recortar.
		</p>
	</div>

	{#if png}
		<div class="sheet" aria-hidden="true">
			{#each Array(copiesN) as _, i (i)}
				<div class="paper-label" style="width:{sizeInfo.lengthMm}mm;height:{sizeInfo.widthMm}mm">
					<img src={png} alt="" />
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	.preview {
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.preview canvas {
		width: 100%;
		height: auto;
		image-rendering: pixelated;
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

	.actions {
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.sheet {
		display: none;
	}

	@media print {
		:global(body *) {
			visibility: hidden;
		}

		.sheet,
		.sheet * {
			visibility: visible;
		}

		.sheet {
			display: flex;
			flex-wrap: wrap;
			gap: 2mm;
			position: absolute;
			inset: 0 auto auto 0;
			padding: 5mm;
		}

		.paper-label {
			display: flex;
			align-items: center;
			justify-content: center;
			border: 0.2mm dashed #999;
			break-inside: avoid;
			overflow: hidden;
		}

		.paper-label img {
			width: 100%;
			height: auto;
		}
	}
</style>
