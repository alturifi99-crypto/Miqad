// Shared daily navigation remains limited to seating and guests.
export function consoleShell(html){
 const nav=`<aside class="sidebar premium-navigation"><div class="sidebar-heading"><a class="brand" href="/seating"><span class="brand-mark">م</span><span>مقعد</span></a><button id="console-sidebar-toggle" type="button" aria-label="إغلاق القائمة">×</button></div><nav aria-label="التنقل الرئيسي"><a href="/seating">مخطط المقاعد</a><a href="/guests">إدارة الضيوف</a></nav></aside>`;
 return html.replace('<script src="/security.js" defer></script>','<script src="/security.js" defer></script><script src="/unified.js" defer></script>').replace('<body>','<body class="company-console" data-design="orbit-beige-v1">'+nav+'<button id="console-backdrop" hidden aria-label="إغلاق القائمة"></button>').replace('<header><strong>','<header class="console-topbar"><button id="console-mobile-menu" type="button" aria-label="فتح القائمة">☰</button><strong>').replace('<main>','<main id="console-main">');
}
