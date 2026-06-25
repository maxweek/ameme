import { GraphClient } from '../services/graph/client';
import { ensureGraphSchema } from '../services/graph/schema';
import { extractFromText } from '../services/graph/extraction';
import { remember } from '../primitives/remember';
import { search } from '../primitives/search';
import { CONFIG } from '../config';

// ── Types ───────────────────────────────────────────────

interface TestCase {
  name: string;
  fn: () => Promise<TestResult>;
}

interface TestResult {
  pass: boolean;
  details: string;
}

interface BenchmarkReport {
  total: number;
  passed: number;
  failed: number;
  results: Array<{ name: string; pass: boolean; details: string; timeMs: number }>;
}

// ── Runner ──────────────────────────────────────────────

async function runBenchmark(): Promise<BenchmarkReport> {
  console.log('\n═══════════════════════════════════════');
  console.log('  AMEME Memory Benchmark');
  console.log('═══════════════════════════════════════\n');

  // Connect
  await GraphClient.connect();
  await ensureGraphSchema();

  // Clear graph before tests
  const groupId = CONFIG.falkordb.database;
  await GraphClient.query('MATCH (n {group_id: $groupId}) DETACH DELETE n', { groupId } as Record<string, any>);
  console.log('[bench] Graph cleared\n');

  const report: BenchmarkReport = { total: 0, passed: 0, failed: 0, results: [] };

  for (const test of ALL_TESTS) {
    report.total++;
    const t0 = Date.now();
    try {
      const result = await test.fn();
      const timeMs = Date.now() - t0;
      const icon = result.pass ? '✅' : '❌';
      console.log(`${icon} ${test.name} (${timeMs}ms)`);
      if (!result.pass) console.log(`   → ${result.details}`);
      report.results.push({ name: test.name, pass: result.pass, details: result.details, timeMs });
      if (result.pass) report.passed++;
      else report.failed++;
    } catch (err) {
      const timeMs = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`💥 ${test.name} (${timeMs}ms)`);
      console.log(`   → CRASH: ${msg}`);
      report.results.push({ name: test.name, pass: false, details: `CRASH: ${msg}`, timeMs });
      report.failed++;
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  Results: ${report.passed}/${report.total} passed`);
  if (report.failed > 0) console.log(`  Failed: ${report.failed}`);
  console.log('═══════════════════════════════════════\n');

  return report;
}

// ═══════════════════════════════════════════════════════
// TEST SUITE 1: EXTRACTION
// ═══════════════════════════════════════════════════════

const extractionTests: TestCase[] = [
  {
    name: 'EXT-1: Извлекает конкретные сущности',
    fn: async () => {
      const result = await extractFromText(
        'Макс работает над проектом ameme и использует TypeScript.',
        CONFIG.falkordb.database,
      );
      const names = result.entities.map(e => e.name);
      const hasMax = names.some(n => n.includes('Макс'));
      const hasAmeme = names.some(n => n.toLowerCase().includes('ameme'));
      const hasTS = names.some(n => n.includes('TypeScript'));

      if (!hasMax || !hasAmeme || !hasTS) {
        return { pass: false, details: `Ожидались Макс, ameme, TypeScript. Получено: ${names.join(', ')}` };
      }
      return { pass: true, details: `Entities: ${names.join(', ')}` };
    },
  },
  {
    name: 'EXT-2: Правильные типы сущностей',
    fn: async () => {
      const result = await extractFromText(
        'Дмитрий живёт в Москве и работает в Яндексе.',
        CONFIG.falkordb.database,
      );
      const person = result.entities.find(e => e.name.includes('Дмитрий'));
      const place = result.entities.find(e => e.name.includes('Москв'));
      const org = result.entities.find(e => e.name.includes('Яндекс'));

      const errors: string[] = [];
      if (!person) errors.push('Дмитрий не найден');
      else if (person.type !== 'Person') errors.push(`Дмитрий: ${person.type} вместо Person`);
      if (!place) errors.push('Москва не найдена');
      else if (place.type !== 'Place') errors.push(`Москва: ${place.type} вместо Place`);
      if (!org) errors.push('Яндекс не найден');
      else if (org.type !== 'Organization') errors.push(`Яндекс: ${org.type} вместо Organization`);

      return errors.length === 0
        ? { pass: true, details: 'Все типы верны' }
        : { pass: false, details: errors.join('; ') };
    },
  },
  {
    name: 'EXT-3: Не создаёт абстрактные сущности',
    fn: async () => {
      const result = await extractFromText(
        'Макс предпочитает быстрые ответы без воды, потому что ценит своё время.',
        CONFIG.falkordb.database,
      );
      const badEntities = result.entities.filter(e =>
        e.name.includes('предпочтение') ||
        e.name.includes('ответ') ||
        e.name.includes('время') ||
        e.name.includes('ценност')
      );

      return badEntities.length === 0
        ? { pass: true, details: `Entities: ${result.entities.map(e => e.name).join(', ')}` }
        : { pass: false, details: `Абстрактные: ${badEntities.map(e => e.name).join(', ')}` };
    },
  },
  {
    name: 'EXT-4: Извлекает связи',
    fn: async () => {
      const result = await extractFromText(
        'Макс создал проект ameme на TypeScript.',
        CONFIG.falkordb.database,
      );
      if (result.relations.length === 0) {
        return { pass: false, details: 'Нет связей' };
      }
      const hasCreated = result.relations.some(r =>
        r.name === 'CREATED' || r.name === 'WORKS_ON'
      );
      return hasCreated
        ? { pass: true, details: `Relations: ${result.relations.map(r => `${r.sourceName}→${r.name}→${r.targetName}`).join(', ')}` }
        : { pass: false, details: `Нет CREATED/WORKS_ON: ${result.relations.map(r => r.name).join(', ')}` };
    },
  },
  {
    name: 'EXT-5: Факты на языке ввода (русский)',
    fn: async () => {
      const result = await extractFromText(
        'Макс перешёл с Python на TypeScript.',
        CONFIG.falkordb.database,
      );
      const russianFacts = result.relations.filter(r => /[а-яё]/i.test(r.fact));
      const englishFacts = result.relations.filter(r => !/[а-яё]/i.test(r.fact));

      return russianFacts.length >= englishFacts.length
        ? { pass: true, details: `Русских фактов: ${russianFacts.length}, английских: ${englishFacts.length}` }
        : { pass: false, details: `Факты на английском: ${englishFacts.map(r => r.fact).join('; ')}` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// TEST SUITE 2: MEMORY INTEGRITY
// ═══════════════════════════════════════════════════════

const integrityTests: TestCase[] = [
  {
    name: 'INT-1: Remember создаёт узлы и связи',
    fn: async () => {
      const result = await remember('Алексей работает в Google и пишет на Go.');
      if (!result.ok) return { pass: false, details: `Error: ${result.error}` };
      if (result.nodesCreated === 0) return { pass: false, details: 'Узлы не созданы' };
      if (result.edgesCreated === 0) return { pass: false, details: 'Связи не созданы' };
      return { pass: true, details: `Nodes: ${result.nodesCreated}, Edges: ${result.edgesCreated}` };
    },
  },
  {
    name: 'INT-2: Dedup — не создаёт дубликат при повторе',
    fn: async () => {
      const r1 = await remember('Алексей работает в Google.');
      const r2 = await remember('Алексей — сотрудник Google.');

      if (r2.nodesCreated > 0) {
        return { pass: false, details: `Создано ${r2.nodesCreated} новых узлов вместо 0` };
      }
      return { pass: true, details: `Второй раз: updated=${r2.nodesUpdated}, created=${r2.nodesCreated}` };
    },
  },
  {
    name: 'INT-3: Dedup — сливает Макс/Максим',
    fn: async () => {
      await remember('Макс любит кошек.');
      const r2 = await remember('Максим завёл кота.');

      const groupId = CONFIG.falkordb.database;
      const nodes = await GraphClient.getAllNodes(groupId);
      const maxNodes = nodes.filter(n =>
        n.name.toLowerCase().includes('макс') && n.type === 'Person'
      );

      return maxNodes.length <= 1
        ? { pass: true, details: `Person-узлов с "Макс": ${maxNodes.length}` }
        : { pass: false, details: `Дубликаты: ${maxNodes.map(n => n.name).join(', ')}` };
    },
  },
  {
    name: 'INT-4: Temporal — инвалидирует устаревший факт',
    fn: async () => {
      await remember('Сергей использует Windows.');
      await remember('Сергей перешёл с Windows на Linux.');

      const groupId = CONFIG.falkordb.database;
      const edges = await GraphClient.getAllEdges(groupId, false);

      const sergeyEdges = edges.filter(e => {
        const nodes = [e.sourceUuid, e.targetUuid];
        return e.fact.toLowerCase().includes('сергей') || e.fact.toLowerCase().includes('windows');
      });

      const invalidated = sergeyEdges.filter(e => e.invalidAt !== null);

      return invalidated.length > 0
        ? { pass: true, details: `Инвалидировано: ${invalidated.length} факт(ов)` }
        : { pass: false, details: `Ничего не инвалидировано. Edges: ${sergeyEdges.map(e => `${e.name}: ${e.fact} [invalid=${e.invalidAt}]`).join('; ')}` };
    },
  },
  {
    name: 'INT-5: Temporal — антоним LIKES→DISLIKES инвалидирует',
    fn: async () => {
      await remember('Ольга любит собак.');
      await remember('Ольга теперь не любит собак.');

      const groupId = CONFIG.falkordb.database;
      const edges = await GraphClient.getAllEdges(groupId, false);

      const olgaEdges = edges.filter(e =>
        e.fact.toLowerCase().includes('ольга') && e.fact.toLowerCase().includes('собак')
      );

      const valid = olgaEdges.filter(e => e.invalidAt === null);
      const invalid = olgaEdges.filter(e => e.invalidAt !== null);

      if (invalid.length === 0) {
        return { pass: false, details: `Нет инвалидированных. Все: ${olgaEdges.map(e => `${e.name}[${e.invalidAt ? 'inv' : 'valid'}]`).join(', ')}` };
      }
      return { pass: true, details: `Valid: ${valid.length}, Invalid: ${invalid.length}` };
    },
  },
  {
    name: 'INT-6: Summary заменяется, не append',
    fn: async () => {
      await remember('Виктор — фронтенд-разработчик.');
      await remember('Виктор теперь fullstack-разработчик.');

      const groupId = CONFIG.falkordb.database;
      const nodes = await GraphClient.getAllNodes(groupId);
      const viktor = nodes.find(n => n.name.includes('Виктор'));

      if (!viktor) return { pass: false, details: 'Виктор не найден' };

      const hasBoth = viktor.summary.includes('фронтенд') && viktor.summary.includes('fullstack');
      return hasBoth
        ? { pass: false, details: `Summary append: "${viktor.summary}"` }
        : { pass: true, details: `Summary: "${viktor.summary}"` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// TEST SUITE 3: SEARCH QUALITY
// ═══════════════════════════════════════════════════════

const searchTests: TestCase[] = [
  {
    name: 'SRC-1: Находит релевантный факт',
    fn: async () => {
      await remember('Наташа изучает японский язык.');
      const results = await search('Наташа язык');

      const found = results.some(r =>
        r.content.toLowerCase().includes('наташ') &&
        r.content.toLowerCase().includes('японск')
      );
      return found
        ? { pass: true, details: `Найдено. Top: ${results[0]?.content}` }
        : { pass: false, details: `Не найдено. Results: ${results.map(r => r.content).join('; ')}` };
    },
  },
  {
    name: 'SRC-2: Нерелевантный запрос — пустой или низкий score',
    fn: async () => {
      const results = await search('квантовая физика чёрных дыр');

      const highScore = results.filter(r => r.score > 0.1);
      return highScore.length === 0
        ? { pass: true, details: `Результатов с score>0.1: ${highScore.length}` }
        : { pass: false, details: `Мусор: ${highScore.map(r => `${r.content} (${(r.score * 100).toFixed(0)}%)`).join('; ')}` };
    },
  },
  {
    name: 'SRC-3: Факты ранжируются выше conversations',
    fn: async () => {
      // Remember создаёт факт в графе
      await remember('Пётр работает в Сбербанке.');

      const results = await search('Пётр Сбербанк');
      if (results.length === 0) return { pass: false, details: 'Ничего не найдено' };

      const topResult = results[0];
      return topResult.source === 'fact'
        ? { pass: true, details: `Top: [${topResult.source}] ${topResult.content} (${(topResult.score * 100).toFixed(0)}%)` }
        : { pass: false, details: `Top не fact: [${topResult.source}] ${topResult.content}` };
    },
  },
  {
    name: 'SRC-4: Инвалидированный факт не в результатах',
    fn: async () => {
      await remember('Анна использует Vue.');
      await remember('Анна перешла с Vue на React.');

      const results = await search('Анна фреймворк');
      const vueOld = results.find(r =>
        r.content.toLowerCase().includes('анна') &&
        r.content.toLowerCase().includes('vue') &&
        !r.content.toLowerCase().includes('react') &&
        !r.content.toLowerCase().includes('переш') &&
        !r.content.toLowerCase().includes('раньше') &&
        !r.content.toLowerCase().includes('перестала') &&
        !r.content.toLowerCase().includes('used')
      );

      return !vueOld
        ? { pass: true, details: 'Устаревший "Анна использует Vue" не найден' }
        : { pass: false, details: `Устаревший найден: ${vueOld.content}` };
    },
  },
  {
    name: 'SRC-5: Время поиска < 5 секунд',
    fn: async () => {
      const t0 = Date.now();
      await search('тест производительности');
      const elapsed = Date.now() - t0;

      return elapsed < 5000
        ? { pass: true, details: `${elapsed}ms` }
        : { pass: false, details: `${elapsed}ms — слишком медленно` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// ALL TESTS
// ═══════════════════════════════════════════════════════

const ALL_TESTS: TestCase[] = [
  ...extractionTests,
  ...integrityTests,
  ...searchTests,
];

// ── Entry point ─────────────────────────────────────────

runBenchmark()
  .then(report => {
    process.exit(report.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Benchmark crashed:', err);
    process.exit(1);
  });