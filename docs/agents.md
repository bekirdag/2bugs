# PixiJS Comprehensive Guide

## Introduction

PixiJS is a fast, lightweight 2D rendering engine for the web. It uses hardware‑accelerated renderers (WebGL or WebGPU) and falls back to Canvas when necessary. The project aims to make high‑performance interactive graphics accessible on all devices. The library includes a full asset loader, multi‑touch input support, flexible text rendering, drawing primitives and SVG support, dynamic textures, masking, powerful filters and advanced blend modes[\[1\]](https://pixijs.download/release/docs/index.html#:~:text=,Advanced%20Blend%20Modes). Because it is built for performance, it can drive games, data visualisations and other interactive experiences in the browser.

## Installation and Setup

### Installing PixiJS

PixiJS can be scaffolded with a single command using the PixiJS Create CLI:

npm create pixi.js@latest

To add PixiJS to an existing project install it from npm:

npm install pixi.js

These commands download the latest released version and install all required dependencies[\[2\]](https://pixijs.download/release/docs/index.html#:~:text=Setup).

### Creating an Application

The Application class handles renderer creation, stage management, resizing and ticking. Create a new application instance and initialize it with options via the asynchronous init() method[\[3\]](https://pixijs.download/release/docs/app.Application.html#:~:text=Convenience%20class%20to%20create%20a,new%20PixiJS%20application)[\[4\]](https://pixijs.download/release/docs/app.Application.html#:~:text=):

import { Application, Assets, Sprite } from 'pixi.js';

(async () \=\> {  
    // Create application  
    const app \= new Application();

    // Initialize with desired options  
    await app.init({  
        width: 800,                 // canvas width  
        height: 600,                // canvas height  
        backgroundColor: 0x1099bb,  // background colour  
        antialias: true,            // smoother edges  
        resolution: 1,              // device pixel ratio  
        preference: 'webgl'         // or 'webgpu'  
    });

    // Append canvas to DOM  
    document.body.appendChild(app.canvas);

    // Load a texture and add a sprite  
    const texture \= await Assets.load('my-image.png');  
    const sprite \= new Sprite(texture);  
    app.stage.addChild(sprite);  
})();

**Note:** From PixiJS v8 onwards, initialization must be performed via app.init() instead of passing options to the constructor[\[5\]](https://pixijs.download/release/docs/app.Application.html#:~:text=Important).

### Renderer Options

During initialization you can set options such as backgroundColor, width, height, antialias, resolution, and preference to choose between WebGL and WebGPU[\[6\]](https://pixijs.download/release/docs/app.Application.html#:~:text=%2F%2F%20Initialize%20with%20options%20await,webgpu%27%20%2F%2F%20Renderer%20preference). You can also specify resizeTo to make the renderer automatically resize when a window or DOM element changes size[\[7\]](https://pixijs.download/release/docs/app.Application.html#:~:text=resize%20To).

### Stage and Screen

Once the application is initialized, app.stage holds the root display container[\[8\]](https://pixijs.download/release/docs/app.Application.html#:~:text=stage%3A%20Container%20%3D%20). All visual objects added to the stage or its children become part of the scene graph and will be rendered each frame. The app.screen property contains the canvas dimensions and can be used to centre or position elements (e.g., sprite.x \= app.screen.width / 2). The app.renderer property exposes the underlying renderer and its capabilities[\[9\]](https://pixijs.download/release/docs/app.Application.html#:~:text=renderer).

### Ticker

app.ticker provides the update loop for your application. By default the ticker runs at the monitor refresh rate and calls registered callbacks every frame. You can add functions to animate sprites, perform physics updates or adjust game logic. Each callback receives a Ticker instance containing timing information such as deltaTime, deltaMS, elapsedMS and lastTime[\[10\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=A%20Ticker%20class%20that%20runs,timing%20in%20a%20PixiJS%20application). Example:

app.ticker.add((ticker) \=\> {  
    // Frame‑independent rotation (deltaTime \~1.0 at 60 FPS)  
    sprite.rotation \+= 0.1 \* ticker.deltaTime;  
});

To control priority or run a one‑off update, use add(callback, context, priority) or addOnce(callback)[\[11\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=%2F%2F%20Control%20update%20priority%20ticker,undefined%2C%20UPDATE_PRIORITY.HIGH).

## Scene Graph and Display Objects

PixiJS organizes visual elements in a hierarchical scene graph. Every renderable object inherits from DisplayObject. Key classes include Container, Sprite, Graphics, Text and AnimatedSprite.

### Container

Container is a general‑purpose display object that can hold children and applies transformations to them[\[12\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=Container%20is%20a%20general,features%20like%20masking%20and%20filtering). It provides built‑in support for masking and filtering and is the base class for other containers such as Sprite and Graphics. The transform of a display object is described by its pivot, position, scale, rotation and skew[\[13\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=Property%20Description%20%5Bpivot%5DContainer,skew). Important derived properties include:

* **pivot** – point around which rotation, scaling and skewing occur.

* **position (x,y)** – translation relative to the parent; the default pivot is (0,0) meaning the top‑left corner of the object corresponds to position[\[14\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bpivot%5DContainer,in%20the%20parent%27s%20local%20space).

* **scale** – scaling factors along the local axes[\[15\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bscale%5DContainer,pivot).

* **rotation/angle** – rotation in radians or degrees[\[16\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Brotation%5DContainer,skew).

* **skew** – shear transformation; skewing both axes equally is equivalent to rotation[\[17\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bskew%5DContainer).

Container also includes convenience properties x and y (aliases for position.x and position.y) and width and height, which indirectly adjust scale by comparing the requested size with the local bounding box[\[18\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5By%5DContainer,defined%20height).

#### *Renderable vs Visible*

Use the renderable property to skip rendering a container while still updating its transforms; use visible to hide it completely (transforms of hidden objects are not calculated)[\[19\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=This%20alpha%20sets%20a%20display,ancestor%20further%20up%20the%20chain).

#### *Masking and Filtering*

Containers can apply a mask or a filter to themselves and their children. For example, you can add a BlurFilter or mask with a circular Graphics object[\[20\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=import%20,from%20%27pixi.js):

const container \= new Container();  
const sprite \= Sprite.from('image.png');  
container.addChild(sprite);

// Add blur filter  
container.filters \= \[new BlurFilter()\];

// Create circular mask  
const mask \= new Graphics()  
    .beginFill(0xffffff)  
    .drawCircle(sprite.width/2, sprite.height/2, Math.min(sprite.width, sprite.height)/2)  
    .endFill();  
container.mask \= mask;

#### *Render Groups*

In v8 you can turn a container into a **render group** by calling container.enableRenderGroup() or by passing { isRenderGroup: true } to the constructor. Render groups are rendered in a separate pass and maintain their own set of rendering instructions. Moving a render group is efficient because transformations happen at the GPU level, but excessive use can hurt performance—use them judiciously for high‑level grouping[\[21\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=RenderGroup).

### Sprite

A Sprite represents a single textured image that can be transformed, tinted, interacted with and animated. Create sprites using Sprite.from(image) or by passing options. Sprites can also be created from textures in a loaded spritesheet[\[22\]](https://pixijs.download/dev/docs/scene.Sprite.html#:~:text=The%20Sprite%20object%20is%20one,be%20transformed%20in%20various%20ways):

// Directly from an image  
const sprite \= Sprite.from('assets/image.png');  
sprite.position.set(100, 100);  
app.stage.addChild(sprite);

// From a spritesheet (after loading)  
const sheet \= await Assets.load('assets/spritesheet.json');  
const bunny \= new Sprite(sheet.textures\['bunny.png'\]);

When constructing with an options object you can set the texture, anchor, position, scale and rotation[\[23\]](https://pixijs.download/dev/docs/scene.Sprite.html#:~:text=const%20configuredSprite%20%3D%20new%20Sprite%28,%2F%2F%2045%20degrees). Sprites support pointer events (mouse/touch) by setting sprite.interactive \= true and adding event handlers:

sprite.interactive \= true;  
sprite.on('pointerdown', () \=\> {  
    console.log('Sprite clicked');  
});

Sprites inherit all Container properties (pivot, scale, rotation, etc.) and can serve as parents for other sprites or display objects.

### Graphics

Graphics is used to draw primitive shapes—lines, rectangles, circles, ellipses and polygons—and can also serve as complex masks or hit areas[\[24\]](https://pixijs.download/release/docs/scene.Graphics.html#:~:text=The%20Graphics%20class%20is%20primarily,and%20hit%20areas%20for%20interaction). Shapes are defined by chaining drawing commands:

const graphics \= new Graphics();

// Filled rectangle with stroke  
graphics  
    .rect(0, 0, 100, 100\)  
    .fill({ color: 0xff0000 })  
    .stroke({ width: 2, color: 0x000000 });

// Complex shape  
graphics  
    .moveTo(50, 50\)  
    .lineTo(100, 100\)  
    .arc(100, 100, 50, 0, Math.PI)  
    .closePath()  
    .fill({ color: 0x00ff00, alpha: 0.5 });

// Use graphics as a mask  
sprite.mask \= graphics;

Graphics objects can be filled and stroked with solid colours or gradients and can be transformed like any other display object. Because each shape call is recorded in a path list, complex graphics can impact performance; consider caching frequently reused shapes.

### Text

Text renders multi‑line text using the browser’s canvas text engine and converts it into a texture. Key features include dynamic content, rich styling, word wrapping and custom texture options[\[25\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=Class%20Text). Create text by passing a configuration object with text and style properties[\[26\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=):

const hello \= new Text({  
    text: 'Hello Pixi\!',  
    style: {  
        fontFamily: 'Arial',  
        fontSize: 24,  
        fill: 0xff1010,  
        align: 'center'  
    }  
});

// Rich text with stroke, drop shadow and multiline support  
const rich \= new Text({  
    text: 'Styled\\n Multiline\\n Text',  
    style: {  
        fontFamily: 'Arial',  
        fontSize: 36,  
        fill: 'red',  
        stroke: { color: '\#4a1850', width: 5 },  
        lineHeight: 45,  
        dropShadow: { color: '\#000000', blur: 4, distance: 6 }  
    },  
    anchor: 0.5  
});

// Word wrapped text  
const wrapped \= new Text({  
    text: 'This is a long piece of text that will automatically wrap to multiple lines',  
    style: {  
        fontSize: 20,  
        wordWrap: true,  
        wordWrapWidth: 200,  
        lineHeight: 30  
    }  
});

Each text instance creates its own texture; whenever the text or style changes the texture is regenerated. For better performance with static text (e.g., HUD labels), use BitmapText[\[27\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=Performance%20Considerations%3A). Text objects support the same transformations and interactivity as sprites.

### AnimatedSprite

AnimatedSprite displays an animation defined by a list of textures. You can build the texture array manually or load a spritesheet that defines animations[\[28\]](https://pixijs.download/release/docs/scene.AnimatedSprite.html#:~:text=An%20AnimatedSprite%20is%20a%20simple,by%20a%20list%20of%20textures). Basic usage:

import { AnimatedSprite, Texture, Assets } from 'pixi.js';

// Using individual images  
const frames \= \['frame1.png','frame2.png','frame3.png'\].map((name) \=\> Texture.from(name));  
const animSprite \= new AnimatedSprite(frames);  
animSprite.animationSpeed \= 0.5; // 0.5 × normal speed  
animSprite.loop \= true;  
animSprite.play();  
app.stage.addChild(animSprite);

// Using a spritesheet  
const sheet \= await Assets.load('assets/spritesheet.json');  
const runAnim \= new AnimatedSprite(sheet.animations\['run'\]);  
runAnim.play();

Animated sprites expose properties such as animationSpeed, loop, currentFrame, totalFrames, and methods play(), stop(), gotoAndPlay(frame) and gotoAndStop(frame) to control playback[\[29\]](https://pixijs.download/release/docs/scene.AnimatedSprite.html#:~:text=add%20Child%20add%20Child%20At,from%20Frames%20from%20Images%20mixin).

## Asset Management

The global Assets singleton handles loading, caching and unloading resources. It resolves URLs, transforms data and manages a cache to prevent duplicate loads[\[30\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=The%20global%20Assets%20class%20is,resources%20in%20your%20PixiJS%20application). Asset bundles and background loading simplify the management of multiple resources[\[31\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=,Automatically%20select%20optimal%20asset%20formats).

### Supported Asset Types

Assets supports a range of formats. Textures (.png, .jpg, .gif, .webp, .avif, .svg) are loaded via loadTextures/loadSvg, video textures via loadVideoTextures, sprite sheets from .json, bitmap fonts (.fnt, .xml, .txt), web fonts (.ttf, .otf, .woff, .woff2), JSON, plain text, and compressed textures (.basis, .dds, .ktx, .ktx2)[\[32\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=Supported%20Asset%20Types%3A).

### Loading and Caching

Basic usage requires no initialization: call await Assets.load('path/to/asset.png') to get a loaded texture[\[33\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=). You can load multiple assets at once by passing an array of keys, or load different formats using an alias (e.g., 'hero.{webp,png}')[\[34\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=const%20assets%20%3D%20await%20Assets.load%28,fnt%27). Load assets in the background via Assets.backgroundLoad(\['asset1.json','asset2.json'\])[\[35\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20background%20loading%20Assets.backgroundLoad%28,background%20one%20at%20a%20time). Bundles defined in a manifest can be loaded together with Assets.loadBundle('bundleName') or gradually in the background[\[36\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20Load%20a%20bundle%20of,backgroundLoadBundle%28%27resultsAssets). To unload assets and free memory, call Assets.unload(key) or Assets.unloadBundle('bundleName')[\[37\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20Memory%20management%20await%20Assets,unloadBundle%28%27levelOne%27%29%3B%20Copy).

Assets are cached automatically; to check for an existing resource call Assets.cache.has('myTexture') and retrieve it with Assets.cache.get('myTexture')[\[38\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=).

### Preferences and Initialization

For fine‑grained control call Assets.init() with options such as basePath (base URL for all assets), manifest (asset bundles), or texturePreference (preferred resolutions and formats)[\[39\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=await%20Assets.init%28,avif%27%2C%20%27webp%27%2C%20%27png%27%5D). Custom format detection, loading order and caching behaviour can be controlled through advanced options.

## Ticker and Animation Loop

The Ticker class runs an update loop that other objects listen to. It is responsible for requesting animation frames, computing time deltas and calling registered callbacks[\[10\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=A%20Ticker%20class%20that%20runs,timing%20in%20a%20PixiJS%20application). Ticker provides four time metrics:

* deltaTime – dimensionless scalar representing frame progress (\~1.0 at 60 FPS)[\[40\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,based).

* deltaMS – milliseconds elapsed between frames, capped and scaled by the ticker’s speed property[\[41\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,uncapped%2C%20unscaled%29%20for%20measurements).

* elapsedMS – raw milliseconds elapsed without capping or scaling[\[41\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,uncapped%2C%20unscaled%29%20for%20measurements).

* lastTime – timestamp of the previous frame[\[42\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,now%28%29%20format).

Add listeners via ticker.add(callback), optionally specifying priority. Use addOnce() for one‑shot callbacks[\[43\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=). Start or stop the ticker via ticker.start() and ticker.stop(). The ticker is automatically started when listeners are added unless autoStart is set to false[\[44\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=auto%20Start).

To slow down or speed up all animations globally adjust ticker.speed (e.g., ticker.speed = 0.5 for slow motion)[\[45\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=speed). You can also limit the maximum and minimum FPS using ticker.maxFPS and ticker.minFPS.

## Interaction and Events

### Pointer and Mouse Events

Display objects become interactive by setting interactive \= true and specifying an eventMode (e.g., 'static', 'dynamic') if needed. PixiJS dispatches pointer events including pointerdown, pointerup, pointermove, pointerover, pointerout as well as mouse‑specific and touch events. Handlers can be attached using .on(eventName, callback) or .off(eventName).

The PointerEvents type defines valid pointer events such as 'auto', 'none', 'visiblePainted', 'visibleFill', 'visibleStroke', 'visible', 'painted', 'fill', 'stroke', 'all' and 'inherit'[\[46\]](https://pixijs.download/release/docs/accessibility.PointerEvents.html#:~:text=PointerEvents%3A%20%7C%20,inherit). These values correspond to CSS pointer event modes and control how the overlayed accessibility div responds to mouse events.

### Federated Events System

PixiJS uses a federated events system that normalises DOM and pointer events into a unified API. Events bubble up the scene graph unless stopped. For more advanced control (e.g., capturing events or customizing hit areas) refer to the event system documentation.

## Accessibility

PixiJS includes an accessibility layer to help screen readers and keyboard navigation interpret your application. When enabled, an invisible DOM layer is overlaid on top of the canvas allowing assistive technologies to interact with it[\[47\]](https://pixijs.download/release/docs/accessibility.html#:~:text=The%20accessibility%20system%20in%20PixiJS,and%20interpreted%20by%20assistive%20technologies).

### Enabling Accessibility

Import the accessibility module if you manage your own renderer:

import 'pixi.js/accessibility';

To make an object accessible set object.accessible \= true and provide descriptive labels:

const button \= new Container();  
button.accessible \= true;  
button.accessibleTitle \= 'Play Game';  
button.accessibleHint \= 'Press to start the game';  
button.accessibleType \= 'button';  
app.stage.addChild(button);

An object can define accessibleType to control the DOM element created (button, link, slider, etc.)[\[48\]](https://pixijs.download/release/docs/accessibility.html#:~:text=const%20button%20%3D%20new%20Container).

### Configuration Options

Pass accessibilityOptions when initializing an Application to configure the behaviour of the accessibility layer. Options include enabledByDefault (enable immediately rather than waiting for tab key), activateOnTab, debug (show overlayed accessibility divs during development) and deactivateOnMouseMove[\[49\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Configure%20the%20accessibility%20system%20when,creating%20your%20application).

### Advanced Features

* **Custom tab order:** Set tabIndex on accessible objects to control keyboard focus order[\[50\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Control%20the%20tab%20order%20of,accessible%20elements).

* **Container behaviour:** Set container.accessibleChildren \= true/false to allow or prevent children from being accessible[\[51\]](https://pixijs.download/release/docs/accessibility.html#:~:text=const%20menu%20%3D%20new%20Container,default%29%20Copy).

* **Runtime control:** Use app.renderer.accessibility.setAccessibilityEnabled(true/false) to enable or disable accessibility on demand, and check isActive and isMobileAccessibility to query state[\[52\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Control%20the%20accessibility%20system%20at,runtime).

Follow best practices by providing meaningful labels (accessibleTitle and accessibleHint) and organising tab order logically[\[53\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Best%20Practices). Use debug: true during development to visualise the accessibility layer[\[54\]](https://pixijs.download/release/docs/accessibility.html#:~:text=3,mode%20during%20development).

## Filters and Effects

PixiJS filters are shader programs that apply post‑processing effects to display objects. The base Filter class extends a shader and can be applied to any container, sprite or graphics object[\[55\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=The%20Filter%20class%20is%20the,wasn%27t%20there%20for%20that%20renderer). Filters can be expensive because applying them breaks batching, measures the target’s bounds, renders it into a texture, and then draws it with the filter program[\[56\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=Its%20worth%20noting%20Performance,when%20a%20filter%20is%20applied). Limit the number of filters per scene; one filter on a container with many children is faster than many filters on individual objects.

### Built‑in Filters

Commonly used filters include:

* **AlphaFilter** – modifies opacity.

* **BlurFilter** – gaussian blur; radius controls the spread.

* **ColorMatrixFilter** – adjusts brightness, contrast, saturations and hues; can invert colours or apply sepia effects.

* **DisplacementFilter** – distorts an image using another texture as a displacement map.

* **NoiseFilter** – adds random noise.

To apply a filter:

import { BlurFilter } from 'pixi.js';

const sprite \= Sprite.from('image.png');  
const blur \= new BlurFilter();  
blur.blur \= 4;  
sprite.filters \= \[blur\];

Custom filters can be created by providing your own vertex and fragment shader programs[\[57\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=). Filters expose properties such as padding (extra space around the target), resolution (affects quality vs. performance) and blendMode.

## Mathematical Utilities

PixiJS supplies math classes to simplify coordinate calculations and transformations. Some commonly used classes are:

* **Point** – represents a 2D point (x, y)[\[58\]](https://pixijs.download/release/docs/maths.Point.html#:~:text=The%20Point%20object%20represents%20a,position%20on%20the%20vertical%20axis). Points can be added, subtracted, multiplied by scalars, normalised and rotated[\[59\]](https://pixijs.download/release/docs/maths.Point.html#:~:text=add%20clone%20copy%20From%20copy,rotate%20set%20subtract%20to%20String).

* **ObservablePoint** – similar to Point but triggers callbacks when values change.

* **Matrix** – 3×3 matrix for 2D transformations; methods include translation, rotation, scaling and multiplication.

* **Rectangle**, **Circle**, **Ellipse**, **Polygon** – geometries used for bounds and hit testing.

* **Color** – utility to convert between different colour representations (hex, RGB, HSL) and generate tints.

Math utilities are used extensively when positioning objects, calculating intersections and performing custom transformations.

## Advanced Topics

### Geometries and Meshes

PixiJS provides low‑level classes for custom geometry. A Geometry defines vertex positions, texture coordinates and indices, while a Mesh combines a geometry with a shader and texture. Built‑in meshes include:

* **SimpleMesh** – draws a geometry using a single texture.

* **Plane** – splits a rectangular area into a grid of vertices, allowing texture warping.

* **Rope** – similar to Plane but uses a path of points to deform the texture (useful for trails or tentacles).

* **NineSlicePlane** – divides a texture into a nine‑slice grid for scalable UI panels.

To use a mesh, create a geometry and pass it along with a texture and optional shader to the mesh constructor. For example:

import { Mesh, Geometry, Shader, Texture } from 'pixi.js';

// Define vertices and UVs  
const vertices \= new Float32Array(\[  
    0, 0,  
    100, 0,  
    100, 100,  
    0, 100  
\]);  
const uvs \= new Float32Array(\[  
    0, 0,  
    1, 0,  
    1, 1,  
    0, 1  
\]);  
const indices \= new Uint16Array(\[0, 1, 2, 0, 2, 3\]);

const geometry \= new Geometry().addAttribute('aVertexPosition', vertices, 2).addAttribute('aTextureCoord', uvs, 2).addIndex(indices);

const shader \= Shader.from(  
    \`attribute vec2 aVertexPosition; attribute vec2 aTextureCoord; uniform mat3 translationMatrix; uniform mat3 projectionMatrix; varying vec2 vTextureCoord; void main(){ gl\_Position \= vec4((projectionMatrix \* translationMatrix \* vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0); vTextureCoord \= aTextureCoord; }\`,  
    \`varying vec2 vTextureCoord; uniform sampler2D uSampler; void main(){ gl\_FragColor \= texture2D(uSampler, vTextureCoord); }\`  
);

const texture \= Texture.from('image.png');  
const mesh \= new Mesh({ geometry, shader, texture });  
app.stage.addChild(mesh);

Meshes allow you to implement custom rendering effects, advanced deformations and performance‑critical drawing.

### Particle Containers

When you need to render thousands of simple sprites efficiently (e.g., particles, confetti), use ParticleContainer. It reduces overhead by batching many identical sprites together and limiting what properties can change (e.g., position, scale, rotation, alpha, tint). Create a particle container with the desired capacity and flags:

const particles \= new ParticleContainer(10000, {  
    scale: true,  
    position: true,  
    rotation: true,  
    uvs: false,  
    alpha: true,  
});  
app.stage.addChild(particles);

// Create particle sprites and add them  
for (let i \= 0; i \< 10000; i++) {  
    const p \= Sprite.from('particle.png');  
    // set p.x, p.y, p.rotation, p.scale, p.alpha as needed  
    particles.addChild(p);  
}

Particle containers forego advanced features like masking, filters and individual colour matrices in favour of speed.

### Plugins and Extensions

PixiJS supports plugins that extend the application. Notable built‑in plugins include:

* **ResizePlugin** – automatically resizes the renderer when the view or window size changes.

* **TickerPlugin** – runs an update loop and shares the ticker instance with the application.

* **CullerPlugin** – performs view frustum culling to skip rendering off‑screen objects.

Plugins can be registered with an application via app.plugins.register() or passed in via options. You can also write your own plugins to integrate physics engines or audio systems.

The extensions system allows you to register new asset loaders, texture parsers or rendering features. For example, you might add support for a custom file format by implementing a loader parser and registering it with extensions.add({ type: ExtensionType.LoadParser, extension: MyLoaderParser }).

## Best Practices and Performance Tips

1. **Preload assets** – use Assets.load() or loadBundle() before starting the game to avoid stalling mid‑game.

2. **Use render groups wisely** – only containers that need separate render passes should be render groups[\[21\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=RenderGroup).

3. **Limit filters** – filters are powerful but expensive; apply them to parent containers rather than individual sprites[\[60\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=Its%20worth%20noting%20Performance,when%20a%20filter%20is%20applied).

4. **Batch objects** – group many similar sprites into a ParticleContainer or use SpriteSheet to improve draw‑call efficiency.

5. **Choose the right text class** – use Text for dynamic text and BitmapText for static or repeated labels[\[27\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=Performance%20Considerations%3A).

6. **Manage memory** – destroy unused textures (texture.destroy()), remove sprites from containers when no longer needed, and unload assets via Assets.unload()[\[37\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20Memory%20management%20await%20Assets,unloadBundle%28%27levelOne%27%29%3B%20Copy).

7. **Use the ticker’s deltaTime** – multiply animation increments by deltaTime so movement remains consistent regardless of frame rate[\[61\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=).

8. **Respect coordinate space** – remember that transformations apply hierarchically; set pivot and anchor to control rotation and scaling centres.

9. **Profile and optimize** – measure FPS and memory usage, adjust texture sizes and avoid unnecessary draw calls.

## Example Project: Moving Bunny

The following example demonstrates how to set up an application, load a texture, create a sprite, center it on the screen, and rotate it every frame using the ticker. It uses features covered earlier including asset loading, stage management, and animation.

import { Application, Assets, Sprite } from 'pixi.js';

(async () \=\> {  
    // Create and initialize application  
    const app \= new Application();  
    await app.init({ background: '\#1099bb', resizeTo: window });  
    document.body.appendChild(app.canvas);

    // Load a texture  
    const texture \= await Assets.load('https://pixijs.com/assets/bunny.png');

    // Create sprite  
    const bunny \= new Sprite(texture);  
    bunny.anchor.set(0.5); // set anchor to center

    // Position sprite at center of screen  
    bunny.x \= app.screen.width / 2;  
    bunny.y \= app.screen.height / 2;

    // Add to stage  
    app.stage.addChild(bunny);

    // Rotate on each frame  
    app.ticker.add((ticker) \=\> {  
        // rotate by 0.1 radians per frame scaled by deltaTime  
        bunny.rotation \+= 0.1 \* ticker.deltaTime;  
    });  
})();

This simple script illustrates the key concepts: creating an application, loading assets, adding a sprite to the stage, centering it, and using the ticker for animation[\[62\]](https://pixijs.download/release/docs/index.html#:~:text=import%20,js). You can extend this foundation with graphics, text, interactivity, filters, and more to build full games and interactive experiences.

## Conclusion

PixiJS provides a robust, high‑performance foundation for building 2D web applications. By understanding the scene graph, display objects, asset management, ticker system and available utilities, developers can create rich interactive experiences that run smoothly on desktop and mobile devices. Whether you’re drawing simple shapes, animating thousands of particles or writing custom shaders, PixiJS offers the tools and flexibility to bring your ideas to life.

---

[\[1\]](https://pixijs.download/release/docs/index.html#:~:text=,Advanced%20Blend%20Modes) [\[2\]](https://pixijs.download/release/docs/index.html#:~:text=Setup) [\[62\]](https://pixijs.download/release/docs/index.html#:~:text=import%20,js) pixi.js

[https://pixijs.download/release/docs/index.html](https://pixijs.download/release/docs/index.html)

[\[3\]](https://pixijs.download/release/docs/app.Application.html#:~:text=Convenience%20class%20to%20create%20a,new%20PixiJS%20application) [\[4\]](https://pixijs.download/release/docs/app.Application.html#:~:text=) [\[5\]](https://pixijs.download/release/docs/app.Application.html#:~:text=Important) [\[6\]](https://pixijs.download/release/docs/app.Application.html#:~:text=%2F%2F%20Initialize%20with%20options%20await,webgpu%27%20%2F%2F%20Renderer%20preference) [\[7\]](https://pixijs.download/release/docs/app.Application.html#:~:text=resize%20To) [\[8\]](https://pixijs.download/release/docs/app.Application.html#:~:text=stage%3A%20Container%20%3D%20) [\[9\]](https://pixijs.download/release/docs/app.Application.html#:~:text=renderer) Application | pixi.js

[https://pixijs.download/release/docs/app.Application.html](https://pixijs.download/release/docs/app.Application.html)

[\[10\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=A%20Ticker%20class%20that%20runs,timing%20in%20a%20PixiJS%20application) [\[11\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=%2F%2F%20Control%20update%20priority%20ticker,undefined%2C%20UPDATE_PRIORITY.HIGH) [\[40\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,based) [\[41\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,uncapped%2C%20unscaled%29%20for%20measurements) [\[42\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=,now%28%29%20format) [\[43\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=) [\[44\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=auto%20Start) [\[45\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=speed) [\[61\]](https://pixijs.download/release/docs/ticker.Ticker.html#:~:text=) Ticker | pixi.js

[https://pixijs.download/release/docs/ticker.Ticker.html](https://pixijs.download/release/docs/ticker.Ticker.html)

[\[12\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=Container%20is%20a%20general,features%20like%20masking%20and%20filtering) [\[13\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=Property%20Description%20%5Bpivot%5DContainer,skew) [\[14\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bpivot%5DContainer,in%20the%20parent%27s%20local%20space) [\[15\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bscale%5DContainer,pivot) [\[16\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Brotation%5DContainer,skew) [\[17\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5Bskew%5DContainer) [\[18\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=%5By%5DContainer,defined%20height) [\[19\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=This%20alpha%20sets%20a%20display,ancestor%20further%20up%20the%20chain) [\[20\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=import%20,from%20%27pixi.js) [\[21\]](https://pixijs.download/release/docs/scene.Container.html#:~:text=RenderGroup) Container | pixi.js

[https://pixijs.download/release/docs/scene.Container.html](https://pixijs.download/release/docs/scene.Container.html)

[\[22\]](https://pixijs.download/dev/docs/scene.Sprite.html#:~:text=The%20Sprite%20object%20is%20one,be%20transformed%20in%20various%20ways) [\[23\]](https://pixijs.download/dev/docs/scene.Sprite.html#:~:text=const%20configuredSprite%20%3D%20new%20Sprite%28,%2F%2F%2045%20degrees) Sprite | pixi.js

[https://pixijs.download/dev/docs/scene.Sprite.html](https://pixijs.download/dev/docs/scene.Sprite.html)

[\[24\]](https://pixijs.download/release/docs/scene.Graphics.html#:~:text=The%20Graphics%20class%20is%20primarily,and%20hit%20areas%20for%20interaction) Graphics | pixi.js

[https://pixijs.download/release/docs/scene.Graphics.html](https://pixijs.download/release/docs/scene.Graphics.html)

[\[25\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=Class%20Text) [\[26\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=) [\[27\]](https://pixijs.download/dev/docs/scene.Text.html#:~:text=Performance%20Considerations%3A) Text | pixi.js

[https://pixijs.download/dev/docs/scene.Text.html](https://pixijs.download/dev/docs/scene.Text.html)

[\[28\]](https://pixijs.download/release/docs/scene.AnimatedSprite.html#:~:text=An%20AnimatedSprite%20is%20a%20simple,by%20a%20list%20of%20textures) [\[29\]](https://pixijs.download/release/docs/scene.AnimatedSprite.html#:~:text=add%20Child%20add%20Child%20At,from%20Frames%20from%20Images%20mixin) AnimatedSprite | pixi.js

[https://pixijs.download/release/docs/scene.AnimatedSprite.html](https://pixijs.download/release/docs/scene.AnimatedSprite.html)

[\[30\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=The%20global%20Assets%20class%20is,resources%20in%20your%20PixiJS%20application) [\[31\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=,Automatically%20select%20optimal%20asset%20formats) [\[32\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=Supported%20Asset%20Types%3A) [\[33\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=) [\[34\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=const%20assets%20%3D%20await%20Assets.load%28,fnt%27) [\[35\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20background%20loading%20Assets.backgroundLoad%28,background%20one%20at%20a%20time) [\[36\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20Load%20a%20bundle%20of,backgroundLoadBundle%28%27resultsAssets) [\[37\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=%2F%2F%20Memory%20management%20await%20Assets,unloadBundle%28%27levelOne%27%29%3B%20Copy) [\[38\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=) [\[39\]](https://pixijs.download/release/docs/assets.Assets.html#:~:text=await%20Assets.init%28,avif%27%2C%20%27webp%27%2C%20%27png%27%5D) Assets | pixi.js

[https://pixijs.download/release/docs/assets.Assets.html](https://pixijs.download/release/docs/assets.Assets.html)

[\[46\]](https://pixijs.download/release/docs/accessibility.PointerEvents.html#:~:text=PointerEvents%3A%20%7C%20,inherit) PointerEvents | pixi.js

[https://pixijs.download/release/docs/accessibility.PointerEvents.html](https://pixijs.download/release/docs/accessibility.PointerEvents.html)

[\[47\]](https://pixijs.download/release/docs/accessibility.html#:~:text=The%20accessibility%20system%20in%20PixiJS,and%20interpreted%20by%20assistive%20technologies) [\[48\]](https://pixijs.download/release/docs/accessibility.html#:~:text=const%20button%20%3D%20new%20Container) [\[49\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Configure%20the%20accessibility%20system%20when,creating%20your%20application) [\[50\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Control%20the%20tab%20order%20of,accessible%20elements) [\[51\]](https://pixijs.download/release/docs/accessibility.html#:~:text=const%20menu%20%3D%20new%20Container,default%29%20Copy) [\[52\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Control%20the%20accessibility%20system%20at,runtime) [\[53\]](https://pixijs.download/release/docs/accessibility.html#:~:text=Best%20Practices) [\[54\]](https://pixijs.download/release/docs/accessibility.html#:~:text=3,mode%20during%20development) Accessibility Overview | pixi.js

[https://pixijs.download/release/docs/accessibility.html](https://pixijs.download/release/docs/accessibility.html)

[\[55\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=The%20Filter%20class%20is%20the,wasn%27t%20there%20for%20that%20renderer) [\[56\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=Its%20worth%20noting%20Performance,when%20a%20filter%20is%20applied) [\[57\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=) [\[60\]](https://pixijs.download/release/docs/filters.Filter.html#:~:text=Its%20worth%20noting%20Performance,when%20a%20filter%20is%20applied) Filter | pixi.js

[https://pixijs.download/release/docs/filters.Filter.html](https://pixijs.download/release/docs/filters.Filter.html)

[\[58\]](https://pixijs.download/release/docs/maths.Point.html#:~:text=The%20Point%20object%20represents%20a,position%20on%20the%20vertical%20axis) [\[59\]](https://pixijs.download/release/docs/maths.Point.html#:~:text=add%20clone%20copy%20From%20copy,rotate%20set%20subtract%20to%20String) Point | pixi.js

[https://pixijs.download/release/docs/maths.Point.html](https://pixijs.download/release/docs/maths.Point.html)