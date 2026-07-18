const SUPABASE_URL = 'https://blsifieeeuxnzonhrduh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsc2lmaWVlZXV4bnpvbmhyZHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjc3OTAsImV4cCI6MjA5OTk0Mzc5MH0.tGQjYbK0bRpskejR1WMt46Vnd2qEJMmaUMGFnpPuPaQ';
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyorZUeWvNVqAbBExfOTrHd9jBE56eOz0wdvDHuKBWXcncYYYH_o8Bu3yLcKOl8_scR/exec';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function money(n) {
  n = Number(n) || 0;
  return 'KES ' + n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : '--';
}

function toast(message, type = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function gasFetch(action, payload = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify({ action, token: session ? session.access_token : null, ...payload })
  });

  const text = await res.text();
  
  try {
    const json = JSON.parse(text);
    if (!json.success) throw new Error(json.message || 'Unknown error');
    return json.data;
  } catch (e) {
    console.error("Server Error Response:", text);
    throw new Error('Server error: ' + text.substring(0, 50)); 
  }
}

async function getCurrentProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) return null;
  return data;
}

async function requireProfile(expectedRole) {
  const profile = await getCurrentProfile();
  if (!profile) { window.location.href = 'index.html'; return null; }
  if (expectedRole && profile.role !== expectedRole) {
    window.location.href = profile.role === 'treasurer' ? 'treasurer.html' : 'member.html';
    return null;
  }
  return profile;
}

function initials(name) {
  return (name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

/* ---------- Login page ---------- */

async function initLoginPage() {
  // Wire everything up FIRST, synchronously — so if the session check below
  // throws (bad Supabase URL/key, network hiccup, etc.) the login buttons
  // still work. Previously the wiring ran after two awaited calls, so an
  // early failure there silently prevented the buttons from ever working.
  wireLoginPageButtons();
  loadLandingStats();

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const profile = await getCurrentProfile();
      if (profile) {
        window.location.href = profile.role === 'treasurer' ? 'treasurer.html' : 'member.html';
      }
    }
  } catch (e) {
    console.log('Session check failed, staying on login page', e);
  }
}

function wireLoginPageButtons() {
  document.getElementById('member-login-nav').onclick = () => openLoginDialog('member');
  document.getElementById('treasurer-login-nav').onclick = () => openLoginDialog('treasurer');
  document.getElementById('member-login-hero').onclick = () => openLoginDialog('member');
  document.getElementById('treasurer-login-hero').onclick = () => openLoginDialog('treasurer');
  document.getElementById('login-dialog-close').onclick = closeLoginDialog;
  document.getElementById('portal-opt-member').onclick = () => selectPortalType('member');
  document.getElementById('portal-opt-treasurer').onclick = () => selectPortalType('treasurer');
  document.getElementById('login-form').onsubmit = handleLogin;

  // Click on the backdrop (outside the card) closes the dialog too.
  const dialog = document.getElementById('login-dialog');
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeLoginDialog();
  });
}

function openLoginDialog(portalType) {
  selectPortalType(portalType);
  document.getElementById('login-dialog').showModal();
}

function closeLoginDialog() {
  document.getElementById('login-dialog').close();
}

async function loadLandingStats() {
  // Server computes avgReturn now — client just displays it.
  try {
    const stats = await gasFetch('getLandingStats');
    document.getElementById('stat-pool').textContent = formatPool(stats.totalPool);
    document.getElementById('stat-members').textContent = stats.activeMembers || 0;
    document.getElementById('stat-return').textContent = stats.avgReturn + '%';
  } catch (e) {
    console.log('Stats unavailable', e);
  }
}

function formatPool(n) {
  if (n >= 1000000) return 'KSh ' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'KSh ' + (n / 1000).toFixed(1) + 'K';
  return 'KSh ' + n.toLocaleString();
}

