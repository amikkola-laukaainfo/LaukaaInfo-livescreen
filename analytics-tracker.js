/**
 * LaukaaInfo & LiveScreen - Privacy-First Kävijäseuranta
 * Yhdistetty Mediazoo Analytics (Supabase traffic_events)
 */
(function() {
  if (typeof window === 'undefined') return;
  if (window.__laukaainfo_analytics_loaded) return;
  window.__laukaainfo_analytics_loaded = true;

  try {
    var isBot = /bot|googlebot|crawler|spider|robot|crawling|lighthouse|headless/i.test(navigator.userAgent);
    var sessKey = 'lz_sid';
    var sid = sessionStorage.getItem(sessKey);
    if (!sid) {
      sid = 'li-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem(sessKey, sid);
    }

    var currentPath = window.location.pathname || '/';
    // Lisätään mahdollinen ankkuri tai haku selkeyttämään sivua
    if (window.location.hash && window.location.hash.length > 1) {
      currentPath += window.location.hash;
    }

    var data = {
      site_id: 'laukaainfo',
      page_path: currentPath,
      event_type: 'pageview',
      referrer: document.referrer || null,
      device_type: /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent) 
        ? 'tablet' 
        : /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      browser: navigator.userAgent.substring(0, 80),
      is_bot: isBot,
      session_id: sid
    };

    // Lähetetään Supabaseen taustalla ilman viivettä
    fetch('https://empwrvdanosyvbudjaqa.supabase.co/rest/v1/traffic_events', {
      method: 'POST',
      headers: {
        'apikey': 'sb_publishable_WgjcAGJJvNoIl2as_4heMw_a_I2TBnJ',
        'Authorization': 'Bearer sb_publishable_WgjcAGJJvNoIl2as_4heMw_a_I2TBnJ',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function() {});
  } catch (e) {}
})();

