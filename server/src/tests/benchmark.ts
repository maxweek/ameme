import { GraphClient } from '../services/graph/client';
import { ensureGraphSchema } from '../services/graph/schema';
import { extractFromText } from '../services/graph/extraction';
import { clearRecentMessages, PgService } from '../services/postgres';
import { remember } from '../primitives/remember';
import { search } from '../primitives/search';
import { dreaming } from '../primitives/dreaming';
import { CONFIG } from '../config';
import { ObsidianService } from '../services/obsidian';

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



async function runBenchmark() {
  console.log('\n═══════════════════════════════════════');
  console.log('  AMEME Memory Benchmark v2');
  console.log('═══════════════════════════════════════\n');

  await GraphClient.connect();
  await ensureGraphSchema();
  await PgService.initSchema();
  await ObsidianService.ensureDb();

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
      console.log(`${icon} [${report.total}/${ALL_TESTS.length} ${Math.round(report.total / ALL_TESTS.length * 100).toString().padStart(3, ' ')}%] ${test.name} (${timeMs}ms)`);
      if (!result.pass) console.log(`   → ${result.details}`);
      report.results.push({ name: test.name, pass: result.pass, details: result.details, timeMs });
      if (result.pass) report.passed++; else report.failed++;
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
  const totalTime = report.results.reduce((s, r) => s + r.timeMs, 0);
  console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════\n');

  return report;
}

// ═══════════════════════════════════════════════════════
// EXTRACTION TESTS
// ═══════════════════════════════════════════════════════

