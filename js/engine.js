import { isTextFile, shouldIgnore, generateTreeString, createChunks } from './utils.js?v=13';
import { IGNORE_DIRS, MAX_FILES, MAX_SIZE_BYTES, MAX_SINGLE_FILE_BYTES } from './config.js';

export class RepoPackerEngine {
    constructor() {
        // Potential config storage
    }

    /**
     * Analyzes a list of files (from File API or Zip)
     * @param {Array<File|Object>} files - List of file objects
     * @param {string} repoName - Name of the repository/folder
     * @param {boolean} isFolder - Whether the source was a directory upload
     * @param {Function} onProgress - Callback (percent, message)
     * @returns {Promise<Object>} - Analysis result
     */
    async analyzeFiles(files, repoName, isFolder, onProgress) {
        onProgress(10, 'Анализ файлов...');

        const processedFiles = [];
        const paths = [];
        const folders = new Set();
        let totalSize = 0;
        let excludedBinaryCount = 0;
        const excludedDirsFound = new Set();

        const totalCount = files.length;
        let idx = 0;

        for (const file of files) {
            idx++;
            if (idx % 20 === 0) {
                onProgress(10 + Math.floor((idx / totalCount) * 70), `Анализ: ${idx}/${totalCount}`);
                // Yield to main thread
                await new Promise(r => setTimeout(r, 0));
            }

            const filePath = isFolder ? file.webkitRelativePath : file.path;
            if (!filePath) continue;

            // Check ignored dirs
            const parts = filePath.split('/');
            let ignored = false;
            for (const part of parts.slice(0, -1)) {
                folders.add(part);
                if (IGNORE_DIRS.has(part)) {
                    excludedDirsFound.add(part);
                    ignored = true;
                    break;
                }
            }
            if (ignored || shouldIgnore(filePath)) continue;

            paths.push(filePath);

            if (isTextFile(filePath)) {
                let content;
                if (isFolder) {
                    content = await file.text();
                } else {
                    // Virtual file from Zip
                    content = await file.getContent();
                }

                // Check single file size limit
                if (content.length > MAX_SINGLE_FILE_BYTES) {
                    console.warn(`Skipping large file (>${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB): ${filePath}`);
                    continue;
                }

                totalSize += content.length;
                processedFiles.push({ path: filePath, content });
            } else {
                excludedBinaryCount++;
            }
        }

        // Check global limits
        if (processedFiles.length > MAX_FILES) {
            throw new Error(`Превышен лимит: ${processedFiles.length} файлов (макс ${MAX_FILES})`);
        }
        if (totalSize > MAX_SIZE_BYTES) {
            throw new Error(`Превышен размер: ${(totalSize / 1024 / 1024).toFixed(1)} MB (макс 50 MB)`);
        }

        const estimatedTokens = Math.ceil(totalSize / 4);

        return {
            name: repoName,
            paths,
            processedFiles,
            stats: {
                name: repoName,
                fileCount: processedFiles.length,
                folderCount: folders.size,
                totalSize,
                estimatedTokens,
                excludedDirs: [...excludedDirsFound],
                excludedBinaryCount
            }
        };
    }

    /**
     * Generates Markdown chunks and optionally a ZIP
     * @param {Object} data - Analysis result (from analyzeFiles)
     * @param {number} tokenLimit - Token limit per file
     * @param {string} promptPrefix - Prompt template content
     * @param {Function} onProgress - Callback (percent, message)
     * @returns {Promise<Object>} - { chunks, resultUrl, resultName, isZip }
     */
    async pack(data, tokenLimit, promptPrefix, onProgress) {
        onProgress(90, 'Генерация Markdown...');

        const { name, paths, processedFiles } = data;
        const tree = generateTreeString(paths);

        const chunks = createChunks(name, tree, processedFiles, tokenLimit, promptPrefix);

        // Wait for next tick to update UI
        await new Promise(r => setTimeout(r, 0));

        let resultName;
        let isZip = false;
        let blob;

        if (chunks.length === 1) {
            blob = new Blob([chunks[0].content], { type: 'text/markdown' });
            resultName = chunks[0].name;
        } else {
            isZip = true;
            const outZip = new JSZip();
            chunks.forEach(chunk => outZip.file(chunk.name, chunk.content));
            blob = await outZip.generateAsync({ type: 'blob' });
            resultName = `${name}_parts.zip`;
        }

        const resultUrl = URL.createObjectURL(blob);

        return {
            chunks,
            resultUrl,
            resultName,
            isZip
        };
    }
}
