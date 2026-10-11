# Changelog

Todas as alterações relevantes deste projeto ficam registadas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/) e o projeto usa [Semantic Versioning](https://semver.org/lang/pt-PT/).

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
