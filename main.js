import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Raycaster } from 'three';

let scene, camera, renderer, controls;
let currentModel = null;
let raycaster;
let clickedFace = null;
let isRotating = false;
let targetQuaternion = null;
let cameraTarget = new THREE.Vector3();

// Initialize the 3D viewer
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(100, 100, 200);
    camera.lookAt(cameraTarget);

    // Renderer setup
    const container = document.getElementById('model-viewer');
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

    // Add print bed
    const bedGeometry = new THREE.BoxGeometry(200, 2, 200);
    const bedMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x808080,
        transparent: true,
        opacity: 0.7
    });
    const printBed = new THREE.Mesh(bedGeometry, bedMaterial);
    printBed.position.y = -2; // Position bed so its top surface is exactly at y=0 (thickness is 2)
    printBed.receiveShadow = true;
    scene.add(printBed);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Add raycaster initialization
    raycaster = new THREE.Raycaster();
    
    // Add click event listener to the renderer
    renderer.domElement.addEventListener('click', onModelClick);

    animate();
}

function onWindowResize() {
    const container = document.getElementById('model-viewer');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    // Ensure model stays centered after resize
    if (currentModel) {
        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2;
        camera.position.setLength(distance);
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (isRotating && targetQuaternion) {
        const step = 0.05;
        currentModel.quaternion.rotateTowards(targetQuaternion, step);
        
        if (currentModel.quaternion.angleTo(targetQuaternion) < 0.01) {
            // Complete the rotation
            currentModel.quaternion.copy(targetQuaternion);
            
            // Update overhangs
            updateOverhangsAfterRotation();
            
            // Center and place on bed
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            
            // Place on bed and center
            currentModel.position.set(
                -center.x,  // Center X
                -box.min.y, // Place on bed
                -center.z   // Center Z
            );
            
            // Update camera target
            cameraTarget.set(0, 0, 0);
            controls.target.copy(cameraTarget);
            controls.update();
            
            // Clear rotation state
            isRotating = false;
            targetQuaternion = null;
        }
    }

    renderer.render(scene, camera);
}

// Load 3D model
function loadModel(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const contents = event.target.result;
        
        // Remove existing model if any
        if (currentModel) {
            scene.remove(currentModel);
        }

        // Choose loader based on file extension
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'stl') {
            const loader = new STLLoader();
            const geometry = loader.parse(contents);
            
            // Create two materials for normal and overhang surfaces
            const normalMaterial = new THREE.MeshPhongMaterial({
                color: 0x3498db,
                specular: 0x111111,
                shininess: 30,
                flatShading: false
            });
            
            const overhangMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                specular: 0x111111,
                shininess: 30,
                flatShading: false
            });

            // Analyze geometry and create separate geometries for normal and overhang faces
            const positions = geometry.attributes.position.array;
            const normals = geometry.attributes.normal.array;
            
            const normalGeometry = new THREE.BufferGeometry();
            const overhangGeometry = new THREE.BufferGeometry();
            
            const normalPositions = [];
            const overhangPositions = [];
            const normalNormals = [];
            const overhangNormals = [];

            // Check each face
            for (let i = 0; i < positions.length; i += 9) {
                const normal = new THREE.Vector3(
                    normals[i], normals[i + 1], normals[i + 2]
                );
                
                // Calculate angle between normal and up vector (0, 1, 0)
                const angle = normal.angleTo(new THREE.Vector3(0, 1, 0));
                const angleInDegrees = THREE.MathUtils.radToDeg(angle);
                
                // Faces pointing more than 45 degrees down are overhangs
                if (angleInDegrees > 135) {
                    for (let j = 0; j < 9; j++) {
                        overhangPositions.push(positions[i + j]);
                        overhangNormals.push(normals[i + j]);
                    }
                } else {
                    for (let j = 0; j < 9; j++) {
                        normalPositions.push(positions[i + j]);
                        normalNormals.push(normals[i + j]);
                    }
                }
            }

            // Create normal mesh
            normalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(normalPositions, 3));
            normalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalNormals, 3));
            const normalMesh = new THREE.Mesh(normalGeometry, normalMaterial);

            // Create overhang mesh
            overhangGeometry.setAttribute('position', new THREE.Float32BufferAttribute(overhangPositions, 3));
            overhangGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(overhangNormals, 3));
            const overhangMesh = new THREE.Mesh(overhangGeometry, overhangMaterial);

            // Create a group to hold both meshes
            currentModel = new THREE.Group();
            currentModel.add(normalMesh);
            currentModel.add(overhangMesh);

        } else if (extension === 'obj') {
            const loader = new OBJLoader();
            currentModel = loader.parse(contents);
            
            // Apply overhang detection to each mesh in the OBJ model
            currentModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const geometry = child.geometry;
                    const positions = geometry.attributes.position.array;
                    const normals = geometry.attributes.normal.array;

                    const normalGeometry = new THREE.BufferGeometry();
                    const overhangGeometry = new THREE.BufferGeometry();
                    
                    const normalPositions = [];
                    const overhangPositions = [];
                    const normalNormals = [];
                    const overhangNormals = [];

                    for (let i = 0; i < positions.length; i += 9) {
                        const normal = new THREE.Vector3(
                            normals[i], normals[i + 1], normals[i + 2]
                        );
                        
                        const angle = normal.angleTo(new THREE.Vector3(0, 1, 0));
                        const angleInDegrees = THREE.MathUtils.radToDeg(angle);
                        
                        if (angleInDegrees > 135) {
                            for (let j = 0; j < 9; j++) {
                                overhangPositions.push(positions[i + j]);
                                overhangNormals.push(normals[i + j]);
                            }
                        } else {
                            for (let j = 0; j < 9; j++) {
                                normalPositions.push(positions[i + j]);
                                normalNormals.push(normals[i + j]);
                            }
                        }
                    }

                    normalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(normalPositions, 3));
                    normalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalNormals, 3));
                    const normalMesh = new THREE.Mesh(normalGeometry, new THREE.MeshPhongMaterial({
                        color: 0x3498db,
                        specular: 0x111111,
                        shininess: 30,
                        flatShading: false
                    }));

                    overhangGeometry.setAttribute('position', new THREE.Float32BufferAttribute(overhangPositions, 3));
                    overhangGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(overhangNormals, 3));
                    const overhangMesh = new THREE.Mesh(overhangGeometry, new THREE.MeshPhongMaterial({
                        color: 0xff0000,
                        specular: 0x111111,
                        shininess: 30,
                        flatShading: false
                    }));

                    // Replace the original mesh with a group containing both normal and overhang meshes
                    const group = new THREE.Group();
                    group.add(normalMesh);
                    group.add(overhangMesh);
                    child.parent.add(group);
                    child.parent.remove(child);
                }
            });
        }

        if (currentModel) {
            // First scale the model to fit the view
            const box = new THREE.Box3().setFromObject(currentModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 100 / maxDim;
            currentModel.scale.multiplyScalar(scale);

            // Recalculate bounding box after scaling
            box.setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());

            // Center the model on the print bed
            currentModel.position.set(
                -center.x,  // Center X
                -box.min.y, // Place on bed
                -center.z   // Center Z
            );

            // Update camera position and target
            const distance = Math.max(200, maxDim * 2);
            camera.position.set(distance/2, distance/2, distance);
            cameraTarget.set(0, 0, 0);
            controls.target.copy(cameraTarget);
            
            // Reset camera rotation
            camera.lookAt(cameraTarget);
            controls.update();

            scene.add(currentModel);
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
        loadModel(file);
    }
});

