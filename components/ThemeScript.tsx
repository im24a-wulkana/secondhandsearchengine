/**
 * Applies the saved theme before first paint so the page never flashes the
 * wrong palette. Runs as a blocking inline script; keep it tiny.
 */
const SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
