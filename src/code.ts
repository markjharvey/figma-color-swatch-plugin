figma.showUI(__html__, { width: 320, height: 480 });

// Get all variable collections that contain color variables
const collections = figma.variables.getLocalVariableCollections();

// Send collections to the UI
figma.ui.postMessage({
  type: 'collections',
  collections: collections.map(collection => ({
    id: collection.id,
    name: collection.name,
    variablesCount: collection.variableIds.length
  }))
});

figma.ui.onmessage = async (msg: { type: string; collectionId?: string }) => {
  if (msg.type === 'create-swatches' && msg.collectionId) {
    const collection = collections.find(c => c.id === msg.collectionId);
    if (!collection) {
      figma.notify('Collection not found');
      return;
    }

    // Get the color swatch component
    const colorSwatchComponent = await findColorSwatchComponent();
    if (!colorSwatchComponent) {
      figma.notify('Color swatch component not found. Please ensure it exists in your file.');
      return;
    }

    // Get all variables in the collection
    const variables = collection.variableIds.map(id => figma.variables.getVariableById(id));

    // Create a frame to hold all swatches
    const frame = figma.createFrame();
    frame.name = `Color Swatches - ${collection.name}`;
    frame.layoutMode = 'HORIZONTAL';
    frame.counterAxisSizingMode = 'AUTO';
    frame.itemSpacing = 16;
    frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 16;

    // Create swatches for each variable
    for (const variable of variables) {
      if (!variable) continue;
      
      // Only process color variables
      const value = variable.valuesByMode[collection.defaultModeId];
      if (typeof value !== 'object' || !('r' in value)) continue;

      // Create an instance of the color swatch component
      const swatch = colorSwatchComponent.createInstance();
      swatch.name = variable.name;

      // Find and set the color property on the swatch component
      const colorProperty = swatch.findOne(node => 
        node.type === 'RECTANGLE' && node.name === 'color'
      ) as RectangleNode | null;

      if (colorProperty) {
        // Create a new solid paint with all properties set at once
        const newPaint: SolidPaint = {
          type: 'SOLID',
          color: {
            r: value.r,
            g: value.g,
            b: value.b
          },
          opacity: 'a' in value ? value.a : 1
        };

        // Apply the new paint
        colorProperty.fillStyleId = '';
        colorProperty.fills = [newPaint];
      }

      frame.appendChild(swatch);
    }

    // Position the frame in the viewport
    const zoom = figma.viewport.zoom;
    const center = figma.viewport.center;
    frame.x = center.x / zoom - frame.width / 2;
    frame.y = center.y / zoom - frame.height / 2;

    figma.currentPage.appendChild(frame);
    figma.viewport.scrollAndZoomIntoView([frame]);
    figma.notify(`Created ${variables.length} color swatches!`);
  }
};

async function findColorSwatchComponent(): Promise<ComponentNode | null> {
  // First try to find in the current file
  const localComponent = figma.root.findOne(node => 
    node.type === 'COMPONENT' && node.name.toLowerCase().includes('color swatch')
  ) as ComponentNode | null;

  if (localComponent) return localComponent;

  // If not found locally, try to find in team library
  const libraryComponents = await figma.root.getSharedPluginData('rainbow', 'colorSwatchComponent');
  return libraryComponents ? JSON.parse(libraryComponents) as ComponentNode : null;
}

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
} 