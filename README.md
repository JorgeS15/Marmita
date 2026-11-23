# Marmita

Planeador de refeições caseiro: um **inventário** do que está congelado ou guardado e um **calendário semanal** onde se distribuem essas refeições pelos dias.
É self-hosted em Docker, usa-se como PWA (no telemóvel ou no computador) e é partilhado por todas as pessoas da casa.

A interface está em português de Portugal.

<img width="1279" height="911" alt="image" src="https://github.com/user-attachments/assets/5cc006cd-7a85-4edc-a3d3-d123dfb27af4" />


## Funcionalidades

- **Inventário**: nome, categoria, local (congelador, frigorífico ou despensa), doses, data de congelação, "consumir até" e notas. Cada item mostra `stock · planeadas · livres` e avisa quando está a acabar o prazo ou está há mais de 3 meses no congelador.
  - Aceita meias doses (ex.: `0,5`).
  - Permite **mover doses** de um local para outro, por exemplo para congelar parte do que está no frigorífico ou para descongelar uma dose.
  - A pesquisa e os filtros mantêm-se ao abrir um item e voltar à lista.
- **Semana**: de domingo a sábado ou de segunda a domingo (definição da casa). Tem pequeno-almoço, lanche da manhã (opcional), almoço, lanche da tarde e jantar.
  - Cada refeição pode ter várias entradas, vindas do inventário ou em texto livre.
  - Cada entrada é atribuída a uma pessoa da casa ou a todas, e cada pessoa tem a sua cor.
  - As entradas podem ser duplicadas para outros dias ou movidas. No computador também se arrastam com o rato; com Ctrl, arrastar copia.
  - No telemóvel os dias aparecem lado a lado, a deslizar, com um seletor dos 7 dias. A semana atual abre no dia de hoje.
- **Preparações** (o que vai ser cozinhado em cada dia):
  - **Para quando?**: as refeições em que a preparação vai ser comida. Aparecem a cinzento no calendário até ela estar feita.
  - **Ingredientes do inventário**: ficam reservados e são descontados quando a preparação é confirmada.
  - **Confirmar**: as doses entram no inventário, divididas por local se for preciso (ex.: 3 no frigorífico e 2 no congelador). "Desfazer" repõe tudo.
- **Consumo**: "Consumido" desconta o stock e "Não consumido" liberta a dose. As refeições que já passaram aparecem em **Por confirmar**. As confirmações podem ser desligadas: nesse caso, as refeições contam como consumidas quando passa a hora.
- **Tirar do congelador**: na véspera e no próprio dia, um aviso lista o que tem de sair do congelador, incluindo os ingredientes das preparações.
- **Ideias**: bloco de notas partilhado para receitas e ideias. Uma ideia pode ser copiada ou movida para o calendário, como refeição ou como preparação.
- **Notificações push** (opcionais, por pessoa e por dispositivo): tirar do congelador, preparações do dia seguinte, refeições por confirmar e validade a acabar. Cada pessoa escolhe as horas.
- **Contas**: utilizador e palavra-passe. Todas as pessoas veem e editam os mesmos dados.
- **Cópias de segurança** diárias automáticas, descarga da base de dados e exportação em JSON.
- **PWA** instalável, com tema claro e escuro.

O que está planeado a seguir está no [ROADMAP](ROADMAP.md).

Stack: SvelteKit 2 + Svelte 5, `@sveltejs/adapter-node` e SQLite através do módulo nativo `node:sqlite` (Node 24). Não há dependências de runtime: a imagem leva apenas `build/` e `package.json`.

---

## Instalação com Docker Compose

A imagem está publicada para `linux/amd64` e `linux/arm64` (Raspberry Pi incluído).

```yaml
services:
  marmita:
    image: ghcr.io/jorges15/marmita:latest   # ou: build: .
    container_name: marmita
    restart: unless-stopped
    ports:
      - "4004:4004"
    environment:
      ORIGIN: https://marmita.exemplo.pt   # URL pública (opcional)
      TZ: Europe/Lisbon
    volumes:
      - ./data:/data
```

```sh
mkdir -p data && sudo chown 1000:1000 data   # o container corre como o utilizador "node" (uid 1000)
docker compose up -d                          # usa a imagem publicada
# ou, a partir do código:
docker compose up -d --build
```