function selectPortalType(type) {
  document.getElementById('portal-opt-member').classList.toggle('selected', type === 'member');
  document.getElementById('portal-opt-treasurer').classList.toggle('selected', type === 'treasurer');
  document.getElementById('login-form').dataset.portalType = type;
  document.getElementById('login-subtitle').textContent = type === 'treasurer'
    ? 'Treasurer access — full platform view'
    : 'Sign in to your member account';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await getCurrentProfile();
    if (!profile) throw new Error('No profile found for this account');
    toast(`Welcome back, ${profile.name}!`, 'success');
    window.location.href = profile.role === 'treasurer' ? 'treasurer.html' : 'member.html';
  } catch (err) {
    toast(err.message || 'Invalid credentials', 'error');
    btn.disabled = false;
    btn.textContent = 'Sign In →';
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

/* ---------- Shared shell wiring ---------- */

function wireSidebar(profile) {
  document.getElementById('sidebar-user-name').textContent = profile.name;
  document.getElementById('sidebar-user-email').textContent = profile.email;
  document.getElementById('sidebar-user-avatar').textContent = initials(profile.name);
  document.getElementById('sidebar-logout').onclick = handleLogout;

  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.onclick = () => setActiveTab(item.dataset.tab);
  });
}

function setActiveTab(tabId) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.toggle('hidden', el.id !== `tab-${tabId}`));
  if (tabId === 'member-dashboard') renderMemberDashboard();
  if (tabId === 'member-contributions') renderMemberContributions();
  if (tabId === 'member-loans') renderMemberLoans();
  if (tabId === 'member-payments') renderMemberPayments();
  if (tabId === 'treasurer-dashboard') renderTreasurerDashboard();
  if (tabId === 'treasurer-members') renderTreasurerMembers();
  if (tabId === 'treasurer-contributions') renderTreasurerContributions();
  if (tabId === 'treasurer-loans') renderTreasurerLoans();
  if (tabId === 'treasurer-investments') renderTreasurerInvestments();
}

/* ---------- Member portal ---------- */

let memberState = { profile: null, contributions: [], loans: [], payments: [], summary: {}, loanRoom: {} };

async function initMemberPortal() {
  const profile = await requireProfile('member');
  if (!profile) return;
  memberState.profile = profile;
  wireSidebar(profile);

  document.getElementById('btn-make-contribution').onclick = openContributionPrompt;
  document.getElementById('btn-request-loan').onclick = () => openModal('loan-request-modal');
  document.getElementById('loan-request-form').onsubmit = submitLoanRequest;
  document.getElementById('profile-settings-form').onsubmit = saveMemberProfile;

  await loadMemberData();
  setActiveTab('member-dashboard');
}

async function loadMemberData() {
  // All loan math (interest, penalty, balance, grace/overdue status) now comes
  // pre-computed from the Apps Script backend — nothing to calculate here.
  const data = await gasFetch('getMemberPortalData');
  memberState.profile = data.profile;
  memberState.contributions = data.contributions || [];
  memberState.loans = data.loans || [];
  memberState.payments = data.payments || [];
  memberState.summary = data.summary || {};
  memberState.loanRoom = data.loan_room || {};
}

function renderMemberDashboard() {
  const { profile, loans, contributions, summary } = memberState;
  const activeLoans = loans.filter(l => l.status === 'active');

  document.getElementById('member-welcome-name').textContent = profile.name.split(' ')[0];
  document.getElementById('m-stat-contrib').textContent = money(summary.total_contributions);
  document.getElementById('m-stat-earnings').textContent = money(profile.total_profit_share);
  document.getElementById('m-stat-loans').textContent = activeLoans.length;
  document.getElementById('m-stat-loans-out').textContent = money(summary.active_loan_balance) + ' outstanding';
  document.getElementById('m-stat-net').textContent = money(summary.net_position);

  const recentBody = document.getElementById('m-recent-contrib-body');
  recentBody.innerHTML = contributions.slice(0, 5).map(c => `
    <tr><td>${fmtDate(c.date)}</td><td class="amount">${money(c.amount)}</td><td><span class="badge info">${c.payment_method}</span></td></tr>
  `).join('') || emptyRow(3, 'No contributions yet');
}

