# Marmita

Planeador de refeições caseiro: inventário do que está congelado ou guardado e um calendário semanal onde se atribuem essas refeições a almoços e jantares.
Self-hosted em Docker, usado como PWA e partilhado pelas pessoas da casa.

- **Inventário**: nome, categoria, local, doses, data de congelação, "consumir até" e notas. Cada item mostra `stock · planeadas · livres`.
- **Semana**: de segunda a domingo, com almoço e jantar. Cada refeição pode ter várias entradas, vindas do inventário ou em texto livre.
- **Consumo**: "Comido" desconta o stock, "Não comido" liberta a dose e "Desfazer" repõe tudo. As refeições que já passaram aparecem em **Por confirmar**.
- **Contas**: utilizador e palavra-passe. Todos veem e editam os mesmos dados.
- **PWA** instalável (exige HTTPS), com tema claro e escuro, em português de Portugal.

Stack: SvelteKit 2 + Svelte 5, `@sveltejs/adapter-node` e SQLite através do módulo nativo `node:sqlite` (Node 24). Não há dependências de runtime: a imagem leva apenas `build/` e `package.json`.

---

## Instalação com Docker Compose

```yaml
services:
  marmita:
    image: ghcr.io/jorges15/marmita:latest   # ou: build: .
    container_name: marmita
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      ORIGIN: https://marmita.exemplo.pt   # URL pública, obrigatória (CSRF)
      TZ: Europe/Lisbon
    volumes:
      - ./data:/data
```

```sh
docker compose up -d            # usa a imagem publicada
# ou, a partir do código:
docker compose up -d --build
```

No primeiro acesso aparece o ecrã **Setup** para criar a primeira conta. A segunda pessoa adiciona-se depois em **Definições → Pessoas da casa**.

> A pasta `./data` tem de ser gravável pelo utilizador `node` do container (uid 1000). Se o Docker a criar como root, corre `sudo chown 1000:1000 data`.

### Variáveis de ambiente

| Variável | Por omissão | Descrição |
|---|---|---|
| `ORIGIN` | — | URL pública da app (ex.: `https://marmita.exemplo.pt`). É obrigatória porque o SvelteKit valida a origem dos formulários. Em alternativa, usar `PROTOCOL_HEADER=x-forwarded-proto` e `HOST_HEADER=x-forwarded-host`. |
| `PORT` | `3000` | Porta HTTP. |
| `DATA_DIR` | `/data` | Pasta onde fica a base de dados `marmita.db`. |
| `TZ` | `Europe/Lisbon` | Fuso horário usado para "hoje" e para "por confirmar". |

Se o `ORIGIN` não coincidir com o endereço usado no browser, os formulários falham com *"Cross-site POST form submissions are forbidden"*.

### Reverse proxy (HTTPS)

A PWA só é instalável por HTTPS. Exemplos:

**Caddy**

```
marmita.exemplo.pt {
    reverse_proxy marmita:3000
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name marmita.exemplo.pt;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Para limitar as tentativas de login por IP real atrás do proxy, define `ADDRESS_HEADER=X-Forwarded-For` e `XFF_DEPTH=1`.

### Instalar no telemóvel

- **Android (Chrome)**: abrir o endereço e escolher **Instalar app** no menu.
- **iOS (Safari)**: Partilhar → **Adicionar ao ecrã principal**.

### Backups

Os dados estão todos em `data/marmita.db`. Como a base de dados usa WAL, há duas formas seguras de fazer a cópia:

```sh
# a quente, com o sqlite3 instalado no host
sqlite3 data/marmita.db ".backup marmita-$(date +%F).db"

