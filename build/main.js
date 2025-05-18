"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/main.ts
  var require_main = __commonJS({
    "src/main.ts"(exports) {
      figma.showUI(`<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rainbow Color System</title>
    <style>
        body {
            font: 12px Inter, sans-serif;
            margin: 20px;
        }

        h2 {
            margin: 0 0 16px 0;
            font-size: 16px;
            font-weight: 500;
        }

        .collections {
            margin-bottom: 16px;
        }

        select {
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #E5E5E5;
            margin-bottom: 16px;
            font-size: 12px;
        }

        button {
            width: 100%;
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            background: #18A0FB;
            color: white;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 32px;
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .message {
            margin-top: 16px;
            padding: 8px;
            border-radius: 6px;
        }

        .error {
            background: #FEE;
            color: #C00;
        }

        .success {
            background: #E8F5E9;
            color: #2E7D32;
        }

        .progress {
            background: #E3F2FD;
            color: #1565C0;
        }

        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, .3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
            display: none;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        .button-text {
            display: inline-block;
        }

        button.loading .spinner {
            display: inline-block;
        }

        button.loading .button-text {
            display: none;
        }
    </style>
</head>

<body>
    <h2>Rainbow Color System</h2>
    <div class="collections">
        <select id="collection-select">
            <option value="">Select a variable collection...</option>
        </select>
    </div>
    <button id="create" disabled>
        <span class="button-text">Create Color Swatches</span>
        <span class="spinner"></span>
    </button>
    <div id="message"></div>

    <script>
        let selectedCollectionId = '';
        const select = document.getElementById('collection-select');
        const createButton = document.getElementById('create');
        const messageDiv = document.getElementById('message');

        // Listen for collections from the plugin
        onmessage = event => {
            const msg = event.data.pluginMessage;

            if (msg.type === 'collections') {
                // Populate the select with collections
                msg.collections.forEach(collection => {
                    const option = document.createElement('option');
                    option.value = collection.id;
                    option.textContent = collection.name;
                    select.appendChild(option);
                });
            } else if (msg.type === 'error') {
                // End loading state on error
                endLoading();
                showMessage(msg.message, 'error');
            } else if (msg.type === 'success') {
                // End loading state on success
                endLoading();
                showMessage(msg.message, 'success');
            } else if (msg.type === 'progress') {
                // Update progress message
                const progressText = msg.message ||
                    \`Processing: \${msg.completed} of \${msg.total} colors...\`;
                showMessage(progressText, 'progress');
            }
        };

        // Handle collection selection
        select.onchange = () => {
            selectedCollectionId = select.value;
            createButton.disabled = !selectedCollectionId;
        };

        // Handle create button click
        createButton.onclick = () => {
            if (selectedCollectionId) {
                // Start loading state IMMEDIATELY
                startLoading();
                showMessage('Creating color swatches...', 'progress');

                // Use setTimeout with 0ms delay to ensure the UI updates before 
                // sending the message to the plugin (which might block the main thread)
                setTimeout(() => {
                    parent.postMessage({
                        pluginMessage: {
                            type: 'create-swatches',
                            collectionId: selectedCollectionId
                        }
                    }, '*');
                }, 0);
            }
        };

        function showMessage(text, type) {
            messageDiv.textContent = text;
            messageDiv.className = \`message \${type}\`;
        }

        function startLoading() {
            createButton.classList.add('loading');
            createButton.disabled = true;
            select.disabled = true;
        }

        function endLoading() {
            createButton.classList.remove('loading');
            createButton.disabled = !selectedCollectionId;
            select.disabled = false;
        }
    <\/script>
</body>

</html>`);
      figma.ui.resize(320, 480);
      var variableCollections = figma.variables.getLocalVariableCollections();
      figma.ui.postMessage({
        type: "collections",
        collections: variableCollections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          modes: collection.modes.map((mode) => ({
            id: mode.modeId,
            name: mode.name
          }))
        }))
      });
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        if (msg.type === "create-swatches") {
          try {
            figma.ui.postMessage({ type: "progress", completed: 0, total: 1, message: "Starting..." });
            const colorSwatchComponent = figma.root.findOne(
              (node) => node.type === "COMPONENT" && node.name.toLowerCase() === "color swatch"
            );
            if (!colorSwatchComponent) {
              figma.ui.postMessage({ type: "error", message: 'Color swatch component not found. Please ensure a component named "color swatch" exists in your file.' });
              return;
            }
            const collection = figma.variables.getVariableCollectionById(msg.collectionId);
            if (!collection) {
              figma.ui.postMessage({ type: "error", message: "Collection not found" });
              return;
            }
            const allVariables = collection.variableIds.map((id) => figma.variables.getVariableById(id));
            const colorVariables = allVariables.filter((variable) => {
              if (!variable)
                return false;
              return variable.resolvedType === "COLOR";
            });
            console.log(`Processing ${colorVariables.length} color variables`);
            figma.ui.postMessage({ type: "progress", completed: 0, total: colorVariables.length, message: "Processing variables..." });
            if (colorVariables.length === 0) {
              figma.ui.postMessage({ type: "error", message: "No color variables found in collection" });
              return;
            }
            const frame = figma.createFrame();
            frame.name = `${collection.name} - Color Swatches`;
            frame.layoutMode = "VERTICAL";
            frame.itemSpacing = 16;
            frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 16;
            frame.fills = [];
            frame.counterAxisSizingMode = "AUTO";
            frame.primaryAxisSizingMode = "AUTO";
            yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
            for (let i = 0; i < colorVariables.length; i++) {
              const variable = colorVariables[i];
              console.log(`Processing variable ${i + 1}/${colorVariables.length}: ${variable.name}`);
              figma.ui.postMessage({
                type: "progress",
                completed: i + 1,
                total: colorVariables.length
              });
              try {
                const swatchInstance = colorSwatchComponent.createInstance();
                const modeId = collection.modes[0].modeId;
                const colorValue = variable.valuesByMode[modeId];
                const r = colorValue.r;
                const g = colorValue.g;
                const b = colorValue.b;
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                let textVariableName = "night-shift";
                if (luminance < 0.5) {
                  textVariableName = "white-clouds";
                }
                const textVariable = figma.variables.getLocalVariables().find(
                  (v) => v.name === textVariableName && v.resolvedType === "COLOR"
                );
                if (textVariable) {
                  console.log(`Using text color variable: ${textVariableName} for ${variable.name}`);
                } else {
                  console.log(`Text color variable ${textVariableName} not found`);
                }
                const propertyNames = Object.keys(swatchInstance.componentProperties);
                for (const key of propertyNames) {
                  const propertyName = key.toLowerCase();
                  if (propertyName.includes("name")) {
                    swatchInstance.setProperties({
                      [key]: variable.name
                    });
                  }
                  if (propertyName.includes("code") || propertyName.includes("hex")) {
                    const hexColor = rgbToHex(colorValue);
                    swatchInstance.setProperties({
                      [key]: hexColor
                    });
                  }
                }
                if (textVariable) {
                  try {
                    const textNodes = swatchInstance.findAll(
                      (node) => node.type === "TEXT" && (node.name === "Name" || node.name === "Hex" || node.name.includes("Text"))
                    );
                    console.log(`Found ${textNodes.length} text nodes to colorize with ${textVariableName} variable`);
                    for (const textNode of textNodes) {
                      try {
                        textNode.fills = [{
                          type: "SOLID",
                          color: { r: 0, g: 0, b: 0 }
                        }];
                        textNode.fills = [{
                          type: "SOLID",
                          color: { r: 0, g: 0, b: 0 },
                          boundVariables: {
                            color: {
                              type: "VARIABLE_ALIAS",
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
                    console.log("Error finding text nodes:", findError);
                  }
                } else {
                  console.log(`Could not find ${textVariableName} variable for text color`);
                }
                try {
                  const propertyNames2 = Object.keys(swatchInstance.componentProperties);
                  const fillPropertyKey = propertyNames2.find((key) => key === "Fill");
                  if (fillPropertyKey) {
                    console.log("Found Fill property, binding variable directly");
                    swatchInstance.setProperties({
                      [fillPropertyKey]: {
                        type: "VARIABLE_ALIAS",
                        id: variable.id
                      }
                    });
                    console.log("Successfully bound variable to Fill property");
                  } else {
                    console.log("No Fill property found, trying direct variable binding");
                    swatchInstance.fills = [{
                      type: "SOLID",
                      visible: true,
                      opacity: 1,
                      color: { r: 0, g: 0, b: 0 },
                      boundVariables: {
                        color: {
                          type: "VARIABLE_ALIAS",
                          id: variable.id
                        }
                      }
                    }];
                    console.log("Directly bound variable to fill");
                  }
                  swatchInstance.setPluginData("variableId", variable.id);
                } catch (error) {
                  console.error("Error binding variable to fill:", error);
                  try {
                    const modeId2 = collection.modes[0].modeId;
                    const colorValue2 = variable.valuesByMode[modeId2];
                    let r2 = 0, g2 = 0, b2 = 0;
                    if (typeof colorValue2 === "object" && colorValue2 !== null) {
                      r2 = "r" in colorValue2 ? Number(colorValue2.r) : 0;
                      g2 = "g" in colorValue2 ? Number(colorValue2.g) : 0;
                      b2 = "b" in colorValue2 ? Number(colorValue2.b) : 0;
                    }
                    swatchInstance.fills = [{
                      type: "SOLID",
                      visible: true,
                      opacity: 1,
                      color: { r: r2, g: g2, b: b2 }
                    }];
                    console.log("Fallback: Set raw color fill on instance");
                  } catch (fallbackError) {
                    console.error("Even fallback failed:", fallbackError);
                  }
                }
                frame.appendChild(swatchInstance);
                console.log(`Added ${variable.name} to frame with properties set`);
              } catch (error) {
                console.error(`Error processing variable ${variable.name}:`, error);
              }
            }
            frame.x = figma.viewport.center.x - frame.width / 2;
            frame.y = figma.viewport.center.y - frame.height / 2;
            figma.currentPage.selection = [frame];
            figma.viewport.scrollAndZoomIntoView([frame]);
            figma.ui.postMessage({ type: "success", message: `Created ${colorVariables.length} color swatches!` });
          } catch (error) {
            console.error("Error in plugin execution:", error);
            figma.ui.postMessage({ type: "error", message: "An error occurred while creating the swatches." });
          }
        }
      });
      function rgbToHex(color) {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      }
    }
  });
  require_main();
})();
