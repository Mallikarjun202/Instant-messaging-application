// ─── State ────────────────────────────────────────────────────────────────────
let stompClient        = null;
let CURRENT_USER_ID    = null;
let CURRENT_USERNAME   = null;
let ACTIVE_RECEIVER_ID = null;
let ACTIVE_GROUP_ID    = null;
let pingInterval       = null;
let reconnectTimer     = null;
let unreadDM           = {};   // { userId: count }
let unreadGroup        = {};   // { groupId: count }
let groupNameCache     = {};   // { groupId: name }
let notifPermission    = false;
let typingTimer        = null;
let isTyping           = false;
let typingTimeouts     = {};
let replyingTo         = null; // { content, sender }
let lastMsgTimeDM      = {};   // { userId: timestamp ms }
let lastMsgTimeGroup   = {};   // { groupId: timestamp ms }
let lastMsgPreviewDM   = {};   // { userId: preview string }
let lastMsgPreviewGroup= {};   // { groupId: preview string }

// ─── Pin / Mute (persisted in localStorage) ───────────────────────────────────
let pinnedDM    = JSON.parse(localStorage.getItem('pinnedDM')    || '[]');
let pinnedGroup = JSON.parse(localStorage.getItem('pinnedGroup') || '[]');
let mutedDM     = JSON.parse(localStorage.getItem('mutedDM')     || '[]');
let mutedGroup  = JSON.parse(localStorage.getItem('mutedGroup')  || '[]');

function savePinMute() {
  localStorage.setItem('pinnedDM',    JSON.stringify(pinnedDM));
  localStorage.setItem('pinnedGroup', JSON.stringify(pinnedGroup));
  localStorage.setItem('mutedDM',     JSON.stringify(mutedDM));
  localStorage.setItem('mutedGroup',  JSON.stringify(mutedGroup));
}

function togglePinDM(userId, e) {
  e && e.stopPropagation();
  const idx = pinnedDM.indexOf(userId);
  if (idx === -1) pinnedDM.push(userId); else pinnedDM.splice(idx, 1);
  savePinMute(); loadSidebar();
}

function togglePinGroup(groupId, e) {
  e && e.stopPropagation();
  const idx = pinnedGroup.indexOf(groupId);
  if (idx === -1) pinnedGroup.push(groupId); else pinnedGroup.splice(idx, 1);
  savePinMute(); loadSidebar();
}

function toggleMuteDM(userId, e) {
  e && e.stopPropagation();
  const idx = mutedDM.indexOf(userId);
  if (idx === -1) mutedDM.push(userId); else mutedDM.splice(idx, 1);
  savePinMute(); loadSidebar();
}

function toggleMuteGroup(groupId, e) {
  e && e.stopPropagation();
  const idx = mutedGroup.indexOf(groupId);
  if (idx === -1) mutedGroup.push(groupId); else mutedGroup.splice(idx, 1);
  savePinMute(); loadSidebar();
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const messagesDiv      = document.getElementById('messagesDiv');
const messageInput     = document.getElementById('messageInput');
const sendButton       = document.getElementById('sendButton');
const statusBadge      = document.getElementById('connectionStatus');
const conversationList = document.getElementById('conversationList');
const chatArea         = document.getElementById('chatArea');
const emptyState       = document.getElementById('emptyState');
const emojiBtn         = document.getElementById('emojiBtn');
const emojiPicker      = document.getElementById('emojiPicker');
const searchInput      = document.getElementById('searchInput');
const chatName         = document.getElementById('chatName');
const chatAvatar       = document.getElementById('chatAvatar');
const chatStatus       = document.getElementById('chatStatus');
const charCounter      = document.getElementById('charCounter');
const typingIndicator  = document.getElementById('typingIndicator');
const replyBar         = document.getElementById('replyBar');
const replyText        = document.getElementById('replyText');
const cancelReply      = document.getElementById('cancelReply');
const memberPanel      = document.getElementById('memberPanel');
const memberPanelList  = document.getElementById('memberPanelList');
const msgSearchBar     = document.getElementById('msgSearchBar');
const msgSearchInput   = document.getElementById('msgSearchInput');
const msgSearchClose   = document.getElementById('msgSearchClose');
const searchMsgBtn     = document.getElementById('searchMsgBtn');

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CHARS = 2000; //  matches server limit in MessageController

// ─── Notification sound ───────────────────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { /* ignore */ }
}

// ─── Browser notification ─────────────────────────────────────────────────────
function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    notifPermission = true;
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { notifPermission = p === 'granted'; });
  }
}

function sendBrowserNotif(title, body) {
  if (!notifPermission || document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'chat-notif' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { /* ignore */ }
}

// ─── Page title unread count ──────────────────────────────────────────────────
function updatePageTitle() {
  const total = Object.values(unreadDM).reduce((a, b) => a + b, 0)
              + Object.values(unreadGroup).reduce((a, b) => a + b, 0);
  document.title = total > 0 ? `(${total}) Chat App` : 'Chat App';
}

// ─── Profile menu ─────────────────────────────────────────────────────────────
function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
  document.getElementById('chatMenu')?.classList.add('hidden');
}

// ─── Mark all as read ─────────────────────────────────────────────────────────
function markAllAsRead() {
  unreadDM    = {};
  unreadGroup = {};
  updatePageTitle();
  loadSidebar();
  document.getElementById('profileMenu')?.classList.add('hidden');
}

