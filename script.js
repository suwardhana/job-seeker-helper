// Global variables
let selectedCategory = null;
let userToken = null;
let currentUser = null;

// API Configuration
const API_BASE = './backend'; // Adjust this path based on your setup

// Initialize app
init();

function init() {
  // Check if user is already logged in
  userToken = localStorage.getItem('userToken');
  currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  
  if (userToken && currentUser) {
    showApp();
    loadPortals();
  } else {
    showAuth();
  }
  
  setupEventListeners();
}

function setupEventListeners() {
  // Auth event listeners
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  document.getElementById('showRegister').addEventListener('click', showRegisterForm);
  document.getElementById('showLogin').addEventListener('click', showLoginForm);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  
  // App event listeners
  document.getElementById('addForm').addEventListener('submit', handleAddPortal);
  document.getElementById('refreshAll').addEventListener('click', handleRefreshAll);
  document.getElementById('searchForm').addEventListener('submit', handleSearch);
}

// Authentication functions
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      userToken = data.token;
      currentUser = data.user;
      localStorage.setItem('userToken', userToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      
      showApp();
      loadPortals();
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (error) {
    alert('Network error: ' + error.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('Registration successful! Please login.');
      showLoginForm();
      document.getElementById('loginEmail').value = email;
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (error) {
    alert('Network error: ' + error.message);
  }
}

function handleLogout() {
  userToken = null;
  currentUser = null;
  localStorage.removeItem('userToken');
  localStorage.removeItem('currentUser');
  showAuth();
}

function showAuth() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('appSection').style.display = 'none';
}

function showApp() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
}

function showRegisterForm() {
  document.getElementById('registerCard').style.display = 'block';
  document.querySelector('.auth-card:first-child').style.display = 'none';
}

function showLoginForm() {
  document.getElementById('registerCard').style.display = 'none';
  document.querySelector('.auth-card:first-child').style.display = 'block';
}

// API helper function
async function apiCall(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(userToken && { 'Authorization': `Bearer ${userToken}` })
    },
    ...options
  };
  
  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();
  
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, logout user
      handleLogout();
      return;
    }
    throw new Error(data.error || 'API call failed');
  }
  
  return data;
}

// Portal management functions
async function loadPortals() {
  try {
    const portals = await apiCall('/portals');
    renderCategories(portals);
  } catch (error) {
    console.error('Failed to load portals:', error);
    alert('Failed to load portals: ' + error.message);
  }
}

async function handleAddPortal(e) {
  e.preventDefault();
  const category = document.getElementById('category').value.trim();
  const link = document.getElementById('site_url').value.trim();
  
  if (!category || !link) return;
  
  try {
    await apiCall('/portals', {
      method: 'POST',
      body: JSON.stringify({ category, link })
    });
    
    document.getElementById('category').value = '';
    document.getElementById('site_url').value = '';
    
    loadPortals(); // Reload portals
  } catch (error) {
    alert('Failed to add portal: ' + error.message);
  }
}

async function editSite(id, currentUrl) {
  const newUrl = prompt('Edit site URL:', currentUrl);
  if (newUrl && newUrl.trim() !== currentUrl) {
    try {
      await apiCall(`/portals/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ link: newUrl.trim() })
      });
      
      loadPortals(); // Reload portals
    } catch (error) {
      alert('Failed to update portal: ' + error.message);
    }
  }
}

async function deleteSite(id) {
  if (confirm('Delete this site?')) {
    try {
      await apiCall(`/portals/${id}`, {
        method: 'DELETE'
      });
      
      loadPortals(); // Reload portals
    } catch (error) {
      alert('Failed to delete portal: ' + error.message);
    }
  }
}

async function handleRefreshAll() {
  if (confirm('This will delete all your portals. Are you sure?')) {
    try {
      // Get all portals and delete them
      const portals = await apiCall('/portals');
      for (const portal of portals) {
        await apiCall(`/portals/${portal.id}`, { method: 'DELETE' });
      }
      
      // Add some default portals
      const defaultPortals = [
        { category: 'QA', link: 'indeed.com' },
        { category: 'QA', link: 'linkedin.com' },
        { category: 'Dev', link: 'stackoverflow.com/jobs' },
        { category: 'Dev', link: 'github.com/jobs' }
      ];
      
      for (const portal of defaultPortals) {
        await apiCall('/portals', {
          method: 'POST',
          body: JSON.stringify(portal)
        });
      }
      
      loadPortals(); // Reload portals
    } catch (error) {
      alert('Failed to refresh portals: ' + error.message);
    }
  }
}

// Render functions
function renderCategories(portals) {
  const categories = [...new Set(portals.map(p => p.category))];
  const picker = document.getElementById('categoryPicker');
  picker.innerHTML = '';
  
  if (categories.length === 0) {
    picker.innerHTML = '<p>No categories found. Add some portals first.</p>';
    return;
  }
  
  categories.forEach(cat => {
    const id = `cat-${cat}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="category" value="${cat}" id="${id}"> ${cat}`;
    picker.appendChild(label);
  });
  
  picker.querySelectorAll('input[type=radio]').forEach(radio => {
    radio.addEventListener('change', e => {
      selectedCategory = e.target.value;
      renderSites(portals);
    });
  });
}

function renderSites(portals) {
  const list = document.getElementById('siteList');
  list.innerHTML = '';
  
  if (!selectedCategory) return;
  
  const categoryPortals = portals.filter(p => p.category === selectedCategory);
  
  if (categoryPortals.length === 0) {
    list.innerHTML = '<li>No sites in this category</li>';
    return;
  }
  
  categoryPortals.forEach(portal => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="site-url">${portal.link}</span>
      <button onclick="editSite(${portal.id}, '${portal.link}')">Edit</button>
      <button onclick="deleteSite(${portal.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

// Search logic
function handleSearch(e) {
  e.preventDefault();
  
  const keyword = document.getElementById('keyword').value.trim();
  const dateRange = document.getElementById('dateRange').value;
  const excludeHybrid = document.getElementById('excludeHybrid').checked;
  const excludeOnsite = document.getElementById('excludeOnsite').checked;
  
  if (!keyword) {
    alert('Please enter a keyword.');
    return;
  }
  if (!selectedCategory) {
    alert('Please select a category.');
    return;
  }
  
  // Get sites for selected category
  apiCall('/portals').then(portals => {
    const sites = portals
      .filter(p => p.category === selectedCategory)
      .map(p => p.link);
    
    const query = buildGoogleQuery({ 
      keyword, 
      dateRange, 
      sites, 
      excludeHybrid, 
      excludeOnsite 
    });
    
    showDebug(query);
    openGoogleSearch(query);
  }).catch(error => {
    alert('Failed to get portals for search: ' + error.message);
  });
}

function buildGoogleQuery({ keyword, dateRange, sites, excludeHybrid, excludeOnsite }) {
  const siteFilter = buildSiteFilter(sites);
  const afterDate = computeAfterDate(dateRange);
  
  let query = `${siteFilter} "${keyword}" after:${afterDate} Remote`;
  
  if (excludeHybrid) {
    query += ' -hybrid';
  }
  if (excludeOnsite) {
    query += ' -onsite';
  }
  
  return query;
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
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 31);
    return formatDate(monthAgo);
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