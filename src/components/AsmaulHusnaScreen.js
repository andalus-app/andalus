import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useIsPWA } from '../hooks/useIsPWA';
import { useScrollHide } from '../hooks/useScrollHide';
import names from '../data/asmaul_husna.json';

// Pre-build search index once at module load — zero cost at runtime
const SEARCH_INDEX = names.map(n => ({
  norm: normalize(n.transliteration + ' ' + n.swedish + ' ' + String(n.nr)),
  arabic: n.arabic,
}));

// Normalize search query: strip diacritics + apostrophes for fuzzy matching
// e.g. "al-Qayyūm" → "al-qayyum", "al-Ākhir" → "al-akhir"
function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''ʼʻ`´]/g, "'")
    .replace(/[–—]/g, '-')
    .toLowerCase();
}

const FAV_KEY = 'asmaul_husna_favorites';
function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveFavs(set) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch {}
}

function Heart({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#e53e3e' : 'none'}
      stroke={filled ? '#e53e3e' : 'currentColor'}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

// ── Grid card — no play button, bigger Arabic/transliteration ──
function GridCard({ name, onPress, isFav, onToggleFav, T }) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); onToggleFav(); }}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: isFav ? '#e53e3e' : 'rgba(128,128,128,0.7)',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center',
        }}
      >
        <Heart filled={isFav} size={18} />
      </button>

      <button
        onClick={onPress}
        style={{
          width: '100%', background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 22,
          boxShadow: T.isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.09)',
          padding: '14px 12px 16px', cursor: 'pointer', textAlign: 'center',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, boxSizing: 'border-box',
          fontFamily: "'Inter',system-ui,sans-serif",
        }}
      >
        <div style={{
          alignSelf: 'flex-start', width: 26, height: 26, borderRadius: 13,
          background: `${T.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums',
        }}>{name.nr}</div>

        <div style={{
          fontSize: 46, lineHeight: 1.3, color: T.text,
          fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
          direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%',
        }}>{name.arabic}</div>

        <div style={{
          fontSize: 13, fontWeight: 700, color: T.text,
          lineHeight: 1.2, textAlign: 'center', letterSpacing: '-.1px',
        }}>{name.transliteration}</div>
      </button>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────

