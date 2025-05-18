figma.showUI(__html__);

figma.ui.resize(320, 480);

// Get all variable collections
const variableCollections = figma.variables.getLocalVariableCollections();

// Send collections to the UI
figma.ui.postMessage({
  type: 'collections',
  collections: variableCollections.map(collection => ({
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map(mode => ({
      id: mode.modeId,
      name: mode.name
    }))
  }))
});

figma.ui.onmessage = async (msg) => {
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
      frame.layoutMode = 'VERTICAL';
      frame.itemSpacing = 16;
      frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 16;
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
          let textVariableName = "night-shift"; // Default dark text
          if (luminance < 0.5) {
            textVariableName = "white-clouds"; // Use light text for dark backgrounds
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
function rgbToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
} 