// ─── Chat header ⋮ menu ───────────────────────────────────────────────────────
function toggleChatMenu() {
  const menu = document.getElementById('chatMenu');
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  document.getElementById('profileMenu')?.classList.add('hidden');

  if (isHidden) {
    const isDM    = ACTIVE_RECEIVER_ID !== null;
    const isGroup = ACTIVE_GROUP_ID    !== null;
    if (!isDM && !isGroup) return;

    const isPinned = isDM ? pinnedDM.includes(ACTIVE_RECEIVER_ID) : pinnedGroup.includes(ACTIVE_GROUP_ID);
    const isMuted  = isDM ? mutedDM.includes(ACTIVE_RECEIVER_ID) : mutedGroup.includes(ACTIVE_GROUP_ID);

    menu.innerHTML = `
      <button onclick="openMsgSearch(); toggleChatMenu()">
        <span class="ctx-icon">🔍</span> Search messages
      </button>
      ${isGroup ? `<button onclick="toggleMemberPanel(); toggleChatMenu()">
        <span class="ctx-icon">👥</span> View members
      </button>` : ''}
      <div class="ctx-divider"></div>
      <button onclick="chatMenuPin()">
        <span class="ctx-icon">📌</span> ${isPinned ? 'Unpin' : 'Pin'} chat
      </button>
      <button onclick="chatMenuMute()">
        <span class="ctx-icon">${isMuted ? '🔔' : '🔕'}</span>
        ${isMuted ? 'Unmute' : 'Mute'} notifications
      </button>
      <div class="ctx-divider"></div>
      <button class="danger" onclick="chatMenuClear()">
        <span class="ctx-icon">🗑️</span> Clear chat
      </button>
    `;
    menu.classList.remove('hidden');
  } else {
    menu.classList.add('hidden');
  }
}

function chatMenuPin() {
  if (ACTIVE_RECEIVER_ID) togglePinDM(ACTIVE_RECEIVER_ID);
  else if (ACTIVE_GROUP_ID) togglePinGroup(ACTIVE_GROUP_ID);
  document.getElementById('chatMenu')?.classList.add('hidden');
}

function chatMenuMute() {
  if (ACTIVE_RECEIVER_ID) toggleMuteDM(ACTIVE_RECEIVER_ID);
  else if (ACTIVE_GROUP_ID) toggleMuteGroup(ACTIVE_GROUP_ID);
  document.getElementById('chatMenu')?.classList.add('hidden');
}

const clearedChats = { dm: new Set(), group: new Set() };

function chatMenuClear() {
  document.getElementById('chatMenu')?.classList.add('hidden');
  showConfirmModal(
    '🗑️ Clear chat',
    'Clears messages from view. They reload next time you open this chat.',
    'Clear',
    () => {
      if (ACTIVE_RECEIVER_ID) {
        clearedChats.dm.add(ACTIVE_RECEIVER_ID);
        delete lastMsgPreviewDM[ACTIVE_RECEIVER_ID];
        delete lastMsgTimeDM[ACTIVE_RECEIVER_ID];
      } else if (ACTIVE_GROUP_ID) {
        clearedChats.group.add(ACTIVE_GROUP_ID);
        delete lastMsgPreviewGroup[ACTIVE_GROUP_ID];
        delete lastMsgTimeGroup[ACTIVE_GROUP_ID];
      }
      messagesDiv.innerHTML = '';
      messagesDiv.classList.remove('messages-empty');
    }
  );
}

function showConfirmModal(title, message, confirmLabel, onConfirm) {
  document.getElementById('confirmModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmModal';
  overlay.className = 'confirm-modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal-box">
      <div class="confirm-modal-title">${escapeHtml(title)}</div>
      <div class="confirm-modal-msg">${escapeHtml(message)}</div>
      <div class="confirm-modal-actions">
        <button class="confirm-modal-cancel">Cancel</button>
        <button class="confirm-modal-confirm danger">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.confirm-modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.confirm-modal-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Close menus on outside click
document.addEventListener('click', e => {
  const profileMenu = document.getElementById('profileMenu');
  const profileBtn  = document.getElementById('profileMenuBtn');
  if (profileMenu && !profileMenu.classList.contains('hidden') &&
      !profileMenu.contains(e.target) && !profileBtn?.contains(e.target)) {
    profileMenu.classList.add('hidden');
  }
  const chatMenu = document.getElementById('chatMenu');
  const chatBtn  = document.getElementById('chatMenuBtn');
  if (chatMenu && !chatMenu.classList.contains('hidden') &&
      !chatMenu.contains(e.target) && !chatBtn?.contains(e.target)) {
    chatMenu.classList.add('hidden');
  }
});

// ─── Theme ────────────────────────────────────────────────────────────────────
(function applyStoredTheme() {
  if (localStorage.getItem('theme') === 'light') applyLightTheme();
})();

function applyLightTheme() {
  document.documentElement.setAttribute('data-theme', 'light');
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon)  icon.textContent  = '🌙';
  if (label) label.textContent = 'Dark mode';
}

function applyDarkTheme() {
  document.documentElement.removeAttribute('data-theme');
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon)  icon.textContent  = '☀️';
  if (label) label.textContent = 'Light mode';
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) { applyDarkTheme(); localStorage.setItem('theme', 'dark'); }
  else          { applyLightTheme(); localStorage.setItem('theme', 'light'); }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.onload = function () {
  requestNotifPermission();
  fetch('/api/me')
    .then(r => { if (!r.ok) throw new Error('unauth'); return r.json(); })
    .then(data => {
      CURRENT_USER_ID  = data.id;
      CURRENT_USERNAME = data.username;
      const initial    = data.username[0].toUpperCase();

      document.getElementById('myUsername').textContent        = data.username;
      document.getElementById('myAvatar').textContent          = initial;
      document.getElementById('profileMenuAvatar').textContent = initial;
      document.getElementById('profileMenuUsername').textContent = data.username;

      connect();
      loadSidebar();
      setInterval(loadSidebar, 15000);
    })
    .catch(() => { window.location = '/login.html'; });
};

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const socket = new SockJS('/ws');
  stompClient = Stomp.over(socket);
  stompClient.debug = null;
  stompClient.connect({}, onConnected, onError);
}

