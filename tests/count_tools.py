import sys
import os
sys.path.insert(0, os.path.abspath("."))

import re
from agent.registry import TOOLS, load_all

load_all()

server_tool_file = 'server_tools_routing.ts' if os.path.exists('server_tools_routing.ts') else 'server.ts'
with open(server_tool_file, 'r', encoding='utf-8') as f:
    text = f.read()

gemini_tools = sorted(list(set(re.findall(r'name:\s*"([^"]+)"', text))))
py_tools = sorted(list(TOOLS.keys()))

print(f"Gemini Live Function Declarations in {server_tool_file}: {len(gemini_tools)}")
print(f"Python Desktop Control Agent Tools: {len(py_tools)}")
total_unique = sorted(list(set(gemini_tools).union(set(py_tools))))
print(f"Total Unique Tools in Ecosystem: {len(total_unique)}")
print("\nUnique Ecosystem Tools:")
for i, name in enumerate(total_unique, 1):
    in_gemini = "[Gemini]" if name in gemini_tools else "        "
    in_py = "[Python]" if name in py_tools else "        "
    print(f"{i:3d}. {name:<35} {in_gemini} {in_py}")
