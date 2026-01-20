const scenes = {
    upload: document.getElementById('scene-upload'),
    'upload-unpack': document.getElementById('scene-upload-unpack'),
    preview: document.getElementById('scene-preview'),
    processing: document.getElementById('scene-processing'),
    completed: document.getElementById('scene-completed'),
    error: document.getElementById('scene-error')
};

export function showScene(sceneName) {
    Object.values(scenes).forEach(el => el?.classList.add('hidden'));
    scenes[sceneName]?.classList.remove('hidden');
}

export function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', percent);
    document.getElementById('statusMessage').innerText = message;
}

export function showError(msg) {
    document.getElementById('errorMessage').innerText = msg;
    showScene('error');
}

export function updateResultUI(fileName, count, sizeInBytes, url) {
    document.getElementById('resultFileName').innerText = fileName;
    document.getElementById('resultFileCount').innerText = `${count}`;
    document.getElementById('resultTotalSize').innerText = `${(sizeInBytes / 1024).toFixed(1)} KB`;

    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = url;
    downloadBtn.download = fileName;
}

export function updatePreviewUI(stats) {
    document.getElementById('previewName').innerText = stats.name || 'archive';
    document.getElementById('previewFileCount').innerText = stats.fileCount || 0;
    document.getElementById('previewFolderCount').innerText = stats.folderCount || 0;
    document.getElementById('previewSize').innerText = formatSize(stats.totalSize || 0);
    document.getElementById('previewTokens').innerText = `~${(stats.estimatedTokens || 0).toLocaleString()}`;

    // Build excluded text
    const excludedParts = [];
    if (stats.excludedDirs && stats.excludedDirs.length > 0) {
        excludedParts.push(stats.excludedDirs.slice(0, 3).join(', '));
    }
    if (stats.excludedBinaryCount > 0) {
        excludedParts.push(`${stats.excludedBinaryCount} бинарных`);
    }
    document.getElementById('previewExcludedText').innerText = excludedParts.join(', ') || '—';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function toggleDragActive(isActive) {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    // Functional active toggle with Dark Mode support
    if (isActive) {
        dropZone.classList.add('border-[#FF6B00]', 'bg-[#FFF8F2]', 'dark:bg-[#FF6B00]/20', 'scale-[1.02]');
        dropZone.classList.remove('border-[#D6D3C9]', 'dark:border-[#444]');
    } else {
        dropZone.classList.remove('border-[#FF6B00]', 'bg-[#FFF8F2]', 'dark:bg-[#FF6B00]/20', 'scale-[1.02]');
        dropZone.classList.add('border-[#D6D3C9]', 'dark:border-[#444]');
    }
}
