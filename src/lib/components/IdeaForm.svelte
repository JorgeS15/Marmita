<script>
	/** @type {{ idea?: { title: string, body: string } }} */
	let { idea = { title: '', body: '' } } = $props();
</script>

<label class="field">
	<span>Título</span>
	<input type="text" name="title" required maxlength="150" value={idea.title} placeholder="Ex.: Caril de grão da avó" />
</label>
<label class="field">
	<span>Notas <span class="hint">(receita, ingredientes, links…)</span></span>
	<textarea name="body" maxlength="20000" rows="12">{idea.body}</textarea>
</label>
