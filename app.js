const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const status = document.querySelector('#status');

async function init() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Камера доступна только через HTTPS или localhost.');
  }
  const THREE = await import('three');
  const { MindARThree } = await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-face-three.prod.js');
  const mindar = new MindARThree({
    container: document.querySelector('#container'),
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    // Встроенный OneEuroFilter сглаживает точки лица, матрицу и масштаб.
    filterMinCF: 0.001,
    filterBeta: 1,
  });
  const { scene, renderer, camera } = mindar;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2));

  // Точка 10 — верхняя точка лба. MindAR обновляет положение, поворот и масштаб
  // группы относительно лица. Единица масштаба соответствует ширине лица.
  const anchor = mindar.addAnchor(10);
  anchor.group.visible = false;
  const crown = new THREE.Group();
  crown.scale.setScalar(1);
  crown.position.set(0, 0.14, -0.25);
  anchor.group.add(crown);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.35, roughness: 0.4, side: THREE.DoubleSide });

  // Лёгкая симметричная корона: обод и восемь зубцов.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 32, 1, true), gold);
  band.position.y = 0.06;
  crown.add(band);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 4), gold);
    tooth.position.set(Math.sin(angle) * 0.46, 0.22, Math.cos(angle) * 0.46);
    tooth.rotation.y = angle;
    crown.add(tooth);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), new THREE.MeshStandardMaterial({ color: 0xdd2244, roughness: 0.3 }));
  gem.position.set(0, 0.07, 0.47);
  crown.add(gem);

  let running = false;
  function stop() {
    renderer.setAnimationLoop(null);
    mindar.controller.stopProcessVideo();
    mindar.video?.srcObject?.getTracks().forEach(track => track.stop());
    mindar.video?.remove();
    anchor.group.visible = false;
    running = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    status.textContent = 'Камера остановлена.';
  }
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    status.textContent = 'Запуск камеры и распознавания лица…';
    try {
      await mindar.start();
      running = true;
      stopButton.disabled = false;
      renderer.setAnimationLoop(() => {
        // MindAR скрывает anchor.group, когда лицо не обнаружено.
        status.textContent = mindar.getLatestEstimate()
          ? 'Лицо обнаружено. Корона следует за головой.'
          : 'Посмотрите в камеру. Ожидание лица…';
        renderer.render(scene, camera);
      });
    } catch (error) {
      stop();
      status.textContent = `Не удалось запустить камеру. Разрешите доступ и проверьте интернет. ${error?.message || ''}`;
    }
  });
  stopButton.addEventListener('click', stop);
  window.addEventListener('pagehide', () => { if (running) stop(); });
  startButton.disabled = false;
  status.textContent = 'Нажмите «Включить камеру» и разрешите доступ.';
}

init().catch(error => { status.textContent = `Ошибка: ${error.message}`; });
