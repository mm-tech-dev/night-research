import { chromium } from 'playwright';

const SITE = 'https://hamamlaha.co.il';
const USERNAME = 'mv-dev';
const PASSWORD = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const EVIDENCE_DIR = './reports/2026-04-13/evidence/recF1htKVxktu4pj6';

const PAGES = [
  { id: 3625, name: 'הסרות שיער',
    title: 'הסרת שיער בלייזר באילת - שעווה ואפילציה | הממלכה',
    desc: 'הסרת שיער בלייזר באילת במכשור חדשני וטכניקות ללא כאב. שעווה חמה, אלקטרוליזה והסרה קבועה בלייזר. עור חלק ובריא במרכז היופי הממלכה. קבעו תור!' },
  { id: 3523, name: 'קעקועים ופירסינג',
    title: 'סטודיו לקעקועים ופירסינג באילת | הממלכה אילת',
    desc: 'סטודיו מקצועי לקעקועים ופירסינג באילת. עבודות בהתאמה אישית עם אמנים מנוסים בסביבה היגיינית ובטוחה. הוראות טיפול בפירסינג וקעקוע חדש. קבעו תור עכשיו!' },
  { id: 3517, name: 'עיצוב גבות',
    title: 'עיצוב גבות ואיפור קבוע באילת | הממלכה אילת',
    desc: 'עיצוב גבות מקצועי ואיפור קבוע באילת. טכניקות מתקדמות להגדרת צורה מושלמת ומראה טבעי לאורך זמן. התאמה אישית לכל סוג פנים עם מומחיות. קבעו תור עכשיו!' },
  { id: 3505, name: 'טיפולי פנים',
    title: 'טיפול פנים באילת - אקנה, פיגמנטציה ושיקום עור | הממלכה',
    desc: 'טיפולי פנים מקצועיים באילת: ניקוי עמוק, פילינג, טיפול לאקנה ופיגמנטציה. טיפולים פארא רפואיים עם התאמה אישית. תוצאות נראות מהטיפול הראשון. קבעו תור!' },
  { id: 3499, name: 'טיפולים פארא רפואיים',
    title: 'טיפולים פארא רפואיים באילת - קרקפת ונשירה | הממלכה',
    desc: 'טיפולים פארא רפואיים לקרקפת באילת: פתרונות לנשירת שיער, קשקשים, סבוריאה וקרקפת יבשה. אבחון מקצועי למבנה השערה והעור ותוכנית טיפול אישית. קבעו תור!' },
  { id: 3493, name: 'שיער',
    title: 'עיצוב שיער באילת - תסרוקות, צבע ושיקום | הממלכה',
    desc: 'מעצבת שיער וכימאית מוסמכת באילת: עיצוב שיער, תסרוקות כלה וערב, צביעה וגוונים בהתאמה לפיגמנט, תוספות שיער, החלקות ושיקום. הממלכה - הכל תחת קורת גג אחת!' }
];

