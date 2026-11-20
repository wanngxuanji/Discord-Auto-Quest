(function() {
  'use strict';

  const {
    MESSAGE_PREFIX,
    AUTHOR_NAME,
    REPO_URL,
    isValidQuestPayload,
    createQuestItemNodes,
    updateQuestItemNodes
  } = globalThis.DQShared;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const QUEST_ITEM_CLASSES = {
    item: 'dq-item',
    done: 'is-done',
    row: 'dq-item-row',
    name: 'dq-item-name',
    progress: 'dq-item-progress',
    barTrack: 'dq-bar-track',
    barFill: 'dq-bar-fill'
  };

  let isPanelExpanded = false;
  let isQuestRunning = false;
  let currentStatusText = 'Click "Run Quests" to detect accepted quests.';
  let currentStatusTone = 'info';
  let buttonResetTimer = null;
  let lastUrl = window.location.href;
  let completionAudio = null;

  const questStateCache = new Map();
  const questDomRefs = new Map();

  let uiRefs = null;

  const SHADOW_CSS = `
    :host {
      all: initial;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    .dq-wrapper {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .dq-controls {
      display: flex;
      align-items: stretch;
      background: #ffffff;
      color: #111214;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
    }
    .dq-controls:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }
    .dq-controls.is-active {
      background: #111214;
      color: #ffffff;
    }
    .dq-controls.is-error {
      background: #da373c;
      color: #ffffff;
    }
    .dq-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .dq-btn:focus-visible {
      outline: 2px solid #5865f2;
      outline-offset: -2px;
    }
    .dq-main-btn {
      gap: 8px;
      padding: 9px 12px 9px 14px;
      font-size: 13px;
      font-weight: 600;
      min-width: 148px;
    }
    .dq-toggle-btn {
      padding: 0 10px;
      border-left: 1px solid rgba(128, 128, 128, 0.25);
    }
    .dq-toggle-btn:hover {
      background: rgba(128, 128, 128, 0.14);
    }
    .dq-icon {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
    }
    .dq-chevron {
      width: 12px;
      height: 12px;
      transition: transform 0.25s ease;
    }
    .dq-chevron.is-open {
      transform: rotate(180deg);
    }
    .dq-panel {
      position: absolute;
      bottom: 48px;
      right: 0;
      width: 288px;
      background: #111214;
      color: #f2f3f5;
      border: 1px solid #2b2d31;
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
    }
    .dq-status {
      font-size: 12px;
      color: #b5bac1;
      margin: 0 0 10px 0;
      line-height: 1.4;
    }
    .dq-status.is-error {
      color: #f27a7e;
    }
    .dq-status.is-success {
      color: #57f287;
    }
    .dq-list {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: #3f4147 transparent;
    }
    .dq-list::-webkit-scrollbar {
      width: 6px;
    }
    .dq-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .dq-list::-webkit-scrollbar-thumb {
      background: #3f4147;
      border-radius: 999px;
    }
    .dq-list::-webkit-scrollbar-thumb:hover {
      background: #52555d;
    }
    .dq-warning-popup {
      position: absolute;
      bottom: 48px;
      right: 0;
      z-index: 10002;
      width: 272px;
      background: #1a1b1e;
      color: #f2f3f5;
      border: 1px solid rgba(240, 178, 50, 0.55);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .dq-warning-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #f0b232;
    }
    .dq-warning-text {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      color: #dbdee1;
    }
    .dq-warning-actions {
      display: flex;
      gap: 8px;
    }
    .dq-warning-btn {
      flex: 1;
      appearance: none;
      border: none;
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .dq-warning-keep {
      background: #2b2d31;
      color: #f2f3f5;
    }
    .dq-warning-keep:hover {
      background: #35373c;
    }
    .dq-warning-stop {
      background: #da373c;
      color: #ffffff;
    }
    .dq-warning-stop:hover {
      background: #b82c31;
    }
    .dq-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: opacity 0.2s ease;
    }
    .dq-item.is-done {
      opacity: 0.65;
    }
    .dq-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .dq-item-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #f2f3f5;
      font-weight: 500;
    }
    .dq-item-progress {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #b5bac1;
      font-size: 11px;
      flex-shrink: 0;
    }
    .dq-item.is-done .dq-item-progress {
      color: #43b581;
      font-weight: 600;
    }
    .dq-bar-track {
      width: 100%;
      height: 4px;
      background: #2b2d31;
      border-radius: 999px;
      overflow: hidden;
    }
    .dq-bar-fill {
      height: 100%;
      width: 0%;
      background: #5865f2;
      border-radius: 999px;
      transition: width 0.3s ease, background 0.2s ease;
    }
    .dq-item.is-done .dq-bar-fill {
      background: #43b581;
    }
    .dq-footer {
      border-top: 1px solid #2b2d31;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .dq-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
    }
    .dq-credit {
      margin: 0;
      font-size: 12px;
      color: #949ba4;
    }
    .dq-credit a {
      color: #ffffff;
      font-weight: 600;
      text-decoration: none;
    }
    .dq-credit a:hover {
      text-decoration: underline;
    }
    @media (max-width: 480px) {
      :host {
        bottom: 12px;
        right: 12px;
      }
      .dq-panel {
        width: min(288px, calc(100vw - 24px));
      }
    }
  `;

  function createSvgIcon(pathData, viewBox, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', className);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    return svg;
  }

  function createQuestUI() {
    if (!window.location.pathname.includes('/quest-home')) {
      removeElements();
      return;
    }

    if (document.getElementById('DiscordQuestRoot')) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'DiscordQuestRoot';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'dq-wrapper';

    const controls = document.createElement('div');
    controls.className = 'dq-controls';

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'dq-btn dq-main-btn';
    mainBtn.setAttribute('aria-label', 'Run Discord quests');

    const questIcon = createSvgIcon(
      'M12 2L14.85 8.65L22 9.27L16.55 13.97L18.18 21L12 17.27L5.82 21L7.45 13.97L2 9.27L9.15 8.65L12 2Z',
      '0 0 24 24',
      'dq-icon'
    );
    const labelSpan = document.createElement('span');
    labelSpan.textContent = 'Run Quests';
    mainBtn.appendChild(questIcon);
    mainBtn.appendChild(labelSpan);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'dq-btn dq-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle quest details panel');
    toggleBtn.setAttribute('aria-expanded', String(isPanelExpanded));

    const chevronIcon = createSvgIcon(
      'M7.41 15.41L12 10.83L16.59 15.41L18 14L12 8L6 14L7.41 15.41Z',
      '0 0 24 24',
      isPanelExpanded ? 'dq-chevron is-open' : 'dq-chevron'
    );
    toggleBtn.appendChild(chevronIcon);

    mainBtn.addEventListener('click', handleMainButtonClick);
    toggleBtn.addEventListener('click', togglePanel);

    controls.appendChild(mainBtn);
    controls.appendChild(toggleBtn);
    wrapper.appendChild(controls);
    shadow.appendChild(wrapper);
    document.body.appendChild(host);

    uiRefs = {
      host,
      wrapper,
      controls,
      mainBtn,
      labelSpan,
      toggleBtn,
      chevronIcon,
      panel: null,
      statusEl: null,
      listEl: null,
      warningPopup: null
    };

    if (isPanelExpanded) {
      createExpandedPanel();
    }
  }

  function setButtonVisual(text, mode, autoResetMs) {
    if (!uiRefs) return;

    if (buttonResetTimer) {
      clearTimeout(buttonResetTimer);
      buttonResetTimer = null;
    }

    uiRefs.labelSpan.textContent = text;
    uiRefs.controls.classList.toggle('is-active', mode === 'active');
    uiRefs.controls.classList.toggle('is-error', mode === 'error');

    if (autoResetMs > 0) {
      buttonResetTimer = setTimeout(() => {
        buttonResetTimer = null;
        syncIdleButtonState();
      }, autoResetMs);
    }
  }

  function syncIdleButtonState() {
    if (!uiRefs) return;
    if (isQuestRunning) {
      setButtonVisual('Running Quests...', 'active', 0);
      uiRefs.mainBtn.setAttribute('aria-label', 'Quests are running. Click for options');
    } else {
      setButtonVisual('Run Quests', 'idle', 0);
      uiRefs.mainBtn.setAttribute('aria-label', 'Run Discord quests');
    }
  }

  function getStatusSnapshot() {
    return {
      isRunning: isQuestRunning,
      statusText: currentStatusText,
      statusTone: currentStatusTone,
      quests: Array.from(questStateCache.values())
    };
  }

  function broadcastStateToPopup() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      const result = chrome.runtime.sendMessage({
        action: 'questStateChanged',
        state: getStatusSnapshot()
      });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch {}
  }

  function setPanelStatus(message, tone) {
    currentStatusText = message;
    currentStatusTone = tone || 'info';
    if (uiRefs?.statusEl) {
      uiRefs.statusEl.textContent = currentStatusText;
      uiRefs.statusEl.className = 'dq-status';
      if (currentStatusTone === 'error') uiRefs.statusEl.classList.add('is-error');
      if (currentStatusTone === 'success') uiRefs.statusEl.classList.add('is-success');
    }
    broadcastStateToPopup();
  }

  function playCompletionSound() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
      return;
    }

    const soundUrl = chrome.runtime.getURL('assets/sfx/ting.mp3');

    const playWithWebAudio = () => {
      if (typeof fetch !== 'function') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      fetch(soundUrl)
        .then((res) => res.arrayBuffer())
        .then((buf) => {
          const ctx = new AudioCtx();
          return ctx.decodeAudioData(buf).then((decoded) => {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            gain.gain.value = 0.7;
            source.buffer = decoded;
            source.connect(gain);
            gain.connect(ctx.destination);
            source.onended = () => { ctx.close().catch(() => {}); };
            source.start(0);
          });
        })
        .catch(() => {});
    };

    if (typeof Audio === 'function') {
      try {
        if (!completionAudio) {
          completionAudio = new Audio(soundUrl);
          completionAudio.volume = 0.7;
        } else {
          completionAudio.currentTime = 0;
        }
        const playPromise = completionAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => playWithWebAudio());
        }
        return;
      } catch {}
    }

    playWithWebAudio();
  }

  function hideWarningPopup() {
    if (uiRefs?.warningPopup) {
      uiRefs.warningPopup.remove();
      uiRefs.warningPopup = null;
    }
  }

  function showWarningPopup() {
    if (!uiRefs || uiRefs.warningPopup) return;

    const popup = document.createElement('div');
    popup.className = 'dq-warning-popup';
    popup.setAttribute('role', 'alertdialog');
    popup.setAttribute('aria-label', 'Quests already running warning');

    const header = document.createElement('div');
    header.className = 'dq-warning-header';
    const warnIcon = createSvgIcon(
      'M12 2L1 21H23L12 2ZM13 18H11V16H13V18ZM13 14H11V10H13V14Z',
      '0 0 24 24',
      'dq-icon'
    );
    const headerText = document.createElement('span');
    headerText.textContent = 'Quests Already Running';
    header.appendChild(warnIcon);
    header.appendChild(headerText);

    const text = document.createElement('p');
    text.className = 'dq-warning-text';
    text.textContent = 'Auto Quest is currently running in the background. Do you want to stop it?';

    const actions = document.createElement('div');
    actions.className = 'dq-warning-actions';

    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.className = 'dq-warning-btn dq-warning-keep';
    keepBtn.textContent = 'Keep Running';
    keepBtn.addEventListener('click', hideWarningPopup);

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'dq-warning-btn dq-warning-stop';
    stopBtn.textContent = 'Stop Quests';
    stopBtn.addEventListener('click', () => {
      hideWarningPopup();
      stopQuests();
    });

    actions.appendChild(keepBtn);
    actions.appendChild(stopBtn);

    popup.appendChild(header);
    popup.appendChild(text);
    popup.appendChild(actions);

    uiRefs.wrapper.appendChild(popup);
    uiRefs.warningPopup = popup;
  }

  function startQuests() {
    if (isQuestRunning) return;

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setButtonVisual('Extension Error', 'error', 2500);
      setPanelStatus('Extension runtime unavailable. Reload the page.', 'error');
      return;
    }

    isQuestRunning = true;
    setButtonVisual('Starting...', 'active', 0);
    setPanelStatus('Scanning active quests...', 'info');

    chrome.runtime.sendMessage({ action: 'executeQuestCode' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        const errMsg = chrome.runtime.lastError?.message || response?.error || 'Failed to inject quest script.';
        console.error('Discord Auto Quest Error:', errMsg);
        isQuestRunning = false;
        setButtonVisual('Error', 'error', 2500);
        setPanelStatus(errMsg, 'error');
        return;
      }

      if (isQuestRunning) {
        syncIdleButtonState();
        broadcastStateToPopup();
      }
    });
  }

  function stopQuests() {
    hideWarningPopup();
    if (!isQuestRunning) return;
    window.postMessage({
      prefix: MESSAGE_PREFIX,
      type: 'STOP_QUESTS'
    }, window.location.origin);
    setButtonVisual('Stopping...', 'active', 0);
    setPanelStatus('Stopping quest execution...', 'info');
  }

  function handleMainButtonClick() {
    if (isQuestRunning) {
      if (uiRefs?.warningPopup) {
        hideWarningPopup();
      } else {
        showWarningPopup();
      }
    } else {
      startQuests();
    }
  }

  function createExpandedPanel() {
    if (!uiRefs || uiRefs.panel) return;

    const panel = document.createElement('div');
    panel.className = 'dq-panel';

    const statusEl = document.createElement('p');
    statusEl.className = 'dq-status';
    statusEl.textContent = questStateCache.size > 0
      ? currentStatusText
      : 'Click "Run Quests" to detect accepted quests.';
    panel.appendChild(statusEl);

    const listEl = document.createElement('div');
    listEl.className = 'dq-list';
    panel.appendChild(listEl);

    const footer = document.createElement('div');
    footer.className = 'dq-footer';

    const title = document.createElement('h3');
    title.className = 'dq-title';
    title.textContent = 'Auto Quest';

    const credit = document.createElement('p');
    credit.className = 'dq-credit';
    credit.appendChild(document.createTextNode('By '));

    const link = document.createElement('a');
    link.href = REPO_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = AUTHOR_NAME;
    credit.appendChild(link);

    footer.appendChild(title);
    footer.appendChild(credit);
    panel.appendChild(footer);

    uiRefs.wrapper.appendChild(panel);
    uiRefs.panel = panel;
    uiRefs.statusEl = statusEl;
    uiRefs.listEl = listEl;

    renderQuestList(Array.from(questStateCache.values()));
  }

  function renderQuestList(quests) {
    if (!uiRefs?.listEl) return;

    questDomRefs.clear();
    uiRefs.listEl.textContent = '';

    if (quests.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const quest of quests) {
      const refs = createQuestItemNodes(QUEST_ITEM_CLASSES, quest);
      questDomRefs.set(quest.id, refs);
      fragment.appendChild(refs.item);
    }
    uiRefs.listEl.appendChild(fragment);
  }

  function upsertQuestItem(quest) {
    if (!uiRefs?.listEl) return;

    let refs = questDomRefs.get(quest.id);
    if (!refs) {
      refs = createQuestItemNodes(QUEST_ITEM_CLASSES, quest);
      questDomRefs.set(quest.id, refs);
      uiRefs.listEl.appendChild(refs.item);
    } else {
      updateQuestItemNodes(refs, quest, QUEST_ITEM_CLASSES);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    const { data } = event;
    if (!data || data.prefix !== MESSAGE_PREFIX) {
      return;
    }

    if (data.type === 'QUEST_STARTED') {
      isQuestRunning = true;
      syncIdleButtonState();
      setPanelStatus(`Running ${Number(data.data?.total) || 0} quest(s)...`, 'info');
    } else if (data.type === 'QUEST_LIST' && Array.isArray(data.data)) {
      questStateCache.clear();
      for (const q of data.data) {
        if (isValidQuestPayload(q)) {
          questStateCache.set(q.id, q);
        }
      }
      renderQuestList(Array.from(questStateCache.values()));
      if (questStateCache.size === 0) {
        setPanelStatus('No uncompleted accepted quests found.', 'info');
      } else {
        setPanelStatus(`Tracking ${questStateCache.size} active quest(s).`, 'info');
      }
    } else if (data.type === 'QUEST_UPDATE' && isValidQuestPayload(data.data)) {
      const prev = questStateCache.get(data.data.id);
      const justCompleted = Boolean(data.data.completed) && !prev?.completed;
      questStateCache.set(data.data.id, data.data);
      upsertQuestItem(data.data);
      broadcastStateToPopup();
      if (justCompleted) {
        playCompletionSound();
      }
    } else if (data.type === 'QUEST_ERROR') {
      const msg = String(data.data?.message || 'Quest automation error.');
      setPanelStatus(msg, 'error');
      if (data.data?.fatal) {
        isQuestRunning = false;
        hideWarningPopup();
        setButtonVisual('Error', 'error', 2500);
      }
    } else if (data.type === 'QUEST_FINISHED') {
      isQuestRunning = false;
      hideWarningPopup();
      const completed = Number(data.data?.completed) || 0;
      const total = Number(data.data?.total) || 0;
      const stopped = Boolean(data.data?.stopped);

      if (stopped) {
        setButtonVisual('Stopped', 'active', 1800);
        setPanelStatus(`Stopped (${completed}/${total} completed).`, 'info');
      } else if (total === 0) {
        setButtonVisual('No Quests', 'idle', 2000);
        setPanelStatus('No uncompleted accepted quests found.', 'info');
      } else {
        setButtonVisual('All Done', 'active', 2200);
        setPanelStatus(`Finished ${completed}/${total} quest(s).`, 'success');
      }
    }
  });

  function removeElements() {
    if (buttonResetTimer) {
      clearTimeout(buttonResetTimer);
      buttonResetTimer = null;
    }
    if (uiRefs?.host) {
      uiRefs.host.remove();
    }
    questDomRefs.clear();
    uiRefs = null;
  }

  function togglePanel() {
    isPanelExpanded = !isPanelExpanded;
    if (uiRefs) {
      uiRefs.toggleBtn.setAttribute('aria-expanded', String(isPanelExpanded));
      uiRefs.chevronIcon.classList.toggle('is-open', isPanelExpanded);
    }

    if (isPanelExpanded) {
      createExpandedPanel();
    } else if (uiRefs?.panel) {
      uiRefs.panel.remove();
      uiRefs.panel = null;
      uiRefs.statusEl = null;
      uiRefs.listEl = null;
      questDomRefs.clear();
    }
  }

  function checkUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      createQuestUI();
    }
  }

  function init() {
    createQuestUI();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request?.action === 'getQuestStatus') {
          sendResponse(getStatusSnapshot());
          return false;
        }
        if (request?.action === 'startQuests') {
          startQuests();
          sendResponse(getStatusSnapshot());
          return false;
        }
        if (request?.action === 'stopQuests') {
          stopQuests();
          sendResponse(getStatusSnapshot());
          return false;
        }
        return false;
      });
    }

    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      window.navigation.addEventListener('navigatesuccess', checkUrlChange);
    } else {
      setInterval(checkUrlChange, 1000);
    }
    window.addEventListener('popstate', checkUrlChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
