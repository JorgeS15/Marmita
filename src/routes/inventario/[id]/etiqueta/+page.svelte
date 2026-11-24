<script>
	import { onMount } from 'svelte';
	import { LOCATIONS, fmtNum, labelOf } from '$lib/constants.js';
	import { DEFAULT_LABEL_SIZE, LABEL_SIZES, labelContent, labelDots, labelSize } from '$lib/labels/model.js';
	import { drawLabel } from '$lib/labels/render.js';

	let { data } = $props();
	const item = $derived(data.item);

	const PREFS_KEY = 'marmita:etiqueta';

	let size = $state(DEFAULT_LABEL_SIZE);
	let showStored = $state(true);
	let showBestBefore = $state(true);
	let showDoses = $state(true);
	let dosesText = $state('1');
	let copies = $state(1);
	let title = $state('');
	let titleTouched = false;

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	let png = $state('');

	const doses = $derived(Math.max(0, Number(String(dosesText).replace(',', '.')) || 0));
	const content = $derived({
		...labelContent(item, { showStored, showBestBefore, showDoses, doses }),
		title: title.trim() || item.name
	});
	const dots = $derived(labelDots(size));
	const sizeInfo = $derived(labelSize(size));
	const copiesN = $derived(Math.min(50, Math.max(1, Math.floor(copies) || 1)));

	// O nome acompanha o item (atualização automática) enquanto não for editado.
	$effect(() => {
		if (!titleTouched) title = item.name;
	});

	// Uma dose por etiqueta; se o item tiver menos (ex.: 0,5), essa quantidade.
	const itemQty = $derived(item.quantity);
	onMount(() => {
		dosesText = fmtNum(itemQty > 0 && itemQty < 1 ? itemQty : 1);
		try {
			const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
			if (LABEL_SIZES.some((s) => s.value === saved.size)) size = saved.size;
			if (typeof saved.showStored === 'boolean') showStored = saved.showStored;
			if (typeof saved.showBestBefore === 'boolean') showBestBefore = saved.showBestBefore;
			if (typeof saved.showDoses === 'boolean') showDoses = saved.showDoses;
		} catch {
			// Sem armazenamento local: ficam os valores por omissão.
		}
	});

	$effect(() => {
		const prefs = { size, showStored, showBestBefore, showDoses };
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {
			// Ignora (modo privado, armazenamento bloqueado).
		}
	});

	$effect(() => {
		if (!canvas) return;
		drawLabel(canvas, content, dots);
		png = canvas.toDataURL('image/png');
	});

	function download() {
		const a = document.createElement('a');
		a.href = png;
		const slug = item.name
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase();
		a.download = `etiqueta-${slug || item.id}-${size}.png`;
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
			<label class="field">
				<span>Nome</span>
				<input type="text" maxlength="60" bind:value={title} oninput={() => (titleTouched = true)} />
			</label>
			<label class="field">
				<span>Tamanho da etiqueta</span>
				<select bind:value={size}>
					{#each LABEL_SIZES as s (s.value)}
						<option value={s.value}>{s.label}</option>
					{/each}
				</select>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showStored} />
				<span>
					<strong>Data de {item.location === 'congelador' ? 'congelação' : 'entrada'}</strong>
					{#if !item.stored_on}<span class="muted small">O item não tem data.</span>{/if}
				</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showBestBefore} />
				<span>
					<strong>Consumir até</strong>
					{#if !item.best_before}<span class="muted small">O item não tem data.</span>{/if}
				</span>
			</label>
			<div class="grid-2">
				<label class="toggle">
					<input type="checkbox" bind:checked={showDoses} />
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
						disabled={!showDoses}
					/>
				</label>
			</div>
			<label class="field">
				<span>Cópias <span class="hint">(ao imprimir em papel)</span></span>
				<input type="number" min="1" max="50" bind:value={copies} />
			</label>
		</section>

		<div class="row actions">
			<button class="btn" onclick={download} disabled={!png}>Descarregar PNG</button>
			<button class="btn primary" onclick={() => window.print()} disabled={!png}>Imprimir</button>
		</div>
		<p class="muted small" style="margin:0">
			O PNG pode ser aberto na app da etiquetadora. "Imprimir" serve para uma impressora normal: as etiquetas saem ao
			tamanho real, com contorno para recortar.
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
