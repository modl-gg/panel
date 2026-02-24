export function isPublicPage(path?: string): boolean {
  const p = path || window.location.pathname;
  return p.startsWith('/ticket/') ||
         p.startsWith('/appeal') ||
         p.startsWith('/submit-ticket') ||
         p === '/' ||
         p.startsWith('/knowledgebase') ||
         p.startsWith('/article/');
}