function onConnected() {
  statusBadge.textContent = 'connected';
  statusBadge.className   = 'connected';
  sendButton.disabled     = false;

  stompClient.subscribe('/user/queue/messages', function (msg) {
    const payload  = JSON.parse(msg.body);
    const isMine   = Number(payload.senderId) === Number(CURRENT_USER_ID);
    const senderId = Number(payload.senderId);
    const inActive = isMine ? ACTIVE_RECEIVER_ID !== null : senderId === ACTIVE_RECEIVER_ID;

    if (inActive) {
      appendMessage(payload.content, isMine ? 'sent' : 'received',
        isMine ? 'You' : payload.senderUsername, payload.timestamp,
        null, payload.id || null, payload.read || false);
      clearTypingIndicator(payload.senderUsername);
    } else if (!isMine) {
      unreadDM[senderId] = (unreadDM[senderId] || 0) + 1;
      updatePageTitle();
      if (!mutedDM.includes(senderId)) {
        playNotifSound();
        showToast(`💬 ${payload.senderUsername}`, payload.content);
        sendBrowserNotif(`💬 ${payload.senderUsername}`, payload.content);
      }
    }

    const dmKey = isMine ? Number(ACTIVE_RECEIVER_ID) : senderId;
    if (dmKey) {
      lastMsgTimeDM[dmKey]    = Date.now();
      lastMsgPreviewDM[dmKey] = (isMine ? 'You: ' : '') + payload.content;
    }
    loadSidebar();
  });

  stompClient.subscribe('/user/queue/group-messages', function (msg) {
    const payload = JSON.parse(msg.body);
    const isMine  = Number(payload.senderId) === Number(CURRENT_USER_ID);
    const gid     = Number(payload.groupId);

    if (gid === ACTIVE_GROUP_ID) {
      appendMessage(payload.content, isMine ? 'sent' : 'received',
        isMine ? 'You' : payload.senderUsername, payload.timestamp,
        null, payload.id || null, payload.read || false);
      clearTypingIndicator(payload.senderUsername);
    } else if (!isMine) {
      unreadGroup[gid] = (unreadGroup[gid] || 0) + 1;
      updatePageTitle();
      if (!mutedGroup.includes(gid)) {
        playNotifSound();
        const gName = groupNameCache[gid] || 'Group';
        showToast(`# ${gName} — ${payload.senderUsername}`, payload.content);
        sendBrowserNotif(`# ${gName}`, `${payload.senderUsername}: ${payload.content}`);
      }
    }

    lastMsgTimeGroup[gid]    = Date.now();
    lastMsgPreviewGroup[gid] = (isMine ? 'You: ' : payload.senderUsername + ': ') + payload.content;
    loadSidebar();
  });

  stompClient.subscribe('/user/queue/read-receipts', function (msg) {
    const p = JSON.parse(msg.body);
    if (ACTIVE_RECEIVER_ID && Number(p.readerId) === Number(ACTIVE_RECEIVER_ID)) {
      document.querySelectorAll('.message.sent .read-tick').forEach(el => {
        el.textContent = '✓✓';
        el.classList.add('read');
      });
    }
  });

  stompClient.subscribe('/user/queue/reactions', function (msg) {
    const p = JSON.parse(msg.body);
    const container = document.querySelector(`.reaction-row[data-msg-id="${p.messageId}"]`);
    if (container) renderReactions(p.messageId, container);
  });

  stompClient.subscribe('/user/queue/typing', function (msg) {
    const payload = JSON.parse(msg.body);
    if (payload.username === CURRENT_USERNAME) return;
    const relevantDM    = ACTIVE_RECEIVER_ID && payload.targetId === CURRENT_USER_ID;
    const relevantGroup = ACTIVE_GROUP_ID    && Number(payload.groupId) === ACTIVE_GROUP_ID;
    if (relevantDM || relevantGroup) showTypingIndicator(payload.username);
  });

  pingInterval = setInterval(() => {
    if (stompClient && stompClient.connected) stompClient.send('/app/ping', {}, '');
  }, 30000);
}

function onError() {
  statusBadge.textContent = 'disconnected';
  statusBadge.className   = 'disconnected';
  sendButton.disabled     = true;
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  reconnectTimer = setTimeout(connect, 4000);
}

// ─── Typing ───────────────────────────────────────────────────────────────────
function sendTyping() {
  if (!stompClient || !stompClient.connected) return;
  //  username removed from DTO — server derives it from principal
  if (ACTIVE_RECEIVER_ID) {
    stompClient.send('/app/typing', {}, JSON.stringify({ targetId: ACTIVE_RECEIVER_ID, groupId: null }));
  } else if (ACTIVE_GROUP_ID) {
    stompClient.send('/app/typing', {}, JSON.stringify({ targetId: null, groupId: ACTIVE_GROUP_ID }));
  }
}

function showTypingIndicator(username) {
  if (typingTimeouts[username]) clearTimeout(typingTimeouts[username]);
  if (typingIndicator) {
    typingIndicator.textContent = `${username} is typing...`;
    typingIndicator.classList.add('visible');
  }
  typingTimeouts[username] = setTimeout(() => clearTypingIndicator(username), 3000);
}

function clearTypingIndicator(username) {
  if (typingTimeouts[username]) { clearTimeout(typingTimeouts[username]); delete typingTimeouts[username]; }
  if (Object.keys(typingTimeouts).length === 0 && typingIndicator) {
    typingIndicator.textContent = '';
    typingIndicator.classList.remove('visible');
  }
}

// ─── Reply bar ────────────────────────────────────────────────────────────────
function setReply(sender, content) {
  replyingTo = { sender, content };
  if (replyText) replyText.textContent = `↩ ${sender}: ${content.slice(0, 60)}${content.length > 60 ? '…' : ''}`;
  if (replyBar)  replyBar.classList.remove('hidden');
  messageInput.focus();
}

function clearReply() {
  replyingTo = null;
  if (replyBar)  replyBar.classList.add('hidden');
  if (replyText) replyText.textContent = '';
}

if (cancelReply) cancelReply.addEventListener('click', clearReply);

// ─── Open DM ──────────────────────────────────────────────────────────────────
function openDM(user) {
  ACTIVE_RECEIVER_ID = user.id;
  ACTIVE_GROUP_ID    = null;
  delete unreadDM[user.id];
  updatePageTitle();
  clearReply();
  hideMemberPanel();

  chatName.textContent   = user.username;
  chatAvatar.textContent = user.username[0].toUpperCase();
  chatAvatar.classList.remove('group-avatar-header');
  chatStatus.textContent = isOnline(user.lastSeen) ? 'Online' : `Last seen ${lastSeenText(user.lastSeen)}`;

  const memberBtn = document.getElementById('memberPanelBtn');
  if (memberBtn) memberBtn.style.display = 'none';
  if (searchMsgBtn) searchMsgBtn.classList.remove('hidden');
  document.getElementById('chatMenuBtn')?.classList.remove('hidden');
  document.getElementById('chatMenu')?.classList.add('hidden');

  showChatArea();
  loadSidebar();

  fetch(`/api/messages/${user.id}/read`, { method: 'POST' }).catch(() => {});

  if (clearedChats.dm.has(user.id)) { clearedChats.dm.delete(user.id); return; }

  fetch(`/api/messages/${user.id}`)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(msgs => {
      if (msgs.length === 0) { showEmptyChatHint(`Say hi to ${user.username}! 👋`); return; }

      const last = msgs[msgs.length - 1];
      const tsMs = last.timestamp ? new Date(normaliseTimestamp(last.timestamp)).getTime() : 0;
      if (tsMs) {
        lastMsgTimeDM[user.id]    = tsMs;
        const isMine = Number(last.senderId) === Number(CURRENT_USER_ID);
        lastMsgPreviewDM[user.id] = (isMine ? 'You: ' : '') + last.content;
      }

      renderWithDateSeparators(
        msgs,
        m => Number(m.senderId) === Number(CURRENT_USER_ID),
        m => ({ content: m.content, sender: m.senderUsername, ts: m.timestamp })
      );
      loadSidebar();
    })
    .catch(err => console.error('DM history error:', err));
}

