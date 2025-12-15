figma.showUI(__html__);

// Dynamic UI sizing configuration
const UI_CONFIG = {
  width: {
    min: 280,
    default: 320,
    max: 480
  },
  height: {
    min: 300,
    compact: 420,      // Base UI with tabs, no export results
    expanded: 680,     // UI with tabs and export results visible  
    max: 800
  }
};

// Initialize with compact size
figma.ui.resize(UI_CONFIG.width.default, UI_CONFIG.height.compact);

// Get all variable collections
const variableCollections = figma.variables.getLocalVariableCollections();

// Send collections and UI configuration to the UI
figma.ui.postMessage({
  type: 'collections',
  collections: variableCollections.map(collection => ({
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map(mode => ({
      id: mode.modeId,
      name: mode.name
    }))
  })),
  uiConfig: UI_CONFIG
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'resize-ui') {
    // Handle dynamic UI resizing requests from the UI thread
    const { width, height } = msg;
    const constrainedWidth = Math.min(Math.max(width || UI_CONFIG.width.default, UI_CONFIG.width.min), UI_CONFIG.width.max);
    const constrainedHeight = Math.min(Math.max(height || UI_CONFIG.height.compact, UI_CONFIG.height.min), UI_CONFIG.height.max);
    
    figma.ui.resize(constrainedWidth, constrainedHeight);
  }

  if (msg.type === 'analyze-tokens') {
    try {
      const { collectionId, targetMode, tokensData } = msg;
      console.log('📊 Analyzing tokens for mapping preview...');
      
      const mappingPreview = await createMappingPreview(collectionId, targetMode, tokensData);
      
      figma.ui.postMessage({
        type: 'mapping-preview',
        preview: mappingPreview
      });
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Analysis failed: ' + (error as Error).message
      });
    }
  }

  if (msg.type === 'apply-updates') {
    try {
      const { collectionId, targetMode, tokensData, mappingData } = msg;
      
      // Apply the updates to the Figma variables
      const result = await applyVariableUpdates(collectionId, targetMode, tokensData, mappingData);
      
      figma.ui.postMessage({
        type: 'update-complete',
        message: `Successfully updated ${result.updatedCount} variables`,
        updatedCount: result.updatedCount
      });
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: (error as Error).message
      });
    }
  }

  if (msg.type === 'export-collection') {
    const collection = figma.variables.getVariableCollectionById(msg.collectionId);
    if (!collection) {
      figma.notify('Collection not found');
      return;
    }

    // Get all variables in the collection
    const variables = collection.variableIds
      .map(id => figma.variables.getVariableById(id))
      .filter(variable => variable !== null);

    // Filter to only color variables
    const colorVariables = variables.filter(variable => {
      const value = variable.valuesByMode[collection.defaultModeId];
      return typeof value === 'object' && value !== null && 'r' in value;
    });

    let exportedData = '';
    
    if (msg.format === 'css') {
      exportedData = exportToCSS(colorVariables, collection);
    } else if (msg.format === 'json') {
      exportedData = exportToJSON(colorVariables, collection);
    } else if (msg.format === 'tokens') {
      exportedData = exportToDesignTokens(colorVariables, collection);
    }

    figma.ui.postMessage({
      type: 'exported',
      data: exportedData
    });
  }

  if (msg.type === 'create-swatches') {
    try {
      // Immediately acknowledge receipt to ensure UI feedback
      figma.ui.postMessage({ type: 'progress', completed: 0, total: 1, message: 'Starting...' });

      // Find the color swatch component
      const colorSwatchComponent = figma.root.findOne(node => 
        node.type === 'COMPONENT' && node.name.toLowerCase() === 'color swatch'
      ) as ComponentNode;

      if (!colorSwatchComponent) {
        figma.ui.postMessage({ type: 'error', message: 'Color swatch component not found. Please ensure a component named "color swatch" exists in your file.' });
        return;
      }

      const collection = figma.variables.getVariableCollectionById(msg.collectionId);
      if (!collection) {
        figma.ui.postMessage({ type: 'error', message: 'Collection not found' });
        return;
      }

      // Get all variables from the collection
      const allVariables = collection.variableIds.map(id => figma.variables.getVariableById(id));
      
      // Filter for color variables and ensure they're not null
      const colorVariables = allVariables.filter((variable): variable is Variable => {
        if (!variable) return false;
        return variable.resolvedType === 'COLOR';
      });

      console.log(`Processing ${colorVariables.length} color variables`);
      
      // Send initial progress with correct total
      figma.ui.postMessage({ type: 'progress', completed: 0, total: colorVariables.length, message: 'Processing variables...' });

      if (colorVariables.length === 0) {
        figma.ui.postMessage({ type: 'error', message: 'No color variables found in collection' });
        return;
      }

      // Create a frame to hold all swatches
      const frame = figma.createFrame();
      frame.name = `${collection.name} - Color Swatches`;
      frame.layoutMode = 'HORIZONTAL';
      frame.layoutWrap = 'WRAP';
      frame.itemSpacing = 16;
      frame.fills = [];
      frame.counterAxisSizingMode = 'AUTO';
      frame.primaryAxisSizingMode = 'AUTO';

      // Load the font for text fields
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });

      // Process each color variable
      for (let i = 0; i < colorVariables.length; i++) {
        const variable = colorVariables[i];
        console.log(`Processing variable ${i + 1}/${colorVariables.length}: ${variable.name}`);

        // Send progress update to UI
        figma.ui.postMessage({ 
          type: 'progress', 
          completed: i + 1, 
          total: colorVariables.length 
        });

        try {
          // Create an instance of the color swatch component
          const swatchInstance = colorSwatchComponent.createInstance();
          
          // Get the current mode ID
          const modeId = collection.modes[0].modeId;
          const colorValue = variable.valuesByMode[modeId];

          // Simple check for accessibility: determine if text should be light or dark
          // Convert RGB to luminance using the formula: 0.299*R + 0.587*G + 0.114*B
          const r = (colorValue as RGB).r;
          const g = (colorValue as RGB).g;
          const b = (colorValue as RGB).b;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // If luminance is low (dark color), use white-clouds (light text)
          // Otherwise use the default night-shift (dark text)
          let textVariableName = "text-primary"; // Default dark text
          if (luminance < 0.5) {
            textVariableName = "text-inverse"; // Use light text for dark backgrounds
          }
          
          // Try to find the text variable
          const textVariable = figma.variables.getLocalVariables().find(v => 
            v.name === textVariableName && v.resolvedType === 'COLOR'
          );

          if (textVariable) {
            console.log(`Using text color variable: ${textVariableName} for ${variable.name}`);
          } else {
            console.log(`Text color variable ${textVariableName} not found`);
          }

          // Set text properties
          const propertyNames = Object.keys(swatchInstance.componentProperties);
          for (const key of propertyNames) {
            const propertyName = key.toLowerCase();
            
            // Handle name properties
            if (propertyName.includes('name')) {
              swatchInstance.setProperties({
                [key]: variable.name
              });
            }
            
            // Handle hex/code properties
            if (propertyName.includes('code') || propertyName.includes('hex')) {
              const hexColor = rgbToHex(colorValue as RGB);
              swatchInstance.setProperties({
                [key]: hexColor
              });
            }
            
            // No longer try to set text color via component properties
          }
          
          // Approach 2: Try to find and modify text layers directly
          if (textVariable) {
            try {
              // Find text nodes inside the instance
              const textNodes = swatchInstance.findAll(node => 
                node.type === 'TEXT' && 
                (node.name === 'Name' || node.name === 'Hex' || node.name.includes('Text'))
              ) as TextNode[];
              
              console.log(`Found ${textNodes.length} text nodes to colorize with ${textVariableName} variable`);
              
              // Set fills on each text node
              for (const textNode of textNodes) {
                try {
                  // First set a basic fill (required before binding variable)
                  textNode.fills = [{
                    type: 'SOLID',
                    color: { r: 0, g: 0, b: 0 }
                  }];
                  
                  // Then bind the variable using boundVariables
                  textNode.fills = [{
                    type: 'SOLID',
                    color: { r: 0, g: 0, b: 0 },
                    boundVariables: {
                      color: {
                        type: 'VARIABLE_ALIAS',
                        id: textVariable.id
                      }
                    }
                  }];
                  
                  console.log(`Bound text color on "${textNode.name}" to ${textVariableName} variable`);
                } catch (nodeError) {
                  console.log(`Failed to set text color on ${textNode.name}:`, nodeError);
                }
              }
            } catch (findError) {
              console.log('Error finding text nodes:', findError);
            }
          } else {
            console.log(`Could not find ${textVariableName} variable for text color`);
          }

          // Try to bind the variable directly to the fill
          try {
            // Check if there's a Fill component property
            const propertyNames = Object.keys(swatchInstance.componentProperties);
            const fillPropertyKey = propertyNames.find(key => key === 'Fill');
            
            if (fillPropertyKey) {
              console.log('Found Fill property, binding variable directly');
              
              // Bind the variable to the Fill property
              swatchInstance.setProperties({
                [fillPropertyKey]: {
                  type: 'VARIABLE_ALIAS',
                  id: variable.id
                }
              });
              
              console.log('Successfully bound variable to Fill property');
            } else {
              console.log('No Fill property found, trying direct variable binding');
              
              // Try direct variable binding to the instance fill
              swatchInstance.fills = [{
                type: 'SOLID',
                visible: true,
                opacity: 1,
                color: { r: 0, g: 0, b: 0 },
                boundVariables: {
                  color: {
                    type: 'VARIABLE_ALIAS',
                    id: variable.id
                  }
                }
              }];
              
              console.log('Directly bound variable to fill');
            }
            
            // Store the variable reference
            swatchInstance.setPluginData('variableId', variable.id);
          } catch (error) {
            console.error('Error binding variable to fill:', error);
            
            // Fallback: set the fill directly with the current color value
            try {
              // Extract RGB values from the variable's color value
              const modeId = collection.modes[0].modeId;
              const colorValue = variable.valuesByMode[modeId];
              let r = 0, g = 0, b = 0;
              
              if (typeof colorValue === 'object' && colorValue !== null) {
                r = 'r' in colorValue ? Number(colorValue.r) : 0;
                g = 'g' in colorValue ? Number(colorValue.g) : 0;
                b = 'b' in colorValue ? Number(colorValue.b) : 0;
              }
              
              // Set the raw fill as fallback
              swatchInstance.fills = [{
                type: 'SOLID',
                visible: true,
                opacity: 1,
                color: { r, g, b }
              }];
              
              console.log('Fallback: Set raw color fill on instance');
            } catch (fallbackError) {
              console.error('Even fallback failed:', fallbackError);
            }
          }

          // Add the instance to the frame
          frame.appendChild(swatchInstance);
          console.log(`Added ${variable.name} to frame with properties set`);

        } catch (error) {
          console.error(`Error processing variable ${variable.name}:`, error);
        }
      }

      // Position the frame in the center of the viewport
      frame.x = figma.viewport.center.x - frame.width / 2;
      frame.y = figma.viewport.center.y - frame.height / 2;

      // Select the frame
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);

      figma.ui.postMessage({ type: 'success', message: `Created ${colorVariables.length} color swatches!` });

    } catch (error) {
      console.error('Error in plugin execution:', error);
      figma.ui.postMessage({ type: 'error', message: 'An error occurred while creating the swatches.' });
    }
  }
};