document.getElementById('infill').addEventListener('input', (event) => {
    document.getElementById('infill-value').textContent = `${event.target.value}%`;
    calculateCosts();
});

document.getElementById('material-cost').addEventListener('input', calculateCosts);
document.getElementById('print-time-cost').addEventListener('input', calculateCosts);

// Add new function for click handling
function onModelClick(event) {
    if (!currentModel || isRotating) return;

    const container = document.getElementById('model-viewer');
    const rect = container.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Get all meshes from the model
    const meshes = [];
    currentModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            meshes.push(child);
        }
    });

    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        const face = intersection.face;
        const normal = face.normal.clone();
        
        // Transform the normal to world space
        normal.transformDirection(intersection.object.matrixWorld);
        
        // First, find a rotation that aligns the normal with the Y axis
        const yAxis = new THREE.Vector3(0, 1, 0);
        const rotationAxis = new THREE.Vector3();
        rotationAxis.crossVectors(normal, yAxis).normalize();
        
        // If normal and Y axis are parallel or anti-parallel, use X axis for rotation
        if (rotationAxis.lengthSq() < 0.001) {
            rotationAxis.set(1, 0, 0);
        }
        
        // Calculate the angle between the vectors
        const angle = Math.acos(normal.dot(yAxis));
        
        // Create rotation quaternion
        targetQuaternion = new THREE.Quaternion();
        targetQuaternion.setFromAxisAngle(rotationAxis, angle);
        
        // Then add a 180-degree rotation around the X axis to flip it face down
        const flipRotation = new THREE.Quaternion();
        flipRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        targetQuaternion.premultiply(flipRotation);
        
        // Start rotation animation
        isRotating = true;
    }
}

