# Leonardo to Figma Variables

A Figma plugin for working with color variable collections - create visual swatches and export variables in multiple formats.

## 🚀 Quick Start

```bash
npm install
npm run build
```

Load the plugin in Figma by pointing to the `manifest.json` file.

## 📁 Project Structure

```
├── src/
│   ├── main.ts          # 🎯 MAIN ENTRY POINT - Edit this file for changes
│   └── ui.html          # Plugin UI interface
├── build/
│   └── main.js          # Compiled plugin output (auto-generated)
├── build.js             # esbuild configuration
├── manifest.json        # Figma plugin manifest
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## ⚠️ CRITICAL: Which File to Edit

**🎯 Always edit `src/main.ts`** - This is the entry point defined in `build.js`

- ✅ `src/main.ts` - Active plugin code (gets compiled to `build/main.js`)
- ✅ `src/ui.html` - Plugin UI (embedded in build)

## 🛠 Development

### Available Scripts

```bash
npm run build    # Build plugin once
npm run watch    # Watch for changes and rebuild automatically
```

### Build Process

1. **Entry Point**: `src/main.ts`
2. **Bundler**: esbuild (configured in `build.js`)
3. **UI**: `src/ui.html` is embedded as `__html__` variable
4. **Output**: `build/main.js`

### Adding New Features

1. Edit `src/main.ts` (NOT `code.ts`)
2. Run `npm run build`
3. Reload plugin in Figma
4. Test your changes

## 🎨 Current Features

### Swatch Creation
- Creates visual color swatches from variable collections
- Automatically determines text color based on background luminance
- Binds variables to component properties for dynamic updates
- Positions swatches in organized frames

### Variable Export
- Export color variables in multiple formats:
  - **CSS Custom Properties** - `--variable-name: rgb(r, g, b);`
  - **JSON** - Structured data with RGB values and hex codes
  - **Design Tokens** - W3C Design Tokens specification format
- Displays exported data in copyable textarea
- Filters to only color variables (excludes text/number variables)

### Message Handling
The plugin responds to these UI messages:
- `'create-swatches'` - Generate visual swatches from a collection
- `'export-collection'` - Export variables in specified format (css/json/tokens)

## 🏗 Architecture

### Plugin Architecture
- **Main Thread** (`main.ts`): Figma API access, variable processing
- **UI Thread** (`ui.html`): User interface, message passing

### Communication Flow
```
UI (ui.html) → postMessage → Main (main.ts) → Figma API
                           ↙