function renderMemberContributions() {
  const body = document.getElementById('m-contrib-full-body');
  body.innerHTML = memberState.contributions.map(c => `
    <tr>
      <td>${fmtDate(c.date)}</td>
      <td class="mono text-muted text-sm">${c.mpesa_receipt || c.transaction_id || '—'}</td>
      <td class="amount">${money(c.amount)}</td>
      <td><span class="badge info">${c.payment_method}</span></td>
      <td><span class="badge success">✓ Completed</span></td>
    </tr>
  `).join('') || emptyRow(5, 'No contributions recorded yet');
  document.getElementById('m-contrib-total').textContent = money(memberState.contributions.reduce((s, c) => s + Number(c.amount), 0));
  document.getElementById('m-contrib-count').textContent = memberState.contributions.length;
}

function renderMemberLoans() {
  const body = document.getElementById('m-loans-body');
  body.innerHTML = memberState.loans.map(loan => `
    <tr class="${loan.is_overdue ? 'overdue-row' : ''}">
      <td>${fmtDate(loan.date)}</td>
      <td class="amount">${money(loan.original_amount)}</td>
      <td class="amount">${loan.interest > 0 ? money(loan.interest) : '—'}</td>
      <td class="amount fw-700">${loan.status === 'repaid' ? money(0) : money(loan.balance)}</td>
      <td>${fmtDate(loan.due_date)}</td>
      <td><span class="badge ${loan.status_class}">${loan.status_text}</span></td>
      <td>${loan.status === 'active' ? `<button class="btn btn-emerald btn-sm" onclick="handleLoanRepayPrompt('${loan.id}')"><i class="fas fa-money-bill-wave"></i> Repay</button>` : ''}</td>
    </tr>`).join('') || emptyRow(7, 'No loans yet');
}

function renderMemberPayments() {
  const body = document.getElementById('m-payments-body');
  body.innerHTML = memberState.payments.map(p => `
    <tr>
      <td>${new Date(p.created_at).toLocaleString()}</td>
      <td>${p.type === 'contribution' ? '💰 Contribution' : '🏦 Loan Repayment'}</td>
      <td class="mono text-muted text-sm">${p.transaction_id || '—'}</td>
      <td class="amount">${money(p.amount)}</td>
      <td><span class="badge ${p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}">${p.status}</span></td>
    </tr>
  `).join('') || emptyRow(5, 'No payment history yet');
}

function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}"><div class="empty-state"><div class="icon">📋</div><div class="text">${text}</div></div></td></tr>`;
}

async function openContributionPrompt() {
  const amount = prompt('Enter contribution amount (KES):', '1000');
  if (!amount || isNaN(amount) || Number(amount) < 10) {
    if (amount) toast('Please enter a valid amount (minimum KES 10)', 'error');
    return;
  }
  await initiateStkPush('contribution', Number(amount), null);
}

async function handleLoanRepayPrompt(loanId) {
  const loan = memberState.loans.find(l => l.id === loanId);
  const remaining = loan.balance;
  const amount = prompt(`Enter repayment amount (Balance: ${money(remaining)}):`, remaining);
  if (!amount || isNaN(amount) || Number(amount) < 10) return;
  if (Number(amount) > remaining) { toast(`Exceeds remaining balance of ${money(remaining)}`, 'error'); return; }
  await initiateStkPush('loan_repayment', Number(amount), loanId);
}

async function initiateStkPush(type, amount, relatedId) {
  if (!memberState.profile.mpesa_number) {
    toast('Please set your M-Pesa number in Settings first', 'error');
    setActiveTab('member-settings');
    return;
  }
  try {
    toast('Sending M-Pesa prompt to your phone...', 'info');
    await gasFetch('stkPush', {
      phoneNumber: memberState.profile.mpesa_number,
      amount, type, relatedId, memberId: memberState.profile.id
    });
    toast('Check your phone for the M-Pesa prompt.', 'success');
    setTimeout(async () => { await loadMemberData(); setActiveTab(document.querySelector('.nav-item.active').dataset.tab); }, 6000);
  } catch (err) {
    toast(err.message || 'Failed to initiate payment', 'error');
  }
}

