const startButton = document.querySelector('#start');
const endButton = document.querySelector('#end');
const status = document.querySelector('#status');

async function init() {
  if (!window.isSecureContext) throw new Error('Откройте страницу через HTTPS или localhost.');
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-ar'))) {
    throw new Error('Immersive AR недоступен. Используйте устройство с поддержкой WebXR (Chrome на Android) или WebXR-эмулятор.');
  }
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x606060, 3));

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.12, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Куб 20 см. Геометрия поднята на половину высоты, чтобы низ лежал на плоскости.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.1, 0),
    new THREE.MeshStandardMaterial({ color: 0x2288ff, roughness: 0.6 }),
  );
  cube.matrixAutoUpdate = false;
  cube.visible = false;
  // Объект — ребёнок сцены, поэтому не перемещается вместе с камерой.
  scene.add(cube);

  let session = null;
  let hitTestSource = null; // XRHitTestSource для луча из центра камеры.
  let placed = false;
  const hitMatrix = new THREE.Matrix4();
  const normal = new THREE.Vector3();

  function updateReticle(frame) {
    reticle.visible = false;
    if (!frame || !hitTestSource || placed) return;
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (!referenceSpace) return;
    const hits = frame.getHitTestResults(hitTestSource);
    for (const hit of hits) {
      const pose = hit.getPose(referenceSpace);
      if (!pose) continue;
      hitMatrix.fromArray(pose.transform.matrix);
      // Локальная ось Y результата — нормаль поверхности. Выбираем горизонтальную.
      normal.setFromMatrixColumn(hitMatrix, 1).normalize();
      if (normal.y < 0.9) continue;
      reticle.matrix.copy(hitMatrix);
      reticle.visible = true;
      break;
    }
  }

  function onSelect(event) {
    if (placed) return;
    // Используем свежий результат в кадре тапа, без устаревшего маркера.
    updateReticle(event.frame);
    if (!reticle.visible) return;
    cube.matrix.copy(reticle.matrix);
    cube.visible = true;
    placed = true;
    reticle.visible = false;
    // Матрица куба после размещения больше не обновляется результатами hit-test.
    status.textContent = 'Куб размещён. Перемещайте камеру — куб остаётся на месте.';
  }

  function cleanup() {
    hitTestSource?.cancel();
    hitTestSource = null;
    session = null;
    placed = false;
    cube.visible = false;
    reticle.visible = false;
    startButton.disabled = false;
    startButton.hidden = false;
    endButton.hidden = true;
    status.textContent = 'AR-сессия завершена.';
  }

  // Клики по кнопкам DOM overlay не должны размещать куб.
  document.querySelector('#controls').addEventListener('beforexrselect', event => event.preventDefault());
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    status.textContent = 'Запуск AR…';
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.querySelector('#overlay') },
      });
      session.addEventListener('end', cleanup, { once: true });
      session.addEventListener('select', onSelect);
      await renderer.xr.setSession(session);
      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      startButton.hidden = true;
      endButton.hidden = false;
      status.textContent = 'Медленно наведите камеру на пол или стол. Когда появится кольцо, коснитесь экрана.';
    } catch (error) {
      if (session) {
        try { await session.end(); } catch { cleanup(); }
      } else cleanup();
      status.textContent = `Не удалось запустить AR: ${error.message}`;
    }
  });
  endButton.addEventListener('click', async () => {
    try { await session?.end(); }
    catch (error) { status.textContent = `Ошибка завершения AR: ${error.message}`; }
  });
  renderer.setAnimationLoop((time, frame) => {
    if (frame && !placed) {
      updateReticle(frame);
      status.textContent = reticle.visible
        ? 'Плоскость найдена. Коснитесь экрана, чтобы разместить куб.'
        : 'Медленно наведите камеру на пол или стол. Ожидание плоскости…';
    }
    renderer.render(scene, camera);
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight);
  });
  startButton.disabled = false;
  status.textContent = 'Нажмите «Запустить AR». После появления кольца коснитесь экрана.';
}

init().catch(error => { status.textContent = error.message; });
