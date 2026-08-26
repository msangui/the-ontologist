import { readFileSync } from 'node:fs';
import { lintScenario, validateScenario, type LintFinding } from './index.js';

/**
 * Casewright CLI (backlog #31): `casewright <scenario.json>...` — shape
 * validation (Zod) + semantic lint (real engine over the intended model).
 * Exit code 1 if any scenario has errors; `--json` for CI consumption.
 */

interface FileReport {
  readonly file: string;
  readonly ok: boolean;
  readonly findings: readonly LintFinding[];
}

function lintFile(file: string): FileReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    return {
      file,
      ok: false,
      findings: [{ rule: 'parse', severity: 'error', message: String(cause) }],
    };
  }

  const validation = validateScenario(parsed);
  if (!validation.ok) {
    return {
      file,
      ok: false,
      findings: validation.issues.map((issue) => ({
        rule: 'schema',
        severity: 'error' as const,
        message: `${issue.path}: ${issue.message}`,
      })),
    };
  }

  const report = lintScenario(validation.scenario);
  return { file, ok: report.ok, findings: report.findings };
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter((arg) => !arg.startsWith('--'));

if (files.length === 0) {
  console.error('Usage: casewright <scenario.json>... [--json]');
  process.exit(2);
}

const reports = files.map(lintFile);

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    console.log(`${report.ok ? '✓' : '✗'} ${report.file}`);
    for (const finding of report.findings) {
      console.log(`  [${finding.severity}] ${finding.rule}: ${finding.message}`);
    }
    if (report.ok && report.findings.length === 0) {
      console.log('  all rules passed');
    }
  }
}

process.exit(reports.every((report) => report.ok) ? 0 : 1);