// Helper function to convert RGB to Hex
function rgbToHex(color: RGB | RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function exportToCSS(variables: Variable[], collection: VariableCollection): string {
  const cssVariables = variables.map(variable => {
    const value = variable.valuesByMode[collection.defaultModeId] as RGBA;
    const cssVarName = `--${variable.name.toLowerCase().replace(/[\s\/]/g, '-')}`;
    const rgbValue = `${Math.round(value.r * 255)}, ${Math.round(value.g * 255)}, ${Math.round(value.b * 255)}`;
    
    if ('a' in value && value.a !== 1) {
      return `  ${cssVarName}: rgba(${rgbValue}, ${value.a});`;
    } else {
      return `  ${cssVarName}: rgb(${rgbValue});`;
    }
  }).join('\n');

  return `:root {\n${cssVariables}\n}`;
}

function exportToJSON(variables: Variable[], collection: VariableCollection): string {
  const jsonData: Record<string, any> = {
    collection: collection.name,
    colors: {}
  };

  variables.forEach(variable => {
    const value = variable.valuesByMode[collection.defaultModeId] as RGBA;
    const key = variable.name.replace(/[\s\/]/g, '_').toLowerCase();
    
    jsonData.colors[key] = {
      name: variable.name,
      value: {
        r: Math.round(value.r * 255),
        g: Math.round(value.g * 255),
        b: Math.round(value.b * 255),
        a: 'a' in value ? value.a : 1
      },
      hex: rgbToHex(value)
    };
  });

  return JSON.stringify(jsonData, null, 2);
}

function exportToDesignTokens(variables: Variable[], collection: VariableCollection): string {
  const tokens: Record<string, any> = {};

  variables.forEach(variable => {
    const value = variable.valuesByMode[collection.defaultModeId] as RGBA;
    const tokenPath = variable.name.split('/').map(segment => 
      segment.toLowerCase().replace(/[\s-]/g, '_')
    );
    
    // Create nested structure
    let current = tokens;
    for (let i = 0; i < tokenPath.length - 1; i++) {
      const key = tokenPath[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
    
    const finalKey = tokenPath[tokenPath.length - 1];
    current[finalKey] = {
      value: rgbToHex(value),
      type: "color",
      description: `Color token from ${collection.name} collection`
    };
  });

  return JSON.stringify(tokens, null, 2);
}

// Helper function to create mapping preview
async function createMappingPreview(collectionId: string, targetMode: string, tokensData: any, sourceMode?: string) {
  const collection = figma.variables.getVariableCollectionById(collectionId);
  if (!collection) {
    throw new Error('Collection not found');
  }

  // Use the default mode (since we only have one mode, "Default")
  // targetMode here is actually the path filter ("light" or "dark"), not the Figma mode name
  const mode = collection.modes[0];
  if (!mode) {
    throw new Error('No modes found in collection');
  }

  // Analyze source JSON structure (with optional source mode)
  const sourceAnalysis = analyzeSourceTokens(tokensData, sourceMode);
  
  // Analyze destination (Figma collection) structure  
  const destAnalysis = analyzeFigmaCollection(collection, mode, targetMode);
  
  // Create ordinal mapping between scales
  const scaleMapping = createOrdinalMapping(sourceAnalysis.scales, destAnalysis.scales);
  
  // Generate sample mappings
  const samples = generateMappingSamples(sourceAnalysis, destAnalysis, scaleMapping);

  return {
    sourceName: sourceAnalysis.name,
    destinationName: collection.name,
    targetMode: mode.name,
    sourceScale: sourceAnalysis.scaleDisplay,
    destinationScale: destAnalysis.scaleDisplay,
    colorCount: sourceAnalysis.colorNames.length,
    samples: samples // Show all samples
  };
}

// Analyze source tokens (pasted JSON)
function analyzeSourceTokens(tokensData: any, sourceMode?: string) {
  const rootKeys = Object.keys(tokensData);
  let name = 'Pasted Tokens';
  let hasModes = false;
  let modes: string[] = [];
  let colorNames: string[] = [];
  let scales: number[] = [];
  let isCombinedStructure = false;
  
  if (rootKeys.length === 1) {
    name = rootKeys[0];
    const mainObj = tokensData[name];
    
    if (typeof mainObj === 'object' && mainObj !== null) {
      const topLevelKeys = Object.keys(mainObj);
      
      // Check if this looks like it has modes by examining the structure
      // If the first top-level item contains objects with numeric keys, it's probably flat
      // If the first top-level item contains objects with string keys that contain numeric keys, it probably has modes
      
      if (topLevelKeys.length > 0) {
        // Find the first actual token object (skip non-token keys like "description")
        let firstTokenItem = null;
        let firstTokenKey = '';
        
        for (const key of topLevelKeys) {
          const item = mainObj[key];
          if (typeof item === 'object' && item !== null && item.hasOwnProperty('value') && item.hasOwnProperty('type')) {
            firstTokenItem = item;
            firstTokenKey = key;
            break;
          }
        }
        
        if (firstTokenItem) {
          const firstItemKeys = Object.keys(firstTokenItem);
          
          // Check if this is a combined color+scale structure (like "Red100", "Blue500")
          const hasTokenStructure = firstItemKeys.includes('value') && firstItemKeys.includes('type');
          
          if (hasTokenStructure) {
            // This is a flat token structure where color names and scales are combined
            // Example: "Red100", "Blue500", "Gray700"
            hasModes = false;
            isCombinedStructure = true;
            
            // Extract color names and scales from combined keys (filter out non-token keys)
            const colorScaleMap = new Map<string, number[]>();
            const tokenKeys = topLevelKeys.filter(key => {
              const item = mainObj[key];
              return typeof item === 'object' && item !== null && item.hasOwnProperty('value') && item.hasOwnProperty('type');
            });
            
            tokenKeys.forEach(key => {
              // Skip special tokens that shouldn't be mapped (like "Background")
              const specialTokens = ['Background', 'background'];
              if (specialTokens.includes(key)) {
                return;
              }
              
              // Extract trailing numbers as scale, everything else as color name
              const match = key.match(/^(.+?)(\d+)$/);
              
              if (match) {
                const colorName = match[1];
                const scale = parseInt(match[2]);
                
                if (!colorScaleMap.has(colorName)) {
                  colorScaleMap.set(colorName, []);
                }
                colorScaleMap.get(colorName)!.push(scale);
              }
              // Note: Non-scale tokens (without numbers) are now ignored
            });
            
            colorNames = Array.from(colorScaleMap.keys());
            
            // Get all unique scales across all colors
            const allScales = new Set<number>();
            colorScaleMap.forEach(scalesArray => {
              scalesArray.forEach(scale => allScales.add(scale));
            });
            scales = Array.from(allScales).sort((a, b) => a - b);
            
            console.log('🔍 JSON analysis:', {
              colorNames: colorNames.slice(0, 5), // Show first 5
              scales,
              totalColors: colorNames.length
            });
            
          } else {
            // Check if firstItemKeys are mostly numeric (flat structure) or mostly string (mode structure)  
            const numericKeys = firstItemKeys.filter(k => !isNaN(parseInt(k))).length;
            const nonNumericKeys = firstItemKeys.filter(k => isNaN(parseInt(k))).length;
            
            if (nonNumericKeys > numericKeys && nonNumericKeys > 0) {
              // Likely has modes - top level keys are mode names
              hasModes = true;
              modes = topLevelKeys;
              
              // Get colors and scales from the specified mode or first mode
              const modeToAnalyze = sourceMode && firstItem[sourceMode] ? firstItem[sourceMode] : firstItem;
              const actualSourceMode = sourceMode && firstItem[sourceMode] ? sourceMode : topLevelKeys[0];
              
              colorNames = Object.keys(modeToAnalyze);
              
              if (colorNames.length > 0) {
                const firstColor = modeToAnalyze[colorNames[0]];
                if (typeof firstColor === 'object' && firstColor !== null) {
                  scales = Object.keys(firstColor)
                    .map(k => parseInt(k))
                    .filter(n => !isNaN(n))
                    .sort((a, b) => a - b);
                }
              }
              
              console.log('📊 Analyzing JSON with modes - using mode:', actualSourceMode);
            } else {
              // Likely flat - top level keys are color names
              hasModes = false;
              colorNames = topLevelKeys;
              
              // Get all unique scales across all colors to build a complete scale
              const allScales = new Set<number>();
              colorNames.forEach(colorName => {
                const colorData = mainObj[colorName]; // mainObj contains all the color objects
                if (typeof colorData === 'object' && colorData !== null) {
                  Object.keys(colorData).forEach(key => {
                    const scale = parseInt(key);
                    if (!isNaN(scale)) {
                      allScales.add(scale);
                    }
                  });
                }
              });
              scales = Array.from(allScales).sort((a, b) => a - b);
            }
          }
        }
      }
    }
  }
  
  return {
    name,
    hasModes,
    modes,
    colorNames,
    scales,
    scaleDisplay: scales.length > 1 ? `${scales[0]}→${scales[scales.length-1]}` : 'N/A',
    isCombinedStructure
  };
}

// Analyze Figma collection structure
function analyzeFigmaCollection(collection: VariableCollection, mode: any, targetModeFilter?: string) {
  const variables = collection.variableIds.map(id => figma.variables.getVariableById(id)).filter(v => v !== null);
  const colorVariables = variables.filter(v => v && v.resolvedType === 'COLOR');
  
  const colorNames: string[] = [];
  const scales: number[] = [];
  const fullVariablePaths: string[] = [];
  
  console.log(`🔍 analyzeFigmaCollection: targetModeFilter = "${targetModeFilter}"`);
  console.log(`🔍 Total color variables: ${colorVariables.length}`);
  
  let filteredCount = 0;
  
  colorVariables.forEach(variable => {
    if (variable) {
      const parts = variable.name.split('/');
      
      // Filter by target mode if specified (e.g., only "light" or "dark" variables)
      if (targetModeFilter) {
        const matchesFilter = variable.name.toLowerCase().includes(`/${targetModeFilter.toLowerCase()}/`);
        if (!matchesFilter) {
          return; // Skip variables that don't match the target mode
        }
      }
      
      filteredCount++;
      
      if (parts.length >= 2) {
        const colorName = parts[parts.length - 2]; // e.g. "purple" from "my_palette/light/purple/50"
        const scaleStr = parts[parts.length - 1]; // e.g. "50" from "my_palette/light/purple/50"
        const scale = parseInt(scaleStr);
        
        if (colorNames.indexOf(colorName) === -1) {
          colorNames.push(colorName);
        }
        
        if (!isNaN(scale) && scales.indexOf(scale) === -1) {
          scales.push(scale);
        }
        
        // Store the full variable path for accurate mapping display
        fullVariablePaths.push(variable.name);
      }
    }
  });
  
  scales.sort((a, b) => a - b);
  
  console.log('🔍 Figma collection analysis:', {
    name: collection.name,
    colorNames,
    scales,
    fullVariablePaths: fullVariablePaths.slice(0, 5) // Show first 5 for debugging
  });
  
  console.log(`🔍 SUMMARY: ${filteredCount} variables passed the filter "${targetModeFilter}"`);
  console.log(`🔍 Found ${colorNames.length} unique color names:`, colorNames);
  console.log(`🔍 Found ${scales.length} scales:`, scales);
  console.log(`🔍 Found ${fullVariablePaths.length} matching variable paths`);
  
  if (filteredCount === 0 && targetModeFilter) {
    console.log(`❌ NO VARIABLES MATCHED FILTER! Check if your collection has "/${targetModeFilter}/" in variable paths`);
  }
  
  return {
    name: collection.name,
    colorNames,
    scales,
    fullVariablePaths,
    scaleDisplay: scales.length > 1 ? `${scales[0]}→${scales[scales.length-1]}` : 'N/A'
  };
}

// Create ordinal mapping between two scales
function createOrdinalMapping(sourceScales: number[], destScales: number[]) {
  const mapping: {[key: number]: number} = {};
  
  if (sourceScales.length === 0 || destScales.length === 0) {
    return mapping;
  }
  
  // Map by position/index (ordinal mapping)
  const minLength = Math.min(sourceScales.length, destScales.length);
  
  for (let i = 0; i < minLength; i++) {
    mapping[sourceScales[i]] = destScales[i];
  }
  
  console.log('🔍 Scale mapping:', mapping);
  return mapping;
}

// Helper function to normalize color names for comparison
function normalizeColorName(name: string): string {
  // Convert camelCase to snake_case and normalize
  return name
    // Convert camelCase to snake_case: "PortraitPink" → "portrait_pink"
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    // Remove any extra spaces or special characters
    .replace(/[^a-z0-9_]/g, '_')
    // Remove multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_|_$/g, '');
}

// Generate sample mappings for preview
function generateMappingSamples(sourceAnalysis: any, destAnalysis: any, scaleMapping: {[key: number]: number}) {
  const samples: {from: string, to: string}[] = [];
  
  // Show ALL colors and ALL scales for complete preview
  const sampleColors = sourceAnalysis.colorNames; // Show ALL colors
  const sampleScales = Object.keys(scaleMapping).map(k => parseInt(k)); // Show ALL scales
  
  sampleColors.forEach((colorName: string) => {
    const normalizedSource = normalizeColorName(colorName);
    
    sampleScales.forEach(sourceScale => {
      const destScale = scaleMapping[sourceScale];
      if (destScale !== undefined) {
        // Find a matching destination variable using the full variable paths from destAnalysis
        const matchingVariable = destAnalysis.fullVariablePaths?.find((varPath: string) => {
          const parts = varPath.split('/');
          if (parts.length >= 2) {
            const variableColorName = parts[parts.length - 2];
            const variableScale = parseInt(parts[parts.length - 1]);
            const normalizedVarColor = normalizeColorName(variableColorName);
            
            const colorMatch = normalizedVarColor === normalizedSource;
            const scaleMatch = variableScale === destScale;
            
            return colorMatch && scaleMatch;
          }
          return false;
        });
        
        if (matchingVariable) {
          samples.push({
            from: `${sourceAnalysis.name}/${colorName}/${sourceScale}`,
            to: `${matchingVariable}`
          });
        }
      }
    });
  });
  
  console.log(`🔍 Generated ${samples.length} sample mappings`);
  return samples;
}

// Apply updates to Figma variables based on source tokens data
async function applyVariableUpdates(collectionId: string, targetMode: string, tokensData: any, mappingData: any) {
  // Get the collection and mode
  const collection = figma.variables.getVariableCollectionById(collectionId);
  if (!collection) {
    throw new Error('Collection not found');
  }
  
  // Since we only have one mode ("Default"), always use the first/default mode
  // targetMode here is actually the path filter ("light" or "dark"), not the Figma mode name
  const mode = collection.modes[0]; // Use the first (and likely only) mode
  if (!mode) {
    throw new Error('No modes found in collection');
  }
  
  // Analyze source tokens to understand structure
  const sourceAnalysis = analyzeSourceTokens(tokensData);
  
  // Analyze destination to get current variables
  // targetMode is now always the path filter ("light" or "dark") sent from the UI
  const pathFilter = targetMode;
  
  console.log(`🔄 Apply Updates Debug:`, {
    collectionName: collection.name,
    targetMode,
    pathFilter,
    figmaModeName: mode.name,
    figmaModeId: mode.modeId
  });
  
  const destAnalysis = analyzeFigmaCollection(collection, mode, pathFilter);
  
  console.log(`🔄 Found ${destAnalysis.colorNames.length} destination colors, ${destAnalysis.scales.length} scales`);
  
  // Create scale mapping
  const scaleMapping = createOrdinalMapping(sourceAnalysis.scales, destAnalysis.scales);
  
  // Get all variables in the collection
  const variables = collection.variableIds.map(id => figma.variables.getVariableById(id)).filter(v => v !== null);
  let colorVariables = variables.filter(v => v && v.resolvedType === 'COLOR');
  
  // Apply path filtering if specified (same as in analysis)
  if (pathFilter) {
    const beforeFilter = colorVariables.length;
    colorVariables = colorVariables.filter(variable => {
      if (!variable) return false;
      const matchesFilter = variable.name.toLowerCase().includes(`/${pathFilter.toLowerCase()}/`);
      return matchesFilter;
    });
    console.log(`🔄 Path filtering: ${beforeFilter} → ${colorVariables.length} variables (filter: "/${pathFilter}/")`);
  }
  
  let updatedCount = 0;
  
  console.log(`🔄 Starting with ${colorVariables.length} total color variables`);
  
  // Extract source tokens data (assume single root key structure)
  const rootKeys = Object.keys(tokensData);
  if (rootKeys.length === 0) {
    throw new Error('No data found in source tokens');
  }
  
  const sourceData = rootKeys.length === 1 ? tokensData[rootKeys[0]] : tokensData;
  
  // Filter out special tokens that shouldn't be mapped
  const specialTokens = ['Background', 'background'];
  const filteredSourceData: any = Object.keys(sourceData)
    .filter(key => !specialTokens.includes(key))
    .reduce((obj: any, key) => {
      obj[key] = sourceData[key];
      return obj;
    }, {});
  
  console.log(`🔄 Filtered source data has ${Object.keys(filteredSourceData).length} tokens`);
  console.log(`🔄 First few tokens:`, Object.keys(filteredSourceData).slice(0, 5));
  
  let processedCount = 0;
  
  // Iterate through each color variable in Figma collection
  for (const variable of colorVariables) {
    processedCount++;
    
    if (processedCount <= 5) {
      console.log(`🔄 Processing variable ${processedCount}: "${variable?.name}"`);
    }
    if (!variable) continue;
    
    // Parse variable name to extract color and scale
    const parts = variable.name.split('/');
    if (parts.length < 2) continue;
    
    const colorName = parts[parts.length - 2]; // e.g. "purple" from "my_palette/purple/50"
    const scaleStr = parts[parts.length - 1]; // e.g. "50" from "my_palette/purple/50"
    const figmaScale = parseInt(scaleStr);
    
    if (isNaN(figmaScale)) continue;
    
    // Find matching source color using normalized comparison (handles camelCase vs snake_case)
    const normalizedFigmaColor = normalizeColorName(colorName);
    
    if (processedCount <= 5) {
      console.log(`  🔍 Looking for Figma color "${colorName}" (normalized: "${normalizedFigmaColor}") scale ${figmaScale}`);
    }
    
    const matchingSourceColor = Object.keys(filteredSourceData).find(sourceColor => {
      // For combined structure like "PortraitPink100", extract just the color name part
      let colorNameOnly = sourceColor;
      if (sourceAnalysis.isCombinedStructure) {
        // Extract color name from combined key like "PortraitPink100" -> "PortraitPink"
        const match = sourceColor.match(/^(.+?)(\d+)$/);
        if (match) {
          colorNameOnly = match[1];
        }
      }
      
      const normalizedSourceColor = normalizeColorName(colorNameOnly);
      const isMatch = normalizedSourceColor === normalizedFigmaColor;
      
      if (processedCount <= 5) {
        console.log(`    🔍 Comparing "${sourceColor}" (color: "${colorNameOnly}", normalized: "${normalizedSourceColor}") → match: ${isMatch}`);
      }
      
      return isMatch;
    });
    
    if (!matchingSourceColor) {
      if (processedCount <= 5) {
        console.log(`  ❌ No matching source color found for "${colorName}"`);
      }
      continue;
    }
    
    if (processedCount <= 5) {
      console.log(`  ✅ Found matching source color: "${matchingSourceColor}"`);
    }
    
    // Find the source scale that maps to this Figma scale
    let sourceScale = null;
    for (const [src, dest] of Object.entries(scaleMapping)) {
      if (dest === figmaScale) {
        sourceScale = parseInt(src);
        break;
      }
    }
    
    if (sourceScale === null) {
      if (processedCount <= 5) {
        console.log(`  ❌ No source scale maps to Figma scale ${figmaScale}`);
      }
      continue;
    }
    
    if (processedCount <= 5) {
      console.log(`  ✅ Found scale mapping: ${sourceScale} → ${figmaScale}`);
    }
    
    // Get the source token data - handle both combined and nested structures
    let sourceToken;
    
    if (sourceAnalysis.isCombinedStructure) {
      // Combined structure: matchingSourceColor is already a combined key like "PortraitPink100"
      // We need to find the key for the specific scale we want
      const colorNameFromKey = matchingSourceColor.match(/^(.+?)(\d+)$/)?.[1] || matchingSourceColor;
      const targetCombinedKey = `${colorNameFromKey}${sourceScale}`;
      
      sourceToken = filteredSourceData[targetCombinedKey];
      
      if (processedCount <= 5) {
        console.log(`  🔍 Looking for combined key: "${targetCombinedKey}" (found: ${!!sourceToken})`);
      }
    } else {
      // Nested structure: look for filteredSourceData[colorName][scale]
      const sourceColorData = filteredSourceData[matchingSourceColor];
      if (!sourceColorData || typeof sourceColorData !== 'object') continue;
      sourceToken = sourceColorData[sourceScale.toString()];
      
      if (processedCount <= 5) {
        console.log(`  🔍 Using nested structure: ${matchingSourceColor}[${sourceScale}]`);
      }
    }
    
    if (!sourceToken || typeof sourceToken !== 'object') {
      if (processedCount <= 5) {
        console.log(`  ❌ No source token found for ${variable.name} (sourceToken: ${sourceToken})`);
      }
      continue;
    }
    
    if (processedCount <= 5) {
      console.log(`  ✅ Found source token:`, Object.keys(sourceToken));
    }
    
    // Extract value and description from source token
    const colorValue = sourceToken.value;
    const description = sourceToken.description || `Updated from ${sourceAnalysis.name}`;
    
    if (!colorValue) {
      if (processedCount <= 5) {
        console.log(`  ❌ No color value in token for ${variable.name} (colorValue: ${colorValue})`);
      }
      continue;
    }
    
    if (processedCount <= 5) {
      console.log(`  🎨 Found color value: "${colorValue}" for ${variable.name}`);
    }
    
    try {
      // Convert color value to RGB
      const rgb = hexToRgb(colorValue);
      if (!rgb) {
        if (processedCount <= 5) {
          console.log(`  ❌ Failed to convert hex "${colorValue}" for ${variable.name}`);
        }
        continue;
      }
      
      if (processedCount <= 5) {
        console.log(`  🔄 Attempting to update ${variable.name} with color ${colorValue} (RGB: ${JSON.stringify(rgb)}) in mode ${mode.modeId}`);
      }
      
      // Update the variable
      variable.setValueForMode(mode.modeId, rgb);
      variable.description = description;
      
      updatedCount++;
      
      if (processedCount <= 5) {
        console.log(`  ✅ Successfully updated ${variable.name} (total: ${updatedCount})`);
      }
      
    } catch (error) {
      console.warn(`❌ Failed to update variable ${variable.name}:`, error);
      if (processedCount <= 5) {
        console.log(`  ❌ Update error for ${variable.name}:`, error);
      }
    }
  }
  
  console.log(`🔄 Apply Updates Summary:`, {
    processedVariables: processedCount,
    updatedCount,
    successRate: processedCount > 0 ? `${Math.round(updatedCount / processedCount * 100)}%` : '0%'
  });
  
  return { updatedCount };
}

// Helper function to convert hex color to RGB object
function hexToRgb(hex: string): {r: number, g: number, b: number} | null {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  if (hex.length !== 6) return null;
  
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  return { r, g, b };
} 