# TopoView

Interactive 3D topography viewer that renders contoured terrain for any location. Search for a place name or coordinates and explore the terrain in 3D with adjustable contour lines and elevation coloring.

**[Live Demo](https://zebiv.com/topoview/)**

## Features

- 3D terrain rendering with elevation data from AWS Terrain Tiles
- Contour lines with adjustable intervals
- Hypsometric color gradient with water detection
- Location search via Nominatim geocoding
- Mouse/touch orbit controls

## Tech

- Three.js (CDN, no build step)
- Custom GLSL shaders for contours, gradient coloring, and lighting
- AWS Terrain Tiles (Terrarium format)
- Single HTML file, no dependencies to install

## License

[MIT](LICENSE.md)