// ─── Open Group ───────────────────────────────────────────────────────────────
let currentGroupData = null;

function openGroup(group) {
  ACTIVE_GROUP_ID    = group.id;
  ACTIVE_RECEIVER_ID = null;
  currentGroupData   = group;

  // Note: admin roles are stored locally only (not persisted to server)
  const adminKey = `groupAdmins_${group.id}`;
  currentGroupData.adminIds = JSON.parse(localStorage.getItem(adminKey) || '[]');

  delete unreadGroup[group.id];
  updatePageTitle();
  clearReply();
  hideMemberPanel();

  chatName.textContent   = group.name;
  chatAvatar.textContent = '#';
  chatAvatar.classList.add('group-avatar-header');
  chatStatus.textContent = `${group.memberCount} member${group.memberCount !== 1 ? 's' : ''}`;

  const memberBtn = document.getElementById('memberPanelBtn');
  if (memberBtn) memberBtn.style.display = 'inline-flex';
  if (searchMsgBtn) searchMsgBtn.classList.remove('hidden');
  document.getElementById('chatMenuBtn')?.classList.remove('hidden');
  document.getElementById('chatMenu')?.classList.add('hidden');

  showChatArea();
  loadSidebar();

  if (clearedChats.group.has(group.id)) { clearedChats.group.delete(group.id); return; }

  fetch(`/api/groups/${group.id}/messages`)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(msgs => {
      if (msgs.length === 0) { showEmptyChatHint(`No messages yet in ${group.name}. Start the conversation! 🎉`); return; }

      const last = msgs[msgs.length - 1];
      const tsMs = last.timestamp ? new Date(normaliseTimestamp(last.timestamp)).getTime() : 0;
      if (tsMs) {
        lastMsgTimeGroup[group.id]    = tsMs;
        const isMine = Number(last.senderId) === Number(CURRENT_USER_ID);
        lastMsgPreviewGroup[group.id] = (isMine ? 'You: ' : last.senderUsername + ': ') + last.content;
      }

      renderWithDateSeparators(
        msgs,
        m => Number(m.senderId) === Number(CURRENT_USER_ID),
        m => ({ content: m.content, sender: m.senderUsername, ts: m.timestamp })
      );
      loadSidebar();
    })
    .catch(err => console.error('Group history error:', err));
}

function showChatArea() {
  messagesDiv.innerHTML = '';
  messagesDiv.classList.remove('messages-empty');
  emptyState.classList.add('hidden');
  chatArea.classList.remove('hidden');
  chatArea.style.display = 'flex';
  sendButton.disabled = false;
  messageInput.focus();
}

function showEmptyChatHint(text) {
  messagesDiv.innerHTML = '';
  messagesDiv.classList.add('messages-empty');
  const hint = document.createElement('div');
  hint.className   = 'empty-chat-hint';
  hint.textContent = text;
  messagesDiv.appendChild(hint);
}

// ─── Member panel ─────────────────────────────────────────────────────────────
function toggleMemberPanel() {
  if (!memberPanel) return;
  memberPanel.classList.contains('hidden') ? showMemberPanel() : hideMemberPanel();
}

function showMemberPanel() {
  if (!memberPanel || !currentGroupData) return;
  memberPanel.classList.remove('hidden');
  renderMemberPanel();
}

function renderMemberPanel() {
  if (!memberPanelList || !currentGroupData) return;
  const members   = currentGroupData.members || [];
  const admins    = currentGroupData.adminIds || [];
  const isCreator = currentGroupData.createdById === CURRENT_USER_ID;
  const isAdmin   = isCreator || admins.includes(CURRENT_USER_ID);

  const hero = document.getElementById('memberPanelHero');
  if (hero) {
    hero.innerHTML = `
      <button class="member-panel-close" onclick="hideMemberPanel()">✕</button>
      <div class="member-panel-group-avatar">#</div>
      <div class="member-panel-group-name">${escapeHtml(currentGroupData.name)}</div>
      <div class="member-panel-group-meta">${members.length} member${members.length !== 1 ? 's' : ''}</div>
    `;
  }

  memberPanelList.innerHTML = `
    <div class="member-panel-section-label">Members</div>
    ${members.map(m => {
      const mIsCreator = m.id === currentGroupData.createdById;
      const mIsAdmin   = admins.includes(m.id);
      const canManage  = isAdmin && !mIsCreator && m.id !== CURRENT_USER_ID;
      return `
      <div class="member-panel-item" data-uid="${m.id}">
        <div class="member-avatar-wrap">
          <div class="contact-avatar" style="width:34px;height:34px;font-size:13px;flex-shrink:0;">
            ${escapeHtml(m.username[0].toUpperCase())}
          </div>
          ${mIsCreator ? '<span class="member-role-dot" title="Creator">👑</span>'
            : mIsAdmin ? '<span class="member-role-dot" title="Admin">⭐</span>' : ''}
        </div>
        <div class="member-info">
          <span class="member-name">${escapeHtml(m.username)}</span>
          <span class="member-role-label">${mIsCreator ? 'Creator' : mIsAdmin ? 'Admin' : 'Member'}</span>
        </div>
        ${canManage ? `
          <div class="member-actions">
            ${mIsAdmin
              ? `<button class="member-action-btn demote-btn" data-uid="${m.id}" data-name="${escapeHtml(m.username)}">Remove admin</button>`
              : `<button class="member-action-btn promote-btn" data-uid="${m.id}" data-name="${escapeHtml(m.username)}">Make admin</button>`
            }
            <button class="member-action-btn danger-btn remove-btn" data-uid="${m.id}" data-name="${escapeHtml(m.username)}">Remove</button>
          </div>
        ` : ''}
      </div>`;
    }).join('')}
    ${isAdmin ? `
      <div class="member-panel-section-label" style="margin-top:10px;">Add members</div>
      <div class="add-member-box">
        <input id="addMemberInput" class="add-member-input" type="text" placeholder="Search users..." autocomplete="off"/>
        <div id="addMemberResults" class="add-member-results"></div>
      </div>
    ` : ''}
  `;

  memberPanelList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); removeMember(Number(btn.dataset.uid), btn.dataset.name); });
  });
  memberPanelList.querySelectorAll('.promote-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleAdmin(Number(btn.dataset.uid), btn.dataset.name, true); });
  });
  memberPanelList.querySelectorAll('.demote-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleAdmin(Number(btn.dataset.uid), btn.dataset.name, false); });
  });

  const addInput = document.getElementById('addMemberInput');
  if (addInput) addInput.addEventListener('input', () => searchUsersToAdd(addInput.value));
}

