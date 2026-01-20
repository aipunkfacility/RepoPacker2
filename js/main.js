import { parseMarkdownToFiles, setupDropZone } from './utils.js?v=13';
import { RepoPackerEngine } from './engine.js?v=13';
import { IGNORE_DIRS, MAX_FILES, MAX_SIZE_BYTES, MAX_SINGLE_FILE_BYTES, PROMPT_TEMPLATES, SCENES } from './config.js';
import * as UI from './ui.js?v=13';

let resultUrl = null;
let pendingData = null; // Stores analyzed data before packing
let currentMode = 'pack'; // 'pack' or 'unpack'
const engine = new RepoPackerEngine();

// Export PROMPT_TEMPLATES for UI
window.PROMPT_TEMPLATES = PROMPT_TEMPLATES;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const mdFileInput = document.getElementById('mdFileInput');
const dropZoneUnpack = document.getElementById('dropZoneUnpack');
const modePackBtn = document.getElementById('modePackBtn');
const modeUnpackBtn = document.getElementById('modeUnpackBtn');
const folderBtn = document.getElementById('folderBtn');

// Browser feature detection: disable folder button if not supported
if (folderInput && !('webkitdirectory' in folderInput)) {
    folderBtn?.setAttribute('disabled', 'true');
    folderBtn?.classList.add('opacity-50', 'cursor-not-allowed');
    folderBtn?.setAttribute('title', 'Выбор папок не поддерживается вашим браузером');
}

// Mode Toggle
modePackBtn?.addEventListener('click', () => setMode('pack'));
modeUnpackBtn?.addEventListener('click', () => setMode('unpack'));

function setMode(mode) {
    currentMode = mode;

    // Update button styles
    if (mode === 'pack') {
        modePackBtn?.classList.add('bg-white', 'dark:bg-[#1A1A1A]', 'text-[#2D2A26]', 'dark:text-white', 'shadow-sm');
        modePackBtn?.classList.remove('text-[#7D7870]', 'dark:text-[#888]');
        modeUnpackBtn?.classList.remove('bg-white', 'dark:bg-[#1A1A1A]', 'text-[#2D2A26]', 'dark:text-white', 'shadow-sm');
        modeUnpackBtn?.classList.add('text-[#7D7870]', 'dark:text-[#888]');
        UI.showScene(SCENES.UPLOAD);
    } else {
        modeUnpackBtn?.classList.add('bg-white', 'dark:bg-[#1A1A1A]', 'text-[#2D2A26]', 'dark:text-white', 'shadow-sm');
        modeUnpackBtn?.classList.remove('text-[#7D7870]', 'dark:text-[#888]');
        modePackBtn?.classList.remove('bg-white', 'dark:bg-[#1A1A1A]', 'text-[#2D2A26]', 'dark:text-white', 'shadow-sm');
        modePackBtn?.classList.add('text-[#7D7870]', 'dark:text-[#888]');
        UI.showScene(SCENES.UPLOAD_UNPACK);
    }
}

// Pack Mode: Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    dropZone?.addEventListener(eventName, () => UI.toggleDragActive(true), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone?.addEventListener(eventName, () => UI.toggleDragActive(false), false);
});

dropZone?.addEventListener('drop', (e) => handleZipFile(e.dataTransfer.files));
fileInput?.addEventListener('change', (e) => handleZipFile(e.target.files));
folderInput?.addEventListener('change', (e) => handleFolderFiles(e.target.files));

// Unpack Mode: MD File Input
mdFileInput?.addEventListener('change', (e) => handleMdFile(e.target.files));

// Unpack Mode: Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZoneUnpack?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});
dropZoneUnpack?.addEventListener('drop', (e) => handleMdFile(e.dataTransfer.files));

// Unpack Mode: Drag Active
['dragenter', 'dragover'].forEach(eventName => {
    dropZoneUnpack?.addEventListener(eventName, () => {
        dropZoneUnpack.classList.add('border-[#FF6B00]', 'bg-[#FFF8F2]', 'dark:bg-[#FF6B00]/20');
    });
});
['dragleave', 'drop'].forEach(eventName => {
    dropZoneUnpack?.addEventListener(eventName, () => {
        dropZoneUnpack.classList.remove('border-[#FF6B00]', 'bg-[#FFF8F2]', 'dark:bg-[#FF6B00]/20');
    });
});

// Buttons
document.getElementById('resetBtn')?.addEventListener('click', resetApp);
document.getElementById('retryBtn')?.addEventListener('click', resetApp);
document.getElementById('cancelPreviewBtn')?.addEventListener('click', resetApp);
document.getElementById('packBtn')?.addEventListener('click', packData);

function resetApp() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    pendingData = null;
    if (fileInput) fileInput.value = '';
    if (folderInput) folderInput.value = '';
    if (mdFileInput) mdFileInput.value = '';

    if (currentMode === 'pack') {
        UI.showScene(SCENES.UPLOAD);
    } else {
        UI.showScene(SCENES.UPLOAD_UNPACK);
    }
}

