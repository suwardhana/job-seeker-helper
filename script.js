let db;
let selectedCategory = null;

// Dummy JSON data
const dummyData = [
  { category: "early startup", site_url: "builtin.com/jobs" },
  { category: "early startup", site_url: "dover.com" },
  { category: "early startup", site_url: "careerpuck.com" },
  { category: "early startup", site_url: "recruiterbox.com" },
  { category: "early startup", site_url: "recruiting.paylocity.com" },
  // { category: "early startup", site_url: "remoterocketship.com" },
  { category: "early startup", site_url: "rippling-ats.com" },
  { category: "early startup", site_url: "wellfound.com" },
  { category: "early startup", site_url: "workatastartup.com" },
  { category: "early startup", site_url: "jobscore.com" },
  { category: "ATS", site_url: "bamboohr.com" },
  { category: "ATS", site_url: "breezy.hr" },
  { category: "ATS", site_url: "greenhouse.io" },
  { category: "ATS", site_url: "jazzhr.com" },
  { category: "ATS", site_url: "lever.co" },
  { category: "ATS", site_url: "jobs.workable.com" },
  { category: "ATS", site_url: "recruitee.com" },
  { category: "ATS", site_url: "hireology.com" },
  { category: "ATS", site_url: "applicantpro.com" },
  { category: "ATS", site_url: "homerun.co" }
];


init();
function saveDb() {
  const data = db.export(); // Uint8Array
  const base64 = btoa(String.fromCharCode(...data));
  localStorage.setItem("jobPortalsDB", base64);
}

function loadDb(SQL) {
  const saved = localStorage.getItem("jobPortalsDB");
  if (saved) {
    const binary = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
    return new SQL.Database(binary);
  } else {
    return new SQL.Database();
  }
}

async function init() {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}`
  });

  // Load from localStorage if available
  db = loadDb(SQL);

  db.run(`CREATE TABLE IF NOT EXISTS portals (
    category TEXT,
    site_url TEXT
  )`);

  // Seed dummy data only if table is empty
  const res = db.exec("SELECT COUNT(*) FROM portals");
  if (res.length === 0 || res[0].values[0][0] === 0) {
    dummyData.forEach(item => {
      db.run("INSERT INTO portals (category, site_url) VALUES (?, ?)", [item.category, item.site_url]);
    });
    saveDb();
  }

  renderCategories();
}


// Add new portal
document.getElementById('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const category = document.getElementById('category').value.trim();
  const site_url = document.getElementById('site_url').value.trim();
  if (!category || !site_url) return;

  db.run("INSERT INTO portals (category, site_url) VALUES (?, ?)", [category, site_url]);
  saveDb();
  document.getElementById('category').value = '';
  document.getElementById('site_url').value = '';

  renderCategories();
});

// Render categories
function renderCategories() {
  const res = db.exec("SELECT DISTINCT category FROM portals");
  const picker = document.getElementById('categoryPicker');
  picker.innerHTML = '';

  if (res.length === 0) return;

  const categories = res[0].values.map(row => row[0]);

  categories.forEach(cat => {
    const id = `cat-${cat}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="category" value="${cat}" id="${id}"> ${cat}`;
    picker.appendChild(label);
  });

  picker.querySelectorAll('input[type=radio]').forEach(radio => {
    radio.addEventListener('change', e => {
      selectedCategory = e.target.value;
      renderSites();
    });
  });
}

// Render sites for selected category
function renderSites() {
  const list = document.getElementById('siteList');
  list.innerHTML = '';

  if (!selectedCategory) return;

  const res = db.exec("SELECT site_url FROM portals WHERE category = ?", [selectedCategory]);
  if (res.length === 0) return;

  res[0].values.forEach(row => {
    const li = document.createElement('li');
    li.textContent = row[0];
    list.appendChild(li);
  });
}

// --- Search logic ---
document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const keyword = document.getElementById('keyword').value.trim();
  const dateRange = document.getElementById('dateRange').value;

  if (!keyword) {
    alert('Please enter a keyword.');
    return;
  }
  if (!selectedCategory) {
    alert('Please select a category.');
    return;
  }

  const query = buildGoogleQuery({ keyword, dateRange, category: selectedCategory });
  showDebug(query);
  openGoogleSearch(query);
});

function buildGoogleQuery({ keyword, dateRange, category }) {
  const res = db.exec("SELECT site_url FROM portals WHERE category = ?", [category]);
  const sites = res.length > 0 ? res[0].values.map(row => row[0]) : [];
  const siteFilter = buildSiteFilter(sites);
  const afterDate = computeAfterDate(dateRange);

  return `${siteFilter} "${keyword}" after:${afterDate} Remote`;
}

function buildSiteFilter(domains) {
  if (!domains || domains.length === 0) return '';
  const parts = domains.map(d => `site:${d}`);
  return `(${parts.join(' OR ')})`;
}

function computeAfterDate(range) {
  const now = new Date();

  if (range === 'today') {
    return formatDate(now);
  }

  if (range === 'this-week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return formatDate(weekAgo);
  }

  if (range === 'this-month') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return formatDate(firstOfMonth);
  }

  return formatDate(now);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openGoogleSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showDebug(query) {
  const el = document.getElementById('debug');
  el.textContent = `Generated query:\n${query}`;
  el.classList.add('active');
}