const extractionTests: TestCase[] = [
  {
    name: 'EXT-1: Извлекает конкретные сущности',
    fn: async () => {
      const result = await extractFromText('Макс работает над проектом ameme и использует TypeScript.', CONFIG.falkordb.database);
      const names = result.entities.map(e => e.name.toLowerCase());
      const ok = names.some(n => n.includes('макс')) && names.some(n => n.includes('ameme')) && names.some(n => n.includes('typescript'));
      return ok ? { pass: true, details: `OK: ${result.entities.map(e => e.name).join(', ')}` }
        : { pass: false, details: `Missing: ${result.entities.map(e => e.name).join(', ')}` };
    },
  },
  {
    name: 'EXT-2: Правильные типы сущностей',
    fn: async () => {
      const result = await extractFromText('Дмитрий живёт в Москве и работает в Яндексе.', CONFIG.falkordb.database);
      const errors: string[] = [];
      const person = result.entities.find(e => e.name.includes('Дмитрий'));
      if (!person) errors.push('Дмитрий не найден'); else if (person.type !== 'Person') errors.push(`Дмитрий: ${person.type}`);
      const place = result.entities.find(e => e.name.includes('Москв'));
      if (!place) errors.push('Москва не найдена'); else if (place.type !== 'Place') errors.push(`Москва: ${place.type}`);
      const org = result.entities.find(e => e.name.includes('Яндекс'));
      if (!org) errors.push('Яндекс не найден'); else if (org.type !== 'Organization') errors.push(`Яндекс: ${org.type}`);
      return errors.length === 0 ? { pass: true, details: 'All types correct' } : { pass: false, details: errors.join('; ') };
    },
  },
  {
    name: 'EXT-3: Не создаёт абстрактные сущности',
    fn: async () => {
      const result = await extractFromText(
        'Макс предпочитает быстрые ответы без воды, потому что ценит своё время.',
        CONFIG.falkordb.database,
      );
      // Плохие: "ценность времени", "причина предпочтения", "стиль общения"
      // Нормальные: "быстрые ответы" как Preference — допустимо
      const bad = result.entities.filter(e =>
        e.type !== 'Preference' && e.type !== 'Person' &&
        e.name.toLowerCase().match(/ценност|причин|стиль|предпочтение|описание/)
      );
      return bad.length === 0
        ? { pass: true, details: `Entities: ${result.entities.map(e => `[${e.type}] ${e.name}`).join(', ')}` }
        : { pass: false, details: `Abstract: ${bad.map(e => e.name).join(', ')}` };
    },
  },
  {
    name: 'EXT-4: Извлекает связи',
    fn: async () => {
      const result = await extractFromText('Макс создал проект ameme на TypeScript.', CONFIG.falkordb.database);
      return result.relations.length > 0
        ? { pass: true, details: `Relations: ${result.relations.map(r => r.name).join(', ')}` }
        : { pass: false, details: 'No relations' };
    },
  },
  {
    name: 'EXT-5: Факты на языке ввода',
    fn: async () => {
      const result = await extractFromText('Макс перешёл с Python на TypeScript.', CONFIG.falkordb.database);
      const russian = result.relations.filter(r => /[а-яё]/i.test(r.fact));
      const english = result.relations.filter(r => !/[а-яё]/i.test(r.fact));
      return russian.length >= english.length
        ? { pass: true, details: `RU: ${russian.length}, EN: ${english.length}` }
        : { pass: false, details: `English facts: ${english.map(r => r.fact).join('; ')}` };
    },
  },
  {
    name: 'EXT-6: Relation names только ASCII',
    fn: async () => {
      const result = await extractFromText('Ольга использует Python и любит кошек.', CONFIG.falkordb.database);
      const bad = result.relations.filter(r => !/^[A-Z_]+$/.test(r.name));
      return bad.length === 0
        ? { pass: true, details: `All ASCII: ${result.relations.map(r => r.name).join(', ')}` }
        : { pass: false, details: `Non-ASCII: ${bad.map(r => r.name).join(', ')}` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// INTEGRITY TESTS
// ═══════════════════════════════════════════════════════

const integrityTests: TestCase[] = [
  {
    name: 'INT-1: Remember создаёт узлы и связи',
    fn: async () => {
      const r = await remember('Алексей работает в Google и пишет на Go.');
      if (!r.ok) return { pass: false, details: `Error: ${r.error}` };
      return (r.nodesCreated > 0 && r.edgesCreated > 0)
        ? { pass: true, details: `Nodes: ${r.nodesCreated}, Edges: ${r.edgesCreated}` }
        : { pass: false, details: `Nodes: ${r.nodesCreated}, Edges: ${r.edgesCreated}` };
    },
  },
  {
    name: 'INT-2: Dedup — повтор не плодит дубликаты',
    fn: async () => {
      await remember('Алексей работает в Google.');
      const r = await remember('Алексей — сотрудник Google.');
      return r.nodesCreated === 0
        ? { pass: true, details: `Updated: ${r.nodesUpdated}, Created: ${r.nodesCreated}` }
        : { pass: false, details: `Created ${r.nodesCreated} new nodes` };
    },
  },
  {
    name: 'INT-3: Dedup — Макс/Максим → один узел',
    fn: async () => {
      await remember('Макс любит кошек.');
      await remember('Максим завёл кота.');
      const nodes = await GraphClient.getAllNodes(CONFIG.falkordb.database);
      const maxNodes = nodes.filter(n => n.name.toLowerCase().includes('макс') && n.type === 'Person');
      return maxNodes.length <= 1
        ? { pass: true, details: `Person nodes: ${maxNodes.map(n => n.name).join(', ')}` }
        : { pass: false, details: `Duplicates: ${maxNodes.map(n => n.name).join(', ')}` };
    },
  },
  {
    name: 'INT-4: Temporal — инвалидирует устаревший факт',
    fn: async () => {
      await remember('Сергей использует Windows.');
      await remember('Сергей перешёл с Windows на Linux.');
      const edges = await GraphClient.getAllEdges(CONFIG.falkordb.database, false);
      const relevant = edges.filter(e => e.fact.toLowerCase().includes('сергей') || e.fact.toLowerCase().includes('windows'));
      const invalid = relevant.filter(e => e.invalidAt !== null);
      return invalid.length > 0
        ? { pass: true, details: `Invalidated: ${invalid.length}` }
        : { pass: false, details: `None invalidated. Edges: ${relevant.map(e => `${e.name}[${e.invalidAt ? 'inv' : 'valid'}]`).join(', ')}` };
    },
  },
  {
    name: 'INT-5: Temporal — антоним LIKES→DISLIKES',
    fn: async () => {
      const r1 = await remember('Ольга любит собак.');
      console.log('[INT-5] r1:', JSON.stringify(r1));

      const r2 = await remember('Ольга теперь не любит собак.');
      console.log('[INT-5] r2:', JSON.stringify(r2));

      const edges = await GraphClient.getAllEdges(CONFIG.falkordb.database, false);
      const relevant = edges.filter(e =>
        e.fact.toLowerCase().includes('ольга') && e.fact.toLowerCase().includes('собак')
      );
      console.log('[INT-5] edges:', relevant.map(e => `${e.name}[${e.invalidAt ? 'inv' : 'valid'}]: ${e.fact}`));

      const invalid = relevant.filter(e => e.invalidAt !== null);
      return invalid.length > 0
        ? { pass: true, details: `Valid: ${relevant.length - invalid.length}, Invalid: ${invalid.length}` }
        : { pass: false, details: `All valid: ${relevant.map(e => `${e.name}[${e.invalidAt ? 'inv' : 'valid'}]`).join(', ')}` };
    },
  },
  {
    name: 'INT-6: Summary заменяется, не append',
    fn: async () => {
      await remember('Виктор — фронтенд-разработчик.');
      await remember('Виктор теперь fullstack-разработчик.');
      const nodes = await GraphClient.getAllNodes(CONFIG.falkordb.database);
      const viktor = nodes.find(n => n.name.includes('Виктор'));
      if (!viktor) return { pass: false, details: 'Виктор не найден' };
      const hasBoth = viktor.summary.toLowerCase().includes('фронтенд') && viktor.summary.toLowerCase().includes('fullstack');
      return !hasBoth
        ? { pass: true, details: `Summary: "${viktor.summary}"` }
        : { pass: false, details: `Appended: "${viktor.summary}"` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// SEARCH TESTS
// ═══════════════════════════════════════════════════════

const searchTests: TestCase[] = [
  {
    name: 'SRC-1: Находит релевантный факт',
    fn: async () => {
      await remember('Наташа изучает японский язык.');
      const results = await search('Наташа язык');
      const found = results.some(r => r.content.toLowerCase().includes('наташ') && r.content.toLowerCase().includes('японск'));
      return found
        ? { pass: true, details: `Found: ${results[0]?.content}` }
        : { pass: false, details: `Not found. Results: ${results.map(r => r.content).join('; ') || 'empty'}` };
    },
  },
  {
    name: 'SRC-2: Нерелевантный запрос — мало результатов',
    fn: async () => {
      const results = await search('квантовая физика чёрных дыр');
      const high = results.filter(r => r.score > 0.1);
      return high.length === 0
        ? { pass: true, details: 'No irrelevant results' }
        : { pass: false, details: `Noise: ${high.map(r => `${r.content} (${(r.score * 100).toFixed(0)}%)`).join('; ')}` };
    },
  },
  {
    name: 'SRC-3: Факты ранжируются выше conversations',
    fn: async () => {
      await remember('Пётр работает в Сбербанке.');
      const results = await search('Пётр Сбербанк');
      if (results.length === 0) return { pass: false, details: 'Empty' };
      return results[0].source === 'fact'
        ? { pass: true, details: `Top: [${results[0].source}] ${results[0].content}` }
        : { pass: false, details: `Top: [${results[0].source}] ${results[0].content}` };
    },
  },
  {
    name: 'SRC-4: Инвалидированный факт не в топе',
    fn: async () => {
      await remember('Анна использует Vue.');
      await remember('Анна перешла с Vue на React.');
      const results = await search('Анна фреймворк');
      if (results.length === 0) return { pass: false, details: 'Empty results' };

      // Top результат должен быть про React, не про старый Vue
      const top = results[0];
      const topHasReact = top.content.toLowerCase().includes('react');
      const topIsOldVue = top.content.toLowerCase().includes('vue')
        && !top.content.toLowerCase().includes('react')
        && !top.content.toLowerCase().includes('переш');

      return topIsOldVue
        ? { pass: false, details: `Top is old fact: ${top.content}` }
        : { pass: true, details: `Top: ${top.content}` };
    },
  },
  {
    name: 'SRC-5: Latency < 5s',
    fn: async () => {
      const t0 = Date.now();
      await search('тест производительности');
      const ms = Date.now() - t0;
      return ms < 5000
        ? { pass: true, details: `${ms}ms` }
        : { pass: false, details: `${ms}ms — too slow` };
    },
  },
];

// ═══════════════════════════════════════════════════════
// DREAMING TESTS
// ═══════════════════════════════════════════════════════

const dreamingTests: TestCase[] = [
  {
    name: 'DRM-1: Извлекает факты из сообщений',
    fn: async () => {
      await clearRecentMessages();

      const sessionId = `bench-dream-${Date.now()}`;
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Я недавно начал учить Rust.' });
      await PgService.insertMessage({ sessionId, role: 'assistant', content: 'Отличный выбор! Rust безопасный и быстрый.' });
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Да, хочу написать на нём CLI-утилиту для работы.' });

      const result = await dreaming(1);
      if (result.status === 'error') return { pass: false, details: `Error: ${result.error}` };
      if (result.status === 'skipped') return { pass: false, details: 'Skipped' };

      const nodes = await GraphClient.getAllNodes(CONFIG.falkordb.database);
      const hasRust = nodes.some(n => n.name.toLowerCase().includes('rust'));
      return hasRust
        ? { pass: true, details: `New facts: ${result.newFacts}, nodes include Rust` }
        : { pass: false, details: `No Rust node. Nodes: ${nodes.map(n => n.name).join(', ')}` };
    },
  },
  {
    name: 'DRM-2: Инвалидирует устаревшие факты',
    fn: async () => {
      // Pre-existing fact
      await remember('Игорь использует Java.');

      // Conversation contradicts it
      const sessionId = `bench-dream-${Date.now()}`;
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Игорь полностью перешёл с Java на Kotlin.' });
      await PgService.insertMessage({ sessionId, role: 'assistant', content: 'Kotlin отличная замена Java.' });
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Да, он теперь только на Kotlin пишет.' });

      const result = await dreaming(1);
      return result.staleFacts > 0
        ? { pass: true, details: `Stale facts: ${result.staleFacts}` }
        : { pass: false, details: 'No stale facts detected' };
    },
  },
  {
    name: 'DRM-3: Не теряет существующие факты',
    fn: async () => {
      const nodesBefore = await GraphClient.getAllNodes(CONFIG.falkordb.database);
      const countBefore = nodesBefore.length;

      const sessionId = `bench-dream-${Date.now()}`;
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Привет, как дела?' });
      await PgService.insertMessage({ sessionId, role: 'assistant', content: 'Привет! Всё хорошо.' });
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Отлично.' });

      await dreaming(1);

      const nodesAfter = await GraphClient.getAllNodes(CONFIG.falkordb.database);
      return nodesAfter.length >= countBefore
        ? { pass: true, details: `Before: ${countBefore}, After: ${nodesAfter.length}` }
        : { pass: false, details: `Lost nodes: ${countBefore} → ${nodesAfter.length}` };
    },
  },
  {
    name: 'DRM-4: Diary записан',
    fn: async () => {
      const sessionId = `bench-dream-${Date.now()}`;
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Сегодня я решил переписать систему памяти с нуля.' });
      await PgService.insertMessage({ sessionId, role: 'assistant', content: 'Амбициозная задача! Давай спланируем.' });
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Да, уже написали extraction, dedup и temporal.' });

      const result = await dreaming(1);
      return result.diary
        ? { pass: true, details: 'Diary written' }
        : { pass: false, details: 'No diary' };
    },
  },
  {
    name: 'DRM-5: Пустой день — skip без ошибок',
    fn: async () => {
      // No messages in last hour
      const result = await dreaming(0.001); // ~3.6 seconds window
      return result.status === 'skipped'
        ? { pass: true, details: 'Skipped correctly' }
        : { pass: false, details: `Status: ${result.status}, error: ${result.error}` };
    },
  },
  {
    name: 'DRM-6: End-to-end recall после dreaming',
    fn: async () => {
      const sessionId = `bench-dream-${Date.now()}`;
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Мария устроилась работать в Spotify.' });
      await PgService.insertMessage({ sessionId, role: 'assistant', content: 'Классная компания!' });
      await PgService.insertMessage({ sessionId, role: 'user', content: 'Да, она там дата-инженер.' });

      await dreaming(1);

      const results = await search('Мария Spotify');
      const found = results.some(r =>
        r.content.toLowerCase().includes('мария') &&
        r.content.toLowerCase().includes('spotify')
      );
      return found
        ? { pass: true, details: `Found: ${results[0]?.content}` }
        : { pass: false, details: `Not found. Results: ${results.map(r => r.content).join('; ') || 'empty'}` };
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
  ...dreamingTests,
];

// ── Entry ───────────────────────────────────────────────

// runBenchmark()
//   .then(report => process.exit(report.failed > 0 ? 1 : 0))
//   .catch(err => { console.error('Benchmark crashed:', err); process.exit(1); });


function run(numberOfTries: number) {
  let tries = 0;
  const runNext = async () => {
    tries++;
    console.log(`\n=== Benchmark run ${tries}/${numberOfTries} ===`);
    await runBenchmark()
      .then(report => {
        const totalTime = report.results.reduce((s, r) => s + r.timeMs, 0);
        console.log(`Run ${tries}: ${report.passed} passed of ${report.total} \nTotal time: ${(totalTime / 1000).toFixed(1)}s`);
      })
      .catch(err => console.error('Benchmark crashed:', err));
    if (tries < numberOfTries) {
      setTimeout(runNext, 1000); // 1 second delay between runs
    } else {
      console.log('\nAll benchmark runs completed.');
    }
  };
  runNext();
}
// 2 - is an paramenter from bun run bench 2

const tries = parseInt(process.argv?.[2] || "1", 10);

run(tries)