// ── Detail screen ─────────────────────────────────────────────
function DetailScreen({ name, onBack, isFav, onToggleFav, T }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); audio.currentTime = 0; setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  return (
    <div style={{
      background: T.bg, minHeight: '100%', display: 'flex',
      flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
      position: 'relative',
    }}>
      <style>{`@keyframes detailIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <audio ref={audioRef} src={`audio/${name.nr}.mp3`} preload="none" onEnded={() => setPlaying(false)} />

      {/* Floating back arrow */}
      <button onClick={onBack} style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 10, zIndex: 20,
        background: T.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${T.border}`,
        borderRadius: 20, width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        color: T.accent, fontSize: 22, fontWeight: 300, lineHeight: 1,
        paddingBottom: 1,
      }}>‹</button>

      {/* Floating heart */}
      <button onClick={onToggleFav} style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 10, zIndex: 20,
        background: T.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${T.border}`,
        borderRadius: 20, width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        color: isFav ? '#e53e3e' : T.textMuted,
      }}>
        <Heart filled={isFav} size={20} />
      </button>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48, animation: 'detailIn .22s ease both' }}>
        <div style={{ textAlign: 'center', padding: '28px 24px 20px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 22,
            background: T.accent, color: '#fff',
            fontSize: 16, fontWeight: 700, marginBottom: 16,
          }}>{name.nr}</div>

          <div style={{
            fontSize: 58, lineHeight: 1.4, color: T.text,
            fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
            direction: 'rtl', marginBottom: 14,
          }}>{name.arabic}</div>

          <div style={{
            fontSize: 22, fontWeight: 700, color: T.text,
            letterSpacing: '-.2px', marginBottom: 4,
          }}>{name.transliteration}</div>

          <div style={{ fontSize: 15, color: T.textMuted, fontWeight: 400, marginBottom: 24 }}>
            {name.swedish}
          </div>

          <button onClick={togglePlay} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: playing ? T.accent : `${T.accent}18`,
            border: `1.5px solid ${T.accent}`,
            borderRadius: 50, padding: '10px 28px',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: playing ? '#fff' : T.accent,
            WebkitTapHighlightColor: 'transparent',
            transition: 'all .18s',
          }}>
            {playing
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
            {playing ? 'Pausar' : 'Lyssna'}
          </button>
        </div>

        <div style={{ height: 1, background: T.border, margin: '0 18px 20px' }} />

        {name.forklaring && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>Förklaring</div>
            <div style={{ fontSize: 15, lineHeight: 1.75, color: T.textSecondary || T.textMuted }}>{name.forklaring}</div>
          </section>
        )}

        {name.koranvers_arabiska && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>Koranvers</div>
            <div style={{
              background: T.isDark ? 'rgba(45,139,120,0.1)' : 'rgba(36,100,93,0.06)',
              border: `1px solid ${T.accent}30`, borderRadius: 16, padding: '18px 16px',
            }}>
              <div style={{ fontSize: 24, lineHeight: 1.8, textAlign: 'center', color: T.text, fontFamily: "'Scheherazade New','Traditional Arabic',serif", direction: 'rtl', marginBottom: 14 }}>{name.koranvers_arabiska}</div>
              <div style={{ height: 1, background: `${T.accent}25`, marginBottom: 12 }} />
              <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65 }}>{name.koranvers_svenska}</div>
              {name.sura_ayat && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: T.accent }}>[{name.sura_ayat}]</div>}
            </div>
          </section>
        )}

        {name.hadith && (
          <section style={{ padding: '0 18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#C47B2B', marginBottom: 10 }}>Hadith</div>
            <div style={{ background: T.isDark ? 'rgba(196,123,43,0.1)' : 'rgba(196,123,43,0.06)', border: '1px solid rgba(196,123,43,0.25)', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 14, color: T.textSecondary || T.textMuted, lineHeight: 1.7 }}>{name.hadith}</div>
            </div>
          </section>
        )}

        {name.antal_i_koranen != null && (
          <div style={{ margin: '0 18px' }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: T.textMuted }}>Antal i Koranen</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>{name.antal_i_koranen}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Q&A data ──────────────────────────────────────────────────
const QA_DATA = [
  {
    fraga: 'Har Allah endast 99 namn?',
    subtitle: 'Bevis från hadith: fler namn än 99',
    svar_kort: 'Nej.',
    forklaring: 'Beviset för det är hadithen där Profeten (salla Allahu \'alayhi wa sallam) sade:',
    citat: 'Jag ber dig vid varje namn som du har namngivit dig själv med eller som du har uppenbarat i din bok eller som du har lärt någon av din skapelse eller som du har hållit dolt för dig själv.',
    kalla: 'Ahmad (3712). Autentisk enligt Imam al-Albani i Silsilah as-Sahihah (199)',
    slutsats: 'Frasen "... eller som du har hållit dolt för dig själv" bevisar att Allah har namn som endast han känner till.',
  },
];

// ── Lärdomar data — 14 lärdomar med exakta texter från bilderna ──
const LARDOMAR_DATA = [
  {
    nr: 1,
    titel: 'När Allah vill en människa väl',
    stycken: [
      'Profeten ﷺ sa: "Den som Allah vill väl, skänker han förståelse i religionen." (al-Bukhari nr. 71)',
      'En av de mest betydelsefulla formerna av förståelse är att en människa fördjupar sin kunskap om Allah. Kunskap om Allah är grunden för all rättfärdighet, verklig framgång och räddning – både i detta liv och i det kommande.',
      'Ju djupare en människas kunskap om Allah är, desto starkare blir hennes gudsfruktan. Hennes dyrkan blir mer uppriktig och hängiven, och hennes vilja att undvika synd stärks.',
      'När människor brister i sin dyrkan beror det ofta på att deras kunskap om Allah är ofullständig – om hans rättigheter, hans storhet och hans fullkomlighet.',
    ],
  },
  {
    nr: 2,
    titel: 'Att lära känna Allah genom hans namn',
    stycken: [
      'Profeten ﷺ sa: "Allah har nittionio namn – hundra minus ett. Den som gör ihsa av dessa namn kommer att träda in i paradiset." (al-Bukhari nr. 2736, Muslim nr. 2677)',
      'Att göra ihsa av Allahs namn innebär inte bara att känna till dem, utan sker på flera nivåer:',
      'Första nivån: att memorera namnen. Detta innebär att lära sig Allahs namn och bära dem i sitt minne.',
      'Andra nivån: att förstå namnen. Det innebär att förstå deras betydelse och vad de säger om Allah och hans fullkomliga egenskaper.',
      'Tredje nivån: att leva i enlighet med namnen. Den som vet att Allah är den ende sanne guden vänder sig inte till någon annan i dyrkan. Och den som vet att Allah är al-Basir, den seende, aktar sig för synder även när ingen människa ser honom.',
      'Fjärde nivån: att åkalla Allah med hans namn. Allah säger, i betydelse: "Till Allah hör de allra vackraste namnen, åkalla honom därför med dem." [al-A\'raf 7:180]',
      'Detta kan till exempel vara att säga:\nYa Rahman (O, den Nåderike), visa mig barmhärtighet.\nYa Ghafur (O, den Förlåtande), förlåt mig.\nYa Tawwab (O, Ångermottagren), ta emot min ånger.',
    ],
  },
  {
    nr: 3,
    titel: 'Det är förbjudet att beskriva Allah på ett sätt han inte själv har beskrivit sig',
    stycken: [
      'Allah är fullkomlig och upphöjd över alla brister. Därför är det inte tillåtet att beskriva Allah med namn eller egenskaper som han själv inte har nämnt i Koranen eller som profeten ﷺ inte har förmedlat. Människans förstånd är begränsat, och utan vägledning från uppenbarelsen riskerar man att tillskriva Allah sådant som inte passar honom.',
      'Islam lär oss att tala om Allah med vördnad och försiktighet. När vi håller oss till de namn och egenskaper som finns i uppenbarelsen bevarar vi en korrekt och ren förståelse av tron. Att gå utöver detta, genom spekulation eller egna formuleringar, kan leda till förvirring och felaktiga föreställningar om Allah.',
      'Därför är en grundläggande princip i islamisk tro att Allah endast beskrivs så som han själv har valt att beskriva sig. Detta är ett uttryck för ödmjukhet inför hans storhet och ett skydd för den sanna tron.',
    ],
  },
  {
    nr: 4,
    titel: 'Kunskap om Allahs namn är nödvändig för att kunna dyrka honom med insikt',
    stycken: [
      'Dyrkan i islam handlar inte bara om yttre handlingar, utan om hjärtats närvaro och medvetenhet. För att en människa ska kunna dyrka Allah på ett meningsfullt sätt behöver hon känna honom. Denna kännedom kommer i första hand genom Allahs namn och egenskaper.',
      'När en muslim lär sig vad Allahs namn betyder, förändras relationen till honom. Bönen blir mer uppriktig, tilliten starkare och gudsfruktan djupare. Man förstår vem man vänder sig till, vem som hör, ser, förlåter och visar barmhärtighet.',
      'Utan kunskap om Allahs namn riskerar dyrkan att bli mekanisk och tom. Med kunskap blir den levande, medveten och fylld av mening. Därför är lärandet om Allahs namn och egenskaper en central del av tron och en nyckel till en djupare och mer äkta dyrkan.',
    ],
  },
  {
    nr: 5,
    titel: 'Det finns ingen autentisk hadith som nämner alla de 99 namnen tillsammans',
    stycken: [
      'Det är fastslaget i autentiska hadither att Allah har nittionio namn och att den som gör ihsa av dem lovas paradiset. Däremot finns det ingen tillförlitlig hadith där alla dessa namn räknas upp i en och samma lista.',
      'Därför bör man vara försiktig med att påstå att en specifik lista med namn med säkerhet utgör exakt de nittionio.',
      'Detta innebär dock inte att kunskapen om Allahs namn förlorar sin betydelse. Tvärtom uppmanas muslimer att lära sig, reflektera över och leva med de namn som finns i Koranen och i autentiska hadither, även om de inte samlas i en enda lista.',
    ],
  },
  {
    nr: 6,
    titel: 'Att lära känna Allah leder till kärlek till honom',
    stycken: [
      'När en människa lär känna Allah genom hans namn, egenskaper och handlingar, växer kärleken till honom naturligt i hjärtat. Kunskap om Allah gör tron levande och relationen personlig.',
      'Ju mer man förstår om Allahs barmhärtighet, visdom, rättvisa och omsorg, desto mer känner man tacksamhet, hopp och tillit. Kärleken till Allah uppstår inte genom ord enbart, utan genom insikt och reflektion över vem han är och hur han tar hand om sina skapelser.',
      'Denna kärlek blir i sin tur en drivkraft till lydnad, uppriktighet och tålamod. Att lära känna Allah är därför inte bara en intellektuell resa, utan en väg som leder hjärtat närmare honom.',
    ],
  },
  {
    nr: 7,
    titel: 'Människans tillkortakommanden hänger samman med bristande kunskap om Allah',
    stycken: [
      'När en människa brister i sin tro, i sina handlingar eller i sin ånger inför Allah, är det sällan ett tecken på illvilja eller likgiltighet. Ofta har det sin grund i en bristande kunskap om Allah och vem han är.',
      'Den som inte verkligen känner sin Herre har svårt att frukta honom på rätt sätt, att hoppas på honom fullt ut eller att vända sig till honom med uppriktighet. Människans praktiserande försvagas när tron på Allah blir svag, och handlingarna blir inkonsekventa när hjärtat saknar djup insikt.',
      'Kunskap om Allah ger tron stadga. När en människa förstår Allahs storhet, barmhärtighet och visdom, stärks hennes iman, hennes handlingar blir mer uppriktiga och hennes ånger blir mer ärlig. Brist på kunskap leder ofta till slapphet, medan sann kunskap väcker hjärtat och driver människan mot förbättring och närhet till Allah.',
    ],
  },
  {
    nr: 8,
    titel: 'Tron på Allahs namn och egenskaper formar hjärtat och handlingarna',
    stycken: [
      'Tron på Allahs namn och egenskaper är inte bara en teoretisk fråga, utan något som har en djup och konkret påverkan på människans inre och yttre liv. När en muslim verkligen tror på Allahs namn och reflekterar över deras innebörd, börjar denna tro sätta tydliga spår i hjärtat.',
      'Kärlek till Allah växer när man lär känna hans barmhärtighet och omsorg. Fruktan uppstår när man inser hans storhet och rättvisa. Hopp stärks när man förstår hans förlåtelse och generositet. Och tilliten till Allah fördjupas när man ser hans visdom i allt som sker.',
      'Denna inre förändring speglar sig i människans beteende. Hennes ord blir varsammare, hennes handlingar mer medvetna och hennes relation till Allah mer levande. Tron på Allahs namn och egenskaper formar därmed både hjärtat och vardagen, och leder till ett liv präglat av balans mellan kärlek, fruktan och hopp.',
    ],
  },
  {
    nr: 9,
    titel: 'Tron på Allah ger livet riktning och mening',
    stycken: [
      'Att tro på Allah innebär mer än att acceptera en troslära. Det ger livet en tydlig riktning och ett djupare sammanhang. När en människa tror på Allah vet hon varifrån hon kommer, varför hon lever och vart hon är på väg. Detta skapar inre stabilitet, även när livet är prövande och ovisst.',
      'Tron på Allah hjälper människan att tolka både glädje och svårigheter på ett meningsfullt sätt. Framgång leder till tacksamhet, och motgångar möts med tålamod och hopp. Livet upplevs inte som slumpmässigt, utan som en del av Allahs visdom och plan.',
      'Denna övertygelse ger ro i hjärtat och skyddar mot tomhet och uppgivenhet. Tron på Allah gör att människan lever med syfte, ansvar och förtröstan.',
    ],
  },
  {
    nr: 10,
    titel: 'Tron på Allah skapar inre styrka och trygghet',
    stycken: [
      'När en människa verkligen tror på Allah förändras hennes sätt att möta världen. Hon vet att hon aldrig är ensam, att Allah ser henne, hör henne och tar hand om henne. Detta skapar en djup inre trygghet som inte är beroende av yttre omständigheter.',
      'Rädsla för människor, framtiden eller det okända minskar när tilliten till Allah växer. Tron ger mod att stå fast vid det rätta, även när det är svårt, och styrka att fortsätta när krafterna känns svaga.',
      'Den som litar på Allah lär sig att göra sitt bästa och sedan överlåta resultatet till honom. Detta befriar hjärtat från ständig oro och ger en balanserad syn på ansvar och tillit.',
    ],
  },
  {
    nr: 11,
    titel: 'Tron på Allah formar moral och ansvar',
    stycken: [
      'Tron på Allah påverkar hur en människa beter sig, även när ingen annan ser henne. Medvetenheten om att Allah ser allt och känner till allt gör att samvetet blir levande och starkt.',
      'Den troende strävar efter ärlighet, rättvisa och god karaktär, inte för människors skull, utan för Allahs. Tron skapar ansvarstagande – i ord, handlingar och avsikter. Den påminner människan om att varje val har betydelse och att livet inte är utan ansvar.',
      'På detta sätt blir tron på Allah inte bara något som finns i hjärtat, utan något som genomsyrar hela livet och formar människans relation till både sin Herre och till andra människor.',
    ],
  },
  {
    nr: 12,
    titel: 'Trosfrågor tas från uppenbarelsen – inte från åsikter och spekulation',
    stycken: [
      'En grundläggande princip i Ahl us-Sunnas troslära är att tron bygger på uppenbarelsen. Det är Koranen och profetens ﷺ autentiska sunnah som utgör grunden för vad vi tror om Allah, om det osedda och om religionens kärna.',
      'Trosfrågor formas inte av personliga åsikter, filosofiska resonemang eller kulturella trender. Människans förnuft har sin plats, men i frågor som rör Allah och det osedda är uppenbarelsen den yttersta vägledningen. Därför accepteras inte trosuppfattningar som saknar stöd i Koranen och sunnah, även om de kan framstå som logiska eller tilltalande.',
      'Denna princip skyddar tron från att förändras över tid och bevarar dess renhet. Genom att hålla sig till uppenbarelsen förblir tron stabil, tydlig och gemensam för muslimer oavsett tid och plats.',
    ],
  },
  {
    nr: 13,
    titel: 'Balans mellan bekräftelse och ödmjukhet i tron på Allah',
    stycken: [
      'Ahl us-Sunnas troslära kännetecknas av balans. När det gäller Allahs namn och egenskaper bekräftar man det som Allah har nämnt om sig själv, utan att förneka, förvränga eller spekulera om hur dessa egenskaper är.',
      'Allahs namn och egenskaper accepteras som de har kommit i uppenbarelsen, samtidigt som man erkänner att Allah är olik sin skapelse och att människan inte kan föreställa sig hans verklighet. Tron kombinerar därmed bekräftelse med ödmjukhet inför Allahs storhet.',
      'Denna balanserade hållning skyddar både från att tömma texterna på deras innebörd och från att likna Allah vid skapade varelser. Det är en väg som bevarar både tron och vördnaden.',
    ],
  },
  {
    nr: 14,
    titel: 'Tron visar sig i hjärta, ord och handling',
    stycken: [
      'En central princip i Ahl us-Sunnas troslära är att tron inte enbart är något inre. Tron omfattar hjärtats övertygelse, tungans uttal och kroppens handlingar. Alla dessa delar hör samman och påverkar varandra.',
      'Tron kan stärkas genom lydnad, goda handlingar och kunskap, och den kan försvagas genom synder och försummelse. Därför ses tron som levande och dynamisk, inte statisk eller oföränderlig.',
      'Denna förståelse gör att religionen blir praktisk och verklighetsnära. Tron påverkar hur en människa ber, hur hon behandlar andra och hur hon lever sitt liv. På så sätt blir tron enligt Ahl us-Sunnas förståelse något som genomsyrar hela människans tillvaro.',
    ],
  },
];

// ── LardomarDetail — fullscreen detail for one lärdom ──
function LardomarDetail({ lardom, onBack, T }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 25, background: T.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '18px 20px 60px' }}>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: T.accent,
            fontSize: 16, padding: 0, marginBottom: 20, WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M7 1L1 7l6 6" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Tillbaka
          </button>

          <span style={{
            display: 'inline-block',
            background: T.accent, color: '#fff',
            borderRadius: 20, padding: '4px 14px',
            fontSize: 13, fontWeight: 700, marginBottom: 16,
          }}>
            Lärdom {lardom.nr}
          </span>

          <h1 style={{
            fontSize: 28, fontWeight: 800, color: T.text,
            lineHeight: 1.25, marginBottom: 24, margin: '0 0 24px 0',
          }}>
            {lardom.titel}
          </h1>

          {lardom.stycken.map((stycke, i) => (
            <p key={i} style={{
              fontSize: 16, color: T.text, lineHeight: 1.75,
              marginBottom: 18, margin: '0 0 18px 0',
              whiteSpace: 'pre-line',
            }}>
              {stycke}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LardomarList — full list of 14 lärdomar ──
function LardomarList({ onBack, T }) {
  const [activeLardom, setActiveLardom] = useState(null);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20, background: T.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Detail view */}
      {activeLardom && (
        <LardomarDetail
          lardom={activeLardom}
          onBack={() => setActiveLardom(null)}
          T={T}
        />
      )}

      {/* List view */}
      <div style={{ padding: '18px 20px 8px', flexShrink: 0 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: T.accent,
          fontSize: 16, padding: 0, marginBottom: 16, WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Tillbaka
        </button>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 20 }}>Lärdomar</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px', WebkitOverflowScrolling: 'touch' }}>
        {LARDOMAR_DATA.map((l) => (
          <button
            key={l.nr}
            onClick={() => setActiveLardom(l)}
            style={{
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 14,
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '16px 16px', marginBottom: 10,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              boxSizing: 'border-box',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 16, flexShrink: 0,
              background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff',
            }}>
              {l.nr}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35, marginBottom: 5 }}>
                {l.titel}
              </div>
              <div style={{
                fontSize: 13, color: T.textMuted, lineHeight: 1.4,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {l.stycken[0]}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function AsmaulHusnaScreen({ onBack, onMount }) {
  const { theme: T } = useTheme();
  const isPWA = useIsPWA();
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [activeQA, setActiveQA] = useState(null);
  const [showLardomar, setShowLardomar] = useState(false);
  const [favs, setFavs] = useState(loadFavs);
  const [filterFavs, setFilterFavs] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { visible: headerVisible, onScroll: onListScroll } = { visible: true, onScroll: () => {} }; // header alltid synlig
  const listScrollRef = useRef(null);
  const savedListScrollRef = useRef(0);

  useEffect(() => { onMount?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Säkerställ att listan alltid börjar på toppen vid mount —
  // iOS Safari kan annars återanvända en cachad scroll-position
  useEffect(() => {
    const el = listScrollRef.current;
    if (el) el.scrollTop = 0;
    savedListScrollRef.current = 0;
    return () => { savedListScrollRef.current = 0; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 120);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handler = () => {
      if (activeQA) { setActiveQA(null); return; }
      if (showLardomar) { setShowLardomar(false); return; }
      if (activeSection) { setActiveSection(null); return; }
      if (selected) {
        setSelected(null);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (listScrollRef.current) listScrollRef.current.scrollTop = savedListScrollRef.current;
        }));
        return;
      }
      onBack();
    };
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [selected, activeSection, activeQA, onBack]);

  const toggleFav = useCallback((nr) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(nr)) next.delete(nr); else next.add(nr);
      saveFavs(next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!debouncedSearch && !filterFavs) return names;
    if (!debouncedSearch) return names.filter(n => favs.has(n.nr));
    const q = normalize(debouncedSearch);
    const isArabic = /[؀-ۿ]/.test(debouncedSearch);
    return names.filter((n, i) => {
      if (filterFavs && !favs.has(n.nr)) return false;
      if (isArabic) return SEARCH_INDEX[i].arabic.includes(debouncedSearch);
      return SEARCH_INDEX[i].norm.includes(q);
    });
  }, [debouncedSearch, filterFavs, favs]);

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Detail screen — always mounted, shown/hidden via CSS */}
      <div style={{ display: selected ? 'flex' : 'none', flexDirection: 'column', minHeight: '100%', position: 'absolute', inset: 0, zIndex: 10, background: T.bg }}>
        {selected && (
          <DetailScreen
            name={selected} onBack={() => {
              setSelected(null);
              requestAnimationFrame(() => requestAnimationFrame(() => {
                if (listScrollRef.current) listScrollRef.current.scrollTop = savedListScrollRef.current;
              }));
            }}
            isFav={favs.has(selected.nr)} onToggleFav={() => toggleFav(selected.nr)}
            T={T}
          />
        )}
      </div>

      {/* Lärdomar screen */}
      {showLardomar && (
        <LardomarList onBack={() => setShowLardomar(false)} T={T} />
      )}

      {/* Q&A list screen */}
      {activeSection === 'qa' && !activeQA && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
          <div style={{ padding: '18px 20px 8px' }}>
            <button onClick={() => setActiveSection(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 16, padding: 0, marginBottom: 16, WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Tillbaka
            </button>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 20 }}>Frågor &amp; Svar</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px' }}>
            {QA_DATA.map((qa, i) => (
              <button
                key={i}
                onClick={() => setActiveQA(qa)}
                style={{
                  width: '100%', textAlign: 'left', background: T.card,
                  border: `1px solid ${T.border}`, borderRadius: 18,
                  padding: '16px 18px', marginBottom: 12,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 20, background: T.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 15, fontWeight: 700, color: '#fff',
                }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{qa.fraga}</div>
                  <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3, lineHeight: 1.4 }}>{qa.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Q&A detail screen */}
      {activeQA && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 48px' }}>
            <button onClick={() => setActiveQA(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 16, padding: 0, marginBottom: 20, WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Tillbaka
            </button>

            <div style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1.3, marginBottom: 6 }}>{activeQA.fraga}</div>
            <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 24 }}>{activeQA.subtitle}</div>

            {/* Fråga box */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 8 }}>Fråga</div>
              <div style={{ fontSize: 15, color: T.text, lineHeight: 1.6 }}>{activeQA.fraga}</div>
            </div>

            {/* Svar box */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: T.accent, marginBottom: 8 }}>Svar</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.5 }}>{activeQA.svar_kort}</div>
            </div>

            {activeQA.forklaring && (
              <div style={{ fontSize: 15, color: T.text, lineHeight: 1.75, marginBottom: 20 }}>{activeQA.forklaring}</div>
            )}

            {activeQA.citat && (
              <div style={{ background: T.isDark ? 'rgba(45,139,120,0.12)' : 'rgba(36,100,93,0.07)', border: `1px solid ${T.accent}30`, borderRadius: 14, padding: '16px 18px', marginBottom: 10 }}>
                <div style={{ fontSize: 15, color: T.text, lineHeight: 1.8, fontStyle: 'italic' }}>"{activeQA.citat}"</div>
              </div>
            )}

            {activeQA.kalla && (
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20, lineHeight: 1.5 }}>[{activeQA.kalla}]</div>
            )}

            {activeQA.slutsats && (
              <div style={{ fontSize: 15, color: T.text, lineHeight: 1.75 }}>{activeQA.slutsats}</div>
            )}
          </div>
        </div>
      )}

      {/* List screen — täcker hela sin container, hanterar egen scroll */}
      <div style={{
        visibility: (selected || activeSection || activeQA || showLardomar) ? 'hidden' : 'visible',
        pointerEvents: (selected || activeSection || activeQA || showLardomar) ? 'none' : 'auto',
        display: 'flex', flexDirection: 'column',
        position: 'absolute', inset: 0,
        background: T.bg,
        // Ingen overflow:hidden — det blockerade scroll på iOS
      }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header — alltid synlig, safe-area hanteras här */}
      <div style={{
        flexShrink: 0, zIndex: 20,
        background: T.bg, borderBottom: `1px solid ${T.border}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 22, padding: '2px 8px 2px 0', WebkitTapHighlightColor: 'transparent', fontWeight: 300, lineHeight: 1 }}>‹</button>
          <button onClick={() => listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1 }}>Allahs 99 namn</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>أسماء الله الحسنى</div>
          </button>
          {/* Grid/list toggle */}
          <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '7px 9px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center' }}>
            {viewMode === 'grid' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            )}
          </button>
        </div>

        {/* Search + fav filter */}
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: T.bgSecondary || T.bg, borderRadius: 12, padding: '8px 12px', border: `1px solid ${T.border}` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök namn..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: 16, color: T.text, flex: 1, fontFamily: "'Inter',system-ui,sans-serif" }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 17, padding: 0, lineHeight: 1 }}>×</button>}
          </div>
          <button onClick={() => setFilterFavs(f => !f)} style={{ background: T.card, border: `1px solid ${filterFavs ? '#e53e3e44' : T.border}`, borderRadius: 12, padding: '8px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: T.textMuted, transition: 'all .18s' }}>
            <Heart filled={filterFavs} size={14} />
            {favs.size > 0 && <span style={{ color: filterFavs ? '#e53e3e' : T.textMuted }}>{favs.size}</span>}
          </button>
        </div>

        {/* Section pills — Lärdomar + Frågor & Svar */}
        {!search && !filterFavs && (
          <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowLardomar(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: `${T.accent}14`, border: `1px solid ${T.accent}33`,
                borderRadius: 20, padding: '7px 14px',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                fontFamily: "'Inter',system-ui,sans-serif",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>Lärdomar</span>
            </button>
            <button
              onClick={() => setActiveSection('qa')}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: `${T.accent}14`, border: `1px solid ${T.accent}33`,
                borderRadius: 20, padding: '7px 14px',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                fontFamily: "'Inter',system-ui,sans-serif",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>Frågor &amp; Svar</span>
            </button>
          </div>
        )}
      </div>{/* end sticky header */}

      {(search || filterFavs) && filtered.length < names.length && (
        <div style={{ padding: '6px 16px 0', fontSize: 12, color: T.textMuted }}>Visar {filtered.length} av {names.length} namn</div>
      )}

      {/* Scroll-container */}
      <div ref={listScrollRef} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 32,
      }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: T.textMuted, fontSize: 15 }}>
            {filterFavs ? 'Inga favoriter ännu.' : 'Inga namn hittades.'}
          </div>
        ) : (
          <>
            <div style={{ display: viewMode === 'grid' ? 'grid' : 'none', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '14px 16px' }}>
              {filtered.map(n => (
                <GridCard key={n.nr} name={n} onPress={() => { savedListScrollRef.current = listScrollRef.current?.scrollTop || 0; setSelected(n); }}
                  isFav={favs.has(n.nr)} onToggleFav={() => toggleFav(n.nr)} T={T} />
              ))}
            </div>
            <div style={{ display: viewMode === 'list' ? 'block' : 'none', paddingTop: 4 }}>
              {filtered.map(n => (
                <ListRow key={n.nr} name={n} onPress={() => { savedListScrollRef.current = listScrollRef.current?.scrollTop || 0; setSelected(n); }}
                  isFav={favs.has(n.nr)} onToggleFav={() => toggleFav(n.nr)} T={T} />
              ))}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}// ── List row — no play button, bigger text ──────────────────────────────
function ListRow({ name, onPress, isFav, onToggleFav, T }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: `1px solid ${T.border}`, background: T.card,
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <button
        onClick={onPress}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 0 14px 16px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent', minWidth: 0,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 18, flexShrink: 0,
          background: `${T.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums',
        }}>{name.nr}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
            {name.transliteration}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 400, marginTop: 3, lineHeight: 1.3 }}>
            {name.swedish}
          </div>
        </div>

        <div style={{
          fontSize: 30, color: T.text, lineHeight: 1,
          fontFamily: "'Scheherazade New','Traditional Arabic','Arial Unicode MS',serif",
          direction: 'rtl', flexShrink: 0, paddingRight: 8,
        }}>{name.arabic}</div>
      </button>

      <button
        onClick={onToggleFav}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 14px', color: isFav ? '#e53e3e' : T.textMuted,
          WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', flexShrink: 0,
        }}
      >
        <Heart filled={isFav} size={17} />
      </button>
    </div>
  );
}


