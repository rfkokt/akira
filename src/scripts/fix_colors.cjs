const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '../components/Kanban/Board.tsx'),
  path.join(__dirname, '../components/Kanban/TaskImporter.tsx'),
  path.join(__dirname, '../components/Kanban/TaskCreatorChat.tsx')
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Base backgrounds
  content = content.replace(/bg-\[#1e1e1e\]/g, 'bg-app-panel');
  content = content.replace(/bg-\[#252526\]/g, 'bg-app-panel');
  content = content.replace(/bg-\[#3c3c3c\]/g, 'bg-app-sidebar');
  content = content.replace(/bg-\[#0d0d0d\]/g, 'bg-app-bg');
  
  // Accents and Text
  content = content.replace(/bg-\[#0e639c\]/g, 'bg-app-accent');
  content = content.replace(/bg-\[#1177bb\]/g, 'bg-app-accent-hover');
  content = content.replace(/text-\[#0e639c\]/g, 'text-app-accent');
  content = content.replace(/hover:text-\[#1177bb\]/g, 'hover:text-app-accent-hover');
  content = content.replace(/text-\[#1177bb\]/g, 'hover:text-app-accent-hover'); 
  content = content.replace(/border-\[#0e639c\]/g, 'border-app-accent');
  content = content.replace(/ring-\[#0e639c\]/g, 'ring-app-accent');
  content = content.replace(/focus:ring-\[#0e639c\]/g, 'focus:ring-app-accent');
  content = content.replace(/focus:border-\[#0e639c\]/g, 'focus:border-app-accent');
  
  // Greens
  content = content.replace(/bg-\[#238636\]/g, 'bg-app-accent-alt');
  content = content.replace(/bg-\[#2ea043\]/g, 'bg-app-accent-alt');
  content = content.replace(/hover:bg-\[#2ea043\]/g, 'hover:bg-app-accent-alt\/80');

  // Any stray borders
  // Careful not to replace things indiscriminately, only exactly matching utilities
  content = content.replace(/border-white\/5/g, 'border-app-border');
  content = content.replace(/border-white\/10/g, 'border-app-border');
  content = content.replace(/border-white\/20/g, 'border-app-border-highlight');

  fs.writeFileSync(file, content);
  console.log('Fixed colors in', file);
});
