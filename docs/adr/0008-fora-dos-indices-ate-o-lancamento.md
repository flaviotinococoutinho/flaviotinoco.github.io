# ADR 0008 — Fora dos índices de busca até o lançamento

- Status: aceito
- Data: 2026-10-19
- Relacionados: `astro.config.ts` (`env.schema`), `src/layouts/BaseLayout.astro`, `scripts/lib/robots.ts`,
  `scripts/check-robots.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`; ADR 0005

## Contexto

O site é publicado no GitHub Pages antes de estar pronto para leitores: o autor revisa o conteúdo no endereço
real, como co-piloto, enquanto ensaios, conceitos e resenhas amadurecem. Até o lançamento, nenhuma página deve
aparecer em buscadores.

Três fatos limitam as opções:

- O GitHub Pages não permite definir cabeçalhos HTTP, então `X-Robots-Tag` está fora de alcance.
- O site é de projeto, servido sob `/flaviotinoco.github.io/`. Um `robots.txt` nesse caminho não tem efeito,
  porque os buscadores só leem o arquivo na raiz da origem (RFC 9309, §2.3).
- Bloquear o rastreamento por `robots.txt` não impediria a indexação: uma URL descoberta por links externos pode
  ser indexada sem ser rastreada, e o rastreador nunca veria a regra da página. O Google documenta que a regra
  `noindex` só funciona se a página puder ser rastreada
  (<https://developers.google.com/search/docs/crawling-indexing/block-indexing>).

## Decisão

1. Toda página publicada leva `<meta name="robots" content="noindex, nofollow">` enquanto a indexação estiver
   desligada.
2. A indexação é uma opção de compilação explícita e tipada, `SITE_INDEXING` (`envField.boolean` em
   `astro.config.ts`), desligada por padrão. Só o valor `true` a liga; qualquer outro valor falha a validação do
   Astro.
3. Com a indexação ligada, só as páginas que nunca devem ser indexadas mantêm `noindex`: a página 404, o seletor de
   idioma da raiz e as páginas marcadas com `noindex` no `BaseLayout`.
4. `pnpm check:robots` lê todo o HTML de `dist/` e aplica a mesma regra. A verificação roda na CI (job do site) e
   no deploy, antes do envio ao Pages, para que nenhuma página escape.
5. O sitemap continua sendo gerado. Ele não convida à indexação de páginas com `noindex`, e estará pronto no
   lançamento.

## Consequências

- Positivas:
  - O site pode ir ao ar para revisão sem ser indexado.
  - Lançar é mudar configuração, não código: definir `SITE_INDEXING: 'true'` no ambiente do passo de compilação
    de `.github/workflows/deploy.yml` (e no de verificação, que lê a mesma variável) e publicar de novo.
  - Uma página nova que fuja da regra falha a CI.
- Negativas:
  - Enquanto a indexação estiver desligada, o site não é encontrado por busca; o acesso é pelo endereço direto.
  - `nofollow` também impede que os buscadores sigam os links do site para outras páginas.
- Fora do escopo: pedir a remoção de URLs já indexadas. Nenhuma foi publicada antes desta decisão.
