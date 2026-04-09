import os

filepath = '/Volumes/External M4/Project/ars-ai/akira/src/components/Kanban/TaskCard.tsx'
with open(filepath, 'r') as f:
    content = f.read()

start_marker = '<div className="flex items-center gap-1.5">'
end_marker = '</Button>\n            </>\n          )}\n        </div>'
insertion_point = '        </p>\n      )}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx != -1 and end_idx != -1:
    buttons_html = content[start_idx:end_idx]
    
    # Remove buttons from header
    new_content = content[:start_idx] + content[end_idx:]
    
    # Add buttons to bottom, inside a flex container to align them to the right
    wrapped_buttons_html = '        </p>\n      )}\n\n      <div className="mt-4 flex items-center justify-end border-t border-app-border/30 pt-3">\n        ' + buttons_html + '\n      </div>'
      
    new_content = new_content.replace(insertion_point, wrapped_buttons_html)
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    print("Successfully moved buttons")
else:
    print("Could not find delimiters")