// Add new function for updating overhangs after rotation
function updateOverhangsAfterRotation() {
    if (!currentModel) return;

    const upVector = new THREE.Vector3(0, 1, 0);
    const worldMatrix = currentModel.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    // Remove existing supports if any
    currentModel.traverse((child) => {
        if (child.name === 'supports') {
            child.parent.remove(child);
        }
    });

    // Create a group for all supports
    const supportsGroup = new THREE.Group();
    supportsGroup.name = 'supports';

    currentModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            const geometry = child.geometry;
            if (!geometry.isBufferGeometry) return;

            // Create new geometries
            const normalGeometry = new THREE.BufferGeometry();
            const overhangGeometry = new THREE.BufferGeometry();
            const supportGeometry = new THREE.BufferGeometry();

            // Get position and normal attributes
            const positions = geometry.attributes.position.array;
            const normals = geometry.attributes.normal.array;
            
            const normalPositions = [];
            const overhangPositions = [];
            const normalNormals = [];
            const overhangNormals = [];
            const supportVertices = [];

            // Process triangles
            for (let i = 0; i < positions.length; i += 9) {
                // Get face normal in world space
                const normal = new THREE.Vector3(
                    normals[i], normals[i + 1], normals[i + 2]
                ).applyMatrix3(normalMatrix).normalize();

                const angle = normal.angleTo(upVector);
                const angleInDegrees = THREE.MathUtils.radToDeg(angle);

                // Faces pointing more than 45 degrees down are overhangs
                if (angleInDegrees > 135) {
                    // Add to overhang geometry
                    for (let j = 0; j < 9; j++) {
                        overhangPositions.push(positions[i + j]);
                        overhangNormals.push(normals[i + j]);
                    }

                    // Create support for this overhang face
                    // Get the three vertices of the face in world space
                    const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
                    const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
                    const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
                    v1.applyMatrix4(child.matrixWorld);
                    v2.applyMatrix4(child.matrixWorld);
                    v3.applyMatrix4(child.matrixWorld);

                    // Calculate face center
                    const center = new THREE.Vector3()
                        .add(v1)
                        .add(v2)
                        .add(v3)
                        .multiplyScalar(1/3);

                    // Create support column vertices
                    const bottomY = 0; // Print bed level
                    const supportWidth = 2; // Width of support column

                    // Create a box for the support
                    supportVertices.push(
                        // Front face
                        center.x - supportWidth/2, center.y, center.z - supportWidth/2,
                        center.x - supportWidth/2, bottomY, center.z - supportWidth/2,
                        center.x + supportWidth/2, bottomY, center.z - supportWidth/2,
                        center.x + supportWidth/2, center.y, center.z - supportWidth/2,

                        // Back face
                        center.x - supportWidth/2, center.y, center.z + supportWidth/2,
                        center.x - supportWidth/2, bottomY, center.z + supportWidth/2,
                        center.x + supportWidth/2, bottomY, center.z + supportWidth/2,
                        center.x + supportWidth/2, center.y, center.z + supportWidth/2
                    );
                } else {
                    for (let j = 0; j < 9; j++) {
                        normalPositions.push(positions[i + j]);
                        normalNormals.push(normals[i + j]);
                    }
                }
            }

            // Create materials with side: THREE.DoubleSide to ensure faces are visible from both sides
            const normalMaterial = new THREE.MeshPhongMaterial({
                color: 0x3498db,
                specular: 0x111111,
                shininess: 30,
                flatShading: false,
                side: THREE.DoubleSide
            });

            const overhangMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                specular: 0x111111,
                shininess: 30,
                flatShading: false,
                side: THREE.DoubleSide
            });

            const supportMaterial = new THREE.MeshPhongMaterial({
                color: 0x808080,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            });

            // Create meshes if there are vertices
            const newGroup = new THREE.Group();
            
            if (normalPositions.length > 0) {
                normalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(normalPositions, 3));
                normalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalNormals, 3));
                const normalMesh = new THREE.Mesh(normalGeometry, normalMaterial);
                newGroup.add(normalMesh);
            }

            if (overhangPositions.length > 0) {
                overhangGeometry.setAttribute('position', new THREE.Float32BufferAttribute(overhangPositions, 3));
                overhangGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(overhangNormals, 3));
                const overhangMesh = new THREE.Mesh(overhangGeometry, overhangMaterial);
                newGroup.add(overhangMesh);
            }

            // Create support mesh if there are support vertices
            if (supportVertices.length > 0) {
                const supportPositions = new Float32Array(supportVertices);
                supportGeometry.setAttribute('position', new THREE.BufferAttribute(supportPositions, 3));

                // Create indices for the box faces
                const indices = [];
                for (let i = 0; i < supportVertices.length/12; i++) {
                    const baseIndex = i * 8;
                    // Front face
                    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
                    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
                    // Back face
                    indices.push(baseIndex + 4, baseIndex + 6, baseIndex + 5);
                    indices.push(baseIndex + 4, baseIndex + 7, baseIndex + 6);
                    // Left face
                    indices.push(baseIndex, baseIndex + 4, baseIndex + 5);
                    indices.push(baseIndex, baseIndex + 5, baseIndex + 1);
                    // Right face
                    indices.push(baseIndex + 3, baseIndex + 2, baseIndex + 6);
                    indices.push(baseIndex + 3, baseIndex + 6, baseIndex + 7);
                }
                supportGeometry.setIndex(indices);
                supportGeometry.computeVertexNormals();

                const supportMesh = new THREE.Mesh(supportGeometry, supportMaterial);
                supportsGroup.add(supportMesh);
            }

            // Replace the old mesh with the new group
            if (child.parent) {
                child.parent.add(newGroup);
                child.parent.remove(child);
            }
        }
    });

    // Add supports to the model
    if (supportsGroup.children.length > 0) {
        currentModel.add(supportsGroup);
    }
}

// Initialize the viewer
init(); 