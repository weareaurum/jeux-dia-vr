// app.js
// Full client logic for Jeux Dia booking app
// Drop into your project (pair with the index.html + style.css shown earlier)

// ------------------------------
// Firebase & libs
// ------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, where, orderBy,
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// your Firebase config provided earlier
const firebaseConfig = {
  apiKey: "AIzaSyAi8oGnNplwn2-b_IP6jxLTU2o3WsbYy6w",
  authDomain: "jeux-dia.firebaseapp.com",
  projectId: "jeux-dia",
  storageBucket: "jeux-dia.firebasestorage.app",
  messagingSenderId: "402580184384",
  appId: "1:402580184384:web:9b0706ca7c5adb54bd2ea5",
  measurementId: "G-72VSLRWCR7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------
// Simple dynamic loader for Chart.js (only when needed)
// ------------------------------
async function loadChartJs() {
  if (window.Chart) return window.Chart;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ------------------------------
// DOM references (match index.html)
// ------------------------------
const googleSignInBtn = document.getElementById('googleSignIn');
const emailSignInBtn = document.getElementById('emailSignInBtn');
const emailModal = document.getElementById('emailModal');
const closeModalBtn = document.getElementById('closeModal');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailLoginBtn = document.getElementById('emailLogin');
const emailSignupBtn = document.getElementById('emailSignup');
const logoutBtn = document.getElementById('logoutBtn');

const navEl = document.getElementById('nav');
const tabButtons = document.querySelectorAll('#nav button[data-tab]');

const bookingTab = document.getElementById('booking');
const accountTab = document.getElementById('account');
const adminTab = document.getElementById('admin');

const bookingDate = document.getElementById('bookingDate');
const bookingTime = document.getElementById('bookingTime');
const peopleInput = document.getElementById('people');
const locationSelect = document.getElementById('location');
const addressInput = document.getElementById('address');
const totalPriceEl = document.getElementById('totalPrice');
const bookNowBtn = document.getElementById('bookNow');

const myBookingsList = document.getElementById('myBookings');

const adminContent = document.getElementById('adminContent');
const adminTabButton = document.getElementById('adminTab');

// ------------------------------
// App state & pricing
// ------------------------------
let currentUser = null;
let appliedDiscount = null; // { code, type, value, expiresAt }
let isAdmin = false;

const pricing = {
  hourly: 5000,    // base fee per hour (XOF)
  included: 3,     // people included
  extraFee: 2000,  // per extra person
  outsideFee: 10000 // one-time fee for outside events
};

// ------------------------------
// Helpers
// ------------------------------
function $(id){ return document.getElementById(id); }

function showTab(tabName) {
  // hide all tabs then show tabName
  [bookingTab, accountTab, adminTab].forEach(t => t.style.display = 'none');
  if (tabName === 'booking') bookingTab.style.display = 'block';
  if (tabName === 'account') accountTab.style.display = 'block';
  if (tabName === 'admin') adminTab.style.display = 'block';
}

// populate time select 09:00 - 22:00
function populateTimes() {
  bookingTime.innerHTML = '';
  for (let h=9; h<=22; h++) {
    const hh = String(h).padStart(2,'0') + ':00';
    const opt = document.createElement('option');
    opt.value = hh; opt.textContent = hh;
    bookingTime.appendChild(opt);
  }
}
populateTimes();

// calculate total (single-hour booking assumed by this UI)
function calculateTotal() {
  const people = Number(peopleInput.value || 1);
  const location = locationSelect.value === 'external' ? 'Outside' : 'On-site';
  let total = pricing.hourly;
  if (people > pricing.included) total += (people - pricing.included) * pricing.extraFee;
  if (location === 'Outside') total += pricing.outsideFee;
  if (appliedDiscount) {
    if (appliedDiscount.type === 'percent') total = Math.round(total * (1 - appliedDiscount.value / 100));
    else total = Math.max(0, total - appliedDiscount.value);
  }
  totalPriceEl.textContent = `Total: ${total.toLocaleString()} XOF`;
  return total;
}
peopleInput.addEventListener('input', calculateTotal);
locationSelect.addEventListener('change', ()=>{
  addressInput.style.display = locationSelect.value === 'external' ? 'inline-block' : 'none';
  calculateTotal();
});

// ------------------------------
// Auth flows
// ------------------------------
googleSignInBtn.addEventListener('click', async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert('Google sign-in failed: ' + e.message);
  }
});

