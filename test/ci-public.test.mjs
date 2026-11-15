// 仓库公开（站长 2026-11-15）：公开后任何人都能开 PR、看 Actions 的全部日志。
// 照 liming-work-site #147 的做法：全部用 GitHub 自带的执行机；wrangler 输出进日志前隐去邮箱；手动清旧日志。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(root, '.github/workflows');
const read = (name) => readFileSync(join(WORKFLOWS, name), 'utf8');
function scriptOf(yaml) {
  const body = yaml.match(/\n          script: \|\n((?: {12}[^\n]*\n|\n)+)/)?.[1];
  assert.ok(body, '有 github-script 脚本');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('github', 'context', 'core', body.split('\n').map((l) => l.slice(12)).join('\n'));
}

test('所有作业都在 GitHub 自带的执行机上跑，不再用自托管执行机', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    const runsOn = [...read(f).matchAll(/^\s+runs-on:\s*(.+)$/gm)].map((m) => m[1].trim());
    assert.ok(runsOn.length > 0, f + ' 里有作业');
    for (const r of runsOn) assert.equal(r, 'ubuntu-latest', f + '：' + r);
  }
});

test('fork 来的 PR 不跑测试站部署', () => {
  assert.match(read('staging.yml'), /if: .*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});

test('隐去邮箱：别的内容原样留着、行数不变；wrangler 的输出都经过它', () => {
  const sample = [
    'Author:      someone.name+ci@qq.com',
    'Version(s):  (100%) 905d3ba6-8302-48c2-8254-caf0408b5cf6',
    'https://xiaoxin-site-staging.example.workers.dev',
    'Other.Person@Example.co.uk 和 third@mail.example.com',
  ].join('\n') + '\n';
  const r = spawnSync(process.execPath, [join(root, 'scripts/ci-redact.mjs')], { input: sample, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /@/, r.stdout);
  assert.equal(r.stdout.split('\n').length, sample.split('\n').length, '行数不变');
  for (const keep of ['905d3ba6-8302-48c2-8254-caf0408b5cf6', 'https://xiaoxin-site-staging.example.workers.dev']) assert.ok(r.stdout.includes(keep), keep);
  for (const f of ['deploy.yml', 'staging.yml']) {
    const lines = read(f).split('\n').filter((l) => /npx wrangler (deploy|secret|deployments)/.test(l));
    assert.ok(lines.length > 0, f);
    for (const l of lines) assert.match(l, /\|\s*node scripts\/ci-redact\.mjs/, f + '：' + l.trim());
  }
});

test('清理旧日志只能手动运行：只删 before 以前、已结束的运行的日志，跳过这次运行；404 不算错，别的错误让这次运行失败', async () => {
  const yaml = read('clean-logs.yml');
  assert.match(yaml, /^on:\n {2}workflow_dispatch:/m);
  assert.doesNotMatch(yaml, /^ {2}(push|pull_request|pull_request_target|schedule|workflow_run):/m);
  assert.match(yaml, /^permissions:\n {2}actions: write\n(?! {2}\S)/m);
  const execute = scriptOf(yaml);
  const runs = [
    { id: 1, status: 'completed', created_at: '2026-11-10T00:00:00Z' },
    { id: 2, status: 'completed', created_at: '2026-11-14T00:00:00Z' },
    { id: 3, status: 'in_progress', created_at: '2026-11-14T00:00:00Z' },
    { id: 4, status: 'completed', created_at: '2026-11-16T00:00:00Z' },
    { id: 5, status: 'completed', created_at: '2026-11-12T00:00:00Z' },
    { id: 99, status: 'completed', created_at: '2026-11-11T00:00:00Z' },
  ];
  async function run(before, fail = {}) {
    const deleted = [], failed = [], notes = [];
    const rest = { actions: {
      listWorkflowRunsForRepo: () => {},
      deleteWorkflowRunLogs: async ({ owner, repo, run_id }) => {
        assert.deepEqual([owner, repo], ['owner', 'site']);
        if (fail[run_id]) { const e = Error('boom'); e.status = fail[run_id]; throw e; }
        deleted.push(run_id);
      },
      deleteWorkflowRun: () => assert.fail('只删日志，不删运行记录'),
    } };
    const github = { rest, paginate: async (fn, args) => (assert.equal(fn, rest.actions.listWorkflowRunsForRepo), assert.deepEqual(args, { owner: 'owner', repo: 'site', per_page: 100 }), runs) };
    const core = { info: (m) => notes.push(m), warning: (m) => notes.push(m), setFailed: (m) => failed.push(m) };
    await execute(github, { repo: { owner: 'owner', repo: 'site' }, runId: 99, payload: { inputs: { before } } }, core);
    return { deleted, failed, notes };
  }
  const pause = process.env.CLEAN_PAUSE_MS;
  process.env.CLEAN_PAUSE_MS = '0';
  try {
    const ok = await run('2026-11-15T00:00:00Z', { 2: 404 });
    assert.deepEqual(ok.deleted, [1, 5]);
    assert.deepEqual(ok.failed, []);
    const bad = await run('2026-11-15T00:00:00Z', { 1: 403, 2: 404 });
    assert.deepEqual(bad.deleted, [5]);
    assert.equal(bad.failed.length, 1);
    await assert.rejects(run('昨天'), /before/);
    await assert.rejects(run(''), /before/);
  } finally { if (pause === undefined) delete process.env.CLEAN_PAUSE_MS; else process.env.CLEAN_PAUSE_MS = pause; }
});
