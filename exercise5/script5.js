   <script>
	//create a scene in three js
        const scene = new THREE.Scene();
	//define background
        scene.background = new THREE.Color(0x222232); // Gray background

        // Camera
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        //position of camera in axes xyz
	camera.position.set(3,5,3);

        // Renderer
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Lights
        const blueLight = new THREE.DirectionalLight(0x87ceeb, 0.8);
        blueLight.position.set(-5, 5, 5);
        scene.add(blueLight);
	
	const blueLight2 = new THREE.DirectionalLight(0x87ceef, 0.9);
        blueLight2.position.set(-5, -15, -5);
        scene.add(blueLight2);

        const yellowLight = new THREE.DirectionalLight(0xffd700, 0.7);
        yellowLight.position.set(5, 5, -5);
        scene.add(yellowLight);

        // Plane
        const planeGeometry = new THREE.PlaneGeometry(15, 15);
        const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x404040 });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -2.5;
        scene.add(plane);

        // Create Cube Grid
        const colors = [0x0000ff, 0xff0000, 0xffa500]; // Blue, Red, Orange
        const cubes = []; //empty array
	let cubeIndex = 1; //for numbering cubes

        for (let z = 0; z < 3; z++) {
            for (let y = 0; y < 3; y++) {
                for (let x = 0; x < 3; x++) {
		    //size of the cube
                    const cubeGeometry = new THREE.BoxGeometry(1.9, 1.9, 1.9);
                    const cubeMaterial = new THREE.MeshStandardMaterial({
                        color: colors[y],
                        transparent: true,
                        opacity: 0.7,
                    });
                    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
                    cube.position.set(x * 2 - 2, y * 2, z * 2 - 2);

                    // Add white sphere inside the cube
		    //define size of the sphere
                    const sphereGeometry = new THREE.SphereGeometry(0.2, 32, 32);
		    //define material
                    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f9f5 });
		    //attach material to sphere
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		    //contextual coordinates of the sphere (centering)
                    sphere.position.set(0, 0, 0);
		    //link sphere to the cube
                    cube.add(sphere);

                    // Store cube with index for interaction
                    cube.userData = { index: cubeIndex++ };
                    cubes.push(cube);
                    scene.add(cube);
                }
            }
        }

        // Orbit Controls
        const controls = new THREE.OrbitControls(camera, renderer.domElement);

        // Raycaster for interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const tooltip = document.getElementById('tooltip');

        function onMouseMove(event) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(cubes);

            if (intersects.length > 0) {
                const { index } = intersects[0].object.userData;
                tooltip.style.display = 'block';
                tooltip.style.left = event.clientX + 'px';
                tooltip.style.top = event.clientY + 'px';
                tooltip.textContent = `facet ${index}`;
            } else {
                tooltip.style.display = 'none';
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }

        window.addEventListener('mousemove', onMouseMove);
        animate();
    </script>