emailSignInBtn.addEventListener('click', () => {
  // show modal
  emailModal.style.display = 'block';
});
closeModalBtn?.addEventListener('click', () => { emailModal.style.display = 'none'; });

emailLoginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const pass = passwordInput.value;
  if (!email || !pass) return alert('Enter email & password');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    emailModal.style.display = 'none';
  } catch (e) {
    alert('Sign-in error: ' + e.message);
  }
});

emailSignupBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const pass = passwordInput.value;
  if (!email || !pass) return alert('Enter email & password');
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    emailModal.style.display = 'none';
    alert('Account created and signed in.');
  } catch (e) {
    alert('Sign-up error: ' + e.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// show/hide nav & set active tab button handlers
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-tab');
    showTab(t);
  });
});

// ------------------------------
// After auth state changes
// ------------------------------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    // show nav & account tab
    navEl.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    googleSignInBtn.style.display = 'none';
    emailSignInBtn.style.display = 'none';
    // set default tab to booking
    showTab('booking');

    // check admin doc
    try {
      const adminDocSnap = await getDoc(doc(db, 'admins', user.uid));
      isAdmin = adminDocSnap.exists() && adminDocSnap.data().admin === true;
      adminTabButton.style.display = isAdmin ? 'inline-block' : 'none';
    } catch (e) {
      console.warn('admin check failed', e);
      isAdmin = false;
      adminTabButton.style.display = 'none';
    }

    // load user's bookings
    await loadMyBookings();

    // if admin, preload admin UI
    if (isAdmin) {
      setupAdminNav();
      // optionally pre-load bookings
    }

  } else {
    // signed out
    navEl.style.display = 'none';
    logoutBtn.style.display = 'none';
    googleSignInBtn.style.display = 'inline-block';
    emailSignInBtn.style.display = 'inline-block';
    adminTabButton.style.display = 'none';
    showTab('booking');
    myBookingsList.innerHTML = '';
    adminContent.innerHTML = '';
  }
});

// ------------------------------
// Booking creation
// ------------------------------
bookNowBtn.addEventListener('click', async () => {
  if (!currentUser) return alert('Please sign in first');
  const date = bookingDate.value;
  const time = bookingTime.value;
  const people = Number(peopleInput.value || 1);
  const locationVal = locationSelect.value === 'external' ? 'Outside' : 'On-site';
  const address = addressInput.value.trim() || '';
  if (!date || !time) return alert('Select date and time');

  // availability check (simple occupancy check)
  const available = await checkSlotAvailability(date, time, people);
  if (!available.ok) {
    return alert(`Not enough capacity. Used: ${available.used}/${available.capacity}`);
  }

  const total = calculateTotal();

  const booking = {
    userId: currentUser.uid,
    email: currentUser.email,
    name: currentUser.displayName || '',
    date, time, people, location: locationVal, address,
    discountCode: appliedDiscount ? appliedDiscount.code : null,
    total,
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'bookings'), booking);
    alert('Booking saved, total: ' + total.toLocaleString() + ' XOF');
    await loadMyBookings();
  } catch (e) {
    alert('Booking save failed: ' + e.message);
  }
});

// simple availability checker
async function checkSlotAvailability(date, time, players) {
  // capacity assumption: 20 total seats (adjust as needed)
  const capacity = 20;
  const q = query(collection(db, 'bookings'), where('date', '==', date), where('time', '==', time));
  const snap = await getDocs(q);
  let used = 0;
  snap.forEach(d => used += (d.data().people || 1));
  return { ok: (capacity - used) >= players, used, capacity };
}