// Note: admin promotion is stored locally only — not persisted to the server
function toggleAdmin(userId, username, makeAdmin) {
  const key = `groupAdmins_${currentGroupData.id}`;
  let admins = JSON.parse(localStorage.getItem(key) || '[]');
  if (makeAdmin) { if (!admins.includes(userId)) admins.push(userId); }
  else admins = admins.filter(id => id !== userId);
  localStorage.setItem(key, JSON.stringify(admins));
  currentGroupData.adminIds = admins;
  const action = makeAdmin ? 'is now an admin ⭐' : 'is no longer an admin';
  appendSystemMessage(`${CURRENT_USERNAME} made ${username} ${action}`);
  showToast(makeAdmin ? '⭐ Admin granted' : '📋 Admin removed', `${username} ${action}`);
  renderMemberPanel();
}

function appendSystemMessage(text) {
  const div = document.createElement('div');
  div.className   = 'system-message';
  div.textContent = text;
  messagesDiv.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function searchUsersToAdd(q) {
  const results  = document.getElementById('addMemberResults');
  if (!results) return;
  const existing = (currentGroupData.members || []).map(m => m.id);
  fetch('/api/users')
    .then(r => r.json())
    .then(users => {
      const filtered = users.filter(u =>
        !existing.includes(u.id) && u.username.toLowerCase().includes(q.toLowerCase())
      );
      results.innerHTML = filtered.slice(0, 5).map(u => `
        <div class="add-member-result" data-uid="${u.id}" data-name="${escapeHtml(u.username)}">
          <div class="contact-avatar" style="width:26px;height:26px;font-size:11px;flex-shrink:0;">
            ${u.username[0].toUpperCase()}
          </div>
          <span>${escapeHtml(u.username)}</span>
          <button class="add-member-confirm-btn">Add</button>
        </div>
      `).join('') || (q ? '<div class="add-member-empty">No users found</div>' : '');
      results.querySelectorAll('.add-member-confirm-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const row = btn.closest('.add-member-result');
          addMember(Number(row.dataset.uid), row.dataset.name);
        });
      });
    });
}

function addMember(userId, username) {
  fetch(`/api/groups/${currentGroupData.id}/members/${userId}`, { method: 'POST' })
    .then(r => { if (!r.ok) throw new Error(); })
    .then(() => {
      currentGroupData.members = [...(currentGroupData.members || []), { id: userId, username }];
      currentGroupData.memberCount = currentGroupData.members.length;
      renderMemberPanel();
      appendSystemMessage(`${CURRENT_USERNAME} added ${username} to the group`);
      showToast(' Added', `${username} added to group`);
      loadSidebar();
    })
    .catch(() => showToast('❌ Error', 'Could not add member'));
}

function removeMember(userId, username) {
  fetch(`/api/groups/${currentGroupData.id}/members/${userId}`, { method: 'DELETE' })
    .then(r => { if (!r.ok) throw new Error(); })
    .then(() => {
      currentGroupData.members = (currentGroupData.members || []).filter(m => m.id !== userId);
      currentGroupData.memberCount = currentGroupData.members.length;
      const key    = `groupAdmins_${currentGroupData.id}`;
      let admins   = JSON.parse(localStorage.getItem(key) || '[]');
      admins       = admins.filter(id => id !== userId);
      localStorage.setItem(key, JSON.stringify(admins));
      currentGroupData.adminIds = admins;
      renderMemberPanel();
      appendSystemMessage(`${CURRENT_USERNAME} removed ${username || 'a member'} from the group`);
      showToast(' Removed', `${username || 'Member'} removed`);
      loadSidebar();
    })
    .catch(() => showToast('❌ Error', 'Could not remove member'));
}

function hideMemberPanel() {
  if (memberPanel) memberPanel.classList.add('hidden');
}

// ─── Date separators & render ─────────────────────────────────────────────────
function renderWithDateSeparators(msgs, isMineCheck, extractFn) {
  let lastDate = null;
  msgs.forEach(m => {
    const { content, sender, ts } = extractFn(m);
    const isMine  = isMineCheck(m);
    const tsNorm  = normaliseTimestamp(ts);
    const msgDate = tsNorm ? new Date(tsNorm).toDateString() : null;
    if (msgDate && msgDate !== lastDate) { appendDateSeparator(tsNorm); lastDate = msgDate; }
    appendMessage(content, isMine ? 'sent' : 'received', isMine ? 'You' : sender, tsNorm, null, m.id || null, m.read || false);
  });
}

function normaliseTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (Array.isArray(ts)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = ts;
    return new Date(y, mo - 1, d, h, mi, s).toISOString();
  }
  return String(ts);
}

function appendDateSeparator(isoTs) {
  const d    = new Date(isoTs);
  const now  = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  let label;
  if (d.toDateString() === now.toDateString())       label = 'Today';
  else if (d.toDateString() === yest.toDateString()) label = 'Yesterday';
  else label = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const sep = document.createElement('div');
  sep.className   = 'date-separator';
  sep.textContent = label;
  messagesDiv.appendChild(sep);
}

