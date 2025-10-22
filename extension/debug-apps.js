// Paste this in the browser console when the panel is open to debug

console.log('=== DWeb Apps Diagnostic ===');

// Check localStorage
const appsRaw = localStorage.getItem('dweb-published-apps');
console.log('Raw storage:', appsRaw);

if (appsRaw) {
  try {
    const apps = JSON.parse(appsRaw);
    console.log('Parsed apps:', apps);
    console.log('Number of apps:', apps.length);
    
    if (apps.length > 0) {
      console.log('First app:', apps[0]);
    }
  } catch (e) {
    console.error('Failed to parse apps:', e);
  }
} else {
  console.log('No apps found in localStorage');
}

// Check the select element
const select = document.getElementById('bindingAppSelect');
if (select) {
  console.log('Select element found');
  console.log('Number of options:', select.options.length);
  console.log('Options:', Array.from(select.options).map(o => o.textContent));
  console.log('Is disabled?', select.disabled);
} else {
  console.error('Select element not found!');
}

console.log('=== End Diagnostic ===');
