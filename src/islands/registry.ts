/**
 * Islands registry — the single client entry point (imperative shell).
 *
 * Convention: every interactive element is a custom element named ft-*, whose
 * module lives at src/islands/elements/<tag>.ts and calls customElements.define.
 * Markdown (via remark stages) and Astro views only emit the tag; this registry
 * imports each module lazily, the first time its tag approaches the viewport,
 * so a page downloads only the behaviour it actually shows. Vite splits each
 * module into its own chunk; nothing here depends on a framework.
 */
const modules = import.meta.glob<unknown>('./elements/ft-*.ts');

const requested = new Set<string>();

const load = (tag: string): void => {
  if (requested.has(tag) || customElements.get(tag)) return;
  const loader = modules[`./elements/${tag}.ts`];
  if (!loader) return;
  requested.add(tag);
  void loader().catch((error: unknown) => {
    requested.delete(tag);
    console.error(`[islands] failed to load <${tag}>`, error);
  });
};

/** Elements marked data-eager load immediately; the rest within one viewport of visibility. */
const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      visibility.unobserve(entry.target);
      load(entry.target.localName);
    }
  },
  { rootMargin: '100% 0px' },
);

const scan = (root: ParentNode): void => {
  for (const el of root.querySelectorAll(':not(:defined)')) {
    if (!el.localName.startsWith('ft-')) continue;
    if (el.hasAttribute('data-eager')) load(el.localName);
    else visibility.observe(el);
  }
};

scan(document);
new MutationObserver((records) => {
  for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) scan(n.parentElement ?? n);
}).observe(document.body, { childList: true, subtree: true });
