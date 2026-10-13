## O quê e por quê

<!-- Uma ou duas frases. Ligue a issue, o ADR ou a seção de docs/arquitetura.md afetada. -->

## Como verificar

<!-- Comandos, páginas ou casos de teste que mostram a mudança funcionando. -->

## Lista de verificação

- [ ] `pnpm check` passa (tipos, lint, formatação, tokens, paleta, i18n, testes).
- [ ] `pnpm build` passa sem avisos novos; `pnpm check:links` e `pnpm check:budgets` passam.
- [ ] O núcleo (`src/core/**`) continua puro: sem E/S, DOM, Astro, relógio, aleatoriedade nem `throw`.
- [ ] Transformações de texto preservam informação e têm teste de propriedade (fast-check).
- [ ] Textos de interface vêm de catálogos com paridade pt-BR/en; conteúdo novo existe nas duas línguas
      (mesmo `translationKey`).
- [ ] Estilos usam só tokens de design; estratos nunca são indicados só por cor.
- [ ] Acessibilidade: teclado, foco visível, `lang` em trechos estrangeiros, `aria-live` em resultados dinâmicos,
      fallback útil sem JavaScript.
- [ ] Nenhuma verificação foi desligada ou enfraquecida para o CI ficar verde.
- [ ] Decisão arquitetural nova? ADR em `docs/adr/`.
