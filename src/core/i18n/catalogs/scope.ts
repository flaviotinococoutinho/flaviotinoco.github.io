import { defineMessages } from '../messages.ts';

/**
 * Scope of the site (ADR 0013; model in src/core/domain/scope.ts): the lines of
 * inquiry, what each core discipline covers and leaves out, and the text of the
 * scope pages. Names of disciplines and foundations are the `domain.*` labels of
 * the reading catalog — one vocabulary, one set of labels.
 */
export default defineMessages({
  'pt-BR': {
    'scope.title': 'Escopo',
    'scope.description':
      'Do que este site trata e do que não trata: onze disciplinas em cinco frentes, com a cobertura de cada uma medida no acervo.',
    'scope.lede':
      'Este site trata de como se constrói software e do que é preciso saber para decidir bem ao construí-lo. São onze disciplinas, em cinco frentes.',
    'scope.criterion':
      'Um texto entra quando responde a uma pergunta de pelo menos uma dessas disciplinas. Um fundamento, como a matemática, a probabilidade ou a semiótica, entra só até onde uma disciplina depende dele.',
    'scope.nav': 'Escopo',
    'scope.axes.title': 'As cinco frentes',
    'scope.matrix.title': 'Cobertura',
    'scope.matrix.caption': 'Obras e conceitos de cada disciplina em cada estrato da ponte',
    'scope.matrix.discipline': 'Disciplina',
    'scope.matrix.read':
      'Cada célula conta as obras (ensaios e laboratórios) e os conceitos que declaram a disciplina naquele estrato. O traço marca uma lacuna: ainda não há texto ali. A tabela é calculada a partir do acervo a cada compilação.',
    'scope.works.one': '{n} obra',
    'scope.works.other': '{n} obras',
    'scope.concepts.one': '{n} conceito',
    'scope.concepts.other': '{n} conceitos',
    'scope.gap': 'sem texto ainda',
    'scope.planned': 'Previsto: ainda sem obra publicada.',
    'scope.out.title': 'O que fica de fora',
    'scope.out.tutorials':
      'Tutoriais de ferramenta, guias de instalação e passo a passo. Uma ferramenta entra como realização de um conceito, não como assunto.',
    'scope.out.news': 'Notícias, lançamentos e comparações de produtos.',
    'scope.out.opinion': 'Opinião sem fonte. Toda afirmação factual não trivial cita de onde vem.',
    'scope.out.foundations':
      'Fundamentos por si mesmos: matemática, probabilidade ou filosofia de que nenhuma das onze disciplinas depende.',
    'scope.out.elsewhere': 'Assuntos fora das onze disciplinas, mesmo quando interessantes.',
    'scope.rules.title': 'Como o escopo é verificado',
    'scope.rules.lede': 'O escopo não é uma intenção: três regras são conferidas a cada compilação.',
    'scope.rules.vocabulary':
      'O vocabulário é fechado. Todo domínio é uma disciplina do núcleo ou um fundamento, e todo fundamento declara de quais disciplinas é fundamento.',
    'scope.rules.essays':
      'Todo ensaio declara ao menos uma disciplina do núcleo. Um ensaio só sobre fundamentos não compila.',
    'scope.rules.share':
      'Pelo menos {minimum} das obras declaram uma disciplina do núcleo. Hoje são {core} de {total} ({percent}).',
    'scope.foundations.title': 'Fundamentos',
    'scope.foundations.lede': 'Campos de apoio e as disciplinas que dependem de cada um.',
    'scope.foundations.supports': 'fundamento de',

    'axis.label': 'Frente',
    'axis.software.title': 'Construir software',
    'axis.software.body':
      'Estados impossíveis, ocultação de informação, camadas de ritmo, lei de Conway e decisões arquiteturais registradas.',
    'axis.optimization.title': 'Computação e otimização',
    'axis.optimization.body':
      'Teto de Amdahl, códigos ótimos, NP-completude, garantias de aproximação e parada racional no suficiente.',
    'axis.systems.title': 'Sistemas de informação e dados',
    'axis.systems.body':
      'Registros imutáveis contra sobrescrita no lugar, transações, idempotência e o caminho dos dados da fonte ao uso.',
    'axis.signals.title': 'Informação e sinais',
    'axis.signals.body':
      'Entropia, redundância, canais e códigos como medida comum; amostragem, frequência e ruído onde o contínuo vira dado.',
    'axis.philosophy.title': 'Filosofia aplicada',
    'axis.philosophy.body':
      'Signo, índice e símbolo, essência e acidente, abstração e gramática visual a serviço da clareza estrutural.',

    'discipline.software-engineering.lede':
      'Como se constrói e se mantém software que precisa mudar: representação de estado, modularidade, verificação e o custo de cada escolha.',
    'discipline.software-engineering.out':
      'Tutoriais de linguagem ou de framework e comparações de produtos sem um conceito por trás.',
    'discipline.software-architecture.lede':
      'As decisões difíceis de desfazer: onde ficam as fronteiras dos módulos, o que cada uma esconde e como registrar a decisão.',
    'discipline.software-architecture.out':
      'Arquiteturas de referência de fornecedores e catálogos de padrões sem o problema que os motiva.',
    'discipline.systems-design.lede':
      'O comportamento de um sistema inteiro antes do código: estados, eventos, falhas e as pessoas que o usam.',
    'discipline.systems-design.out':
      'Roteiros de entrevista e arquiteturas copiadas de outras empresas sem as restrições que as justificam.',
    'discipline.computer-science.lede':
      'O que se pode computar, a que custo e com que garantia: autômatos, algoritmos, complexidade e códigos.',
    'discipline.computer-science.out': 'Resolução de exercícios e curiosidades sem consequência para quem programa.',
    'discipline.systems-optimization.lede':
      'Escolher o melhor sob restrições e saber quando parar: limites de aceleração, otimização combinatória, aproximação e o custo de buscar o ótimo.',
    'discipline.systems-optimization.out':
      'Ajustes de desempenho de uma ferramenta específica e medições sem método reprodutível.',
    'discipline.information-systems.lede':
      'O que uma organização precisa lembrar e como: registros, transações, consistência e a quem a memória serve.',
    'discipline.information-systems.out': 'Manuais de produtos de gestão e modas de processo.',
    'discipline.information-technology.lede':
      'As ferramentas que realizam os conceitos: pilhas de tecnologia, seus contratos, seu custo de adoção e de saída e seu prazo de validade.',
    'discipline.information-technology.out': 'Notícias de lançamento, comparações de preço e guias de instalação.',
    'discipline.data-engineering.lede':
      'O caminho dos dados da fonte ao uso: extrair, transformar e carregar, o que cada etapa preserva ou perde e como reexecutar sem duplicar.',
    'discipline.data-engineering.out': 'Receitas de configuração de orquestradores, conectores e bancos de dados.',
    'discipline.information-theory.lede':
      'A medida comum do site: entropia, redundância, canais e códigos, usados para contar o que uma representação informa e o que desperdiça.',
    'discipline.information-theory.out': 'Usos metafóricos de entropia e de informação sem uma medida definida.',
    'discipline.signal-processing.lede':
      'Como o contínuo vira dado: amostragem, frequência, ruído e o que se perde ao discretizar.',
    'discipline.signal-processing.out': 'Projeto de filtros para uma aplicação específica e eletrônica de hardware.',
    'discipline.applied-philosophy.lede':
      'Dizer com precisão o que é signo, informação, estado, registro ou abstração antes de medir ou programar.',
    'discipline.applied-philosophy.out': 'História da filosofia e debates que não mudam nenhuma decisão de engenharia.',

    'discipline.description':
      'O que o site cobre de {name}: obras e conceitos em cada estrato da ponte, os fundamentos de que depende e o que fica de fora.',
    'discipline.kind': 'Disciplina',
    'discipline.in': 'O que entra',
    'discipline.out': 'Fica de fora',
    'discipline.bridge.title': 'Na ponte',
    'discipline.bridge.lede':
      'A ponte restrita a esta disciplina: o que há em cada estrato, na ordem em que se percorre.',
    'discipline.works': 'Obras',
    'discipline.concepts': 'Conceitos',
    'discipline.empty': 'Ainda não há texto desta disciplina neste estrato.',
    'discipline.foundations.title': 'Fundamentos de que depende',
    'discipline.foundations.lede': 'Entram no site só até onde esta disciplina precisa deles.',
    'discipline.foundations.works': 'Obras de fundamento',
    'discipline.foundations.none': 'Nenhum fundamento declarado.',
    'discipline.others': 'Outras disciplinas',
    'discipline.all': 'Todo o escopo',
  },
  en: {
    'scope.title': 'Scope',
    'scope.description':
      'What this site is about and what it is not: eleven disciplines in five lines of inquiry, each with its coverage measured in the corpus.',
    'scope.lede':
      'This site is about how software is built and what one needs to know to decide well while building it. Eleven disciplines, in five lines of inquiry.',
    'scope.criterion':
      'A text belongs when it answers a question of at least one of these disciplines. A foundation, such as mathematics, probability or semiotics, belongs only as far as a discipline depends on it.',
    'scope.nav': 'Scope',
    'scope.axes.title': 'The five lines of inquiry',
    'scope.matrix.title': 'Coverage',
    'scope.matrix.caption': 'Works and concepts of each discipline on each stratum of the bridge',
    'scope.matrix.discipline': 'Discipline',
    'scope.matrix.read':
      'Each cell counts the works (essays and labs) and the concepts that declare the discipline on that stratum. A dash marks a gap: there is no text there yet. The table is computed from the corpus on every build.',
    'scope.works.one': '{n} work',
    'scope.works.other': '{n} works',
    'scope.concepts.one': '{n} concept',
    'scope.concepts.other': '{n} concepts',
    'scope.gap': 'no text yet',
    'scope.planned': 'Planned: no published work yet.',
    'scope.out.title': 'What is left out',
    'scope.out.tutorials':
      'Tool tutorials, installation guides and step-by-step recipes. A tool enters as the realization of a concept, not as a subject.',
    'scope.out.news': 'News, product launches and product comparisons.',
    'scope.out.opinion': 'Unsourced opinion. Every non-trivial factual claim says where it comes from.',
    'scope.out.foundations':
      'Foundations for their own sake: mathematics, probability or philosophy that none of the eleven disciplines depends on.',
    'scope.out.elsewhere': 'Subjects outside the eleven disciplines, even when interesting.',
    'scope.rules.title': 'How the scope is checked',
    'scope.rules.lede': 'The scope is not an intention: three rules are checked on every build.',
    'scope.rules.vocabulary':
      'The vocabulary is closed. Every domain is a core discipline or a foundation, and every foundation states which disciplines it is a foundation of.',
    'scope.rules.essays':
      'Every essay declares at least one core discipline. An essay about foundations only does not build.',
    'scope.rules.share':
      'At least {minimum} of the works declare a core discipline. Today that is {core} of {total} ({percent}).',
    'scope.foundations.title': 'Foundations',
    'scope.foundations.lede': 'Supporting fields and the disciplines that depend on each one.',
    'scope.foundations.supports': 'a foundation of',

    'axis.label': 'Line of inquiry',
    'axis.software.title': 'Building software',
    'axis.software.body':
      'Impossible states, information hiding, pace layers, Conway’s law and recorded architectural decisions.',
    'axis.optimization.title': 'Computing and optimization',
    'axis.optimization.body':
      'Amdahl’s ceiling, optimal prefix codes, NP-completeness, approximation guarantees and rational satisficing.',
    'axis.systems.title': 'Information systems and data',
    'axis.systems.body':
      'Immutable records versus in-place overwrite, transactions, idempotence and the path of data from source to use.',
    'axis.signals.title': 'Information and signals',
    'axis.signals.body':
      'Entropy, redundancy, channels and codes as the common measure; sampling, frequency and noise where the continuous becomes data.',
    'axis.philosophy.title': 'Applied philosophy',
    'axis.philosophy.body':
      'Sign, index and symbol, essence and accident, abstraction and visual grammar in the service of structural clarity.',

    'discipline.software-engineering.lede':
      'How software that has to change is built and maintained: representing state, modularity, verification and the cost of each choice.',
    'discipline.software-engineering.out':
      'Language or framework tutorials and product comparisons with no concept behind them.',
    'discipline.software-architecture.lede':
      'The decisions that are hard to undo: where module boundaries go, what each one hides and how the decision is recorded.',
    'discipline.software-architecture.out':
      'Vendor reference architectures and pattern catalogues without the problem that motivates them.',
    'discipline.systems-design.lede':
      'The behaviour of a whole system before the code: states, events, failures and the people who use it.',
    'discipline.systems-design.out':
      'Interview playbooks and architectures copied from other companies without the constraints that justify them.',
    'discipline.computer-science.lede':
      'What can be computed, at what cost and with what guarantee: automata, algorithms, complexity and codes.',
    'discipline.computer-science.out': 'Exercise solutions and curiosities with no consequence for people who program.',
    'discipline.systems-optimization.lede':
      'Choosing the best under constraints and knowing when to stop: speedup limits, combinatorial optimization, approximation and the cost of seeking the optimum.',
    'discipline.systems-optimization.out':
      'Performance tuning of one specific tool and measurements without a reproducible method.',
    'discipline.information-systems.lede':
      'What an organization needs to remember and how: records, transactions, consistency and whom the memory serves.',
    'discipline.information-systems.out': 'Manuals of management products and process fashions.',
    'discipline.information-technology.lede':
      'The tools that realize the concepts: technology stacks, their contracts, their cost of adoption and of exit, and their shelf life.',
    'discipline.information-technology.out': 'Launch news, price comparisons and installation guides.',
    'discipline.data-engineering.lede':
      'The path of data from source to use: extract, transform and load, what each stage preserves or loses, and how to re-run without duplicating.',
    'discipline.data-engineering.out': 'Configuration recipes for orchestrators, connectors and databases.',
    'discipline.information-theory.lede':
      'The common measure of the site: entropy, redundancy, channels and codes, used to count what a representation tells and what it wastes.',
    'discipline.information-theory.out': 'Metaphorical uses of entropy and information without a defined measure.',
    'discipline.signal-processing.lede':
      'How the continuous becomes data: sampling, frequency, noise and what is lost by discretizing.',
    'discipline.signal-processing.out': 'Filter design for one specific application and hardware electronics.',
    'discipline.applied-philosophy.lede':
      'Saying precisely what a sign, information, state, a record or an abstraction is before measuring or programming.',
    'discipline.applied-philosophy.out': 'History of philosophy and debates that change no engineering decision.',

    'discipline.description':
      'What the site covers of {name}: works and concepts on each stratum of the bridge, the foundations it depends on and what is left out.',
    'discipline.kind': 'Discipline',
    'discipline.in': 'What belongs',
    'discipline.out': 'Left out',
    'discipline.bridge.title': 'On the bridge',
    'discipline.bridge.lede':
      'The bridge restricted to this discipline: what there is on each stratum, in the order it is crossed.',
    'discipline.works': 'Works',
    'discipline.concepts': 'Concepts',
    'discipline.empty': 'There is no text of this discipline on this stratum yet.',
    'discipline.foundations.title': 'Foundations it depends on',
    'discipline.foundations.lede': 'They enter the site only as far as this discipline needs them.',
    'discipline.foundations.works': 'Foundation works',
    'discipline.foundations.none': 'No foundation declared.',
    'discipline.others': 'Other disciplines',
    'discipline.all': 'The whole scope',
  },
});