// ─── Send message ─────────────────────────────────────────────────────────────
function sendMessage() {
  let content = messageInput.value.trim();
  if (!content || !stompClient || !stompClient.connected) return;

  // Client-side length check matching server limit
  if (content.length > MAX_CHARS) {
    showToast('❌ Too long', `Message must be under ${MAX_CHARS} characters`);
    return;
  }

  if (replyingTo) {
    content = `[↩ ${replyingTo.sender}: ${replyingTo.content.slice(0, 40)}${replyingTo.content.length > 40 ? '…' : ''}]\n${content}`;
    clearReply();
  }

  if (ACTIVE_GROUP_ID !== null) {
    stompClient.send('/app/group-chat', {}, JSON.stringify({ groupId: ACTIVE_GROUP_ID, content }));
  } else if (ACTIVE_RECEIVER_ID !== null) {
    stompClient.send('/app/chat', {}, JSON.stringify({ receiverId: ACTIVE_RECEIVER_ID, content }));
  }
  messageInput.value = '';
  updateCharCounter();
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function appendMessage(content, direction, senderName, isoTimestamp, _unused, messageId, isRead = false) {
  const hint = messagesDiv.querySelector('.empty-chat-hint');
  if (hint) hint.remove();
  messagesDiv.classList.remove('messages-empty');

  const isGroupReceived = ACTIVE_GROUP_ID !== null && direction === 'received';
  const row = document.createElement('div');
  row.className = `message-row ${direction}${isGroupReceived ? ' group' : ''}`;

  if (isGroupReceived) {
    const inlineAvatar = document.createElement('div');
    inlineAvatar.className   = 'msg-inline-avatar';
    inlineAvatar.textContent = (senderName || '?').trim().charAt(0).toUpperCase();
    inlineAvatar.title       = senderName || 'User';
    row.appendChild(inlineAvatar);
  }

  const bubble = document.createElement('div');
  bubble.className = `message ${direction}${isGroupReceived ? ' group-received' : ''}`;
  if (isoTimestamp) bubble.title = new Date(isoTimestamp).toLocaleString();

  let displayContent = content;
  let quoteHtml = '';
  const quoteMatch = content.match(/^\[↩ (.+?): (.+?)\]\n([\s\S]*)$/);
  if (quoteMatch) {
    quoteHtml = `
      <div class="reply-quote">
        <span class="reply-quote-sender">${escapeHtml(quoteMatch[1])}</span>
        <span class="reply-quote-text">${escapeHtml(quoteMatch[2])}</span>
      </div>
    `;
    displayContent = quoteMatch[3];
  }

  const time     = isoTimestamp ? new Date(isoTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const readTick = direction === 'sent' ? `<span class="read-tick ${isRead ? 'read' : ''}">✓✓</span>` : '';

  bubble.innerHTML = `
    ${quoteHtml}
    <span class="msg-text">${escapeHtml(displayContent)}</span>
    <span class="meta">${escapeHtml(senderName)} ${time}${readTick}</span>
    <button class="reply-btn" title="Reply">↩</button>
    ${messageId ? `<button class="reaction-add-btn" title="React">＋</button>` : ''}
    ${messageId ? `<div class="reaction-row" data-msg-id="${messageId}"></div>` : ''}
  `;

  bubble.querySelector('.reply-btn').addEventListener('click', e => {
    e.stopPropagation();
    setReply(senderName, displayContent);
  });

  if (messageId) {
    const reactionRow = bubble.querySelector('.reaction-row');
    renderReactions(messageId, reactionRow);
    const addBtn = bubble.querySelector('.reaction-add-btn');
    addBtn.addEventListener('click', e => { e.stopPropagation(); openReactionPicker(messageId, addBtn); });
  }

  row.appendChild(bubble);
  messagesDiv.appendChild(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ─── Reactions ────────────────────────────────────────────────────────────────
const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡'];

function openReactionPicker(messageId, anchorBtn) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className   = 'reaction-emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', e => { e.stopPropagation(); toggleReaction(messageId, emoji); picker.remove(); });
    picker.appendChild(btn);
  });
  anchorBtn.parentElement.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
}

function toggleReaction(messageId, emoji) {
  fetch(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, emoji })
  }).catch(err => console.error('Reaction error:', err));
}

function renderReactions(messageId, container) {
  fetch(`/api/messages/${messageId}/reactions`)
    .then(r => r.json())
    .then(reactions => {
      container.innerHTML = '';
      reactions.forEach(r => {
        const pill = document.createElement('button');
        pill.className   = 'reaction-pill' + (r.userIds.includes(CURRENT_USER_ID) ? ' mine' : '');
        pill.textContent = `${r.emoji} ${r.count}`;
        pill.title       = `${r.emoji} ${r.count}`;
        pill.addEventListener('click', e => { e.stopPropagation(); toggleReaction(messageId, r.emoji); });
        container.appendChild(pill);
      });
    })
    .catch(() => {});
}

// ─── Message search ───────────────────────────────────────────────────────────
function openMsgSearch() {
  if (msgSearchBar) { msgSearchBar.classList.remove('hidden'); msgSearchInput.focus(); }
}

function closeMsgSearch() {
  if (msgSearchBar) { msgSearchBar.classList.add('hidden'); if (msgSearchInput) msgSearchInput.value = ''; }
  messagesDiv.querySelectorAll('.message.search-highlight').forEach(el => el.classList.remove('search-highlight'));
}

function doMsgSearch() {
  const q = msgSearchInput ? msgSearchInput.value.trim().toLowerCase() : '';
  messagesDiv.querySelectorAll('.message').forEach(el => {
    const txt = el.querySelector('.msg-text');
    if (!txt) return;
    el.classList.toggle('search-highlight', q && txt.textContent.toLowerCase().includes(q));
  });
  const first = messagesDiv.querySelector('.message.search-highlight');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

if (msgSearchClose) msgSearchClose.addEventListener('click', closeMsgSearch);
if (msgSearchInput) {
  msgSearchInput.addEventListener('input', doMsgSearch);
  msgSearchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeMsgSearch(); });
}
if (searchMsgBtn) searchMsgBtn.addEventListener('click', openMsgSearch);

