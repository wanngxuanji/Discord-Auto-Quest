(function(root) {
  'use strict';

  const MESSAGE_PREFIX = 'DISCORD_QUEST_COMPLETER';
  const AUTHOR_NAME = 'wanng';
  const REPO_URL = 'https://github.com/wanngxuanji/Discord-Auto-Quest';
  const DISCORD_ORIGIN_RE = /^https:\/\/(?:canary\.|ptb\.)?discord\.com(?:\/|$)/;

  function formatSeconds(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }

  function isValidQuestPayload(item) {
    return Boolean(item && typeof item === 'object' && (typeof item.id === 'string' || typeof item.id === 'number'));
  }

  function computeQuestMetrics(quest) {
    const name = String(quest.name ?? 'Unknown Quest');
    const target = Math.max(0, Number(quest.target) || 0);
    const progress = Math.max(0, Number(quest.progress) || 0);
    const completed = Boolean(quest.completed);
    const pct = completed
      ? 100
      : (target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0);
    const progressText = completed
      ? 'DONE'
      : `${formatSeconds(progress)} / ${formatSeconds(target)} (${pct}%)`;

    return { name, target, progress, completed, pct, progressText };
  }

  function createQuestItemNodes(classes, quest) {
    const item = document.createElement('div');
    const row = document.createElement('div');
    const nameEl = document.createElement('span');
    const progressEl = document.createElement('span');
    const barTrack = document.createElement('div');
    const barFill = document.createElement('div');

    row.className = classes.row;
    nameEl.className = classes.name;
    progressEl.className = classes.progress;
    barTrack.className = classes.barTrack;
    barFill.className = classes.barFill;

    row.appendChild(nameEl);
    row.appendChild(progressEl);
    barTrack.appendChild(barFill);
    item.appendChild(row);
    item.appendChild(barTrack);

    const refs = { item, nameEl, progressEl, barFill };
    updateQuestItemNodes(refs, quest, classes);
    return refs;
  }

  function updateQuestItemNodes(refs, quest, classes) {
    const { name, completed, pct, progressText } = computeQuestMetrics(quest);
    refs.nameEl.textContent = name;
    refs.nameEl.title = name;
    refs.progressEl.textContent = progressText;
    refs.barFill.style.width = `${pct}%`;
    refs.item.className = completed ? `${classes.item} ${classes.done}` : classes.item;
  }

  root.DQShared = {
    MESSAGE_PREFIX,
    AUTHOR_NAME,
    REPO_URL,
    DISCORD_ORIGIN_RE,
    formatSeconds,
    isValidQuestPayload,
    computeQuestMetrics,
    createQuestItemNodes,
    updateQuestItemNodes
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