// --- UNPACK: MD FILE HANDLING ---
async function handleMdFile(files) {
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
        UI.showScene(SCENES.PROCESSING);
        UI.updateProgress(10, 'Читаем файл...');

        const mdContent = await file.text();

        UI.updateProgress(30, 'Парсим содержимое...');
        const extractedFiles = parseMarkdownToFiles(mdContent);

        if (extractedFiles.length === 0) {
            throw new Error('Не найдено файлов в формате <file_content>. Убедитесь, что файл упакован через RepoPacker.');
        }

        UI.updateProgress(60, 'Создаем ZIP архив...');

        // Create ZIP
        const zip = new JSZip();
        extractedFiles.forEach(f => {
            zip.file(f.path, f.content);
        });

        UI.updateProgress(90, 'Финализация...');

        const blob = await zip.generateAsync({ type: 'blob' });
        resultUrl = URL.createObjectURL(blob);

        // Calculate stats
        const totalSize = extractedFiles.reduce((acc, f) => acc + f.content.length, 0);

        const resultName = file.name.replace(/\.(md|txt|markdown)$/i, '') + '_unpacked.zip';

        UI.updateResultUI(resultName, extractedFiles.length, totalSize, resultUrl);

        // Hide copy button for unpack mode (it's a ZIP)
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) copyBtn.style.display = 'none';

        UI.showScene(SCENES.COMPLETED);

    } catch (error) {
        console.error(error);
        UI.showError("Ошибка распаковки: " + (error.message || 'Unknown'));
    }
}

// --- FOLDER HANDLING ---
async function handleFolderFiles(files) {
    if (!files || files.length === 0) return;

    try {
        // Extract folder name from first file path
        const firstPath = files[0].webkitRelativePath || files[0].name;
        const folderName = firstPath.split('/')[0] || 'folder';

        UI.showScene(SCENES.PROCESSING);
        const result = await engine.analyzeFiles(files, folderName, true, (p, msg) => UI.updateProgress(p, msg));
        showPreview(result);
    } catch (error) {
        console.error(error);
        UI.showError("Ошибка чтения папки: " + (error.message || 'Unknown'));
    }
}


// --- ZIP HANDLING ---
async function handleZipFile(files) {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.name.toLowerCase().endsWith('.zip')) {
        UI.showError("Пожалуйста, выберите .zip архив");
        return;
    }

    try {
        UI.showScene(SCENES.PROCESSING);
        UI.updateProgress(5, 'Чтение архива...');

        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        const fileEntries = Object.keys(loadedZip.files);
        const virtualFiles = [];

        for (const filename of fileEntries) {
            const zipEntry = loadedZip.files[filename];
            if (zipEntry.dir) continue;

            virtualFiles.push({
                path: filename,
                getContent: () => zipEntry.async('string')
            });
        }

        const repoName = file.name.replace(/\.zip$/i, '');

        // Note: isFolder=false for Zip virtual files
        const result = await engine.analyzeFiles(virtualFiles, repoName, false, (p, msg) => UI.updateProgress(p, msg));
        showPreview(result);
    } catch (error) {
        console.error(error);
        UI.showError("Ошибка чтения: " + (error.message || 'Unknown'));
    }
}

// --- ANALYSIS ---
// Logic moved to RepoPackerEngine

// --- PREVIEW ---
function showPreview(data) {
    pendingData = data;
    UI.updatePreviewUI(data.stats);
    UI.showScene(SCENES.PREVIEW);
}

// --- PACK ---

let currentChunks = null;

// --- PACK ---
async function packData() {
    if (!pendingData) return;

    UI.showScene(SCENES.PROCESSING);

    const limitSelect = document.getElementById('tokenLimitSelect');
    const tokenLimit = parseInt(limitSelect?.value || '0', 10);

    // Get selected prompt template
    const templateSelect = document.getElementById('promptTemplateSelect');
    const templateId = templateSelect?.value || 'none';
    const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
    const promptPrefix = template?.prompt
        ? `## 🎯 Задача\n\n${template.prompt}\n\n---\n\n`
        : '';

    // Use Engine to pack
    const result = await engine.pack(pendingData, tokenLimit, promptPrefix, (p, msg) => UI.updateProgress(p, msg));

    currentChunks = result.chunks; // Store for copying
    resultUrl = result.resultUrl;

    UI.updateResultUI(result.resultName, pendingData.processedFiles.length, pendingData.stats.totalSize, result.resultUrl);

    // Enable/Disable copy button based on zip status
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        if (result.isZip) {
            copyBtn.style.display = 'none';
        } else {
            copyBtn.style.display = 'block';
            copyBtn.onclick = async () => {
                await copyToClipboard(result.chunks[0].content);
            };
        }
    }

    UI.showScene(SCENES.COMPLETED);
    pendingData = null;
}

async function copyToClipboard(text) {
    const copyBtn = document.getElementById('copyBtn');
    const originalText = copyBtn.innerText;

    try {
        await navigator.clipboard.writeText(text);

        // Show success feedback
        copyBtn.innerHTML = '<span class="text-[#0FAF6B]">Скопировано!</span>';
        copyBtn.classList.add('border-[#0FAF6B]');

        setTimeout(() => {
            copyBtn.innerText = originalText;
            copyBtn.classList.remove('border-[#0FAF6B]');
        }, 2000);

    } catch (err) {
        console.error('Failed to copy:', err);
        UI.showError("Не удалось скопировать в буфер обмена");
    }
}
