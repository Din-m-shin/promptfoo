import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { TestCaseWithPlugin } from '../types';
import { isApiProvider, isProviderOptions, type ApiProvider } from '../types';
import type { SynthesizeOptions } from '../types/redteam';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, HARM_PLUGINS, PII_PLUGINS, ALIASED_PLUGIN_MAPPINGS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { Strategies, validateStrategies } from './strategies';

/**
 * Determines the status of test generation based on requested and generated counts.
 * @param requested - The number of requested tests.
 * @param generated - The number of generated tests.
 * @returns A colored string indicating the status.
 */
function getStatus(requested: number, generated: number): string {
  if (generated === 0) {
    return chalk.red('Failed');
  }
  if (generated < requested) {
    return chalk.yellow('Partial');
  }
  return chalk.green('Success');
}

/**
 * Generates a report of plugin and strategy results.
 * @param pluginResults - Results from plugin executions.
 * @param strategyResults - Results from strategy executions.
 * @returns A formatted string containing the report.
 */
function generateReport(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'],
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  Object.entries(pluginResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([rowIndex++, 'Plugin', id, requested, generated, getStatus(requested, generated)]);
    });

  Object.entries(strategyResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([
        rowIndex++,
        'Strategy',
        id,
        requested,
        generated,
        getStatus(requested, generated),
      ]);
    });

  return `\nTest Generation Report:\n${table.toString()}`;
}

const categories = {
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
} as const;

/**
 * Formats the test count for display.
 * @param numTests - The number of tests.
 * @returns A formatted string representing the test count.
 */
const formatTestCount = (numTests: number): string =>
  numTests === 1 ? '1 test' : `${numTests} tests`;

/**
 * Synthesizes test cases based on provided options.
 * @param options - The options for test case synthesis.
 * @returns A promise that resolves to an object containing the purpose, entities, and test cases.
 */
