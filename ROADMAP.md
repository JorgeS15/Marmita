# Roadmap

Ideias e trabalho em falta, por ordem de prioridade. Nada aqui é uma promessa: serve para decidir o que vem a seguir.

Esforço: **P** = pequeno (umas horas) · **M** = médio (1–2 dias) · **G** = grande (vários dias).

---

## 1. Próximas versões (alto valor, esforço baixo)

| | Funcionalidade | Porquê | Esforço |
|---|---|---|---|
| 1.1 | **Gerir pessoas da casa**: repor a palavra-passe de outra pessoa e remover/desativar uma conta | Hoje, se alguém se esquece da palavra-passe, só mexendo na base de dados. Não há forma de remover uma conta. | P |
| 1.2 | **"Deitado fora"** como estado de um item (estragou-se, passou o prazo) | Hoje só se pode baixar a quantidade ou apagar: perde-se a informação de desperdício, que alimenta as estatísticas (3.2). | P |
| 1.3 | **Copiar a semana** inteira (ou um dia) para outra semana | Semanas parecidas repetem-se; hoje duplica-se refeição a refeição. | P |
| 1.4 | ~~**Etiqueta para imprimir** num item~~: feito na v1.14.0 (pré-visualização, PNG, impressão em papel e na P15). | Identificar caixas no congelador. | ✓ |
| 1.5 | **Release automática**: criar a tag e a Release do GitHub quando a versão do `package.json` muda no `main` | Hoje a tag é manual; o CHANGELOG já tem tudo o que as notas precisam. | P |
| 1.6 | **Pasta `data` com permissões erradas**: mensagem clara no arranque em vez de erro `EACCES` | É o erro mais comum de quem instala com Docker. | P |
| 1.7 | ~~**Imprimir direto na etiquetadora Marklife P15** por Bluetooth~~: feito na v1.14.0 (Web Bluetooth, protocolo L11 sem dependências). | Imprimir a etiqueta logo a partir do telemóvel. | ✓ |
| 1.8 | ~~**Imprimir pelo Home Assistant**~~: feito na v1.14.0 (`marklife.print` com a imagem da etiqueta; `HA_URL` e `HA_TOKEN`; etiquetadora escolhida em Definições). | Funciona em qualquer dispositivo. | ✓ |
| 1.9 | **Imprimir várias etiquetas de uma vez** ao confirmar uma preparação (uma por caixa, já separadas por local) e ao mover doses para o congelador | É quando as caixas vão para o frigorífico ou para o congelador. | P |

## 2. A seguir (valor alto, esforço médio)

| | Funcionalidade | Porquê | Esforço |
|---|---|---|---|
| 2.1 | **Lista de compras**: itens manuais + "falta para a semana" (refeições planeadas sem doses livres, ingredientes de preparações em falta) | A peça que falta para fechar o ciclo planear → comprar → cozinhar → comer. Partilhada, com riscar ao comprar. | M |
| 2.2 | **Sugestões ao planear**: no seletor, destacar o que está há mais tempo ou com prazo a acabar, e um botão "preencher a semana com o que há" | Reduz desperdício e o tempo a planear. | M |
| 2.3 | **Receitas**: dar estrutura às Ideias (ingredientes, doses que rende, passos) e criar uma preparação a partir de uma receita com os ingredientes já ligados ao inventário | Hoje as ideias são texto livre; os ingredientes têm de ser escolhidos à mão em cada preparação. | M |
| 2.4 | **Importar o export JSON** (repor a partir do JSON, não só da base de dados) | O JSON é legível mas não serve para repor; útil para migrar entre instalações. | M |
| 2.5 | **Integração com Home Assistant**: API só de leitura com token (o que há para hoje, o que tirar do congelador, validade a acabar) para sensores, dashboards e automações | Avisos na casa (ecrã, coluna) além das notificações push. | M |
| 2.6 | **Feed iCal** (só leitura) com as refeições e preparações | Ver o plano no calendário do telemóvel ou do computador. | P |

## 3. Mais tarde (ideias)

| | Funcionalidade | Esforço |
|---|---|---|
| 3.1 | **Fotos** nos itens e nas ideias (guardadas em `data/`) | M |
| 3.2 | **Estatísticas**: o que se come mais, desperdício por mês, tempo médio no congelador, consumo por pessoa | M |
| 3.3 | **Unidades além de doses** para ingredientes (g, kg, unidades), sobretudo para preparações | G |
| 3.4 | **Tempo de descongelar por item** (ex.: carne precisa de 24 h, sopa de 6 h) para o aviso "tirar do congelador" sair na hora certa | P |
| 3.5 | **Inglês** (i18n), útil agora que o projeto é público | M |
| 3.6 | **Uso offline com escrita**: marcar consumido/não consumido sem rede e sincronizar depois | G |
| 3.7 | **Histórico de alterações** (quem mudou o quê) com "desfazer" | M |
| 3.8 | **Código QR** nas etiquetas para abrir o item ao ler com o telemóvel (numa etiqueta de 12 mm cabe à justa, ao lado do texto) | P |

---

## 4. Técnico e manutenção

| | Tarefa | Porquê | Esforço |
|---|---|---|---|
| 4.1 | **Dividir `src/routes/+page.svelte`** (≈1700 linhas) em componentes: semana, painel da refeição, painel da preparação, confirmar preparação | Mais fácil de manter e de testar; reduz o risco de regressões nos painéis. | M |
| 4.2 | **Testes de interface no CI** (Playwright): adicionar, consumir, preparação dividida, arrastar, telemóvel | Os testes atuais cobrem o servidor; os bugs de interface (painéis, autosave) só eram apanhados à mão. | M |
| 4.3 | **ESLint + Prettier** no CI | Estilo consistente para contribuições externas. | P |
| 4.4 | **Dependabot/Renovate** e **CodeQL** | Manter dependências e imagem base atualizadas; análise de segurança automática. | P |
| 4.5 | **`CONTRIBUTING.md`** e modelos de issue/PR | Repositório público. | P |
| 4.6 | **Notificações**: voltar a tentar quando o envio falha (hoje fica registado como enviado e não repete no dia) | Robustez. | P |

## 5. Segurança (identificado na revisão geral, baixo risco)

| | Tarefa | Esforço |
|---|---|---|
| 5.1 | **Foco preso nos painéis** (acessibilidade: o Tab não deve sair do painel aberto) | P |
| 5.2 | **CSRF mais estrito com `ORIGIN` definido** (proteção contra DNS rebinding), sem partir o acesso por IP/`localhost` | P |
| 5.3 | **Push**: aceitar só endpoints de serviços de push conhecidos e não reatribuir uma subscrição a outra pessoa | P |
| 5.4 | **Ver e terminar sessões** abertas noutros dispositivos | P |

---

## Já feito

O que já existe está descrito no [README](README.md) e o histórico completo no [CHANGELOG](CHANGELOG.md).
