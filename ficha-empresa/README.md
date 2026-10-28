# ficha-empresa

Digite `NOME_FANTASIA CIDADE` (uma empresa por linha, até 20) e receba a ficha com **nome fantasia** (com `BAIXADA` quando for o caso), **sócio**, **Instagram**, **Google Maps** e **CNPJ**.

Fluxo da função `api/ficha.js`, por empresa:

1. Busca na web com o texto digitado: Instagram e site oficial (para um possível `ftid` do Maps).
2. Busca na web com o texto + `CNPJ`: candidatos de 14 dígitos validados pelo dígito verificador.
3. [Minha Receita](https://docs.minhareceita.org/) (`GET https://minhareceita.org/{cnpj}`) para até 5 candidatos. Só é aceito um CNPJ cuja cidade bate com a digitada e cujo nome é parecido. Se mais de um conferir, fica o ativo e a ficha sai marcada como `ambiguo`.

**Telefone:** o do Google Maps vem primeiro (costuma ser o número em uso); os da Receita entram como alternativa ou complemento, sem repetir números.

Com o Serper, a ferramenta também consulta o **Google Maps** (endpoint `/places`, 1 crédito por empresa) para achar o estabelecimento pelo nome e cidade. Isso dá:
- um link do Maps exato (`https://maps.google.com/?cid=...`);
- o Instagram, quando é o site cadastrado no Google;
- a confirmação de CNPJ quando o nome na Receita é diferente do nome da loja (bandeiras e franquias, como "Rede Construção - Gêmeos"): o CNPJ da mesma cidade é aceito se o telefone ou o endereço (número e rua) bater com o do Google. A ficha mostra "confirmado pelo telefone/endereço no Google".

Nenhum dado é inventado. O que não for encontrado com segurança volta como `nao_encontrado`.

## Estrutura

```
index.html        interface (HTML/CSS/JS puros)
api/ficha.js      função serverless (Node 24, fetch nativo, sem dependências)
lib/              parser, CNPJ, busca (buscarWeb: Serper ou Brave), Receita, Instagram, Maps, orquestração
test/             testes com respostas mockadas (node --test)
```

Para trocar de provedor de busca, mexa apenas em `lib/busca.js`, mantendo o formato de saída de `buscarWeb`.

## 1. Chave de busca

A busca usa o **Serper.dev** (resultados do Google) quando `SERPER_API_KEY` existe; senão, o **Brave Search** (`BRAVE_API_KEY`). Cada empresa consome 2 buscas.

- **Serper.dev (recomendado):** crie a conta em <https://serper.dev>. São 2.500 buscas grátis, sem cartão, e a chave fica em **API Key**. Depois disso, pacotes pré-pagos. Por padrão pede 10 resultados por busca (`SERPER_NUM`), porque acima disso cada busca custa 2 créditos.
- **Brave Search:** crie a conta em <https://api-dashboard.search.brave.com/> e assine o plano **Search**. São US$ 5 de crédito por mês (cerca de 1.000 buscas), com cartão obrigatório e atribuição ao Brave no site.

A API oficial do Google (Custom Search JSON API) está fechada para novos clientes e será desligada em 01/01/2027, por isso não é usada.

Nunca coloque a chave no `index.html` nem faça commit dela.

## 2. Definir a chave na Vercel

No projeto na Vercel: **Settings > Environment Variables**.

| Nome | Valor |
|---|---|
| `SERPER_API_KEY` | chave do Serper |
| `SERPER_NUM` (opcional) | resultados por busca; padrão `10` |
| `BRAVE_API_KEY` (alternativa) | chave do Brave |
| `BRAVE_INTERVALO_MS` (opcional) | intervalo mínimo entre buscas no Brave, em ms; padrão `1000` |

Depois de salvar, faça um **Redeploy** para a variável valer.

## 3. Rodar localmente

```bash
npm i -g vercel        # uma vez
cd ficha-empresa
vercel link            # associa a pasta a um projeto (pede confirmação)
vercel env pull .env.local   # ou crie .env.local a partir de .env.example
vercel dev             # http://localhost:3000
```

Testes (não usam rede nem chave):

```bash
npm test               # = node --test
```

## API

`POST /api/ficha` com `{"empresas": "linha 1\nlinha 2"}` (ou uma lista), ou `GET /api/ficha?q=baterias+luxfor+rio+verde`.

- Com `Accept: application/x-ndjson`, a resposta vem em streaming, uma linha JSON por evento (`inicio`, `etapa`, `resultado`, `fim`). É assim que a interface mostra o progresso.
- Sem esse header, a resposta é `{ total, resultados: [...] }`.

Cada ficha traz `etapas.{busca_web,busca_cnpj,receita}`, `empresa`, `socio`, `instagram` e `maps`, cada um com `status` (`ok` | `nao_encontrado` | `erro`) e `mensagem`, além de `ambiguo`, `outros_candidatos`, `candidatos_descartados` e `cidade_inferida`.

Limites: 8 s por chamada externa, 3 empresas em paralelo, 20 empresas por requisição e `maxDuration` de 60 s (`vercel.json`).

## Como o input é interpretado

- **Campo Cidade** (recomendado quando a lista é toda de uma cidade): cada linha passa a ser só o nome. Se a cidade for repetida no fim da linha, ela é ignorada. O campo sugere os municípios de Goiás; fora de Goiás, use `Cidade/UF`. A última cidade fica salva no navegador. Na API: `"cidade"` no POST ou `&cidade=` no GET.
- Uma linha com separador explícito usa a cidade escrita nela, mesmo com o campo preenchido. Útil para uma empresa de outra cidade na mesma lista.

Com o campo vazio:

- Com vírgula, ` - ` ou `|`, a cidade é o último pedaço: `Baterias Luxfor, Rio Verde`.
- Sem separador, a cidade é o fim do texto. A ferramenta procura o maior final que seja um município de Goiás (lista do IBGE em `lib/cidades-go.js`). Se não achar, usa a última palavra (ou as 3 últimas, em nomes do tipo "X de Y"). Nesse caso a ficha volta com `cidade_inferida: true`.
- Uma UF no fim (`... Rio Verde/GO`, `... rio verde go`) é reconhecida e usada como filtro.

## Link do Maps

`https://www.google.com/maps/search/?api=1&query=` + nome fantasia, logradouro, número, município e UF da Receita. Se o site oficial da empresa tiver um único identificador de local (`ftid` `0x...:0x...`), o link vira `https://www.google.com/maps?ftid=...`. Links `maps.app.goo.gl` não são gerados, porque só o botão Compartilhar do Google cria esses links.

## Copiar para planilha

O botão copia as linhas **sem cabeçalho**, separadas por tabulação, nesta ordem: Empresa, Segmento, Responsável (sócio), Site (Instagram), Local (Maps), Telefone. Cole na primeira coluna da planilha.

O **Segmento** vem do CNAE principal registrado na Receita, traduzido pela tabela em `lib/segmentos.js` (ex.: 4771-7/01 vira "Farmácias"). A chave é o começo do código CNAE e vale a mais específica. Para mudar um nome ou incluir um ramo, edite essa tabela. Se o CNAE não estiver na tabela, vai a descrição oficial da atividade.
