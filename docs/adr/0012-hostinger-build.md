# ADR 0012 — Artefatos WebAssembly para builds sem Rust

- **Estado:** Aceito
- **Data:** 2026-11-10
- **Escopo:** `scripts/build-wasm.mjs`, `src/wasm/`, CI e implantação na Hostinger
- **Altera:** ADR 0003, seção 6 (artefatos gerados passam a ser versionados)

## Contexto

A implantação de `flaviotinoco.com` na Hostinger falhou no commit `bff1869d`: o ambiente Node.js 24 não
oferece `cargo`, e `spawnSync cargo ENOENT` interrompe `pnpm build` antes de Astro e Pagefind. Os núcleos
WebAssembly são estáticos e pequenos; recompilá-los na hospedagem não é necessário para gerar o site.
Reutilizar um arquivo apenas porque ele existe, porém, permitiria publicar um binário alterado ou anterior
às fontes Rust.

## Decisão

1. Versionar `src/wasm/{signal,information,dynamics}.wasm`, `manifest.json` e `sources.json`.
   `manifest.json` mantém o formato do ADR 0003: `{ name, bytes, gzipBytes, sha256 }` por módulo.
2. `sources.json` contém `{ sha256 }`, impressão determinística das entradas da compilação: fontes `.rs`,
   arquivos `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.cargo/config.toml` e
   `scripts/build-wasm.mjs`. Uma mudança nessas entradas exige regenerar e versionar o conjunto.
3. O modo padrão compila quando `cargo` está disponível. Sem `cargo`, valida e reutiliza os artefatos
   versionados. Uma falha real da compilação Rust continua sendo erro; ela não aciona o fallback.
4. `--prebuilt` exige a validação dos artefatos sem chamar Rust; `--rebuild` exige Rust e proíbe o fallback.
   `--check` não escreve arquivos. A validação compara a impressão das fontes e o manifesto dos binários,
   além das verificações existentes de ABI, importações, arena e orçamento de tamanho.
5. O CI continua compilando as fontes Rust, executando seus testes e testando os módulos pelos invólucros
   TypeScript. Reutilizar artefatos na hospedagem não substitui essas verificações.

## Operação

Para atualizar os artefatos, com a versão Rust de `wasm/rust-toolchain.toml` instalada:

```sh
node scripts/build-wasm.mjs --rebuild
pnpm test:wasm
node scripts/build-wasm.mjs --prebuilt --check
```

Versionar os três binários e os dois manifestos junto com as entradas alteradas. Artefatos ausentes,
corrompidos ou desatualizados interrompem o build com erro.

Na Hostinger, manter Node.js 24, comando `pnpm build`, diretório de saída `dist/`,
`SITE=https://flaviotinoco.com` e `BASE_PATH=/` (a API da Hostinger exige valor não vazio). O build executa Astro e Pagefind depois de validar os
núcleos, sem instalar Rust durante a implantação.

## Consequências

O repositório inclui três arquivos binários gerados e exige regeneração quando as entradas mudam. Em troca,
a hospedagem depende apenas do ambiente Node.js já oferecido, e a validação rejeita artefatos obsoletos.
A impressão das fontes registra correspondência de entradas; a compilação Rust e os testes continuam
sendo a evidência de comportamento dos núcleos.
