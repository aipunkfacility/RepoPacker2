import { BINARY_EXTENSIONS, IGNORE_DIRS, IGNORE_FILES, CHARS_PER_TOKEN, HEADER_OVERHEAD_CHARS } from './config.js';

// Escape HTML special characters to prevent XSS
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Unified Drag & Drop setup
export function setupDropZone(element, onDrop) {
    if (!element) return;

    element.addEventListener('dragover', e => {
        e.preventDefault();
        element.classList.add('drag-active');
    });

    element.addEventListener('dragleave', e => {
        e.preventDefault();
        element.classList.remove('drag-active');
    });

    element.addEventListener('drop', e => {
        e.preventDefault();
        element.classList.remove('drag-active');
        onDrop(e);
    });
}

export function isTextFile(filename) {
    const parts = filename.split('.');
    // Files without extension (e.g., Dockerfile, LICENSE) are considered text by default
    if (parts.length === 1) return true;

    const ext = parts.pop()?.toLowerCase();
    return !BINARY_EXTENSIONS.has(ext);
}

export function shouldIgnore(path) {
    const parts = path.split('/');
    for (const part of parts) {
        if (IGNORE_DIRS.has(part)) return true;
    }
    const filename = parts[parts.length - 1];
    if (IGNORE_FILES.has(filename)) return true;

    // Игнор медиа и бинарников (дублирует логику isTextFile частично, но здесь для раннего отсева, если нужно)
    // В новой логике мы полагаемся на isTextFile для контента, а здесь только структурный игнор
    return false;
}

// Helper to create safe anchor IDs
function sanitizeAnchor(path) {
    return path.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
}

export function generateTreeString(paths) {
    const tree = {};

    // Build the tree structure from paths
    paths.forEach(path => {
        const parts = path.split('/');
        let current = tree;

        parts.forEach((part, index) => {
            if (!current[part]) {
                // Directories are objects, files are null
                current[part] = index === parts.length - 1 ? null : {};
            }
            if (current[part] !== null) {
                current = current[part];
            }
        });
    });

    let output = '';

    function traverse(node, depth = 0, currentPath = '') {
        // Sort: directories first, then files
        const keys = Object.keys(node).sort((a, b) => {
            const aIsFile = node[a] === null;
            const bIsFile = node[b] === null;
            if (aIsFile === bIsFile) return a.localeCompare(b);
            return aIsFile ? 1 : -1;
        });

        keys.forEach(key => {
            const isDir = node[key] !== null;
            const indent = '  '.repeat(depth);
            // Reconstruct full path for the anchor
            const fullPath = currentPath ? `${currentPath}/${key}` : key;

            if (isDir) {
                output += `${indent}- ${key}/\n`;
                traverse(node[key], depth + 1, fullPath);
            } else {
                // Add Markdown link to the file
                const anchorId = sanitizeAnchor(fullPath);
                output += `${indent}- [${key}](#${anchorId})\n`;
            }
        });
    }

    traverse(tree);
    return output;
}

export function createChunks(repoName, tree, files, tokenLimit = 0, promptPrefix = '') {
    const charLimit = tokenLimit > 0 ? tokenLimit * CHARS_PER_TOKEN : Number.MAX_SAFE_INTEGER;

    // Header overhead
    const getBaseHeader = (partIndex, totalParts) => {
        let h = `# Context for LLM: ${repoName}\n\n`;
        h += `I am providing you with file contents in a single file located below.\n`;
        if (totalParts > 1) {
            h += `(This is part ${partIndex} of ${totalParts})\n`;
        }
        h += `The folder structure is outlined first, followed by the file contents.\n`;
        h += `\n## 📂 Folder Structure\n\n${tree}\n\n`;
        h += `## 📄 File Contents\n\n`;
        return h;
    };

    const fileBlocks = files.map(f => {
        const anchorId = sanitizeAnchor(f.path);
        let b = `### ${escapeHtml(f.path)} <a id="${anchorId}"></a>\n`;
        b += `<file_content path="${f.path}">\n`;
        b += f.content;
        if (!f.content.endsWith('\n')) b += '\n';
        b += `</file_content>\n\n`;
        return b;
    });

    const chunks = [];
    const treeSize = tree.length + HEADER_OVERHEAD_CHARS;

    // We need to group files first
    let currentGroup = [];
    let currentGroupSize = treeSize;

    fileBlocks.forEach(block => {
        if (currentGroupSize + block.length > charLimit && currentGroup.length > 0) {
            chunks.push(currentGroup);
            currentGroup = [];
            currentGroupSize = treeSize;
        }
        currentGroup.push(block);
        currentGroupSize += block.length;
    });
    if (currentGroup.length > 0) chunks.push(currentGroup);

    // If no files, still return at least one chunk (empty repo?)
    if (chunks.length === 0) {
        chunks.push([]);
    }

    // Second pass: Create content with correct headers
    return chunks.map((group, i) => {
        const header = getBaseHeader(i + 1, chunks.length);
        return {
            name: tokenLimit > 0 ? `${repoName}_part_${i + 1}.md` : `${repoName}_context.md`,
            content: promptPrefix + header + group.join('')
        };
    });
}

/**
 * Parse a packed Markdown file back into individual files.
 * Expects <file_content path="...">...</file_content> tags.
 * @param {string} mdContent - The markdown content to parse
 * @returns {Array<{path: string, content: string}>} - Array of file objects
 */
export function parseMarkdownToFiles(mdContent) {
    const files = [];

    // Regex to match <file_content path="...">...</file_content>
    const regex = /<file_content\s+path="([^"]+)">\n?([\s\S]*?)<\/file_content>/g;

    let match;
    while ((match = regex.exec(mdContent)) !== null) {
        const path = match[1];
        let content = match[2];

        // Remove trailing newline if present (we added it during packing)
        if (content.endsWith('\n')) {
            content = content.slice(0, -1);
        }

        files.push({ path, content });
    }

    return files;
}