export async function synthesize({
  entities: entitiesOverride,
  injectVar,
  language,
  maxConcurrency = 1,
  plugins,
  prompts,
  provider,
  purpose: purposeOverride,
  strategies,
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
}> {
  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  validateStrategies(strategies);

  let redteamProvider: ApiProvider;
  if (isApiProvider(provider)) {
    redteamProvider = provider;
  } else if (isProviderOptions(provider)) {
    redteamProvider = await loadApiProvider(provider.id || REDTEAM_MODEL, provider);
  } else {
    redteamProvider = await loadApiProvider(REDTEAM_MODEL, {
      options: { config: { temperature: 0.5 } },
    });
  }

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map(
          (p) =>
            `${p.id} (${formatTestCount(p.numTests)})${p.config ? ` (${JSON.stringify(p.config)})` : ''}`,
        )
        .sort()
        .join('\n'),
    )}\n`,
  );
  if (strategies.length > 0) {
    const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);
    logger.info(
      `Using strategies:\n\n${chalk.yellow(
        strategies
          .map((s) => `${s.id} (${formatTestCount(totalPluginTests)})`)
          .sort()
          .join('\n'),
      )}\n`,
    );
  }

  const totalTests =
    plugins.reduce((sum, p) => sum + (p.numTests || 0), 0) * (strategies.length + 1);

  const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);

  logger.info(
    chalk.bold(`Test Generation Summary:`) +
      `\n• Total tests: ${chalk.cyan(totalTests)}` +
      `\n• Plugin tests: ${chalk.cyan(totalPluginTests)}` +
      `\n• Plugins: ${chalk.cyan(plugins.length)}` +
      `\n• Strategies: ${chalk.cyan(strategies.length)}` +
      `\n• Max concurrency: ${chalk.cyan(maxConcurrency)}\n`,
  );

  let progressBar: cliProgress.SingleBar | null = null;
  if (logger.level !== 'debug') {
    progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(totalPluginTests + 2, 0);
  }

  if (typeof injectVar !== 'string') {
    const parsedVars = extractVariablesFromTemplates(prompts);
    if (parsedVars.length > 1) {
      logger.warn(
        `Multiple variables found in prompts: ${parsedVars.join(', ')}. Using the first one.`,
      );
    } else if (parsedVars.length === 0) {
      logger.warn('No variables found in prompts. Using "query" as the inject variable.');
    }
    injectVar = parsedVars[0] || 'query';
    invariant(typeof injectVar === 'string', `Inject var must be a string, got ${injectVar}`);
  }

  for (const [category, categoryPlugins] of Object.entries(categories)) {
    const plugin = plugins.find((p) => p.id === category);
    if (plugin) {
      plugins.push(...categoryPlugins.map((p) => ({ id: p, numTests: plugin.numTests })));
    }
  }

  const expandedPlugins: typeof plugins = [];
  const expandPlugin = (
    plugin: (typeof plugins)[0],
    mapping: { plugins: string[]; strategies: string[] },
  ) => {
    mapping.plugins.forEach((p: string) =>
      expandedPlugins.push({ id: p, numTests: plugin.numTests }),
    );
    strategies.push(...mapping.strategies.map((s: string) => ({ id: s })));
  };

  plugins.forEach((plugin) => {
    const mappingKey = Object.keys(ALIASED_PLUGIN_MAPPINGS).find(
      (key) => plugin.id === key || plugin.id.startsWith(`${key}:`),
    );

    if (mappingKey) {
      const mapping =
        ALIASED_PLUGIN_MAPPINGS[mappingKey][plugin.id] ||
        Object.values(ALIASED_PLUGIN_MAPPINGS[mappingKey]).find((m) =>
          plugin.id.startsWith(`${mappingKey}:`),
        );
      if (mapping) {
        expandPlugin(plugin, mapping);
      }
    } else {
      expandedPlugins.push(plugin);
    }
  });

  plugins = expandedPlugins;

  plugins = [...new Set(plugins)].filter((p) => !Object.keys(categories).includes(p.id)).sort();

  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));
  progressBar?.increment();
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);
  progressBar?.increment();

  logger.debug(`System purpose: ${purpose}`);

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    const { action } = Plugins.find((p) => p.key === plugin.id) || {};
    if (action) {
      progressBar?.increment(plugin.numTests);
      logger.debug(`Generating tests for ${plugin.id}...`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, plugin.numTests, {
        language,
        ...(plugin.config || {}),
      });
      testCases.push(
        ...pluginTests.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: plugin.id,
          },
        })),
      );
      logger.debug(`Added ${pluginTests.length} ${plugin.id} test cases`);
      pluginResults[plugin.id] = { requested: plugin.numTests, generated: pluginTests.length };
    } else {
      logger.warn(`Plugin ${plugin.id} not registered, skipping`);
      pluginResults[plugin.id] = { requested: plugin.numTests, generated: 0 };
      progressBar?.increment(plugin.numTests);
    }
  });

  if (progressBar) {
    progressBar.stop();
  }

  const newTestCases: TestCaseWithPlugin[] = [];

  if (strategies.length > 0) {
    const existingTestCount = testCases.length;
    const totalStrategyTests = existingTestCount * strategies.length;

    logger.info(
      chalk.bold(
        `\nGenerating additional tests using ${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'}:`,
      ) +
        `\n• Existing tests: ${chalk.cyan(existingTestCount)}` +
        `\n• Expected new tests: ${chalk.cyan(totalStrategyTests)}` +
        `\n• Total expected tests: ${chalk.cyan(existingTestCount + totalStrategyTests)}`,
    );
  }

  for (const { key, action } of Strategies) {
    const strategy = strategies.find((s) => s.id === key);
    if (strategy) {
      logger.debug(`Generating ${key} tests`);
      const strategyTestCases = await action(testCases, injectVar, strategy.config || {});
      newTestCases.push(
        ...strategyTestCases.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: t.metadata?.pluginId,
            strategyId: strategy.id,
          },
        })),
      );
      strategyResults[key] = {
        requested: testCases.length,
        generated: strategyTestCases.length,
      };
    }
  }

  testCases.push(...newTestCases);
  logger.info(generateReport(pluginResults, strategyResults));

  return { purpose, entities, testCases };
}
