(function() {
  'use strict';

  const MESSAGE_PREFIX = 'DISCORD_QUEST_COMPLETER';
  const RUNTIME_KEY = Symbol.for('discord.autoQuest.runtime');
  const SUPPORTED_TASKS = [
    'WATCH_VIDEO',
    'PLAY_ON_DESKTOP',
    'STREAM_ON_DESKTOP',
    'PLAY_ACTIVITY',
    'WATCH_VIDEO_ON_MOBILE'
  ];
  const MAX_CONSECUTIVE_ERRORS = 5;
  const NON_RETRYABLE_STATUSES = new Set([401, 403, 404]);

  const runtime = window[RUNTIME_KEY] || (window[RUNTIME_KEY] = {
    active: false,
    aborted: false,
    sleepCancel: null,
    webpackRequire: null,
    listenerAttached: false
  });

  if (runtime.active) {
    return;
  }

  if (!runtime.listenerAttached) {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.prefix === MESSAGE_PREFIX && event.data?.type === 'STOP_QUESTS') {
        runtime.aborted = true;
        if (typeof runtime.sleepCancel === 'function') {
          runtime.sleepCancel();
        }
      }
    });
    runtime.listenerAttached = true;
  }

  function sendUpdate(type, data) {
    window.postMessage({
      prefix: MESSAGE_PREFIX,
      type,
      data
    }, window.location.origin);
  }

  function hasMinimumModules(moduleCache, minCount) {
    let count = 0;
    for (const key in moduleCache) {
      if (Object.prototype.hasOwnProperty.call(moduleCache, key)) {
        count++;
        if (count >= minCount) return true;
      }
    }
    return false;
  }

  function sleepWithAbort(ms) {
    if (runtime.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        runtime.sleepCancel = null;
        resolve();
      }, ms);
      runtime.sleepCancel = () => {
        clearTimeout(timer);
        runtime.sleepCancel = null;
        resolve();
      };
    });
  }

  function waitForWebpack(callback) {
    if (runtime.webpackRequire?.c && hasMinimumModules(runtime.webpackRequire.c, 10)) {
      callback(runtime.webpackRequire);
      return;
    }

    const checkInterval = 100;
    const maxAttempts = 100;
    let attempts = 0;

    const check = () => {
      if (runtime.aborted) {
        runtime.active = false;
        return;
      }
      if (attempts >= maxAttempts) {
        sendUpdate('QUEST_ERROR', { message: 'Timed out waiting for Discord webpack modules.', fatal: true });
        runtime.active = false;
        return;
      }

      if (typeof window.webpackChunkdiscord_app === 'undefined') {
        attempts++;
        setTimeout(check, checkInterval);
        return;
      }

      const hasOriginalJQuery = Object.prototype.hasOwnProperty.call(window, '$');
      const originalJQuery = window.$;
      let webpackRequire = null;

      try {
        if (hasOriginalJQuery) {
          delete window.$;
        }
        webpackRequire = window.webpackChunkdiscord_app.push([[Symbol()], {}, (require) => require]);
        window.webpackChunkdiscord_app.pop();
      } catch {
        attempts++;
        setTimeout(check, checkInterval);
        return;
      } finally {
        if (hasOriginalJQuery) {
          window.$ = originalJQuery;
        }
      }

      if (!webpackRequire?.c || !hasMinimumModules(webpackRequire.c, 10)) {
        attempts++;
        setTimeout(check, checkInterval);
        return;
      }

      runtime.webpackRequire = webpackRequire;
      callback(webpackRequire);
    };

    check();
  }

  function matchExport(exports, predicate) {
    if (!exports) return null;
    if (exports.A && predicate(exports.A)) return exports.A;
    if (exports.Ay && predicate(exports.Ay)) return exports.Ay;
    if (exports.ZP && predicate(exports.ZP)) return exports.ZP;
    if (predicate(exports)) return exports;
    return null;
  }

  function loadStores(webpackRequire) {
    let QuestsStore = null;
    let ChannelStore = null;
    let GuildChannelStore = null;
    let apiModule = null;

    try {
      const modules = Object.values(webpackRequire.c);
      for (let i = 0; i < modules.length; i++) {
        const exports = modules[i]?.exports;
        if (!exports) continue;

        if (!QuestsStore) {
          QuestsStore = matchExport(exports, (m) => m.__proto__?.getQuest);
        }
        if (!ChannelStore) {
          ChannelStore = matchExport(exports, (m) => m.__proto__?.getAllThreadsForParent);
        }
        if (!GuildChannelStore) {
          GuildChannelStore = matchExport(exports, (m) => m.getSFWDefaultChannel);
        }
        if (!apiModule) {
          apiModule = matchExport(exports, (m) => m.Bo?.get || m.tn?.get);
        }

        if (QuestsStore && ChannelStore && GuildChannelStore && apiModule) {
          break;
        }
      }

      if (!QuestsStore || !apiModule) return null;

      return {
        QuestsStore,
        ChannelStore,
        GuildChannelStore,
        api: apiModule.Bo || apiModule.tn || apiModule
      };
    } catch (error) {
      console.error('[Discord Auto Quest] Failed to load Discord stores:', error);
      return null;
    }
  }

  function getActiveQuests(QuestsStore) {
    if (!QuestsStore?.quests) return [];

    return [...QuestsStore.quests.values()].filter((quest) => {
      const expiresAt = quest.config?.expiresAt ? new Date(quest.config.expiresAt).getTime() : 0;
      const isExpired = expiresAt <= Date.now();
      const isCompleted = !!quest.userStatus?.completedAt;
      const isEnrolled = !!quest.userStatus?.enrolledAt;
      const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
      const tasks = taskConfig?.tasks;
      if (!tasks) return false;

      const hasSupportedTask = SUPPORTED_TASKS.some((type) => tasks[type] != null);
      return isEnrolled && !isCompleted && !isExpired && hasSupportedTask;
    });
  }

  function initializeQuestState(quest) {
    const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
    const tasks = taskConfig?.tasks ?? {};
    const taskType = SUPPORTED_TASKS.find((type) => tasks[type] != null);
    const taskData = taskType ? tasks[taskType] : null;
    const secondsNeeded = Math.max(0, Number(taskData?.target ?? 0));
    const currentProgress = Number(
      quest.userStatus?.progress?.[taskType]?.value ??
      quest.userStatus?.streamProgressSeconds ??
      0
    );

    return {
      quest,
      taskType,
      secondsNeeded,
      currentProgress,
      completed: currentProgress >= secondsNeeded,
      questName: quest.config?.messages?.questName ?? 'Unknown Quest'
    };
  }

  function notifyUI(quest, progress, target, completed) {
    sendUpdate('QUEST_UPDATE', {
      id: quest.id,
      name: quest.config?.messages?.questName ?? 'Unknown Quest',
      progress,
      target,
      completed
    });
  }

  function extractErrorDetails(error) {
    const status = error?.status ?? error?.body?.status ?? null;
    const retryAfter = Number(error?.body?.retry_after ?? 0);
    const message = error?.body?.message || error?.message || 'Unknown API error';
    return { status, retryAfter, message };
  }

  async function processVideoStep(state, api) {
    const { quest, secondsNeeded, currentProgress } = state;
    const step = 1 + Math.random() * 0.4;
    const nextTime = Math.min(secondsNeeded, currentProgress + step);

    const res = await api.post({
      url: `/quests/${quest.id}/video-progress`,
      body: { timestamp: nextTime }
    });

    const isServerCompleted = res?.body?.completed_at != null;
    state.currentProgress = nextTime;

    if (isServerCompleted || state.currentProgress >= secondsNeeded) {
      state.currentProgress = secondsNeeded;
      state.completed = true;
      notifyUI(quest, secondsNeeded, secondsNeeded, true);
    } else {
      notifyUI(quest, Math.floor(state.currentProgress), secondsNeeded, false);
    }
  }

  async function processHeartbeatStep(state, stores) {
    const { api, ChannelStore, GuildChannelStore } = stores;
    const { quest, taskType, secondsNeeded } = state;

    const privateChannels = ChannelStore?.getSortedPrivateChannels?.();
    let channelId = Array.isArray(privateChannels) ? privateChannels[0]?.id : undefined;

    if (!channelId && GuildChannelStore?.getAllGuilds) {
      const guilds = Object.values(GuildChannelStore.getAllGuilds() || {});
      const voice = guilds.find((g) => g?.VOCAL?.length > 0 && g.VOCAL[0]?.channel?.id);
      if (voice) channelId = voice.VOCAL[0].channel.id;
    }

    const streamKey = channelId ? `call:${channelId}:1` : `call:${quest.id}:1`;

    const response = await api.post({
      url: `/quests/${quest.id}/heartbeat`,
      body: { stream_key: streamKey, terminal: false }
    });

    const serverProgress = Number(response?.body?.progress?.[taskType]?.value ?? 0);
    state.currentProgress = serverProgress;

    if (state.currentProgress >= secondsNeeded) {
      await api.post({
        url: `/quests/${quest.id}/heartbeat`,
        body: { stream_key: streamKey, terminal: true }
      });
      state.currentProgress = secondsNeeded;
      state.completed = true;
      notifyUI(quest, secondsNeeded, secondsNeeded, true);
    } else {
      notifyUI(quest, Math.floor(state.currentProgress), secondsNeeded, false);
    }
  }

  async function runQuestCode(webpackRequire) {
    let completedCount = 0;
    let totalCount = 0;

    try {
      const version = window.__QUEST_VERSION || 'unknown';
      if ('__QUEST_VERSION' in window) {
        try { delete window.__QUEST_VERSION; } catch {}
      }
      console.info(`Discord Auto Quest: Initializing... (v${version})`);

      const stores = loadStores(webpackRequire);
      if (!stores) {
        sendUpdate('QUEST_ERROR', {
          message: 'Could not locate Discord internal stores. Try refreshing the page.',
          fatal: true
        });
        return;
      }

      const activeQuests = getActiveQuests(stores.QuestsStore);
      if (activeQuests.length === 0) {
        console.info("Discord Auto Quest: You don't have any uncompleted active quests!");
        sendUpdate('QUEST_LIST', []);
        sendUpdate('QUEST_FINISHED', { completed: 0, total: 0, stopped: false });
        return;
      }

      const questStates = activeQuests.map((quest) => initializeQuestState(quest));
      totalCount = questStates.length;

      sendUpdate('QUEST_STARTED', { total: totalCount });
      sendUpdate('QUEST_LIST', questStates.map((state) => ({
        id: state.quest.id,
        name: state.questName,
        progress: Math.floor(state.currentProgress),
        target: state.secondsNeeded,
        completed: state.completed
      })));

      for (const state of questStates) {
        if (runtime.aborted) break;
        if (state.completed) {
          completedCount++;
          continue;
        }
        if (!state.taskType) continue;

        let consecutiveErrors = 0;

        while (!state.completed && !runtime.aborted) {
          const expiresAt = state.quest.config?.expiresAt
            ? new Date(state.quest.config.expiresAt).getTime()
            : Infinity;
          if (expiresAt <= Date.now()) {
            sendUpdate('QUEST_ERROR', {
              questId: state.quest.id,
              message: `Quest "${state.questName}" expired before completion.`
            });
            break;
          }

          const isVideo = state.taskType.startsWith('WATCH_VIDEO');

          try {
            if (isVideo) {
              await processVideoStep(state, stores.api);
            } else {
              await processHeartbeatStep(state, stores);
            }
            consecutiveErrors = 0;

            if (state.completed) {
              completedCount++;
              break;
            }
          } catch (error) {
            consecutiveErrors++;
            const { status, retryAfter, message } = extractErrorDetails(error);
            console.error(`[Discord Auto Quest] Step error for "${state.questName}":`, error);

            if (status && NON_RETRYABLE_STATUSES.has(status)) {
              sendUpdate('QUEST_ERROR', {
                questId: state.quest.id,
                message: `Stopped "${state.questName}" (${status}: ${message}).`,
                fatal: status === 401 || status === 403
              });
              if (status === 401 || status === 403) {
                runtime.aborted = true;
              }
              break;
            }

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              sendUpdate('QUEST_ERROR', {
                questId: state.quest.id,
                message: `Failed "${state.questName}" after ${MAX_CONSECUTIVE_ERRORS} retries: ${message}`
              });
              break;
            }

            if (status === 429 && retryAfter > 0) {
              const backoffMs = Math.min(retryAfter, 60) * 1000 + 250;
              await sleepWithAbort(backoffMs);
              continue;
            }
          }

          if (!state.completed && !runtime.aborted) {
            const delayMs = isVideo
              ? 1100 + Math.random() * 400
              : 20000 + Math.random() * 2000;
            await sleepWithAbort(delayMs);
          }
        }
      }

      sendUpdate('QUEST_FINISHED', {
        completed: completedCount,
        total: totalCount,
        stopped: runtime.aborted
      });
    } catch (error) {
      console.error('[Discord Auto Quest] Unexpected execution error:', error);
      sendUpdate('QUEST_ERROR', {
        message: error?.message || 'Unexpected error during quest execution.',
        fatal: true
      });
    } finally {
      runtime.active = false;
      runtime.aborted = false;
      runtime.sleepCancel = null;
    }
  }

  runtime.active = true;
  runtime.aborted = false;
  waitForWebpack(runQuestCode);
})();