// ------------------------------
// Load user's bookings (must use query where userId == auth.currentUser.uid)
// ------------------------------
async function loadMyBookings(){
  if (!currentUser) return;
  const q = query(collection(db, 'bookings'), where('userId', '==', currentUser.uid), orderBy('date'));
  try {
    const snap = await getDocs(q);
    myBookingsList.innerHTML = '';
    if (snap.empty) { myBookingsList.innerHTML = '<li>No bookings yet</li>'; return; }
    snap.forEach(d => {
      const b = d.data();
      const li = document.createElement('li');
      li.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${b.date} ${b.time}</strong><br/>
            ${b.people} people • ${b.location} ${b.address ? ' • ' + b.address : ''}<br/>
            <small>${(b.total||0).toLocaleString()} XOF</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button data-edit-id="${d.id}">Edit</button>
            <button data-cancel-id="${d.id}">Cancel</button>
          </div>
        </div>
      `;
      myBookingsList.appendChild(li);
    });

    // wire edit & cancel buttons
    myBookingsList.querySelectorAll('button[data-cancel-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-cancel-id');
        if (!confirm('Cancel this booking?')) return;
        try {
          await deleteDoc(doc(db, 'bookings', id));
          alert('Canceled');
          await loadMyBookings();
        } catch (e) {
          alert('Cancel failed: ' + e.message);
        }
      });
    });

    myBookingsList.querySelectorAll('button[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit-id');
        // simple edit flow: ask for new date/time/people using prompts (replace with modal for nicer UX)
        const newDate = prompt('New date (YYYY-MM-DD):');
        if (!newDate) return;
        const newTime = prompt('New time (HH:MM):');
        if (!newTime) return;
        const newPeople = Number(prompt('Number of people:'));
        if (!newPeople) return;
        const updated = {
          date: newDate,
          time: newTime,
          people: newPeople,
          total: calculateTotalFor(newPeople, /*location*/ 'On-site'),
          updatedAt: serverTimestamp()
        };
        try {
          await updateDoc(doc(db, 'bookings', id), updated);
          alert('Booking updated');
          await loadMyBookings();
        } catch (e) {
          alert('Update failed: ' + e.message);
        }
      });
    });

  } catch (e) {
    console.error(e);
    alert('Failed to load bookings: ' + e.message);
  }
}

function calculateTotalFor(people, location) {
  let total = pricing.hourly;
  if (people > pricing.included) total += (people - pricing.included) * pricing.extraFee;
  if (location === 'Outside') total += pricing.outsideFee;
  if (appliedDiscount) {
    if (appliedDiscount.type === 'percent') total = Math.round(total * (1 - appliedDiscount.value / 100));
    else total = Math.max(0, total - appliedDiscount.value);
  }
  return total;
}

// ------------------------------
// Discounts quick lookup (client-side apply) - reads discounts collection
// ------------------------------
async function applyDiscountCode(code) {
  if (!code) { appliedDiscount = null; return false; }
  const q = query(collection(db, 'discounts'), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  let found = null;
  snap.forEach(d => {
    const v = d.data();
    // accepts if no expiresAt or date in future
    if (!v.expiresAt || new Date(v.expiresAt) > new Date()) found = { id: d.id, ...v };
  });
  appliedDiscount = found;
  return !!found;
}

// Expose a quick handler (in case you add an input to apply discounts)
window.applyDiscountCode = applyDiscountCode;

// ------------------------------
// ADMIN: Setup admin nav & actions
// ------------------------------
function setupAdminNav() {
  // render small admin menu (you may attach to existing admin tab)
  adminContent.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="adminBookingsBtn">Bookings</button>
      <button id="adminCustomersBtn">Customers</button>
      <button id="adminDiscountsBtn">Discounts</button>
      <button id="adminReportsBtn">Reports</button>
    </div>
    <div id="adminMain" style="margin-top:10px"></div>
  `;
  document.getElementById('adminBookingsBtn').addEventListener('click', loadAdminBookings);
  document.getElementById('adminCustomersBtn').addEventListener('click', loadAdminCustomers);
  document.getElementById('adminDiscountsBtn').addEventListener('click', loadAdminDiscounts);
  document.getElementById('adminReportsBtn').addEventListener('click', loadAdminReports);
  // default
  loadAdminBookings();
}

// Admin: list all bookings (admins allowed to list per our rules)
async function loadAdminBookings() {
  const adminMain = document.getElementById('adminMain');
  adminMain.innerHTML = '<div>Loading bookings...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), orderBy('date')));
    if (snap.empty) { adminMain.innerHTML = '<div>No bookings</div>'; return; }
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr><th>Date</th><th>Time</th><th>People</th><th>Location</th><th>Total</th><th>User</th><th>Actions</th></tr></thead><tbody>';
    snap.forEach(d => {
      const b = d.data();
      html += `<tr>
        <td>${b.date}</td>
        <td>${b.time}</td>
        <td>${b.people}</td>
        <td>${b.location}</td>
        <td>${(b.total||0).toLocaleString()} XOF</td>
        <td>${b.email || ''}</td>
        <td>
          <button data-edit="${d.id}">Edit</button>
          <button data-delete="${d.id}">Delete</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    adminMain.innerHTML = html;

    adminMain.querySelectorAll('button[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (!confirm('Delete booking?')) return;
        await deleteDoc(doc(db, 'bookings', id));
        loadAdminBookings();
      });
    });

    adminMain.querySelectorAll('button[data-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit');
        const s = await getDoc(doc(db, 'bookings', id));
        if (!s.exists()) return alert('Not found');
        const b = s.data();
        const newDate = prompt('New date (YYYY-MM-DD):', b.date);
        if (!newDate) return;
        const newTime = prompt('New time (HH:MM):', b.time);
        if (!newTime) return;
        const newPeople = Number(prompt('People:', b.people));
        if (!newPeople) return;
        const payload = {
          date: newDate,
          time: newTime,
          people: newPeople,
          total: calculateTotalFor(newPeople, b.location),
          updatedAt: serverTimestamp()
        };
        await updateDoc(doc(db, 'bookings', id), payload);
        alert('Updated');
        loadAdminBookings();
      });
    });

  } catch (e) {
    adminMain.innerHTML = '<div>Error loading bookings: ' + e.message + '</div>';
  }
}

// Admin: customers aggregation
async function loadAdminCustomers(){
  const adminMain = document.getElementById('adminMain');
  adminMain.innerHTML = '<div>Loading customers...</div>';
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    const map = new Map();
    snap.forEach(d => {
      const v = d.data();
      const email = v.email || 'unknown';
      if (!map.has(email)) map.set(email, { email, name: v.name || '', bookings: 0, spent: 0 });
      const rec = map.get(email);
      rec.bookings += 1;
      rec.spent += Number(v.total || 0);
    });
    let html = '<table style="width:100%"><thead><tr><th>Email</th><th>Name</th><th>Bookings</th><th>Spent (XOF)</th></tr></thead><tbody>';
    Array.from(map.values()).forEach(c => {
      html += `<tr><td>${c.email}</td><td>${c.name}</td><td>${c.bookings}</td><td>${c.spent.toLocaleString()}</td></tr>`;
    });
    html += '</tbody></table>';
    adminMain.innerHTML = html;
  } catch (e) {
    adminMain.innerHTML = '<div>Error: ' + e.message + '</div>';
  }
}

// Admin: discounts (CRUD)
async function loadAdminDiscounts(){
  const adminMain = document.getElementById('adminMain');
  adminMain.innerHTML = `<div>
    <div style="display:flex;gap:8px">
      <input id="dCode" placeholder="CODE" />
      <select id="dType"><option value="percent">percent</option><option value="flat">flat</option></select>
      <input id="dValue" placeholder="value" />
      <input id="dExpires" type="date" />
      <button id="dCreate">Create</button>
    </div>
    <div id="dList" style="margin-top:10px">Loading...</div>
  </div>`;
  document.getElementById('dCreate').addEventListener('click', async () => {
    const code = (document.getElementById('dCode').value || '').trim().toUpperCase();
    const type = document.getElementById('dType').value;
    const value = Number(document.getElementById('dValue').value);
    const expires = document.getElementById('dExpires').value || null;
    if (!code || !value) return alert('code & value required');
    await addDoc(collection(db,'discounts'), { code, type, value, expiresAt: expires, createdAt: serverTimestamp() });
    loadAdminDiscounts();
  });

  // list existing
  try {
    const snap = await getDocs(query(collection(db, 'discounts'), orderBy('code')));
    const listEl = document.getElementById('dList');
    if (snap.empty) { listEl.innerHTML = '<div>No discounts</div>'; return; }
    let html = '<table style="width:100%"><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Expires</th><th>Actions</th></tr></thead><tbody>';
    snap.forEach(d => {
      const v = d.data();
      html += `<tr data-id="${d.id}"><td>${v.code}</td><td>${v.type}</td><td>${v.value}</td><td>${v.expiresAt||''}</td>
        <td><button data-edit="${d.id}">Edit</button><button data-del="${d.id}">Delete</button></td></tr>`;
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;
    listEl.querySelectorAll('button[data-del]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-del');
        if (!confirm('Delete discount?')) return;
        await deleteDoc(doc(db,'discounts', id));
        loadAdminDiscounts();
      });
    });
    listEl.querySelectorAll('button[data-edit]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-edit');
        const snap = await getDoc(doc(db,'discounts', id));
        if (!snap.exists()) return alert('Not found');
        const v = snap.data();
        const newVal = prompt('New value', v.value);
        if (newVal === null) return;
        await updateDoc(doc(db,'discounts', id), { value: Number(newVal) });
        loadAdminDiscounts();
      });
    });
  } catch (e) {
    console.error(e); document.getElementById('dList').innerHTML = 'Error: ' + e.message;
  }
}

// Admin reports: filters, charts, filtered export (CSV)
async function loadAdminReports(){
  const adminMain = document.getElementById('adminMain');
  adminMain.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input id="rStart" type="date" /><input id="rEnd" type="date" />
      <select id="rLocation"><option value="all">All</option><option>On-site</option><option>Outside</option></select>
      <button id="rApply">Apply</button>
      <button id="rExport">Export CSV</button>
    </div>
    <div style="margin-top:8px"><strong>Bookings:</strong> <span id="rCount">0</span> &nbsp; <strong>Revenue:</strong> <span id="rRev">0</span> XOF</div>
    <div style="margin-top:12px"><canvas id="reportDate"></canvas></div>
    <div style="margin-top:6px"><canvas id="reportTime"></canvas></div>
    <div style="margin-top:6px;display:flex;gap:8px"><canvas id="reportLoc" style="flex:1"></canvas><canvas id="reportRev" style="flex:1"></canvas></div>
  `;
  // fetch bookings
  const snap = await getDocs(query(collection(db,'bookings'), orderBy('date')));
  const all = []; snap.forEach(d=> all.push({ id:d.id, ...d.data() }));

  function applyAndRender(){
    const start = document.getElementById('rStart').value;
    const end = document.getElementById('rEnd').value;
    const loc = document.getElementById('rLocation').value;
    const filtered = all.filter(b => {
      if (start && b.date < start) return false;
      if (end && b.date > end) return false;
      if (loc !== 'all' && b.location !== loc) return false;
      return true;
    });
    document.getElementById('rCount').textContent = filtered.length;
    const revenue = filtered.reduce((s, n) => s + (Number(n.total)||0), 0);
    document.getElementById('rRev').textContent = revenue.toLocaleString();

    // chart data
    const byDate = {}, byTime = {}, revByDate = {}, locCount = { 'On-site':0, 'Outside':0 };
    filtered.forEach(b=>{
      byDate[b.date] = (byDate[b.date]||0) + 1;
      byTime[b.time] = (byTime[b.time]||0) + 1;
      revByDate[b.date] = (revByDate[b.date]||0) + (Number(b.total)||0);
      locCount[b.location] = (locCount[b.location]||0) + 1;
    });

    renderChart('reportDate','line', Object.keys(byDate), Object.values(byDate));
    renderChart('reportTime','bar', Object.keys(byTime), Object.values(byTime));
    renderChart('reportLoc','pie', Object.keys(locCount), Object.values(locCount));
    renderChart('reportRev','line', Object.keys(revByDate), Object.values(revByDate));

    // export CSV bind
    document.getElementById('rExport').onclick = () => {
      const csvRows = [];
      const headers = ['id','date','time','people','location','email','total'];
      csvRows.push(headers.join(','));
      filtered.forEach(r => {
        csvRows.push([r.id, r.date, r.time, r.people, `"${(r.location||'')}"`, r.email || '', r.total || 0].join(','));
      });
      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `jeuxdia_reports_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    };
  }

  document.getElementById('rApply').addEventListener('click', applyAndRender);

  // renderChart wrapper that ensures Chart.js is loaded
  async function renderChart(id,type, labels, data){
    await loadChartJs();
    const ctx = document.getElementById(id).getContext('2d');
    // reuse existing chart if present
    if (window._charts && window._charts[id]) window._charts[id].destroy();
    window._charts = window._charts || {};
    window._charts[id] = new Chart(ctx, {
      type,
      data: { labels, datasets: [{ label: id, data, backgroundColor: ['#00ffcc','#6600ff','#33cc33','#ff9933'] }] },
      options: { responsive:true, plugins:{legend:{labels:{color:'#fff'}}}, scales:{ x:{ ticks:{color:'#fff'} }, y:{ ticks:{color:'#fff'} } } }
    });
  }

  // initial
  applyAndRender();
}

// ------------------------------
// small init
// ------------------------------
showTab('booking');
calculateTotal();

// expose some helpers for debugging in console
window.jeux = {
  auth, db, calculateTotal, applyDiscountCode, loadMyBookings
};
