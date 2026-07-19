// aidos — eigenes Branchen-Icon-Set im Duktus des Bildzeichens (Messstrich-Motiv):
// geometrische Grundformen, eine Strichstärke (1.7), runde Kappen, currentColor.
// Frei gezeichnet, keine fremden Assets. Nutzung: aidosBranchIcon(branch, sizePx).
window.AIDOS_BRANCH_ICONS = {
  'Automobil': '<path d="M4.6 16.2H3.8a1.1 1.1 0 0 1-1.1-1.1v-2.3a2 2 0 0 1 1.4-1.9l1.5-.5 1.5-3.1a2 2 0 0 1 1.8-1.1h6.2a2 2 0 0 1 1.8 1.1l1.5 3.1 1.5.5a2 2 0 0 1 1.4 1.9v2.3a1.1 1.1 0 0 1-1.1 1.1h-.8"/><circle cx="8.1" cy="16.4" r="1.9"/><circle cx="15.9" cy="16.4" r="1.9"/><path d="M10 16.4h4"/><path d="M6.6 10.6h10.8"/>',
  'Gastronomie & Hotel': '<path d="M4.5 15.6h15"/><path d="M6.2 15.6a5.8 5.8 0 0 1 11.6 0"/><path d="M12 9.8V8.4"/><path d="M3.5 18.6h17"/>',
  'Fitness & Sport': '<path d="M7.6 8.2v7.6"/><path d="M4.9 9.8v4.4"/><path d="M16.4 8.2v7.6"/><path d="M19.1 9.8v4.4"/><path d="M7.6 12h8.8"/><path d="M2.6 12h2.3"/><path d="M19.1 12h2.3"/>',
  'Gesundheit': '<path d="M9.9 4.6h4.2v5.3h5.3v4.2h-5.3v5.3H9.9v-5.3H4.6V9.9h5.3z"/>',
  'Recht & Beratung': '<path d="M12 4.8v13.4"/><path d="M8.6 19.4h6.8"/><path d="M5.4 7.4 12 6l6.6 1.4"/><path d="M5.4 7.4l-2.3 4.9a2.95 2.95 0 0 0 4.6 0z"/><path d="M18.6 7.4l-2.3 4.9a2.95 2.95 0 0 0 4.6 0z"/>',
  'Immobilien': '<path d="M5.2 19.5V6.6a1.4 1.4 0 0 1 1.4-1.4h6.3a1.4 1.4 0 0 1 1.4 1.4v12.9"/><path d="M14.3 10.2h3.1a1.4 1.4 0 0 1 1.4 1.4v7.9"/><path d="M3.4 19.5h17.2"/><path d="M8 8.5h1.5M8 11.7h1.5M8 14.9h1.5M16.3 13.4h.6M16.3 16.2h.6"/>',
  'Beauty & Wellness': '<path d="M11.4 4.6c.5 3.1 1.9 4.9 5 5.4-3.1.5-4.5 2.3-5 5.4-.5-3.1-1.9-4.9-5-5.4 3.1-.5 4.5-2.3 5-5.4z"/><path d="M17.8 14.6c.3 1.7 1 2.7 2.7 3-1.7.3-2.4 1.3-2.7 3-.3-1.7-1-2.7-2.7-3 1.7-.3 2.4-1.3 2.7-3z"/>',
  'Handwerk & Bau': '<rect x="4.8" y="4.8" width="10.4" height="4.6" rx="1.3"/><path d="M10 9.4V19"/><path d="M17.6 7.1h2.6"/>',
  'Einzelhandel': '<path d="M6.1 8.6h11.8l-.9 9.6a1.9 1.9 0 0 1-1.9 1.7H8.9A1.9 1.9 0 0 1 7 18.2z"/><path d="M9.2 11.2V7.3a2.8 2.8 0 0 1 5.6 0v3.9"/>',
  'Sonstige': '<circle cx="6.4" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="17.6" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
};
window.AIDOS_BRANCH_ICONS['Unbekannt'] = window.AIDOS_BRANCH_ICONS['Sonstige'];
window.aidosBranchIcon = function (branch, size) {
  const p = window.AIDOS_BRANCH_ICONS[branch] || window.AIDOS_BRANCH_ICONS['Sonstige'];
  return '<svg class="bicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
    (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + p + '</svg>';
};
