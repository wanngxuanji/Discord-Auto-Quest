(function() {
  'use strict';

  const electronUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Discord/1.0.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36';
  const spoofedBrands = [
    { brand: 'Not_A Brand', version: '8' },
    { brand: 'Chromium', version: '120' },
    { brand: 'Discord', version: '1.0' }
  ];

  function defineNavigatorGetter(prop, value) {
    try {
      Object.defineProperty(navigator, prop, {
        get: function() {
          return value;
        },
        configurable: true
      });
    } catch (error) {
      console.error(`[Discord Auto Quest] Failed to override navigator.${prop}:`, error);
    }
  }

  defineNavigatorGetter('userAgent', electronUserAgent);
  defineNavigatorGetter('platform', 'Win32');

  if ('userAgentData' in navigator) {
    const spoofedUserAgentData = {
      brands: spoofedBrands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async function(hints) {
        const result = {
          brands: spoofedBrands,
          mobile: false,
          platform: 'Windows'
        };
        if (Array.isArray(hints)) {
          if (hints.includes('architecture')) result.architecture = 'x86';
          if (hints.includes('bitness')) result.bitness = '64';
          if (hints.includes('platformVersion')) result.platformVersion = '15.0.0';
          if (hints.includes('uaFullVersion')) result.uaFullVersion = '120.0.6099.109';
          if (hints.includes('fullVersionList')) {
            result.fullVersionList = spoofedBrands.map((b) => ({
              brand: b.brand,
              version: b.brand === 'Chromium' ? '120.0.6099.109' : b.version
            }));
          }
        }
        return result;
      },
      toJSON: function() {
        return {
          brands: spoofedBrands,
          mobile: false,
          platform: 'Windows'
        };
      }
    };
    defineNavigatorGetter('userAgentData', spoofedUserAgentData);
  }
})();
