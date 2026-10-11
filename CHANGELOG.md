# Changelog

Todas as alterações relevantes deste projeto ficam registadas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/) e o projeto usa [Semantic Versioning](https://semver.org/lang/pt-PT/).

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
