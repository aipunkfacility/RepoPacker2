export const BINARY_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'webp', 'avif', // Images
    'mp4', 'webm', 'ogg', 'mp3', 'wav', 'flac', 'aac', // Media
    'zip', 'tar', 'gz', '7z', 'rar', 'iso', 'dmg', // Archives
    'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', // Binaries
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', // Documents
    'eot', 'ttf', 'woff', 'woff2', // Fonts
    'pyc', 'class' // Compiled bytecode
]);

export const IGNORE_DIRS = new Set([
    '.git', 'node_modules', 'dist', 'build', 'coverage', '.idea', '.vscode', '__pycache__', 'venv', 'bin', 'obj'
]);

export const IGNORE_FILES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'thumbs.db'
]);
