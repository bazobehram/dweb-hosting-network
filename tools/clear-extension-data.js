/**
 * Clear Extension Data - Run this in browser console
 * Opens extension panel and clears all local data
 */

// Instructions to run:
// 1. Open extension panel: chrome-extension://dhnlmdolnenmkealoekhnmjknllealip/panel/panel.html
// 2. Open console (F12)
// 3. Paste and run this code

(async function clearAllData() {
  console.log('🧹 Clearing all DWeb extension data...');
  
  try {
    // Clear localStorage
    const localStorageKeys = Object.keys(localStorage);
    console.log(`📦 Clearing ${localStorageKeys.length} localStorage items...`);
    localStorage.clear();
    console.log('✅ localStorage cleared');
    
    // Clear IndexedDB (where apps and chunks are stored)
    const databases = await indexedDB.databases();
    console.log(`💾 Found ${databases.length} IndexedDB databases:`);
    
    for (const db of databases) {
      console.log(`   Deleting: ${db.name}`);
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(db.name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      console.log(`   ✅ Deleted: ${db.name}`);
    }
    
    // Clear chrome.storage (if accessible)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.clear();
      console.log('✅ chrome.storage.local cleared');
      
      await chrome.storage.sync.clear();
      console.log('✅ chrome.storage.sync cleared');
    }
    
    console.log('');
    console.log('✅ All extension data cleared!');
    console.log('📝 Reload the extension page to see clean state');
    console.log('');
    console.log('To reload: location.reload()');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
  }
})();
