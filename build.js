const esbuild = require('esbuild');
const fs = require('fs');

// Read the HTML file
const html = fs.readFileSync('./src/ui.html', 'utf8');

// Build the plugin
esbuild.buildSync({
  entryPoints: ['./src/main.ts'],
  bundle: true,
  outfile: './build/main.js',
  target: 'es6',
  define: {
    '__html__': JSON.stringify(html)
  }
}); 