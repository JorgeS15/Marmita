<script>
	import { onMount } from 'svelte';
	import { LOCATIONS, fmtNum, labelOf } from '$lib/constants.js';
	import { DEFAULT_LABEL_SIZE, LABEL_SIZES, labelContent, labelDots, labelSize } from '$lib/labels/model.js';
	import { drawLabel } from '$lib/labels/render.js';
	import { DENSITIES, bluetoothSupported, rasterFromRGBA } from '$lib/labels/p15.js';
	import { desligar, etiquetadora, imprimir, ligar } from '$lib/labels/bluetooth.svelte.js';

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
	let density = $state(2);
	let flip = $state(false);
	let supported = $state(true);
	let printed = $state('');
	/** Como imprimir neste dispositivo: pelo Home Assistant ou por Bluetooth direto. */
	let method = $state('ha');
	let haBusy = $state(false);
	let haError = $state('');

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
	const copiesN = $derived(Math.min(20, Math.max(1, Math.floor(copies) || 1)));
	const pct = $derived(Math.round(etiquetadora.progress * 100));
	const useHa = $derived(!!data.ha && (method === 'ha' || !supported));
	const busy = $derived(haBusy || etiquetadora.printing);
	const errorMsg = $derived(useHa ? haError : etiquetadora.error);

	// O nome acompanha o item (atualização automática) enquanto não for editado.
	$effect(() => {
		if (!titleTouched) title = item.name;
	});

	// Uma dose por etiqueta; se o item tiver menos (ex.: 0,5), essa quantidade.
	const itemQty = $derived(item.quantity);
	onMount(() => {
		supported = bluetoothSupported();
		dosesText = fmtNum(itemQty > 0 && itemQty < 1 ? itemQty : 1);
		try {
			const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
			if (LABEL_SIZES.some((s) => s.value === saved.size)) size = saved.size;
			if (typeof saved.showStored === 'boolean') showStored = saved.showStored;
			if (typeof saved.showBestBefore === 'boolean') showBestBefore = saved.showBestBefore;
			if (typeof saved.showDoses === 'boolean') showDoses = saved.showDoses;
			if (DENSITIES.some((d) => d.value === saved.density)) density = saved.density;
			if (typeof saved.flip === 'boolean') flip = saved.flip;
			if (saved.method === 'ha' || saved.method === 'bluetooth') method = saved.method;
		} catch {
			// Sem armazenamento local: ficam os valores por omissão.
		}
	});

	$effect(() => {
		const prefs = { size, showStored, showBestBefore, showDoses, density, flip, method };
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

	async function printLabel() {
		if (!canvas) return;
		printed = '';
		haError = '';
		const ok = useHa ? await printHa() : await printBluetooth(canvas);
		if (ok) printed = copiesN === 1 ? 'Etiqueta impressa.' : `${copiesN} etiquetas impressas.`;
	}

	/** @param {HTMLCanvasElement} c */
	function printBluetooth(c) {
		const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
		const img = ctx.getImageData(0, 0, c.width, c.height);
		const raster = rasterFromRGBA(img.data, img.width, img.height, { flip });
		return imprimir(raster, { density, copies: copiesN });
	}

	/** O servidor do Marmita envia a imagem ao Home Assistant (o token fica no servidor). */
	async function printHa() {
		haBusy = true;
		try {
			const res = await fetch('/etiquetas/ha', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ png, width: dots.width, height: dots.height, copies: copiesN, density, flip })
			});
			if (res.ok) return true;
			const body = await res.json().catch(() => null);
			haError = body?.message || `Erro ${res.status} ao imprimir.`;
			return false;
		} catch {
			haError = 'Sem ligação ao servidor do Marmita.';
			return false;
		} finally {
			haBusy = false;
		}
	}

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
			<h2>Etiquetadora</h2>
			{#if data.ha && supported}
				<div class="segmented" role="radiogroup" aria-label="Como imprimir">
					<label><input type="radio" bind:group={method} value="ha" /> Home Assistant</label>
					<label><input type="radio" bind:group={method} value="bluetooth" /> Bluetooth</label>
				</div>
			{/if}
			{#if errorMsg}<p class="alert" role="alert" style="margin:0">{errorMsg}</p>{/if}
			{#if printed}<p class="alert ok" role="status" style="margin:0">{printed}</p>{/if}

			{#if useHa}
				<div class="row printer">
					<span class="dot on" aria-hidden="true"></span>
					<span class="grow">
						<strong>{data.ha?.name}</strong>
						<span class="muted small">através do Home Assistant</span>
					</span>
				</div>
			{:else if !supported}
				<p class="muted small" style="margin:0">
					Este browser não consegue usar o Bluetooth. Abre o Marmita no <strong>Chrome</strong> (Android ou computador),
					por HTTPS{#if !data.haConfigured}, ou configura o Home Assistant em Definições{/if}. Entretanto, podes
					descarregar o PNG e abri-lo na app da Marklife.
				</p>
			{:else if etiquetadora.name}
				<div class="row printer">
					<span class="dot" class:on={etiquetadora.connected} aria-hidden="true"></span>
					<span class="grow">
						<strong>{etiquetadora.name}</strong>
						<span class="muted small">{etiquetadora.connected ? 'ligada' : 'desligada (volta a ligar ao imprimir)'}</span>
					</span>
					<button class="btn small ghost" onclick={desligar} disabled={etiquetadora.printing}>Esquecer</button>
				</div>
			{:else}
				<p class="muted small" style="margin:0">
					Liga a etiquetadora Marklife P15 (ou compatível) e fecha a app da Marklife: só aceita uma ligação de cada vez.
					A ligação mantém-se enquanto a app estiver aberta.
				</p>
				<button class="btn primary block" onclick={ligar} disabled={etiquetadora.connecting}>
					{etiquetadora.connecting ? 'A ligar…' : 'Ligar à etiquetadora'}
				</button>
			{/if}

			{#if useHa || (supported && etiquetadora.name)}
				<div class="grid-2">
					<label class="field">
						<span>Densidade</span>
						<select bind:value={density}>
							{#each DENSITIES as d (d.value)}
								<option value={d.value}>{d.label}</option>
							{/each}
						</select>
					</label>
					<label class="toggle flip">
						<input type="checkbox" bind:checked={flip} />
						<span><strong>Rodar 180°</strong><span class="muted small">Se o texto sair ao contrário.</span></span>
					</label>
				</div>
				<button class="btn primary block" onclick={printLabel} disabled={!png || busy}>
					{#if busy}
						A imprimir…{#if !useHa}&nbsp;{pct}%{/if}
					{:else}
						Imprimir {copiesN === 1 ? 'etiqueta' : `${copiesN} etiquetas`}
					{/if}
				</button>
				{#if busy && !useHa}
					<progress max="100" value={pct} aria-label="Progresso da impressão"></progress>
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

	.printer {
		align-items: center;
		gap: 10px;
		flex-wrap: nowrap;
	}

	.printer .grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-muted);
		flex: none;
	}

	.dot.on {
		background: var(--ok);
	}

	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 4px;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
	}

	.segmented label {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.segmented label:has(input:checked) {
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.segmented label:has(input:focus-visible) {
		outline: 2px solid var(--focus);
	}

	.flip {
		align-self: end;
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
