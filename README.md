# 3D Print Cost Calculator

A web application that helps you calculate the cost of 3D printing your models. Upload STL or OBJ files, visualize them in 3D, and get instant cost estimates based on material usage and print time.

## Features

- Support for STL and OBJ file formats
- 3D model visualization with orbit controls
- Real-time cost calculation
- Adjustable parameters:
  - Material cost per gram
  - Print time cost per hour
  - Infill percentage
- Volume and weight calculations
- Responsive design

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Click the "Upload 3D Model" button to select your STL or OBJ file
2. Adjust the parameters as needed:
   - Material Cost: Cost per gram of filament
   - Print Time Cost: Cost per hour of printer operation
   - Infill Percentage: Density of the internal structure
3. View the model in 3D (use mouse to orbit, zoom, and pan)
4. Check the calculated results:
   - Volume in cubic centimeters
   - Estimated weight in grams
   - Material cost
   - Total estimated cost

## Technical Details

- Built with Three.js for 3D visualization
- Uses Vite as the build tool and development server
- Calculates volume using signed tetrahedron method
- Assumes PLA density of 1.24 g/cm³ for weight calculations
- Print time estimation is approximate and may vary based on printer settings

## License

MIT License 