import { BINARY_EXTENSIONS, IGNORE_DIRS, IGNORE_FILES } from './config.js';

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

export function createChunks(repoName, tree, files, tokenLimit = 0) {
    // 1 token ~= 4 chars
    const charLimit = tokenLimit > 0 ? tokenLimit * 4 : Number.MAX_SAFE_INTEGER;

    // Header overhead
    const getBaseHeader = (partIndex, totalParts) => {
        let h = `# Context for LLM: ${repoName}\n\n`;
        h += `I am providing you with a codebase in a single file located below.\n`;
        if (tokenLimit > 0) {
            h += `(This is part ${partIndex} of a larger codebase)\n`;
        }
        h += `The project structure is outlined first, followed by the file contents.\n`;
        h += `\n## 📂 Project Structure\n\n${tree}\n\n`;
        h += `## 💻 File Contents\n\n`;
        return h;
    };

    const fileBlocks = files.map(f => {
        const anchorId = sanitizeAnchor(f.path);
        let b = `### ${f.path} <a id="${anchorId}"></a>\n`;
        b += `<file_content path="${f.path}">\n`;
        b += f.content;
        if (!f.content.endsWith('\n')) b += '\n';
        b += `</file_content>\n\n`;
        return b;
    });

    const chunks = [];
    const treeSize = tree.length + 500; // rough header overhead

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
            content: header + group.join('')
        };
    });
}
