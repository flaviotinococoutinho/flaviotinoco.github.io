/**
 * ft ontology check|stats|show <id>
 *
 * A thin command over cli/ontology-port.ts (loadOntology → OntologyView):
 *   check  validates the concept graph (parse, unknown references, broader cycles); exit 1 on a problem;
 *   stats  size, depth, distribution over the strata and its entropy;
 *   show   one concept: labels, stratum, broader/narrower/related, depth, IC and
 *          the closest concepts by Lin similarity.
 * A project without src/content/concepts is reported as such (exit 0).
 */
import { STRATA } from '../../src/core/domain/strata.ts';
import { formatNumber } from '../../src/core/i18n/messages.ts';
import { openSession, parseCommand, type Session } from '../args.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { loadOntology, type OntologyView } from '../ontology-port.ts';
import { table } from '../term.ts';
import { usageError } from './shared.ts';

export const OPTIONS = {} as const;

const fixed = (session: Session, x: number, digits = 3): string =>
  formatNumber(session.locale, x, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const stats = (session: Session, view: OntologyView): void => {
  const { t, out } = session;
  session.print(out.bold(t('ontology.stats.title')));
  const rows: string[][] = [
    [t('ontology.stats.concepts'), String(view.ids.length)],
    [t('ontology.stats.broader'), String(view.edges.broader)],
    [t('ontology.stats.related'), String(view.edges.related)],
    [t('ontology.stats.top'), String(view.ids.filter((id) => view.depth(id) === 0).length)],
    [t('ontology.stats.maxDepth'), String(view.maxDepth)],
    [
      t('ontology.stats.meanIc'),
      view.ids.length === 0
        ? '—'
        : fixed(session, view.ids.reduce((acc, id) => acc + view.informationContent(id), 0) / view.ids.length),
    ],
  ];
  for (const line of table(rows, ['left', 'right'])) session.print(`  ${line}`);
  session.print();
  session.print(out.bold(t('ontology.stats.strata')));
  const n = view.ids.length;
  const srows = STRATA.map((s) => [
    t(`stratum.${s}`),
    String(view.strata[s]),
    n === 0 ? '—' : `${fixed(session, (100 * view.strata[s]) / n, 1)} %`,
  ]);
  for (const line of table(srows, ['left', 'right', 'right'])) session.print(`  ${line}`);
  session.print(`  ${t('ontology.stats.entropy', { bits: fixed(session, view.stratumEntropy), max: fixed(session, 2) })}`);
};

const show = (session: Session, view: OntologyView, id: string): ExitCode => {
  const { t, out } = session;
  const c = view.get(id);
  if (c === undefined) {
    session.warn(session.errStyle.red(t('ontology.unknown', { id })));
    return EXIT_FAILURE;
  }
  const label = (x: string): string => view.get(x)?.prefLabel[session.locale] ?? x;
  const ids = (xs: readonly string[]): string => (xs.length === 0 ? '—' : xs.map((x) => `${label(x)} (${x})`).join(', '));
  session.print(`${out.bold(c.prefLabel[session.locale])} ${out.dim(`(${c.id})`)}`);
  session.print(out.italic(c.definition[session.locale]));
  session.print();
  const rows: string[][] = [
    ['pt-BR / en', `${c.prefLabel['pt-BR']} / ${c.prefLabel.en}`],
    [t('ontology.show.stratum'), t(`stratum.${c.stratum}`)],
    [t('ontology.show.broader'), ids(c.broader)],
    [t('ontology.show.narrower'), ids(view.narrower(id))],
    [t('ontology.show.related'), ids(c.related)],
    [t('ontology.show.depth'), String(view.depth(id))],
    [t('ontology.show.ic'), fixed(session, view.informationContent(id))],
  ];
  for (const line of table(rows)) session.print(`  ${line}`);
  const near = view.closest(id, 5);
  session.print();
  session.print(out.bold(t('ontology.show.closest')));
  if (near.length === 0) session.print(`  ${t('ontology.show.none')}`);
  for (const line of table(near.map((x) => [fixed(session, x.similarity), `${label(x.id)} (${x.id})`]), ['right', 'left'])) {
    session.print(`  ${line}`);
  }
  return EXIT_OK;
};

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'ontology', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values);
  const { t } = session;
  const [sub, ...rest] = positionals;
  if (sub !== 'check' && sub !== 'stats' && sub !== 'show') {
    return usageError(io, 'ontology', t('error.subcommand', { value: sub ?? '', expected: 'check, stats, show' }), session);
  }
  if (sub === 'show' ? rest.length !== 1 : rest.length > 0) {
    return usageError(io, 'ontology', sub === 'show' ? t('ontology.showId') : t('error.extra', { value: rest.join(' ') }), session);
  }
  const loaded = await loadOntology(session.root, io.fs);
  if (loaded === undefined) {
    session.print(t('ontology.absent'));
    return EXIT_OK;
  }
  if (!loaded.ok) {
    for (const p of loaded.error) session.warn(session.errStyle.red(`${p.file}: ${t('severity.error')}: ${p.message}`));
    session.warn(t('ontology.problems', { count: loaded.error.length }));
    return EXIT_FAILURE;
  }
  const view = loaded.value;
  for (const note of view.notes) session.warn(session.errStyle.dim(note));
  switch (sub) {
    case 'check':
      session.print(
        session.out.green(t('ontology.ok', { concepts: view.ids.length, broader: view.edges.broader, related: view.edges.related })),
      );
      return EXIT_OK;
    case 'stats':
      stats(session, view);
      return EXIT_OK;
    case 'show':
      return show(session, view, rest[0] ?? '');
  }
};
