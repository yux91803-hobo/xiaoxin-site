const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>xiaoxin.liming-work.com</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#e2e8f0;text-align:center}h1{font-size:2.2rem;margin:0 0 .5rem}p{opacity:.75}</style></head>
<body><div><h1>xiaoxin.liming-work.com</h1><p>新站点建设中，敬请期待。</p></div></body></html>`;
export default { async fetch() { return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }); } };
