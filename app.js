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

  // Точка 168 — переносица. MindAR обновляет положение, поворот и масштаб
  // группы относительно лица. Единица масштаба соответствует ширине лица.
  const anchor = mindar.addAnchor(168);
  anchor.group.visible = false;
  const glasses = new THREE.Group();
  glasses.scale.setScalar(1);
  glasses.position.set(0, -0.015, 0.055);
  anchor.group.add(glasses);
  const material = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.45 });

  // Лёгкая симметричная 3D-модель: две оправы, перемычка и дужки.
  for (const side of [-1, 1]) {
    const points = [];
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      points.push(new THREE.Vector3(side * 0.225 + Math.cos(angle) * 0.19, Math.sin(angle) * 0.13, 0));
    }
    const curve = new THREE.CatmullRomCurve3(points, true);
    glasses.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.018, 6, true), material));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.32), material);
    arm.position.set(side * 0.415, 0, -0.16);
    glasses.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.025), material);
  glasses.add(bridge);

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
          ? 'Лицо обнаружено. Поворачивайте голову — очки следуют за лицом.'
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
