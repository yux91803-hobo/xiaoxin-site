import html from "./public/index.html";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    return new Response(html, { headers });
  },
};