// ─── Create group modal ───────────────────────────────────────────────────────
function openCreateGroupModal() {
  document.getElementById('createGroupModal').classList.remove('hidden');
  document.getElementById('groupNameInput').focus();
  loadUserCheckboxes();
}

function closeCreateGroupModal() {
  document.getElementById('createGroupModal').classList.add('hidden');
  document.getElementById('groupNameInput').value = '';
  document.getElementById('memberCheckboxes').innerHTML = '';
}

function loadUserCheckboxes() {
  const container = document.getElementById('memberCheckboxes');
  container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Loading…</p>';
  fetch('/api/users')
    .then(r => r.json())
    .then(users => {
      container.innerHTML = '';
      users.forEach(u => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" value="${u.id}" /><span>${escapeHtml(u.username)}</span>`;
        container.appendChild(label);
      });
    });
}

function submitCreateGroup() {
  const name = document.getElementById('groupNameInput').value.trim();

  //  Use showToast instead of alert() for consistent UX
  if (!name) { showToast('❌ Error', 'Please enter a group name.'); return; }

  //  Validate group name length matches server limit
  if (name.length > 50) { showToast('❌ Error', 'Group name must be 50 characters or less.'); return; }

  const memberIds = [...document.querySelectorAll('#memberCheckboxes input:checked')].map(cb => Number(cb.value));
  fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, memberIds })
  })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(group => { closeCreateGroupModal(); loadSidebar(); openGroup(group); })
    .catch(() => showToast('❌ Error', 'Failed to create group. Please try again.'));
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(title, body) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-title">${escapeHtml(title)}</div>
    ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => { toast.classList.remove('toast-show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

// ─── Character counter ────────────────────────────────────────────────────────
function updateCharCounter() {
  if (!charCounter) return;
  const len = messageInput.value.length;
  charCounter.textContent = `${len}/${MAX_CHARS}`;
  charCounter.classList.toggle('warn', len > MAX_CHARS * 0.85);
  charCounter.classList.toggle('over', len >= MAX_CHARS);
  if (len >= MAX_CHARS) messageInput.value = messageInput.value.slice(0, MAX_CHARS);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 60000;
}

function lastSeenText(lastSeen) {
  if (!lastSeen) return 'Never';
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────
if (emojiBtn && emojiPicker) {
  emojiBtn.addEventListener('click', e => { e.stopPropagation(); emojiPicker.classList.toggle('show'); });
  document.querySelectorAll('#emojiPicker .emoji').forEach(emoji => {
    emoji.addEventListener('click', e => {
      e.stopPropagation();
      if (messageInput.value.length < MAX_CHARS) { messageInput.value += emoji.textContent; updateCharCounter(); }
      messageInput.focus();
      emojiPicker.classList.remove('show');
    });
  });
  document.addEventListener('click', e => {
    if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) emojiPicker.classList.remove('show');
  });
}

// ─── Event listeners ──────────────────────────────────────────────────────────
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); });
messageInput.addEventListener('input', () => {
  updateCharCounter();
  if (!isTyping) { isTyping = true; sendTyping(); typingTimer = setTimeout(() => { isTyping = false; }, 2000); }
});
searchInput.addEventListener('input', loadSidebar);
sendButton.disabled = true;

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function loadConversationList(users, groups) {
  const list = document.getElementById('conversationList');
  if (!list) return;

  const q = (searchInput?.value || '').toLowerCase();

  const dmItems = (Array.isArray(users) ? users : []).map(u => ({
    type: 'dm', id: u.id, name: u.username,
    avatar: u.username?.[0]?.toUpperCase() || '?',
    online: isOnline(u.lastSeen),
    status: lastMsgPreviewDM[u.id] || (isOnline(u.lastSeen) ? 'Online' : lastSeenText(u.lastSeen)),
    unread: unreadDM[u.id] || 0,
    active: u.id === ACTIVE_RECEIVER_ID && ACTIVE_GROUP_ID === null,
    pinned: pinnedDM.includes(u.id), muted: mutedDM.includes(u.id),
    ts: lastMsgTimeDM[u.id] || 0, raw: u
  }));

  const groupItems = (Array.isArray(groups) ? groups : []).map(g => ({
    type: 'group', id: g.id, name: g.name, avatar: '#', online: false,
    status: lastMsgPreviewGroup[g.id] || `${g.memberCount} member${g.memberCount !== 1 ? 's' : ''}`,
    unread: unreadGroup[g.id] || 0,
    active: g.id === ACTIVE_GROUP_ID,
    pinned: pinnedGroup.includes(g.id), muted: mutedGroup.includes(g.id),
    ts: lastMsgTimeGroup[g.id] || 0, raw: g
  }));

  const all = [...dmItems, ...groupItems]
    .filter(item => item.name.toLowerCase().includes(q) || item.status.toLowerCase().includes(q))
    .sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      if ((b.ts || 0) !== (a.ts || 0)) return (b.ts || 0) - (a.ts || 0);
      return a.name.localeCompare(b.name);
    });

  list.innerHTML = '';
  if (all.length === 0) { list.innerHTML = `<p class="no-contacts">No conversations found.</p>`; return; }

  all.forEach(item => {
    const div = document.createElement('div');
    div.className = 'contact-item' +
      (item.active ? ' active' : '') +
      (item.pinned ? ' pinned-item' : '') +
      (item.type === 'group' ? ' group-item' : '');

    div.onclick = () => { if (item.type === 'dm') openDM(item.raw); else openGroup(item.raw); };
    div.addEventListener('contextmenu', e => showConvContextMenu(e, item));

    div.innerHTML = `
      <div class="contact-avatar ${item.type === 'group' ? 'group-avatar' : ''}">
        ${escapeHtml(item.avatar)}
        ${item.type === 'dm' ? `<span class="online-dot ${item.online ? 'online' : 'offline'}"></span>` : ''}
      </div>
      <div class="contact-info">
        <div class="contact-top-row">
          <span class="contact-name">
            ${item.pinned ? `<span class="pin-indicator">📌</span>` : ''}
            ${item.muted  ? `<span class="mute-indicator">🔕</span>` : ''}
            ${escapeHtml(item.name)}
          </span>
          <span class="contact-meta-time">${escapeHtml(getSidebarMeta(item))}</span>
        </div>
        <div class="contact-bottom-row">
          <span class="contact-status">
            ${escapeHtml(item.status.slice(0, 34))}${item.status.length > 34 ? '…' : ''}
          </span>
          ${item.unread > 0 ? `<span class="unread-badge">${item.unread}</span>` : ''}
        </div>
      </div>
      <button class="conv-three-dot" title="More options">⋮</button>
    `;

    div.querySelector('.conv-three-dot').addEventListener('click', e => {
      e.stopPropagation();
      showConvContextMenu(e, item);
    });

    list.appendChild(div);
  });
}

