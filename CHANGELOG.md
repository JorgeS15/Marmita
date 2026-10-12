# Changelog

Todas as alterações relevantes deste projeto ficam registadas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/) e o projeto usa [Semantic Versioning](https://semver.org/lang/pt-PT/).

## [1.7.0] - 2026-10-12

### Added
- **Filtros por local** (Congelador / Frigorífico / Despensa) no seletor de itens ao adicionar uma refeição.
- **Preparações: "Para quando?"**: marca diretamente no painel da preparação as refeições em que vai ser comida (dia, refeição, pessoa e doses). Até a preparação ser confirmada, essas refeições aparecem a cinzento no calendário. Ao confirmar, as doses propostas são a soma dessas refeições.
- **Preparações: ingredientes do inventário**: escolhe itens do inventário (ex.: couscous congelado) que a preparação vai usar.
  - As doses ficam reservadas e contam como planeadas.
  - Se estiverem no congelador, aparecem no aviso e na notificação "Tirar do congelador" na véspera.
  - São descontadas ao confirmar a preparação, e "Desfazer" repõe-nas.
- Ao confirmar uma preparação há a opção **"Não pôr no inventário"** (só desconta os ingredientes).
- Definição da casa **"Confirmar o que foi comido"**. Desligada, deixa de haver "Por confirmar": as refeições contam automaticamente como comidas quando passa a hora e saem do stock.

### Changed
- **Novo item** no inventário com filtros ativos: o local e a categoria vêm já escolhidos.
- O seletor de refeições mostra só preparações de hoje até ao dia da refeição, numa secção própria "🍳 Por preparar".

## [1.6.0] - 2026-10-11

### Added
- **Meias doses**: as doses das refeições, o stock dos itens e as doses das preparações aceitam decimais (ex.: `0,5`), com vírgula ou ponto. Os números aparecem no formato português ("0,5 dose").
- **Duplicar** uma refeição ou uma preparação para um ou vários dias desta semana ou da seguinte. Nas refeições também se escolhe a refeição de destino.

### Changed
- **Preparações**: ao abrir, os campos (nome, pessoa, dia e notas) ficam logo editáveis e gravam sozinhos ao mudar e ao fechar o painel. Deixou de haver o botão "Editar".
- O campo de notas das preparações é maior (área de texto, até 2000 caracteres).

## [1.5.0] - 2026-10-11

### Added
- **Notificações push** no telemóvel e no computador, mesmo com a app fechada. Ativam-se em Definições → Notificações, em cada dispositivo, e há um botão "Enviar teste". Há quatro tipos, cada um com a sua hora, ajustável por pessoa:
  - 🧊 **Tirar do congelador**: refeições de amanhã que vêm do congelador (21:00).
  - 🍳 **Preparações de amanhã** (21:00).
  - ✓ **Por confirmar**: refeições de hoje ou anteriores ainda por marcar (22:30).
  - ⏳ **Validade a acabar**: itens a consumir até hoje ou amanhã (10:00).
- Cada pessoa recebe só o que lhe diz respeito, mais o que é para "Ambos". Cada notificação sai no máximo uma vez por dia e só se houver alguma coisa para dizer.
- Web Push implementado sem dependências (cifra RFC 8291 e VAPID com `node:crypto`). As chaves VAPID são geradas no primeiro arranque e guardadas na base de dados. A variável `VAPID_SUBJECT` é opcional.

## [1.4.0] - 2026-10-11

### Added
- **Aviso "Tirar do congelador"** no topo da semana, com as refeições de hoje e de amanhã que vêm do congelador. O botão "Já tirei" esconde o aviso, e o mesmo se pode marcar ou desfazer no painel da refeição.
- **Planear com preparações por fazer**: ao adicionar uma refeição, o seletor mostra as preparações agendadas nos 7 dias anteriores (🍳). A refeição fica ligada à preparação e, quando esta é confirmada como "Preparado", passa a usar o item criado e a contar no inventário, incluindo as doses já comidas. "Desfazer" na preparação desliga-as outra vez.
- **Backups automáticos**: uma cópia diária da base de dados em `data/backups/`, guardando as últimas 14 (configurável com `BACKUP_KEEP`; `0` desliga).
- Botão **"Descarregar base de dados"** em Definições: devolve uma cópia completa e consistente, que serve para repor `data/marmita.db`.

## [1.3.0] - 2026-10-13

### Added
- **Preparações** no calendário: em cada dia agenda-se o que vai ser cozinhado (ex.: "Caril"), para quem e com uma nota. Ao confirmar "Preparado", as doses entram no inventário, num item novo ou somadas a um item existente com o mesmo nome. A confirmação pode ser desfeita.
- Separador **Ideias** (ícone de lâmpada): bloco de notas partilhado para receitas e ideias, com pesquisa.
- Definição da casa **Lanche da manhã** (em Definições, guardada no servidor). Desligada, fica só o lanche da tarde, com o nome "Lanche". Se uma semana já tiver entradas no lanche da manhã, essas continuam visíveis.
- O painel de uma refeição mostra as **notas do item** do inventário, além da nota da própria refeição.
- O export JSON inclui também as preparações, as ideias e as definições.

### Changed
- No calendário, as refeições mostram apenas o nome (o "×2" das doses só aparece ao abrir a refeição).

### Fixed
- No telemóvel, o teclado já não tapa o botão "Adicionar" dos painéis. O painel ajusta-se à área visível acima do teclado, o botão fica fixo no fundo do painel e o campo em foco é trazido à vista.

## [1.2.0] - 2026-10-11

### Added
- Novas refeições no calendário: pequeno-almoço, lanche da manhã e lanche da tarde, além do almoço e do jantar. Também passam a "Por confirmar" depois das 11h, das 12h e das 18h, respetivamente.
- Novas categorias no inventário: Pequeno-almoço e Lanche.
- Cada refeição planeada é atribuída a uma pessoa da casa (ou a ambas), escolhida ao agendar e editável depois.
- Cada pessoa tem uma cor, que se escolhe em Definições. As refeições aparecem no calendário com a cor da pessoa e há uma legenda no topo da semana.
- Variável `ALLOWED_ORIGINS` (opcional) para aceitar formulários de outros endereços.

### Changed
- A semana começa ao domingo (domingo a sábado).
- O `ORIGIN` passa a ser opcional.

### Fixed
- Já é possível criar conta e entrar através de `http://localhost:4004` ou do IP da rede, mesmo com o `ORIGIN` definido para o domínio HTTPS. Antes, os formulários falhavam com 403. A proteção CSRF passou a aceitar o endereço por onde a app é acedida.
- O cookie de sessão só é marcado `secure` quando o browser está mesmo a usar HTTPS.

## [1.1.0] - 2026-10-11

### Added
- Versão da app visível no rodapé de todas as páginas e nos ecrãs de login e de configuração inicial.
- `CHANGELOG.md` e secção "Versões" no README.
- O workflow do Docker publica também a imagem com a tag da versão do `package.json` (ex.: `1.1.0`) em cada merge para o `main`.

### Changed
- A porta por omissão passa de `3000` para `4004` (Dockerfile, `docker-compose.yml`, `npm run dev`, `npm run preview` e `npm start`). Quem já usa a app deve atualizar o mapeamento de portas e o reverse proxy.
- O healthcheck do Docker usa a variável `PORT`.

## [1.0.0] - 2026-10-11

### Added
- Inventário: criar, editar, arquivar e apagar itens, com stock, doses planeadas e livres, pesquisa, filtros, botões +/− e indicadores de validade e antiguidade.
- Calendário semanal (segunda a domingo) com almoço e jantar, várias entradas por refeição, itens do inventário ou texto livre, editar, mover e remover.
- Consumo: comido, não comido e desfazer, com acerto do stock em transação; banner "Por confirmar".
- Contas com utilizador e palavra-passe, configuração inicial em `/setup`, sessões de 1 ano e limite de tentativas de login.
- PWA: manifest, ícones, service worker com página offline, tema claro e escuro e atualização automática dos dados.
- Export JSON em Definições.
- Imagem Docker publicada no GHCR pelo GitHub Actions.