async function submitLoanRequest(e) {
  e.preventDefault();
  const amount = Number(document.getElementById('loan-amount').value);
  const purpose = document.getElementById('loan-purpose').value;
  const duration = Number(document.getElementById('loan-duration').value);
  try {
    await gasFetch('createLoan', { memberId: memberState.profile.id, amount, purpose, duration });
    toast('Loan request submitted! Awaiting treasurer approval.', 'success');
    closeModal('loan-request-modal');
    await loadMemberData();
    renderMemberLoans();
  } catch (err) {
    toast(err.message || 'Failed to submit loan request', 'error');
  }
}

async function saveMemberProfile(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('profile-name').value,
    phone: document.getElementById('profile-phone').value,
    mpesaNumber: document.getElementById('profile-mpesa').value
  };
  try {
    // Routed through GAS (updateOwnProfile) so no table write happens directly
    // from the browser — the service-role key never leaves the server.
    const updated = await gasFetch('updateOwnProfile', payload);
    memberState.profile = updated;
    toast('Profile updated successfully!', 'success');
    document.getElementById('sidebar-user-name').textContent = updated.name;
  } catch (err) {
    toast(err.message || 'Failed to update profile', 'error');
  }
}

/* ---------- Treasurer portal ---------- */

let treasurerState = { profile: null, members: [], contributions: [], loans: [], investments: [], groupTotals: {} };

async function initTreasurerPortal() {
  const profile = await requireProfile('treasurer');
  if (!profile) return;
  treasurerState.profile = profile;
  wireSidebar(profile);

  document.getElementById('btn-add-member').onclick = () => openMemberModal(null);
  document.getElementById('btn-add-member-2').onclick = () => openMemberModal(null);
  document.getElementById('member-form').onsubmit = submitMemberForm;
  document.getElementById('btn-record-contribution').onclick = () => openModal('contribution-modal');
  document.getElementById('btn-record-contribution-2').onclick = () => openModal('contribution-modal');
  document.getElementById('contribution-form').onsubmit = submitContributionForm;
  document.getElementById('btn-new-loan').onclick = () => openModal('loan-modal');
  document.getElementById('btn-new-loan-2').onclick = () => openModal('loan-modal');
  document.getElementById('loan-form').onsubmit = submitLoanForm;
  document.getElementById('btn-add-investment').onclick = () => openModal('investment-modal');
  document.getElementById('investment-form').onsubmit = submitInvestmentForm;
  document.getElementById('treasurer-profile-settings-form').onsubmit = saveTreasurerProfile;

  await loadTreasurerData();
  setActiveTab('treasurer-dashboard');
}

async function loadTreasurerData() {
  // Member outstanding balances, net amounts, loan decoration, and group
  // totals are all computed server-side now — just store what comes back.
  const data = await gasFetch('getTreasurerPortalData');
  treasurerState.members = data.members || [];
  treasurerState.contributions = data.contributions || [];
  treasurerState.loans = data.loans || [];
  treasurerState.investments = data.investments || [];
  treasurerState.groupTotals = data.group_totals || {};
}

function renderTreasurerDashboard() {
  const t = treasurerState.groupTotals;
  document.getElementById('t-stat-net').textContent = money(t.net_amount);
  document.getElementById('t-stat-equity').textContent = money(t.total_equity);
  document.getElementById('t-stat-equity-sub').textContent = `${t.active_members} members`;
  document.getElementById('t-stat-invested').textContent = money(t.total_invested);
  document.getElementById('t-stat-profit').textContent = money(t.total_profit);
  document.getElementById('t-stat-loans').textContent = t.active_loans;
  document.getElementById('t-stat-loans-out').textContent = money(t.total_outstanding) + ' outstanding';

  const pendingBanner = document.getElementById('t-pending-banner');
  pendingBanner.classList.toggle('hidden', t.pending_loans === 0);
  pendingBanner.querySelector('span').textContent = `${t.pending_loans} loan request(s) awaiting approval.`;

  document.getElementById('t-nav-badge-loans').textContent = t.pending_loans;
  document.getElementById('t-nav-badge-loans').classList.toggle('hidden', t.pending_loans === 0);

  const recentBody = document.getElementById('t-recent-contrib-body');
  recentBody.innerHTML = treasurerState.contributions.slice(0, 5).map(c => `
    <tr><td>${c.member_name}</td><td class="amount">${money(c.amount)}</td><td>${fmtDate(c.date)}</td></tr>
  `).join('') || emptyRow(3, 'No contributions yet');
}

