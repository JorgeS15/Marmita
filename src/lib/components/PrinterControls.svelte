<script>
	// Escolha da etiquetadora (Home Assistant ou Bluetooth), ligação e opções de impressão.
	import { DENSITIES } from '$lib/labels/p15.js';
	import { desligar, etiquetadora, ligar } from '$lib/labels/bluetooth.svelte.js';
	import { labelPrefs, saveLabelPrefs, usesHa } from '$lib/labels/printing.svelte.js';

	/** @type {{ ha: { id: string, name: string } | null, haConfigured?: boolean }} */
	let { ha, haConfigured = false } = $props();

	const useHa = $derived(usesHa(ha));
	const ready = $derived(useHa || (labelPrefs.bluetooth && !!etiquetadora.name));

	/** Bateria e estado da etiquetadora no HA (pedido ao abrir). */
	let haStatus = $state(/** @type {{ available: boolean, battery: number | null, problem: string } | null} */ (null));
	const haId = $derived(useHa ? (ha?.id ?? '') : '');
	$effect(() => {
		if (!haId) return;
		let stop = false;
		fetch('/etiquetas/ha')
			.then((r) => (r.ok ? r.json() : null))
			.then((s) => !stop && (haStatus = s))
			.catch(() => {});
		return () => (stop = true);
	});

	const haLine = $derived.by(() => {
		if (!haStatus) return 'através do Home Assistant';
		if (!haStatus.available) return 'através do Home Assistant · indisponível agora';
		return ['através do Home Assistant', haStatus.battery != null ? `bateria ${haStatus.battery}%` : '', haStatus.problem]
			.filter(Boolean)
			.join(' · ');
	});
</script>

{#if ha && labelPrefs.bluetooth}
	<div class="segmented" role="radiogroup" aria-label="Como imprimir">
		<label><input type="radio" bind:group={labelPrefs.method} value="ha" onchange={saveLabelPrefs} /> Home Assistant</label>
		<label><input type="radio" bind:group={labelPrefs.method} value="bluetooth" onchange={saveLabelPrefs} /> Bluetooth</label>
	</div>
{/if}

{#if useHa}
	<div class="row printer">
		<span class="dot" class:on={haStatus?.available !== false && !haStatus?.problem} class:warn={!!haStatus?.problem} aria-hidden="true"></span>
		<span class="grow">
			<strong>{ha?.name}</strong>
			<span class="muted small">{haLine}</span>
		</span>
	</div>
{:else if !labelPrefs.bluetooth}
	<p class="muted small" style="margin:0">
		Este browser não consegue usar o Bluetooth. Abre o Marmita no <strong>Chrome</strong> (Android ou computador), por
		HTTPS{#if !haConfigured}, ou configura o Home Assistant (ver Definições → Etiquetadora){/if}.
	</p>
{:else if etiquetadora.name}
	{#if etiquetadora.error && !etiquetadora.printing}<p class="alert" role="alert" style="margin:0">{etiquetadora.error}</p>{/if}
	<div class="row printer">
		<span class="dot" class:on={etiquetadora.connected} aria-hidden="true"></span>
		<span class="grow">
			<strong>{etiquetadora.name}</strong>
			<span class="muted small">
				{etiquetadora.connected ? 'ligada' : 'desligada (volta a ligar ao imprimir)'}{etiquetadora.battery != null
					? ` · bateria ${etiquetadora.battery}%`
					: ''}
			</span>
		</span>
		<button type="button" class="btn small ghost" onclick={desligar} disabled={etiquetadora.printing}>Esquecer</button>
	</div>
{:else}
	{#if etiquetadora.error}<p class="alert" role="alert" style="margin:0">{etiquetadora.error}</p>{/if}
	<p class="muted small" style="margin:0">
		Liga a etiquetadora Marklife P15 (ou compatível) e fecha a app da Marklife: só aceita uma ligação de cada vez. A
		ligação mantém-se enquanto a app estiver aberta.
	</p>
	<button type="button" class="btn primary block" onclick={ligar} disabled={etiquetadora.connecting}>
		{etiquetadora.connecting ? 'A ligar…' : 'Ligar à etiquetadora'}
	</button>
{/if}

{#if ready}
	<div class="grid-2">
		<label class="field">
			<span>Densidade</span>
			<select bind:value={labelPrefs.density} onchange={saveLabelPrefs}>
				{#each DENSITIES as d (d.value)}
					<option value={d.value}>{d.label}</option>
				{/each}
			</select>
		</label>
		<label class="toggle flip">
			<input type="checkbox" bind:checked={labelPrefs.flip} onchange={saveLabelPrefs} />
			<span><strong>Rodar 180°</strong><span class="muted small">Se o texto sair ao contrário.</span></span>
		</label>
	</div>
{/if}

<style>
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

	.dot.warn {
		background: var(--warn);
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

	.flip {
		align-self: end;
	}
</style>