# ou parando o container
docker compose stop && cp data/marmita.db* /backups/ && docker compose start
```

Também é possível descarregar um export JSON dos itens e do plano em **Definições → Exportar JSON**.

### Atualizar

```sh
docker compose pull && docker compose up -d
```

As migrações da base de dados são aplicadas automaticamente no arranque.

---

## Imagem Docker (GitHub Actions)

O workflow [`.github/workflows/docker.yml`](.github/workflows/docker.yml):

- em cada **pull request** para o `main`, faz o build da imagem (amd64) só para validar, sem a publicar;
- em cada **push/merge para o `main`**, faz o build para `linux/amd64` e `linux/arm64` e publica `ghcr.io/jorges15/marmita` com as tags `latest` e `sha-<commit>`;
- em cada **tag `v*`** (ex.: `v1.2.0`), publica também as tags `1.2.0` e `1.2`.

Não é preciso configurar segredos, porque o workflow usa o `GITHUB_TOKEN`. Da primeira vez que a imagem é publicada, o pacote no GHCR pode ficar privado. Para fazer `docker pull` sem autenticação, torna-o público em *GitHub → Packages → marmita → Package settings → Change visibility*, ou faz `docker login ghcr.io` no servidor.

---

## Desenvolvimento

Requer Node.js ≥ 22.13 (recomendado: 24).

```sh
npm install
npm run dev        # http://localhost:5173 (dados em ./data)
npm run check      # verificação de tipos (JSDoc) com svelte-check
npm run build && npm start
```

Os ícones PNG são gerados por `node scripts/generate-icons.js`, sem dependências.

### Estrutura

```
src/
├─ hooks.server.js          # sessão → locals.user; proteção de rotas; redireciona para /setup
├─ service-worker.js        # cache do app shell; navegação network-first com página offline
├─ lib/
│  ├─ dates.js              # semanas (segunda), formatação pt-PT
│  ├─ constants.js          # categorias, locais, slots
│  ├─ stock.js              # indicadores de antiguidade/validade
│  ├─ components/           # BottomSheet, ItemPicker, ItemForm, StockBadge, TabBar
│  └─ server/
│     ├─ db.js              # node:sqlite + migrações (PRAGMA user_version)
│     ├─ migrations/        # 001_init.sql, ...
│     ├─ auth.js            # scrypt, sessões, limite de tentativas
│     ├─ items.js           # inventário
│     └─ plan.js            # calendário; comido/não comido/desfazer em transação
└─ routes/
   ├─ +page.*               # Semana (?w=AAAA-MM-DD)
   ├─ inventario/           # lista, novo, [id]
   ├─ definicoes/           # perfil, palavra-passe, pessoas, export JSON
   ├─ login/ setup/ logout/
   └─ health/               # GET → "ok" (healthcheck do Docker)
```

Para adicionar uma migração, cria `src/lib/server/migrations/002_descricao.sql`. É aplicada no arranque seguinte.

---

## Decisões de implementação

Pontos que a especificação deixava em aberto e a opção tomada:

- **Painéis no URL**: o painel para adicionar (`?novo=AAAA-MM-DD.almoco`) e o painel de uma entrada (`?entrada=ID`) são controlados por parâmetros do URL. Assim funcionam sem JavaScript e o botão "voltar" do telemóvel fecha-os.
- **Cookie `secure`**: só é ativado quando a app é servida por HTTPS (conforme o `ORIGIN`/`PROTOCOL_HEADER`). Assim é possível testar em `http://IP-local:3000`, porque com `secure` o browser descartaria o cookie.
- **Sessões**: duram 1 ano e são renovadas, no máximo uma vez por dia, quando a app é usada. Mudar a palavra-passe termina as outras sessões do utilizador.
- **Pesquisa e filtros do inventário**: são feitos no browser e ignoram maiúsculas e acentos ("feijao" encontra "Feijão"). Os filtros ficam refletidos no URL.
- **Arquivar e apagar**: a lista tem "Arquivar". Um item arquivado pode ser reposto ou apagado definitivamente na página do item. As entradas do calendário mantêm o nome do item apagado.
- **Editar uma entrada já comida**: se mudarem as doses, o stock acompanha a diferença.
- **Remover uma entrada comida**: o stock não é reposto (a refeição foi mesmo comida). Para o repor, usar "Desfazer" antes de remover.
- **Mover para outra semana**: depois de mover, a app mostra a semana de destino.
- **Indicador "+3 meses"**: só se aplica a itens no congelador.
- **Ordem no seletor de itens**: mais antigo primeiro; os itens sem doses livres aparecem no fim, esbatidos, e escolhê-los pede confirmação.

## Licença

MIT