UI ← postMessage ← Processing Results
```

### Key Dependencies
- `@figma/plugin-typings` - TypeScript definitions for Figma API
- `esbuild` - Fast JavaScript bundler
- `typescript` - TypeScript compiler
- `nodemon` - Development file watcher (dev only)

## 📦 Dependencies Explained

### Production Dependencies
- `@rogieking/figui3` - Modern web component library for Figma UI3 styling

### Development Dependencies
- `@figma/plugin-typings` - Required for TypeScript development
- `esbuild` - Bundles TypeScript → JavaScript
- `typescript` - Compiles TypeScript
- `nodemon` - Auto-rebuilds on file changes (watch mode only)

## 🔧 Build Configuration

The build is configured in `build.js`:
- Bundles `src/main.ts` as entry point  
- Embeds figui3 base CSS for Figma theming (no JavaScript needed)
- Embeds the complete UI as `__html__` variable
- Outputs single `build/main.js` file with hybrid styling
- Targets ES6 JavaScript

### figui3 Integration

The plugin uses `@rogieking/figui3` web components for native Figma UI3 styling.

#### Root Cause Analysis: @import Issues in Embedded Contexts

**The Problem:** figui3's main `fig.css` file uses `@import` statements:
```css
@import url("base.css");
@import url("components.css");
```

**Why This Fails:** When CSS is embedded as a string in Figma plugins (via `figma.showUI()`), `@import` statements don't work because the imported files aren't accessible from the embedded HTML context.

**The Solution:** Read and combine CSS files directly in the build process:

```javascript
// build.js - Read CSS files directly to avoid @import issues
const figui3BaseCSS = fs.readFileSync('./node_modules/@rogieking/figui3/base.css', 'utf8');
const figui3ComponentsCSS = fs.readFileSync('./node_modules/@rogieking/figui3/components.css', 'utf8');
const combinedCSS = `${figui3BaseCSS}\n\n${figui3ComponentsCSS}`;
```

#### Web Components Architecture

The plugin uses figui3 web components properly:
- `<fig-header>` for section headings
- `<fig-field>` for form field containers  
- `<fig-dropdown>` for select inputs
- `<fig-button>` with variants (`primary`, `secondary`, `ghost`)
- Standard `<textarea>` for code output (styled with figui3 CSS variables)

#### Event Handling - The Right Way

figui3 web components use **standard DOM events**, making event handling simple:

```javascript
// Clean standard event listeners - no hacks needed!
collectionSelect.addEventListener('change', (e) => {
    handleCollectionChange(e.target.value); // Just works!
});
```

**Key advantages of proper figui3 usage:**
- ✅ **Standard DOM events** - Web components emit normal browser events
- ✅ **Native Figma styling** - Complete UI3 design system integration
- ✅ **Web standards** - Uses proper web component architecture
- ✅ **Clean code** - No event bridging or workarounds needed
- ✅ **Future-proof** - Built on web standards, not proprietary systems

#### Known Limitations

Due to Figma's embedded iframe architecture, some figui3 features don't work as documented:

- **`<fig-tabs>`** doesn't manage content panels automatically — we handle tab switching manually with custom JavaScript
- **`<fig-radio>`** requires accessing internal `input` elements for value retrieval
- **CSS `@import`** statements fail in embedded contexts — the build process manually combines CSS files

This workaround will remain until figui3 provides a pre-bundled distribution for Figma plugins.

## 🚨 Breaking Changes & Updates

**When making breaking changes to this plugin:**

1. **Update this README** - Document new features, changed file structure, or modified build process
2. **Update package.json version** - Increment version number
3. **Test thoroughly** - Both swatch creation and export functionality
4. **Update manifest.json** if adding new permissions or changing plugin name/description

### Recent Major Changes
- **Hybrid figui3 Implementation** - Uses figui3 base styles with standard HTML elements
- **Simplified Architecture** - Eliminated complex event bridging with clean standard DOM events
- **Standard Elements** - Reliable `<select>`, `<button>`, `<textarea>` elements with custom styling
- **Reduced Complexity** - Removed ~100 lines of complex event handling code
- **Native Figma Typography** - Proper Inter font stack with figui3 color variables
- **Fixed CSS Variables** - Defined missing font and spacing variables for consistent styling
- **Iframe Compatibility** - Avoided web component issues in Figma's embedded environment

### Common Breaking Changes
- Changing entry point in `build.js`
- Modifying UI message types in `main.ts`
- Adding new dependencies
- Changing build output location
- Modifying plugin permissions in `manifest.json`

## 🐛 Troubleshooting

### Plugin Not Updating
- Run `npm run build`
- Reload plugin in Figma (right-click → Reload)

### "Collection Not Found" Error
- Ensure the Figma file has variable collections
- Check that collections contain color variables (not just text/number)

### Build Errors
- Check that you're editing `src/main.ts` (not `code.ts`)
- Ensure all imports and types are correct
- Run `npm run build` to see specific error messages

### No Visual Changes
- Verify you edited `src/main.ts` (the actual entry point)
- Check browser console for JavaScript errors
- Ensure `build/main.js` was generated after your changes

## 📝 Development Notes

### Variable Processing
- Uses `figma.variables.getLocalVariableCollections()` to get collections
- Filters for color variables using `variable.resolvedType === 'COLOR'`
- Processes variables by mode (defaults to first mode in collection)

### Component Binding
- Looks for a "color swatch" component in the current file
- Binds variables to component properties dynamically
- Falls back to direct color fills if binding fails

### Text Color Logic  
- Calculates luminance: `0.299*R + 0.587*G + 0.114*B`
- Uses "white-clouds" variable for dark backgrounds (luminance < 0.5)
- Uses "night-shift" variable for light backgrounds
- Falls back gracefully if text color variables don't exist

## 📄 License

MIT License

---

**Remember**: Always edit `src/main.ts` and run `npm run build` after changes!
