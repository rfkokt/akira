import { FileJson, FileImage, TerminalSquare, Database, Settings, Folder, FolderOpen, FolderTree, FolderCog, FileCode2 } from 'lucide-react';

export const ReactIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="-11.5 -10.23174 23 20.46348" className={className}>
    <circle cx="0" cy="0" r="2.05" fill="currentColor"/>
    <g stroke="currentColor" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2"/>
      <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
      <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
    </g>
  </svg>
);



export const PythonIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.001 2.5A9.5 9.5 0 0 0 5.485 3.99L5.5 4v1h3.5v2.87l-1.02-.016h-4.3l-.004 2.85h3.407A2.08 2.08 0 0 0 9 8.65V7.47h6.05v3.132A3.016 3.016 0 0 1 12.022 13.6h-2.15v2.964h2.152A2.083 2.083 0 0 0 14 14.512v-1.18h-6.05V10.2H4.157c-.127 0-.256.095-.256.242V17c0 1.056.88 1.93 1.93 1.93h2.68V16.8h4.5a3.024 3.024 0 0 0 3.036-3.008v-3.136h2.796c.125 0 .257-.098.257-.245v-6.55c0-1.055-.88-1.928-1.93-1.928a6.3 6.3 0 0 0-5.169-1.428zm-3.666 4.31a.763.763 0 1 1 0 1.527.763.763 0 0 1 0-1.527zm7.332 7.7a.763.763 0 1 1 0 1.528.763.763 0 0 1 0-1.528z"/>
  </svg>
);

export const RustIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.972 2.25a.86.86 0 0 0-.294.043l-4.148 1.503a4.026 4.026 0 0 0-2.3 2.3l-1.503 4.147c-.201.547-.2 1.15-.044 1.706l1.503 4.148a4.025 4.025 0 0 0 2.301 2.3l4.147 1.503c.548.201 1.15.201 1.707.043l4.148-1.503a4.026 4.026 0 0 0 2.3-2.3l1.503-4.147c.201-.548.201-1.15.044-1.707L19.833 6.1a4.026 4.026 0 0 0-2.301-2.3l-4.147-1.503a.86.86 0 0 0-.58 0zm.045 4.32a5.419 5.419 0 0 1 5.42 5.421 5.419 5.419 0 0 1-5.421 5.42A5.419 5.419 0 0 1 6.596 11.99a5.419 5.419 0 0 1 5.42-5.42zm-1.85 2.115v6.611h1.761V13.88h1.234l1.393 1.417h2.096l-1.632-1.564c.732-.303 1.205-.989 1.205-1.86v-.025c0-1.171-.902-1.921-2.274-1.921H10.168zm1.761 1.5h1.168c.52 0 .842.235.842.592 0 .346-.322.569-.842.569h-1.168V10.185z"/>
  </svg>
);

export const HtmlIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3.195 24l1.72-19.34L20.805 4.66 19.085 24 12 21.99zm4.25-13.67l.157-1.745h9.724l-.155 1.745h-7.854l.115 1.25H16.89l-.49 5.51-4.4.195-3.844-.225-.26-2.915h1.74l.15 1.63L12 15.945l2.42-.085.22-2.38H7.205z"/>
  </svg>
);

export const CssIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3.195 24l1.72-19.34L20.805 4.66 19.085 24 12 21.99zm12.39-15.415H6.015l.155 1.745h7.854l-.115 1.25H6.444l.49 5.51 4.4.195 3.844-.225.26-2.915h-1.74l-.15 1.63L12 15.945l-2.42-.085-.22-2.38h7.455z"/>
  </svg>
);

export const NodeIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.025 8.441l-9.141-5.18h-1.768L1.975 8.441V15.56l9.14 5.179h1.769l9.141-5.18Zm-2.887.89-6.398-3.666V4.18L21.365 9.07v5.859l-8.625 4.887v-1.485l6.398-3.666Zm-16.276 0L11.455 5.665v1.484L5.057 10.814v2.37l6.398 3.665v1.485l-8.593-4.886ZM12.015 16.48l-5.632-3.18-.047-.046v-.094L12 9.946l5.703 3.193v.093Zm1.162-4.148-1.162.663-1.163-.663v-1.282l1.163-.664 1.162.664Z"/>
  </svg>
);

export const GitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.374-.07 1.889.441.516.515.658 1.258.438 1.9l2.738 2.739c.645-.216 1.375-.07 1.889.444.604.604.604 1.582 0 2.187-.604.604-1.582.604-2.187 0-.518-.517-.66-1.263-.44-1.91l-2.613-2.615v5.309c.219.043.435.151.62.336.604.604.604 1.582 0 2.187-.604.604-1.582.604-2.187 0-.41-.41-.54-1-.387-1.49l-2.28-2.28-5.3 5.3c-.604.604-1.582.604-2.188 0L.45 13.119c-.604-.603-.604-1.582 0-2.188l10.48-10.48c.604-.604 1.582-.604 2.188 0l10.43 10.482c.603.604.603 1.582 0 2.188zM6.98 9.387c-.604.603-1.582.603-2.188 0-.604-.604-.604-1.582 0-2.188.604-.603 1.582-.603 2.188 0 .546.545.642 1.353.284 1.968l2.302 2.302c.07-.06.145-.115.228-.163v-5.06c-.347-.23-.628-.616-.764-1.077l-2.45-2.45z"/>
  </svg>
);

