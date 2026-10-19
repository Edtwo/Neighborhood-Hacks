// Long-form About text per language. Settings controls are bound by app.js (ids setNumber, setUnits).

const SETTINGS_EN = `
<h2>Settings</h2>
<p><label>Emergency number <select id="setNumber"><option>911</option><option>112</option><option>999</option><option>000</option></select></label></p>
<p><label>Units <select id="setUnits"><option value="imperial">feet / miles</option><option value="metric">meters / km</option></select></label></p>`;

const SETTINGS_ES = `
<h2>Ajustes</h2>
<p><label>Número de emergencia <select id="setNumber"><option>911</option><option>112</option><option>999</option><option>000</option></select></label></p>
<p><label>Unidades <select id="setUnits"><option value="imperial">pies / millas</option><option value="metric">metros / km</option></select></label></p>`;

export const ABOUT = {
  en: `
<h2>Why this exists</h2>
<p>When someone's heart stops, every minute without CPR and a shock costs them roughly 5–10% of their chance to live. An ambulance usually takes several minutes or more to arrive. A neighbor with an AED can be there sooner. But in the US, most AEDs aren't on any public map. OpenStreetMap lists <strong>zero</strong> AEDs in all of Virginia Beach (pop. 450,000), zero in Dallas, and 110 in all of Texas.</p>
<p>About 7 in 10 cardiac arrests happen at home, and bystanders use an AED in only about 2% of eligible cases. Heartline is built for the neighborhoods where that happens.</p>

<h2>How it works</h2>
<ul>
  <li><strong>Emergency.</strong> Finds AEDs mapped on OpenStreetMap near you, plus places that usually have one (fire stations, police, gyms, schools). These are clearly marked "not confirmed". It checks whether each one is open <em>right now</em> and estimates the round trip for someone fetching it. Then it tells you plainly whether to send someone or keep doing CPR.</li>
  <li><strong>CPR coach.</strong> A 110-per-minute beat with sound, vibration and spoken prompts in English or Spanish, following AHA hands-only CPR guidance. It keeps your screen awake.</li>
  <li><strong>Neighborhood gaps.</strong> Splits your area into 100 m squares weighted by residential streets (a stand-in for homes). It then shows which squares can get an AED back in time at the hour you choose, and how coverage changes across the week. It also suggests the 24/7 places (fire stations, police, gas stations, convenience stores) where an outdoor AED cabinet would cover the most homes, using a greedy coverage algorithm. You can print the result as a one-page sheet for a city council, HOA or school board.</li>
  <li><strong>Add an AED.</strong> Turns what you saw into a public OpenStreetMap note with the right tags. Local mappers can then add the AED, and every app that uses OpenStreetMap learns about it.</li>
</ul>

<h2>Assumptions (read these)</h2>
<ul>
  <li>Fetch time = 2 × straight-line distance × 1.3 (streets aren't straight) ÷ 2 m/s (hurried walk), + 60 s to find an indoor AED or 20 s for an outdoor cabinet. Real routes vary.</li>
  <li>"Likely" places and their typical hours are guesses by category. They are never shown as confirmed. The gap analysis leaves them out unless you turn them on.</li>
  <li>An AED with unknown hours counts as <em>unavailable</em> in the gap analysis, so coverage is never overstated.</li>
  <li>Residential street density is only a rough stand-in for where people live.</li>
</ul>

<h2>Data and privacy</h2>
<p>Map data © OpenStreetMap contributors (ODbL), fetched live from the Overpass API and cached on your device for offline use. Your location is sent only as part of that map query. There are no accounts, no tracking and no analytics.</p>
${SETTINGS_EN}`,

  es: `
<h2>Por qué existe</h2>
<p>Cuando el corazón de alguien se detiene, cada minuto sin RCP ni descarga le quita aproximadamente entre un 5 y un 10% de probabilidad de vivir. Una ambulancia suele tardar varios minutos o más en llegar. Un vecino con un DEA puede llegar antes. Pero en EE. UU. la mayoría de los DEA no aparecen en ningún mapa público. OpenStreetMap registra <strong>cero</strong> DEA en toda Virginia Beach (450,000 habitantes), cero en Dallas y 110 en todo Texas.</p>
<p>Cerca de 7 de cada 10 paros cardíacos ocurren en casa, y los testigos usan un DEA en solo un 2% de los casos en que se podría usar. Heartline está hecho para los vecindarios donde eso ocurre.</p>

<h2>Cómo funciona</h2>
<ul>
  <li><strong>Emergencia.</strong> Busca DEA registrados en OpenStreetMap cerca de ti, además de lugares que suelen tener uno (bomberos, policía, gimnasios, escuelas). Estos se marcan claramente como "sin confirmar". Revisa si cada uno está abierto <em>ahora mismo</em>, estima cuánto tarda alguien en ir y volver con él y te dice claramente si mandar a alguien o seguir con la RCP.</li>
  <li><strong>Guía de RCP.</strong> Un ritmo de 110 por minuto con sonido, vibración e instrucciones habladas, según la guía de RCP solo con las manos de la AHA. Mantiene la pantalla encendida.</li>
  <li><strong>Zonas sin DEA.</strong> Divide tu zona en cuadros de 100 m, ponderados por calles residenciales (una aproximación de dónde están las casas). Muestra qué cuadros pueden recibir un DEA a tiempo a la hora que elijas y cómo cambia la cobertura durante la semana. También sugiere los lugares abiertos 24/7 donde un gabinete exterior cubriría más casas. Puedes imprimirlo como una hoja para el ayuntamiento, la asociación de vecinos o la escuela.</li>
  <li><strong>Agregar un DEA.</strong> Convierte lo que viste en una nota pública de OpenStreetMap con las etiquetas correctas. Así, los mapeadores locales pueden agregar el DEA y todas las apps que usan OpenStreetMap lo conocen.</li>
</ul>

<h2>Supuestos</h2>
<ul>
  <li>Tiempo de ida y vuelta = 2 × distancia en línea recta × 1.3 ÷ 2 m/s, + 60 s para encontrar un DEA interior o 20 s si es exterior.</li>
  <li>Los lugares "probables" y sus horarios típicos son estimaciones por categoría. Nunca se muestran como confirmados.</li>
  <li>Un DEA con horario desconocido cuenta como <em>no disponible</em> en el análisis, para no exagerar la cobertura.</li>
</ul>

<h2>Datos y privacidad</h2>
<p>Datos del mapa © colaboradores de OpenStreetMap (ODbL). Tu ubicación solo se envía como parte de la consulta al mapa. No hay cuentas, rastreo ni analíticas.</p>
${SETTINGS_ES}`,
};
