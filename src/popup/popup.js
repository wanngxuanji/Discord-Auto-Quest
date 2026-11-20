(function() {
  'use strict';

  const {
    DISCORD_ORIGIN_RE,
    createQuestItemNodes
  } = globalThis.DQShared;

  const DISCORD_QUEST_HOME_URL = 'https://discord.com/quest-home';
  const POPUP_ITEM_CLASSES = {
    item: 'quest-item',
    done: 'is-done',
    row: 'quest-row',
    name: 'quest-name',
    progress: 'quest-progress',
    barTrack: 'bar-track',
    barFill: 'bar-fill'
  };

  const versionBadge = document.getElementById('versionBadge');
  const statePill = document.getElementById('statePill');
  const statusMessage = document.getElementById('statusMessage');
  const primaryBtn = document.getElementById('primaryBtn');
  const secondaryBtn = document.getElementById('secondaryBtn');
  const confirmBox = document.getElementById('confirmBox');
  const cancelStopBtn = document.getElementById('cancelStopBtn');
  const confirmStopBtn = document.getElementById('confirmStopBtn');
  const questList = document.getElementById('questList');

  let activeTab = null;
  let currentMode = 'open';
  let isRunning = false;

  function setStatus(text, tone) {
    statusMessage.textContent = text;
    statusMessage.className = 'status';
    if (tone === 'error') statusMessage.classList.add('is-error');
    if (tone === 'success') statusMessage.classList.add('is-success');
  }

  function setPill(text, tone) {
    statePill.textContent = text;
    statePill.className = 'pill';
    if (tone === 'running') statePill.classList.add('pill-running');
    else if (tone === 'success') statePill.classList.add('pill-success');
    else if (tone === 'error') statePill.classList.add('pill-error');
  }

  function renderQuests(quests) {
    questList.textContent = '';
    if (!Array.isArray(quests) || quests.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const q of quests) {
      const { item } = createQuestItemNodes(POPUP_ITEM_CLASSES, q);
      fragment.appendChild(item);
    }

    questList.appendChild(fragment);
  }

  function hideConfirmBox() {
    if (confirmBox) confirmBox.hidden = true;
  }

  function applyQuestState(state) {
    if (!state) return;

    currentMode = 'quest';
    isRunning = Boolean(state.isRunning);
    secondaryBtn.hidden = true;

    if (!isRunning) {
      hideConfirmBox();
    }

    primaryBtn.disabled = false;
    primaryBtn.textContent = isRunning ? 'Running Quests...' : 'Run Quests';
    primaryBtn.classList.toggle('is-running', isRunning);

    if (isRunning) {
      setPill('Running', 'running');
    } else if (state.statusTone === 'error') {
      setPill('Error', 'error');
    } else if (state.statusTone === 'success') {
      setPill('Done', 'success');
    } else {
      setPill('Ready', 'idle');
    }

    setStatus(state.statusText || 'Ready on Discord Quest Home.', state.statusTone || 'info');
    renderQuests(state.quests);
  }

  function showOpenQuestHomeMode(isOnDiscord) {
    currentMode = 'open';
    isRunning = false;
    hideConfirmBox();
    primaryBtn.disabled = false;
    primaryBtn.classList.remove('is-running');
    primaryBtn.textContent = 'Open Quest Home';
    secondaryBtn.hidden = true;
    setPill('Inactive', 'idle');
    setStatus(
      isOnDiscord
        ? 'Navigate to Discord Quest Home (/quest-home) to run quests.'
        : 'Open https://discord.com/quest-home and accept quests first.',
      'info'
    );
    renderQuests([]);
  }

  function showReloadMode() {
    currentMode = 'reload';
    isRunning = false;
    hideConfirmBox();
    primaryBtn.disabled = false;
    primaryBtn.classList.remove('is-running');
    primaryBtn.textContent = 'Reload Page';
    secondaryBtn.hidden = true;
    setPill('Reload Needed', 'error');
    setStatus('Content script is not active on this tab yet. Reload the page (F5).', 'error');
    renderQuests([]);
  }

  async function refreshActiveTabState() {
    const manifest = chrome.runtime.getManifest();
    versionBadge.textContent = `v${manifest.version}`;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0] || null;
    const url = activeTab?.url || '';

    if (!DISCORD_ORIGIN_RE.test(url)) {
      showOpenQuestHomeMode(false);
      return;
    }

    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      showOpenQuestHomeMode(true);
      return;
    }

    if (!parsedUrl.pathname.includes('/quest-home')) {
      showOpenQuestHomeMode(true);
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { action: 'getQuestStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        showReloadMode();
        return;
      }
      applyQuestState(response);
    });
  }

  primaryBtn.addEventListener('click', () => {
    if (currentMode === 'open') {
      if (activeTab?.id && activeTab.url && DISCORD_ORIGIN_RE.test(activeTab.url)) {
        const origin = new URL(activeTab.url).origin;
        chrome.tabs.update(activeTab.id, { url: `${origin}/quest-home` });
      } else {
        chrome.tabs.create({ url: DISCORD_QUEST_HOME_URL });
      }
      window.close();
      return;
    }

    if (currentMode === 'reload' && activeTab?.id) {
      chrome.tabs.reload(activeTab.id);
      window.close();
      return;
    }

    if (currentMode === 'quest' && activeTab?.id) {
      if (isRunning) {
        if (confirmBox) confirmBox.hidden = false;
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'startQuests' }, (response) => {
        if (chrome.runtime.lastError) {
          showReloadMode();
          return;
        }
        if (response) {
          applyQuestState(response);
        }
      });
    }
  });

  if (cancelStopBtn) {
    cancelStopBtn.addEventListener('click', () => {
      hideConfirmBox();
    });
  }

  if (confirmStopBtn) {
    confirmStopBtn.addEventListener('click', () => {
      hideConfirmBox();
      if (currentMode !== 'quest' || !activeTab?.id) return;
      chrome.tabs.sendMessage(activeTab.id, { action: 'stopQuests' }, (response) => {
        if (chrome.runtime.lastError) {
          showReloadMode();
          return;
        }
        if (response) {
          applyQuestState(response);
        }
      });
    });
  }

  chrome.runtime.onMessage.addListener((request, sender) => {
    if (request?.action !== 'questStateChanged') return false;
    if (activeTab?.id && sender.tab?.id && sender.tab.id !== activeTab.id) {
      return false;
    }
    applyQuestState(request.state);
    return false;
  });

  refreshActiveTabState();
})();
