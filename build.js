const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Read source files  
let html = fs.readFileSync('./src/ui.html', 'utf8');

// Test: Include figui3 JavaScript to make web components work
const figui3BaseCSS = fs.readFileSync('./node_modules/@rogieking/figui3/base.css', 'utf8');
const figui3ComponentsCSS = fs.readFileSync('./node_modules/@rogieking/figui3/components.css', 'utf8');
const figui3JS = fs.readFileSync('./node_modules/@rogieking/figui3/fig.js', 'utf8');
const combinedCSS = `${figui3BaseCSS}\n\n${figui3ComponentsCSS}`;

// Inject CSS and JavaScript
html = html.replace('<head>', `<head>\n<style>\n/* figui3 styles */\n${combinedCSS}\n</style>`);
html = html.replace('</body>', `<script>\n/* figui3 web components */\n${figui3JS}\n</script>\n</body>`);

// Build the plugin
esbuild.buildSync({
  entryPoints: ['./src/main.ts'],
  bundle: true,
  outfile: './build/main.js',
  target: 'es6',
  define: {
    '__html__': JSON.stringify(html)
  },
  minify: false,
});

console.log('✅ Build complete'); 