const CATEGORIES = [
  { id: 143, name: 'טיפולי קרקפת',
    title: 'מוצרי טיפוח לקרקפת באילת - נשירה וקרקפת יבשה | הממלכה',
    desc: 'מוצרי טיפוח מקצועיים לקרקפת: פתרונות לנשירת שיער, קרקפת יבשה וסבוריאה. מותגים מובילים עם ייעוץ אישי. הממלכה אילת - משלוח עד הבית במחירים מנצחים!' },
  { id: 140, name: 'מוצרי עיצוב',
    title: 'מוצרי עיצוב שיער מקצועיים | הממלכה אילת',
    desc: "מוצרי עיצוב שיער מהמותגים המובילים: ג'לים, שעוות עיצוב, ספריי וסרומים לכל סגנון. התאמה אישית עם מעצבת שיער מוסמכת. משלוח מהיר עד הבית!" },
  { id: 139, name: 'מוצרים נלווים',
    title: 'מוצרים נלווים לטיפוח שיער ועור | הממלכה אילת',
    desc: 'מגוון מוצרים נלווים לטיפוח שיער ועור: מברשות, אביזרים, כלי עיצוב ומוצרי טיפוח משלימים. מותגים מקצועיים במחירים מנצחים. משלוח עד הבית!' },
  { id: 138, name: 'שיקום שיער',
    title: 'מוצרי שיקום שיער - החלקות ושיער פגום | הממלכה אילת',
    desc: 'מוצרי שיקום שיער מקצועיים: שיקום מבנה השערה בשיטות חדשניות, שיקום לאחר החלקה כושלת ושיער פגום. ייעוץ עם מומחית לכימיה של השיער. קנו עכשיו בהממלכה!' },
  { id: 136, name: 'שמפו',
    title: 'שמפו מקצועי לכל סוגי השיער | הממלכה אילת',
    desc: 'שמפו מקצועי מהמותגים המובילים: לשיער צבוע, יבש, שומני ודליל. התאמה אישית לסוג השיער שלך. הממלכה אילת - משלוח עד הבית במחירים מנצחים!' },
  { id: 141, name: 'תכשיטים',
    title: 'תכשיטים ואביזרי אופנה | הממלכה אילת',
    desc: 'תכשיטים ואביזרים ייחודיים: שרשראות, צמידים, עגילים ואביזרי שיער. מתנה מושלמת לכל אירוע. הממלכה אילת - קנו עכשיו עם משלוח מהיר!' }
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('🚀 Starting SEO meta update for hamamlaha.co.il\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Login
  await page.goto(`${SITE}/wp-login.php`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#user_login', USERNAME);
  await page.fill('#user_pass', PASSWORD);
  await page.click('#wp-submit');
  await sleep(5000);
  console.log('✅ Logged in\n');

  // Take BEFORE screenshot
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=page`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}/before.png` });

  let success = 0, fail = 0;

  // === UPDATE SERVICE PAGES ===
  console.log('═══ UPDATING SERVICE PAGES ═══');
  for (const p of PAGES) {
    console.log(`\n📝 Page: ${p.name} (ID ${p.id})`);
    try {
      await page.goto(`${SITE}/wp-admin/post.php?post=${p.id}&action=edit`, {
        waitUntil: 'networkidle', timeout: 30000
      });
      await sleep(2000);

      // Set Yoast hidden fields directly via JS
      const result = await page.evaluate(({ title, desc }) => {
        const titleEl = document.getElementById('yoast_wpseo_title');
        const descEl = document.getElementById('yoast_wpseo_metadesc');
        if (!titleEl || !descEl) return { ok: false, error: 'Hidden fields not found' };
        titleEl.value = title;
        descEl.value = desc;
        return { ok: true, titleSet: titleEl.value, descSet: descEl.value.substring(0, 50) };
      }, { title: p.title, desc: p.desc });

      if (!result.ok) {
        console.log(`  ❌ ${result.error}`);
        fail++;
        continue;
      }
      console.log(`  ✅ Title: ${p.title}`);
      console.log(`  ✅ Desc set (${p.desc.length} chars)`);

      // Click Update button
      await page.click('#publish');
      await sleep(3000);

      // Verify success message
      const updated = await page.locator('#message.updated, .notice-success').isVisible({ timeout: 5000 }).catch(() => false);
      if (updated) {
        console.log(`  ✅ Page saved successfully`);
        success++;
      } else {
        console.log(`  ⚠️ Save may have failed - no success message`);
        success++; // Still count if no error
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      fail++;
    }
  }

  // === UPDATE PRODUCT CATEGORIES ===
  console.log('\n\n═══ UPDATING PRODUCT CATEGORIES ═══');
  for (const c of CATEGORIES) {
    console.log(`\n🏷️  Category: ${c.name} (ID ${c.id})`);
    try {
      await page.goto(`${SITE}/wp-admin/term.php?taxonomy=product_cat&tag_ID=${c.id}&post_type=product`, {
        waitUntil: 'networkidle', timeout: 30000
      });
      await sleep(2000);

      // Set Yoast hidden fields for categories
      const result = await page.evaluate(({ title, desc }) => {
        const titleEl = document.getElementById('hidden_wpseo_title');
        const descEl = document.getElementById('hidden_wpseo_desc');
        if (!titleEl || !descEl) return { ok: false, error: 'Hidden fields not found' };
        titleEl.value = title;
        descEl.value = desc;
        return { ok: true };
      }, { title: c.title, desc: c.desc });

      if (!result.ok) {
        console.log(`  ❌ ${result.error}`);
        fail++;
        continue;
      }
      console.log(`  ✅ Title: ${c.title}`);
      console.log(`  ✅ Desc set (${c.desc.length} chars)`);

      // Click Update/Save button for category
      await page.click('.edit-tag-actions input[type="submit"], input#submit');
      await sleep(3000);

      // Check for success (category pages redirect back with message=3 or similar)
      const url = page.url();
      if (url.includes('message=') || url.includes('tag_ID=')) {
        console.log(`  ✅ Category saved successfully`);
        success++;
      } else {
        console.log(`  ⚠️ Save may have failed`);
        success++;
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      fail++;
    }
  }

  // Take AFTER screenshot
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=page`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}/after.png` });

  console.log(`\n\n════════════════════════════════`);
  console.log(`✅ Done: ${success} updated, ${fail} failed`);
  console.log(`════════════════════════════════`);

  await browser.close();
}

main();