No primeiro acesso aparece o ecrã **Setup** para criar a primeira conta. As outras pessoas adicionam-se depois em **Definições → Pessoas da casa**.

> Se o Docker criar a pasta `./data` como root, o container não consegue escrever nela: corre `sudo chown 1000:1000 data` e volta a arrancar.

### Variáveis de ambiente

| Variável | Por omissão | Descrição |
|---|---|---|
| `ORIGIN` | — | URL pública da app (ex.: `https://marmita.exemplo.pt`). Opcional: a app aceita formulários vindos do mesmo endereço por onde é acedida (domínio, `localhost` ou IP). |
| `ALLOWED_ORIGINS` | — | Opcional. Outros endereços aceites como origem dos formulários, separados por vírgulas (ex.: `https://outro.exemplo.pt`). |
| `PORT` | `4004` | Porta HTTP. |
| `DATA_DIR` | `/data` | Pasta onde fica a base de dados `marmita.db`. |
| `TZ` | `Europe/Lisbon` | Fuso horário usado para "hoje", para "por confirmar" e para as horas das notificações. |
| `BACKUP_KEEP` | `14` | Número de cópias diárias da base de dados guardadas em `data/backups/` (`0` desliga). |
| `VAPID_SUBJECT` | `ORIGIN` (ou `mailto:marmita@example.com`) | Opcional. Contacto enviado aos serviços de push (Google, Apple, Mozilla). |

A proteção CSRF aceita pedidos cuja origem coincide com o host do pedido (`Host` ou `X-Forwarded-Host`), com o `ORIGIN` ou com o `ALLOWED_ORIGINS`. Pedidos de outros sites são rejeitados com 403. Por isso a mesma instalação funciona em `https://marmita.exemplo.pt`, `http://localhost:4004` e `http://192.168.1.x:4004`.

### Definições da casa

Em **Definições → Refeições da casa**, para todas as pessoas e dispositivos:

- **Semana começa à segunda-feira**: desligada, a semana vai de domingo a sábado.
- **Lanche da manhã**: desligado, fica só o lanche da tarde, com o nome "Lanche".
- **Confirmar o que foi consumido**: desligada, as refeições que já passaram contam como consumidas e saem do stock sozinhas.

### Reverse proxy (HTTPS)

A PWA só é instalável por HTTPS, e as notificações também precisam de HTTPS. Exemplos:

**Caddy**

