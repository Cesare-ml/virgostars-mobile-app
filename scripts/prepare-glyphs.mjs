// Default local builds keep owner-approved private glyph staging.
// The iOS CI preview uses generated OFL Noto glyphs instead, avoiding
// redistribution of the privately approved VirgoStars image pack.
if (process.env.VIRGOSTARS_IOS_CI === '1') {
  await import('./prepare-ios-open-glyphs.mjs');
} else {
  await import('./prepare-private-glyphs.mjs');
}
