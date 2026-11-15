// 打进 Actions 日志之前隐去邮箱：仓库公开后日志任何人都能看，wrangler 的输出（部署、部署列表等）可能带 Cloudflare 账号的邮箱。
// 用法：命令 | node scripts/ci-redact.mjs。只换邮箱，别的原样输出、行数不变。
import { pathToFileURL } from 'node:url';

export const redact = text => String(text).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '（邮箱已隐去）');

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => process.stdout.write(redact(input)));
}
