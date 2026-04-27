document.addEventListener('DOMContentLoaded', () => {
  // Wait for A-Frame to load and expose THREE
  let THREE = window.THREE || AFRAME.THREE;
  
  const onlineEl = document.getElementById('onlineCount');
  const eggsFoundEl = document.getElementById('eggsFound');
  const eggsListEl = document.getElementById('eggsList');
  const scanBtn = document.getElementById('scanBtn');
  const socket = io();
  const blocksContainer = document.getElementById('blocks-container');
  const camera = document.getElementById('camera');
  const rig = document.getElementById('rig');
  const leftHand = document.getElementById('leftHand');
  const rightHand = document.getElementById('rightHand');
  
  let selectedColor = '#F44'; // Red by default
  let blockIdCounter = 0;
  let foundEggs = new Set();
  let easterEggs = [];
  let scanActive = false;
  let lastPlayerUpdate = Date.now();
  let insideApartment = false;
  let apartmentDoor = null;
  let apartmentInterior = null;
  
  // Wait for VR controllers to load
  const sceneEl = document.querySelector('a-scene');
  sceneEl.addEventListener('loaded', () => {
    setupVRControllers();
    setupApartmentBuilding();
  });

  // Setup apartment building interactions
  function setupApartmentBuilding() {
    apartmentDoor = document.getElementById('apartment-door');
    apartmentInterior = document.getElementById('apartment-interior');
    
    if (!apartmentDoor) {
      console.warn('Apartment door not found');
      return;
    }
    
    // Add cursor event for door interaction
    apartmentDoor.addEventListener('click', toggleApartmentDoor);
    
    // Make door interactable with VR controllers
    apartmentDoor.classList.add('interactable');
    
    console.log('🏢 Apartment building initialized');
  }
  
  function toggleApartmentDoor() {
    const doorState = apartmentDoor.getAttribute('data-state');
    
    if (doorState === 'closed') {
      // Open door
      apartmentDoor.setAttribute('data-state', 'open');
      apartmentDoor.setAttribute('animation', 'property: rotation; to: 0 -90 0; dur: 1000; easing: easeInOutQuad');
      apartmentDoor.setAttribute('color', '#654321');
      
      // Show interior after door opens
      setTimeout(() => {
        if (apartmentInterior) {
          apartmentInterior.setAttribute('visible', 'true');
        }
        insideApartment = false; // Player can now enter
        console.log('🚪 Door opened - You can enter!');
      }, 1000);
      
    } else {
      // Close door
      apartmentDoor.setAttribute('data-state', 'closed');
      apartmentDoor.setAttribute('animation', 'property: rotation; to: 0 0 0; dur: 1000; easing: easeInOutQuad');
      apartmentDoor.setAttribute('color', '#8B4513');
      
      // Hide interior when door closes
      setTimeout(() => {
        if (apartmentInterior) {
          apartmentInterior.setAttribute('visible', 'false');
        }
        console.log('🚪 Door closed');
      }, 1000);
    }
  }
  
  // Check if player is near apartment to show prompt
  function checkApartmentProximity() {
    if (!rig || !apartmentDoor) return;
    
    const playerPos = rig.object3D.position;
    const doorPos = new THREE.Vector3(10, 1, -6.8); // Approximate door position in world space
    const distance = playerPos.distanceTo(doorPos);
    
    // Show interaction prompt when near door
    if (distance < 3 && !document.getElementById('door-prompt')) {
      const prompt = document.createElement('div');
      prompt.id = 'door-prompt';
      prompt.style.cssText = 'position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #FFD700; padding: 12px 20px; border-radius: 8px; font-size: 18px; z-index: 100;';
      prompt.textContent = '🚪 Click door to enter apartment';
      document.body.appendChild(prompt);
    } else if (distance >= 3 && document.getElementById('door-prompt')) {
      document.getElementById('door-prompt').remove();
    }
    
    // Check if player is inside apartment
    const insidePos = new THREE.Vector3(10, 1.6, -9);
    if (playerPos.distanceTo(insidePos) < 2) {
      if (!insideApartment) {
        insideApartment = true;
        console.log('🏠 You entered the apartment!');
      }
    } else {
      if (insideApartment) {
        insideApartment = false;
        console.log('👋 You left the apartment');
      }
    }
  }
  
  // Monitor player position for apartment proximity
  setInterval(checkApartmentProximity, 500);
  
  // 'S' key for special scan character
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ṣ') {
      e.preventDefault();
      scanActive = !scanActive;
      scanBtn.style.background = scanActive ? '#6A1B9A' : '#9C27B0';
      scanBtn.textContent = scanActive ? '🔍 SCANNING...' : '🔍 Scan';
      
      const eggElements = blocksContainer.querySelectorAll('[data-is-egg="true"]');
      eggElements.forEach(el => {
        if (scanActive) {
          el.setAttribute('animation', 'property: scale; to: 0.7 0.7 0.7; loop: true; dur: 500; direction: alternate');
          el.setAttribute('material', 'emissive: #FFD700; emissiveIntensity: 0.5');
        } else {
          el.removeAttribute('animation');
          el.removeAttribute('material');
        }
      });
      
      socket.emit('scan-activated', { playerId: socket.id });
      console.log(scanActive ? '🔍 SCAN INITIATED - World scanning...' : '🔍 Scan offline');
    }
  });

  // Color button handlers
  ['Red', 'Green', 'Blue', 'Yellow'].forEach(color => {
    document.getElementById(`color${color}`).addEventListener('click', () => {
      const colors = { Red: '#F44', Green: '#4F4', Blue: '#44F', Yellow: '#FF4' };
      selectedColor = colors[color];
      console.log('Selected color:', selectedColor);
    });
  });

  // Setup VR controller interactions
  function setupVRControllers() {
    // Right controller trigger for placing blocks
    if (rightHand) {
      rightHand.addEventListener('triggerdown', () => {
        placeBlockFromRaycaster(rightHand);
      });
    }
    
    // Left controller trigger for placing blocks
    if (leftHand) {
      leftHand.addEventListener('triggerdown', () => {
        placeBlockFromRaycaster(leftHand);
      });
    }
    
    // Grip buttons for removing blocks
    if (rightHand) {
      rightHand.addEventListener('gripdown', () => {
        removeBlockFromRaycaster(rightHand);
      });
    }
    
    if (leftHand) {
      leftHand.addEventListener('gripdown', () => {
        removeBlockFromRaycaster(leftHand);
      });
    }
  }
  
  // Place block using controller raycaster
  function placeBlockFromRaycaster(controller) {
    const raycaster = controller.components.raycaster;
    if (!raycaster) return;
    
    const intersection = raycaster.getIntersection(document.querySelectorAll('.buildable')[0]);
    if (intersection) {
      const hit = intersection;
      const hitPoint = hit.point;
      const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
      const offset = 0.3;
      const newPos = {
        x: hitPoint.x + normal.x * offset,
        y: hitPoint.y + normal.y * offset,
        z: hitPoint.z + normal.z * offset
      };
      
      const block = {
        id: `block-${blockIdCounter++}`,
        pos: newPos,
        color: selectedColor
      };
      
      console.log('Placing block from VR controller:', block);
      socket.emit('place-block', block);
    }
  }
  
  // Remove block using controller raycaster
  function removeBlockFromRaycaster(controller) {
    const raycaster = controller.components.raycaster;
    if (!raycaster) return;
    
    const intersection = raycaster.getIntersection(document.querySelector('[data-block-id]'));
    if (intersection && intersection.object) {
      const hitObj = intersection.object;
      const blockElems = blocksContainer.querySelectorAll('[data-block-id]');
      
      for (const el of blockElems) {
        if (el.object3D === hitObj) {
          const blockId = el.getAttribute('data-block-id');
          console.log('Removing block from VR controller:', blockId);
          socket.emit('remove-block', { id: blockId });
          break;
        }
      }
    }
  }

  // Raycasting for block placement—use A-Frame raycaster events
  document.addEventListener('click', (event) => {
    // Check if Shift+click on an Easter egg
    if (event.shiftKey) {
      const raycaster = new THREE.Raycaster();
      const camera3d = camera.object3D.getWorldPosition(new THREE.Vector3());
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.object3D.quaternion).normalize();
      raycaster.ray.set(camera3d, direction);
      
      const eggElems = blocksContainer.querySelectorAll('[data-is-egg="true"]');
      const eggObjs = Array.from(eggElems).map(el => el.object3D);
      const hits = raycaster.intersectObjects(eggObjs);
      
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        for (const el of eggElems) {
          if (el.object3D === hitObj) {
            const eggId = el.getAttribute('data-block-id');
            const eggName = el.getAttribute('data-egg-name');
            if (!foundEggs.has(eggId)) {
              foundEggs.add(eggId);
              eggsFoundEl.textContent = foundEggs.size;
              console.log(`🥚 Collected: ${eggName}!`);
              socket.emit('discover-egg', { id: eggId, name: eggName });
              updateEggsList();
              // Flash effect
              el.setAttribute('scale', '0.6 0.6 0.6');
              setTimeout(() => el.setAttribute('scale', '0.5 0.5 0.5'), 200);
            }
            break;
          }
        }
      }
      return;
    }
    
    // Normal block placement
    const raycaster = new THREE.Raycaster();
    const camera3d = camera.object3D.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.object3D.quaternion).normalize();
    raycaster.ray.set(camera3d, direction);
    
    const buildables = Array.from(document.querySelectorAll('.buildable')).map(el => el.object3D);
    const hits = raycaster.intersectObjects(buildables);
    
    if (hits.length > 0) {
      const hit = hits[0];
      const hitPoint = hit.point;
      const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
      const offset = 0.3;
      const newPos = {
        x: hitPoint.x + normal.x * offset,
        y: hitPoint.y + normal.y * offset,
        z: hitPoint.z + normal.z * offset
      };
      
      const block = {
        id: `block-${blockIdCounter++}`,
        pos: newPos,
        color: selectedColor
      };
      
      console.log('Placing block:', block);
      socket.emit('place-block', block);
    }
  });

  // Middle-click to remove block
  document.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle button
      e.preventDefault();
      const raycaster = new THREE.Raycaster();
      const camera3d = camera.object3D.getWorldPosition(new THREE.Vector3());
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.object3D.quaternion).normalize();
      raycaster.ray.set(camera3d, direction);
      
      const blockElems = blocksContainer.querySelectorAll('[data-block-id]');
      const blockObjs = Array.from(blockElems).map(el => el.object3D);
      const hits = raycaster.intersectObjects(blockObjs);
      
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        // Find the element with this object3D
        for (const el of blockElems) {
          if (el.object3D === hitObj) {
            const blockId = el.getAttribute('data-block-id');
            console.log('Removing block:', blockId);
            socket.emit('remove-block', { id: blockId });
            break;
          }
        }
      }
    }
  });

  // Presence updates from server
  socket.on('presence', (data) => {
    onlineEl.textContent = data.clients || 0;
  });

  // Load initial blocks from server
  socket.on('blocks-init', (blocks) => {
    blocksContainer.innerHTML = '';
    blockIdCounter = 0;
    easterEggs = blocks.filter(b => b.isEgg);
    blocks.forEach(block => {
      renderBlock(block);
      blockIdCounter = Math.max(blockIdCounter, parseInt(block.id.split('-')[1] || -1) + 1);
    });
  });

  // Real-time block add
  socket.on('block-added', (block) => {
    renderBlock(block);
  });

  // Real-time block remove
  socket.on('block-removed', (data) => {
    const elem = blocksContainer.querySelector(`[data-block-id="${data.id}"]`);
    if (elem) elem.remove();
  });

  // Easter egg discovery broadcast
  socket.on('egg-found', (data) => {
    console.log(`✨ ${data.playerMessage}`);
  });

  // Handle chunk generation from server
  socket.on('chunk-generated', (data) => {
    console.log(`🌍 Chunk generated at (${data.chunkX}, ${data.chunkZ}) - ${data.blocks.length} blocks`);
    data.blocks.forEach(block => {
      renderBlock(block);
    });
  });

  // Listen for world scan events
  socket.on('world-scan', (data) => {
    console.log(`🔍 Scan initiated by another player`);
  });

  // Track player position for procedural generation
  setInterval(() => {
    if (rig && Date.now() - lastPlayerUpdate > 500) { // Update every 500ms
      const pos = rig.object3D.position;
      socket.emit('player-moved', { pos: { x: pos.x, y: pos.y, z: pos.z } });
      lastPlayerUpdate = Date.now();
    }
  }, 500);

  function renderBlock(block) {
    const el = document.createElement('a-box');
    el.setAttribute('position', `${block.pos.x.toFixed(2)} ${block.pos.y.toFixed(2)} ${block.pos.z.toFixed(2)}`);
    el.setAttribute('scale', block.isEgg ? '0.5 0.5 0.5' : '0.5 0.5 0.5');
    el.setAttribute('color', block.color);
    el.setAttribute('class', 'buildable');
    el.setAttribute('data-block-id', block.id);
    
    if (block.isEgg) {
      el.setAttribute('data-is-egg', 'true');
      el.setAttribute('data-egg-name', block.name || 'Mystery Egg');
      el.setAttribute('material', 'metalness: 0.8; roughness: 0.2');
    }
    
    blocksContainer.appendChild(el);
  }

  function updateEggsList() {
    const names = Array.from(foundEggs).map(id => {
      const egg = easterEggs.find(e => e.id === id);
      return egg ? egg.name : id;
    });
    eggsListEl.innerHTML = names.map(n => `✨ ${n}`).join('<br>');
  }

  // Basic connection diagnostic
  socket.on('connect', () => {
    console.log('Connected to backend via Socket.IO');
  });
});
