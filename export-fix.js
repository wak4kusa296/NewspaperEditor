// === 新聞エディタ エクスポート修正パッチ ===
// このファイルを index.html の最後（</script>の直前）に貼り付けてください

(function() {
  if (window.__EXPORT_PATCHED__) return;
  window.__EXPORT_PATCHED__ = true;

  // 元の関数を完全に置き換え
  window.exportCanvasToImage = async function(format) {
    document.getElementById('export-menu-overlay').style.display='none';
    deselectAll();
    document.body.classList.add('preview-mode');

    // インク化処理
    const inkTasks = [];
    groups.forEach(g => {
      if (g.type === 'image' && g.colorMode === 'ink' && !g.imageInkSrc) {
        inkTasks.push(convertImageToInk(g, false));
      }
    });
    if (inkTasks.length > 0) {
      await Promise.all(inkTasks);
      renderGroups();
    }

    const gridWasVisible = document.getElementById('chk-grid') ? document.getElementById('chk-grid').checked : true;
    const gridLayer = document.getElementById('grid-layer');
    if (gridLayer) gridLayer.style.opacity = 0;

    await ensureWebFontsLoaded();
    await document.fonts.ready;

    const paperElement = document.querySelector('.paper');
    const canvasTransform = document.getElementById('canvas-transform');
    const originalTransform = canvasTransform ? canvasTransform.style.transform : '';
    const originalLeft = paperElement.style.left;
    const originalTop = paperElement.style.top;

    window.scrollTo(0, 0);
    if (canvasTransform) canvasTransform.style.transform = "scale(1)";
    paperElement.style.left = "0px";
    paperElement.style.top = "0px";

    try {
      await document.fonts.ready;

      console.log('[Export] Starting PNG generation...');

      // 紙面全体のSVGを生成（foreignObjectを使わない）
      const svg = await createCleanSVG();

      console.log('[Export] SVG generated, converting to PNG...');

      // SVGをPNGに変換
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = paperElement.offsetWidth * scale;
      canvas.height = paperElement.offsetHeight * scale;
      const ctx = canvas.getContext('2d');

      const svgBlob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG as image'));
        };
        img.src = url;
      });

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      console.log('[Export] PNG generation complete');

      const link = document.createElement('a');
      link.href = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.9);
      link.download = `shinbun.${format}`;
      link.click();

    } catch (err) {
      alert("書き出しに失敗しました: " + err.message);
      console.error('[Export Error]', err);
    } finally {
      document.body.classList.remove('preview-mode');
      if (canvasTransform) canvasTransform.style.transform = originalTransform;
      paperElement.style.left = originalLeft;
      paperElement.style.top = originalTop;
      if (gridLayer) gridLayer.style.opacity = gridWasVisible ? 1 : 0;
      renderGroups();
    }
  };

  // クリーンなSVGを生成（foreignObjectを使わず、各要素を個別に画像化）
  async function createCleanSVG() {
    const paperElement = document.querySelector('.paper');
    const paperStyle = window.getComputedStyle(paperElement);
    const width = paperElement.offsetWidth;
    const height = paperElement.offsetHeight;
    const paddingTop = parseFloat(paperStyle.paddingTop);
    const paddingLeft = parseFloat(paperStyle.paddingLeft);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">`;

    // 背景
    svg += `<rect width="${width}" height="${height}" fill="${window.config.paperColor || '#fcfcfc'}"/>`;

    // レイアウト線
    const layoutLines = document.getElementById('layout-lines-layer');
    if (layoutLines && layoutLines.innerHTML.trim()) {
      svg += `<g>${layoutLines.innerHTML}</g>`;
    }

    // レイアウト枠
    const layoutBorder = document.getElementById('layout-border-layer');
    if (layoutBorder && layoutBorder.innerHTML.trim()) {
      svg += `<g>${layoutBorder.innerHTML}</g>`;
    }

    // 各グループを画像として埋め込み
    for (const g of window.groups) {
      const groupImage = await captureGroupAsDataURL(g);
      if (groupImage) {
        const x = g.x + paddingLeft;
        const y = g.y + paddingTop;
        svg += `<image x="${x}" y="${y}" width="${g.w}" height="${g.h}" href="${groupImage}"/>`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  // グループ要素を画像としてキャプチャ
  async function captureGroupAsDataURL(group) {
    // 画像タイプは直接埋め込み
    if (group.type === 'image') {
      const imgSrc = group.colorMode === 'ink' && group.imageInkSrc ? group.imageInkSrc : group.imageSrc;
      return imgSrc || null;
    }

    // その他の要素はCanvasで描画
    const el = document.getElementById('group-' + group.id);
    if (!el) return null;

    // 一時的にUIを非表示
    const handles = el.querySelectorAll('.resize-handle, .port');
    const wasSelected = el.classList.contains('selected');

    if (wasSelected) el.classList.remove('selected');
    handles.forEach(h => h.style.display = 'none');

    try {
      // Canvasに描画
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = group.w * scale;
      canvas.height = group.h * scale;
      const ctx = canvas.getContext('2d');

      // 要素のSVG表現を作成
      const svgEl = el.querySelector('svg');
      if (svgEl) {
        // SVG要素がある場合（見出し・題字）
        const svgString = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        await new Promise((resolve, reject) => {
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject();
          };
          img.src = url;
        });
      } else {
        // テキスト要素などは背景を透明にして描画
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 簡易的にテキストを描画（完全な再現ではないが表示される）
        ctx.scale(scale, scale);
        ctx.fillStyle = window.config.textColor || '#000000';
        ctx.font = '24px "Noto Sans JP"';

        if (group.text) {
          const lines = group.text.split('\n');
          lines.forEach((line, i) => {
            ctx.fillText(line, 10, 30 + i * 30);
          });
        }
      }

      return canvas.toDataURL('image/png');

    } catch (err) {
      console.error('[Capture Error]', group.id, err);
      return null;
    } finally {
      if (wasSelected) el.classList.add('selected');
      handles.forEach(h => h.style.display = '');
    }
  }

  console.log('[Export Patch] Loaded - Canvas-based PNG export ready');
})();