function renderTreasurerMembers() {
  const body = document.getElementById('t-members-body');
  body.innerHTML = treasurerState.members.map(m => `
    <tr style="${m.is_active === false ? 'opacity:0.55;background:var(--canvas)' : ''}">
      <td><div class="fw-700">${m.name}</div><div class="text-muted text-sm">${m.email}</div></td>
      <td><div>${m.phone || '--'}</div><div class="text-muted text-sm">${m.mpesa_number || 'No M-Pesa'}</div></td>
      <td class="amount">${money(m.total_contributions)}</td>
      <td class="amount">${m.outstanding_balance > 0 ? `<span class="text-danger">${money(m.outstanding_balance)}</span>` : '<span class="text-muted">--</span>'}</td>
      <td class="amount" style="color:var(--emerald)">${money(m.total_profit_share)}</td>
      <td class="amount fw-700">${money(m.net_amount)}</td>
      <td><span class="badge ${m.is_active !== false ? 'success' : 'danger'}">${m.is_active !== false ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-sm" onclick="openMemberModal('${m.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="toggleMemberActive('${m.id}', ${m.is_active !== false})"><i class="fas fa-user-${m.is_active !== false ? 'slash' : 'check'}"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="deleteMember('${m.id}', ${JSON.stringify(m.name)})" title="Permanently delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('') || emptyRow(8, 'No members yet');
  document.getElementById('t-members-count').textContent = treasurerState.members.filter(m => m.is_active !== false).length;
}

function renderTreasurerContributions() {
  const body = document.getElementById('t-contrib-body');
  body.innerHTML = treasurerState.contributions.map(c => `
    <tr>
      <td>${fmtDate(c.date)}</td>
      <td>${c.member_name}</td>
      <td class="amount">${money(c.amount)}</td>
      <td><span class="badge info">${c.payment_method}</span></td>
      <td class="mono text-muted text-sm">${c.transaction_id || '--'}</td>
    </tr>
  `).join('') || emptyRow(5, 'No contributions yet');
  document.getElementById('t-contrib-total').textContent = money(treasurerState.contributions.reduce((s, c) => s + Number(c.amount), 0));
}

function renderTreasurerLoans() {
  const body = document.getElementById('t-loans-body');
  body.innerHTML = treasurerState.loans.map(loan => `
    <tr class="${loan.is_overdue ? 'overdue-row' : ''}">
      <td>${fmtDate(loan.date)}</td>
      <td>${loan.member_name}</td>
      <td class="amount">${money(loan.original_amount)}</td>
      <td>${loan.interest_rate}%</td>
      <td class="amount">${money(loan.balance)}</td>
      <td>${fmtDate(loan.due_date)}</td>
      <td><span class="badge ${loan.status_class}">${loan.status_text}</span></td>
      <td>
        ${loan.status === 'pending' ? `<button class="btn btn-gold btn-sm" onclick="approveLoan('${loan.id}')"><i class="fas fa-check"></i> Approve</button>` : ''}
        ${loan.status === 'active' ? `<button class="btn btn-emerald btn-sm" onclick="recordLoanRepayment('${loan.id}')"><i class="fas fa-money-bill-wave"></i> Pay</button>` : ''}
      </td>
    </tr>`).join('') || emptyRow(8, 'No loans yet');
}

function renderTreasurerInvestments() {
  const grid = document.getElementById('t-investments-grid');
  grid.innerHTML = treasurerState.investments.map(inv => {
    const roi = inv.amount > 0 ? ((inv.total_profit / inv.amount) * 100).toFixed(2) : '0.00';
    return `
      <div class="investment-card">
        <div class="investment-header">
          <div><h3>${inv.name}</h3><div class="investment-meta">${inv.category} · ${fmtDate(inv.date)}</div></div>
          <span class="badge ${inv.status === 'active' ? 'gold' : 'danger'}">${inv.status === 'closed' ? '🔒 Closed' : inv.status}</span>
        </div>
        <div class="investment-stats">
          <div><span class="text-muted text-sm">Total In</span><br><strong>${money(inv.amount)}</strong></div>
          <div><span class="text-muted text-sm">Profit</span><br><strong style="color:var(--emerald)">${money(inv.total_profit)}</strong></div>
          <div><span class="text-muted text-sm">ROI</span><br><strong>${roi}%</strong></div>
        </div>
        <div class="investment-actions">
          <button class="btn btn-emerald btn-sm" onclick="recordInvestmentProfit('${inv.id}')"><i class="fas fa-coins"></i> Record Profit</button>
        </div>
      </div>`;
  }).join('') || emptyRow(1, 'No investments yet');
}

function openMemberModal(memberId) {
  const form = document.getElementById('member-form');
  form.reset();
  form.dataset.editingId = memberId || '';
  document.getElementById('member-modal-title').textContent = memberId ? 'Edit Member' : 'Add New Member';
  document.getElementById('member-password-group').classList.toggle('hidden', !!memberId);
  if (memberId) {
    const m = treasurerState.members.find(x => x.id === memberId);
    document.getElementById('member-name').value = m.name;
    document.getElementById('member-email').value = m.email;
    document.getElementById('member-phone').value = m.phone || '';
    document.getElementById('member-mpesa').value = m.mpesa_number || '';
  }
  openModal('member-modal');
}

async function submitMemberForm(e) {
  e.preventDefault();
  const editingId = e.target.dataset.editingId;
  const payload = {
    name: document.getElementById('member-name').value,
    email: document.getElementById('member-email').value,
    phone: document.getElementById('member-phone').value,
    mpesaNumber: document.getElementById('member-mpesa').value
  };
  try {
    if (editingId) {
      await gasFetch('updateMember', { memberId: editingId, ...payload });
      toast('Member updated', 'success');
    } else {
      payload.password = document.getElementById('member-password').value;
      await gasFetch('createMember', payload);
      toast('Member created successfully', 'success');
    }
    closeModal('member-modal');
    await loadTreasurerData();
    renderTreasurerMembers();
  } catch (err) {
    toast(err.message || 'Failed to save member', 'error');
  }
}

async function toggleMemberActive(memberId, currentlyActive) {
  const label = currentlyActive ? 'Deactivate' : 'Restore';
  if (!confirm(`${label} this member?`)) return;
  try {
    // Routed through GAS (setMemberActive) instead of a direct Supabase write,
    // so the treasurer-only check on the server actually applies.
    await gasFetch('setMemberActive', { memberId, isActive: !currentlyActive });
    await loadTreasurerData();
    renderTreasurerMembers();
    toast(`Member ${currentlyActive ? 'deactivated' : 'restored'}`, 'success');
  } catch (err) {
    toast(err.message || 'Failed to update member', 'error');
  }
}

async function deleteMember(memberId, memberName) {
  // Permanent — deleting the auth user cascades to the profile row and
  // everything tied to it (contributions, loans, repayments, etc). If the
  // member has any real history, deactivating (the button next to this one)
  // is almost always the better choice.
  const confirmed = confirm(
    `Permanently delete ${memberName}?\n\nThis erases their login AND all of their contribution/loan/payment history. This cannot be undone.\n\nClick OK to permanently delete.`
  );
  if (!confirmed) return;
  try {
    await gasFetch('deleteMember', { memberId });
    toast('Member permanently deleted', 'success');
    await loadTreasurerData();
    renderTreasurerMembers();
  } catch (err) {
    toast(err.message || 'Failed to delete member', 'error');
  }
}

async function submitContributionForm(e) {
  e.preventDefault();
  const payload = {
    memberId: document.getElementById('contrib-member').value,
    amount: Number(document.getElementById('contrib-amount').value),
    paymentMethod: document.getElementById('contrib-method').value,
    transactionId: document.getElementById('contrib-reference').value,
    date: document.getElementById('contrib-date').value
  };
  try {
    await gasFetch('recordContribution', payload);
    toast('Contribution recorded', 'success');
    closeModal('contribution-modal');
    await loadTreasurerData();
    renderTreasurerContributions();
    renderTreasurerDashboard();
  } catch (err) {
    toast(err.message || 'Failed to record contribution', 'error');
  }
}

function populateMemberSelects() {
  const options = treasurerState.members.filter(m => m.is_active !== false)
    .map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  ['contrib-member', 'loan-member'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select member</option>' + options;
  });
}

async function submitLoanForm(e) {
  e.preventDefault();
  const payload = {
    memberId: document.getElementById('loan-member').value,
    amount: Number(document.getElementById('loan-amount-treasurer').value),
    duration: Number(document.getElementById('loan-duration-treasurer').value),
    purpose: document.getElementById('loan-purpose-treasurer').value,
    date: document.getElementById('loan-date-treasurer').value,
    autoApprove: true
  };
  try {
    await gasFetch('createLoan', payload);
    toast('Loan created', 'success');
    closeModal('loan-modal');
    await loadTreasurerData();
    renderTreasurerLoans();
    renderTreasurerDashboard();
  } catch (err) {
    toast(err.message || 'Failed to create loan', 'error');
  }
}

async function approveLoan(loanId) {
  try {
    await gasFetch('approveLoan', { loanId });
    toast('Loan approved', 'success');
    await loadTreasurerData();
    renderTreasurerLoans();
    renderTreasurerDashboard();
  } catch (err) {
    toast(err.message || 'Failed to approve loan', 'error');
  }
}

async function recordLoanRepayment(loanId) {
  const loan = treasurerState.loans.find(l => l.id === loanId);
  const remaining = loan.balance;
  const amount = prompt(`Record payment for ${loan.member_name} (Balance: ${money(remaining)}):`, remaining);
  if (!amount || isNaN(amount) || Number(amount) < 1) return;
  try {
    await gasFetch('recordLoanRepayment', { loanId, amountPaid: Number(amount), paymentMethod: 'cash' });
    toast('Repayment recorded', 'success');
    await loadTreasurerData();
    renderTreasurerLoans();
    renderTreasurerDashboard();
  } catch (err) {
    toast(err.message || 'Failed to record repayment', 'error');
  }
}

async function submitInvestmentForm(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('invest-name').value,
    category: document.getElementById('invest-category').value,
    description: document.getElementById('invest-description').value
  };
  try {
    await gasFetch('createInvestment', payload);
    toast('Investment created', 'success');
    closeModal('investment-modal');
    await loadTreasurerData();
    renderTreasurerInvestments();
  } catch (err) {
    toast(err.message || 'Failed to create investment', 'error');
  }
}

async function recordInvestmentProfit(investmentId) {
  const amount = prompt('Profit amount to record and distribute (KES):');
  if (!amount || isNaN(amount) || Number(amount) < 1) return;
  try {
    await gasFetch('recordInvestmentProfit', { investmentId, amount: Number(amount), date: new Date().toISOString().split('T')[0] });
    toast('Profit recorded and distributed to members!', 'success');
    await loadTreasurerData();
    renderTreasurerInvestments();
  } catch (err) {
    toast(err.message || 'Failed to record profit', 'error');
  }
}

async function saveTreasurerProfile(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('t-profile-name').value,
    phone: document.getElementById('t-profile-phone').value,
    // This form has no M-Pesa field, but actionUpdateOwnProfile always sets
    // mpesa_number from payload.mpesaNumber. Pass the existing value through
    // so saving name/phone doesn't silently wipe it to null.
    mpesaNumber: treasurerState.profile.mpesa_number || null
  };
  try {
    const updated = await gasFetch('updateOwnProfile', payload);
    treasurerState.profile = updated;
    toast('Profile updated successfully!', 'success');
    document.getElementById('sidebar-user-name').textContent = updated.name;
  } catch (err) {
    toast(err.message || 'Failed to update profile', 'error');
  }
}

/* ---------- Modal helpers ---------- */

function openModal(id) {
  if (id === 'contribution-modal' || id === 'loan-modal') populateMemberSelects();
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}