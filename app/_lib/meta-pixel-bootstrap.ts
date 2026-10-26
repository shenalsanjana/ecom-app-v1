// One shared Meta runtime, with one initialization and initial PageView per ID.
// The window registry also guards against the bootstrap being executed again.
export function metaPixelBootstrap(pixelIds: readonly string[]): string {
  const ids = [...new Set(pixelIds.map((id) => id.trim()).filter((id) => /^\d+$/.test(id)))];
  if (ids.length === 0) return "";

  return `
    (function() {
      var ids = ${JSON.stringify(ids)};
      var initialized = window.__dressingBearMetaPixels ||
        (window.__dressingBearMetaPixels = []);
      var pending = ids.filter(function(id) { return initialized.indexOf(id) === -1; });
      if (pending.length === 0) return;

      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');

      pending.forEach(function(id) {
        fbq('init', id);
        initialized.push(id);
      });
      pending.forEach(function(id) {
        fbq('trackSingle', id, 'PageView');
      });
    })();
  `;
}
