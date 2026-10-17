// Vite's `?url` suffix resolves an asset import to its public URL (vite/client declares the general
// `*?url` form; this narrower declaration keeps type-checking independent of which client types load).
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