```
marmita.exemplo.pt {
    reverse_proxy marmita:4004
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name marmita.exemplo.pt;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:4004;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Para que o limite de tentativas de login conte o IP real atrás do proxy, define `ADDRESS_HEADER=X-Forwarded-For` e `XFF_DEPTH=1`.

### Instalar no telemóvel

- **Android (Chrome)**: abrir o endereço e escolher **Instalar app** no menu.
- **iOS (Safari)**: Partilhar → **Adicionar ao ecrã principal**.

### Notificações

Em **Definições → Notificações**, cada pessoa ativa as notificações em cada um dos seus dispositivos e escolhe que tipos quer receber e a que horas.

- **Android (Chrome)** e **computador**: funcionam no navegador ou com a app instalada.
- **iPhone/iPad**: só a partir do iOS 16.4 e com a app **adicionada ao ecrã principal**.
- É preciso HTTPS (o reverse proxy) e o servidor tem de conseguir aceder à internet (`fcm.googleapis.com`, `web.push.apple.com`, etc.).
- O servidor verifica as notificações a cada minuto, no fuso definido em `TZ`. As chaves VAPID são geradas no primeiro arranque e guardadas na base de dados.

### Cópias de segurança

Os dados estão todos em `data/marmita.db`.

- **Automáticas**: a app faz uma cópia por dia em `data/backups/marmita-AAAA-MM-DD.db` e guarda as últimas 14 (`BACKUP_KEEP`).
- **Manual**: em **Definições → Dados → Descarregar base de dados** obténs uma cópia completa e consistente, feita na hora.
- **Exportar JSON** (no mesmo sítio) dá uma versão legível dos dados, mas não serve para repor.

Para **repor** uma cópia:

```sh
docker compose stop
cp data/marmita.db data/marmita.db.antes-de-repor
rm -f data/marmita.db-wal data/marmita.db-shm      # obrigatório
cp data/backups/marmita-2026-10-11.db data/marmita.db   # ou o ficheiro descarregado
sudo chown 1000:1000 data/marmita.db
docker compose start
```

Para levar as cópias para fora do servidor, basta copiar a pasta `data/backups/` (por exemplo, com `rsync` ou com o Syncthing).

### Atualizar

```sh
docker compose pull && docker compose up -d
```

As migrações da base de dados são aplicadas automaticamente no arranque.

---

## Imagem Docker (GitHub Actions)

O workflow [`.github/workflows/docker.yml`](.github/workflows/docker.yml):

- em cada pull request e em cada push, corre primeiro os testes (`npm run check`, `npm run build`, `npm test`); a imagem só é construída se passarem;
- em cada **pull request** para o `main`, faz o build da imagem (amd64) só para validar, sem a publicar;
- em cada **push/merge para o `main`**, faz o build para `linux/amd64` e `linux/arm64` e publica `ghcr.io/jorges15/marmita` com as tags `latest`, a versão do `package.json` (ex.: `1.13.1`) e `sha-<commit>`;
- em cada **tag `v*`** (ex.: `v1.13.1`), publica também as tags `1.13.1` e `1.13`.

Não é preciso configurar segredos, porque o workflow usa o `GITHUB_TOKEN`. Num fork, a imagem é publicada em `ghcr.io/<utilizador>/marmita`. Da primeira vez que é publicada, o pacote no GHCR pode ficar privado: para fazer `docker pull` sem autenticação, torna-o público em *GitHub → Packages → marmita → Package settings → Change visibility*.

---

## Versões

O projeto segue [Semantic Versioning](https://semver.org/lang/pt-PT/). A versão está em `package.json` e as alterações estão registadas em [`CHANGELOG.md`](CHANGELOG.md). Cada alteração ao código deve incluir:

1. o incremento da versão em `package.json` (`PATCH` para correções, `MINOR` para funcionalidades novas, `MAJOR` para alterações incompatíveis);
2. uma entrada nova no topo do `CHANGELOG.md`, no formato [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/).

A versão aparece no rodapé de todas as páginas da app, no login e em Definições.

---

## Desenvolvimento

Requer Node.js ≥ 22.13 (recomendado: 24).

```sh
npm install
npm run dev        # http://localhost:4004 (dados em ./data)
npm run check      # verificação de tipos (JSDoc) com svelte-check
npm run build && npm start   # http://localhost:4004
npm run build && npm test    # testes (vitest)
```

Os testes ficam em `tests/`, cada ficheiro com uma base de dados temporária:

- `plan`, `preparations`, `items`: contas do stock (planear, consumir, meias doses, duplicar, preparações divididas por local, ingredientes, mover doses, desfazer);
- `auth`, `validate`, `webpush`, `backup`: palavras-passe e sessões, validação de formulários e datas, cifra das notificações (RFC 8291/8292) e cópias de segurança;
- `http`: arranca o servidor de produção (`build/`) e testa os fluxos de ponta a ponta (setup, login, CSRF, inventário, calendário, preparações, ideias, definições, export). É ignorado se ainda não houver build.

Os ícones PNG são gerados por `node scripts/generate-icons.js`, sem dependências.

### Estrutura

```
src/
├─ hooks.server.js          # sessão → locals.user; proteção de rotas e CSRF; arranque de cópias e notificações
├─ service-worker.js        # cache da app; navegação network-first com página offline
├─ lib/
│  ├─ dates.js              # semanas (domingo ou segunda), formatação pt-PT
│  ├─ constants.js          # categorias, locais, refeições do dia, cores, doses
│  ├─ stock.js              # indicadores de antiguidade/validade
│  ├─ inventory.js          # filtros da lista do inventário (voltar à lista)
│  ├─ components/           # BottomSheet, ItemPicker, PrepEditor, PersonPicker, DayChips, PushSettings, …
│  └─ server/
│     ├─ db.js              # node:sqlite + migrações (PRAGMA user_version)
│     ├─ migrations/        # 001_init.sql … 009_saidas_preparacao.sql
│     ├─ auth.js            # scrypt, sessões, limite de tentativas
│     ├─ items.js           # inventário, mover doses entre locais
│     ├─ plan.js            # calendário; consumido/não consumido/desfazer em transação
│     ├─ preparations.js    # preparações, ingredientes, confirmar/desfazer por local
│     ├─ ideas.js           # ideias
│     ├─ settings.js        # definições da casa
│     ├─ notifications.js   # notificações e agendamento (a cada minuto)
│     ├─ webpush.js         # Web Push sem dependências (RFC 8291 + VAPID)
│     └─ backup.js          # cópias diárias (VACUUM INTO)
└─ routes/
   ├─ +page.*               # Semana (?w=AAAA-MM-DD; painéis no URL)
   ├─ inventario/           # lista, novo, [id]
   ├─ ideias/               # bloco de notas (lista, nova, [id])
   ├─ definicoes/           # perfil, refeições da casa, notificações, palavra-passe, pessoas, dados
   ├─ login/ setup/ logout/
   └─ health/               # GET → "ok" (healthcheck do Docker)
