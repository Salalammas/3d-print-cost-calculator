import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Raycaster } from 'three';

let scene, camera, renderer, controls;
let currentModel = null;
let raycaster;
let cameraTarget = new THREE.Vector3();

// Initialize the 3D viewer
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    const container = document.getElementById('model-viewer');
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target = cameraTarget;
    controls.minDistance = 50;
    controls.maxDistance = 400;
    controls.enablePan = false; // Disable panning to keep model centered
    controls.update();

    // Enhanced lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add multiple directional lights for better coverage
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
    frontLight.position.set(0, 0, 1);
    scene.add(frontLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.8);
    topLight.position.set(0, 1, 0);
    scene.add(topLight);

    const sideLight = new THREE.DirectionalLight(0xffffff, 0.5);
    sideLight.position.set(1, 0, 0);
    scene.add(sideLight);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Add raycaster initialization
    raycaster = new THREE.Raycaster();

    animate();
}

function onWindowResize() {
    const container = document.getElementById('model-viewer');

    // Main viewer resize
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Load 3D model
function loadModel(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const contents = event.target.result;
        
        // Remove existing model
        if (currentModel) {
            scene.remove(currentModel);
        }

        // Choose loader based on file extension
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'stl') {
            const loader = new STLLoader();
            const geometry = loader.parse(contents);
            
            const material = new THREE.MeshPhongMaterial({
                color: 0x3498db,
                specular: 0x111111,
                shininess: 30,
                flatShading: false
            });

            currentModel = new THREE.Mesh(geometry, material);

        } else if (extension === 'obj') {
            const loader = new OBJLoader();
            currentModel = loader.parse(contents);
            
            // Apply material to OBJ model
            currentModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshPhongMaterial({
                        color: 0x3498db,
                        specular: 0x111111,
                        shininess: 30,
                        flatShading: false
                    });
                }
            });
        }

        if (currentModel) {
            // Center and scale the model
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            // Scale to a reasonable size (50 units)
            const scale = 50 / maxDim;
            currentModel.scale.multiplyScalar(scale);
            
            // Recalculate box after scaling
            box.setFromObject(currentModel);
            center.copy(box.getCenter(new THREE.Vector3()));
            
            // Center the model at origin
            currentModel.position.sub(center);
            currentModel.position.y = -box.min.y;

            // Add to scene
            scene.add(currentModel);

            // Set up camera
            const distance = maxDim * 3;
            camera.position.set(distance, distance, distance);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0);
            
            // Update controls
            controls.minDistance = maxDim;
            controls.maxDistance = maxDim * 5;
            controls.update();

            calculateCosts();
        }
    };

    if (file.name.toLowerCase().endsWith('.stl')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// Calculate volume and costs
function calculateCosts() {
    if (!currentModel) return;

    // Calculate volume
    let volume = 0;
    
    // Handle both STL and OBJ models
    if (currentModel.geometry) {
        // Direct geometry (STL)
        const geometry = currentModel.geometry;
        if (geometry.isBufferGeometry) {
            const positions = geometry.attributes.position.array;
            const faces = positions.length / 9;
            for (let i = 0; i < faces; i++) {
                const a = new THREE.Vector3(
                    positions[i * 9], positions[i * 9 + 1], positions[i * 9 + 2]
                );
                const b = new THREE.Vector3(
                    positions[i * 9 + 3], positions[i * 9 + 4], positions[i * 9 + 5]
                );
                const c = new THREE.Vector3(
                    positions[i * 9 + 6], positions[i * 9 + 7], positions[i * 9 + 8]
                );
                volume += signedVolumeOfTriangle(a, b, c);
            }
        }
    } else if (currentModel.children) {
        // OBJ model (has children meshes)
        currentModel.traverse((child) => {
            if (child.geometry) {
                const geometry = child.geometry;
                if (geometry.isBufferGeometry) {
                    const positions = geometry.attributes.position.array;
                    const faces = positions.length / 9;
                    for (let i = 0; i < faces; i++) {
                        const a = new THREE.Vector3(
                            positions[i * 9], positions[i * 9 + 1], positions[i * 9 + 2]
                        );
                        const b = new THREE.Vector3(
                            positions[i * 9 + 3], positions[i * 9 + 4], positions[i * 9 + 5]
                        );
                        const c = new THREE.Vector3(
                            positions[i * 9 + 6], positions[i * 9 + 7], positions[i * 9 + 8]
                        );
                        volume += signedVolumeOfTriangle(a, b, c);
                    }
                }
            }
        });
    }

    // Convert to absolute value and cm³
    volume = Math.abs(volume) / 1000;

    // Get parameters
    const infillPercentage = document.getElementById('infill').value / 100;
    const materialCostPerGram = parseFloat(document.getElementById('material-cost').value);
    const printTimeCostPerHour = parseFloat(document.getElementById('print-time-cost').value);

    // Calculate weight (assuming PLA density of 1.24 g/cm³)
    const density = 1.24;
    const weight = volume * density * infillPercentage;

    // Calculate costs
    const materialCost = weight * materialCostPerGram;
    
    // Rough estimate of print time (this is a simple approximation)
    const printTimeHours = (volume * 0.1) * infillPercentage;
    const printTimeCost = printTimeHours * printTimeCostPerHour;

    const totalCost = materialCost + printTimeCost;

    // Update UI
    document.getElementById('volume').textContent = `${volume.toFixed(2)} cm³`;
    document.getElementById('weight').textContent = `${weight.toFixed(2)} g`;
    document.getElementById('material-cost-result').textContent = `$${materialCost.toFixed(2)}`;
    document.getElementById('total-cost').textContent = `$${totalCost.toFixed(2)}`;
}

function signedVolumeOfTriangle(p1, p2, p3) {
    return p1.dot(p2.cross(p3)) / 6.0;
}

// Event listeners
document.getElementById('model-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        document.querySelector('.file-chosen').textContent = file.name;
        loadModel(file);
        
        // Update message with price after model loads
        setTimeout(updateMessage, 100); // Small delay to ensure costs are calculated
    }
});

document.getElementById('infill').addEventListener('input', (event) => {
    document.getElementById('infill-value').textContent = `${event.target.value}%`;
    calculateCosts();
});

document.getElementById('material-cost').addEventListener('input', calculateCosts);
document.getElementById('print-time-cost').addEventListener('input', calculateCosts);

// Character count functionality
const messageTextarea = document.getElementById('message');
const charCount = document.querySelector('.char-count');

messageTextarea.addEventListener('input', (event) => {
    const length = event.target.value.length;
    charCount.textContent = `${length} / 2000`;
});

// Update message with calculated price
function updateMessage() {
    const volume = document.getElementById('volume').textContent;
    const weight = document.getElementById('weight').textContent;
    const materialCost = document.getElementById('material-cost-result').textContent;
    const totalCost = document.getElementById('total-cost').textContent;
    
    const message = `Hi, I'd like to get this 3D model printed.

Model details:
- Volume: ${volume}
- Weight: ${weight}
- Material Cost: ${materialCost}
- Total Estimated Cost: ${totalCost}

Please let me know if this is possible and when it could be ready.`;

    messageTextarea.value = message;
    messageTextarea.dispatchEvent(new Event('input')); // Update char count
}

// Initialize the viewer
init(); 