export const NpmIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464V7.4h-3.472v11.778H5.13z"/>
  </svg>
);

export const MarkdownIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.7C0 12.48.52 13 1.15 13h13.7c.63 0 1.15-.52 1.15-1.15v-7.7C16 3.52 15.48 3 14.85 3zM9 11H7V5.9L5 8 3 5.9V11H1V5h2l2 2 2-2h2v6zm5.5-2.5L12 11V8h-1V5h2v3h1.5z"/>
  </svg>
);

// Map filenames to specific lucide icons if no exact brand icon exists
export const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  
  const iconClass = "w-[14px] h-[14px]";

  // Exact File Name Matches
  if (name === 'package.json') return <NpmIcon className={`${iconClass} text-[#CB3837]`} />;
  if (name === 'tsconfig.json') return <FileCode2 className={`${iconClass} text-[#3178c6]`} />;
  if (name === '.gitignore') return <GitIcon className={`${iconClass} text-[#f05032]`} />;

  // Extensions
  switch (ext) {
    case 'js':
    case 'cjs':
    case 'mjs':
      return <FileCode2 className={`${iconClass} text-[#f0e059]`} />
    case 'jsx':
      return <ReactIcon className={`${iconClass} text-[#61dafb]`} />
    case 'ts':
      return <FileCode2 className={`${iconClass} text-[#3178c6]`} />
    case 'tsx':
      return <ReactIcon className={`${iconClass} text-[#61dafb]`} />
    case 'json':
      return <FileJson className={`${iconClass} text-[#cbcd30]`} />
    case 'md':
    case 'markdown':
      return <MarkdownIcon className={`${iconClass} text-[#fff] opacity-80`} />
    case 'css':
    case 'scss':
    case 'postcss':
      return <CssIcon className={`${iconClass} text-[#42a5f5]`} />
    case 'html':
      return <HtmlIcon className={`${iconClass} text-[#e34c26]`} />
    case 'rs':
      return <RustIcon className={`${iconClass} text-[#dea584] opacity-90`} />
    case 'py':
      return <PythonIcon className={`${iconClass} text-[#3572A5]`} />
    case 'sh':
    case 'bash':
    case 'zsh':
      return <TerminalSquare className={`${iconClass} text-[#4caf50]`} />
    case 'ico':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
      return <FileImage className={`${iconClass} text-[#a074c4]`} />
    case 'db':
    case 'sqlite':
    case 'sql':
      return <Database className={`${iconClass} text-[#cfd8dc]`} />
    case 'env':
      return <Settings className={`${iconClass} text-[#fff] opacity-60`} />
    default:
      return <FileCode2 className={`${iconClass} text-neutral-500`} />
  }
};

export const getFolderIcon = (name: string, isOpen: boolean) => {
  const n = name.toLowerCase();
  let colorClass = "text-[#e8a317]"; // Default yellow/orange folder
  let IconPattern = isOpen ? FolderOpen : Folder;

  // Custom Colors & Shapes
  if (n === 'src' || n === 'app' || n === 'main' || n === 'core') {
    colorClass = "text-[#42a5f5]"; // Blue
  } else if (n === 'components' || n === 'ui' || n === 'views' || n === 'layouts') {
    colorClass = "text-[#a074c4]"; // Purple
  } else if (n === 'api' || n === 'server' || n === 'controllers' || n === 'routes') {
    colorClass = "text-[#4caf50]"; // Green
  } else if (n === 'public' || n === 'assets' || n === 'static' || n === 'images') {
    colorClass = "text-[#ffb74d]"; // Light Orange
  } else if (n === 'node_modules' || n === 'vendor') {
    colorClass = "text-[#81c784]"; // Light Green
    IconPattern = FolderTree;
  } else if (n === 'hooks' || n === 'utils' || n === 'lib' || n === 'helpers') {
    colorClass = "text-[#ba68c8]"; // Pink/Purple
    IconPattern = FolderCog;
  } else if (n === 'test' || n === 'tests' || n === '__tests__') {
    colorClass = "text-[#e57373]"; // Red
  } else if (n === '.github' || n === '.husky' || n === '.vscode') {
    colorClass = "text-neutral-500"; // Gray hidden folders
  }

  // Ensure it fills the inside mostly, to look like a solid folder if fill-current is applied
  return <IconPattern className={`w-[14px] h-[14px] fill-current opacity-80 ${colorClass}`} />;
};