```

Para adicionar uma migração, cria o ficheiro seguinte em `src/lib/server/migrations/` (ex.: `010_descricao.sql`). É aplicada no arranque seguinte, dentro de uma transação.

---

## Decisões de implementação

- **Painéis no URL**: o painel para adicionar (`?novo=AAAA-MM-DD.almoco`), o de uma entrada (`?entrada=ID`) e o de uma preparação (`?preparacao=ID`) são controlados por parâmetros do URL. Assim funcionam sem JavaScript e o botão "voltar" do telemóvel fecha-os.
- **Cookie `secure`**: só é ativado quando o navegador está mesmo a usar HTTPS (pelo cabeçalho `Origin` ou pelo `X-Forwarded-Proto`). Assim é possível usar a app em `http://IP-local:4004`, porque com `secure` o navegador descartaria o cookie.
- **Proteção CSRF**: a verificação do SvelteKit, que só aceita exatamente o `ORIGIN`, foi substituída por uma verificação própria em `hooks.server.js`, que aceita o host por onde a app está a ser acedida.
- **Pessoas**: ao agendar escolhe-se uma pessoa ou "Ambos" (com mais de 2 pessoas, "Todos"). Por omissão fica a pessoa com sessão iniciada. As refeições de todos mostram uma faixa com as cores de todas as pessoas. As cores são atribuídas ao criar cada conta e podem ser mudadas em Definições → Perfil.
- **Hora a partir da qual uma refeição fica "Por confirmar"**: pequeno-almoço às 11h, lanche da manhã às 12h, almoço às 15h, lanche da tarde às 18h e jantar às 22h.
- **Stock**: o stock nunca fica negativo. Cada refeição consumida guarda quanto foi realmente descontado, e é isso que "Desfazer" repõe, para não aparecerem doses que não existiam.
- **Preparações**: ao confirmar, as doses de cada local juntam-se ao item com o mesmo nome nesse local, ou criam um item novo. As refeições de "Para quando?" ficam com o frigorífico primeiro (as mais próximas) e o congelador depois. "Desfazer" retira as doses, repõe os ingredientes e apaga os itens que a preparação criou, se não forem usados noutro sítio.
- **Mover doses entre locais**: as refeições planeadas acompanham as doses (as mais próximas vão para o frigorífico, as mais distantes para o congelador).
- **Confirmações desligadas**: só contam como consumidas sozinhas as refeições a partir do dia em que a definição foi desligada.
- **Sessões**: duram 1 ano e são renovadas, no máximo uma vez por dia, quando a app é usada. Mudar a palavra-passe termina as outras sessões do utilizador.
- **Pesquisa e filtros do inventário**: são feitos no navegador e ignoram maiúsculas e acentos ("feijao" encontra "Feijão"). Os filtros ficam no URL.
- **Arquivar e apagar**: a lista tem "Arquivar". Um item arquivado pode ser reposto ou apagado definitivamente na página do item. As entradas do calendário mantêm o nome do item apagado.
- **Remover uma entrada consumida**: o stock não é reposto (a refeição foi mesmo consumida). Para o repor, desfazer o "Consumido" antes de remover.
- **Mover para outra semana**: depois de mover, a app mostra a semana de destino.
- **Indicador "+3 meses"**: só se aplica a itens no congelador.
- **Ordem no seletor de itens**: mais antigo primeiro; os itens sem doses livres aparecem no fim, esbatidos, e escolhê-los pede confirmação.

## Licença

[MIT](LICENSE)
