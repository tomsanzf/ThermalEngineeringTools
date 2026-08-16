import subprocess
import os
import sys

def main():
    # Path to the build script in the agent's scratch folder
    build_script = r"C:\Users\tsanz\.gemini\antigravity\brain\d1397ce2-496b-4d80-817c-143f5e2be0dc\scratch\build_and_copy_dist.py"
    
    print(f"Running build compiler: {build_script}...")
    result = subprocess.run([sys.executable, build_script], text=True)
    if result.returncode == 0:
        print("\nSUCCESS: Diagram recompiled and updated in Google Drive dist/ folder!")
    else:
        print("\nERROR: Compilation failed. Make sure you don't have open syntax errors in your CSV.")
        sys.exit(result.returncode)

if __name__ == '__main__':
    main()