function loadSidebar() {
  Promise.all([
    fetch('/api/users').then(r => r.json()),
    fetch('/api/groups').then(r => r.json())
  ])
  .then(([users, groups]) => {
    groups.forEach(g => { groupNameCache[g.id] = g.name; });

    const dmFetches = users.map(u => {
      if (lastMsgPreviewDM[u.id] !== undefined) return Promise.resolve();
      if (clearedChats.dm.has(u.id)) return Promise.resolve();
      return fetch(`/api/messages/${u.id}/last`)
        .then(r => r.ok ? r.json() : null)
        .then(last => {
          if (!last) { lastMsgPreviewDM[u.id] = ''; return; }
          const tsMs = last.timestamp ? new Date(normaliseTimestamp(last.timestamp)).getTime() : 0;
          if (tsMs) lastMsgTimeDM[u.id] = tsMs;
          const isMine = Number(last.senderId) === Number(CURRENT_USER_ID);
          lastMsgPreviewDM[u.id] = (isMine ? 'You: ' : '') + last.content;
        })
        .catch(() => { lastMsgPreviewDM[u.id] = ''; });
    });

    //  Use /last endpoint for groups too instead of loading all messages
    const groupFetches = groups.map(g => {
      if (lastMsgPreviewGroup[g.id] !== undefined) return Promise.resolve();
      if (clearedChats.group.has(g.id)) return Promise.resolve();
      return fetch(`/api/groups/${g.id}/messages?page=0&size=1`)
        .then(r => r.ok ? r.json() : [])
        .then(msgs => {
          if (!Array.isArray(msgs) || msgs.length === 0) { lastMsgPreviewGroup[g.id] = ''; return; }
          const last   = msgs[msgs.length - 1];
          const tsMs   = last.timestamp ? new Date(normaliseTimestamp(last.timestamp)).getTime() : 0;
          if (tsMs) lastMsgTimeGroup[g.id] = tsMs;
          const isMine = Number(last.senderId) === Number(CURRENT_USER_ID);
          lastMsgPreviewGroup[g.id] = (isMine ? 'You: ' : last.senderUsername + ': ') + last.content;
        })
        .catch(() => { lastMsgPreviewGroup[g.id] = ''; });
    });

    return Promise.all([...dmFetches, ...groupFetches])
      .then(() => loadConversationList(users, groups));
  })
  .catch(err => {
    console.error('Sidebar load error:', err);
    const cl = document.getElementById('conversationList');
    if (cl) cl.innerHTML = `<p class="no-contacts">Unable to load conversations.</p>`;
  });
}

function getSidebarMeta(item) {
  if (item.type === 'dm') {
    if (item.online) return 'Online';
    if (!item.ts) return lastSeenText(item.raw.lastSeen);
  }
  if (!item.ts) return '';
  const d = new Date(item.ts), now = new Date(), y = new Date();
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Sidebar resize ───────────────────────────────────────────────────────────
(function initResize() {
  const handle  = document.getElementById('resizeHandle');
  const sidebar = document.querySelector('.sidebar');
  if (!handle || !sidebar) return;
  const SIDEBAR_MIN = 220, SIDEBAR_MAX = 480, STORAGE_KEY = 'sidebarWidth';
  const saved = parseInt(localStorage.getItem(STORAGE_KEY));
  if (saved && saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) sidebar.style.width = saved + 'px';

  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX; startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const newW = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + e.clientX - startX));
      sidebar.style.width = newW + 'px';
    }
    function onUp() {
      localStorage.setItem(STORAGE_KEY, sidebar.offsetWidth);
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
})();

// ─── Right-click context menu ─────────────────────────────────────────────────
function showConvContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.conv-context-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'conv-context-menu';
  menu.innerHTML = `
    <button data-action="open"><span class="ctx-icon">💬</span> Open</button>
    <div class="ctx-divider"></div>
    <button data-action="pin">
      <span class="ctx-icon">📌</span> ${item.pinned ? 'Unpin' : 'Pin'} chat
    </button>
    <button data-action="mute">
      <span class="ctx-icon">${item.muted ? '🔔' : '🔕'}</span>
      ${item.muted ? 'Unmute' : 'Mute'} notifications
    </button>
    <button data-action="unread"><span class="ctx-icon">🔵</span> Mark as unread</button>
    <div class="ctx-divider"></div>
    <button data-action="clear" class="danger"><span class="ctx-icon">🗑️</span> Clear chat</button>
  `;

  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(e.clientX, window.innerWidth  - mw - 8);
  let y = Math.min(e.clientY, window.innerHeight - mh - 8);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';

  menu.addEventListener('click', ev => {
    const action = ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'open') {
      if (item.type === 'dm') openDM(item.raw); else openGroup(item.raw);
    } else if (action === 'pin') {
      if (item.type === 'dm') togglePinDM(item.id); else togglePinGroup(item.id);
    } else if (action === 'mute') {
      if (item.type === 'dm') toggleMuteDM(item.id); else toggleMuteGroup(item.id);
    } else if (action === 'unread') {
      if (item.type === 'dm') unreadDM[item.id] = (unreadDM[item.id] || 0) + 1;
      else unreadGroup[item.id] = (unreadGroup[item.id] || 0) + 1;
      updatePageTitle();
      loadSidebar();
    } else if (action === 'clear') {
      if (item.type === 'dm') { delete lastMsgPreviewDM[item.id]; delete lastMsgTimeDM[item.id]; }
      else { delete lastMsgPreviewGroup[item.id]; delete lastMsgTimeGroup[item.id]; }
      loadSidebar();
    }
    menu.remove();
  });

  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}